// src/world/Bed.js
// =============================================================================
// Bed = druhý Interactable objekt (Demo04 Stage 2). Multi-stage interakce:
// dojdi k okraji → sedni → lehni si.
//
// Geometrie: tenká matrace (placeholder, výška 0.1 j) + headboard na +Z konci.
// Postava v LAY pose má pelvis na podlaze (y = floorY) a délku 7.65 j v ose Z;
// hlava na +Z straně, nohy na -Z straně. Matrace 8 × 2.5 j (= postava + okraj),
// pelvis = bed.position v rovině XZ.
//
// === Konvence ===
// `facing` = orientace postele = worldYaw postavy v LAY (= head ve směru
// +Z lokal = u headboardu). Při `facing = 0`: headboard v +Z world, postava
// leží head-to-headboard.
//
// === ⚠ Limitace facing ≠ 0 ===
// Aktuálně Bed funguje korektně JEN pro `facing = 0`. Důvod: Stickman při
// LAY pose nastavuje rootRotation.x = 90° + Stickman.worldYaw → rootRotation.y.
// Skeleton aplikuje Euler v pořadí Z×Y×X (= apply-order Z, Y, X), takže yaw
// se vyhodnotí PŘED lay rotací → výsledek je rotace kolem podélné osy
// postavy (roll), ne kolem world Y. Postava ignoruje yaw v rovině XZ.
//
// Plný fix vyžaduje změnu rotation order v Skeleton._build / computeWorld-
// Transforms (= breaking change pro Drift, Inspector slidery, jiné pose) —
// patří do refaktoru kostry, ne do Bed.js. Stage 3+ Demo04 by ho měl řešit.
//
// `sitEdge` = bod na -Z konci matrace (= u nohou postele, nejdál od headboardu).
// Pelvis sedící postavy je 0.7 j od kraje, body forward = -Z lokal (= dívá se
// pryč od postele, ven z místnosti).
//
// `layCenter` = pivot postele (= střed matrace). Postava při LAY pelvisem zde,
// hlava k headboardu, nohy do -Z.
//
// === Výška matrace ===
// `mattressThickness = H × 0.176` (≈ 1.41 j pro H=8) = stejná hodnota jako
// `Chair.seatHeightFraction` (= izomorfismus „úroveň pro sezení/leh"). Vrch
// matrace je tedy ve stejné výšce jako vrch sedátka židle. Postava při SIT
// na okraji má pelvis přesně na vrchu matrace (= snap-to-floor zarovná
// ankle na podlahu, pelvis vyjde geometricky 1.41 j nad floor — viz
// `_measure_sit.html`). Při LAY demo overrideuje snap-to-floor na
// `floorY + mattressHeight` → pelvis přistane na vrchu matrace.
// =============================================================================

import * as THREE from 'three';

const BED_DEFAULTS = Object.freeze({
    mattressLength:           8.0,    // ≥ délka postavy v LAY (≈7.65 j)
    mattressWidth:            2.5,    // tělo + paže rezerva
    mattressThicknessFraction: 0.176, // = Chair.seatHeightFraction; viz hlavička
    headboardHeight:          1.5,
    headboardThickness:       0.15,
    sitEdgeOffset:            0.7,    // pelvis při sit on edge — vzdálenost od kraje
    approachDist:             1.5,
    color:                    0xaa7755,
});

/**
 * Vyrobí postel na pozici (x, z), otočenou o `facing` kolem Y.
 *
 * @param {object} opts
 * @param {number} [opts.x=0]            world X pivotu (= střed matrace)
 * @param {number} [opts.z=0]            world Z pivotu (= střed matrace)
 * @param {number} [opts.facing=0]       ° — head-to-headboard orientace
 * @param {number} [opts.floorY=-4]      Y úroveň podlahy
 * @param {number} [opts.height=8]       výška postavy (pro derivaci tloušťky matrace)
 *
 * @returns {{
 *   mesh: THREE.Group,
 *   mattressHeight: number,
 *   sitEdge: { x, z, yaw, approach: { x, z } },
 *   layCenter: { x, z, yaw },
 * }}
 */
export function makeBed({
    x = 0, z = 0, facing = 0, floorY = -4, height = 8,
} = {}) {
    const c = BED_DEFAULTS;
    const halfLen = c.mattressLength / 2;
    const mattressThickness = height * c.mattressThicknessFraction;

    const group = new THREE.Group();
    group.position.set(x, floorY, z);
    group.rotation.y = facing * Math.PI / 180;

    const mat = new THREE.MeshStandardMaterial({
        color:     c.color,
        roughness: 0.7,
    });

    // Matrace — pivot na floor, vrch ve floor + mattressThickness.
    const mattress = new THREE.Mesh(
        new THREE.BoxGeometry(c.mattressWidth, mattressThickness, c.mattressLength),
        mat,
    );
    mattress.position.y = mattressThickness / 2;
    mattress.castShadow = true;
    mattress.receiveShadow = true;
    group.add(mattress);

    // Headboard — v +Z lokal (= u hlavy postavy v lay).
    const headboard = new THREE.Mesh(
        new THREE.BoxGeometry(c.mattressWidth, c.headboardHeight, c.headboardThickness),
        mat,
    );
    headboard.position.set(
        0,
        mattressThickness + c.headboardHeight / 2,
        halfLen + c.headboardThickness / 2,
    );
    headboard.castShadow = true;
    headboard.receiveShadow = true;
    group.add(headboard);

    // Sit edge: pelvis 0.7 j od -Z okraje matrace (= u nohou postele).
    // Lokal coords (0, sitLocalZ) → world přes rotaci kolem Y o `facing`.
    // Three.js Y rotation transformuje lokal (x, z) → world:
    //   world.x = x*cos + z*sin
    //   world.z = -x*sin + z*cos
    const sitLocalZ = -halfLen + c.sitEdgeOffset;
    const facingRad = facing * Math.PI / 180;
    const cos = Math.cos(facingRad);
    const sin = Math.sin(facingRad);

    const sitWorldX = x + sitLocalZ * sin;
    const sitWorldZ = z + sitLocalZ * cos;

    // Approach 1.5 j před sit edge ve směru -Z lokal (= další ven z postele).
    const approachLocalZ = sitLocalZ - c.approachDist;
    const approachWorldX = x + approachLocalZ * sin;
    const approachWorldZ = z + approachLocalZ * cos;

    return {
        mesh: group,
        mattressHeight: mattressThickness,
        sitEdge: {
            x: sitWorldX, z: sitWorldZ,
            yaw: facing,                    // body forward = -Z lokal = ven z postele
            approach: { x: approachWorldX, z: approachWorldZ },
        },
        layCenter: {
            x: x, z: z,
            yaw: facing,                    // head k headboardu (+Z lokal)
        },
    };
}
