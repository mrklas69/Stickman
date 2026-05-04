// src/character/PoseSequence.js
// =============================================================================
// PoseSequence = skladatelná sekvence akcí pro postavu (= „skript pohybu").
//
// Builder API venku, step array uvnitř (= F3 Brain může vyrábět sekvence
// programaticky bez fluent řetězců).
//
// Primitives:
//   - linkTo({ x, z, finalYaw?, arrivePosition? }) = přemístění s lokomocí
//     (= turn-to → walk/run + optional post-arrival turn-to s pos lerp)
//   - setStatus(status, params) = synchronní přepnutí (instant)
//   - wait(seconds) = pauza
//   - transitionTo({ worldPos?, worldYaw?, status?, params?, duration }) =
//     plynulý lerp pos+yaw paralelně se setStatus pose transition
//
// Aktivní sekvence = `stickman._activeSeq`. Každý frame Stickman.animate
// volá `seq.tick(dt)`. Nová `seq.run()` aborts předchozí.
//
// === Vrstvení ===
// PoseSequence zná Stickman + Status + Animations. Stickman PoseSequence
// nezná (= jen drží opaque `_activeSeq` field a tickne ho).
// =============================================================================

import { Status }                                  from './Status.js';
import { ANIMATIONS, DEFAULTS_WALK, RUN_PRESETS }  from './Animations.js';

// Cubic ease-out — rychlý start, měkký dojezd. Stejné jako v Stickman.animate
// pro vizuální konzistenci přechodů. Lokální kopie (vrstvení: PoseSequence
// nemá důvod importovat helper z Stickmana).
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * Shortest-path normalize: map d do (-180°, 180°].
 * Fungovalo by `((d % 360) + 540) % 360 - 180` i pro záporná d (% v JS
 * může vrátit záporný výsledek pro záporné operandy → přičteme 540
 * pro garantovanou kladnost před druhým modulo).
 */
function shortestYawDiff(targetYaw, fromYaw) {
    return ((targetYaw - fromYaw) % 360 + 540) % 360 - 180;
}

// Kdy se „dotkneme" cíle v linkTo. 0.3 j ≈ 4 % výšky postavy = pelvis na
// dosah cíle. YAGNI — žádný klient zatím tolerance neměnil.
const ARRIVAL_TOL = 0.3;

// Délka turn-to fáze (pre-locomotion + post-arrival). Stejné default jako
// stickman.transitionDuration = 0.4 (pose blend) → vizuálně synchronní.
const TURN_DURATION = 0.4;

export class PoseSequence {
    /**
     * @param {Stickman} stickman - postava, kterou sekvence řídí
     */
    constructor(stickman) {
        this.stickman = stickman;
        // Pole step objektů { type, ...args }. F3 Brain může pole skládat
        // přímo (bez fluent buildru) přes konstruktor `fromSteps`.
        this.steps = [];
        // Index aktuálního step, posouvá se v `_advance`.
        this.idx = 0;
        // Per-step state (turn-to elapsed, lerp from-pos atd.). null =
        // aktuální step ještě nezačal (= prvotní setup proběhne v tick).
        this._stepState = null;
        // Flag pro abort (= klient chce sekvenci zrušit, např. nový click).
        this.aborted = false;
    }

    // ========================================================================
    // Builder methods — všechny vrací `this` pro fluent skládání
    // ========================================================================

    /**
     * Přemístění postavy ke světovému bodu (x, z) s lokomocí.
     *
     * Fáze:
     *   1. Pre-walk turn-to (pokud diff ≥ 5°): postava se otočí k cíli.
     *   2. Walk/Jog/Sprint podle vzdálenosti (= `_pickLocomotion`).
     *   3. Post-arrival turn-to (pokud `finalYaw` zadán a diff ≥ 5°),
     *      synchronně s pos lerp z arrival pos na `arrivePosition`.
     *
     * @param {object} opts
     * @param {number} opts.x - world X cíle
     * @param {number} opts.z - world Z cíle
     * @param {number|null} [opts.finalYaw=null] - cílová orientace (°);
     *        liší-li se o ≥5°, postava udělá DRUHOU turn-to fázi po arrival.
     * @param {{x:number,z:number}|null} [opts.arrivePosition=null] -
     *        kam má pelvis přistát po arrival. Bez něj zůstane na (x, z).
     *        S `finalYaw` se lerpuje synchronně s post-turn-to (plynule);
     *        bez `finalYaw` se aplikuje teleportem.
     */
    linkTo({ x, z, finalYaw = null, arrivePosition = null } = {}) {
        this.steps.push({ type: 'linkTo', x, z, finalYaw, arrivePosition });
        return this;
    }

    /**
     * Synchronní přepnutí status (= instant). Použití mezi linkTo a
     * transitionTo pro „dorazil → posaď se → wait → lehni".
     */
    setStatus(status, params = {}) {
        this.steps.push({ type: 'setStatus', status, params });
        return this;
    }

    /**
     * Pauza v sekvenci (sekundy). Postava drží aktuální status — Drift,
     * dýchání, gestures fungují normálně.
     */
    wait(seconds) {
        this.steps.push({ type: 'wait', t: seconds });
        return this;
    }

    /**
     * Plynulý přechod pos+yaw+status za `duration` sekund.
     *
     * Pos+yaw lerp běží lineárně přes ease-out, pose transition (Stickman
     * setStatus blend) má vlastní `stickman.transitionDuration` (default
     * 0.4 s). Pokud `duration > stickman.transitionDuration`, pose změna
     * doběhne dřív než pos lerp — postava si „lehne na místě, pak doplaže
     * pelvisem na střed" (viz postel sit→lay).
     *
     * @param {object} opts
     * @param {{x:number,z:number}|null} [opts.worldPos=null] - cílová poloha
     * @param {number|null} [opts.worldYaw=null] - cílová orientace (°)
     * @param {string|null} [opts.status=null] - cílový status (volitelné)
     * @param {object} [opts.params={}] - parametry status animace
     * @param {number} [opts.duration=0.4] - délka lerp v sekundách
     */
    transitionTo({
        worldPos = null, worldYaw = null,
        status = null, params = {}, duration = 0.4,
    } = {}) {
        this.steps.push({
            type: 'transitionTo',
            worldPos, worldYaw, status, params, duration,
        });
        return this;
    }

    // ========================================================================
    // Spuštění + řízení
    // ========================================================================

    /**
     * Připojí sekvenci ke Stickmanovi jako aktivní. Předchozí aktivní seq
     * se aborted (= klient klikl nový cíl uprostřed cesty → zruš starou,
     * spusť novou).
     *
     * @returns {PoseSequence} this — pro vzor `new PoseSequence(s)…run()`
     */
    run() {
        if (this.stickman._activeSeq && this.stickman._activeSeq !== this) {
            this.stickman._activeSeq.aborted = true;
        }
        this.stickman._activeSeq = this;
        return this;
    }

    /** Externí cancel (např. user klikne Reset). */
    abort() { this.aborted = true; }

    /** True = sekvence skončila (všechny stages dispatched nebo aborted). */
    isDone() { return this.aborted || this.idx >= this.steps.length; }

    /**
     * Posun na další step. Volá se interně po dokončení aktuálního.
     */
    _advance() {
        this.idx += 1;
        this._stepState = null;
    }

    // ========================================================================
    // Tick — volá Stickman.animate(dt) každý frame
    // ========================================================================

    /**
     * Vykoná dt-výsek aktuálního stepu. Při dokončení stepu posune index.
     * No-op při isDone (= obrana proti volání po aborted/finished).
     *
     * Loop: pokud step doběhne uvnitř tohoto frame (= idx se posunul),
     * zpracuj další step OKAMŽITĚ s dt = 0. Bez toho by byl 1–2 frame
     * delay mezi „arrival" a „setStatus(SIT)" (= postava chvíli „šlape
     * na místě" před sednutím). Steps, které sčítají čas (wait,
     * transitionTo, linkTo moving), break loop a čekají další frame.
     *
     * Safety counter brání patologické nekonečné rekurzi (v praxi max
     * ~4 chained steps: arrival → setStatus → setStatus → ...).
     */
    tick(dt) {
        let safety = 16;
        while (safety-- > 0) {
            if (this.isDone()) return;
            const step = this.steps[this.idx];
            const idxBefore = this.idx;
            switch (step.type) {
                case 'linkTo':       this._tickLinkTo(dt, step);       break;
                case 'setStatus':    this._tickSetStatus(step);        break;
                case 'wait':         this._tickWait(dt, step);         break;
                case 'transitionTo': this._tickTransitionTo(dt, step); break;
            }
            if (this.idx === idxBefore) break;   // step pokračuje, čekej další frame
            dt = 0;                              // další step ve stejném frame
        }
    }

    // === setStatus — synchronní, advance hned =================================

    _tickSetStatus(step) {
        this.stickman.setStatus(step.status, step.params);
        this._advance();
    }

    // === wait — sčítáme dt, advance při překročení ===========================

    _tickWait(dt, step) {
        if (this._stepState === null) this._stepState = { elapsed: 0 };
        this._stepState.elapsed += dt;
        if (this._stepState.elapsed >= step.t) this._advance();
    }

    // === linkTo — 4 fáze: turningPre → moving → arrival → turningPost ========

    _tickLinkTo(dt, step) {
        // Iniciální setup při prvním ticku stepu.
        if (this._stepState === null) {
            this._initLinkTo(step);
            return;     // dispatch dál v dalším frame (spravedlivý dt budget)
        }

        const s = this._stepState;
        if (s.phase === 'turningPre')  this._tickTurnPre(dt, step, s);
        else if (s.phase === 'moving') this._tickMoving(step, s);
        else if (s.phase === 'arrival')      this._tickArrival(step);
        else if (s.phase === 'turningPost')  this._tickTurnPost(dt, step, s);
    }

    /**
     * Vyhodnotí distance, vybere locomotion, rozhodne mezi „rovnou jdi"
     * a „nejdřív se otoč". Inicializuje `_stepState`.
     */
    _initLinkTo(step) {
        const dx = step.x - this.stickman.worldPos.x;
        const dz = step.z - this.stickman.worldPos.z;
        const dist = Math.hypot(dx, dz);

        // Už jsme v dosahu cíle — přeskoč walk, jdi rovnou do arrival
        // (= post-turn-to + arrivePosition, pokud zadané).
        if (dist < ARRIVAL_TOL) {
            this._stepState = { phase: 'arrival' };
            return;
        }

        // Cílový yaw: postava forward = -Z body. fwd(yaw) = (-sin, -cos)
        // (yaw=0 → -Z, yaw=90 → -X = doleva CCW shora). Chceme fwd =
        // (dx, dz)/|d| → yaw = atan2(-dx, -dz).
        const targetYaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
        const diff = shortestYawDiff(targetYaw, this.stickman.worldYaw);
        const locomotion = this._pickLocomotion(dist);
        const target = { x: step.x, z: step.z };

        if (Math.abs(diff) < 5) {
            // Dostatečně přesné — žádná turn-to fáze, jdi rovnou.
            this.stickman.setStatus(locomotion.status, locomotion.params);
            this._stepState = { phase: 'moving', target };
        } else {
            // Pre-walk turn-to: postava stojí a otáčí se.
            this.stickman.setStatus(Status.STAND, {});
            this._stepState = {
                phase:        'turningPre',
                turnFrom:     this.stickman.worldYaw,
                turnTo:       this.stickman.worldYaw + diff,
                turnElapsed:  0,
                locomotion,
                target,
            };
        }
    }

    /**
     * Vybere lokomoční preset podle vzdálenosti k cíli.
     *  < 5  j → WALK
     *  < 15 j → Jog
     *  ≥ 15 j → Sprint
     */
    _pickLocomotion(distance) {
        if (distance < 5)
            return { status: Status.WALK, params: { ...DEFAULTS_WALK } };
        if (distance < 15)
            return { status: Status.RUN,  params: { ...RUN_PRESETS.jog } };
        return     { status: Status.RUN,  params: { ...RUN_PRESETS.sprint } };
    }

    /** Pre-walk turn-to: lerp worldYaw, po dokončení setStatus(locomotion). */
    _tickTurnPre(dt, step, s) {
        s.turnElapsed += dt;
        const t = Math.min(s.turnElapsed / TURN_DURATION, 1);
        const eased = easeOutCubic(t);
        this.stickman.worldYaw = s.turnFrom + (s.turnTo - s.turnFrom) * eased;
        if (t >= 1) {
            this.stickman.setStatus(s.locomotion.status, s.locomotion.params);
            this._stepState = { phase: 'moving', target: s.target };
        }
    }

    /**
     * Moving fáze: foot tracking → posun worldPos. Při < ARRIVAL_TOL skok
     * do arrival fáze (= optional post-turn-to + arrivePosition).
     */
    _tickMoving(step, s) {
        const dz_body = this.stickman.computeBodyForwardSpeed();
        const ry = this.stickman.worldYaw * Math.PI / 180;
        // Forward × dz_body. dz_body > 0 = noha jde dozadu v body frame
        // (= postava jde kupředu) → world posun ve směru forward.
        this.stickman.worldPos.x += -Math.sin(ry) * dz_body;
        this.stickman.worldPos.z += -Math.cos(ry) * dz_body;

        const dx = s.target.x - this.stickman.worldPos.x;
        const dz = s.target.z - this.stickman.worldPos.z;
        if (Math.hypot(dx, dz) < ARRIVAL_TOL) {
            this._stepState = { phase: 'arrival' };
        }
    }

    /**
     * Arrival: zkontroluj finalYaw + arrivePosition.
     *  - Pokud finalYaw zadán a diff ≥ 5° → spusť post-turn-to (s lerp pos).
     *  - Jinak teleportuj arrivePosition (pokud zadán) a advance.
     */
    _tickArrival(step) {
        if (step.finalYaw !== null) {
            const yawDiff = shortestYawDiff(step.finalYaw, this.stickman.worldYaw);
            if (Math.abs(yawDiff) >= 5) {
                this.stickman.setStatus(Status.STAND, {});
                this._stepState = {
                    phase:        'turningPost',
                    turnFrom:     this.stickman.worldYaw,
                    turnTo:       this.stickman.worldYaw + yawDiff,
                    turnElapsed:  0,
                    arriveLerp:   step.arrivePosition !== null ? {
                        fromX: this.stickman.worldPos.x,
                        fromZ: this.stickman.worldPos.z,
                        toX:   step.arrivePosition.x,
                        toZ:   step.arrivePosition.z,
                    } : null,
                };
                return;
            }
        }
        // Žádný post-turn-to — apply arrivePosition teleportem (jeden frame).
        if (step.arrivePosition !== null) {
            this.stickman.worldPos.x = step.arrivePosition.x;
            this.stickman.worldPos.z = step.arrivePosition.z;
        }
        this._advance();
    }

    /**
     * Post-arrival turn-to: lerp yaw + (volitelně) pos synchronně.
     */
    _tickTurnPost(dt, step, s) {
        s.turnElapsed += dt;
        const t = Math.min(s.turnElapsed / TURN_DURATION, 1);
        const eased = easeOutCubic(t);
        this.stickman.worldYaw = s.turnFrom + (s.turnTo - s.turnFrom) * eased;
        if (s.arriveLerp) {
            const L = s.arriveLerp;
            this.stickman.worldPos.x = L.fromX + (L.toX - L.fromX) * eased;
            this.stickman.worldPos.z = L.fromZ + (L.toZ - L.fromZ) * eased;
        }
        if (t >= 1) this._advance();
    }

    // === transitionTo — paralelní lerp pos+yaw+pose ===========================

    _tickTransitionTo(dt, step) {
        if (this._stepState === null) {
            // Iniciální setup: zachyt aktuální pos+yaw, optional setStatus.
            this._stepState = {
                fromPosX: this.stickman.worldPos.x,
                fromPosZ: this.stickman.worldPos.z,
                fromYaw:  this.stickman.worldYaw,
                elapsed:  0,
            };
            if (step.status !== null) {
                this.stickman.setStatus(step.status, step.params);
            }
        }
        const s = this._stepState;
        s.elapsed += dt;
        const t = Math.min(s.elapsed / step.duration, 1);
        const eased = easeOutCubic(t);

        if (step.worldPos !== null) {
            this.stickman.worldPos.x =
                s.fromPosX + (step.worldPos.x - s.fromPosX) * eased;
            this.stickman.worldPos.z =
                s.fromPosZ + (step.worldPos.z - s.fromPosZ) * eased;
        }
        if (step.worldYaw !== null) {
            const yawDiff = shortestYawDiff(step.worldYaw, s.fromYaw);
            this.stickman.worldYaw = s.fromYaw + yawDiff * eased;
        }
        if (t >= 1) this._advance();
    }
}
