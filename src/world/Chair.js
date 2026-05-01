// src/world/Chair.js
// =============================================================================
// Chair = první konkrétní Interactable objekt (Demo04 Stage 1).
//
// Geometrie: jednoduchá dřevěná židle = sedátko (box) + opěrka (vyšší box za
// sedátkem). Pivot Group v rovině podlahy → rotace kolem Y mění orientaci
// židle ve scéně (= „kam se postava bude dívat, když si sedne").
//
// === Konvence ===
// `facing` = worldYaw postavy v sedu (= ve stupních). Postava body forward = -Z;
// při `facing = 0` postava sedí dívajíc se -Z, opěrka je v +Z lokal (= za zády
// postavy). `facing = 90°` rotuje židli CCW shora → opěrka v +X world, postava
// se dívá -X.
//
// `approach` = bod 1.5 j PŘED židlí (= před sedící postavou). Postava sem dojde
// (linkTo), pak se otočí (finalYaw = facing) a sedne (then = SIT).
//
// === Výška sedátka ===
// `seatHeight = H * 0.176` (≈ 1.41 j pro default H=8). Změřeno v SIT pose
// po `snap-to-floor` (= ankle na podlaze, pelvis vychází 1.4067 j nad podlahu
// pro H=8). Měření v `_measure_sit.html` 2026-05-01. Vrch sedátka = výška
// pelvisu joint, takže postava sedí pelvisem přesně na sedátku.
// =============================================================================

import * as THREE from 'three';

// Default parametry — později (Stage 2+) lze rozšířit o variant chairů
// (kancelářské, jídelní, křeslo s opěrkami).
const CHAIR_DEFAULTS = Object.freeze({
    seatWidth:     1.4,
    seatDepth:     1.4,
    seatThickness: 0.15,
    backHeight:    1.5,
    backThickness: 0.15,
    seatHeightFraction: 0.176,    // H × 0.176; viz hlavička
    color:         0x886644,
    approachDist:  1.5,           // j — vzdálenost approach pos od pivotu
});

/**
 * Vyrobí židli na pozici (x, z), otočenou tak, aby sedící postava směřovala
 * worldYaw = `facing`.
 *
 * @param {object} opts
 * @param {number} [opts.x=0]            world X pivotu židle
 * @param {number} [opts.z=0]            world Z pivotu židle
 * @param {number} [opts.facing=0]       ° — kterým směrem se sedící postava dívá
 * @param {number} [opts.floorY=-4]      Y úroveň podlahy (= báze židle)
 * @param {number} [opts.height=8]       výška postavy (pro derivaci seatHeight, default 8)
 *
 * @returns {{
 *   mesh: THREE.Group,
 *   position: {x: number, z: number},
 *   approach: {x: number, z: number},
 *   sitYaw: number,
 * }}
 */
export function makeChair({
    x = 0, z = 0, facing = 0, floorY = -4, height = 8,
} = {}) {
    const c = CHAIR_DEFAULTS;
    const seatHeight = height * c.seatHeightFraction;

    // Group pivot v rovině podlahy → výška sedátka se počítá ode dna group.
    const group = new THREE.Group();
    group.position.set(x, floorY, z);
    group.rotation.y = facing * Math.PI / 180;

    const mat = new THREE.MeshStandardMaterial({
        color:     c.color,
        roughness: 0.7,
        metalness: 0.1,
    });

    // Sedátko — horní plocha ve výšce seatHeight, tloušťka seatThickness.
    const seat = new THREE.Mesh(
        new THREE.BoxGeometry(c.seatWidth, c.seatThickness, c.seatDepth),
        mat,
    );
    seat.position.y = seatHeight - c.seatThickness / 2;
    seat.castShadow = true;
    seat.receiveShadow = true;
    group.add(seat);

    // Opěrka — v lokálním +Z (= za zády postavy v sedu), nad sedátkem.
    // Vrchol opěrky = seatHeight + backHeight.
    const back = new THREE.Mesh(
        new THREE.BoxGeometry(c.seatWidth, c.backHeight, c.backThickness),
        mat,
    );
    back.position.set(
        0,
        seatHeight + c.backHeight / 2,
        c.seatDepth / 2 - c.backThickness / 2,
    );
    back.castShadow = true;
    back.receiveShadow = true;
    group.add(back);

    // Approach pos = 1.5 j před sedícím (= ve směru forward postavy v sedu).
    // Postava body forward = -Z. Po rotaci o `facing` ve world:
    //   fwd = (-sin(facing), -cos(facing))
    const facingRad = facing * Math.PI / 180;
    const fwdX = -Math.sin(facingRad);
    const fwdZ = -Math.cos(facingRad);

    return {
        mesh: group,
        position: { x, z },
        approach: {
            x: x + fwdX * c.approachDist,
            z: z + fwdZ * c.approachDist,
        },
        sitYaw: facing,
    };
}
