// src/character/Brain.js
// =============================================================================
// Brain = per-Stickman state scheduler pro F3 Biosféra.
//
// Koncept: každá postava má vlastní Brain instance. Brain drží timer; po jeho
// vypršení vybere weighted-random nový status z Markov matice (= závisí na
// aktuálním statusu) a aplikuje ho přes Stickman.setStatus nebo PoseSequence.
//
// === Stage rozkrojení ===
//   Stage 1 (S13)  — třída + Markov matice + tick() stub. NENÍ aktivní v demu.
//   Stage 2 (S14?) — tick() volaný, náhodný status bez PoseSequence (= postava
//                    se zastaví/sedne/lehne, bez chůze).
//   Stage 3 (S14?) — WALK volby vyrobí PoseSequence.linkTo(random pos).
//   Stage 4 (S15?) — N postav paralelně + vizuální varianty (zdraví/štěstí
//                    jako barvy přes StickmanView).
//
// === Markov matice ===
// Přepis: aktuální status → array { status, params?, weight }.
// Weighted random výběr, pravděpodobnost = weight / sum(weights).
// Stabilita postavy: vyšší weight pro „pokračovat v aktuálním" = postavy
// nepřeskakují každých pár sekund mezi režimy.
//
// === Timer ===
// Per-instance. Po setStatus se resetuje na uniform(minDuration, maxDuration)
// sekund. Default 3-10 s = postava drží status řádově desítky framů.
// =============================================================================

import { Status }       from './Status.js';
import { PoseSequence } from './PoseSequence.js';

// Default Markov matice. Zatím konzervativní — STAND je hub (nejvíc cest dovnitř
// i ven), aktivní statusy se vrací přes STAND. Nedefinované statusy (RUN, JUMP,
// CRAWL, PRONE, SNEAK, SWIM, CLIMB, SLEEP) zatím Brain negeneruje.
//
// Stage 3+ rozšíří o WALK destination (= linkTo random pos uvnitř biosféry)
// a o specializované sekvence (= „Postava si jde sednout na konkrétní židli").
export const DEFAULT_MARKOV = Object.freeze({
    [Status.STAND]: [
        { status: Status.STAND, params: { idle: true }, weight: 3 },   // Drift idle
        { status: Status.WALK,                          weight: 4 },
        { status: Status.SIT,                           weight: 2 },
        { status: Status.LAY,                           weight: 1 },
    ],
    [Status.WALK]: [
        { status: Status.STAND, weight: 5 },     // Walk se obvykle vrátí do STAND
        { status: Status.WALK,  weight: 2 },     // občas pokračuje
    ],
    [Status.SIT]: [
        { status: Status.STAND, weight: 6 },     // Po SIT se postaví
        { status: Status.SIT,   weight: 4 },     // občas pokračuje sedět
    ],
    [Status.LAY]: [
        { status: Status.STAND, weight: 6 },
        { status: Status.LAY,   weight: 4 },
    ],
});

const DEFAULTS = Object.freeze({
    minDuration:    3,    // s — minimální doba držení statusu
    maxDuration:   10,    // s — maximální doba držení statusu
    active:     false,    // Stage 1: Brain neaktivní (stub)
});

export class Brain {
    /**
     * @param {Stickman} stickman      — postava, kterou Brain řídí
     * @param {object}  [opts]
     * @param {object}  [opts.markov]  — Markov matice (default DEFAULT_MARKOV)
     * @param {number}  [opts.minDuration=3]
     * @param {number}  [opts.maxDuration=10]
     * @param {boolean} [opts.active=false] — pokud false, tick() je no-op
     * @param {object}  [opts.world]   — biosphere reference (pro linkTo limity)
     * @param {object}  [opts.objects] — { chairs: [...], beds: [...] } pro
     *                                    target-driven volby (sit on chair, lay in bed)
     */
    constructor(stickman, opts = {}) {
        this.stickman = stickman;
        this.markov   = opts.markov      ?? DEFAULT_MARKOV;
        this.minDur   = opts.minDuration ?? DEFAULTS.minDuration;
        this.maxDur   = opts.maxDuration ?? DEFAULTS.maxDuration;
        this.active   = opts.active      ?? DEFAULTS.active;
        this.world    = opts.world       ?? null;
        this.objects  = opts.objects     ?? { chairs: [], beds: [] };

        // Timer = kolik sekund zbývá do dalšího rozhodnutí.
        // Inicializovaný na random[min..max] aby N postav nesynchronizovalo.
        this.timer = this._randomDuration();

        // Stage 3 — tracking aktivní PoseSequence. Brain nerozhoduje, dokud seq
        // neskončí (= postava nedojde k cíli). Po skončení timer reset = postava
        // si „odpočine" než další rozhodnutí.
        this._wasInSeq = false;

        // Stage 3.5 — rezervace objektu (= chair/bed). Brain drží referenci na
        // držený objekt; při dispatchi nastaví `obj.occupant = stickman`, při
        // detekci „postava vstala" (= status už není SIT/LAY) uvolní lock.
        this._heldObject = null;
    }

    /**
     * Posune timer o `dt` sekund. Po vypršení vybere nový status.
     *
     * Stage 1: `active=false` → no-op.
     * Stage 3: pokud Stickman drží aktivní PoseSequence (= chodí někam),
     *          Brain počká na její dokončení. Žádná Brain decision uprostřed
     *          chůze, žádné aborty.
     */
    tick(dt) {
        if (!this.active) return;

        // Detekce aktivní sekvence — Brain pause během chůze.
        const seq       = this.stickman._activeSeq;
        const seqActive = seq && !seq.isDone();

        // Detekce uvolnění držené židle/postele:
        //   - musí mít _heldObject
        //   - postava NESMÍ být v SIT/LAY (= ještě sedí/leží na objektu)
        //   - sekvence NESMÍ být aktivní (= postava jde k objektu, status WALK)
        // Pokud je seqActive nebo SIT/LAY, postava je „engaged" → držíme lock.
        if (this._heldObject && !seqActive) {
            const inSeat = this.stickman.status === Status.SIT ||
                           this.stickman.status === Status.LAY;
            if (!inSeat) {
                this._heldObject.occupant = null;
                this._heldObject = null;
            }
        }
        if (seqActive) {
            this._wasInSeq = true;
            return;
        }
        if (this._wasInSeq) {
            // Sekvence právě dokončena → reset timer („odpočinek" před další volbou).
            this.timer = this._randomDuration();
            this._wasInSeq = false;
            return;
        }

        this.timer -= dt;
        if (this.timer > 0) return;

        // Timer expired → zvol nový status a aplikuj.
        const chosen = this._chooseNextStatus();
        if (!chosen) return;

        // Dispatch podle status + target — všechny PoseSequence varianty mají
        // velký timer (30 s), Brain pause-uje na _activeSeq a po doběhu sezení
        // uplyne _wasInSeq větev (= reset timer).
        const target = chosen.params?.target;

        // Cílení na chair/bed: pokud žádný volný, fallback na random walk
        // (= postava přejde, Brain za chvíli zkusí znovu).
        let dispatched = false;
        if (chosen.status === Status.SIT && target === 'chair' && this.objects.chairs.length > 0) {
            dispatched = this._goSitInChair();
        } else if (chosen.status === Status.LAY && target === 'bed' && this.objects.beds.length > 0) {
            dispatched = this._goLayInBed();
        }

        if (dispatched) {
            this.timer = 30;
        } else if (chosen.status === Status.WALK && this.world) {
            // Random WALK na náhodnou pozici uvnitř biosféry.
            this._goRandomWalk();
            this.timer = 30;
        } else if (target === 'chair' || target === 'bed') {
            // Cíl byl obsazený → fallback random walk.
            this._goRandomWalk();
            this.timer = 30;
        } else {
            // Fallback: status bez target → setStatus rovnou (= sed/leh „kde jsem").
            this.stickman.setStatus(chosen.status, chosen.params ?? {});
            this.timer = this._randomDuration();
        }
    }

    /**
     * Vyrobí PoseSequence pro „jdi si sednout na neobsazenou židli".
     * Pokud žádná židle volná, fallback na random walk.
     * Reusne logiku demo04 (linkTo + finalYaw + arrivePosition + setStatus(SIT)).
     *
     * @returns {boolean} true = sequence spuštěna; false = fallback potřeba
     */
    _goSitInChair() {
        const free = this.objects.chairs.filter((c) => !c.occupant);
        if (free.length === 0) return false;

        const chair = free[Math.floor(Math.random() * free.length)];
        chair.occupant   = this.stickman;
        this._heldObject = chair;

        new PoseSequence(this.stickman)
            .linkTo({
                x:              chair.approach.x,
                z:              chair.approach.z,
                finalYaw:       chair.sitYaw,
                arrivePosition: chair.position,
            })
            .setStatus(Status.SIT)
            .run();
        return true;
    }

    /**
     * Vyrobí PoseSequence pro „jdi si lehnout do neobsazené postele".
     * Pokud žádná postel volná, fallback na random walk.
     * 3-stage sekvence: linkTo k okraji → SIT → wait → transitionTo(LAY) na střed.
     *
     * @returns {boolean} true = sequence spuštěna; false = fallback potřeba
     */
    _goLayInBed() {
        const free = this.objects.beds.filter((b) => !b.occupant);
        if (free.length === 0) return false;

        const bed = free[Math.floor(Math.random() * free.length)];
        bed.occupant     = this.stickman;
        this._heldObject = bed;

        new PoseSequence(this.stickman)
            .linkTo({
                x:              bed.sitEdge.approach.x,
                z:              bed.sitEdge.approach.z,
                finalYaw:       bed.sitEdge.yaw,
                arrivePosition: { x: bed.sitEdge.x, z: bed.sitEdge.z },
            })
            .setStatus(Status.SIT)
            .wait(0.5)
            .transitionTo({
                worldPos: { x: bed.layCenter.x, z: bed.layCenter.z },
                worldYaw: bed.layCenter.yaw,
                status:   Status.LAY,
                duration: 0.6,
            })
            .run();
        return true;
    }

    /**
     * Fallback: random walk uvnitř biosféry. Volá se, když cílový objekt je
     * obsazený a Brain nemá kam si jít sednout/lehnout.
     */
    _goRandomWalk() {
        const dest = this._randomDestination();
        new PoseSequence(this.stickman)
            .linkTo({ x: dest.x, z: dest.z })
            .setStatus(Status.STAND, {})
            .run();
    }

    /**
     * Vybere weighted-random option z Markov matice podle aktuálního statusu.
     * Vrací objekt {status, params?, weight} nebo null pokud žádné options.
     */
    _chooseNextStatus() {
        const current = this.stickman.status;
        const options = this.markov[current];
        if (!options || options.length === 0) return null;

        // Sum weights → vyber random ∈ [0, sum) → najdi „bin" který obsahuje.
        const sum = options.reduce((acc, o) => acc + o.weight, 0);
        let pick   = Math.random() * sum;
        let chosen = options[0];
        for (const o of options) {
            pick -= o.weight;
            if (pick <= 0) { chosen = o; break; }
        }
        return chosen;
    }

    /**
     * Uniform random pos uvnitř `world.innerRadius` kruhu (= biosféra minus margin).
     * Použito pro WALK destinaci. Algoritmus: r = sqrt(rand) × R, θ = uniform 2π.
     * (sqrt na r kompenzuje 2D area distribution — bez něj by se body koncentrovaly
     * blízko středu kruhu.)
     */
    _randomDestination() {
        const R  = this.world.innerRadius;
        const r  = Math.sqrt(Math.random()) * R;
        const th = Math.random() * Math.PI * 2;
        return {
            x: this.world.position.x + r * Math.cos(th),
            z: this.world.position.z + r * Math.sin(th),
        };
    }

    /** Uniform random ∈ [minDur, maxDur]. */
    _randomDuration() {
        return this.minDur + Math.random() * (this.maxDur - this.minDur);
    }
}
