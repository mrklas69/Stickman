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
 * Sed na židli — neformální sed na neviditelné židli, s vědomou asymetrií:
 * levá paže silně pokrčená do strany (= ruka u tváře / přes opěrku), pravá
 * visí dolů uvolněně. Nohy pootočené (různý turn-out v kyčlích).
 *
 *   - torso.x = 8 → drobný předklon trupu
 *   - neck.x = 15 → mírná flexe hlavy (kouká kupředu / dolů)
 *   - hipL.x = 117, y = 50, z = -10 → silná flexe + max turn-out + addukce
 *     (nohu jakoby přes druhou)
 *   - hipR.x = 103, y = 21, z = -3 → flexe + drobný turn-out
 *   - knee.x = 105 / 115 → mírně pokrčená kolena
 *   - shoulderL.x = 33, y = -37, z = 54 → levá paže ven do strany,
 *     vnitřní rotace
 *   - elbowL.x = 140 → silně pokrčená levá (ruka k hlavě / přes opěrku)
 *   - shoulderR.x = 44, y = -55 → pravá paže drobně předpažená dolů,
 *     výrazná vnitřní rotace
 *   - elbowR.x = 60 → mírně pokrčená pravá
 *
 * Body opory: pelvis + paty (po snapu) — postava balancuje na neviditelné
 * židli, kolena ji nesou.
 */
export const sit = makePose('Sed na židli', {
    torso:     { x: 8 },
    neck:      { x: 15 },
    shoulderL: { x: 33, y: -37, z: 54 },
    elbowL:    { x: 140 },
    shoulderR: { x: 44, y: -55 },
    elbowR:    { x: 60 },
    hipL:      { x: 117, y: 50, z: -10 },
    kneeL:     { x: 105 },
    hipR:      { x: 103, y: 21, z: -3 },
    kneeR:     { x: 115 },
});

/**
 * Dlouhý sed (dandasana) — postava sedí na zemi s nataženými nohami vpřed,
 * ruce opřené trochu vzadu (dlaně na zemi za pánví). Žádná rotace kostry.
 *   - torso.x = 3 → drobný předklon trupu (uvolněný sed)
 *   - hip.x = 90 → flexe (stehna kupředu vodorovně)
 *   - hip.y = -8 → mírná vnitřní rotace (špičky lehce dovnitř, paralelní paty)
 *   - hip.z = 12 → mírná abdukce
 *   - knee.x = 12 → soft ohyb kolen
 *   - shoulder.x = -33 → zapažení (ruce dozadu k opěrnému bodu)
 *   - shoulder.y = -18 → vnitřní rotace paže (palec dovnitř, dlaně dolů na zem)
 *   - shoulder.z = 20 → abdukce (ruce ven od trupu, mimo pánev)
 *   - elbow.x = 18 → drobný ohyb lokte
 *
 * Body opory (dynamic): pelvis + paty + zápěstí (opřené dlaně).
 */
export const sitLegsForward = makePose('Dlouhý sed', {
    torso:     { x: 3 },
    hipL:      { x: 90, y: -8, z: 12 },
    hipR:      { x: 90, y: -8, z: 12 },
    kneeL:     { x: 12 },
    kneeR:     { x: 12 },
    shoulderL: { x: -33, y: -18, z: 20 },
    shoulderR: { x: -33, y: -18, z: 20 },
    elbowL:    { x: 18 },
    elbowR:    { x: 18 },
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

/**
 * Klanění (bow / kowtow / sa-kei-rei) — postava má pelvis silně překlopen
 * dopředu (rootRotation.x = -136°), nohy téměř rovně dozadu (knee 6°), pelvis
 * přitažen ke kolenním kloubům (hip.x = 140°), trup ještě dál v předklonu
 * (torso.x = 30°), paže vpřed v ohnutém lokti (klanějící gesto).
 *
 *   - rootRotation.x = -136° → kostra silně překlopená vpřed (vrch postavy
 *     míří k -Z + dolů, paty nahoru a vzad)
 *   - torso.x = 30 → další předklon trupu
 *   - neck.x = 18 → mírná flexe hlavy (čelo k podlaze)
 *   - hip.x = 140 → max flexe (stehna těsně k trupu po překlopení)
 *   - hip.z = 3 → drobná abdukce (kolena lehce ven)
 *   - knee.x = 6 → téměř rovné nohy (lýtka v prodloužení stehen)
 *   - shoulder.x = 73 → předpažení (paže před tělem po rotaci kostry = vpřed
 *     a dolů k zemi)
 *   - shoulder.y = -73 → silná vnitřní rotace (palec dolů, dlaně k zemi)
 *   - shoulder.z = 19 → drobná abdukce (paže lehce ven od trupu)
 *   - elbow.x = 82 → ohnutý loket (= dlaně před hlavou, ne plně natažené)
 *
 * Body opory: dlaně + čelo + špičky chodidel (= "kowtow tripod").
 *
 * Asymetrie z manual fittingu byla sjednocena na průměry — později plánujeme
 * automatické kývání/šum pro přirozenou asymetrii.
 */
export const bow = makePose('Klanění', {
    torso:     { x: 30 },
    neck:      { x: 18 },
    shoulderL: { x: 73, y: -73, z: 19 },
    shoulderR: { x: 73, y: -73, z: 19 },
    elbowL:    { x: 82 },
    elbowR:    { x: 82 },
    hipL:      { x: 140, z: 3 },
    hipR:      { x: 140, z: 3 },
    kneeL:     { x: 6 },
    kneeR:     { x: 6 },
});
bow.rootRotation = { x: -136, y: 0, z: 0 };

/**
 * Arabeska (balet, 2. poloha) — stoj na levé noze, pravá natažená vzad,
 * trup horizontálně dopředu, paže rozpažené v kontrapozici (levá lehce
 * vpřed, pravá lehce vzad — typický baletní detail).
 *
 *   - rootRotation.x = -83 → kostra téměř horizontálně dopředu (vrch těla
 *     míří k -Z)
 *   - torso.x = -11 → mírný záklon trupu (= držení vznešené linie)
 *   - neck.x = -19 → záklon hlavy (kouká kupředu po horizontalizaci)
 *   - shoulderL.x = 5, shoulderR.x = -5 → asymetrie záměrná: levá paže
 *     drobně vpřed, pravá vzad (= "ladná linie" arabesque)
 *   - shoulder.y = 10 → drobná vnější rotace (palce vzhůru)
 *   - shoulder.z = 100 → abdukce do stran (ramena odtažená od trupu)
 *   - hipR.x = 90 → pravá noha vodorovně (po -83° rotaci kostry = noha
 *     natažená vzad rovně)
 *   - kneeR.x = 9 → noha skoro rovná (= klasická arabesque linie)
 *   - levá noha = bez úhlů (stojná, kolmá k podlaze po rotaci)
 *
 * Body opory: kotník levé nohy.
 *
 * Asymetrie y/z ramen sjednocena na průměry; X (5° vs -5°) ponechána —
 * je to esence pose.
 */
export const arabesque = makePose('Arabeska', {
    torso:     { x: -11 },
    neck:      { x: -19 },
    shoulderL: { x: 5, y: 10, z: 100 },
    shoulderR: { x: -5, y: 10, z: 100 },
    hipR:      { x: 90 },
    kneeR:     { x: 9 },
});
arabesque.rootRotation = { x: -83, y: 0, z: 0 };

/**
 * Protažení (lateral stretch) — stoj s úklonem trupu do strany, levá paže
 * natažená vzhůru (s pokrčeným loktem nad hlavou), pravá zapažená a silně
 * pokrčená v lokti (= ruka za zády / na bok). Asymetrie je celá podstata
 * pose, sjednocují se jen y rotace ramen (= manual fitting noise).
 *
 *   - rootRotation.z = -19 → mírný úklon celé kostry do strany
 *   - torso.z = -30 → max úklon trupu (= součet kostra+trup ≈ -49°)
 *   - torso.x = 2 → drobný předklon
 *   - neck.x = 15, y = -4, z = -29 → hlava následuje úklon, lehký twist
 *   - shoulderL.x = 56, z = 99 → levá paže vzhůru (předpažení + abdukce)
 *   - elbowL.x = 72 → loket pokrčený (= dlaň nad hlavou)
 *   - shoulderR.x = -69, z = 60 → pravá paže zapažená + abdukce dolů
 *   - elbowR.x = 111 → silně ohnutý loket (= ruka za zády / na bok)
 *   - shoulder.y = -24 → vnitřní rotace obou paží
 *   - hipR.z = 44 → pravá noha mírně ven (rozšíření opory)
 *   - hipL.z = -10 → levá noha lehce dovnitř (kompenzace úklonu)
 *   - knee.x = 16 → obě kolena drobně pokrčená (uvolněný stoj)
 *
 * Body opory: oba kotníky (asymetrické rozkročení).
 */
export const stretch = makePose('Protažení', {
    torso:     { x: 2, z: -30 },
    neck:      { x: 15, y: -4, z: -29 },
    shoulderL: { x: 56, y: -24, z: 99 },
    elbowL:    { x: 72 },
    shoulderR: { x: -69, y: -24, z: 60 },
    elbowR:    { x: 111 },
    hipL:      { z: -10 },
    kneeL:     { x: 16 },
    hipR:      { z: 44 },
    kneeR:     { x: 16 },
});
stretch.rootRotation = { x: 0, y: 0, z: -19 };

/**
 * Stoj na hlavě (sirsasana, supported headstand) — postava vzhůru nohama,
 * hlava na zemi, paže ohnuté v lokti pro podporu hlavy. Liší se od
 * `kapalasana` (stand-on-head s rovnýma rukama do strany jako tripod):
 * tady jsou paže vepředu s lokty u hlavy, "supportive" varianta.
 *
 *   - rootRotation.x = -180 → kostra úplně otočená (= +180, ekvivalentní)
 *   - torso.x = -7 → mírný záklon trupu (drobné srovnání linie)
 *   - neck.x = 12 → mírná flexe hlavy (= temeno k zemi)
 *   - shoulder.x = 56 → předpažení (po -180 rotaci = paže dolů k podlaze
 *     vepředu před hlavou)
 *   - shoulder.z = 26 → drobná abdukce (lokty ven)
 *   - elbow.x = 98 → silně ohnutý loket (= dlaně u uší / spánků)
 *   - knee.x = 13 → drobně pokrčená kolena (uvolněná noha vzhůru)
 *   - hipy = 0 (rest) → stehna přímo nahoru (= pelvis nad rameny, klasická
 *     vertikální linie sirsasany)
 *
 * Body opory: temeno hlavy + obě dlaně (= "tripod" stejně jako kapalasana,
 * ale s ohnutými lokty).
 *
 * Asymetrie shoulder.y (-3 vs 0) sjednocena na 0; z (27 vs 25) na 26;
 * elbow (98 vs 97) na 98; kneeL (11) vs kneeR (15) na 13.
 */
export const headstand = makePose('Stoj na hlavě', {
    torso:     { x: -7 },
    neck:      { x: 12 },
    shoulderL: { x: 56, z: 26 },
    shoulderR: { x: 56, z: 26 },
    elbowL:    { x: 98 },
    elbowR:    { x: 98 },
    kneeL:     { x: 13 },
    kneeR:     { x: 13 },
});
headstand.rootRotation = { x: -180, y: 0, z: 0 };

/**
 * Most (chakrasana / wheel pose) — záklonový oblouk: postava na zemi v
 * inverzním "U", pelvis nadzvednutý, dlaně a chodidla na podlaze, hlava
 * mezi pažemi. Klasická jógová asana.
 *
 *   - rootRotation.x = 83 → kostra téměř horizontálně (= leh na zádech
 *     s pelvisem zvednutým)
 *   - torso.x = -30 → max záklon trupu (lumbar extension)
 *   - neck.x = -30 → záklon hlavy (mezi pažemi)
 *   - shoulder.x = 110 → přepažení (po horizontalizaci kostry = paže
 *     směrem dolů k podlaze za hlavou)
 *   - shoulder.y = -59 → silná vnitřní rotace (= dlaně ven, "obrácené"
 *     prsty směrem k pelvisu)
 *   - shoulder.z = 115 → nad-abdukce (paže ven do širšího záběru)
 *   - elbow.x = 17 → téměř rovné lokty (= dlaně dosáhnou na podlahu)
 *   - hip.x = -30 → záklon pelvisu (= zvednutí pánve nad zem)
 *   - hip.z = 12 → drobná abdukce (kolena ven od osy)
 *   - knee.x = 69 → silně pokrčená kolena (= chodidla u pánve)
 *
 * Body opory: dlaně + chodidla (4 body, asymetrický oblouk).
 *
 * Asymetrie: shoulder.y (-63 vs -55) → -59; z (115 vs 114) → 115;
 * elbow (15 vs 19) → 17; hip.z (10 vs 13) → 12; knee (70 vs 68) → 69.
 */
export const bridge = makePose('Most', {
    torso:     { x: -30 },
    neck:      { x: -30 },
    shoulderL: { x: 110, y: -59, z: 115 },
    shoulderR: { x: 110, y: -59, z: 115 },
    elbowL:    { x: 17 },
    elbowR:    { x: 17 },
    hipL:      { x: -30, z: 12 },
    hipR:      { x: -30, z: 12 },
    kneeL:     { x: 69 },
    kneeR:     { x: 69 },
});
bridge.rootRotation = { x: 83, y: 0, z: 0 };

/**
 * Vrána (bakasana / crow pose) — balanc na rukou: postava na čtyřech, kolena
 * opřená o triceps, chodidla za zády ve vzduchu. Jeden z prvních arm-balance
 * silových postojů v józe.
 *
 *   - rootRotation.x = -113 → kostra silně překlopena vpřed (vrch těla míří
 *     k -Z + dolů, hlava před koleny)
 *   - torso.x = 30 → další předklon trupu
 *   - neck.x = 31 → flexe hlavy (kouká vpřed po překlopení)
 *   - shoulder.x = 90 → předpažení (po překlopení = paže směrem dolů k zemi)
 *   - shoulder.z = 10 → drobná abdukce (lokty trochu ven)
 *   - elbow.x = 54 → středně ohnutý (= postoj na předloktích / dlaních)
 *   - hip.x = 140 → max flexe (kolena přitažená k hrudi)
 *   - hip.z = 21 → mírná abdukce (kolena ven od osy ke trojúhelníku ramen)
 *   - knee.x = 130 → max ohyb (= chodidla za zády vzhůru)
 *
 * Body opory: dlaně (= "ruční balanc"). Velmi labilní pose.
 *
 * Asymetrie: shoulder.x (92 vs 89) → 90; shoulder.z (14 vs 5) → 10
 * (rozdíl 9 = na hraně, ale obě paže mají být symetrické); elbow → 54;
 * hip.z (23 vs 18) → 21; knee (130 vs 131) → 130.
 */
export const crow = makePose('Vrána', {
    torso:     { x: 30 },
    neck:      { x: 31 },
    shoulderL: { x: 90, z: 10 },
    shoulderR: { x: 90, z: 10 },
    elbowL:    { x: 54 },
    elbowR:    { x: 54 },
    hipL:      { x: 140, z: 21 },
    hipR:      { x: 140, z: 21 },
    kneeL:     { x: 130 },
    kneeR:     { x: 130 },
});
crow.rootRotation = { x: -113, y: 0, z: 0 };

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
 * ne hlavu).
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
 * Leh na pravém boku – spaní. Postava leží na pravém boku, nohy obě podobně
 * pokrčené, ruce složené před tváří (= "modlitba", spánková poloha).
 *
 *   - rootRotation.z = -90 → otočení kolem osy Z (= leh na pravém boku;
 *     postavova vertikální osa +Y → world +X, pravá strana +X → world -Y dolů).
 *   - neck.x = 15 → hlava lehce předkloněná (přirozené pro spánek)
 *   - shoulder.x = 90/95 → obě paže předpažené (kupředu před tělo)
 *   - shoulder.z asymetrické (-30 vs -12) → záměrná asymetrie ramen:
 *     levá (horní) víc dovnitř k tváři, pravá (spodní) méně — podpírá hlavu
 *   - elbow.x = 90 → předloktí kolmá k paži (= ruce před tváří)
 *   - hipL.x = 40, hipL.z = -10 → horní noha mírně dopředu, lehce přitisknutá
 *   - hipR.x = 27 → spodní noha drobně méně pokrčená v kyčli
 *   - knee.x = 95 → obě kolena podobně pokrčená (klasická spánková poloha)
 *
 * Body opory: pravá strana těla — shoulderR, pelvis, hipR, kneeR, ankleR.
 */
export const laySide = makePose('Leh na boku – spaní', {
    neck:      { x: 15 },
    shoulderL: { x: 90, z: -30 },
    elbowL:    { x: 90 },
    shoulderR: { x: 95, z: -12 },
    elbowR:    { x: 90 },
    hipL:      { x: 40, z: -10 },
    kneeL:     { x: 95 },
    hipR:      { x: 27 },
    kneeR:     { x: 95 },
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

// === SEDY (sitting poses) ===================================================
// Postava sedí na zemi nebo v dřepu. Pelvis (root) buď nad zemí (klek, dřep,
// turek = pelvis na patách / pod hýždí) nebo přímo na zemi (dlouhý sed,
// skrčený sed, polosed na boku). Snap-to-floor srovná nejnižší joint.

/**
 * Turek (sukhasana) — sed se zkříženýma nohama, kolena do stran, pelvis na zemi.
 *   - rootRotation.x = 16 → mírný záklon kostry (= kompenzuje předklon trupu,
 *     výsledek je trup vzpřímený nad pelvisem)
 *   - hip.x = 140 → max flexe (stehna přitisknutá k trupu, pelvis sedne na zem)
 *   - hip.y = 50 → vnější rotace stehna (turn-out) — bez ní by lýtka šla ven,
 *                  s ní jdou pod druhé stehno (= zkřížení pat pod pánví)
 *   - hip.z = 60 → abdukce (kolena ven do strany — symetrické)
 *   - knee.x = 130 → max ohyb (lýtko zalomené dolů a dovnitř)
 *   - torso.x = 12 → mírný předklon trupu (váha pánve dopředu mezi kolena)
 *   - shoulder.x = -27 → ruce zapažené (= uvolněně přes stehna dolů)
 *   - shoulder.z = 19 → mírná abdukce (ruce ven od trupu, ne přitisknuté)
 *
 * Body opory: pelvis + kolena + kotníky/paty.
 */
export const sitCross = makePose('Turek', {
    torso:     { x: 12 },
    hipL:      { x: 140, y: 50, z: 60 },
    hipR:      { x: 140, y: 50, z: 60 },
    kneeL:     { x: 130 },
    kneeR:     { x: 130 },
    shoulderL: { x: -27, z: 19 },
    shoulderR: { x: -27, z: 19 },
});
sitCross.rootRotation = { x: 16, y: 0, z: 0 };

/**
 * Skrčený sed — kolena přitažená k hrudi, ruce objímají kolena z venku.
 *   - rootRotation.x = 10 → mírný záklon kostry (kompenzuje předklon trupu)
 *   - torso.x = 20 → předklon trupu (hlava nad kolena)
 *   - neck.x = -5 → mírný záklon hlavy (kouká přes kolena dopředu, ne na ně)
 *   - hip.x = 140 → max flexe (stehna těsně k trupu)
 *   - hip.z = -6 → mírná addukce (kolena lehce u sebe)
 *   - knee.x = 130 → max ohyb (lýtka přitažená ke stehnům)
 *   - shoulder.x = 52 → mírné předpažení (ruce kupředu nad kolena)
 *   - shoulder.y = -90 → silná vnitřní rotace (palec dovnitř, dlaň ven —
 *                       paže obtáčí koleno z venku, ne přes hřbet)
 *   - shoulder.z = 15 → abdukce (lokty trochu ven, kolem kolen)
 *   - elbow.x = 70 → ohnutý loket (předloktí jde dolů kolem holení)
 *
 * Body opory: pelvis + paty. Trup vyvážený dopředu nad nohama.
 */
export const sitTuck = makePose('Skrčený sed', {
    torso:     { x: 20 },
    neck:      { x: -5 },
    hipL:      { x: 140, z: -6 },
    hipR:      { x: 140, z: -6 },
    kneeL:     { x: 130 },
    kneeR:     { x: 130 },
    shoulderL: { x: 52, y: -90, z: 15 },
    shoulderR: { x: 52, y: -90, z: 15 },
    elbowL:    { x: 70 },
    elbowR:    { x: 70 },
});
sitTuck.rootRotation = { x: 10, y: 0, z: 0 };

/**
 * Klek (vajrasana) — pelvis na patách, lýtka pod stehny, mírně předkloněný trup.
 *   - rootRotation.x = -16 → mírný předklon kostry (vrch postavy dopředu)
 *   - torso.x = -6 → mírný záklon trupu (částečná kompenzace předklonu)
 *   - neck.x = -10 → záklon hlavy (kouká před sebe, lehce vzhůru)
 *   - hip.x = 87 → flexe (stehna ~71° vpřed po součtu s rootRotation)
 *   - hip.y = -35 → vnitřní rotace stehna (kolena drobně dovnitř)
 *   - hip.z = 9 → mírná abdukce (kolena lehce ven od pánve)
 *   - knee.x = 165 → max ohyb (= proto jsme zvedli limit z 130; pata k zadku)
 *   - shoulder.x = -6, y = -15, z = 7 → ruce uvolněně dolů, drobně do stran
 *   - elbow.x = 60 → loket lehce pokrčený
 *
 * Body opory: kolena + paty (= ankleL/R po snapu).
 */
export const sitKneel = makePose('Klek', {
    torso:     { x: -6 },
    neck:      { x: -10 },
    hipL:      { x: 87, y: -35, z: 9 },
    hipR:      { x: 87, y: -35, z: 9 },
    kneeL:     { x: 165 },
    kneeR:     { x: 165 },
    shoulderL: { x: -6, y: -15, z: 7 },
    shoulderR: { x: -6, y: -15, z: 7 },
    elbowL:    { x: 60 },
    elbowR:    { x: 60 },
});
sitKneel.rootRotation = { x: -16, y: 0, z: 0 };

/**
 * Dětský klek (balasana / child's pose) — klek s plným předklonem trupu na
 * stehna, paže natažené dopředu po podlaze, čelo k zemi. Pozice odpočinku.
 *
 *   - rootRotation.x = -75 → silný předklon kostry (vrch postavy dopředu)
 *   - torso.x = 30 → další předklon trupu (= trup položený na stehnech)
 *   - neck.x = 60 → silná flexe hlavy (čelo k zemi)
 *   - hip.x = 140 → max flexe (stehna těsně k trupu)
 *   - hip.y = -18 → vnitřní rotace stehen (kolena dovnitř)
 *   - hip.z = 14 → mírná abdukce
 *   - knee.x = 153 → silný ohyb (sed na patách)
 *   - shoulder.x = 165 → max předpažení (paže nahoru = po rotaci kostry dopředu na zemi)
 *   - shoulder.y = -48 → vnitřní rotace paže (palec dovnitř, dlaně dolů na zemi)
 *   - shoulder.z = 11 → drobná abdukce (paže lehce ven)
 *   - elbow.x = 14 → téměř natažený loket (= dlaně dosáhnou vpřed)
 *
 * Body opory: kolena + paty + dlaně + čelo (= 5+ bodů, plně rozložená pozice).
 */
export const sitChild = makePose('Dětský klek', {
    torso:     { x: 30 },
    neck:      { x: 60 },
    hipL:      { x: 140, y: -18, z: 14 },
    hipR:      { x: 140, y: -18, z: 14 },
    kneeL:     { x: 153 },
    kneeR:     { x: 153 },
    shoulderL: { x: 165, y: -48, z: 11 },
    shoulderR: { x: 165, y: -48, z: 11 },
    elbowL:    { x: 14 },
    elbowR:    { x: 14 },
});
sitChild.rootRotation = { x: -75, y: 0, z: 0 };

/**
 * Kočka (marjaryasana / cat pose) — pozice na všech čtyřech, zaoblená záda
 * a sklopená hlava (cat varianta z cat-cow cyklu).
 *
 *   - rootRotation.x = -83 → kostra téměř horizontálně dopředu (postava
 *     na čtyřech, vrch těla míří k -Z)
 *   - torso.x = -27 → záklon trupu (= zaoblený "hrb" v cat pozici)
 *   - neck.x = 25 → flexe hlavy (brada k hrudi, hlava dolů)
 *   - shoulder.x = 70, z = 5 → paže předpažené (po horizontalizaci kostry
 *     to je "dolů k zemi" — dlaně na podlaze)
 *   - hip.x = 82, z = 9 → stehna kolmá k trupu (kolena na podlaze)
 *   - knee.x = 89 → lýtka kolmá ke stehnu (= lýtka na podlaze, prsty dozadu)
 *
 * Body opory: zápěstí + kolena (= klasický kvadrupedální čtyřbod).
 */
export const cat = makePose('Kočka', {
    torso:     { x: -27 },
    neck:      { x: 25 },
    shoulderL: { x: 70, z: 5 },
    shoulderR: { x: 70, z: 5 },
    hipL:      { x: 82, z: 9 },
    hipR:      { x: 82, z: 9 },
    kneeL:     { x: 89 },
    kneeR:     { x: 89 },
});
cat.rootRotation = { x: -83, y: 0, z: 0 };

/**
 * Polosed na boku — asymetrická relaxovaná pozice. Postava pootočená bokem,
 * pravá paže silně pokrčená s rukou u tváře (jako "relax na louce"), levá
 * paže přes tělo dopředu, levá noha silně pokrčená a roznožená, pravá
 * natažená šikmo do strany.
 *
 * Klíč je rootRotation — celá kostra je naklopená:
 *   - x = 86 → skoro plný záklon kostry (svislá osa kostry → cca horizontálně)
 *   - y = -98 → otočení kolem world Y (= bok ke kameře místo čela)
 *   - z = 7 → mírný úklon, doladění opřené strany
 *
 *   - torso.x = 30, y = 13, z = 30 → silný předklon + twist + max úklon trupu
 *   - neck.x = -5, y = -8 → drobný záklon a twist hlavy
 *   - shoulderL.x = 66, y = -63, z = -30 → levá paže předpažená napříč tělem,
 *     silná vnitřní rotace (dlaň ven), addukce dovnitř
 *   - elbowL.x = 48 → loket pokrčený
 *   - shoulderR.x = 9, y = 27, z = 79 → pravá paže silně do strany, mírná
 *     vnější rotace (dlaň vzhůru / palec ven)
 *   - elbowR.x = 111 → silný ohyb (= ruka u hlavy / pod hlavou)
 *   - hipL.x = 85, y = 50, z = 75 → levá noha silně pokrčená + max turn-out + široká abdukce
 *   - kneeL.x = 125 → silný ohyb (lýtko pod stehno)
 *   - hipR.x = 50, z = -10 → pravá noha dopředu, lehce dovnitř
 *   - kneeR.x = 105 → mírně pokrčená
 *
 * Body opory: pelvis + pravé koleno + kotníky + pravé zápěstí.
 */
export const sitSide = makePose('Polosed na boku', {
    torso:     { x: 30, y: 13, z: 30 },
    neck:      { x: -5, y: -8 },
    shoulderL: { x: 66, y: -63, z: -30 },
    elbowL:    { x: 48 },
    shoulderR: { x: 9, y: 27, z: 79 },
    elbowR:    { x: 111 },
    hipL:      { x: 85, y: 50, z: 75 },
    kneeL:     { x: 125 },
    hipR:      { x: 50, z: -10 },
    kneeR:     { x: 105 },
});
sitSide.rootRotation = { x: 86, y: -98, z: 7 };

// === Sady poses pro snadný import =========================================

/** Základní pózy (vhodné pro většinu dem). */
export const BASIC_POSES = { stand, tpose, wave, sit, squat };

/** Pózy zaměřené na test stability / bodů opory. */
export const BALANCE_POSES = { stand, tpose, wave, leanForward, oneLegL, oneLegR, lunge };

/** Pózy s hlavou jako součástí opory (vzhůru nohama). */
export const HEAD_SUPPORT_POSES = { kapalasana, pincha };

/**
 * Postoje — propracované authored pose. Sekce POSTOJE drží jen finální
 * authored pose. Primitivní (stand, tpose, wave, squat) zůstávají exportované
 * pro BASIC_POSES, BALANCE_POSES a další dema, ale v Inspectoru se neukáží.
 *
 * Pořadí: progressive yoga difficulty — od stoje k inverzi.
 */
export const STANCE_POSES = {
    arabesque,
    stretch,
    bow,
    crow,
    bridge,
    headstand,
};

/** Sedové / klečové pózy. Pořadí odpovídá UI sekci SEDY/KLEKY. */
export const SIT_POSES = {
    sit,
    sitCross,
    sitLegsForward,
    sitTuck,
    sitKneel,
    sitChild,
    cat,
    sitSide,
};

/** Lehové pózy (vodorovně, opora celý trup). Pořadí odpovídá UI sekci LEHY. */
export const LIE_POSES = {
    layBack, layStarfish, layChill, laySide, layReader, layRecline,
};
