// src/character/Gestures.js
// =============================================================================
// Gestures = globální overlay diskrétních gest (Bio/Fyzio). Sourozenec Fidgetu
// a Dýchání, ale s identitou: každé gesto je rozpoznatelné, časově ohraničené
// (1–3 s), spouštěné Poissonovým procesem v klidových stavech postavy.
//
// Princip:
//   - Registr `GESTURES` — pose-based keyframes (`{ at, angles }`),
//     interpolované smoothstepem mezi sousedními keyframes.
//   - Scheduler — exp. inter-arrival (= Poisson process). Při triggeru filtruje
//     gesta podle `precondition(skel, status, params)` a vybere uniform.
//   - Aktivní gesto **přepíše** vlastní klouby (absolutní setAngle); ostatní
//     primárka (Drift, SIT pose) řídí dál.
//   - Gesto se přeruší při změně Status (např. user pustí Walk během gesta) —
//     Pose.capture v setStatus zachytí aktuální gesture-modified pose, takže
//     transition plynule odveze ruce z peak pozice do nové animace.
//
// Použití:
//   const state = createGestureState();
//   scene.onUpdate((dt) => {
//       globalTime += dt;
//       stickman.animate(dt);
//       applyBreathing(skel, globalTime, breathingLevel);
//       applyGestures(skel, globalTime, state, bioLambda, stickman);
//       applyFidget(skel, globalTime, fidgetLevel);   // PO gestu = jemné chvění
//       skel.snapToFloor(FLOOR_Y);
//   });
// =============================================================================

import { Status } from './Status.js';

// === Lokální matematika ======================================================

/** Smoothstep: f(0)=0, f(1)=1, f'(0)=f'(1)=0. Žádné trhnutí na keyframe hranách. */
function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Interpoluje mezi dvěma keyframes per-joint per-axis. Klouby/osy uvedené
 * jen v jednom keyframe se rozšíří na druhý jako 0 (rest pro tu osu) →
 * první keyframe `{}` znamená „startuj z restu", poslední `{}` „konči v restu".
 */
function lerpKeyframes(a, b, t) {
    const out = {};
    const joints = new Set([...Object.keys(a.angles), ...Object.keys(b.angles)]);
    for (const j of joints) {
        const ax = a.angles[j] || {};
        const bx = b.angles[j] || {};
        const axes = new Set([...Object.keys(ax), ...Object.keys(bx)]);
        const merged = {};
        for (const axis of axes) {
            merged[axis] = lerp(ax[axis] ?? 0, bx[axis] ?? 0, t);
        }
        out[j] = merged;
    }
    return out;
}

/**
 * Interpoluje root deltu mezi dvěma keyframes. `root: { rx, ry, rz, px, py, pz }`
 * je volitelný, všechny složky default 0. Vrací jen klíče, které jsou nenulové
 * v alespoň jednom keyframu (= úspora cyklu při aplikaci).
 *
 * Sémantika: hodnoty jsou ADITIVNÍ DELTA k tomu, co primárka (Drift / pose)
 * nastavila do skeleton.rootRotation/Position. Drift dál točí, gesto přidá
 * 10° tilt na top.
 */
function lerpRoot(a, b, t) {
    const ar = a.root || {};
    const br = b.root || {};
    const out = {};
    const keys = ['rx', 'ry', 'rz', 'px', 'py', 'pz'];
    for (const k of keys) {
        const av = ar[k] ?? 0;
        const bv = br[k] ?? 0;
        if (av !== 0 || bv !== 0) {
            out[k] = lerp(av, bv, t);
        }
    }
    return out;
}

/**
 * Najde dva sousední keyframes obklopující phase ∈ [0,1] a vrátí je
 * s lokálním parametrem [0,1] mezi nimi.
 */
function pickKeyframes(keyframes, phase) {
    for (let i = 0; i < keyframes.length - 1; i++) {
        const a = keyframes[i];
        const b = keyframes[i + 1];
        if (phase >= a.at && phase <= b.at) {
            const localT = (phase - a.at) / (b.at - a.at);
            return { a, b, t: localT };
        }
    }
    const last = keyframes[keyframes.length - 1];
    return { a: last, b: last, t: 0 };
}

/**
 * Inverse-CDF sampling Exponentiálního rozdělení s rate λ → inter-arrival
 * čas v sekundách. `1 - Math.random()` vyloučí Math.random()=0 (nekonečné t).
 */
function expInterArrival(lambda) {
    const u = 1 - Math.random();
    return -Math.log(u) / lambda;
}

// === Registr gest ===========================================================
// Každé gesto:
//   - `name` — identifikátor (debug + cílené spouštění)
//   - `duration` — celková délka v sekundách
//   - `joints` — dokumentační (kód čte jen `keyframes`)
//   - `keyframes` — pole `{ at: 0..1, angles: { joint: { axis: deg } } }`,
//     prázdné `angles: {}` = rest pro všechny joints listed v jiných keyframes
//   - `precondition(skel, status, params)` — bool filtr před triggerem
//
// Pravidlo: keyframes začíná at:0 + končí at:1, oboje s `angles: {}` (rest) →
// clean entry/exit, žádný skok při startu nebo konci gesta.

export const GESTURES = Object.freeze({
    armsAkimbo: {
        name: 'armsAkimbo',
        duration: 2.5,
        joints: ['shoulderL', 'shoulderR', 'elbowL', 'elbowR'],
        keyframes: [
            // 0.0 — clean entry z restu
            { at: 0.0, angles: {} },
            // 0.30 — peak: ruce nahoru a do strany (abdukce 35°), lokty ohnuté
            // tak, že předloktí míří k bokům. shoulder.x mírně dopředu (ramena
            // vystrčená).
            { at: 0.30, angles: {
                shoulderL: { x: 5, z: 35 },
                shoulderR: { x: 5, z: 35 },
                elbowL:    { x: 110 },
                elbowR:    { x: 110 },
            }},
            // 0.75 — hold (statická peak, „postoj")
            { at: 0.75, angles: {
                shoulderL: { x: 5, z: 35 },
                shoulderR: { x: 5, z: 35 },
                elbowL:    { x: 110 },
                elbowR:    { x: 110 },
            }},
            // 1.0 — clean exit do restu
            { at: 1.0, angles: {} },
        ],
        precondition: (skel, status) => status === Status.STAND,
    },

    armsFolded: {
        name: 'armsFolded',
        duration: 3.0,
        joints: ['shoulderL', 'shoulderR', 'elbowL', 'elbowR'],
        keyframes: [
            { at: 0.0, angles: {} },
            // 0.35 — peak: paže předpažené (~60°), vnitřní rotace (předloktí
            // jde napříč hrudníkem), lokty silně ohnuté (~135°). Výsledek:
            // předloktí přes břicho/hrudník překřížené.
            { at: 0.35, angles: {
                shoulderL: { x: 60, y: -30, z: 5 },
                shoulderR: { x: 60, y: -30, z: 5 },
                elbowL:    { x: 135 },
                elbowR:    { x: 135 },
            }},
            { at: 0.80, angles: {
                shoulderL: { x: 60, y: -30, z: 5 },
                shoulderR: { x: 60, y: -30, z: 5 },
                elbowL:    { x: 135 },
                elbowR:    { x: 135 },
            }},
            { at: 1.0, angles: {} },
        ],
        precondition: (skel, status) => status === Status.STAND,
    },

    armsBehindHead: {
        name: 'armsBehindHead',
        duration: 3.0,
        joints: ['shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'neck'],
        keyframes: [
            { at: 0.0, angles: {} },
            // 0.35 — peak: lokty široko (abdukce 90°), vnější rotace ramene
            // (předloktí míří nahoru), silný ohyb lokte (~135°) → dlaně na
            // týlu. Krk mírně do záklonu.
            { at: 0.35, angles: {
                shoulderL: { x: 0, y: 80, z: 90 },
                shoulderR: { x: 0, y: 80, z: 90 },
                elbowL:    { x: 135 },
                elbowR:    { x: 135 },
                neck:      { x: -10 },
            }},
            { at: 0.80, angles: {
                shoulderL: { x: 0, y: 80, z: 90 },
                shoulderR: { x: 0, y: 80, z: 90 },
                elbowL:    { x: 135 },
                elbowR:    { x: 135 },
                neck:      { x: -10 },
            }},
            { at: 1.0, angles: {} },
        ],
        precondition: (skel, status) => status === Status.STAND,
    },

    scratchHead: {
        name: 'scratchHead',
        duration: 2.0,
        joints: ['shoulderR', 'elbowR', 'neck'],
        keyframes: [
            { at: 0.0, angles: {} },
            // 0.30 — peak: pravá paže jde k pravé straně hlavy. shoulder.z
            // velká abdukce (loket nahoru), shoulder.y vnitřní rotace (paže
            // se otáčí dovnitř), elbow silně ohnutý (~145°) = ruka u hlavy.
            { at: 0.30, angles: {
                shoulderR: { x: -10, y: -45, z: 90 },
                elbowR:    { x: 145 },
                neck:      { x: -5, z: 5 },
            }},
            { at: 0.75, angles: {
                shoulderR: { x: -10, y: -45, z: 90 },
                elbowR:    { x: 145 },
                neck:      { x: -5, z: 5 },
            }},
            { at: 1.0, angles: {} },
        ],
        precondition: (skel, status) => status === Status.STAND,
    },

    weightShiftLeft: {
        name: 'weightShiftLeft',
        duration: 3.7,
        joints: ['hipR', 'kneeR', 'torso'],
        keyframes: [
            // 0.0 — entry: postava stojí (jakákoli idle pose).
            { at: 0.0, angles: {} },
            // 0.30 — peak baseline: trup úklon vlevo nad stojnou levou nohu
            // (CoM přesun přes úklon, BEZ pelvis translace), pravá noha relax:
            // mírná flexe v kyčli + ohyb kolena (aproximace heel-up; ankle
            // v modelu žádné DOF). Amplitudy laděné na ⅓ — diskrétní fidget.
            { at: 0.30, angles: {
                hipR:  { x: 2 },
                kneeR: { x: 12 },
                torso: { z: 2 },
            }},
            // 0.50 — sway forward: uvolněná noha se mírně houpe dopředu.
            { at: 0.50, angles: {
                hipR:  { x: 5 },
                kneeR: { x: 12 },
                torso: { z: 2 },
            }},
            // 0.70 — sway back.
            { at: 0.70, angles: {
                hipR:  { x: -2 },
                kneeR: { x: 12 },
                torso: { z: 2 },
            }},
            // 0.90 — návrat na baseline (krátký dohyb před release).
            { at: 0.90, angles: {
                hipR:  { x: 2 },
                kneeR: { x: 12 },
                torso: { z: 2 },
            }},
            { at: 1.0, angles: {} },
        ],
        precondition: (skel, status) => status === Status.STAND,
    },

    weightShiftRight: {
        name: 'weightShiftRight',
        duration: 3.7,
        joints: ['hipL', 'kneeL', 'torso'],
        keyframes: [
            { at: 0.0, angles: {} },
            // Zrcadlo: trup úklon vpravo nad stojnou pravou nohu, levá noha
            // relax (kyčel + koleno) + sway dopředu/vzad během holdu.
            { at: 0.30, angles: {
                hipL:  { x: 2 },
                kneeL: { x: 12 },
                torso: { z: -2 },
            }},
            { at: 0.50, angles: {
                hipL:  { x: 5 },
                kneeL: { x: 12 },
                torso: { z: -2 },
            }},
            { at: 0.70, angles: {
                hipL:  { x: -2 },
                kneeL: { x: 12 },
                torso: { z: -2 },
            }},
            { at: 0.90, angles: {
                hipL:  { x: 2 },
                kneeL: { x: 12 },
                torso: { z: -2 },
            }},
            { at: 1.0, angles: {} },
        ],
        precondition: (skel, status) => status === Status.STAND,
    },

    stretch: {
        name: 'stretch',
        duration: 3.5,
        joints: ['shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'torso', 'neck'],
        keyframes: [
            { at: 0.0, angles: {} },
            // 0.40 — peak: paže do V (full flexe x=180 + abdukce z=30 → paže
            // šikmo nad hlavu, rozevřené do stran). Mírný záklon trupu + krku,
            // lokte rovné (= protažení, ne ohyb).
            { at: 0.40, angles: {
                shoulderL: { x: 180, z: 30 },
                shoulderR: { x: 180, z: 30 },
                elbowL:    { x: 0 },
                elbowR:    { x: 0 },
                torso:     { x: -10 },
                neck:      { x: -15 },
            }},
            { at: 0.75, angles: {
                shoulderL: { x: 180, z: 30 },
                shoulderR: { x: 180, z: 30 },
                elbowL:    { x: 0 },
                elbowR:    { x: 0 },
                torso:     { x: -10 },
                neck:      { x: -15 },
            }},
            { at: 1.0, angles: {} },
        ],
        precondition: (skel, status) => status === Status.STAND,
    },
});

// === State + lifecycle ======================================================

/**
 * Per-Stickman stav scheduleru (gesto runs serial, jeden v daný čas).
 *
 *   - `active` — { name, gesture, startTime, statusAtStart, duration } | null
 *   - `nextAt` — globální čas příštího Poisson eventu (lazy-init při prvním volání)
 *   - `scheduled` — flag pro lazy init nextAt
 */
export function createGestureState() {
    return {
        active: null,
        nextAt: 0,
        scheduled: false,
    };
}

/**
 * „Postava v klidu" filtr — Poisson trigger se spustí JEN když je true.
 * Aktuálně:
 *   - STAND s idle režimem (Drift / Dance preset)
 *   - SIT
 *   - žádný aktivní setStatus přechod (krátký 0.4 s blend nepočítá)
 *
 * Walk/Run/Crawl/Prone/Sneak/Lay/Sleep nejsou klid → gesta nesvitne.
 */
function isResting(stickman) {
    if (stickman.transitionFrom !== null) return false;
    if (stickman.status === Status.SIT) return true;
    if (stickman.status === Status.STAND && stickman.params.idle) return true;
    return false;
}

/**
 * Manuální spuštění gesta podle jména (UI tlačítko). Bypass Poisson + bypass
 * isResting. Status v okamžiku triggeru se uloží do `statusAtStart` → změna
 * Status během gesta = abort (ladný handover do nové animace přes blend).
 */
export function triggerGesture(stickman, globalTime, state, gestureName) {
    const gesture = GESTURES[gestureName];
    if (!gesture) return;
    state.active = {
        name: gesture.name,
        gesture,
        startTime: globalTime,
        statusAtStart: stickman.status,
        duration: gesture.duration,
    };
}

/**
 * Aplikuje gesto v dané fázi: vyber 2 sousední keyframes, lerp se smoothstepem
 * mezi nimi, setAngle pro vyjmenované klouby/osy. Gesto **přepisuje** své
 * klouby (absolutní setAngle) — Drift / pose-based primárka v ostatních
 * kloubech pokračuje bez kolize.
 */
function playGesture(skeleton, gesture, phase) {
    const clamped = Math.max(0, Math.min(1, phase));
    const { a, b, t } = pickKeyframes(gesture.keyframes, clamped);
    const eased = smoothstep(t);

    // === Joints — absolute setAngle (přepíše primárku na ovládaných osách)
    const blended = lerpKeyframes(a, b, eased);
    for (const jointName of Object.keys(blended)) {
        const axes = blended[jointName];
        for (const axis of Object.keys(axes)) {
            skeleton.setAngle(jointName, axis, axes[axis]);
        }
    }

    // === Root — additivní delta (Drift / primárka rotuje pelvis dál,
    // gesto přidá tilt / posun na top). Po skončení gesta delta = 0
    // (clean exit keyframe) → primárka beze změny.
    const root = lerpRoot(a, b, eased);
    if (root.rx) skeleton.rootRotation.x += root.rx;
    if (root.ry) skeleton.rootRotation.y += root.ry;
    if (root.rz) skeleton.rootRotation.z += root.rz;
    if (root.px) skeleton.rootPosition.x += root.px;
    if (root.py) skeleton.rootPosition.y += root.py;
    if (root.pz) skeleton.rootPosition.z += root.pz;
}

/**
 * Hlavní entry point. Volat každý frame PO Stickman.animate().
 *
 *   - Aktivní gesto: pokračuj v lerpu, abort při změně Status,
 *     ukonči po dosažení phase=1.
 *   - Bez aktivního: počkej na Poisson, pak filtruj precondition + uniform pick.
 *
 * @param {Skeleton} skeleton
 * @param {number} globalTime - kontinuální čas v sekundách
 * @param {object} state - viz createGestureState
 * @param {number} lambda - Poisson rate (gest/s); 0 = vypnuto
 * @param {Stickman} stickman - pro status + params + transitionFrom
 */
export function applyGestures(skeleton, globalTime, state, lambda, stickman) {
    // --- Aktivní gesto -------------------------------------------------------
    if (state.active) {
        // Status se změnil (user klikl Walk apod.) → abort. Pose.capture v
        // setStatus už zachytil aktuální gesture-modified pose, takže nová
        // animace plynule odveze ruce z peak pozice.
        if (state.active.statusAtStart !== stickman.status) {
            state.active = null;
            state.nextAt = lambda > 0 ? globalTime + expInterArrival(lambda) : Infinity;
            return;
        }

        const phase = (globalTime - state.active.startTime) / state.active.duration;

        if (phase >= 1) {
            state.active = null;
            state.nextAt = lambda > 0 ? globalTime + expInterArrival(lambda) : Infinity;
            return;
        }

        playGesture(skeleton, state.active.gesture, phase);
        return;
    }

    // --- Scheduler (Poisson) -------------------------------------------------
    if (lambda <= 0) {
        // Lambda = 0 → vyčisti scheduling, ať po znovuzapnutí start od čisté
        // exp inter-arrival (ne nakumulovaná „dluhová" pauza).
        state.scheduled = false;
        return;
    }

    // Lazy init nextAt (= nepředpokládáme, kdy konstruktor stavu byl volán)
    if (!state.scheduled) {
        state.nextAt = globalTime + expInterArrival(lambda);
        state.scheduled = true;
        return;
    }

    if (globalTime < state.nextAt) return;

    // Poisson event nastal — přeplánuj další BEZ ohledu na úspěch (= time-
    // homogenní proces; pokus může „minout" kvůli precondition).
    state.nextAt = globalTime + expInterArrival(lambda);

    if (!isResting(stickman)) return;

    const candidates = Object.values(GESTURES).filter(g =>
        g.precondition(skeleton, stickman.status, stickman.params)
    );
    if (candidates.length === 0) return;

    const gesture = candidates[Math.floor(Math.random() * candidates.length)];
    state.active = {
        name: gesture.name,
        gesture,
        startTime: globalTime,
        statusAtStart: stickman.status,
        duration: gesture.duration,
    };
    playGesture(skeleton, gesture, 0);
}
