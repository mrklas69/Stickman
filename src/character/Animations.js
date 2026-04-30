// src/character/Animations.js
// =============================================================================
// Animations = registr animačních funkcí. Mapa Status → fn(skeleton, time, params).
//
// Animační funkce:
//   - mutuje skeleton (volá skel.setAngle / skel.rootPosition / atd.)
//   - dostane `time` v sekundách (čas od startu animace, ne wall-clock)
//   - dostane `params` (uživatelské parametry pro tu animaci, např. tempo chůze)
//   - žádný return value — vedlejší efekt na skeleton
//
// Návrh záměrně KISS:
//   - žádné blending mezi animacemi (přechody řeší Stickman.setStatus)
//   - žádný root-motion (postava chodí na místě, posun = věc dema)
//   - většina animací = čistá funkce času + parametrů; výjimky (Drift) drží
//     mutable state v `params._drift` — per-Stickman, ne global.
//
// Prototyp F2 implementuje STAND (s idle/Drift), WALK, RUN (Jog/Sprint), SIT, LAY.
// Zbytek (SWIM, CLIMB, JUMP, SLEEP, DANCE) v dalších iteracích.
// =============================================================================

import { Status } from './Status.js';
import { stand, sit, layBack } from '../library/Poses.js';
import { Pose } from '../model/Pose.js';

// === Defaultní parametry per animace =======================================
// Demo si může parametry přepsat při setStatus(). Defaults exportujeme,
// aby je demo mohlo číst pro inicializaci sliderů (jediný zdroj pravdy).

/** Defaultní parametry chůze. Sezení 9: `twistAmp` + `swayAmp` sníženy na polovinu
 * (původně 8/4) — kývání horního těla bylo nepřirozeně výrazné. */
export const DEFAULTS_WALK = Object.freeze({
    tempo:    0.8,        // Hz — kolik kompletních cyklů (krok L + krok P) za sekundu
    stepAmp:  35,         // ° — max předkop kyčle (amplituda swing nohy)
    kneeLift: 70,         // ° — max ohyb kolena ve fázi swing
    twistAmp: 4,          // ° — counter-rotace hrudníku v rytmu kroku (Sezení 9: 8 → 4)
    swayAmp:  2,          // ° — vrávorání trupu (torso.x flexe), 2× za cyklus (Sezení 9: 4 → 2)
    armSwing: true,       // ruce v protipohybu (false = paže visí dolů)
});

/**
 * Presety pro animateRun. Liší se od WALK rychlostí (tempo), amplitudou kroku
 * a kolen, předklonem trupu (forwardLean) a base ohybem lokte (běžecký styl).
 *
 * Jog = pomalý běh, mírný lean, středně ohnutý loket.
 * Sprint = max výkon, výrazný lean, max amplitudy, loket pevně ~90°.
 */
export const RUN_PRESETS = Object.freeze({
    jog: Object.freeze({
        tempo:        1.6,    // Hz (= 2× rychlejší než walk default)
        stepAmp:      50,     // ° — větší rozkrok než walk
        kneeLift:     95,     // ° — vyšší zdvih kolena (pata přibližně k zadku)
        twistAmp:     12,     // ° — výraznější counter-rotation hrudníku
        swayAmp:      6,      // ° — výraznější sway (silnější otřesy v kroku)
        forwardLean:  10,     // ° — předklon trupu (těžiště vpřed)
        elbowBase:    80,     // ° — base ohyb lokte (běžec drží paže pokrčené)
        armSwing:     true,
    }),
    sprint: Object.freeze({
        tempo:        2.4,    // Hz (= 3× walk)
        stepAmp:      65,     // ° — max rozkrok (anatomický limit hipL/R.x = ±60..70)
        kneeLift:     150,    // ° — vysoký knee drive (sprint pulls knee up to chest level)
        twistAmp:     18,     // ° — silný twist (rotace ramen-pánev v rytmu)
        swayAmp:      8,
        forwardLean:  30,     // ° — výrazný předklon (sprint posture, váha vpřed)
        elbowBase:    95,     // ° — loket skoro pravý úhel
        armSwing:     true,
    }),
});

/**
 * Defaultní parametry pro CRAWL (běh po čtyřech, dog-trot).
 *
 * Pose-base = `cat` z library (rootRotation.x = -83, torso.x = -27, hip.x = 82,
 * knee.x = 89, shoulder.x = 70, elbow.x = 0). Cyklus přidává swing/flex offset.
 *
 * Diagonální trot: levá paže + pravá noha se hýbou ve fázi A; pravá paže +
 * levá noha ve fázi B = A + 0.5. Rytmus = `tempo` Hz (kompletní L+R cyklus).
 */
export const DEFAULTS_CRAWL = Object.freeze({
    tempo:        0.47,   // Hz — pomalý klus (Sezení 9: 1.4 → 1.4/3 ≈ 0.47, „třetinová rychlost")

    // Base pose (kostra horizontálně, narovnaná páteř):
    bodyTilt:    -83,     // ° — rootRotation.x (kostra horizontálně)
    torsoAngle:    0,     // ° — torso.x = 0 = narovnaná záda (Sezení 9: -27 → 0; cat-zaoblení odstraněno)
    neckAngle:   -50,     // ° — neck.x záklon (Sezení 9: 25 → -50; hlava nahoru, kouká vpřed po horizontalizaci kostry)

    // Přední končetiny (paže) — base + cyklická oscilace
    shoulderBase: 70,     // ° — base shoulder.x (paže míří k podlaze po horizontalizaci)
    armSwing:     25,     // ° — amplituda oscilace shoulder.x (předkop / zápkop přední tlapy)
    elbowBase:    10,     // ° — base elbow.x (téměř natažená přední tlapa)
    elbowFlex:    60,     // ° — extra flex během swing fáze (předloktí se zvedne k tělu)

    // Zadní končetiny (nohy) — base + cyklická oscilace
    hipBase:      82,     // ° — base hip.x (stehna kolmá k trupu)
    legSwing:     25,     // ° — amplituda oscilace hip.x
    kneeBase:     89,     // ° — base knee.x (lýtka pod tělem)
    kneeFlex:     35,     // ° — extra flex během swing fáze (zadní noha se podtáhne pod tělo)
});

/**
 * Defaultní parametry pro PRONE (plížení / commando crawl).
 *
 * Animace = smooth-step lerp mezi dvěma asymetrickými klíčovými pózami:
 *   BASE    — pravá strana „nápřahuje": pravá paže natažená vpřed,
 *             levá paže opřená pod hrudí, levá noha rovně dozadu, pravé
 *             koleno přitažené do strany v poloze žáby (knee out wide).
 *   INVERSE — zrcadlově: levá strana nápřahuje, pravé koleno se narovnává,
 *             levé se přitahuje do žáby.
 * Pose se mezi sebou plynule lerpují → "odraz od pravého kolena, narovnání,
 * přitažení levé nohy, nápřah levé ruky" se odehraje sám díky angles
 * interpolaci.
 *
 * Pose hodnoty byly authored uživatelem v Inspectoru.
 */
/**
 * Defaultní parametry pro PRONE (plížení / low army crawl).
 *
 * Cyklus = asymetrický 4-fázový (NE symetrický trot). Jedna noha v REACH
 * (žabí frog up forward), pak PUSH (planted, tělo se posune nad ní), pak
 * PASSIVE (drag straight back). Druhá noha o 0.5 cyklu offset.
 *
 * Per leg cycle:
 *   t ∈ [0,    0.25)  → REACH → PUSH (planting + body sliding over knee)
 *   t ∈ [0.25, 0.5)   → PUSH → PASSIVE (lift-off, leg extends back)
 *   t ∈ [0.5,  0.75)  → PASSIVE drag (= druhá noha pracuje)
 *   t ∈ [0.75, 1.0)   → PASSIVE → REACH (lift forward into frog)
 *
 * Paže + torso jsou zatím STATICKÉ (= legs first iteration). Diagonální
 * párování s pažemi (L paže ↔ P noha, P paže ↔ L noha) přijde v dalším kroku.
 */
export const DEFAULTS_PRONE = Object.freeze({
    tempo:       0.4,    // Hz — pomalé tempo (1 cyklus = 2.5 s)
    bodyTilt:   -87,     // ° — rootRotation.x (body horizontal)
    torsoAngle: -11,     // ° — torso.x (mírná deflexe pro head-up siluetu)
    neckAngle:  -60,     // ° — neck.x záklon (hlava nahoru, kouká vpřed)
});

// Per-leg keyframes — anatomické úhly (symetrické pro L i P).
// REACH    = knee max-flexed up forward (žabí frog, max abdukce ven).
// PUSH     = knee planted on floor, body slid forward over knee
//            (hip flex DECREASED z REACH → PUSH = body se posunul vpřed).
// PASSIVE  = leg straight back, dragging on floor.
const PRONE_LEG_REACH   = { hipX: 84, hipY:  -3, hipZ: 80, kneeX:  97 };
const PRONE_LEG_PUSH    = { hipX: 25, hipY:  -3, hipZ: 70, kneeX: 100 };
const PRONE_LEG_PASSIVE = { hipX:  2, hipY: -22, hipZ:  5, kneeX:   0 };

// Per-arm keyframes — kontralaterální párování s nohou:
//   L paže = stejná phase jako P noha (= když P noha REACH, L paže REACH)
//   P paže = stejná phase jako L noha
//
// POZN. body rotation -87°: shoulder.x ~ 170° rotuje paži z rest "viset dolů
// (= dozadu po rotaci body)" PŘES vrch do "natažený dopředu, plochý k podlaze".
// Nižší shoulder.x (např. 65°) znamená paži směřuje DO podlahy → snap-to-floor
// nadzvedne celou postavu.
//
// REACH    = wrist max forward (paže natažená kupředu, plochá k podlaze).
// PULL     = forearm pulls under body toward waist (vnitřní rot + bent elbow).
// PASSIVE  = arm lying along body side at body level (paže pasivní).
const PRONE_ARM_REACH   = { shX: 170, shY:   0, shZ: 20, elX:  30 };
const PRONE_ARM_PULL    = { shX: 140, shY: -50, shZ: 15, elX: 100 };
const PRONE_ARM_PASSIVE = { shX:  10, shY:   0, shZ: 10, elX:  15 };

/**
 * Defaultní parametry pro SNEAK (přikrčená/maskovaná chůze).
 *
 * Bipedal walk s permanentním předklonem trupu, pokrčenými koleny a
 * loktem, malými kroky a pomalým tempem. Silueta výrazně nižší než
 * normální Walk — typická maskovací póza.
 */
export const DEFAULTS_SNEAK = Object.freeze({
    tempo:      0.5,      // Hz — pomalé tempo (opatrný krok)
    torsoLean:  25,       // ° — permanentní předklon trupu (sneak postoj)
    neckTilt:  -10,       // ° — drobný záklon krku (kompenzuje předklon, kouká vpřed)
    stepAmp:    18,       // ° — malá amplituda předkopu (cca polovina walk = 35)
    kneeLift:   35,       // ° — malé zdvihnutí kolena (cca polovina walk = 70)

    // Hluboké pokrčení = kachní chůze (Sezení 9: 25/40 → 80/110, pelvis cca
    // o polovinu níž než ve stoji). Geometrie: hip 80 + knee 110 → ankle
    // končí ~2.15 j pod pelvisem (default 4.1 j) → pelvis sedí v 52 %
    // výchozí výšky = „zadek o polovinu níže" = duck walk silueta.
    hipBase:    80,       // ° — hluboká flexe kyčlí (stehna téměř horizontálně vpřed)
    kneeBase:  110,       // ° — silné pokrčení kolen (lýtka klesají k podlaze pod pelvisem)

    elbowBase:  60,       // ° — paže držené ohnuté blízko tělu
    armOut:     30,       // ° — abdukce ramen (paže od těla pro udržení rovnováhy)
    armSwing:   true,     // ruce s drobným swingem v rytmu kroku (× 0.4 vs walk × 0.6)
});

/**
 * Defaultní parametry idle / Drift režimu STAND.
 *
 * Drift = lerp toward random P2. Per cyklus se vygeneruje plně random pose P2,
 * realizuje se jen `fraction × (P2 - P1)` (= zlomek vektoru). `fraction` je
 * tedy „jemnost driftu" — menší = klidnější, větší = divočejší.
 *
 * Plný rozsah root rotace (±90°) = postava se může nakloňovat až do horizontály.
 *
 * Pro „drift do rytmu" (Dance preset): override `cycleDuration` na 60/BPM
 * a `rootRange` na malou hodnotu (8°), aby postava neztratila stabilitu.
 */
export const DEFAULTS_DRIFT = Object.freeze({
    idle:           true,    // = "zapnout drift" (animateStand to čte)
    fraction:       0.25,    // jemnost driftu = velikost realizovaného vektoru P2-P1 (default „čtvrtinový vektor")
    cycleDuration:  1.4,     // s — doba jedné drift transition
    rootRange:      90,      // ° — max výchylka rootRotation per osa (plný drift)
});

// === Helper: jedna noha v cyklu chůze ======================================
// Phase ph ∈ [0, 1) pro tuto nohu (vlastní fáze, posunutá o 0.5 mezi L a P).
//   ph ∈ [0, 0.5)  → SWING (zvedá se, jde vpřed)
//   ph ∈ [0.5, 1)  → STANCE (na zemi, jde "vzad" relativně k tělu)
// Sin(πt) tvaruje swing — plynulé zvednutí.
function legPose(ph, stepAmp, kneeLift) {
    if (ph < 0.5) {
        // SWING — noha jde vpřed, koleno se ohne v půli
        const t = ph * 2;                       // 0..1
        const lift = Math.sin(t * Math.PI);     // 0 → 1 → 0 (sinusoida)
        return {
            hip:  -stepAmp + 2 * stepAmp * t,   // -amp → +amp lineárně
            knee: kneeLift * lift,              // 0 → max → 0
        };
    } else {
        // STANCE — noha narovnaná, jde vzad
        const t = (ph - 0.5) * 2;               // 0..1
        return {
            hip:  stepAmp - 2 * stepAmp * t,    // +amp → -amp
            knee: 0,
        };
    }
}

// === STAND ==================================================================
// Default = idempotentní rest pose. Když `params.idle === true`, místo toho
// běží Drift (= budget-based random walk; spec v IDEAS.md / Sezení 7).
//
// Drift drží stav v `params._drift` — per-Stickman, ne global. Lazy init při
// prvním volání. Cyklus: `from → target` přes Pose.lerp s quint ease-out;
// po dorazu vyber nový target a pokračuj.
function animateStand(skeleton, time, params) {
    if (!params || !params.idle) {
        // Statická rest pose (původní chování pro Reset / default STAND).
        stand.apply(skeleton);
        return;
    }

    // === Drift mód ===
    // Lazy init: drift state žije v params (= per-Stickman). Drift startuje
    // od `stand` pose — konzistentní východisko bez ohledu na předchozí status.
    // Stickman.animate() se postará o blending z reálné aktuální pózy přes
    // transitionFrom (= plynulý nájezd z Walk/Run do Driftu).
    if (!params._drift) {
        // Aplikuj rest pose, pak zachyť — `from` = explicitní snapshot stand.
        // (stand.angles = {} → Pose.capture vyrobí explicitní 0° per osu.)
        stand.apply(skeleton);
        const fromPose = Pose.capture(skeleton, 'drift-from');
        const fraction      = params.fraction      ?? DEFAULTS_DRIFT.fraction;
        const cycleDuration = params.cycleDuration ?? DEFAULTS_DRIFT.cycleDuration;
        const rootRange     = params.rootRange     ?? DEFAULTS_DRIFT.rootRange;

        params._drift = {
            from:          fromPose,
            target:        generateDriftTarget(skeleton, fromPose, fraction, rootRange),
            cycleStart:    0,
            cycleDuration,
            fraction,
            rootRange,
        };
    }

    const d = params._drift;
    // Sync s aktuálními params — UI mohlo změnit fraction (= jemnost driftu).
    // Přepočet se projeví až na příštím cyklu (nový target dostane nový fraction).
    // Phase-continuous reset by vyžadoval re-capture from = current; zatím KISS.
    d.fraction = params.fraction ?? d.fraction;
    let phase = (time - d.cycleStart) / d.cycleDuration;

    if (phase >= 1) {
        // Cyklus dokončený → současný target se stává startem nového cyklu,
        // nový target se vygeneruje od něj. Zaktualizujeme cycleStart, ať
        // další phase startuje od 0.
        d.from = d.target;
        d.target = generateDriftTarget(skeleton, d.from, d.fraction, d.rootRange);
        d.cycleStart = time;
        phase = 0;
    }

    // ease-out quint: rychlý start, velmi pomalý dojezd → "intent" pocit
    // (= postava jakoby míří k cíli, na konci se vyladí).
    const eased = 1 - Math.pow(1 - phase, 5);
    const lerped = Pose.lerp(d.from, d.target, eased);
    lerped.apply(skeleton);
}

/**
 * Generuje drift target pózu od `fromPose` přes lerp k náhodné cílové póze P2.
 *
 * Algoritmus (Sezení 9 přepis — nahradil předchozí budget-based random walk):
 *   1. Sestav vektor všech aktivních os (22 DOF + 3 root pseudo-osy = N). Každá
 *      osa má normalizovaný rozsah 100 „dílků" — celkový pool = N × 100.
 *   2. Pro každou osu vygeneruj P2_i = uniform random v [min, max].
 *   3. Realizuj jen ČÁST vektoru: target_i = current_i + fraction × (P2_i - current_i).
 *      `fraction` = jemnost driftu (default 0.25 = „čtvrtinový vektor").
 *   4. Žádné zamykání os, žádný point-budget. Lineární kombinace P1 + f·(P2-P1) =
 *      Pose.lerp(P1, P2, fraction) per osa. Všechny osy se hýbou každý cyklus,
 *      ale jen o malou fraction — pohyb je organizovaný (= drobné posuny celého
 *      těla), ne fragmentovaný (= jednotlivé klouby skáčou).
 *
 * Root pseudo-osy mají range [-rootRange, +rootRange]° (default 90° = plný drift).
 * RootPosition zůstává beze změny (snap-to-floor řeší Y, X/Z se nehýbe).
 */
function generateDriftTarget(skeleton, fromPose, fraction, rootRange) {
    const target = new Pose('drift-target');
    target.rootPosition = { ...fromPose.rootPosition };
    target.rootRotation = { ...fromPose.rootRotation };

    // 1. + 2. + 3. Joint DOF osy — lerp toward random per axis
    skeleton.forEachJoint(j => {
        if (j.dof === 0) return;
        for (const ax of j.axes) {
            const [min, max] = j.limits[ax];
            const P1 = fromPose.angles[j.name]?.[ax] ?? 0;
            const P2 = min + Math.random() * (max - min);
            const realized = P1 + fraction * (P2 - P1);
            if (!target.angles[j.name]) target.angles[j.name] = {};
            target.angles[j.name][ax] = realized;
        }
    });

    // 1. + 2. + 3. Root pseudo-osy (3 osy × omezený range = `rootRange`)
    for (const ax of ['x', 'y', 'z']) {
        const P1 = fromPose.rootRotation[ax] ?? 0;
        const P2 = -rootRange + Math.random() * (2 * rootRange);
        target.rootRotation[ax] = P1 + fraction * (P2 - P1);
    }

    return target;
}

// === SIT ====================================================================
// Statická pose-based animace. Sed s ohnutými koleny (sit z library).
// Pro varianty (SIT1..5) viz pozdější iterace F2.
function animateSit(skeleton, _time, _params) {
    sit.apply(skeleton);
}

// === LAY ====================================================================
// Statická pose-based animace. Default = layBack (kompaktní leh na zádech).
// rootRotation.x = 90 → postava leží vodorovně, snap-to-floor v demu pak
// srovná tělo na podlahu. Pro varianty (layStarfish, laySide, layChill, …)
// jako params.variant viz pozdější iterace.
function animateLay(skeleton, _time, _params) {
    layBack.apply(skeleton);
}

// === WALK ===================================================================
// Cyklus phase ∈ [0, 1) řízený časem. Levá noha drží phaseL = (time*tempo)%1,
// pravá noha je posunutá o 0.5 (= opačná fáze). Ruce v protipohybu k nohám,
// torso se kroutí counter-rotation a osciluje vpřed-vzad v rytmu kroku.
function animateWalk(skeleton, time, params) {
    // Reset = clean slate. Bez něj by úhly z předchozí animace (např. Drift,
    // který nastaví všech 22 DOF + 3 root osy) držely v ne-přepsaných osách
    // (torso.z, shoulder.z, ...) navždy. Pose.apply by udělal totéž; reset je explicitní.
    skeleton.reset();

    // Spread merge: defaults + user overrides. Uživatel může přepsat jen některé.
    const p = { ...DEFAULTS_WALK, ...params };

    // Phase v ose času, modulo 1 (= jeden cyklus = 1/tempo sekundy)
    const phaseL = (time * p.tempo) % 1;
    const phaseR = (phaseL + 0.5) % 1;

    const L = legPose(phaseL, p.stepAmp, p.kneeLift);
    const R = legPose(phaseR, p.stepAmp, p.kneeLift);

    skeleton.setAngle('hipL',  'x', L.hip);
    skeleton.setAngle('kneeL', 'x', L.knee);
    skeleton.setAngle('hipR',  'x', R.hip);
    skeleton.setAngle('kneeR', 'x', R.knee);

    // Ruce v protipohybu — levá ruka jde s pravou nohou a naopak.
    // Loket dynamicky: base 30° + 1.5×shoulder swing → v přední úvrati paže
    // ohnutý ~60°, v zadní téměř narovnaný. Anatomicky věrné (předloktí kýve
    // s větší amplitudou než rameno).
    if (p.armSwing) {
        const shL = -R.hip * 0.6;
        const shR = -L.hip * 0.6;
        skeleton.setAngle('shoulderL', 'x', shL);
        skeleton.setAngle('shoulderR', 'x', shR);
        skeleton.setAngle('elbowL', 'x', 30 + shL * 1.5);
        skeleton.setAngle('elbowR', 'x', 30 + shR * 1.5);
    } else {
        // Ruce volně podél těla (žádný swing)
        skeleton.setAngle('shoulderL', 'x', 0);
        skeleton.setAngle('shoulderR', 'x', 0);
        skeleton.setAngle('elbowL',    'x', 0);
        skeleton.setAngle('elbowR',    'x', 0);
    }

    // Lehký předklon krku (5°) — celou dobu konstantní, dává pocit "kouká před sebe"
    skeleton.setAngle('neck', 'x', 5);

    // Twist hrudníku — counter-rotation k nohám.
    // Pelvis = root v naší kostře, takže pelvis-twist by rotoval celou postavu.
    // Stáčíme jen `torso` joint (= ramena vůči stojícím bokům).
    // sin(2π·phaseL) = jedna plná oscilace za cyklus chůze.
    const twistPhase = Math.sin(2 * Math.PI * phaseL);
    skeleton.setAngle('torso', 'y', -p.twistAmp * twistPhase);

    // Vrávorání trupu vpřed/vzad (torso.x flexe).
    // Frekvence 2× za cyklus: heel-strike + push-off se opakují na každé noze,
    // takže trup se houpá "vpřed-vzad" dvakrát během jednoho cyklu chůze.
    // sin(4π·phaseL) = dvě plné oscilace.
    skeleton.setAngle('torso', 'x', p.swayAmp * Math.sin(4 * Math.PI * phaseL));
}

// === RUN ====================================================================
// Stejný cyklus jako WALK (legPose), ale s vyšším tempem, amplitudami,
// předklonem trupu (forwardLean) a base ohybem lokte (běžecký styl).
//
// Rozdíly proti WALK:
//   - tempo 1.6 (jog) / 2.4 (sprint) místo 0.8
//   - stepAmp + kneeLift výrazně vyšší (= dramatičtější pohyb nohou)
//   - torso.x = forwardLean + sway (postoj nakloněný vpřed)
//   - elbow base 80°/95° místo 30° (běžec drží paže pokrčené, ne uvolněné)
//   - shoulder swing × 0.7 (paže se hýbou kratším obloukem než u walk —
//     pohyb je rychlejší, takže amplituda je menší kvůli setrvačnosti)
//
// Není zatím implementovaná let-fáze (= obě nohy ve vzduchu): vyžadovala
// by úpravu legPose (zkrácení stance fáze) a oscilaci rootPosition.y, což
// se rozbije se snap-to-floor. Necháváme na pozdější iteraci.
function animateRun(skeleton, time, params) {
    skeleton.reset();              // clean slate — viz animateWalk

    // Default preset = jog (mírnější varianta), uživatelské params přepíší.
    const p = { ...RUN_PRESETS.jog, ...params };

    const phaseL = (time * p.tempo) % 1;
    const phaseR = (phaseL + 0.5) % 1;

    const L = legPose(phaseL, p.stepAmp, p.kneeLift);
    const R = legPose(phaseR, p.stepAmp, p.kneeLift);

    skeleton.setAngle('hipL',  'x', L.hip);
    skeleton.setAngle('kneeL', 'x', L.knee);
    skeleton.setAngle('hipR',  'x', R.hip);
    skeleton.setAngle('kneeR', 'x', R.knee);

    if (p.armSwing) {
        // Shoulder swing × 0.7 — kratší oblouk paží než u walk (× 0.6 tam),
        // ale s vyšší base elbow flexí. Větší stepAmp by jinak vystřeloval
        // ramena nad limity.
        const shL = -R.hip * 0.7;
        const shR = -L.hip * 0.7;
        skeleton.setAngle('shoulderL', 'x', shL);
        skeleton.setAngle('shoulderR', 'x', shR);
        // Elbow = base + dynamic component (loket se ještě víc ohne, když paže
        // jde dopředu = klasický pull-back lokte při běhu).
        // Math.abs() — ohyb se zvětšuje v obou směrech (vpřed i vzad), jen
        // kupředu o něco víc (× 0.4 vs. × 0.2 v základu).
        skeleton.setAngle('elbowL', 'x', p.elbowBase + Math.abs(shL) * 0.4);
        skeleton.setAngle('elbowR', 'x', p.elbowBase + Math.abs(shR) * 0.4);
    } else {
        skeleton.setAngle('shoulderL', 'x', 0);
        skeleton.setAngle('shoulderR', 'x', 0);
        skeleton.setAngle('elbowL',    'x', p.elbowBase);
        skeleton.setAngle('elbowR',    'x', p.elbowBase);
    }

    // Krk drží hlavu v horizontále navzdory předklonu trupu — `kouká před sebe`.
    // forwardLean × 0.6 = částečná kompenzace (anatomicky člověk nedrží hlavu
    // úplně rovně, lehce sleduje směr běhu).
    skeleton.setAngle('neck', 'x', -p.forwardLean * 0.6 + 5);

    // Torso: forwardLean (konstantní) + sway (oscilace 2× za cyklus).
    const swayPhase = Math.sin(4 * Math.PI * phaseL);
    skeleton.setAngle('torso', 'x', p.forwardLean + p.swayAmp * swayPhase);

    // Twist hrudníku — counter-rotation (silnější než u walk).
    const twistPhase = Math.sin(2 * Math.PI * phaseL);
    skeleton.setAngle('torso', 'y', -p.twistAmp * twistPhase);
}

// === CRAWL (po čtyřech) ====================================================
// Dog-trot: diagonální páry (front-L + rear-R) ↔ (front-R + rear-L) v opačné
// fázi. Báze = `cat` pose (kostra horizontálně, hip.x = 82, knee.x = 89,
// shoulder.x = 70). Cyklus přidává swing nad shoulder/hip + lift přes
// elbow/knee během swing fáze (přední/zadní končetina se podtáhne během
// kroku a natáhne při dotyku „země").
//
// Rytmus je sdílený s WALK/RUN cyklem — `legPose(phase, swingAmp, flexLift)`
// vrací offset, který se přičítá k base hodnotě.
function animateCrawl(skeleton, time, params) {
    skeleton.reset();
    const p = { ...DEFAULTS_CRAWL, ...params };

    // === Base "all fours" pose (statická báze, jako cat) ===
    skeleton.rootRotation = { x: p.bodyTilt, y: 0, z: 0 };
    skeleton.setAngle('torso', 'x', p.torsoAngle);
    skeleton.setAngle('neck',  'x', p.neckAngle);

    // === Cyklus: diagonální trot ===
    // Phase A = levá paže + pravá noha; Phase B = pravá paže + levá noha (offset 0.5)
    const phaseA = (time * p.tempo) % 1;
    const phaseB = (phaseA + 0.5) % 1;

    // Přední levá (paže) + zadní pravá (noha) — phase A
    const frontL = legPose(phaseA, p.armSwing, p.elbowFlex);
    const rearR  = legPose(phaseA, p.legSwing, p.kneeFlex);
    skeleton.setAngle('shoulderL', 'x', p.shoulderBase + frontL.hip);
    skeleton.setAngle('elbowL',    'x', p.elbowBase   + frontL.knee);
    skeleton.setAngle('hipR',      'x', p.hipBase     + rearR.hip);
    skeleton.setAngle('kneeR',     'x', p.kneeBase    + rearR.knee);

    // Přední pravá (paže) + zadní levá (noha) — phase B
    const frontR = legPose(phaseB, p.armSwing, p.elbowFlex);
    const rearL  = legPose(phaseB, p.legSwing, p.kneeFlex);
    skeleton.setAngle('shoulderR', 'x', p.shoulderBase + frontR.hip);
    skeleton.setAngle('elbowR',    'x', p.elbowBase   + frontR.knee);
    skeleton.setAngle('hipL',      'x', p.hipBase     + rearL.hip);
    skeleton.setAngle('kneeL',     'x', p.kneeBase    + rearL.knee);
}

// === PRONE (plížení / low army crawl) ======================================
// Asymetrický 4-fázový cyklus (= NE symetrický trot). Jedna noha v aktivním
// REACH→PUSH→PASSIVE→REACH cyklu, druhá o 0.5 offset. Ve fázi PASSIVE leg
// pasivně leží natažená dozadu (= druhá noha aktuálně propeluje).
//
// Vizuální reference: c:\TEMP\Plížení\ (Obrázek.png + Tabulka.csv).

/** Smoothstep — měkké S-křivkové easing 0→1 (žádné trhnutí na keyframe hranách). */
function smoothstepProne(t) {
    return t * t * (3 - 2 * t);
}

/** Lerp dvou key-objektů per-klíč (generická — funguje pro leg keys i arm keys). */
function lerpProneKeys(a, b, t) {
    const out = {};
    for (const k of Object.keys(a)) {
        out[k] = a[k] + (b[k] - a[k]) * t;
    }
    return out;
}

/**
 * Generická 4-segmentová phase function. t ∈ [0,1] vrací keyframe-blended
 * anatomické úhly per fáze cyklu.
 *
 *   0..0.25   REACH → ACTIVE    (plant + power stroke)
 *   0.25..0.5 ACTIVE → PASSIVE  (lift off, retract)
 *   0.5..0.75 PASSIVE drag      (druhá končetina pracuje)
 *   0.75..1.0 PASSIVE → REACH   (lift forward, příprava)
 *
 * KEY_R = REACH, KEY_A = active middle (PUSH pro nohy / PULL pro paže), KEY_P = PASSIVE.
 */
function pronePhase(t, KEY_R, KEY_A, KEY_P) {
    if (t < 0.25) return lerpProneKeys(KEY_R, KEY_A, smoothstepProne(t * 4));
    if (t < 0.5)  return lerpProneKeys(KEY_A, KEY_P, smoothstepProne((t - 0.25) * 4));
    if (t < 0.75) return KEY_P;
    return               lerpProneKeys(KEY_P, KEY_R, smoothstepProne((t - 0.75) * 4));
}

function animateProne(skeleton, time, params) {
    skeleton.reset();
    const p = { ...DEFAULTS_PRONE, ...params };

    // Statická báze — tělo horizontální, head up.
    skeleton.rootRotation = { x: p.bodyTilt, y: 0, z: 0 };
    skeleton.setAngle('torso', 'x', p.torsoAngle);
    skeleton.setAngle('neck',  'x', p.neckAngle);

    // Asymetrický 4-fázový cyklus s diagonálním párováním:
    //   P noha + L paže v phase t (= když P noha REACH, L paže REACH; atd.)
    //   L noha + P paže v phase t+0.5
    const t  = (time * p.tempo) % 1;
    const tL = (t + 0.5) % 1;

    const legR = pronePhase(t,  PRONE_LEG_REACH, PRONE_LEG_PUSH, PRONE_LEG_PASSIVE);
    const armL = pronePhase(t,  PRONE_ARM_REACH, PRONE_ARM_PULL, PRONE_ARM_PASSIVE);
    const legL = pronePhase(tL, PRONE_LEG_REACH, PRONE_LEG_PUSH, PRONE_LEG_PASSIVE);
    const armR = pronePhase(tL, PRONE_ARM_REACH, PRONE_ARM_PULL, PRONE_ARM_PASSIVE);

    skeleton.setAngle('hipR',  'x', legR.hipX);
    skeleton.setAngle('hipR',  'y', legR.hipY);
    skeleton.setAngle('hipR',  'z', legR.hipZ);
    skeleton.setAngle('kneeR', 'x', legR.kneeX);

    skeleton.setAngle('hipL',  'x', legL.hipX);
    skeleton.setAngle('hipL',  'y', legL.hipY);
    skeleton.setAngle('hipL',  'z', legL.hipZ);
    skeleton.setAngle('kneeL', 'x', legL.kneeX);

    skeleton.setAngle('shoulderL', 'x', armL.shX);
    skeleton.setAngle('shoulderL', 'y', armL.shY);
    skeleton.setAngle('shoulderL', 'z', armL.shZ);
    skeleton.setAngle('elbowL',    'x', armL.elX);

    skeleton.setAngle('shoulderR', 'x', armR.shX);
    skeleton.setAngle('shoulderR', 'y', armR.shY);
    skeleton.setAngle('shoulderR', 'z', armR.shZ);
    skeleton.setAngle('elbowR',    'x', armR.elX);
}

// === SNEAK (přikrčená/maskovaná chůze) =====================================
// Bipedal walk pattern, ale s permanentním předklonem trupu, pokrčenými
// koleny a kyčlemi (= nízká silueta), pomalým tempem a malými kroky.
// Liší se od WALK tím, že hipBase + kneeBase přidávají konstantní flexi
// nad walk cyklus.
function animateSneak(skeleton, time, params) {
    skeleton.reset();
    const p = { ...DEFAULTS_SNEAK, ...params };

    // Permanentní předklon + nízká silueta
    skeleton.setAngle('torso', 'x', p.torsoLean);
    skeleton.setAngle('neck',  'x', p.neckTilt);

    // Cyklus chůze (stejný princip jako WALK)
    const phaseL = (time * p.tempo) % 1;
    const phaseR = (phaseL + 0.5) % 1;

    const L = legPose(phaseL, p.stepAmp, p.kneeLift);
    const R = legPose(phaseR, p.stepAmp, p.kneeLift);

    // Nohy = base flex + cyklický offset (= sneak postoj)
    skeleton.setAngle('hipL',  'x', p.hipBase  + L.hip);
    skeleton.setAngle('kneeL', 'x', p.kneeBase + L.knee);
    skeleton.setAngle('hipR',  'x', p.hipBase  + R.hip);
    skeleton.setAngle('kneeR', 'x', p.kneeBase + R.knee);

    // Abdukce ramen = paže od těla pro udržení rovnováhy (kachní silueta)
    skeleton.setAngle('shoulderL', 'z', p.armOut);
    skeleton.setAngle('shoulderR', 'z', p.armOut);

    // Paže ohnuté, drobný swing (cca polovina walk amplitudy)
    if (p.armSwing) {
        const shL = -R.hip * 0.4;
        const shR = -L.hip * 0.4;
        skeleton.setAngle('shoulderL', 'x', shL);
        skeleton.setAngle('shoulderR', 'x', shR);
        skeleton.setAngle('elbowL', 'x', p.elbowBase + Math.abs(shL) * 0.5);
        skeleton.setAngle('elbowR', 'x', p.elbowBase + Math.abs(shR) * 0.5);
    } else {
        skeleton.setAngle('elbowL', 'x', p.elbowBase);
        skeleton.setAngle('elbowR', 'x', p.elbowBase);
    }
}

// === JUMP (cyklický skok) ===================================================
// Pět fází per cyklus: PREP (squat) → PUSH (extend, arms swing) → AIR
// (parabolický arc + tuck/scissor) → LAND (deep flex) → RECOVER (back to stand).
// Cyklus se opakuje, dokud není přepnut Status.
//
// Snap-to-floor trick: během PREP/PUSH/LAND/RECOVER snap udržuje ankle na
// podlaze (= squat se realizuje pokrčením kolen + snap). Během AIR animace
// nastavuje `rootPosition.y` na parabolický arc; demo musí přeskočit snap
// (kontroluje `params._airborne`).
//
// Tři presety přes JUMP_PRESETS:
//   - vertical: vysoký arc, sym. nohy, ze stoje, paže nad hlavu
//   - long ("žabák"): nižší arc, výrazný předklon, paže vpřed, sym. nohy
//   - running: krátký prep (= z běhu), scissor nohy, kontralaterální paže

export const DEFAULTS_JUMP = Object.freeze({
    tempo:       0.7,    // Hz — jeden cyklus PREP→…→RECOVER za 1.4 s
    liftAmount:  1.5,    // jednotky — peak rootPosition.y v AIR fázi
    prepDepth:   80,     // ° — flexe kyčlí v PREP/LAND (squat)
    prepKnee:    110,    // ° — ohyb kolen v PREP/LAND
    torsoLean:   15,     // ° — předklon trupu v PREP
    armBack:    -45,     // ° — zapažení v PREP (anticipace)
    armForward:   90,    // ° — předpažení v PUSH/AIR (= reach up nebo forward)
    legSplit:     0,     // ° — scissor nohou v AIR (0 = sym, >0 = L vpřed / R vzad)
});

export const JUMP_PRESETS = Object.freeze({
    vertical: Object.freeze({ ...DEFAULTS_JUMP, forwardSpeed: 0 }),
    long: Object.freeze({
        tempo:      0.6,
        liftAmount: 0.8,
        prepDepth:  90,
        prepKnee:   120,
        torsoLean:  35,    // výrazný předklon = příprava na forward leap
        armBack:   -60,
        armForward: 130,   // paže vpřed (ne nahoru) = forward reach
        legSplit:    0,
        forwardSpeed: 2.5, // jednotky/s — žabák průměrnou rychlostí mezi cykly
    }),
    running: Object.freeze({
        tempo:      1.5,   // rychlý cyklus = běžecký rytmus
        liftAmount: 0.8,
        prepDepth:  25,    // krátký prep, žádný full squat
        prepKnee:   50,
        torsoLean:  25,    // běžecký předklon
        armBack:   -50,
        armForward: 110,
        legSplit:   50,    // nohy v anti-fázi (jedna lead, druhá push-off)
        forwardSpeed: 7,   // jednotky/s — rychleji než jog
    }),
});

function animateJump(skeleton, time, params) {
    skeleton.reset();
    const p = { ...DEFAULTS_JUMP, ...params };
    const phase = (time * p.tempo) % 1;

    // Hodnoty per fáze
    let hipFlex = 0, kneeFlex = 0, torsoLean = 0, armPos = 0, split = 0;
    let isAir = false;

    if (phase < 0.25) {
        // PREP — plynulé sedání do squatu, paže dozadu, mírný předklon.
        const t = smoothstep(phase / 0.25);
        hipFlex   = p.prepDepth * t;
        kneeFlex  = p.prepKnee  * t;
        torsoLean = p.torsoLean * t;
        armPos    = p.armBack   * t;
    } else if (phase < 0.40) {
        // PUSH — extenze nohou, paže švihem dopředu/nahoru.
        const t = smoothstep((phase - 0.25) / 0.15);
        hipFlex   = p.prepDepth * (1 - t);
        kneeFlex  = p.prepKnee  * (1 - t);
        torsoLean = p.torsoLean * (1 - t * 0.5);
        armPos    = p.armBack + (p.armForward - p.armBack) * t;
    } else if (phase < 0.65) {
        // AIR — parabolický arc + tuck/scissor. sin(πt) zajišťuje 0 na okrajích
        // (matching PUSH end + LAND start) → žádné skoky v úhlech.
        const t = (phase - 0.40) / 0.25;
        const arc  = 4 * t * (1 - t);    // 0..1..0 (parabola, peak 1 v t=0.5)
        const tuck = Math.sin(Math.PI * t);
        skeleton.rootPosition.y = p.liftAmount * arc;
        hipFlex   = 30 * tuck;
        kneeFlex  = 60 * tuck;
        torsoLean = 5 + (p.torsoLean - 5) * 0.3;
        armPos    = p.armForward;
        split     = p.legSplit * tuck;
        isAir = true;
    } else if (phase < 0.80) {
        // LAND — hluboká flexe absorbující dopad.
        const t = smoothstep((phase - 0.65) / 0.15);
        hipFlex   = p.prepDepth * 1.2 * t;
        kneeFlex  = p.prepKnee  * 1.2 * t;
        torsoLean = p.torsoLean * 1.5 * t;
        armPos    = p.armForward + (-p.armBack * 0.5 - p.armForward) * t;
    } else {
        // RECOVER — zpět do neutrálního stoje.
        const t = smoothstep((phase - 0.80) / 0.20);
        hipFlex   = p.prepDepth * 1.2 * (1 - t);
        kneeFlex  = p.prepKnee  * 1.2 * (1 - t);
        torsoLean = p.torsoLean * 1.5 * (1 - t);
        armPos    = -p.armBack * 0.5 * (1 - t);
    }

    skeleton.setAngle('torso', 'x', torsoLean);

    if (split === 0) {
        // Symetrické nohy a paže (vertical / long)
        skeleton.setAngle('hipL', 'x', hipFlex);
        skeleton.setAngle('hipR', 'x', hipFlex);
        skeleton.setAngle('kneeL', 'x', kneeFlex);
        skeleton.setAngle('kneeR', 'x', kneeFlex);
        skeleton.setAngle('shoulderL', 'x', armPos);
        skeleton.setAngle('shoulderR', 'x', armPos);
    } else {
        // Scissor (running): L noha vpřed, R noha vzad; kontralaterální paže.
        skeleton.setAngle('hipL', 'x', hipFlex + split);
        skeleton.setAngle('hipR', 'x', hipFlex - split);
        // Lead leg (L) mírný knee bend, trailing leg (R) výraznější push-off ohyb.
        skeleton.setAngle('kneeL', 'x', kneeFlex + 20);
        skeleton.setAngle('kneeR', 'x', kneeFlex + 60);
        skeleton.setAngle('shoulderL', 'x', armPos - split);   // L paže vzad
        skeleton.setAngle('shoulderR', 'x', armPos + split);   // R paže vpřed
        skeleton.setAngle('elbowL', 'x', 80);                  // běžecký loket
        skeleton.setAngle('elbowR', 'x', 80);
    }

    // Flag pro demo: při true přeskoč snap-to-floor (postava je v letu).
    params._airborne = isAir;
}

/** Smoothstep — měkký S-křivkový easing 0→1 (žádné trhnutí na hranách). */
function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

// === Registr ================================================================
// Mapa Status → animační funkce. Stickman.animate(dt) v ní vyhledává.
// Stavy bez registrované funkce se chovají jako no-op (postava zůstane
// v poslední pose) — záměrné, ať Stickman nepadá na neimplementovaných stavech.
//
// Pozn.: Dance NENÍ separátní animace, je to preset Status.STAND idle s vyšším
// fraction (= divočejší) + krátkým cycleDuration (= rytmus) + omezeným rootRange
// (= postava neztratí stabilitu). Definuje se v demu inline v setStatus volání.
export const ANIMATIONS = Object.freeze({
    [Status.STAND]: animateStand,
    [Status.SIT]:   animateSit,
    [Status.WALK]:  animateWalk,
    [Status.RUN]:   animateRun,
    [Status.LAY]:   animateLay,
    [Status.CRAWL]: animateCrawl,
    [Status.PRONE]: animateProne,
    [Status.SNEAK]: animateSneak,
    [Status.JUMP]:  animateJump,
    // Zbytek (SWIM, CLIMB, SLEEP) se doplní v F2.x
});
