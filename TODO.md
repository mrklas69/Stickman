# TODO — Stickman

Aktivní úkoly. Hotové se přesouvají do `DONE.md`.

## Druhá iterace dem — plán fází

Cílový stav: **3 finální stránky** (Inspector statický, Stress test dynamický, Akvárium emergent). Aktuálních 14 dem se postupně sloučí. Plná pádová fyzika je daleko (F4).

### F1 — Inspector (statický) — **HOTOVO** (Sezení 4)

Sloučí dema 01+02+03+05+07 do jedné stránky. Root **fixní** v prostoru (jen y-slider + snap toggle pro zachování demo07 funkce).

- [x] **GLOSSARY.md** — založeno (anatomie, kinematika, animace, architektura)
- [x] **`src/view/DebugView.js`** — vrstvy: CoM, support polygon, gravity arrow, body markery (nos+anáhata), hover tooltip
- [x] **`demos/demo01_inspector.html`** — Reset/Random + sekce LEHY a Ostatní; všechny slidery (DOF + root pos/rot); pose transitions; Copy JSON; tooltipy + dvojklik reset
- [x] **`src/util/Palette.js`** — hi-tech paleta (CoM turquoise, support magenta-pink, body markery gold)
- [x] **Skeleton změny:** neck.y twist DOF (totalDOF 14→15), torso.x záklon -30°, elbow 170°, shoulder.z 120°, UPPER_ARM/FOREARM přerozděleno (0.18 / 0.215)
- [x] **8 lehových pos** (`LIE_POSES`): layBack, layStarfish, layChill, laySide, layReader, layRecline
- [x] **F1.5 Sjednocení joint = support** — supportPoints field deprecated (legacy getter), joints jsou supports automaticky, contact body se počítají dynamicky (Y ≤ min + tol). Sféry kloubů barva PAL.support.
- [ ] Smazat `demos/demo01_static.html`, `demo02_poses.html`, `demo03_dof.html`, `demo05_com.html`, `demo07_snap.html` *(až po F2 — některé mohou ještě sloužit jako reference)*
- [x] Aktualizovat `index.html` rozcestník + popis demo01

### F2 — Stress test (dynamický unifikovaný)

Sjednotí dynamická dema (04+09+11+12+13) přes nový `Stickman` model se `status` atributem a `animate(dt)` metodou.

- [~] **Vrstva `src/character/`** — prototyp hotový (Sezení 5):
  - [x] `Status.js` — enum (10 stavů, 4 implementované)
  - [~] `Animations.js` — STAND, SIT, WALK, LAY hotové; chybí RUN, SWIM, CLIMB, JUMP, SLEEP, DANCE
  - [x] `Stickman.js` — wrapper s `setStatus`, `setParams`, `animate(dt)` + plynulé přechody (cubic ease-out, default 0.4 s)
- [ ] **Pose library expansion** v `src/library/Poses.js`: SIT1..5, RUN cycle, JUMP_PREP/AIR/LAND, SLEEP, DANCE_*
  - LAY varianty (`layStarfish`, `layChill`, `laySide`, `layReader`, `layRecline`) už existují z F1 — přidat do `Animations.LAY` přes `params.variant`
- [~] **`demos/demo02_stresstest.html`** — prototyp hotový (Sezení 5): button group STAND/SIT/WALK/LAY + slidery WALK params + plynulé přechody. Chybí: další stavy, variant selector LAY, FPS / debug overlay.
- [ ] Smazat `demos/demo04_animation.html`, `demo09_walk.html`, `demo11_swim.html`, `demo12_climb.html`, `demo13_ikwalk.html` *(až po dokončení F2 — jejich logika musí být v `Animations.js`)*
- [ ] Aktualizovat `index.html` + `README.md` (až po dokončení F2)

### F3 — Akvárium

Multi-instance `Stickman` s "random brain" (state machine přepíná `status` v čase).

- [ ] **Multi-instance support** — buď v `Stickman` (více instancí, každá vlastní skeleton+view), nebo v nové `Aquarium` třídě
- [ ] **Brain.js** v `character/` — state machine s timery (idle 5s → walk 10s → sit 8s → ...). Markov-chain pravděpodobnosti
- [ ] **`demos/demo03_aquarium.html`** — N postav (3-5) chodí/sedí/leží/tančí v ohraničeném prostoru
- [ ] Kolize: jen s podlahou + stěnami (stickman↔stickman zatím vypustit)

### F4 — Plná pádová fyzika *(daleko, závisí na F1-F3)*

Když CoM mimo support polygon → postava padá. Rotace kolem nejbližší hrany support polygonu, dynamika `α = m·g·d / I`. Při dopadu nový support point, re-stabilizace.

- [ ] `src/character/Dynamics.js` — pivot edge detection, úhlová dynamika, re-stabilizace
- [ ] Integrace do `Stickman.animate(dt)` — fallback režim, když isStable false
- [ ] Aktualizovat `demo02_stresstest.html` — toggle „enable physics" pro pádové sekvence

### Renumber dem (až po F3)

Po dokončení F3 budou 3 dema. Renumber: `demo01_inspector` (statický), `demo02_stresstest` (dynamický), `demo03_aquarium` (emergent). Mezitím nepřečíslovávat (ušetří 2 zbytečné kroky).
