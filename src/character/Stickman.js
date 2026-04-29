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

import { Status }     from './Status.js';
import { ANIMATIONS } from './Animations.js';
import { Pose }       from '../model/Pose.js';

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
    }
}
