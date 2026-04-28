// src/library/Poses.js
// =============================================================================
// Knihovna standardních póz pro Minimal kostru.
//
// Každá póza je objekt { name, angles, supportPoints? } — nikoli Pose instance,
// aby šel snadno klonovat / použít jako template. Funkce makePose() vyrobí
// regulérní Pose instanci z téhle definice.
//
// Důvod existence:
//   - Sit / Squat / Stand byly definovány v 4 demech, pokaždé s mírně jinými úhly.
//     Knihovna = jediné místo pravdy.
//
// Konvence úhlů viz Skeleton.js (anatomické, kladné = přirozený směr).
// =============================================================================

import { Pose } from '../model/Pose.js';

/** Vyrobí Pose instanci z definice (slovník angles + volitelné supportPoints). */
export function makePose(name, angles, supportPoints = null) {
    const p = new Pose(name);
    p.angles = angles;
    if (supportPoints !== null) p.supportPoints = supportPoints;
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
 * Body opory: jen ankleL.
 */
export const oneLegL = makePose('Stoj na L noze', {
    hipR:  { x: 30, z: -20 },
    kneeR: { x: 90 },
    shoulderL: { x: 0, z: 70 },
    shoulderR: { x: 0, z: 70 },
}, ['ankleL']);

/** Stoj na pravé noze — zrcadlo oneLegL. */
export const oneLegR = makePose('Stoj na P noze', {
    hipL:  { x: 30, z: -20 },
    kneeL: { x: 90 },
    shoulderL: { x: 0, z: 70 },
    shoulderR: { x: 0, z: 70 },
}, ['ankleR']);

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
}, ['headTop', 'wristL', 'wristR']);

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
}, ['headTop', 'elbowL', 'elbowR']);

// === Sady poses pro snadný import =========================================

/** Základní pózy (vhodné pro většinu dem). */
export const BASIC_POSES = { stand, tpose, wave, sit, squat };

/** Pózy zaměřené na test stability / bodů opory. */
export const BALANCE_POSES = { stand, tpose, wave, leanForward, oneLegL, oneLegR, lunge };

/** Pózy s hlavou jako součástí opory (vzhůru nohama). */
export const HEAD_SUPPORT_POSES = { kapalasana, pincha };
