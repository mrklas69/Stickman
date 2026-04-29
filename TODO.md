# TODO — Stickman

Aktivní úkoly. Hotové se přesouvají do `DONE.md`.

## Druhá iterace dem — plán fází

Cílový stav: **3 finální stránky** (Inspector statický, Stress test dynamický, Akvárium emergent). Aktuálních 5 dem se postupně sloučí. Plná pádová fyzika je daleko (F4).

### F1 — Inspector (statický) — **HOTOVO** (Sezení 4–7)

Sloučí dema 01+02+03+05+07 do jedné stránky. Iterace uzavřena v Sezení 7 (29. 4. 2026): 20 propracovaných pose ve 3 sekcích (POSTOJE 6, SEDY/KLEKY 8, LEHY 6), 22 DOF, slidery proporcí odstraněny po nalezení sweet spotu, sekce „Ostatní" odstraněna z UI.

- [x] **GLOSSARY.md** — založeno (anatomie, kinematika, animace, architektura)
- [x] **`src/view/DebugView.js`** — vrstvy: CoM, support polygon, gravity arrow, body markery (nos+anáhata), hover tooltip
- [x] **`demos/demo01_inspector.html`** — Reset/Random + sekce LEHY a Ostatní; všechny slidery (DOF + root pos/rot); pose transitions; Copy JSON; tooltipy + dvojklik reset
- [x] **`src/util/Palette.js`** — hi-tech paleta (CoM turquoise, support magenta-pink, body markery gold)
- [x] **Skeleton změny:** neck.y twist DOF (totalDOF 14→15), torso.x záklon -30°, elbow 170°, shoulder.z 120°, UPPER_ARM/FOREARM přerozděleno (0.18 / 0.215)
- [x] **6 lehových pos** (`LIE_POSES`): layBack, layStarfish, layChill, laySide, layReader, layRecline
- [x] **F1.5 Sjednocení joint = support** — supportPoints field deprecated (legacy getter), joints jsou supports automaticky, contact body se počítají dynamicky (Y ≤ min + tol). Sféry kloubů barva PAL.support.
- [x] **F1.6 Sezení 6 — Inspector dotažený:**
  - Support overlay smazán z DebugView (joint = support visualně přes barvu sfér; contact body interní pro `isStable`).
  - Sekce `POSTOJE` + `SEDY/KLEKY` + `LEHY` v levém panelu (`STANCE_POSES`, `SIT_POSES`, `LIE_POSES`).
  - 8 nových sed/klek pose: `sit` (Sed na židli — přepsán), `sitCross` (Turek), `sitLegsForward` (Dlouhý sed), `sitTuck` (Skrčený sed), `sitKneel` (Klek), `sitChild` (Dětský klek), `cat` (Kočka), `sitSide` (Polosed na boku). `laySide` doladěn (kolena symetrická).
  - **DOF rozšíření**: `hipL/R.y` (vnější/vnitřní rotace stehna, [-35, 50]) + `shoulderL/R.y` (axiální rotace paže, [-100, 90]). totalDOF 15 → 19.
  - **Limity rozšířené**: `kneeL/R.x.max` 130 → 165 (pata k zadku pro klek); `hipL/R.z.max` 60 → 80 (lotus, široký turek); `torso.z.max` 20 → 30 (lateral flexe).
  - **Random** přepíná i `rootRotation` (všechny 3 osy ±180°).
  - **Live slider proporcí** v Inspectoru (`Skeleton.setProportions` + `StickmanView.rebuildBones`): 6 multiplier sliderů (lumbar, hrudník, biceps, předloktí, stehno, lýtko, 0.5×–1.5×). *(Sezení 7: slidery odstraněny po nalezení sweet spotu — viz F1.7.)*
  - Favicon fix `<link rel="icon" href="data:,">` (prevence 404).
- [x] **F1.7 Sezení 7 — uzavření iterace 01:**
  - Refresh proporcí v `buildProportions`: biceps & předloktí × 0.95 (UPPER_ARM 0.180→0.171, FOREARM 0.215→0.204), stehno & lýtko × 1.05 (THIGH/SHIN 0.245→0.257). Lumbar a hrudník beze změny.
  - 6 nových postojů v `STANCE_POSES`: `bow` (Klanění), `arabesque` (Arabeska), `stretch` (Protažení), `crow` (Vrána), `bridge` (Most), `headstand` (Stoj na hlavě). Pořadí podle yoga progression (stoje → balanc → inverze).
  - `STANCE_POSES` přepsán: primitivní pose (stand/tpose/wave/squat) odstraněny, zůstávají v BASIC_POSES pro ostatní dema.
  - Sekce „Ostatní" odstraněna z Inspectoru (kapalasana/pincha mají vlastní demo14).
  - Slidery „Proporce" odstraněny z Inspectoru.
- [x] Smazat `demos/demo01_static.html`, `demo02_poses.html`, `demo03_playground.html`, `demo05_com.html`, `demo07_snap.html` *(Sezení 7 — Inspector je plně pokrývá)*
- [x] Aktualizovat `index.html` rozcestník + popis demo01

### F2 — Stress test (dynamický unifikovaný)

Sjednotí dynamická dema (04+09+11+12+13) přes nový `Stickman` model se `status` atributem a `animate(dt)` metodou.

- [~] **Vrstva `src/character/`** — prototyp hotový (Sezení 5), rozšířený v Sezení 8 a 9:
  - [x] `Status.js` — enum (13 stavů, 8 implementovaných: STAND, SIT, WALK, RUN, LAY, CRAWL, PRONE, SNEAK)
  - [~] `Animations.js` — STAND (s idle/Drift), SIT, WALK, RUN (Jog/Sprint), LAY, CRAWL (po čtyřech, dog-trot), PRONE (plížení, Bezier-through-MID), SNEAK (přikrčená/kachní chůze) hotové; chybí SWIM, CLIMB, JUMP, SLEEP. DANCE = preset Status.STAND idle (ne separátní animace)
  - [x] `Stickman.js` — wrapper s `setStatus`, `setParams`, `animate(dt)` + plynulé přechody (cubic ease-out, default 0.4 s); shallow-copy params (Sezení 9 — F3-akvárium safe)
- [x] **F2.1 Sezení 8 — Drift + Run + Neklid + Dance preset:**
  - [x] `animateRun` + `RUN_PRESETS` (jog tempo 1.6 / sprint tempo 2.4) — větší stepAmp, kneeLift, forwardLean, ohnutý loket běžce. Sprint kalibrován: forwardLean 30°, kneeLift 150° (knee drive)
  - [x] `animateStand` rozšířen o Drift (= budget-based random walk, spec z IDEAS.md): lazy state v `params._drift`, quint ease-out per cyklus, root rotace v poolu s `rootRange = 90°` (plný drift)
  - [x] **Dance jako preset**, ne animace: `setStatus(STAND, { idle: true, fraction: 0.5, cycleDuration: 60/110, rootRange: 8 })` = drift v rytmu, omezený root pro stabilitu
  - [x] **Neklid jako globální overlay** v `src/util/Neklid.js`: sin oscilace per-osa s deterministickou frekvencí (hash z `joint.axis`), level 0–10 → max 5° per kloub / 4° root. Aplikuje se PO `Stickman.animate` v render loopu, funguje pro VŠECHNY režimy
  - [x] **Bug fix** v procedurálních animacích: `animateWalk/Run` volají `skeleton.reset()` na začátku — bez něj by úhly z předchozí animace (např. Driftu, který nastaví všech 22 os) přetrvávaly v ne-přepsaných osách napořád
  - [x] `demo02_stresstest.html` přepsán podle vzoru Demo 01: 3-column layout, levý panel POSES (Reset/Dance/Drift) + STATUS (Walk/Jog/Sprint), pravý panel jen sekce „Globální → Neklid". Debug overlay (CoM/gravity/body/tooltip) vždy ON
- [ ] **Pose library expansion** v `src/library/Poses.js`: SIT1..5, JUMP_PREP/AIR/LAND, SLEEP
  - LAY varianty (`layStarfish`, `layChill`, `laySide`, `layReader`, `layRecline`) už existují z F1 — přidat do `Animations.LAY` přes `params.variant`
- [ ] **Bio/Fyzio episodické akce** (drbání, prohrábnutí vlasů, weight shift, založené ruce) — state machine nad STAND idle; viz IDEAS.md
- [~] Smazat stará dema *(jejich logika je / bude pohlcena v Inspector / Stress test / Animations.js)*:
  - [x] `demos/demo04_animation.html` *(Sezení 9 — sin/cos cykly pohlcené Drift + WALK + RUN v Animations.js)*
  - [x] `demos/demo06_stability.html` *(Sezení 9 — stability indikátor pohlcený v Inspectoru přes `colorByStability` na CoM markeru)*
  - [x] `demos/demo09_walk.html` *(Sezení 9 — chůze plně reprodukovaná v Animations.js animateWalk + demo02 Walk tlačítkem)*
  - [ ] `demos/demo11_swim.html` *(až po SWIM v Animations.js)*
  - [ ] `demos/demo12_climb.html` *(až po CLIMB v Animations.js)*
  - [x] `demos/demo13_ikwalk.html` *(Sezení 9 — IK chůze v0.2 odložena, F2 jde cestou procedurální WALK/RUN bez IK)*
  - [x] `demos/demo14_headsupport.html` *(Sezení 9 — kapalasana/pincha exporty zachovány v Poses.js pro budoucí use)*
  - [x] `demos/demo08_lerp.html` *(Sezení 9 — Pose.lerp je dostatečně demonstrovaný v Inspector pose transitions a Drift cyklu)*
- [ ] Aktualizovat `index.html` + `README.md` (až po dokončení F2)

### F2.2 Sezení 9 — synchronizace + audit + 3 nové statusy + Neklid/Drift přepis — **HOTOVO**

- [x] **Globální memory + PROMPTS.md** zrekonstruovány z PocketStory/TheCubes/Voidspan referencí
- [x] **`@AUDIT:CODE`** — DOF count `19→22` napříč 7 souborů, mrtvé API smazáno (`setProportions` + `rebuildBones`), shallow-copy params, stale komentáře
- [x] **`@AUDIT:DOCS`** — Pose ≠ supportPoints na 4 místech, duplikovaný GLOSSARY header, stale STANCE_POSES, číselné chyby, Crash markery → Body markery
- [x] **6 dem smazáno** — 04, 06, 08, 09, 13, 14 (zbylo: 01, 02, 10, 11, 12)
- [x] **Neklid přepsán** — vrch těla jen, bez rootRotation/hipů/kolen/twist os; memory `feedback_neklid_anatomical_scope.md`
- [x] **Drift přepsán** — `lerp toward random P2` (parametr `fraction` = jemnost driftu)
- [x] **WALK** — twist+sway na polovinu (8→4, 4→2)
- [x] **Dýchání overlay** v `src/util/Breathing.js` — torso.x ±3°, neck.x ±1.5° při level=10
- [x] **`Status.CRAWL`** — po čtyřech, dog-trot, narovnaná záda, tempo 0.47, hlava nahoru
- [x] **`Status.PRONE`** — plížení, kvadratický Bezier přes user-authored MID, hadí undulation + contralateral live wiggle, pelvis bobs ~0.7 j v transitions
- [x] **`Status.SNEAK`** — přikrčená kachní chůze, hipBase 80 + kneeBase 110 (pelvis 57% výchozí výšky)
- [x] **Limit rozšíření** — neck.x `[-30, 60] → [-60, 60]`, hipL/R.z max `80 → 90`
- [x] **`@END`** rozšířen o krok 4 „Permission cleanup" (konsolidace settings.json wildcardů)

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
