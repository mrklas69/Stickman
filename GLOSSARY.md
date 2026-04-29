# GLOSSARY — Stickman

Slovníček projektových pojmů. Single source of truth pro terminologii. Když se v kódu nebo dokumentaci objeví nový termín, nejdřív sem.

Sekce:

- [Anatomie](#anatomie) — klouby, kosti, strany, směry
- [Kinematika](#kinematika) — DOF, FK, IK, CoM, support polygon, anatomický úhel + sign, stabilita
- [Animace](#animace) — Pose, lerp, Status, Animations, Stickman, Transition, Brain
- [Architektura](#architektura) — vrstvy, naming dem

---

## Anatomie

### Hierarchie kostry

Kostra "Minimal" má **9 funkčních kloubů + 4 koncové body** (`headTop`, `wristL/R`, `ankleL/R` jsou 0-DOF konce — slouží jen k umístění zápěstí, kotníků, vrcholu hlavy).

```
pelvis (root, 0 DOF)
├── torso (3 DOF: x flexe, y twist, z lateral) ── neck (3: x, y, z) ── headTop (0)
├── shoulderL (3: x, y, z) ── elbowL (1: x) ── wristL (0)
├── shoulderR (3: x, y, z) ── elbowR (1: x) ── wristR (0)
├── hipL (3: x, y, z) ── kneeL (1: x) ── ankleL (0)
└── hipR (3: x, y, z) ── kneeR (1: x) ── ankleR (0)
```

Suma DOF = **19** (přístup `skeleton.totalDOF`).

### Klouby (joints)

Každý kloub má jméno, parent, lokální offset vůči parentu (rest pose), seznam aktivních os (`axes`), limity per-osa a `signs`. Definice v `src/model/Joint.js`, hierarchie v `Skeleton._build()`.

| Joint | DOF | Osy | Funkce |
|---|---|---|---|
| `pelvis` | 0 | — | virtuální root, jeho world = `rootPosition` + `rootRotation` |
| `torso` | 3 | x, y, z | flexe trupu (x), twist páteře (y, body roll), lateral flexe (z, úklon) |
| `neck` | 3 | x, y, z | předklon hlavy (x), twist hlavy ±90° (y), úklon hlavy (z) |
| `shoulderL/R` | 3 | x, y, z | předpažení/zapažení (x), axiální rotace paže — turn-out/turn-in (y), abdukce do strany (z) |
| `elbowL/R` | 1 | x | ohyb lokte |
| `hipL/R` | 3 | x, y, z | předkop (x), vnější/vnitřní rotace stehna — turn-out/turn-in (y), roznožka (z) |
| `kneeL/R` | 1 | x | ohyb kolena (lýtko dozadu, max 165° = pata k zadku pro klek) |

### Kosti (bones)

Kost = úsečka mezi parent jointem a child jointem. Vykresluje se jako komolý kužel (`view/StickmanView.js`) — `radiusBottom` = poloměr parenta, `radiusTop` = poloměr childa, takže končetiny plynule ztenčí.

Hmotnostní tabulka pro CoM výpočet (`buildProportions().MASS`):

| Bone | Mass (rel.) |
|---|---|
| head | 0.08 |
| torsoLower (`pelvis→torso`) | 0.25 |
| torsoUpper (`torso→neck`) | 0.25 |
| upperArm L+R, forearm L+R | 0.03 / 0.02 |
| thigh L+R, shin L+R | 0.10 / 0.04 |

### Strany a směry

- **Postavova LEVÁ ruka** = `−X` (joint suffix `L`)
- **Postavova PRAVÁ ruka** = `+X` (joint suffix `R`)
- **Forward (kupředu pro postavu)** = `−Z` (= směr pohledu, Three.js standard)
- **Up** = `+Y`
- Kamera defaultně na `+Z` straně → vidí obličej

### Rest pose

Stav kostry, kdy všechny `joint.angles` jsou 0: postava stojí svisle, ruce visí dolů, palce dopředu. `skeleton.reset()` ji obnoví.

### Proporce

Funkce `buildProportions(H)` v `Skeleton.js` vrací všechny délky kostí, poloměry kloubů a hmotnosti relativně k výšce postavy `H`. Inspirace Vitruviem (≈ 8 hlav). Změna proporcí = jediný zdroj pravdy: editovat `buildProportions`, neměnit číslo na dvou místech.

Po Sezení 6 byla v Inspectoru sekce „Proporce" s 6 multiplier slidery pro live ladění (přes `Skeleton.setProportions` + `StickmanView.rebuildBones`). V Sezení 7 jsme našli sweet spot a zafixovali do default (biceps × 0.95, předloktí × 0.95, stehno × 1.05, lýtko × 1.05); slidery i komentáře v Inspectoru byly odstraněny. API `setProportions` / `rebuildBones` zůstává pro případnou budoucí potřebu.

---

## Kinematika

### DOF (Degree of Freedom)

Stupeň volnosti — počet **nezávislých rotačních os** kloubu. Termín z mechaniky 19. století (Lagrange, analytická mechanika tuhých těles).

- Koleno: 1 DOF (jen ohyb)
- Kotník: 0 DOF v naší kostře (zjednodušení — kotník je koncový bod, žádné dorzi/plantární flexe)
- Rameno: 3 DOF v naší kostře (předpažení/zapažení x, axiální rotace y, abdukce do strany z)
- Trup (torso): 3 DOF (flexe, twist, lateral)

V kódu: `joint.dof` = počet, `joint.axes` = pole aktivních os (`['x']`, `['x','z']`, `['x','y','z']`).

### FK (Forward Kinematics)

Z úhlů kloubů spočítej world pozice. Skládání matic od kořene:

```
world(joint) = world(parent) × T(localOffset) × R(angles × signs)
```

Implementace `Skeleton.computeWorldTransforms()`. Po každé změně úhlů jsou cached `joint.worldPosition` zastaralé — buď znovu zavolat, nebo použít `getJointWorldPosition()` / `getCenterOfMass()` (volají interně).

### IK (Inverse Kinematics)

Opak FK: zadej cílovou pozici efektoru (např. zápěstí) a dopočítej úhly. V projektu řešen 2-bone IK (rameno→loket→zápěstí, kyčel→koleno→kotník) — analyticky přes cosinovou větu, `src/model/IK.js` `solveTwoBoneIK()`.

Předpoklad: `rootRotation = 0`. Při pootočené kostře algoritmus warne v console (jednou) — pro plavání (demo11) má `rootRotation.x = ±90`, IK by tam selhalo.

### CoM (Center of Mass) / Těžiště

Vážený průměr středů všech kostí + hlavy podle `proportions.MASS`. `Skeleton.getCenterOfMass()` vrací `{x, y, z}` ve world souřadnicích.

V projektu se zobrazuje jako **zelená sféra** (s `depthTest: false`, ať není schovaná uvnitř trupu).

### Support polygon / Body opory

**Joints jsou supports automaticky** — vizuální konvence (sféry kloubů barvou `PAL.support` magenta-pink). `Skeleton.getSupportPoints()` vrací **dynamic contact body** (klouby s Y blízko nejnižšího, tolerance `0.04 × H`) — používá se **interně** pro `isStable()`, **vizuálně se nezvýrazňuje** (od Sezení 6 odebráno z DebugView).

Pro stand pose: contact = `{ankleL, ankleR}` (= 2 body s Y na floor, ostatní výš).
Pro layBack: contact = `{headTop, shoulderL/R, pelvis, ankleL/R}` (= 6 bodů, všichni Y = floor).
Pro single-leg stoj: contact = `{ankleL}` (= 1 bod, druhá noha pokrčená výš).

**Convex hull** contact body v rovině XZ je **support polygon** (oblast podpory) — počítá se jen pro `isStable()` test.

Legacy `Skeleton.supportPoints` getter zachován pro stará dema (vrací jména contact joints).

### Anatomický úhel + sign

Klíčová konvence projektu:

- `joint.angles.{x,y,z}` jsou **anatomické**: kladné = přirozený směr (předpažení, ohyb lokte, abdukce ven od těla).
- `joint.signs.{x,y,z}` (±1) převádí na **Three.js rotaci** v lokálu jointu.
- Důvod: dema mají čisté hodnoty (např. `setAngle('elbowL', 'x', 90)` = ohyb 90°, ne magické znaménko). Per-osa znaménka jsou jednou definovaná v `Skeleton._build()`.

Asymetrické příklady:

- `kneeL/R`: `signX = −1` (anatomický ohyb dozadu = záporná Three.js rotace)
- `shoulderL`: `signZ = −1`, `shoulderR`: `signZ = +1` (zrcadlová abdukce)

Skládání v FK: `Three.js rotation = anatomical_angle × sign × DEG`.

### Limity (limits)

`joint.limits.{x,y,z} = [min, max]` ve stupních. `setAngle()` clampuje vstupní hodnotu do limitu. Limity jsou anatomické (např. koleno `[0, 130]` = neohýbá se dopředu, max 130° dozadu).

### isStable

Test stability: leží horizontální projekce CoM uvnitř (rozšířeného) support polygonu? `Skeleton.isStable(tolerance?)`:

- 0 bodů → vždy nestabilní
- 1 bod → stabilní pokud `distXZ(CoM, point) ≤ tolerance`
- 2 body → vzdálenost CoM od úsečky `≤ tolerance`
- 3+ bodů → convex hull + point-in-polygon test (s tolerancí jako rozšíření)

Default tolerance = `0.04 × H` (≈ "velikost chodidla").

### snapToFloor

`Skeleton.snapToFloor(floorY = 0)` posune `rootPosition.y` tak, aby **nejnižší support point** ležel přesně na podlaze. Funguje v jakékoliv póze: dřep klesne, stoj na rukách otočí postavu hlavou dolů a srovná na ruce.

Pozor: po snapu jsou cached worldPositions zastaralé — zavolat `computeWorldTransforms()` znovu nebo přes `getCenterOfMass()`.

---

## Animace

### Pose

Snapshot stavu kostry: úhly všech aktivních os + `rootPosition` + `rootRotation` + `supportPoints`. `src/model/Pose.js`. Bez závislosti na Three.js (čistá data + matematika).

API:

- `Pose.capture(skeleton, name)` — vyrobí snapshot z aktuálního stavu
- `pose.apply(skeleton)` — aplikuje (interně volá `skeleton.reset()`, pak setuje úhly)
- `Pose.lerp(a, b, t)` — lineární interpolace (viz níže)

**Pozor:** `pose.apply()` resetuje root. Pokud chceš nastavit `rootRotation/rootPosition` ručně, dělej to **AŽ PO** `pose.apply()`, jinak je smazáno.

### Pose.lerp

Lineární interpolace mezi dvěma pózami pro `t ∈ [0,1]`:

- **Úhly**: lerp per-osa. Pokud jedna póza osu neuvádí, hodnota = 0 (rest pose).
- **rootPosition / rootRotation**: lineární interpolace.
- **supportPoints**: **DISKRÉTNÍ skok v půli** (`t < 0.5 ? a : b`) — body opory jsou množina, nelze plynule interpolovat mezi `['ankleL','ankleR']` a `['wristL','wristR']`.

### Pose library

`src/library/Poses.js` — single source of truth pro pojmenované pózy. Organizované do exportovaných sad podle UI sekce v Inspectoru:

- **`STANCE_POSES`** (POSTOJE): `stand`, `tpose`, `wave`, `squat`
- **`SIT_POSES`** (SEDY/KLEKY): `sit`, `sitCross`, `sitLegsForward`, `sitTuck`, `sitKneel`, `sitChild`, `cat`, `sitSide`
- **`LIE_POSES`** (LEHY): `layBack`, `layStarfish`, `layChill`, `laySide`, `layReader`, `layRecline`
- **Ostatní** (= ne v žádné sadě): `oneLegL/R`, `lunge`, `leanForward`, `kapalasana`, `pincha`

**Pravidlo:** pózy se definují jen v `library/Poses.js`. Dema je nedefinují znovu — importují.

### Status *(F2 prototyp — Sezení 5)*

Enum stavu postavy v `src/character/Status.js`: `STAND`, `SIT`, `WALK`, `RUN`, `SWIM`, `CLIMB`, `JUMP`, `LAY`, `SLEEP`, `DANCE`. `Object.freeze`d (= zamrazený). Hodnoty jsou stringy (lepší debug + serializace). Atribut na `Stickman`, ne `Skeleton`.

Stavy bez registrované animace v `ANIMATIONS` mapě se chovají jako no-op (postava zůstane v poslední pose) — záměrné, ať Stickman nepadá na neimplementovaných stavech. Aktuálně implementované: STAND (s idle/Drift režimem), SIT, WALK, RUN (Jog/Sprint presety), LAY. DANCE NENÍ samostatná animace = preset přes STAND idle (viz níže).

### Animations / Animate *(F2 prototyp — Sezení 5, rozšířeno v 8)*

`src/character/Animations.js` — registr `Status → fn(skeleton, time, params)`. Funkce mutuje skeleton (volá `setAngle`, `rootPosition`, …), nemá return value.

Defaulty parametrů exportované jako `DEFAULTS_WALK`, `RUN_PRESETS.jog/sprint`, `DEFAULTS_DRIFT` — single source pro slidery / setStatus calls. Demo si při `setStatus()` může předat patch (např. `{ tempo: 1.5 }`), zbytek zdědí z defaults.

Metoda `stickman.animate(dt)` — posune `Stickman.time` o `dt` a zavolá registrovanou funkci. Animace mohou být:

- **Pose-based** (STAND default, SIT, LAY): `pose.apply(skeleton)` — jeden řádek, idempotentní; pose.apply interně volá `skeleton.reset()` před setAngle.
- **Procedurální cyklické** (WALK, RUN): `time → angles` mapping. **Konvence: musí volat `skeleton.reset()` na začátku** — bez něj by úhly z předchozí animace (typicky Drift, který nastaví všech 22 os) přetrvávaly v ne-přepsaných osách napořád.
- **Stavové procedurální** (STAND idle / Drift): drží `params._drift = { from, target, cycleStart, cycleDuration, fraction, ... }` (lazy init při prvním volání). Random walk k cíli; po dorazu nový cíl.

### Drift *(Sezení 8)*

Idle režim STAND zapnutý přes `params.idle = true`. Algoritmus = budget-based random walk (spec původně v IDEAS.md):

1. Sestav vektor 22 os (19 DOF + 3 root pseudo-osy s `rootRange = 90°`)
2. Pool = N × 100 bodů; budget = `fraction × pool`
3. Generuj plně random target per osu (uniform v limits)
4. Iteruj: pick random axis → consume = `min(STEP, |delta|, budget)` → posuň `intermediate[i]` o `consume × sign(delta)` → `budget -= consume`
5. Po dorazu (`time - cycleStart >= cycleDuration`) nový target generován od aktuálního `target` (= `from = previous target`)

`DEFAULTS_DRIFT`: `fraction = 0.25`, `cycleDuration = 1.4 s`, `step = 5`, `rootRange = 90°`.

Interpolace per cyklus = `Pose.lerp(from, target, eased)` s **quint ease-out** (`1 - (1-t)⁵`) — rychlý start, velmi pomalý dojezd → „intent" pocit.

### Dance preset *(Sezení 8)*

Dance NENÍ samostatná animace, je to konfigurační preset Status.STAND idle:

```js
stickman.setStatus(Status.STAND, {
    idle: true,
    fraction: 0.5,             // 2× Drift = větší swing
    cycleDuration: 60/110,     // = 0.545 s = jeden beat při 110 BPM
    rootRange: 8,              // omezený (postava neztratí stabilitu)
});
```

= drift v rytmu, omezený root pro stabilitu. **Žádný `animateDance` ani Status.DANCE registr** — KISS. (Status.DANCE v enum zůstává pro budoucí použití, např. specializovaná taneční animace.)

### Neklid *(Sezení 8)*

Globální overlay drobných oscilací nad PRIMÁRNÍ animaci. Aplikuje se v render loopu PO `Stickman.animate(dt)`:

```js
scene.onUpdate((dt) => {
    globalTime += dt;
    stickman.animate(dt);                       // 1. primárka
    applyNeklid(skel, globalTime, neklidLevel); // 2. overlay nad to
    skel.snapToFloor(FLOOR_Y);
    view.update();
});
```

Implementace `src/util/Neklid.js`:

- Per-osa deterministická frekvence (0.3–0.8 Hz) + fáze (0–1) přes hash z klíče `joint.axis` (resp. `root.x/y/z`). Cache → každá osa má svou unikátní noise charakteristiku napříč spuštěními.
- Mapping: `level ∈ [0, 10]` → max ~5° per kloub, ~4° per root osa.
- Fungue pro VŠECHNY režimy (Walk, Sprint, Drift, Reset, Sit, Lay) — nezávislé na Status.

**Žádný kumulativní bug:** Stickman.animate volá `skeleton.reset()` každý frame (přes pose.apply nebo explicitně v procedurálních animacích); Neklid přidá noise nad čerstvou primárku. Frame N+1 reset smaže předchozí noise.

### Stickman *(F2 prototyp — Sezení 5)*

### Stickman *(F2 prototyp — Sezení 5)*

Wrapper `{ skeleton, status, time, params, transitionDuration, transitionFrom, transitionElapsed }` v `src/character/Stickman.js`. Skeleton zůstává čistá data (`model/`); Stickman drží status + animace + přechody = chování v čase.

API:

- `new Stickman(skeleton, status?, params?)` — konstruktor (default status = STAND, params = `{}`)
- `stickman.setStatus(status, params?)` — přepne stav, spustí přechod, resetuje `time = 0`
- `stickman.setParams(patch)` — přepíše parametry beze změny stavu nebo času (= slidery za běhu)
- `stickman.animate(dt)` — posune čas, aplikuje animaci (s případným blendem)

Důvod oddělení od Skeleton: kostra je reusable a testovatelná, status/animate je high-level API pro hry (= C2 framework artefakt). View ani scene Stickman NEDRŽÍ — to si demo komponuje.

### Transition (přechody mezi stavy) *(F2 prototyp — Sezení 5)*

Když `setStatus()` přepne stav, `Pose.capture(skeleton)` zachytí aktuální stav (`transitionFrom`). Následující `animate()` během `transitionDuration` (default `0.4 s`) blendují přes `Pose.lerp` z toho snapshotu do výstupu nové animace.

Easing = **cubic ease-out** (`1 − (1−t)³`). Důvod volby: postava rychle reaguje na příkaz (rychlý start) a měkce dojede do cílové pozy (= organický pocit). Lineární easing by působil mechanicky, ease-in-out by působil pomalou reakcí.

Edge case — **přepnutí mid-transition**: `Pose.capture` zachytí AKTUÁLNĚ blended pózu (ne původní `transitionFrom`), takže nový přechod plynule pokračuje z aktuálního stavu, žádný "skok zpět".

### Brain *(plánováno, F3)*

State machine s timery (idle 5 s → walk 10 s → sit 8 s → …). Markov-chain pravděpodobnosti přechodů mezi statusy. **Žádné LLM/planning.** Použití v akváriu (multi-instance Stickman).

---

## Architektura

### Vrstvy

```
src/model/      MODEL — čistá data + matematika, bez Three.js
src/view/       VIEW — vykreslení modelu v Three.js
src/scene/      SCÉNA — společné prostředí (renderer, kamera, světla, podlaha)
src/util/       UTILITY — bez Three.js, čisté funkce
src/library/    KNIHOVNA POSE — pojmenované pózy
src/character/  CHARACTER — wrapper Stickman + Status + Animations (F2 prototyp)
demos/          DEMO HTML — každé demo = samostatná stránka
.source/        SCRATCH — vyřazené prototypy
```

**Pravidla závislostí:**

- Model **neimportuje** z view ani scene.
- View **neimportuje** z scene.
- Util/library **nesmí importovat** z model. Výjimka: `library/Poses.js` může importovat `Pose` (která je sama čistá data).
- Character importuje `model/` (Skeleton, Pose) a `library/` (Poses), nikdy `view/` ani `scene/`.

### Naming dem

Krátké slovo nebo zkratka po `demoNN_`: `demo04_animation`, `demo10_ik`, `demo13_ikwalk`. Přesný popis je v `<title>` a `<h2>` HTML stránky.

Po dokončení F3 budou 3 finální dema:

- `demo01_inspector` (statický)
- `demo02_stresstest` (dynamický)
- `demo03_aquarium` (emergent)

Renumber se odkládá až po F3.

### Crash test markery *(F1)*

Žluto-černé soustředné disky na povrchu hlavy — front (`−Z`), side-L (`−X`), side-R (`+X`). Pomáhají rozpoznat rotaci sférické hlavy. Implementace **geometricky** (3 disky `CircleGeometry` × 3 vrstvy: žlutý vnější, černý prostřední, žlutý vnitřní), **žádná textura**.

### DOF tooltip *(F1)*

L1 varianta = text panel při select kloubu (raycaster). Zobrazí: jméno, DOF axes, limits, signs, current angle. L2 (barevné osy) a L3 (limit oblouky) odloženy.
