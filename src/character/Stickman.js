// src/character/Stickman.js
// =============================================================================
// Stickman = wrapper kolem Skeleton, který drží STAV (status) + BĚŽÍCÍ ČAS
// animace + AKTUÁLNÍ PARAMETRY animace + PLYNULÉ PŘECHODY mezi stavy.
//
// Vrstvení:
//   - Skeleton  (model/) = čistá data + matematika (FK, CoM, support, snap)
//   - Stickman  (character/) = chování v čase (status + animate + transitions)
//   - PoseSequence (character/) = skript pohybu (linkTo, transitionTo, …)
//   - Demo      = kompozice: scene + view + skeleton + stickman, řídí render loop
//
// Stickman NEDRŽÍ view ani scene — to je úmyslně. Demo kombinuje vrstvy podle
// potřeby (např. demo02 má 1 skeleton + 1 view, akvárium F3 má N skeletonů +
// N views + 1 scene). Stickman je čistá animace úhlů.
//
// === PŘECHODY MEZI STAVY ===
// setStatus() udělá Pose.capture aktuální kostry. Následující animate() během
// `transitionDuration` (default 0.4 s) blendují přes Pose.lerp z toho snapshotu
// do výstupu nové animace. Easing = cubic ease-out (rychlá reakce, měkký dojezd).
//
// === SVĚTOVÁ POLOHA + ORIENTACE ===
// Stickman vlastní `worldPos` + `worldYaw` jako jediný zdroj pravdy (pro to,
// kde postava JE ve světě — ne kam jde). Animace fn() volá skeleton.reset()
// = nuluje rootPosition + rootRotation každý frame. Stickman po fn() znovu
// zapíše worldPos.x/z + worldYaw → rootPosition.x/z + rootRotation.y. Takto
// jsou animace agnostické k „kam dojít".
//
// PoseSequence (a demo02 treadmill) tyto fields MUTUJE — Stickman je jen drží
// a každý frame propaguje do skeletonu.
// =============================================================================

import { Status }      from './Status.js';
import { ANIMATIONS }  from './Animations.js';
import { Pose }        from '../model/Pose.js';

/**
 * Cubic ease-out: rychlý start, pomalý dojezd. f(0)=0, f(1)=1, f'(1)=0.
 * Pro UX přechodů postavy lepší než lineární (mechanický pocit) a lepší
 * než ease-in-out (postava reaguje pomalu na příkaz).
 */
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

export class Stickman {
    /**
     * @param {Skeleton} skeleton - kostra, kterou Stickman ovládá
     * @param {string} [status=Status.STAND] - počáteční status
     * @param {object} [params={}] - počáteční parametry animace
     */
    constructor(skeleton, status = Status.STAND, params = {}) {
        this.skeleton = skeleton;
        this.status = status;
        // Shallow-copy: animace mutují params (Drift drží lazy `params._drift`
        // state). Bez kopie by N instancí Stickmana sdílejících jeden patch
        // literál (akvárium F3) sdílelo i drift state → vzájemná kontaminace.
        this.params = { ...params };
        // Čas od posledního setStatus() v sekundách. Reset při přepnutí stavu,
        // aby cyklické animace začaly od fáze 0 (= konzistentní start).
        this.time = 0;

        // === Transition state ===
        // Default 0.4 s — kompromis: dost rychlé, ať uživatel nečeká, dost
        // pomalé, ať se nepatlá. Lze přepsat zvenčí (s.transitionDuration = 0.6).
        this.transitionDuration = 0.4;
        // Pose snapshot na ZAČÁTKU přechodu (z čeho se interpoluje).
        // null = žádný aktivní přechod (= animace běží přímo).
        this.transitionFrom = null;
        // Uplynulý čas v aktivním přechodu (0 → transitionDuration).
        this.transitionElapsed = 0;

        // === Světová poloha + orientace (= zdroj pravdy) ========================
        // worldPos.x/z se zapisuje do skel.rootPosition.x/z na konci animate.
        // worldYaw se zapisuje do skel.rootRotation.y. Y a rotation.x/z
        // necháváme nedotčené (snap-to-floor + animace LAY/PRONE/SIT je řídí).
        this.worldPos = { x: 0, z: 0 };
        this.worldYaw = 0;            // ° (Three.js stupně; 0 = postava se dívá -Z)

        // === Aktivní PoseSequence ===============================================
        // Pokud nastaveno a !isDone, animate na konci tickne. PoseSequence
        // vlastní svou state, Stickman ji jen drží a tickuje.
        this._activeSeq = null;

        // === Foot tracking ======================================================
        // Per-instance state pro `computeBodyForwardSpeed()`. Reset při setStatus
        // (= změna stride patternu invaliduje historii). Public API protože
        // PoseSequence ho volá zvenku (= nepřidávám další obousměrnou závislost).
        this._support = {
            prev:        new Map(),    // name → body z (z prev frame)
            history:     new Map(),    // name → consecutive frame count
            lastBodyDz:  0,            // fallback při výpadku historie
        };
    }

    /**
     * Přepne status. Volitelně přepíše parametry. Spustí plynulý přechod
     * z AKTUÁLNĚ ZOBRAZENÉ pózy (Pose.capture v okamžiku volání) do nové
     * animace. Animační čas se resetuje (= cyklické animace začnou od fáze 0).
     *
     * Voláno uprostřed běžícího přechodu: snapshot zachytí MOMENTÁLNĚ blended
     * pózu (ne původní transitionFrom), takže přechod plynule pokračuje
     * z aktuálního stavu. Žádný "skok zpět".
     *
     * @param {string} status - nový Status (Status.WALK, Status.STAND, ...)
     * @param {object} [params={}] - parametry nové animace (přepíše current)
     */
    setStatus(status, params = {}) {
        // Zachytíme aktuální stav kostry (= z čeho se bude blendovat).
        // Pose.capture čte joint.angles + rootPosition + rootRotation.
        this.transitionFrom = Pose.capture(this.skeleton);
        this.transitionElapsed = 0;

        this.status = status;
        this.params = { ...params };       // viz konstruktor — drift state per instance
        this.time = 0;

        // Reset foot tracking: změna stavu = změna stride patternu (nebo
        // zastavení). Stará history je neplatná. lastBodyDz nech — kontinuita
        // pro extrapolation v případě prvního frame nového walku bez prev support.
        this._support.prev.clear();
        this._support.history.clear();
    }

    /**
     * True = postava má aktivní PoseSequence (linkTo/transitionTo běží).
     * Demo používá pro: skrýt target marker po dorazu, zakázat klikání
     * dalších cílů během cesty, atd.
     */
    get isMoving() {
        return this._activeSeq !== null && !this._activeSeq.isDone();
    }

    /**
     * Přepíše konkrétní parametry beze změny statusu nebo času.
     * Užitečné pro slidery — uživatel táhne 'tempo', animace pokračuje plynule.
     * Object.assign mutuje target a vrací ho — drží referenci, nevytváří novou.
     *
     * @param {object} patch - klíče, které se mají přepsat (ostatní zůstanou)
     */
    setParams(patch) {
        Object.assign(this.params, patch);
    }

    /**
     * Posune animaci o dt sekund. Vyhledá v ANIMATIONS funkci pro current
     * status a zavolá ji s (skeleton, time, params).
     *
     * Pokud je aktivní přechod (transitionFrom !== null), aplikuje cílovou
     * animaci, captures výsledek, lerpuje s transitionFrom přes ease-out,
     * a aplikuje blended pózu. Po vypršení transitionDuration se přechod ukončí.
     *
     * Pokud je aktivní PoseSequence, tickne ji PO animaci (= seq mutuje
     * worldPos/worldYaw, případně volá setStatus pro další step).
     *
     * Stavy bez registrované animace = no-op (postava zůstane v poslední pose).
     * Záměrné — Stickman nepadá na neimplementovaných stavech (zatím SWIM,
     * CLIMB, SLEEP, …).
     *
     * @param {number} dt - delta time v sekundách (typicky 1/60)
     */
    animate(dt) {
        this.time += dt;
        const fn = ANIMATIONS[this.status];
        if (fn) {
            if (this.transitionFrom !== null) {
                this.transitionElapsed += dt;
                // t = lineární progres v intervalu [0, 1], clamp na 1 (přetečení = konec)
                const t = Math.min(this.transitionElapsed / this.transitionDuration, 1);
                const eased = easeOutCubic(t);

                // 1) Aplikuj cílovou animaci (= mutuje skeleton na cílovou pózu)
                fn(this.skeleton, this.time, this.params);
                // 2) Zachyť cílovou pózu jako Pose objekt
                const target = Pose.capture(this.skeleton);
                // 3) Lerp z transitionFrom do target podle eased t (Pose.lerp
                //    interpoluje úhly lineárně, easing aplikujeme na parametr
                //    PŘED lerp)
                const blended = Pose.lerp(this.transitionFrom, target, eased);
                // 4) Aplikuj blended pózu na kostru (přepíše to, co fn() právě nastavila)
                blended.apply(this.skeleton);

                // Konec přechodu — uvolnit snapshot
                if (t >= 1) this.transitionFrom = null;
            } else {
                // Žádný přechod, animace běží přímo
                fn(this.skeleton, this.time, this.params);
            }
        }

        // === PoseSequence tick — mutuje worldPos/worldYaw, může volat setStatus ===
        // PO animaci (= setStatus volaný v rámci tick zachytí JIŽ aplikovanou
        // pose jako transitionFrom; lerp pak plynule rozjede novou animaci).
        // Foot tracking uvnitř seq čte joint.worldPosition před zápisem
        // worldYaw → rootRotation.y (= body frame).
        if (this._activeSeq) {
            if (this._activeSeq.isDone()) {
                this._activeSeq = null;
            } else {
                this._activeSeq.tick(dt);
                // Po dokončení posledního stepu uvolni referenci hned (= isDone
                // může přejít true v rámci tick; defensive cleanup další frame).
            }
        }

        // Zápis akumulované světové polohy a rotace (přepíše reset z fn /
        // Pose.apply). rootPosition.y a rootRotation.x/z NECHÁVÁME nedotčené —
        // řídí je snap-to-floor resp. animace (LAY/PRONE/SIT používají
        // rootRotation.x pro horizontalizaci).
        this.skeleton.rootPosition.x = this.worldPos.x;
        this.skeleton.rootPosition.z = this.worldPos.z;
        this.skeleton.rootRotation.y = this.worldYaw;
    }

    /**
     * Foot tracking — vrátí dz_body (rychlost stojné nohy v body frame
     * za poslední frame). Algoritmus identický s treadmillem v demo02:
     *   1. Identifikuj všechny joints na minY ± tol = supports.
     *   2. Pro každý support inkrementuj counter „kolik frames za sebou".
     *   3. Pick support s NEJDELŠÍ historií = nejjistější planted (= true
     *      stance noha; swing noha v pozdní fázi sice spadne do tolerance,
     *      ale má krátkou historii a opačnou rychlost).
     *   4. dz = currentZ - prevZ pro tento joint. Pokud žádný support nemá
     *      historii ≥ 2 (= první frame walk po reset), extrapoluj z poslední
     *      validní hodnoty (lastBodyDz).
     *
     * Tento algoritmus selhává pro plížení (PASSIVE noha drží history navždy
     * s |dz|≈0). Pro WALK/RUN/CRAWL/SNEAK funguje korektně.
     *
     * Volá ji PoseSequence během linkTo moving fáze.
     *
     * @returns {number} dz_body — body Z delta planted nohy za frame
     */
    computeBodyForwardSpeed() {
        const skel = this.skeleton;
        skel.computeWorldTransforms();

        // minY = nejnižší joint = úroveň podlahy (po snap by to byla floorY).
        let minY = Infinity;
        for (const j of Object.values(skel.joints)) {
            if (j.worldPosition.y < minY) minY = j.worldPosition.y;
        }
        const SUPPORT_TOL = skel.H * 0.04;

        // Sebrání supports + update history. Bestjoint = nejdelší consecutive
        // history.
        const currentSupports = new Map();
        const newHistory      = new Map();
        let bestName    = null;
        let bestHistory = 1;     // ≥2 = aspoň jeden prev frame potřeba pro dz

        for (const j of Object.values(skel.joints)) {
            if (j.worldPosition.y > minY + SUPPORT_TOL) continue;
            const z = j.worldPosition.z;
            currentSupports.set(j.name, z);
            const hist = (this._support.history.get(j.name) ?? 0) + 1;
            newHistory.set(j.name, hist);
            if (hist > bestHistory) {
                bestHistory = hist;
                bestName    = j.name;
            }
        }

        let dz_body;
        if (bestName !== null) {
            dz_body = currentSupports.get(bestName) - this._support.prev.get(bestName);
            this._support.lastBodyDz = dz_body;
        } else {
            // Žádný support s history ≥ 2 (= první frame walku) → extrapoluj.
            dz_body = this._support.lastBodyDz;
        }
        this._support.prev    = currentSupports;
        this._support.history = newHistory;

        return dz_body;
    }
}
