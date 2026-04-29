# Stickman

A layered 3D human figure with animation, center of mass, support polygon, and inverse kinematics — running entirely in the browser via Three.js, with no build tooling.

![Stickman walking](assets/hero-walk.gif)

**Live demo:** <https://mrklas69.github.io/Stickman/>

The project is a learning playground: each concept (forward kinematics, IK, balance, gait, swimming, climbing) is isolated in its own demo so it can be inspected and tweaked in isolation.

## Quick start

ES modules need an HTTP server. From the project root:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/>.

No `npm install`, no bundler, no transpiler. Three.js is loaded via an import map in each demo.

## Demos

The project is consolidating toward 3 final pages (Inspector, Stress test, Aquarium). Five legacy single-concept demos (01-static, 02-poses, 03-DOF, 05-CoM, 07-snap) have been folded into the Inspector and removed.

| # | Demo | What it shows |
|---|------|---------------|
| 01 | Inspector | Main static playground. 20 authored poses across 3 sections (POSTOJE / SEDY/KLEKY / LEHY) + Reset/Random; sliders for all 22 DOF + root pos/rot with tooltips and double-click reset; debug overlays (CoM, gravity arrow, body markers, hover tooltips); smooth pose transitions (cubic ease-out); Copy JSON. Snap-to-floor and floor are always on. |
| 02 | Stress test (F2 prototype) | Dynamic demo over the new `src/character/` layer — `Stickman` wrapper with a `status` attribute and `animate(dt)`. Layout mirrors Inspector: left panel POSES (Reset / Dance / Drift) + STATUS (Walk / Jog / Sprint); right panel global Neklid slider (overlay applied on top of any animation). Drift = budget-based random walk over 22 DOF + 3 root pseudo-axes; Dance = Drift preset in 110 BPM rhythm with constrained root. F2 will add SWIM, CLIMB, JUMP, SLEEP, plus episodic Bio/Fyzio actions over idle. |
| 10 | IK | 2-bone IK: drag a target, the selected limb follows. |
| 11 | Swim | Horizontal body (root rotation), three styles: front crawl, backstroke, breaststroke. |
| 12 | Climb | Ladder climbing, 4-limb cycle, root moves upward. |

## Architecture

Strict layering — each layer is allowed to import only from the layers below it.

```
src/model/      MODEL — pure data + math, no Three.js
  Joint.js          hierarchy node (DOF, limits, signs, angles)
  Skeleton.js       proportions, hierarchy, FK, CoM, support points, snapToFloor
  Pose.js           snapshot of joint angles (capture / apply / lerp)
  Mat4.js           4x4 matrix (column-major, custom)
  IK.js             two-bone IK (solveTwoBoneIK)

src/view/       VIEW — Three.js rendering of the model
  StickmanView.js   THREE.Group hierarchy, bones, joints, head, CoM/support markers

src/scene/      SCENE — shared environment
  BasicScene.js     renderer, camera, OrbitControls, lights, shadows, floor, pause

src/util/       UTILITIES — pure functions, no Three.js
  Geometry.js       distXZ, distPointToSegmentXZ, convexHullXZ, pointInConvexPolygonXZ
  DemoUI.js         addSlider, addToggle, addButtonGroup, injectStyles
  Neklid.js         applyNeklid — global overlay of per-axis sin oscillations
  Palette.js        named color palette (CoM, support, gravity, body markers, …)

src/library/    POSE LIBRARY — defined once, imported everywhere
  Poses.js          stand, tpose, sit, squat, wave, oneLegL/R, lunge, leanForward, ...

demos/          one HTML page per demo
```

The model layer never imports from view or scene. The view never imports from scene. Utilities and the pose library never import from view.

## Tech stack

- **Three.js r170** via an import map — no npm, no bundler.
- **ES modules** in `src/` (relative imports like `from '../src/...'`).
- **Vanilla JS + HTML** in demos. No frameworks.
- **Python 3** for the dev server (`http.server`).

## Key conventions

A few non-obvious decisions worth knowing before reading the code:

- **The figure faces -Z.** Right hand = +X, left hand = -X, forward = -Z. The camera defaults to +Z (it sees the face).
- **Anatomical angles + per-axis signs.** `Joint.angles` are anatomical (positive = natural direction: flexion, abduction outward). `Joint.signs.{x,y,z}` (±1) translate to Three.js rotations. Defined once in `Skeleton._build()` so demos stay readable: `setAngle('elbowL', 'x', 90)` means a 90° bend, no magic signs at the call site.
- **Three.js r155+ physically correct lights.** Light intensities are in physical units (lumens/candela). Old values (0.5–1.5) render very dark. `BasicScene` uses `AmbientLight 1.5` and `DirectionalLight 3.5`.
- **Forward kinematics is cached.** After changing angles, `joint.worldPosition` is stale until `skel.computeWorldTransforms()` runs. `getCenterOfMass()` and `getJointWorldPosition()` call it internally.
- **`Pose.apply()` resets the root.** `apply()` calls `skeleton.reset()`, which clears `rootPosition` and `rootRotation`. Set those *after* `pose.apply()`, not before.
- **Pose interpolation is angle-only.** `Pose.lerp` interpolates joint angles and `rootPosition` / `rootRotation` linearly. Support points are not part of `Pose` — `Skeleton.getSupportPoints` derives them from the geometry on demand.

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — full set of project conventions, gotchas, and extension points. Read before adding a new joint, demo, or layer.
- [`GLOSSARY.md`](./GLOSSARY.md) — project terms (anatomy, kinematics, animation, architecture). Single source of truth for joint names, DOF, IK, CoM, support polygon, Pose, Status, layers.

## License

[MIT](./LICENSE) — © 2026 mrklas69.
