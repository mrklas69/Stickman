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

- [~] **Vrstva `src/character/`** — prototyp hotový (Sezení 5), rozšířený v Sezení 8, 9 a 10:
  - [x] `Status.js` — enum (13 stavů, 9 implementovaných: STAND, SIT, WALK, RUN, LAY, CRAWL, PRONE, SNEAK, JUMP)
  - [~] `Animations.js` — STAND (s idle/Drift), SIT, WALK, RUN (Jog/Sprint), LAY, CRAWL (po čtyřech, dog-trot), PRONE (plížení, asymetrický 4-fázový cyklus), SNEAK (přikrčená/kachní chůze), JUMP (vertical/long/running presety) hotové; chybí SWIM, CLIMB, SLEEP. DANCE = preset Status.STAND idle (ne separátní animace)
  - [x] `Stickman.js` — wrapper s `setStatus`, `setParams`, `animate(dt)` + plynulé přechody (cubic ease-out, default 0.4 s); shallow-copy params (Sezení 9 — F3-akvárium safe)
  - [x] `Gestures.js` (Sezení 10) — Bio/Fyzio overlay s Poissonovým schedulerem; 7 gest (armsAkimbo, armsFolded, armsBehindHead, scratchHead, stretch, weightShiftLeft, weightShiftRight); diagonální struktura keyframes s root deltou
- [x] **F2.1 Sezení 8 — Drift + Run + Neklid + Dance preset:**
  - [x] `animateRun` + `RUN_PRESETS` (jog tempo 1.6 / sprint tempo 2.4) — větší stepAmp, kneeLift, forwardLean, ohnutý loket běžce. Sprint kalibrován: forwardLean 30°, kneeLift 150° (knee drive)
  - [x] `animateStand` rozšířen o Drift (= budget-based random walk, spec z IDEAS.md): lazy state v `params._drift`, quint ease-out per cyklus, root rotace v poolu s `rootRange = 90°` (plný drift)
  - [x] **Dance jako preset**, ne animace: `setStatus(STAND, { idle: true, fraction: 0.5, cycleDuration: 60/110, rootRange: 8 })` = drift v rytmu, omezený root pro stabilitu
  - [x] **Neklid jako globální overlay** v `src/util/Neklid.js`: sin oscilace per-osa s deterministickou frekvencí (hash z `joint.axis`), level 0–10 → max 5° per kloub / 4° root. Aplikuje se PO `Stickman.animate` v render loopu, funguje pro VŠECHNY režimy
  - [x] **Bug fix** v procedurálních animacích: `animateWalk/Run` volají `skeleton.reset()` na začátku — bez něj by úhly z předchozí animace (např. Driftu, který nastaví všech 22 os) přetrvávaly v ne-přepsaných osách napořád
  - [x] `demo02_stresstest.html` přepsán podle vzoru Demo 01: 3-column layout, levý panel POSES (Reset/Dance/Drift) + STATUS (Walk/Jog/Sprint), pravý panel jen sekce „Globální → Neklid". Debug overlay (CoM/gravity/body/tooltip) vždy ON
- [ ] **Pose library expansion** v `src/library/Poses.js`: SIT1..5, JUMP_PREP/AIR/LAND, SLEEP
  - LAY varianty (`layStarfish`, `layChill`, `laySide`, `layReader`, `layRecline`) už existují z F1 — přidat do `Animations.LAY` přes `params.variant`
- [x] **Bio/Fyzio episodické akce** *(Sezení 10 — implementováno jako overlay s Poisson scheduler v `Gestures.js`, NE state machine. 7 gest hotovo.)*
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

### F2.3 Sezení 10 — Bio/Fyzio + JUMP + treadmill + plížení rewrite — **HOTOVO**

- [x] **`src/character/Gestures.js`** — globální overlay diskrétních gest (Bio/Fyzio) s Poisson scheduler. 7 gest: armsAkimbo, armsFolded, armsBehindHead, scratchHead, stretch, weightShiftLeft, weightShiftRight. Diagonální keyframes (REACH/PULL/PASSIVE) + root delta podpora pro celotělové motion (úklon u weightShift). Auto-trigger přes lambda slider 0–0.5/s + manuální buttons.
- [x] **`Status.JUMP`** — `animateJump` s 5 fázemi (PREP → PUSH → AIR → LAND → RECOVER). 3 presety: vertical (high arc), long/žabák (low arc + forward lean + scissor=0), running (krátký prep + scissor nohy + kontralaterální paže). Snap-to-floor skip během AIR fáze přes `params._airborne`.
- [x] **Šachovnicová podlaha** — `BasicScene.makeCheckerTexture()` (CanvasTexture, 2j dlaždice, 67% opacity). Floor zvětšen 40×40 → 80×80, shadow bounds ±12 → ±30.
- [x] **Treadmill v demo02** — postava centrovaná, podlaha posouvá texture offset opačně k pohybu. Algoritmus: identifikuj all supports → max history → použij Z deltu jako body velocity. Manual override `params.forwardSpeed` pro JUMP (kde foot tracking nedává smysl).
- [x] **Rename `Neklid.js` → `Fidget.js`** — globální izomorfismus názvů AJ. Doménový pojem „Neklid" zachován v UI labelech a komentářích. Refs aktualizované v Gestures.js, Breathing.js, Animations.js, demo02.
- [x] **PRONE (plížení) rewrite** — z Bezier-through-MID na asymetrický 4-fázový cyklus per noha (REACH → PUSH → PASSIVE → drag). Diagonální párování s pažemi (L paže s P nohou, P paže s L nohou). Vyžaduje další ladění (viz F2.4).
- [x] **`@THINK` Demo03 + Demo04 plán** — pose linking (PoseSequence: distance metric + locomotion picker) + interakce (Interactable: approachPose + usePose + IK pin). Zapsáno do IDEAS.md jako roadmap pro F3 a dál.

### F2.4 Plížení polish — **otevřené**

PRONE rewrite v Sezení 10 dal nohy do dobrého stavu, ale:
- [ ] **Paže lifting body** — shoulder.x angles tlačí lokte do podlahy → snap-to-floor zvedá celou postavu. Potřeba přepočítat keyframes pro body rotation -87°: shoulder.x ~170° (= rotace přes vrch do flat-forward), nikoli 60-75° (= mířící do podlahy).
- [ ] **Floor scroll wrong direction** — current algoritmus (longest history) selhává v plížení: PASSIVE leg ankle drží history forever s |dz|≈0, případně active joint má opačnou Z motion než očekáváno. Potřebuje smarter selection: hybrid history + max |dz|, NEBO sign flip pro plížení.
- [ ] **Spine C-curve + pelvis rotation** (per uživatelská reference v `c:\TEMP\Plížení\`): spine bends laterally (torso.z) opačně podle stojné nohy; pelvis rotuje vpřed k flexed knee (rootRotation.y nebo torso twist). Hlava counter-rotation. Zatím staticky drženo.

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

### F2.5 Sezení 11 — Demo03 Pose linker — **HOTOVO**

Štaflový postup ve 5 fázích, šestá (extrakce do PoseSequence třídy) odložena.

- [x] **Stage 1** — `Stickman.linkTo({x, z})` + `worldPos` field; demo03_linker.html (klik → walk konst. 1.5 j/s, bez turn-to)
- [x] **Stage 2** — turn-to phase: `worldYaw` field + shortest-path normalize do (-180°, 180°]; postava se otočí k cíli za 0.4 s, pak teprve WALK
- [x] **Stage 2.5** — rychlost dynamicky z foot trackingu (= identický algoritmus s treadmillem v demo02), žádné magic numbers; reset support state v `setStatus`
- [x] **Stage 3** — locomotion picker `_pickLocomotion(d)`: `< 5 j` WALK, `< 15 j` Jog, `≥ 15 j` Sprint; `_pendingLocomotion` field předá vybraný status z linkTo do post-turn-to dispatch
- [x] **Stage 4** — 3 anchors A/B/C: persistentní žluté markery + sprite labely (CanvasTexture s strokem) + tlačítka v levém panelu; click do podlahy = ad-hoc target; Reset polohy
- [x] **Stage 5** — cílová pose: `linkTo({ x, z, then })` přijímá `then = { status, params }`; `_onArrival` field; B → Sit, C → Lay anchors

### F2.6 Sezení 11 — Demo04 Interakce s objekty (židle + postel) — **HOTOVO** (2 z 2 stages)

- [x] **Stage 1 — Židle.** `src/world/Chair.js` factory + `Stickman.linkTo` extension `finalYaw` (post-arrival turn-to) + `arrivePosition` (lerp pelvisu z approach na cíl synchronně s post-turn-to). Demo s tlačítkem „Posaď se", post-turn-to + plynulý posun pelvisu na sedátko. Empirické změření výšky pelvisu v SIT pose = `H × 0.176` (předchozí odhad 36 % byl 2× off).
- [x] **Stage 2 — Postel.** `src/world/Bed.js` factory (matrace + headboard, výška identicky s židlí). 2-stage interakce řízená externím schedulerem v demu. `demos/demo04_interactables.html` sjednocuje židli + postel.

### F2.7 Sezení 12 — PoseSequence refactor — **HOTOVO**

Extrakce link logiky ze Stickmana do skladatelné třídy. Hybrid API (builder venku, step array uvnitř). Plynulý sit→lay v posteli místo teleportu.

- [x] **`src/character/PoseSequence.js`** — nová třída ~340 LOC. 4 primitives: `linkTo({x,z,finalYaw?,arrivePosition?})`, `setStatus(status, params)`, `wait(seconds)`, `transitionTo({worldPos?,worldYaw?,status?,params?,duration})`. Builder API (chainable, vrací `this`); step array uvnitř (= F3 Brain může skládat sekvence programaticky). `run()` připojí seq jako `stickman._activeSeq` a abortuje předchozí. `tick(dt)` má smyčku — chained instant steps proběhnou v 1 frame (eliminuje 2-frame delay mezi „arrival" a „setStatus(SIT)").
- [x] **Stickman cleanup** — z 478 → ~245 LOC. Odstraněny: `linkTo`, `_pickLocomotion`, 11 link fields, ~280 LOC link logiky v `animate()`. Zachovány: `worldPos`/`worldYaw` (zdroj pravdy), foot tracking jako public `computeBodyForwardSpeed()` (rename z `_computeFootDz`). Přidáno: `_activeSeq` hookup v `animate()` + `isMoving` getter.
- [x] **demo03_linker přepsán** — `goTo(x, z, arriveStatus)` přes `new PoseSequence(s).linkTo({x,z}).setStatus(arriveStatus).run()`. Reset polohy: `seq.abort()` místo přepisování fields. `stickman.isMoving` místo poking `target`/`turning`.
- [x] **demo04_interactables přepsán** — externí `bedStep` scheduler smazán. Postel = jedna builder sekvence: `linkTo → setStatus(SIT) → wait(0.5) → transitionTo({worldPos: layCenter, status: LAY, duration: 0.6})`. **Plynulý lerp pelvisu z okraje na střed synchronně s SIT→LAY pose blendem** = hlavní novinka oproti dnešnímu teleportu.

### F2.8 Rotation order fix — **otevřené (side-quest)**

- [ ] Změna `Skeleton.computeWorldTransforms` z `T·Rx·Ry·Rz` na `T·Rz·Ry·Rx` (= apply order X→Y→Z). Vyžaduje audit: pose definice (layBack, prone, sit), Drift overlay, Inspector slidery, dema 01-04. Po fixu odstranit workaround `facing: 0` v `Bed.js`.

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
