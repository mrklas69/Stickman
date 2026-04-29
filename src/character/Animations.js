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
        tempo:       1.6,    // Hz (= 2× rychlejší než walk default)
        stepAmp:     50,     // ° — větší rozkrok než walk
        kneeLift:    95,     // ° — vyšší zdvih kolena (pata přibližně k zadku)
        twistAmp:    12,     // ° — výraznější counter-rotation hrudníku
        swayAmp:     6,      // ° — výraznější sway (silnější otřesy v kroku)
        forwardLean: 10,     // ° — předklon trupu (těžiště vpřed)
        elbowBase:   80,     // ° — base ohyb lokte (běžec drží paže pokrčené)
        armSwing:    true,
    }),
    sprint: Object.freeze({
        tempo:       2.4,    // Hz (= 3× walk)
        stepAmp:     65,     // ° — max rozkrok (anatomický limit hipL/R.x = ±60..70)
        kneeLift:    150,    // ° — vysoký knee drive (sprint pulls knee up to chest level)
        twistAmp:    18,     // ° — silný twist (rotace ramen-pánev v rytmu)
        swayAmp:     8,
        forwardLean: 30,     // ° — výrazný předklon (sprint posture, váha vpřed)
        elbowBase:   95,     // ° — loket skoro pravý úhel
        armSwing:    true,
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
export const DEFAULTS_PRONE = Object.freeze({
    tempo:          0.4,    // Hz — jeden plný cyklus (BASE → INVERSE → BASE) trvá 2.5 s
    undulationAmp:  10,     // ° — amplituda hadího vlnění torsa
    liveAmp:         5,     // ° — amplituda „live" wiggle končetin v rest fázích (Sezení 9)
});

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
    // Sync s aktuálními params — slider Neklid mohl změnit fraction.
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

// === PRONE (plížení / commando crawl) ======================================
// Animace = smooth-step lerp mezi dvěma klíčovými pózami:
//   BASE    — pravá strana nápřahuje (authored v Inspectoru uživatelem).
//   INVERSE — zrcadlené L↔R (levá strana nápřahuje).
// Cyklus: BASE → INVERSE → BASE (jeden plný = base+inverse).

// Mapa pro mirror L↔R: jaký joint nahradit jakým při zrcadlení pózy.
const PRONE_SWAP_LR = Object.freeze({
    shoulderL: 'shoulderR', shoulderR: 'shoulderL',
    elbowL:    'elbowR',    elbowR:    'elbowL',
    hipL:      'hipR',      hipR:      'hipL',
    kneeL:     'kneeR',     kneeR:     'kneeL',
});

/** Vyrobí zrcadlenou pose (přejmenuje L↔R joints; rootRotation kopíruje).
 *  Anatomická konvence je symetrická (kladné = ven od těla pro obě strany,
 *  kladné Y = vnější rotace pro obě strany), takže stačí přejmenovat — bez
 *  negace hodnot.
 */
function mirrorPoseLR(pose) {
    const out = new Pose(pose.name + '-mirror');
    out.rootPosition = { ...pose.rootPosition };
    out.rootRotation = { ...pose.rootRotation };
    for (const [joint, angles] of Object.entries(pose.angles)) {
        const target = PRONE_SWAP_LR[joint] || joint;
        out.angles[target] = { ...angles };
    }
    return out;
}

// BASE pose — authored uživatelem v Inspectoru (Sezení 9). Pravá strana
// nápřahuje: pravá paže vpřed-natažená, levá paže opřená pod hrudí,
// levá noha rovně dozadu, pravé koleno přitažené do strany („žába").
const PRONE_BASE = (() => {
    const p = new Pose('prone-base');
    p.angles = {
        torso:     { x: -11 },
        neck:      { x: -60 },
        shoulderL: { x: 59, y:  12, z: 69 },
        elbowL:    { x: 86 },
        shoulderR: { x: 73, y: -78, z: 79 },
        elbowR:    { x: 16 },
        hipL:      { x:  2, y: -22, z:  5 },
        hipR:      { x: 84, y:  -3, z: 80 },
        kneeR:     { x: 97 },
    };
    p.rootRotation = { x: -87, y: 0, z: 0 };
    // rootPosition.y = -3.49 = FLOOR_Y(-4) + 0.51 (= pelvis sedí 0.51 j nad
    // podlahou, pelvis sphere má radius 0.32). Authored value z Inspectoru;
    // demo02 musí mít stejný FLOOR_Y aby pose seděla.
    p.rootPosition = { x: 0, y: -3.49, z: 0 };
    return p;
})();
const PRONE_INVERSE = mirrorPoseLR(PRONE_BASE);

/** Vyrobí pose jako lineární kombinaci 3 pos: result = α·a + β·b + γ·c.
 *  Použito k výpočtu Bezier control pointu (= aby curve prošla MID exact).
 */
function poseAffineCombo(a, b, c, alpha, beta, gamma) {
    const out = new Pose('combo');
    const linAxis = (va, vb, vc) => alpha * (va ?? 0) + beta * (vb ?? 0) + gamma * (vc ?? 0);
    out.rootPosition = {
        x: linAxis(a.rootPosition.x, b.rootPosition.x, c.rootPosition.x),
        y: linAxis(a.rootPosition.y, b.rootPosition.y, c.rootPosition.y),
        z: linAxis(a.rootPosition.z, b.rootPosition.z, c.rootPosition.z),
    };
    out.rootRotation = {
        x: linAxis(a.rootRotation.x, b.rootRotation.x, c.rootRotation.x),
        y: linAxis(a.rootRotation.y, b.rootRotation.y, c.rootRotation.y),
        z: linAxis(a.rootRotation.z, b.rootRotation.z, c.rootRotation.z),
    };
    const allJoints = new Set([
        ...Object.keys(a.angles), ...Object.keys(b.angles), ...Object.keys(c.angles),
    ]);
    for (const j of allJoints) {
        const ja = a.angles[j] || {}, jb = b.angles[j] || {}, jc = c.angles[j] || {};
        const allAxes = new Set([...Object.keys(ja), ...Object.keys(jb), ...Object.keys(jc)]);
        out.angles[j] = {};
        for (const ax of allAxes) {
            out.angles[j][ax] = linAxis(ja[ax], jb[ax], jc[ax]);
        }
    }
    return out;
}


// MID pose (Sezení 9): authored uživatelem v Inspectoru — PŘECHODOVÝ frame
// mezi BASE a INVERSE. NENÍ to keyframe k držení; cyklus přes MID jen prochází.
// Tělo je „rozpláclá žába" — všechny 4 končetiny hluboce ohnuté pod tělo
// (hipy ~95°, knees 90°), připomíná push-up start.
//
// Cyklus = dvojtaktní rytmus chůze (Sezení 9):
//   beat 1: BASE → INVERSE (pasuje skrz MID v půli kroku)
//   beat 2: INVERSE → BASE (zase skrz MID)
// Implementace přes kvadratický Bezier — MID je control point upravený tak,
// aby B(0.5) = MID exactly. Tím se zabezpečí spojitá rychlost při průchodu
// MID (žádný pause).
const PRONE_MID = (() => {
    const p = new Pose('prone-mid');
    p.angles = {
        torso:     { x: -16 },
        neck:      { x: -60 },
        shoulderL: { x:  84, z: 73 },
        elbowL:    { x:  90 },
        shoulderR: { x:  89, z: 80 },
        elbowR:    { x:  90 },
        hipL:      { x:  94, z: 80 },
        kneeL:     { x:  90 },
        hipR:      { x: 100, z: 80 },
        kneeR:     { x:  90 },
    };
    p.rootRotation = { x: -98, y: 0, z: 0 };
    p.rootPosition = { x: 0, y: -3.57, z: 0 };
    return p;
})();

// Bezier control point: B(0.5) = 0.25·start + 0.5·CTRL + 0.25·end = MID
// → CTRL = 2·MID − 0.5·start − 0.5·end. Symetrie BASE↔INVERSE → jeden CTRL stačí.
const PRONE_CTRL = poseAffineCombo(PRONE_MID, PRONE_BASE, PRONE_INVERSE, 2, -0.5, -0.5);

function animateProne(skeleton, time, params) {
    const p = { ...DEFAULTS_PRONE, ...params };
    const phase = (time * p.tempo) % 1;

    // Dvojtaktní rytmus chůze (Sezení 9):
    //   beat 1: 0.0..0.5: BASE → INVERSE (passes through MID at phase 0.25)
    //   beat 2: 0.5..1.0: INVERSE → BASE (passes through MID at phase 0.75)
    // Implementováno jako kvadratický Bezier přes (start, ctrl, end) s
    // ctrl = 2·MID − 0.5·start − 0.5·end → curve B(0.5) = MID přesně.
    // Smoothstep easing na halfT = walking-rhythm acceleration: pomalé start,
    // max rychlost při průchodu MID, pomalý dojezd na end. ŽÁDNÝ pause na MID.
    let halfT, from, to;
    if (phase < 0.5) {
        halfT = phase * 2;
        from = PRONE_BASE;    to = PRONE_INVERSE;
    } else {
        halfT = (phase - 0.5) * 2;
        from = PRONE_INVERSE; to = PRONE_BASE;
    }

    const eased = halfT * halfT * (3 - 2 * halfT);

    // Quadratic Bezier via de Casteljau:
    //   B(t) = lerp(lerp(from, ctrl, t), lerp(ctrl, to, t), t)
    const p1 = Pose.lerp(from, PRONE_CTRL, eased);
    const p2 = Pose.lerp(PRONE_CTRL, to,    eased);
    const blended = Pose.lerp(p1, p2, eased);
    blended.apply(skeleton);

    // Hadí vlnění (Sezení 9) — tělo se v rytmu cyklu kroutí na stranu propelling.
    // Cyklus: -cos(2π·phase) → BASE -1 (= zkroucené vpravo / pravá strana propeluje),
    // MID 0, INVERSE +1, MID 0, BASE -1.
    // torso.y = twist (rotace kolem páteře); torso.z = lateral flexe (úklon).
    // Krk dělá protitwist polovičním rozsahem — hlava drží směr i přes pohyby trupu.
    const wave = -Math.cos(2 * Math.PI * phase);
    const A = p.undulationAmp;
    skeleton.setAngle('torso', 'y', wave * A);
    skeleton.setAngle('torso', 'z', wave * A * 0.5);
    skeleton.setAngle('neck',  'y', -wave * A * 0.5);
    skeleton.setAngle('neck',  'z', -wave * A * 0.3);

    // „Live" wiggle končetin (Sezení 9) — drobné back-and-forth pohyby per
    // končetina, frekvence 2× cyklus = jedna oscilace na rest fázi končetiny.
    // Contralateral páry (= komando-crawl rytmus):
    //   pair A: pravá paže + levá noha (= aktivní v phase 0.75..1.0, wiggle jindy)
    //   pair B: levá paže + pravá noha (= aktivní v 0.25..0.5, wiggle jindy)
    // Páry jsou v anti-phase → když pair A propeluje, pair B drží podporu
    // a zároveň jemně wiggle, a naopak.
    const cycleA = Math.sin(4 * Math.PI * phase);   // 2× cycle freq
    const cycleB = -cycleA;                          // anti-phase
    const L = p.liveAmp;

    // Pair A — pravá paže + levá noha
    skeleton.setAngle('shoulderR', 'x', skeleton.joints.shoulderR.angles.x + cycleA * L);
    skeleton.setAngle('elbowR',    'x', skeleton.joints.elbowR.angles.x    + cycleA * L * 0.6);
    skeleton.setAngle('hipL',      'x', skeleton.joints.hipL.angles.x      + cycleA * L * 1.2);
    skeleton.setAngle('kneeL',     'x', skeleton.joints.kneeL.angles.x     + cycleA * L * 0.8);

    // Pair B — levá paže + pravá noha
    skeleton.setAngle('shoulderL', 'x', skeleton.joints.shoulderL.angles.x + cycleB * L);
    skeleton.setAngle('elbowL',    'x', skeleton.joints.elbowL.angles.x    + cycleB * L * 0.6);
    skeleton.setAngle('hipR',      'x', skeleton.joints.hipR.angles.x      + cycleB * L * 1.2);
    skeleton.setAngle('kneeR',     'x', skeleton.joints.kneeR.angles.x     + cycleB * L * 0.8);
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

    // Paže ohnuté blízko tělu, drobný swing (cca polovina walk amplitudy)
    if (p.armSwing) {
        const shL = -R.hip * 0.4;
        const shR = -L.hip * 0.4;
        skeleton.setAngle('shoulderL', 'x', shL);
        skeleton.setAngle('shoulderR', 'x', shR);
        skeleton.setAngle('elbowL', 'x', p.elbowBase + Math.abs(shL) * 0.5);
        skeleton.setAngle('elbowR', 'x', p.elbowBase + Math.abs(shR) * 0.5);
    } else {
        skeleton.setAngle('shoulderL', 'x', 0);
        skeleton.setAngle('shoulderR', 'x', 0);
        skeleton.setAngle('elbowL',    'x', p.elbowBase);
        skeleton.setAngle('elbowR',    'x', p.elbowBase);
    }
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
    // Zbytek (SWIM, CLIMB, JUMP, SLEEP, DANCE) se doplní v F2.x
});
