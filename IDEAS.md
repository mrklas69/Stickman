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

## Drift — procedural idle motion (budget-based random walk) *(Sezení 7)*

**Kandidát na F2 STAND-idle animace.** Postava ve stoji se neustále mírně hýbe k náhodným cílům — herní standard pro „postava-žije". Liší se od Inspector Random tlačítka tím, že nesází na celý DOF range najednou (Inspector full random + quint ease-out už zachytí 60 % efektu).

### Algoritmus (3 fáze)

1. **Generuj cílovou pózu.** Plně uniform random v limitech každé osy (jak to dělá `applyRandom` v Inspectoru). Volitelně: target = nějaký „referenční idle pose" + random offset.
2. **Distribuuj budget.**
   - Sestav vektor všech `N` aktivních os (19 DOF + 3 rootRot = 22; rootPos vynechat — snap se postará).
   - Normalizuj rozsah každé osy na 100 bodů: `pool = N × 100 = 2200 bodů`.
   - `budget = FRACTION × pool` (parametr, default `FRACTION = 0.25` → 550 bodů).
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

Posunout do TODO ve F2 fázi (RUN / SWIM / JUMP / SLEEP / DANCE — k STAND přidat idle variantu). Inspector zatím má quint easing + full Random (= odlišný účel: diversity check, ne idle).
