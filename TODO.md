# TODO — Stickman

Aktivní úkoly. Hotové se přesouvají do `DONE.md`.

## Druhá iterace dem — plán fází

Cílový stav: **3 finální stránky** (Inspector statický, Stress test dynamický, Akvárium emergent). Aktuálních 14 dem se postupně sloučí. Plná pádová fyzika je daleko (F4).

### F1 — Inspector (statický)

Sloučí dema 01+02+03+05+07 do jedné stránky. Root **fixní** v prostoru (jen y-slider + snap toggle pro zachování demo07 funkce).

- [ ] **GLOSSARY.md** — založit. Sekce: Anatomie (klouby, kosti, strany, směry), Kinematika (DOF, FK, IK, CoM, support polygon, anatomický úhel + sign), Animace (Pose, Pose.lerp, **Status**, **Animate**), Architektura (vrstvy, naming dem)
- [ ] **`src/view/DebugView.js`** — modul s vrstvami:
  - CoM marker (zelený, depthTest:false)
  - Support polygon (linie)
  - Gravity vector (žlutá šipka z CoM dolů)
  - Contact points (žluté tečky na podlaze)
  - **Crash test markery na hlavě** (žluto-černé soustředné disky, default ON, geometrie ne textura — front + side-L + side-R)
  - **DOF tooltip L1** (raycaster pro výběr kloubu → HTML panel: jméno, DOF axes, limits, signs, current angle)
  - Toggle pro každou vrstvu zvlášť
- [ ] **`demos/demo01_inspector.html`** — nový soubor:
  - Levý panel: pose presety (z `library/Poses`)
  - Pravý panel: select kloubu → DOF tooltip + slidery
  - Spodní panel: debug toggles
  - Slider y root + snap toggle
- [ ] Smazat `demos/demo01_static.html`, `demo02_poses.html`, `demo03_dof.html`, `demo05_com.html`, `demo07_snap.html`
- [ ] Aktualizovat `index.html` rozcestník + `README.md` tabulku dem

### F2 — Stress test (dynamický unifikovaný)

Sjednotí dynamická dema (04+09+11+12+13) přes nový `Stickman` model se `status` atributem a `animate(dt)` metodou.

- [ ] **Vrstva `src/character/`** — nová:
  - `Stickman.js` — wrapper `{ skeleton, status, animate(dt), render hook }`
  - `Status.js` — enum: STAND, SIT, WALK, RUN, SWIM, CLIMB, JUMP, LAY, SLEEP, DANCE
  - `Animations.js` — registr `Status → animace` (Pose.lerp keyframes nebo procedurální cykly)
- [ ] **Pose library expansion** v `src/library/Poses.js`: SIT1..5, RUN cycle, JUMP_PREP/AIR/LAND, LAY, SLEEP, DANCE_*
- [ ] **`demos/demo02_stresstest.html`** — sjednoceno: status switcher + animation play; plynulý přechod mezi stavy přes Pose.lerp; náhodné varianty SIT (SIT1..5)
- [ ] Smazat `demos/demo04_animation.html`, `demo09_walk.html`, `demo11_swim.html`, `demo12_climb.html`, `demo13_ikwalk.html`
- [ ] Aktualizovat `index.html` + `README.md`

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
