# CLAUDE.md — Stickman

Projektová pravidla pro Stickman. Doplňuje globální `~/.claude/CLAUDE.md`.

## Projekt v jedné větě

Vrstvený 3D model lidské postavy s animací, těžištěm, body opory a IK — celé v prohlížeči přes Three.js, bez build-toolu.

## Tech stack

- **Three.js r170** přes import maps (žádný npm/build)
- **ES moduly** v `src/` (relativní importy `from '../src/...'`)
- **Vanilla JS + HTML** v demech, žádné frameworky
- **Dev server:** `python -m http.server 8000` z rootu

## Architektura — vrstvy

```
src/model/      MODEL — čistá data + matematika, bez Three.js
  Joint.js          — uzel hierarchie (DOF, limity, signs, úhly)
  Skeleton.js       — proporce, hierarchie, FK, CoM, supportPoints, isStable, snapToFloor
  Pose.js           — snapshot úhlů (capture, apply, lerp)
  Mat4.js           — 4×4 matice (column-major, vlastní implementace)
  IK.js             — 2-bone IK (solveTwoBoneIK)

src/view/       VIEW — vykreslení modelu v Three.js
  StickmanView.js   — hierarchie THREE.Group, kosti, klouby, hlava, markery (CoM, support polygon)

src/scene/      SCÉNA — společné prostředí
  BasicScene.js     — renderer, kamera, OrbitControls, světla, stíny, podlaha, pause

src/util/       UTILITY — bez Three.js, čisté funkce
  Geometry.js       — distXZ, distPointToSegmentXZ, convexHullXZ, pointInConvexPolygonXZ
  DemoUI.js         — addSlider, addToggle, addButtonGroup, injectStyles
  Fidget.js         — applyFidget (globální overlay drobných oscilací; doménový pojem „Neklid")
  Breathing.js      — applyBreathing (overlay dýchání ~0.25 Hz na torso.x + neck.x)
  Palette.js        — PAL barvy (CoM, support, gravity, body markery, …)

src/library/    KNIHOVNA POSE — definované jednou, importované všude
  Poses.js          — STANCE_POSES / SIT_POSES / LIE_POSES (Inspector) + BASIC/BALANCE/HEAD_SUPPORT pro stará dema

src/character/  CHARACTER — wrapper Stickman + Status + Animations + Gestures
  Status.js         — enum (STAND, SIT, WALK, RUN, SWIM, CLIMB, JUMP, LAY, SLEEP, DANCE, CRAWL, PRONE, SNEAK)
  Animations.js     — registr Status → fn(skeleton, time, params); DEFAULTS_WALK / RUN_PRESETS / DEFAULTS_DRIFT / JUMP_PRESETS / DEFAULTS_CRAWL/PRONE/SNEAK
  Stickman.js       — wrapper { skeleton, status, time, params, transitionDuration, … }, setStatus, animate(dt) s plynulými přechody
  Gestures.js       — Bio/Fyzio overlay s Poisson scheduler; 7 gest s pose-based keyframes + root delta

demos/          DEMO HTML — každé demo je samostatná stránka
.source/        SCRATCH — vyřazené prototypy (mimo architekturu)
```

**Pravidlo pro novou logiku:** model neimportuje z view/scene. View neimportuje z scene. Util/library nesmí importovat z model (kromě Pose v library/Poses.js — Pose je sama čistá data). Character importuje z model/ a library/, nikdy z view/ ani scene/.

## Klíčové konvence (gotchas)

### 1. Postava se „dívá" podél -Z
- Postavova **pravá** ruka = **+X**, **levá** = **-X**
- „Kupředu" pro postavu = **-Z** (= směr pohledu)
- Kamera defaultně na `+Z` straně (= vidí obličej)

### 2. Anatomické úhly + per-osa signs
- `Joint.angles` jsou **anatomické** (kladné = přirozený směr — předpažení, ohyb, abdukce ven)
- `Joint.signs.{x,y,z}` (±1) převádí na **Three.js rotace**
- Důvod: jednou definované v `Skeleton._build()`, dema pak mají čisté hodnoty (např. `setAngle('elbowL', 'x', 90)` = ohyb 90°, ne magické znaménko)
- Asymetrické příklady:
  - `kneeL/R` má `signX = -1` (ohyb dozadu = záporná Three.js rotace)
  - `shoulderL` má `signZ = -1`, `shoulderR` má `signZ = +1` (zrcadlová abdukce)

### 3. Three.js r155+ — physically correct lights
- Intenzity světel jsou ve **fyzikálních jednotkách** (lumeny/candely)
- Staré hodnoty 0.5–1.5 = extrémně tmavé
- V `BasicScene` jsme šli na `AmbientLight 1.5`, `DirectionalLight 3.5` (key + stíny)

### 4. Forward kinematics — `computeWorldTransforms`
- Po každé změně úhlů jsou cached `joint.worldPosition` zastaralé
- Buď znovu volat `skel.computeWorldTransforms()`, nebo volat `getCenterOfMass()` / `getJointWorldPosition()` (ty volají interně)

### 5. IK předpokládá `rootRotation = 0`
- `solveTwoBoneIK` při pootočené kostře varuje (jednou) v console
- Plavání (demo11) má `rootRotation.x = ±90` — IK by tam selhalo, není potřeba

### 6. Pose.lerp interpoluje úhly + root, body opory ne
- `Pose` drží jen `angles`, `rootPosition`, `rootRotation` — žádné `supportPoints`.
- Lerp interpoluje úhly per-osa a root pos/rot lineárně.
- Aktuální contact joints určuje `Skeleton.getSupportPoints` z geometrie po aplikaci úhlů (= dynamic).

## Konvence kódu

- **Komentáře česky.** Vysvětluj language-specific konstrukce a logiku.
- **Vlastní jména:** anglicky (proměnné, funkce, jména souborů, jména kloubů).
- **Pose definice:** **vždy z `src/library/Poses.js`**. Nedefinovat v dem znovu.
- **UI v demech:** přes `src/util/DemoUI.js` (nepsat boilerplate `addEventListener` ručně).
- **Geometrie:** přes `src/util/Geometry.js` (žádné duplicity convex hull).
- **Stíny + podlaha:** zapnout přes `BasicScene({ floorY: -H/2 })`. Nepoužívat `GridHelper` ručně.

## Macros
- Projektová makra: `@BEGIN`, `@END` — definována v `PROMPTS.md`. `@BEGIN` vždy končí spuštěním serveru na `localhost:8000`.
- Globální makra: `@THINK`, `@AUDIT:CODE`, `@AUDIT:DOCS`, `@DOCS`, `@CALIBRATE` — viz `~/.claude/CLAUDE.md`.

## Workflow

1. Diskuse konceptu (co a proč)
2. Návrh API (jaké třídy/funkce, vstupy/výstupy)
3. Implementace
4. Demo (= test/ukázka)
5. Aktualizace `index.html` s odkazem

## Naming dem

- Krátké slovo nebo zkratka po `demoNN_`: `demo01_inspector`, `demo02_stresstest`, `demo10_ik`
- Přesný popis je v `<title>` a `<h2>` v HTML

## Kde co najít

| Téma | Soubor |
|---|---|
| Přidat nový kloub / DOF | `src/model/Skeleton.js` (`_build`) |
| Změnit proporce postavy | `src/model/Skeleton.js` (`buildProportions`) |
| Přidat novou pózu | `src/library/Poses.js` |
| Přidat nový stav (status) | `src/character/Status.js` + `Animations.js` |
| Přidat animační funkci | `src/character/Animations.js` |
| Změnit délku přechodu | `Stickman.transitionDuration` (default 0.4 s) |
| Přidat geometrickou utilitu | `src/util/Geometry.js` |
| Přidat UI helper | `src/util/DemoUI.js` |
| Vlastní renderování | `src/view/StickmanView.js` (markery, materiály) |
| Scéna / kamera / světla | `src/scene/BasicScene.js` |
| IK matematika | `src/model/IK.js` |
