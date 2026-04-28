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
//   - žádné blending mezi animacemi (zatím přepínání tvrdé)
//   - žádný root-motion (postava chodí na místě, posun = věc dema)
//   - žádný state — animace je čistá funkce času + parametrů
//
// Prototyp F2 implementuje jen STAND a WALK (zbytek se doplní postupně).
// =============================================================================

import { Status } from './Status.js';
import { stand, sit, layBack } from '../library/Poses.js';

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
// Idempotentní animace — každý frame aplikuje rest pose.
// (pose.apply() volá skel.reset() interně, takže přebije případné zbytky
// po předchozí animaci.)
function animateStand(skeleton, _time, _params) {
    stand.apply(skeleton);
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

// === Registr ================================================================
// Mapa Status → animační funkce. Stickman.animate(dt) v ní vyhledává.
// Stavy bez registrované funkce se chovají jako no-op (postava zůstane
// v poslední pose) — záměrné, ať Stickman nepadá na neimplementovaných stavech.
export const ANIMATIONS = Object.freeze({
    [Status.STAND]: animateStand,
    [Status.SIT]:   animateSit,
    [Status.WALK]:  animateWalk,
    [Status.LAY]:   animateLay,
    // Zbytek (RUN, SWIM, CLIMB, JUMP, SLEEP, DANCE) se doplní v F2.x
});
