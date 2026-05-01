// src/character/Stickman.js
// =============================================================================
// Stickman = wrapper kolem Skeleton, který drží STAV (status) + BĚŽÍCÍ ČAS
// animace + AKTUÁLNÍ PARAMETRY animace + PLYNULÉ PŘECHODY mezi stavy.
//
// Vrstvení:
//   - Skeleton  (model/) = čistá data + matematika (FK, CoM, support, snap)
//   - Stickman  (character/) = chování v čase (status + animate + transitions)
//   - Demo      = kompozice: scene + view + skeleton + stickman, řídí render loop
//
// Stickman NEDRŽÍ view ani scene — to je úmyslně. Demo kombinuje vrstvy podle
// potřeby (např. demo02 má 1 skeleton + 1 view, akvárium F3 má N skeletonů +
// N views + 1 scene). Stickman je čistá animace úhlů.
//
// Snap-to-floor zůstává v demu — některé budoucí animace (SWIM, CLIMB) snap
// nepotřebují, jiné (WALK) ano. Stickman je agnostický.
//
// === PŘECHODY MEZI STAVY ===
// setStatus() udělá Pose.capture aktuální kostry. Následující animate() během
// `transitionDuration` (default 0.4 s) blendují přes Pose.lerp z toho snapshotu
// do výstupu nové animace. Easing = cubic ease-out (rychlá reakce, měkký dojezd).
// =============================================================================

import { Status }                              from './Status.js';
import { ANIMATIONS, DEFAULTS_WALK, RUN_PRESETS } from './Animations.js';
import { Pose }                                  from '../model/Pose.js';

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
        // Shallow-copy: animace mutují params (Drift drží lazy `params._drift` state).
        // Bez kopie by N instancí Stickmana sdílejících jeden patch literál
        // (akvárium F3) sdílelo i drift state → vzájemná kontaminace.
        this.params = { ...params };
        // Čas od posledního setStatus() v sekundách. Reset při přepnutí stavu,
        // aby cyklické animace začaly od fáze 0 (= konzistentní start).
        this.time = 0;

        // === Transition state ===
        // Default 0.4 s — kompromis: dost rychlé, ať uživatel nečeká, dost pomalé,
        // ať se nepatlá. Lze přepsat zvenčí (stickman.transitionDuration = 0.6).
        this.transitionDuration = 0.4;
        // Pose snapshot na ZAČÁTKU přechodu (z čeho se interpoluje).
        // null = žádný aktivní přechod (= animace běží přímo).
        this.transitionFrom = null;
        // Uplynulý čas v aktivním přechodu (0 → transitionDuration).
        this.transitionElapsed = 0;

        // === Pose linking (Demo03) ==============================================
        // Stickman vlastní světovou polohu (worldPos) a orientaci (worldYaw)
        // postavy. Animace (animateWalk, animateStand, …) volají skeleton.reset()
        // = nulují skel.rootPosition + skel.rootRotation každý frame. Stickman
        // po fn() znovu zapíše svoji pravdu do skel.rootPosition.x/z + .rotation.y
        // (rootPosition.y nechává — to řeší snap-to-floor v demu; rootRotation.x/z
        // jsou určené animací, např. -83° při LAY).
        //
        // target = { x, z } cílová poloha pro linkTo(); null = postava stojí.
        //
        // Rychlost pohybu = rychlost stojné nohy v body frame (foot tracking,
        // identický algoritmus jako treadmill v demo02). Není konstanta — RUN
        // má větší stride a vyšší tempo → automaticky vyšší rychlost. Žádné
        // magic numbers. Detail v animate().
        //
        // Turn-to fáze (Stage 2): při linkTo se nejdřív interpoluje worldYaw
        // z aktuálního směru k cíli. Postava stojí (Status.STAND), otáčí se,
        // pak teprve setStatus(WALK). Délka turnDuration sec.
        this.worldPos  = { x: 0, z: 0 };
        this.worldYaw  = 0;            // ° (Three.js stupně; 0 = postava se dívá -Z)
        this.target    = null;

        this.turning       = false;
        this.turnFrom      = 0;        // ° — startovní yaw turn fáze
        this.turnTo        = 0;        // ° — cílový yaw (shortest-path normalized)
        this.turnElapsed   = 0;
        this.turnDuration  = 0.4;

        // Po dokončení turn-to se Stickman přepne na tento status. Reuse
        // pro dvě situace:
        //   (1) pre-locomotion turn-to → locomotion (Stage 3 — Demo03)
        //   (2) post-arrival turn-to → onArrival action (finalYaw — Demo04)
        // null = žádný turn-to aktivní (nebo direct setStatus bez turn-to).
        this._pendingAction = null;

        // Cílová akce po dosažení target (Stage 5). linkTo({ x, z, then })
        // ji předá; v arrival block setStatus(then.status, then.params).
        // null = default = setStatus(STAND, {}).
        // Příklad: { status: Status.SIT, params: {} } → postava si sedne.
        this._onArrival = null;

        // Cílová orientace po dorazu (Demo04 — finalYaw v linkTo). Pokud zadán
        // a liší se od aktuálního worldYaw o ≥5°, arrival block spustí druhou
        // turn-to fázi PŘED dispatch onArrival. Použití: postava dojde k židli
        // čelem, pak se otočí zády k židli (finalYaw = approachYaw + 180), pak
        // sedne. null = žádný post-arrival turn.
        this._finalYaw = null;

        // Cílová poloha pelvisu po arrival (Demo04 — arrivePosition v linkTo).
        // Postava jde na `target.x/z` (= approach pos = před objektem), ale
        // při sednutí má skončit na pelvisu objektu. Lerp z approach na
        // arrivePosition běží během post-turn-to fáze (synchronně s yaw lerp).
        // null = bez posunu, postava drží worldPos = arrival pos.
        this._arrivePosition = null;
        this._arriveLerp = null;     // { fromX, fromZ, toX, toZ } aktivní lerp

        // Foot tracking state: per-joint historie pro výběr planted nohy
        // (= nejdelší consecutive support history). Reset při každém setStatus,
        // jinak by stale history kontaminovala nový pohyb.
        this._support = {
            prev:        new Map(),    // name → body z (z prev frame)
            history:     new Map(),    // name → consecutive frame count
            lastBodyDz:  0,            // fallback při výpadku historie
        };
    }

    /**
     * Spustí pohyb postavy ke světovému bodu (x, z). Locomotion (WALK / Jog /
     * Sprint) se vybere podle vzdálenosti — viz `_pickLocomotion`. Před
     * lokomotion se postava otočí k cíli (turn-to fáze, ~turnDuration sec).
     *
     * Volitelné fieldy:
     *   - `target.then = { status, params }` — cílový status po dorazu.
     *     Bez něj postava po arrival přepne na STAND.
     *   - `target.finalYaw` (°) — cílová orientace po dorazu. Liší-li se
     *     od worldYaw o ≥5°, postava udělá DRUHOU turn-to fázi po arrival,
     *     teprve pak setStatus(then.status). Použití: dojdi k židli čelem,
     *     otoč se zády (finalYaw = approachYaw + 180°), sedni si.
     *   - `target.arrivePosition = { x, z }` — kam má pelvis přistát po
     *     arrival. Bez něj pelvis drží přesně na (target.x, target.z).
     *     Použití: approach pos je 1.5 j PŘED židlí, ale pelvis má být NA
     *     sedátku (= chair.position). Lerp z approach na arrivePosition
     *     během post-turn-to fáze (synchronně s yaw rotací).
     *
     * Příklad „dojdi a sedni si":
     *   stickman.linkTo({ x: 5, z: 2, then: { status: Status.SIT, params: {} } });
     *
     * Když je rozdíl yaw < 5°, turn-to se přeskočí a animace začne hned.
     * Když cíl leží uvnitř arrival radius (< 0.3 j), volání je no-op.
     *
     * @param {{x: number, z: number,
     *          then?: {status: string, params: object},
     *          finalYaw?: number,
     *          arrivePosition?: {x: number, z: number}}} target
     */
    linkTo(target) {
        const dx = target.x - this.worldPos.x;
        const dz = target.z - this.worldPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.3) return;   // už jsme tam — no-op

        this.target = { x: target.x, z: target.z };
        this._onArrival      = target.then ?? null;
        this._finalYaw       = target.finalYaw ?? null;
        this._arrivePosition = target.arrivePosition ?? null;
        const locomotion = this._pickLocomotion(dist);

        // Cílový yaw: postava forward = -Z v body frame.
        // forward(yaw) = (-sin(yaw), -cos(yaw)) — ověření:
        //   yaw = 0   → fwd = (0, -1)  ✓ kupředu
        //   yaw = 90° → fwd = (-1, 0)  ✓ doleva (CCW shora)
        // Chceme fwd = (dx, dz)/|d| → yaw = atan2(-dx, -dz).
        const targetYaw = Math.atan2(-dx, -dz) * 180 / Math.PI;

        // Shortest-path diff: mapuj rozdíl do (-180°, 180°]. Vzorec
        // ((d % 360) + 540) % 360 - 180 funguje i pro záporná d (JS %
        // může dát negativní výsledek pro negativní operandy).
        const diff = ((targetYaw - this.worldYaw) % 360 + 540) % 360 - 180;

        if (Math.abs(diff) < 5) {
            // Postava už směřuje na cíl — žádná turn-to fáze, rovnou jdi.
            this.turning = false;
            this._pendingAction = null;
            this.setStatus(locomotion.status, locomotion.params);
        } else {
            // Turn-to fáze: postava stojí a otáčí se. Po dokončení (= v animate)
            // se sama přepne na vybraný locomotion status.
            this.turning = true;
            this.turnFrom = this.worldYaw;
            this.turnTo = this.worldYaw + diff;     // ekvivalent targetYaw, shortest path
            this.turnElapsed = 0;
            this._pendingAction = locomotion;
            this.setStatus(Status.STAND, {});
        }
    }

    /**
     * Vybere locomotion mode podle vzdálenosti k cíli. Hranice z IDEAS.md:
     *   - < 5 j  → WALK    (jednotka cca 5 = výška postavy / 1.6 j ≈ 3 kroky)
     *   - < 15 j → Jog     (RUN_PRESETS.jog — středně velká stride, tempo 1.6)
     *   - ≥ 15 j → Sprint  (RUN_PRESETS.sprint — forwardLean 30°, tempo 2.4)
     *
     * Hranice se vyhodnocuje jen při linkTo() — během cesty se mode už nemění
     * (postava nezpomaluje na walk při dojezdu sprintu). Continuous picker
     * je odložený jako over-engineering.
     *
     * @param {number} distance - vzdálenost k cíli v jednotkách
     * @returns {{status: string, params: object}}
     */
    _pickLocomotion(distance) {
        if (distance < 5)  return { status: Status.WALK, params: { ...DEFAULTS_WALK } };
        if (distance < 15) return { status: Status.RUN,  params: { ...RUN_PRESETS.jog } };
        return                    { status: Status.RUN,  params: { ...RUN_PRESETS.sprint } };
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

        // Reset foot tracking: změna stavu = změna stride patternu (nebo zastavení).
        // Stará history je neplatná. lastBodyDz nech — kontinuita pro extrapolation
        // v případě prvního frame nového walku bez prev support.
        this._support.prev.clear();
        this._support.history.clear();
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
     * Stavy bez registrované animace = no-op (postava zůstane v poslední pose).
     * Záměrné — Stickman nepadá na neimplementovaných stavech (zatím RUN, SWIM, …).
     *
     * @param {number} dt - delta time v sekundách (typicky 1/60)
     */
    animate(dt) {
        this.time += dt;
        const fn = ANIMATIONS[this.status];
        if (!fn) return;  // neimplementovaný stav — kostra zůstane v poslední pose

        if (this.transitionFrom !== null) {
            this.transitionElapsed += dt;
            // t = lineární progres v intervalu [0, 1], clamp na 1 (přetečení = konec)
            const t = Math.min(this.transitionElapsed / this.transitionDuration, 1);
            const eased = easeOutCubic(t);

            // 1) Aplikuj cílovou animaci (= mutuje skeleton na cílovou pózu pro this.time)
            fn(this.skeleton, this.time, this.params);
            // 2) Zachyť cílovou pózu jako Pose objekt
            const target = Pose.capture(this.skeleton);
            // 3) Lerp z transitionFrom do target podle eased t (Pose.lerp interpoluje
            //    úhly lineárně, easing aplikujeme na parametr PŘED lerp)
            const blended = Pose.lerp(this.transitionFrom, target, eased);
            // 4) Aplikuj blended pózu na kostru (přepíše to, co fn() právě nastavila)
            blended.apply(this.skeleton);

            // Konec přechodu — uvolnit snapshot
            if (t >= 1) this.transitionFrom = null;
        } else {
            // Žádný přechod, animace běží přímo
            fn(this.skeleton, this.time, this.params);
        }

        // === Pose linking — turn-to + pohyb k cíli (Stage 1+2) ===
        // Posun + rotace se počítají PO animaci a PO transition lerp, protože:
        //   - fn() volá skeleton.reset() = nuluje rootPosition + rootRotation
        //   - Pose.apply během transition rovněž přepíše obojí
        //   - Stickman drží pravdu ve worldPos + worldYaw a zapíše ji jako
        //     poslední krok = animace fn() i transition zůstávají agnostické.

        // Turn-to fáze: postava stojí (Status.STAND) a otáčí se k cíli.
        // Po dokončení automaticky přepne na WALK a začne pohyb.
        if (this.turning) {
            this.turnElapsed += dt;
            const t = Math.min(this.turnElapsed / this.turnDuration, 1);
            const eased = easeOutCubic(t);
            this.worldYaw = this.turnFrom + (this.turnTo - this.turnFrom) * eased;

            // Pos lerp synchronně s yaw (Demo04 — sit on chair: postava si
            // couvne z approach na sedátko). Aktivní jen v post-arrival turn-to.
            if (this._arriveLerp) {
                const L = this._arriveLerp;
                this.worldPos.x = L.fromX + (L.toX - L.fromX) * eased;
                this.worldPos.z = L.fromZ + (L.toZ - L.fromZ) * eased;
            }

            if (t >= 1) {
                this.turning = false;
                this._arriveLerp = null;
                // Použij pending action vybraný v linkTo (Stage 3 locomotion
                // nebo Stage 5 onArrival). Fallback na WALK = defenzivní.
                const next = this._pendingAction ??
                             { status: Status.WALK, params: { ...DEFAULTS_WALK } };
                this._pendingAction = null;
                this.setStatus(next.status, next.params);
                // Pozn.: setStatus uvnitř Pose.capture čte skel.rootRotation.y = 0
                // (= z stand.apply). transitionFrom tedy zachytí 0, ne worldYaw.
                // Není to problém — Stickman každý frame přepisuje rootRotation.y
                // na worldYaw, takže lerp výsledek (= 0) se hned přepíše.
            }
        }

        // Pohyb kupředu — jen když máme target a NEjsme v turn-to fázi.
        // Rychlost = rychlost stojné nohy v body frame (foot tracking).
        // V tomto okamžiku je skel.rootRotation = 0 (z fn() reset / Pose.apply
        // s 0 rootRotation), tj. j.worldPosition.z = body z. Stickman zapisuje
        // worldYaw až NA KONEC animate, takže foot tracking nevidí rotaci.
        if (this.target !== null && !this.turning) {
            const dz_body = this._computeFootDz();

            // Posun world: forward vector × dz_body. dz_body > 0 znamená noha
            // jde dozadu v body frame (= postava jde kupředu). Forward × dz_body
            // posune postavu kupředu o stejnou vzdálenost = planted noha drží
            // na world spotu.
            const ry = this.worldYaw * Math.PI / 180;
            this.worldPos.x += -Math.sin(ry) * dz_body;
            this.worldPos.z += -Math.cos(ry) * dz_body;

            // ARRIVAL_TOL: postava se „dotkne" cíle, když je v okruhu 0.3 j.
            const dx = this.target.x - this.worldPos.x;
            const dz = this.target.z - this.worldPos.z;
            if (Math.hypot(dx, dz) < 0.3) {
                this.target = null;

                // Post-arrival turn-to (Demo04 finalYaw). Pokud cílová orientace
                // se liší od aktuální o ≥5°, spustíme druhou turn-to fázi.
                // _pendingAction se nastaví na onArrival → po dokončení turn-to
                // se setStatus dispatchne (= reuse stejné turn-to logiky jako
                // pre-locomotion).
                if (this._finalYaw !== null) {
                    const yawDiff =
                        ((this._finalYaw - this.worldYaw) % 360 + 540) % 360 - 180;
                    if (Math.abs(yawDiff) >= 5) {
                        this.turning = true;
                        this.turnFrom = this.worldYaw;
                        this.turnTo = this.worldYaw + yawDiff;
                        this.turnElapsed = 0;
                        // Přesun pelvisu z approach na arrivePosition během
                        // post-turn-to (Demo04 — postava si při sednutí couvne
                        // na sedátko). Lerp běží synchronně s yaw rotací.
                        if (this._arrivePosition !== null) {
                            this._arriveLerp = {
                                fromX: this.worldPos.x,
                                fromZ: this.worldPos.z,
                                toX:   this._arrivePosition.x,
                                toZ:   this._arrivePosition.z,
                            };
                            this._arrivePosition = null;
                        }
                        this._pendingAction =
                            this._onArrival ?? { status: Status.STAND, params: {} };
                        this._onArrival = null;
                        this._finalYaw  = null;
                        this.setStatus(Status.STAND, {});
                        return;        // dispatch onArrival až po dokončení turn-to
                    }
                }

                // Žádný post-arrival turn (nebo finalYaw uvnitř tolerance) →
                // dispatch onArrival hned. arrivePosition se aplikuje teleportem
                // (= jeden frame skok) — bez post-turn-to není kde plynule lerpovat.
                if (this._arrivePosition !== null) {
                    this.worldPos.x = this._arrivePosition.x;
                    this.worldPos.z = this._arrivePosition.z;
                    this._arrivePosition = null;
                }
                const arrive = this._onArrival ?? { status: Status.STAND, params: {} };
                this._onArrival = null;
                this._finalYaw  = null;
                this.setStatus(arrive.status, { ...arrive.params });
            }
        }

        // Zápis akumulované světové polohy a rotace (přepíše reset z fn / Pose.apply).
        // rootPosition.y a rootRotation.x/z NECHÁVÁME nedotčené — řídí je snap-to-floor
        // resp. animace (LAY/PRONE/SIT používají rootRotation.x pro horizontalizaci).
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
     * @returns {number} dz_body — body Z delta planted nohy za frame
     */
    _computeFootDz() {
        const skel = this.skeleton;
        skel.computeWorldTransforms();

        // minY = nejnižší joint = úroveň podlahy (po snap by to byla floorY).
        let minY = Infinity;
        for (const j of Object.values(skel.joints)) {
            if (j.worldPosition.y < minY) minY = j.worldPosition.y;
        }
        const SUPPORT_TOL = skel.H * 0.04;

        // Sebrání supports + update history. Bestjoint = nejdelší consecutive history.
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
