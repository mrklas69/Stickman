// src/model/IK.js
// =============================================================================
// Inverse Kinematics (IK) pro 2-segmentovou končetinu (paže nebo noha).
//
// Vstup: 3 klouby tvořící řetězec (root → mid → end) + cílová pozice ve světě.
// Výstup: nastavené úhly v root a mid kloubu tak, aby end joint dosáhl cíle
//   (nebo se k němu přiblížil maximálně, pokud je mimo dosah).
//
// PŘEDPOKLADY pro Minimal kostru:
//   - root joint má 2 DOF: x (předpažení/předkop) a z (abdukce/roznožka)
//   - mid joint má 1 DOF: x (ohyb)
//   - upper kost visí v rest pose ve směru -Y v lokálu root jointu
//   - lower kost visí ve směru -Y v lokálu mid jointu (po elbow rotaci)
//   - rootRotation kostry = 0 (jinak by bylo nutné inverzí transformovat target
//     do pelvis lokálu — pro KISS to teď nevyžadujeme)
//
// MATEMATIKA:
// 1) Délky d1 = |root→mid|, d2 = |mid→end|. Vzdálenost cíle d = |target - root|.
//    Pokud d > d1+d2 → cíl mimo dosah, končetina maximálně narovnaná.
// 2) Úhel ohybu (mid joint) z věty kosinové:
//      cos(π - θ_mid) = (d1² + d2² - d²) / (2·d1·d2)
//      anatomický θ_mid = π - acos(...)
// 3) Orientace root jointu — chceme, aby end byl ve směru cíle. Vektor v
//    od root ke cíli, normovaný na d. V Three.js rotaci order XYZ:
//      v' = Rx(θx) · Ry(0) · Rz(θz) · (0,-1,0)
//         = (sin θz, -cos θz · cos θx, -cos θz · sin θx)
//    Z toho: θz = asin(v.x / d), θx = atan2(-v.z, -v.y).
//    Anatomický úhel = Three.js úhel / sign (per-osa znaménko z modelu).
// =============================================================================

const RAD_TO_DEG = 180 / Math.PI;

// Stav pro warn-once: IK volaný na pootočené kostře (viz solveTwoBoneIK)
let _ikWarned = false;

/**
 * Vyřeší 2-bone IK a nastaví úhly v rootJ a midJ.
 *
 * @param {Skeleton} skeleton    aktuální kostra
 * @param {string}   rootName    'shoulderL' / 'shoulderR' / 'hipL' / 'hipR'
 * @param {string}   midName     'elbowL'    / 'elbowR'    / 'kneeL' / 'kneeR'
 * @param {string}   endName     'wristL'    / 'wristR'    / 'ankleL'/ 'ankleR'
 * @param {{x,y,z}}  targetWorld cílová pozice koncového kloubu ve světě
 * @returns {{ reach: number, distance: number }}  reach = vzdálenost po IK,
 *          distance = vzdálenost cíle od root jointu (před clampem)
 */
export function solveTwoBoneIK(skeleton, rootName, midName, endName, targetWorld) {
    // Limit: předpokládáme, že kostra není pootočená v rootu (= rootRotation = 0).
    // Pro paže (shoulder/elbow): od R3a má shoulder rodiče `torso`, takže taky
    // `torso` musí mít všechny úhly = 0, aby lokál shoulder odpovídal worldu.
    // Při pootočené kostře by IK selhalo, protože vektor target-rootPivot je v world,
    // ale výpočet úhlů předpokládá, že je v lokále shoulder/hip (= world s identity rotací).
    // Varujeme jen jednou (ne každý frame).
    const rr = skeleton.rootRotation;
    const torso = skeleton.joints.torso;
    const torsoTwisted = torso && (torso.angles.x !== 0 || torso.angles.y !== 0 || torso.angles.z !== 0);
    const rootTwisted  = rr.x !== 0 || rr.y !== 0 || rr.z !== 0;
    const isArm = rootName === 'shoulderL' || rootName === 'shoulderR';
    if ((rootTwisted || (isArm && torsoTwisted)) && !_ikWarned) {
        console.warn('IK.solveTwoBoneIK: kostra je pootočená (rootRotation nebo torso ≠ 0). ' +
                     'Výsledek bude nepřesný — IK předpokládá identity rotaci nadřazených kloubů.');
        _ikWarned = true;
    }

    const rootJ = skeleton.getJoint(rootName);
    const midJ  = skeleton.getJoint(midName);
    const endJ  = skeleton.getJoint(endName);

    // Délky kostí (z localOffsetů — nezávisí na úhlech)
    const d1 = _vlen(midJ.localOffset);
    const d2 = _vlen(endJ.localOffset);
    const maxReach = d1 + d2;

    // World pozice root jointu — závisí jen na pelvis transform a localOffset rootJ.
    // (Změna úhlů rootJ neovlivní pozici jeho pivotu.)
    skeleton.computeWorldTransforms();
    const rootWP = rootJ.worldPosition;

    // Vektor od root ke cíli, ve světě (= v shoulder/hip lokálu, pokud rootRotation = 0)
    let vx = targetWorld.x - rootWP.x;
    let vy = targetWorld.y - rootWP.y;
    let vz = targetWorld.z - rootWP.z;
    let d = Math.hypot(vx, vy, vz);
    const distance = d;

    // Clampování dosahu (cíl mimo se promítne na hranici)
    if (d > maxReach)             d = maxReach;
    if (d < Math.abs(d1 - d2))    d = Math.abs(d1 - d2);

    // Pokud bychom clampnuli d, musíme zkrátit i v (jinak směr stejný)
    if (d > 0 && distance > 0 && d !== distance) {
        const scale = d / distance;
        vx *= scale; vy *= scale; vz *= scale;
    }

    // === Mid joint ohyb (anatomický) ===
    // Věta kosinová: cos(angle_between_bones) = (d1² + d2² - d²) / (2·d1·d2)
    // Anatomický ohyb = π - tento úhel (0 = narovnaná, π = úplně skrčená)
    const cosArg = (d1 * d1 + d2 * d2 - d * d) / (2 * d1 * d2);
    const cosClamped = Math.max(-1, Math.min(1, cosArg));
    const midAnatRad = Math.PI - Math.acos(cosClamped);
    const midAnatDeg = midAnatRad * RAD_TO_DEG;

    // === Root joint orientace ===
    // Předpoklad: rootRotation kostry = 0, takže lokál rootJ ≈ world.
    // (Pelvis pivot může mít jiný offset, ale jeho ROTACE je identita.)
    //
    // Three.js rotace order XYZ:
    //   v' = Rx(θx) * Ry(0) * Rz(θz) * (0, -1, 0)
    // Po rozepsání:
    //   v'.x = sin(θz)
    //   v'.y = -cos(θz) * cos(θx)
    //   v'.z = -cos(θz) * sin(θx)
    //
    // Pozn: tohle určuje směr koncového bodu PROTAŽENÉ paže (bez ohybu).
    // Stejný směr má i skutečný "end joint" po našem ohybu — tělesný úhel je v rovině,
    // protože elbow rotuje jen v X (a my přepokládáme, že to leží v rovině sklonu).
    //
    // Z formul:
    //   sin(θz) = v.x / d  → θz = asin(v.x / d)
    //   atan2(v'.z, v'.y) = atan2(-cos θz · sin θx, -cos θz · cos θx)
    //                     = atan2(-sin θx, -cos θx)  (cos θz se zruší)
    //                     = π + θx  nebo -π + θx ... → equiv. θx = atan2(-v.z, -v.y)
    const sinZ = Math.max(-1, Math.min(1, vx / d));
    const thetaZ = Math.asin(sinZ);
    const thetaX = Math.atan2(-vz, -vy);

    // Konverze na anatomické úhly (přes per-osa sign)
    const anatRootX = (thetaX * RAD_TO_DEG) / rootJ.signs.x;
    const anatRootZ = (thetaZ * RAD_TO_DEG) / rootJ.signs.z;
    const anatMidX  = midAnatDeg / midJ.signs.x;

    // Aplikace (setAngle automaticky klampuje do limitů kloubu)
    rootJ.setAngle('x', anatRootX);
    rootJ.setAngle('z', anatRootZ);
    midJ.setAngle('x', anatMidX);

    return { reach: d, distance };
}

function _vlen(v) {
    return Math.hypot(v.x, v.y, v.z);
}
