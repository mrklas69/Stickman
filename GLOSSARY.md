# GLOSSARY — Stickman

Slovníček projektových pojmů. Single source of truth pro terminologii. Když se v kódu nebo dokumentaci objeví nový termín, nejdřív sem.

Sekce:

- [Anatomie](#anatomie) — klouby, kosti, strany, směry
- [Kinematika](#kinematika) — DOF, FK, IK, CoM, support polygon, anatomický úhel + sign, stabilita
- [Animace](#animace) — Pose, lerp, Status, Animate
- [Architektura](#architektura) — vrstvy, naming dem

---

## Anatomie

### Hierarchie kostry

Kostra "Minimal" má **9 funkčních kloubů + 4 koncové body** (`headTop`, `wristL/R`, `ankleL/R` jsou 0-DOF konce — slouží jen k umístění zápěstí, kotníků, vrcholu hlavy).

```
pelvis (root, 0 DOF)
├── torso (3 DOF: x flexe, y twist, z lateral) ── neck (3: x, y, z) ── headTop (0)
├── shoulderL (2: x, z) ── elbowL (1: x) ── wristL (0)
├── shoulderR (2: x, z) ── elbowR (1: x) ── wristR (0)
├── hipL (2: x, z) ── kneeL (1: x) ── ankleL (0)
└── hipR (2: x, z) ── kneeR (1: x) ── ankleR (0)
```

Suma DOF = **15** (přístup `skeleton.totalDOF`).

### Klouby (joints)

Každý kloub má jméno, parent, lokální offset vůči parentu (rest pose), seznam aktivních os (`axes`), limity per-osa a `signs`. Definice v `src/model/Joint.js`, hierarchie v `Skeleton._build()`.

| Joint | DOF | Osy | Funkce |
|---|---|---|---|
| `pelvis` | 0 | — | virtuální root, jeho world = `rootPosition` + `rootRotation` |
| `torso` | 3 | x, y, z | flexe trupu (x), twist páteře (y, body roll), lateral flexe (z, úklon) |
| `neck` | 3 | x, y, z | předklon hlavy (x), twist hlavy ±90° (y), úklon hlavy (z) |
| `shoulderL/R` | 2 | x, z | předpažení/zapažení (x), abdukce do strany (z) |
| `elbowL/R` | 1 | x | ohyb lokte |
| `hipL/R` | 2 | x, z | předkop (x), roznožka (z) |
| `kneeL/R` | 1 | x | ohyb kolena (lýtko dozadu) |

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

---

## Kinematika

### DOF (Degree of Freedom)

Stupeň volnosti — počet **nezávislých rotačních os** kloubu. Termín z mechaniky 19. století (Lagrange, analytická mechanika tuhých těles).

- Koleno: 1 DOF (jen ohyb)
- Kotník: 0 DOF v naší kostře (zjednodušení — kotník je koncový bod, žádné dorzi/plantární flexe)
- Rameno: 2 DOF v naší kostře (předpažení + abdukce; reálné rameno má 3, my vynecháváme axiální rotaci paže)
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

**Joints jsou supports automaticky.** Žádný explicitní `supportPoints` field — `Skeleton.getSupportPoints()` vrací **dynamic contact body**: ty klouby, jejichž world Y je blízko nejnižšího (do tolerance `0.04 × H`).

Pro stand pose: contact = `{ankleL, ankleR}` (= 2 body s Y na floor, ostatní výš).
Pro layBack: contact = `{headTop, shoulderL/R, pelvis, ankleL/R}` (= 6 bodů, všichni Y = floor).
Pro single-leg stoj: contact = `{ankleL}` (= 1 bod, druhá noha pokrčená výš).

**Convex hull** contact body v rovině XZ je **support polygon** (oblast podpory).

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

`src/library/Poses.js` — single source of truth pro pojmenované pózy. Aktuálně: `stand`, `tpose`, `sit`, `squat`, `wave`, `oneLegL/R`, `lunge`, `leanForward`, …

**Pravidlo:** pózy se definují jen v `library/Poses.js`. Dema je nedefinují znovu — importují.

### Status *(plánováno, F2)*

Enum stavu postavy: `STAND`, `SIT`, `WALK`, `RUN`, `SWIM`, `CLIMB`, `JUMP`, `LAY`, `SLEEP`, `DANCE`. Atribut na `Stickman` (vrstva `character/`, ne `Skeleton`). Animace mohou mít varianty (`SIT1..5` — náhodný výběr při přechodu).

### Animate *(plánováno, F2)*

Metoda `stickman.animate(dt)` — posouvá animaci aktuálního statusu o `dt` sekund. Animace = buď keyframes přes `Pose.lerp`, nebo procedurální cykly (chůze, plavání). Registr `Animations.js` v `character/`.

### Stickman *(plánováno, F2)*

Wrapper `{ skeleton, status, animate(dt), render hook }` v nové vrstvě `src/character/`. Skeleton zůstává čistá data (`model/`); Stickman drží status + animace = chování. Důvod oddělení: kostra je reusable a testovatelná, status/animate je high-level API pro hry (= C2 framework artefakt).

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
src/character/  CHARACTER — wrapper Stickman + Status + Animations (plánováno F2)
demos/          DEMO HTML — každé demo = samostatná stránka
.source/        SCRATCH — vyřazené prototypy
```

**Pravidla závislostí:**

- Model **neimportuje** z view ani scene.
- View **neimportuje** z scene.
- Util/library **nesmí importovat** z model. Výjimka: `library/Poses.js` může importovat `Pose` (která je sama čistá data).
- Character (plánováno) bude importovat `model/` (Skeleton, Pose) a `library/` (Poses), ale ne `view/` ani `scene/`.

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
