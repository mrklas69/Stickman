// src/library/Poses.js
// =============================================================================
// Knihovna standardních póz pro Minimal kostru.
//
// Každá póza je Pose instance s úhly + (volitelně) rootRotation. Body opory
// NEJSOU součástí pózy — joints jsou supports automaticky a contact body se
// počítají dynamicky (Skeleton.getSupportPoints).
//
// Konvence úhlů viz Skeleton.js (anatomické, kladné = přirozený směr).
// =============================================================================

import { Pose } from '../model/Pose.js';

/** Vyrobí Pose instanci z definice (slovník angles). */
export function makePose(name, angles) {
    const p = new Pose(name);
    p.angles = angles;
    return p;
}

// === Definice póz ==========================================================
// Pojmenovaný export pro každou pózu (= jeden zdroj pravdy, lze importovat selektivně).

/** Rest pose — postava stojí svisle, ruce dolů. */
export const stand = makePose('Stand', {});

/** T-pose — paže rozpažené do strany (anatomická abdukce 90°). */
export const tpose = makePose('T-pose', {
    shoulderL: { x: 0, z: 90 },
    shoulderR: { x: 0, z: 90 },
});

/**
 * Sed s ohnutými koleny — stehna vodorovně dopředu, lýtka svisle dolů.
 * Uvolněné ruce mírně dopředu pro "obydlený" vzhled.
 */
export const sit = makePose('Sit', {
    hipL:  { x: 90 },
    hipR:  { x: 90 },
    kneeL: { x: 90 },
    kneeR: { x: 90 },
    neck:  { x: 15 },
    shoulderL: { x: 30 },
    shoulderR: { x: 30 },
    elbowL: { x: 60 },
    elbowR: { x: 60 },
});

/** Sed s nataženýma nohama (= postava sedí, nohy vpřed jako na zemi). */
export const sitLegsForward = makePose('Sed (nohy vpřed)', {
    hipL: { x: 90 },
    hipR: { x: 90 },
    shoulderL: { x: -20 },
    shoulderR: { x: -20 },
});

/** Plný dřep — kyčle a kolena na maximu, ruce vpřed pro rovnováhu. */
export const squat = makePose('Squat', {
    hipL:  { x: 100 },
    hipR:  { x: 100 },
    kneeL: { x: 130 },
    kneeR: { x: 130 },
    shoulderL: { x: 70, z: 5 },
    shoulderR: { x: 70, z: 5 },
    neck: { x: 25 },
});

/** Mávání pravou rukou — paže nad hlavu, loket ohnutý. */
export const wave = makePose('Wave', {
    shoulderR: { x: 0, z: 160 },
    elbowR:    { x: 90 },
    neck:      { x: 0, z: -10 },
});

/**
 * Předklon — hlavně užitečné pro test STABILITY (CoM se posune
 * dopředu mimo polygon mezi chodidly → padá).
 */
export const leanForward = makePose('Předklon', {
    hipL: { x: 70 },
    hipR: { x: 70 },
    neck: { x: 30 },
});

/**
 * Stoj na levé noze — pravá pokrčená, ruce do stran.
 * Contact: ankleL (= dynamicky, ankleR je nahoru po pokrčení).
 */
export const oneLegL = makePose('Stoj na L noze', {
    hipR:  { x: 30, z: -20 },
    kneeR: { x: 90 },
    shoulderL: { x: 0, z: 70 },
    shoulderR: { x: 0, z: 70 },
});

/** Stoj na pravé noze — zrcadlo oneLegL. */
export const oneLegR = makePose('Stoj na P noze', {
    hipL:  { x: 30, z: -20 },
    kneeL: { x: 90 },
    shoulderL: { x: 0, z: 70 },
    shoulderR: { x: 0, z: 70 },
});

/** Krok dopředu (lunge) — levá vepředu, pravá vzadu, oba support. */
export const lunge = makePose('Krok dopředu', {
    hipL: { x: 60 },
    kneeL: { x: 30 },
    hipR: { x: -10 },
    kneeR: { x: 30 },
    shoulderL: { x: 30 },
    shoulderR: { x: -30 },
});

/**
 * Kapalásana (klasický stoj na hlavě) — vzhůru nohama,
 * tripod opora hlava + obě dlaně. Paže rovné, abdukce do strany.
 *
 * Geometrie (pro H=8, pelvisY=-0.69, FLOOR_Y=-4):
 *   - ramena ve výšce -3.25 (= 0.75 nad podlahou)
 *   - shoulder.z = 101° = paže pod úhlem 11° pod horizontálou
 *   - paže rovná, dlaň přesně klesne na podlahu po 3.92 j (UPPER_ARM+FOREARM)
 *
 * Demo musí nastavit `rootRotation.x = 180` PO `pose.apply()` a `rootPosition.y`
 * tak, aby hlava sedla na podlahu (snapToFloor by srovnal nejnižší support pivot,
 * ne hlavu — viz demo14_headsupport).
 *
 * Body opory: temeno hlavy + obě zápěstí.
 */
export const kapalasana = makePose('Kapalásana', {
    shoulderL: { z: 101 },        // abdukce — paže ven do strany dolů
    shoulderR: { z: 101 },
    // elbow.x = 0 (rovná paže — dlaně jako koncový bod)
    neck:      { x: 60 },         // brada k hrudi: temeno mířit k podlaze
});
kapalasana.rootRotation = { x: 180, y: 0, z: 0 };

/**
 * Pincha s temenem (forearm stand variant) — vzhůru nohama,
 * tripod opora hlava + oba lokty. Předloktí horizontálně, do +Z (od kamery).
 *
 * Geometrie:
 *   - shoulder.z = 113° = paže klesne přesně 0.75 j na úroveň podlahy
 *   - elbow.x = 90° = forearm rotace 90° → forearm horizontálně do +Z
 *   - lokty v ±2.41 (užší polygon než Kapalásana = labilnější)
 *
 * Body opory: temeno hlavy + oba lokty.
 */
export const pincha = makePose('Pincha s temenem', {
    shoulderL: { z: 113 },
    shoulderR: { z: 113 },
    elbowL:    { x: 90 },          // forearm 90° → horizontálně do +Z ve world
    elbowR:    { x: 90 },
    neck:      { x: 60 },
});
pincha.rootRotation = { x: 180, y: 0, z: 0 };

// === LEHY (lying poses) ====================================================
// Postava leží vodorovně. Klíč: rootRotation.x = ±90 + body opory na celé délce
// trupu (head, ramena, pelvis, kotníky), aby snap-to-floor srovnal panáka přesně
// na podlahu, ne nejnižší kotník (default supportPoints by způsobil propad pelvis
// pod podlahu).

/**
 * Leh na zádech (kompaktní) — paže podél těla, paty u sebe.
 * Hlava v +Z (od kamery), nohy v -Z (ke kameře).
 *
 * Mírná addukce v kyčlích (hip.z = -6°) skloní stehna k ose těla tak, aby
 * kotníky skončily přibližně na X = 0 (dotyk pat). Geometrie: HIP_X = 0.4,
 * THIGH+SHIN = 3.92, sin(α) = 0.4/3.92 ≈ 0.102 → α ≈ 6°.
 *
 * Body opory: týl hlavy + ramena (lopatky) + pelvis + kotníky = 6 bodů.
 * Po Rx(90°) jsou všechny tyto body lokálně na Y = 0 → snap srovná na podlahu.
 */
export const layBack = makePose('Leh na zádech – kmen',
    { hipL: { z: -6 }, hipR: { z: -6 } }
);
layBack.rootRotation = { x: 90, y: 0, z: 0 };

/**
 * Leh — hvězdice (starfish): paže rozhozené 90° do stran, nohy mírně rozkročené.
 *   - shoulder.z = 70 → paže do stran (mezi 90° abdukce a 120° max)
 *   - hip.z = 30 → nohy mírně ven (signZ -1 pro L, +1 pro R = symetrie)
 *
 * Body opory: stejné jako layBack (X-shape v rovině podlahy).
 */
export const layStarfish = makePose('Leh na zádech – hvězdice', {
    shoulderL: { z: 70 }, shoulderR: { z: 70 },
    hipL: { z: 30 },      hipR: { z: 30 },
});
layStarfish.rootRotation = { x: 90, y: 0, z: 0 };

/**
 * Polosed (relax) — postava nakloněná dozadu o 60°, opírá se o forearmy.
 * Asymetrie nohou: levá natažená, pravá pokrčená nahoru (jako lounging).
 * Mírný předklon trupu kompenzuje rotaci rooty — celkově "casual lean back".
 *
 *   - rootRotation.x = 60°
 *   - torso.x = 30 → silný předklon (ze záklonu rooty drží trup šikmo nahoru)
 *   - neck.x = 18 → hlava lehce předkloněná, kouká před sebe
 *   - shoulder.x = -28..-30, z = 26 → paže zapažené ven do strany (forearm support)
 *   - elbow.x = 90 → předloktí svisle k podlaze
 *   - hipL.x = 40, hipR.x = 70, kneeR.x = 80 → asymetrie: levá natažená,
 *     pravá pokrčená v kyčli + koleni (= "jedna noha přes druhou")
 *
 * Body opory: pelvis + lokty + kotníky = 5 bodů (ramena a hlava jsou nad).
 */
export const layRecline = makePose('Polosed (relax)', {
    torso:     { x: 30 },
    neck:      { x: 18 },
    shoulderL: { x: -36, z: 26 },                 // levá paže víc zapažená (asymetrie)
    elbowL:    { x: 90 },
    shoulderR: { x: -30, z: 26 },
    elbowR:    { x: 90 },
    // hipL.x = 25 → s rootRotation.x = 65, stehno přibližně horizontálně
    // (geometrie: hipL.x + rootRotation.x ≈ 90° → ankle blízko podlahy).
    hipL:      { x: 25, z: 10 },                  // levá noha natažená podél podlahy
    hipR:      { x: 70, z: 10 },                  // pravá silně pokrčená v kyčli
    kneeR:     { x: 80 },                         // pravé koleno pokrčené (levé natažené, x=0)
});
layRecline.rootRotation = { x: 65, y: 0, z: 0 };

/**
 * Leh na břiše — čtenář (Sphinx s knihou). Trup zvednutý ze země přes záklon
 * v pase + částečnou rotaci rooty (-70°). Levá paže opřená o forearm, pravá
 * silně ohnutá v lokti — ruka pod hlavou. Mírně pokrčené nohy stabilizují tělo.
 *
 * Drobné nesymetrie v hipL/R a shoulder.z jsou záměrné — postava se opírá
 * víc na pravou stranu (drží knihu / hlavu). Strofu lze zrcadlit změnou
 * vzájemných hodnot pro zrcadlovou variantu.
 */
/**
 * Leh na zádech – pohoda (snílek na louce). Ruce ohnuté za hlavou (= podpíraně
 * pod zátylkem), nohy mírně od sebe, kolena pokrčená s chodidly na podlaze,
 * hlava lehce nadzvednutá (kouká před sebe / na hrudník).
 *
 *   - torso.x = 5 → mírná flexe trupu (hlava trochu zdvižená)
 *   - neck.x = 40 → hlava výrazně vzhůru = kouká k nohám/hrudníku
 *   - shoulder.x = 110 + z = 50 → paže ven a nahoru (rozhozené lokty)
 *   - elbow.x = 150 → silně ohnutý → předloktí jde za hlavu k zátylku
 *   - hip.x = 35 + z = 25 → kolena diagonálně + abdukce
 *   - knee.x = 80 → chodidla na podlaze
 */
export const layChill = makePose('Leh na zádech – pohoda', {
    torso:     { x: 5 },
    neck:      { x: 40 },
    shoulderL: { x: 110, z: 50 }, shoulderR: { x: 110, z: 50 },
    elbowL:    { x: 150 },        elbowR:    { x: 150 },
    hipL:      { x: 35, z: 25 },  hipR:      { x: 35, z: 25 },
    kneeL:     { x: 80 },         kneeR:     { x: 80 },
});
layChill.rootRotation = { x: 90, y: 0, z: 0 };

/**
 * Leh na pravém boku – spaní. Postava leží na pravém boku, nohy pokrčené
 * přes sebe (horní = levá víc pokrčená), ruce složené v "modlitbě" pod tváří.
 *
 *   - rootRotation.z = -90 → otočení kolem osy Z (= leh na pravém boku;
 *     postavova vertikální osa +Y → world +X, pravá strana +X → world -Y dolů).
 *   - shoulder.x = 90, z = 5 → obě paže kupředu, lehce dovnitř (k sobě)
 *   - elbow.x = 90 → předloktí kolmá k paži (= ruce před tváří)
 *   - neck.x = 15 → hlava lehce předkloněná (přirozené pro spánek)
 *   - hipL větší flexe + hipR menší → horní noha víc pokrčená (spánková poloha)
 *
 * Body opory: pravá strana těla — shoulderR, pelvis, hipR, kneeR, ankleR.
 */
export const laySide = makePose('Leh na boku – spaní', {
    neck:      { x: 15 },
    // Asymetrie ramen je záměrná: levá ruka víc dovnitř (= horní v boku, k tváři),
    // pravá méně dovnitř (= spodní, podpírá hlavu).
    shoulderL: { x: 90, z: -30 },
    elbowL:    { x: 90 },
    shoulderR: { x: 95, z: -12 },
    elbowR:    { x: 90 },
    // Addukce hipL/R kompenzuje strukturální HIP_X offset tak, aby ankleL/R.X
    // v lokálu pelvisu byl ≈ 0 → po Rz(-90°) jsou kotníky ve world Y = pelvis Y.
    // Hodnoty počítané: hipL.z = -arcsin(HIP_X / |kneeL_chain|) pro horní nohu,
    // hipR.z = -arcsin(HIP_X / |kneeR_chain|) pro spodní; chain délka liší podle
    // flexe v koleni → asymetrické hodnoty.
    hipL:      { x: 60, z: -12 },             // horní noha
    kneeL:     { x: 90 },
    hipR:      { x: 30, z: -8 },              // spodní noha
    kneeR:     { x: 60 },
});
laySide.rootRotation = { x: 0, y: 0, z: -90 };

export const layReader = makePose('Leh na břiše – čtenář', {
    torso:     { x: -30 },                  // max záklon (lumbar extension)
    neck:      { z: -10 },                  // hlava lehce nakloněná
    shoulderL: { x: 65, z: 20 },            // levá paže předpažená, mírně ven
    elbowL:    { x: 60 },                   // loket ohnutý — forearm na podlaze
    shoulderR: { x: 75, z: 15 },            // pravá paže výš
    elbowR:    { x: 160 },                  // silně ohnutá → ruka pod hlavou
    hipL:      { x: -20, z: 15 },           // levá noha mírně dozadu+ven
    kneeL:     { x: 130 },                  // levé koleno silně pokrčené
    hipR:      { x: -20, z: 10 },           // pravá noha méně rozkročená
    kneeR:     { x: 20 },                   // pravé koleno mírně pokrčené
});
layReader.rootRotation = { x: -70, y: 0, z: 0 };

// === Sady poses pro snadný import =========================================

/** Základní pózy (vhodné pro většinu dem). */
export const BASIC_POSES = { stand, tpose, wave, sit, squat };

/** Pózy zaměřené na test stability / bodů opory. */
export const BALANCE_POSES = { stand, tpose, wave, leanForward, oneLegL, oneLegR, lunge };

/** Pózy s hlavou jako součástí opory (vzhůru nohama). */
export const HEAD_SUPPORT_POSES = { kapalasana, pincha };

/** Lehové pózy (vodorovně, opora celý trup). Pořadí odpovídá UI sekci LEHY. */
export const LIE_POSES = {
    layBack, layStarfish, layChill, laySide, layReader, layRecline,
};
