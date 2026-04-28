# DONE — Stickman

Hotové úkoly z `TODO.md`. Detaily v příslušných diary záznamech.

## 2026-04-28

- **Hero GIF z demo09 walk** → `assets/hero-walk.gif` (145 KB, 640×400, 15 fps, ~4 s loop). Aktivní v `README.md` pod tagline. Detaily v `docs/diary/2026-04-28.md` (Sezení 2).
- **GitHub Pages live** → <https://mrklas69.github.io/Stickman/>. Source: Deploy from a branch (`main` / root). Odkaz doplněn do `README.md` pod hero GIF.
- **F1 Inspector hotová** (Sezení 4) — DebugView (5 vrstev), demo01_inspector (poses + slidery + transitions + Copy JSON), GLOSSARY.md, hi-tech paleta, 6 lehových pos. Detaily v Sezení 4.
- **Skeleton změny** (Sezení 4): neck.y twist (DOF 14→15), torso.x záklon -30°, elbow 170°, shoulder.z 120°, UPPER_ARM/FOREARM přerozděleno (0.18 / 0.215).
- **Sjednocení joint = support** (Sezení 4 / F1.5) — supportPoints field deprecated, joints jsou supports automaticky, dynamic contact body. Joint sféry barva PAL.support.
- **F2 prototyp — vrstva `src/character/`** (Sezení 5) — Status enum (10 stavů), Animations registr (STAND/SIT/WALK/LAY hotové), Stickman wrapper s `setStatus/setParams/animate(dt)` + plynulé přechody (Pose.lerp blend, cubic ease-out, default 0.4 s). Demo `demo02_stresstest.html` se 4 tlačítky stavů a slidery WALK parametrů. Detaily v Sezení 5.
