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

/** Defaultní parametry chůze. Stejné hodnoty jako mělo demo09. */
export const DEFAULTS_WALK = Object.freeze({
    tempo:    0.8,        // Hz — kolik kompletních cyklů (krok L + krok P) za sekundu
    stepAmp:  35,         // ° — max předkop kyčle (amplituda swing nohy)
    kneeLift: 70,         // ° — max ohyb kolena ve fázi swing
    twistAmp: 8,          // ° — counter-rotace hrudníku v rytmu kroku
    swayAmp:  4,          // ° — vrávorání trupu (torso.x flexe), 2× za cyklus
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
 * Defaultní parametry idle / Drift režimu STAND.
 *
 * Drift = budget-based random walk. Otevřený, neperiodický, postava se
 * volně přesouvá k random targetu. Plný rozsah root rotace (±90°) =
 * postava se může nakloňovat až do horizontály.
 *
 * Pro „drift do rytmu" (Dance preset): override `cycleDuration` na 60/BPM
 * a `rootRange` na malou hodnotu (8°), aby postava neztratila stabilitu.
 */
export const DEFAULTS_DRIFT = Object.freeze({
    idle:           true,    // = "zapnout drift" (animateStand to čte)
    fraction:       0.25,    // podíl total range, který se spotřebuje za cyklus
    cycleDuration:  1.4,     // s — doba jedné drift transition
    step:           5,       // bodů — granulárnost rozdělování budgetu (viz IDEAS.md)
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
        const step          = params.step          ?? DEFAULTS_DRIFT.step;
        const rootRange     = params.rootRange     ?? DEFAULTS_DRIFT.rootRange;

        params._drift = {
            from:          fromPose,
            target:        generateDriftTarget(skeleton, fromPose, fraction, step, rootRange),
            cycleStart:    0,
            cycleDuration,
            fraction,
            step,
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
        d.target = generateDriftTarget(skeleton, d.from, d.fraction, d.step, d.rootRange);
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
 * Generuje drift target pózu od `fromPose` přes budget-based random walk.
 *
 * Algoritmus (spec IDEAS.md):
 *   1. Sestav vektor všech aktivních os (joint × axis), N celkem.
 *      + 3 root pseudo-osy (root.x/y/z) s OMEZENÝM rangem (rootRange°).
 *   2. Pool = N × 100 bodů (každá osa = 100 jednotek normalizovaného range).
 *   3. Budget = fraction × pool.
 *   4. Generuj plně random target per osu (uniform v limitech).
 *   5. Iteruj: pick random axis → consume = min(STEP, |delta|, budget) →
 *      posuň intermediate o consume × sign(delta) → odečti od budgetu.
 *   6. Když budget ≤ 0, stop.
 *
 * Root pseudo-osy mají range [-rootRange, +rootRange]° (default 8°), aby drift
 * jen lehce kýval trupem a nikdy postavu neotočil mimo postoj. RootPosition
 * zůstává beze změny (snap-to-floor řeší Y, X/Z se nehýbe).
 */
function generateDriftTarget(skeleton, fromPose, fraction, step, rootRange) {
    // 1. Sestav vektor všech aktivních os.
    // Každý záznam = { kind: 'joint'/'root', joint?, axis, min, max, current }.
    // `kind` rozhoduje, kam se výsledný úhel zapíše (target.angles vs target.rootRotation).
    const axesList = [];

    // 1a. Joint DOF osy
    skeleton.forEachJoint(j => {
        if (j.dof === 0) return;
        for (const ax of j.axes) {
            const [min, max] = j.limits[ax];
            // ?? 0 — pokud osa ve fromPose chybí (= rest), výchozí je 0
            const current = fromPose.angles[j.name]?.[ax] ?? 0;
            axesList.push({ kind: 'joint', joint: j.name, axis: ax, min, max, current });
        }
    });

    // 1b. Root pseudo-osy (3 osy × omezený range)
    for (const ax of ['x', 'y', 'z']) {
        const current = fromPose.rootRotation[ax] ?? 0;
        axesList.push({
            kind: 'root',
            axis: ax,
            min: -rootRange,
            max:  rootRange,
            current,
        });
    }

    const N = axesList.length;
    if (N === 0) return fromPose;     // edge case — žádné DOF (sandbox guard)

    // 2-3. Pool a budget
    const POOL = N * 100;
    let budget = fraction * POOL;

    // 4. Plně random target per osu (full uniform v limits) — to je "ideální cíl",
    // ke kterému se budget walk přibližuje (ne nutně dosáhne).
    const fullTargets = axesList.map(a => a.min + Math.random() * (a.max - a.min));

    // Akumulátor cílových úhlů — start = current, postupně se přibližuje fullTarget.
    const intermediate = axesList.map(a => a.current);

    // 5. Distribuuj budget. `safety` = pojistka proti nekonečnému loopu, kdyby
    // všechny delty byly 0 (nestane se prakticky, ale lepší to ošetřit).
    let safety = 10000;
    while (budget > 0 && safety-- > 0) {
        const idx = Math.floor(Math.random() * N);
        const a = axesList[idx];
        const range = a.max - a.min;
        const targetDeg = fullTargets[idx];
        const currentDeg = intermediate[idx];
        const deltaDeg = targetDeg - currentDeg;
        if (Math.abs(deltaDeg) < 0.01) continue;     // už blízko, vyber jinou
        // Přepočet ° → bodů (100 bodů = full range osy).
        const deltaPoints = Math.abs(deltaDeg) / range * 100;
        const consumePoints = Math.min(step, deltaPoints, budget);
        // Zpět body → ° (ve směru delty).
        const consumeDeg = consumePoints / 100 * range * Math.sign(deltaDeg);
        intermediate[idx] = currentDeg + consumeDeg;
        budget -= consumePoints;
    }

    // 6. Sestav výslednou Pose
    const target = new Pose('drift-target');
    target.rootPosition = { ...fromPose.rootPosition };
    target.rootRotation = { ...fromPose.rootRotation };  // start kopií, root osy přepíšou níže

    for (let i = 0; i < N; i++) {
        const a = axesList[i];
        if (a.kind === 'joint') {
            if (!target.angles[a.joint]) target.angles[a.joint] = {};
            target.angles[a.joint][a.axis] = intermediate[i];
        } else {
            // root pseudo-osa
            target.rootRotation[a.axis] = intermediate[i];
        }
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
    // který nastaví všech 22 os) drželi v ne-přepsaných osách (torso.z,
    // shoulder.z, ...) navždy. Pose.apply by udělal totéž; reset je explicitní.
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
    // Zbytek (SWIM, CLIMB, JUMP, SLEEP, DANCE) se doplní v F2.x
});
