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

src/library/    KNIHOVNA POSE — definované jednou, importované všude
  Poses.js          — stand, tpose, sit, squat, wave, oneLegL/R, lunge, leanForward, ...

demos/          DEMO HTML — každé demo je samostatná stránka
.source/        SCRATCH — vyřazené prototypy (mimo architekturu)
```

**Pravidlo pro novou logiku:** model neimportuje z view/scene. View neimportuje z scene. Util/library nesmí importovat z model (kromě Pose v library/Poses.js — Pose je sama čistá data).

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

### 6. Pose.lerp — supportPoints jsou DISKRÉTNÍ
- Úhly se lineárně interpolují
- `supportPoints` se přepne v půli (`t < 0.5 ? a : b`) — nelze interpolovat množinu

## Konvence kódu

- **Komentáře česky.** Vysvětluj language-specific konstrukce a logiku.
- **Vlastní jména:** anglicky (proměnné, funkce, jména souborů, jména kloubů).
- **Pose definice:** **vždy z `src/library/Poses.js`**. Nedefinovat v dem znovu.
- **UI v demech:** přes `src/util/DemoUI.js` (nepsat boilerplate `addEventListener` ručně).
- **Geometrie:** přes `src/util/Geometry.js` (žádné duplicity convex hull).
- **Stíny + podlaha:** zapnout přes `BasicScene({ floorY: -H/2 })`. Nepoužívat `GridHelper` ručně.

## Workflow

1. Diskuse konceptu (co a proč)
2. Návrh API (jaké třídy/funkce, vstupy/výstupy)
3. Implementace
4. Demo (= test/ukázka)
5. Aktualizace `index.html` s odkazem

## Naming dem

- Krátké slovo nebo zkratka po `demoNN_`: `demo04_animation`, `demo10_ik`, `demo13_ikwalk`
- Přesný popis je v `<title>` a `<h2>` v HTML

## Kde co najít

| Téma | Soubor |
|---|---|
| Přidat nový kloub / DOF | `src/model/Skeleton.js` (`_build`) |
| Změnit proporce postavy | `src/model/Skeleton.js` (`buildProportions`) |
| Přidat novou pózu | `src/library/Poses.js` |
| Přidat geometrickou utilitu | `src/util/Geometry.js` |
| Přidat UI helper | `src/util/DemoUI.js` |
| Vlastní renderování | `src/view/StickmanView.js` (markery, materiály) |
| Scéna / kamera / světla | `src/scene/BasicScene.js` |
| IK matematika | `src/model/IK.js` |
