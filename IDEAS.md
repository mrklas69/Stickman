# IDEAS — Stickman

Raw nápady, které ještě nejsou připravené k realizaci. Jakmile dozrají, posunout do `TODO.md` se značkou `→ TODO`.

## Snap algoritmus — surface-aligned snap *(Sezení 4)*

Aktuální snap: lineární `min Y joint → floor` + translate. Ignoruje fakt, že pose může mít několik contact bodů na různých Y (= tělo nakloněné, jeden bod doráží na podlahu, ostatní visí nad).

**Idea:** najít rovinu procházející hlavními contact body a pose se na ni „položí" (= translation + rotation tak, aby tato rovina = floor plane).

### Subvarianty

- **(a) Tripod (= 3 nejnižší)**: vyber 3 body s nejmenším Y, vyrob trojúhelník, rotuj pose aby normála trojúhelníka = +Y. ✗ Edge case: stand pose (3. nejnižší = koleno, pose by se naklonila dopředu). Ne univerzální.
- **(b) Surface fit přes všechny contact body**: aproximuj rovinu přes všechny joints s Y blízko nejnižšího (= dynamic contact body z `getSupportPoints`). Pak rotuj pose tak, aby tato rovina = floor.
- **(c) Per-pose flag `autoLevel: true/false`**: opt-in pro user-authored pose, off pro library presety s explicitní `rootRotation`.

### Otevřené

- Konflikt s explicitní `rootRotation` v pose (např. layBack má `rotationX = 90°` záměrně)
- Edge cases: 3 body kolineární, 4+ bodů ne v rovině (= ill-posed plane fit)
- Computational cost při transition (= rotace přepočítaná každý frame při lerp)

### Status

Odložené. Aktuální algoritmus + manuální `rootRotation` v pose stačí. Posun do TODO až bude konkrétní use case (např. user-authored pose v Inspectoru, kde modelář nechce ručně počítat rotaci).

→ kandidát: po F2 nebo F3, pokud uživatelské pose authoring bude časté.

## Foot-on-floor IK *(Sezení 4)*

Když pose má pokrčená kolena ale ankle by měl být na podlaze, manuální výpočet `hip.x + knee.x + hip.z` je tricky (geometrie složitá). 1-shot IK by mohl: zafixovat ankle world Y na floor, vypočítat hip + knee úhly, zachovat ostatní pose.

`solveTwoBoneIK` v `src/model/IK.js` už řeší 2-bone IK pro paže/nohy. Mohl by být volaný z Inspector tlačítkem „Spustit nohy na podlahu" — pro každou nohu udělá IK target = floor pod hipem.

### Status

Možná užitečné pro user-authored lehové pose. Posunout do TODO pokud se bude opakovaně řešit.

## Pose authoring v UI místo JSON

Aktuálně user vyrobí pose v Inspectoru přes slidery → Copy JSON → AI / manuální vložení do `library/Poses.js`. Plně UI cesta:

- Tlačítko „Save as preset" v Inspectoru → modal s názvem → uloží do localStorage / soubor
- Sekce „Custom" v levém panelu (mimo LEHY/Ostatní) — uživatelské uložené pose

### Status

Rozumné rozšíření. Posunout do TODO až bude pose library větší (= user chce vlastní organizaci).

## ~~Drift — procedural idle motion (budget-based random walk)~~ → DONE *(Sezení 7 spec → Sezení 8 implementace)*

**HOTOVO** v Sezení 8 jako idle režim `animateStand` přes `params.idle = true`. Sekce zachována jako reference spec (3-fázový algoritmus, parametry, edge cases, zamítnuté alternativy) — užitečné pro budoucí varianty Driftu (rytmický Dance preset, Bio/Fyzio episodické akce). Hotová implementace shrnuta v `DONE.md` (Sezení 8) a v sekci „Drift" v `GLOSSARY.md`.

Postava ve stoji se neustále mírně hýbe k náhodným cílům — herní standard pro „postava-žije". Liší se od Inspector Random tlačítka tím, že nesází na celý DOF range najednou (Inspector full random + quint ease-out už zachytí 60 % efektu).

### Algoritmus (3 fáze)

1. **Generuj cílovou pózu.** Plně uniform random v limitech každé osy (jak to dělá `applyRandom` v Inspectoru). Volitelně: target = nějaký „referenční idle pose" + random offset.
2. **Distribuuj budget.**
   - Sestav vektor všech `N` aktivních os (22 DOF + 3 rootRot = 25; rootPos vynechat — snap se postará).
   - Normalizuj rozsah každé osy na 100 bodů: `pool = N × 100 = 2500 bodů`.
   - `budget = FRACTION × pool` (parametr, default `FRACTION = 0.25` → 625 bodů).
   - Iteruj: `pick random axis i` → `consume = min(STEP, |delta_i|, budget)` → posuň `intermediate[i]` o `consume × sign(delta_i)` směrem k targetu → `budget -= consume`.
   - Když `budget <= 0` nebo všechny `delta_i == 0`, stop.
3. **Animace paralelně.** Spustit `Pose.lerp(current, intermediate)` přes `transitionDuration` (např. 0.8 s) s **expo nebo quint ease-out** (max zrychlení na začátek, velmi pomalý dojezd). Po dokončení znovu fáze 1 → kontinuální drift.

### Parametry

| Parametr | Default | Účel |
|---|---|---|
| `FRACTION` | 0.25 | Kolik z totalRange se spotřebuje per cyklus (= „intenzita driftu") |
| `STEP` | 5 bodů | Granulárnost rozdělování budget mezi osami |
| `transitionDuration` | 0.8 s | Doba paralelní animace |
| `easing` | quint nebo expo | Tvar dojezdu |
| `targetRefreshOnArrive` | true | Po dokončení transition vyber nový target |
| `rootRotationFraction` | 0.10 | Volitelně: rootRotation s vlastním nižším podílem (lever celého modelu) |

### Edge cases

- **Limity per osa** — algoritmus interpoluje mezi current (v limits) a target (v limits), tedy intermediate je vždy v limits. Safe.
- **Delta = 0 na vybrané ose** — skip a pick znovu. Pokud `aktivní_osy = 0` (postava už v targetu), break loop.
- **rootRotation s rangem 360°** — pokud do budget zahrne, bude pootočení dramatické. Buď vyloučit z poolu, nebo dát vlastní `rootRotationFraction`.
- **Target může být daleko** — `delta_i = 80 bodů`, ale `consume = STEP = 5` → 16 iterací jen na jednu osu. Chování OK, jen jemnější.

### Místo v architektuře

- **Patří do** `src/character/Animations.js` jako nová animace pro `Status.STAND` (idle varianta), nebo jako parametr stávající `animateStand` (= `params.idle = true`).
- **Nezávislá** na konkrétním demu — Stickman wrapper ji volá jako každou jinou animaci přes `animate(dt)`.
- Volitelně: druhé tlačítko v Inspectoru "Drift" jako preview F2 idle, ale až po implementaci ve F2.

### Alternativy zvážené (a zamítnuté)

| Varianta | Proč zamítnutá |
|---|---|
| **A: Subset (třetina sliderů)** | Jen omezí počet hýbajících se kloubů, neztiší skoky → ne plynulé. |
| **B: Pure delty (±10 % per osa, bez targetu)** | Brownian noise bez intent — postava „třese se", nevypadá živě. |
| **D: Drift (budget toward target)** ✅ | Konvergence k targetu = ladný „intent"; budget kontroluje rozsah. Herní standard pro idle. |

### Status

**→ DONE (Sezení 8) → REWRITTEN (Sezení 9):** Drift v `animateStand` přes `params.idle = true`. Sezení 8 zavedlo budget-based random walk (point-by-point, step=5). Sezení 9 algoritmus zjednodušilo na **lerp toward random P2**: per cyklus se vygeneruje plně random pose P2, realizuje se `fraction × (P2 - P1)`. Žádné per-axis budget, žádné zamykání. Vizuálně přirozenější — pohyb celé postavy organizovaně, ne fragmentované skoky jednotlivých kloubů. Parametr `fraction` = jemnost driftu (default 0.25 = „čtvrtinový vektor"). `step` parametr odstraněn (obsoletní). Quint ease-out per cyklus zachován.

## ~~Bio/Fyzio — episodické mikroanimace~~ → DONE *(Sezení 8 spec → Sezení 10 implementace)*

**HOTOVO** v Sezení 10 jako globální overlay v `src/character/Gestures.js` s Poisson schedulerem. Architekturální reframe oproti Sezení 8 spec: **NE state machine** s explicit timer, ale globální overlay (sourozenec Fidget/Breathing) s exp inter-arrival pro spuštění. 7 gest implementovaných: armsAkimbo, armsFolded, armsBehindHead, scratchHead, stretch (V-tvar), weightShiftLeft, weightShiftRight. Pose-based keyframes s root deltou (= aditivně k primárce, gesto přidá tilt/posun bez konfliktu s Drift). Trigger jen když isResting (STAND idle / SIT). Sekce zachována jako reference spec — užitečná pro budoucí gesta a varianty (např. SIT-specific gesta jako zkřížit nohy / zamyšlení). Hotová implementace shrnuta v `DONE.md` (Sezení 10) a v sekci „Gestures" v `GLOSSARY.md`.

### Origin spec (Sezení 8 — pre-implementace)

Když postava stojí v idle (Drift / Stand), občas (každých N sekund) se „zachová lidsky" — podrbe, prohrábne si vlasy, založí ruce, přešlápne na druhou nohu. Liší se od Drift tím, že:

- **Drift** = kontinuální drobné nahodilé pohyby
- **Bio/Fyzio** = diskrétní akce s identitou (= rozpoznatelné gesto), 1–3 sekundy

### Architektura

State machine NAD STAND idle:

1. **Random timer:** každých `T` sekund (např. 5–15 s, uniform random) trigger
2. **Action picker:** vybere náhodnou akci z registrované sady
3. **Spuštění akce:** Stickman přepne dočasně na `Status.IDLE_ACTION` (nebo přímo modifikuje aktuální idle), aplikuje pose-cyklickou mikroanimaci 1–3 s
4. **Návrat:** po dokončení akce zpět do Drift (nebo původního idle režimu)

### Akce — minimální sada (3 pro draft)

| Akce | Popis | Trvání | Klouby |
|---|---|---|---|
| `scratchHead` | ruka jde k hlavě, krátké pohybování dlaní (drbání) | 2 s | shoulderR + elbowR (do ~150°) + neck.x |
| `foldArms` | obě ruce přes hrudník, pohyb 1.5 s, drží 1 s, pohyb zpět | 3 s | shoulderL/R.x ~70 + elbowL/R.x ~120 |
| `weightShift` | přenos váhy z levé na pravou nohu (= „fidget shuffle") | 1.5 s | hipL/R.x + kneeL/R.x antifázově |

### Implementace — možné přístupy

| Varianta | Plus | Minus |
|---|---|---|
| **(a) Pose-based:** každá akce = sekvence pose snapshotů, Pose.lerp mezi nimi | KISS, lze authorovat v Inspectoru | Hodně pose objektů (3 akce × 3-5 keyframes) |
| **(b) Procedurální:** každá akce = funkce `(time, params)` jako WALK | Méně dat | Víc ad-hoc kódu, hůř laditelné |
| **(c) Hybrid:** keyframes s lerp mezi nimi (jako After Effects) | Best of both | Vyžaduje keyframe scheduler |

Doporučení: **(a) Pose-based** — využije existující `Pose.lerp` infrastrukturu, akce se dají authorovat v Inspectoru pomocí Copy JSON workflow (memory `feedback_pose_authoring_workflow`).

### Otevřené otázky

- Spustit Bio/Fyzio jen ve STAND idle, nebo i ve WALK / SIT (= hybrid s primary animací)?
- Triggery: čistě timer, nebo eventovat (= postava reaguje na něco — kdo se přiblíží, slyšení zvuku)?
- Statemachine = třída `Brain` (plánovaná pro F3 akvárium) nebo nezávislá?

### Status

**→ DONE (Sezení 10)** přes overlay + Poisson scheduler v `Gestures.js`.

## Demo03 — Pose linking *(Sezení 10 plán)*

**Fundament pro budoucí Demo04, F3 Akvárium, F4 specializace** (sbírání, těžba, boj, crafting). Pose-link je atom všeho.

### Algoritmus

P1 (current pose) → P2 (target pose). Distance metric = `distXZ(P1.rootPosition, P2.rootPosition)`. Locomotion picker:

- `d < 0.5 j` → přímý `Pose.lerp` (= existující 0.4 s blend, KISS)
- `0.5 ≤ d < 5 j` → WALK
- `5 ≤ d < 15 j` → RUN (jog)
- `d ≥ 15 j` → SPRINT
- skok přes překážku → JUMP (Demo04+ s detekcí)

Plus turn-to phase: pokud `P2.position` je za zády postavy, otoč se nejdřív (změň `rootRotation.y` postupně).

### Architektura

Třída `PoseSequence` v `src/character/`:
```js
class PoseSequence {
    constructor(stickman) { this.stages = []; this.idx = 0; }
    addStage({ status, params, until }) { ... }
    run(dt) { ... }
}
PoseSequence.linkTo(stickman, P2) // factory s distance picker
```

`stickman.executeSequence(seq)` jako high-level API; existující `setStatus(s, p)` zůstává low-level. Brain v F3 vyrábí sekvence, executor je společný.

### Demo

3 named pose anchors v scéně (markery) + tlačítka „Pojď k A/B/C" + „Pose: lay/sit/stand". Click → postava walk/sprint k anchoru, pak transition do target pose.

### Status

→ TODO po dokončení F2.4 plížení polish a SWIM/CLIMB/SLEEP statusů.

## Demo04 — Interakce s objekty *(Sezení 10 plán)*

Interakce = `PoseSequence` s pinem na world objekt.

### Architektura

Nová vrstva `src/world/` (sourozenec character/, scene/). Třída `Interactable`:

```js
{
    position: { x, y, z },
    approachPose: Pose,           // kam si postava stoupne
    usePose: Pose,                // co dělá při interakci
    cycleAnimation?: fn,          // volitelné pro repetitivní motion (pila, tlučení)
    pinPoints?: { hand: { x,y,z } } // IK targety (klika, madlo)
}
```

Click na objekt → `stickman.executeSequence(PoseSequence.interactWith(obj))`:
1. linkTo(obj.approachPose) — = Demo03 logika
2. transition do obj.usePose s IK pinem (pokud pinPoint)
3. hold (do dalšího kliku nebo timeout)
4. exit — opačně

### Příklady prototypů

| Akce | Skladba |
|---|---|
| Sednout na židli | linkTo(přístup) → otoč se → lay-back-into-sit |
| Lehnout do postele | linkTo(strana postele) → sednout → swing legs → lehnout |
| Stisknout kliku | linkTo(přístup) → reach IK na kliku → use |
| Sebrat věc | linkTo(věc.position) → bend down → grab IK → stand → carry pose |

### Risks

- **Orientace:** WALK jde -Z (postavova kupředu). Před WALKem = otočit pelvis přes `rootRotation.y`. Bez toho postava chodí pozpátku.
- **Pose unreachable:** P2 = laydown na posteli — nelze WALKem doprostřed cesty. → vyžaduje **approachPose** ≠ usePose.
- **Mid-sequence interrupt:** user klikne nový cíl. Plan abort, nový PoseSequence; current stage gracefully končí přes existující `Pose.capture` v `setStatus`.
- **Multi-character:** v F3 Akváriu každý Stickman má vlastní PoseSequence. Žádné sdílení state.

### Status

→ TODO po Demo03 PoseSequence. Otevírá cestu k F4+ specializacím (sbírání, těžba, boj, crafting, ...) — vše je další specializace Interactable.
