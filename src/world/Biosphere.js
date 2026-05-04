// src/world/Biosphere.js
// =============================================================================
// Biosphere = obří skleněná kopule pod kterou žijí postavy (F3 demo).
//
// Geometrie: polokoule (= horní polovina koule) o `radius`, středem na (x, z),
// základna na `floorY`. Sklo (MeshPhysicalMaterial s transmission) je viditelné
// zevnitř i zvenku přes `side: DoubleSide`.
//
// Postavy se pohybují uvnitř v kruhu `radius − margin` (= aby nelezly stěnou).
// =============================================================================

import * as THREE from 'three';

const BIOSPHERE_DEFAULTS = Object.freeze({
    radius:          22,        // j — průměr kopule
    floorY:          -4,        // báze (= H/2 default pro postavu výšky 8)
    margin:           2,        // j — vnitřní okraj pro pohyb postav
    widthSegments:   48,        // tessellace — vyšší = hladší sklo
    heightSegments:  24,
    color:    0xeeffff,         // mírný cyan nádech (= „atmosféra")
    transmission:    0.92,      // 0..1, kolik světla projde (0.9+ = realistické sklo)
    roughness:       0.05,      // 0..1, drsnost povrchu (= rozmazání odrazů)
    thickness:       0.5,       // simulovaná tloušťka skla pro lom světla
    ior:             1.5,       // index lomu (1.5 = sklo)
});

/**
 * Vyrobí skleněnou kopuli na pozici (x, z) na podlaze `floorY`.
 *
 * @param {object} opts
 * @param {number} [opts.x=0]               world X středu kopule
 * @param {number} [opts.z=0]               world Z středu kopule
 * @param {number} [opts.radius=22]         j — průměr kopule
 * @param {number} [opts.floorY=-4]         Y úroveň podlahy (= báze kopule)
 * @param {number} [opts.margin=2]          j — vnitřní okraj (postavy se pohybují
 *                                            v kruhu `radius - margin`)
 * @param {number} [opts.color=0xeeffff]    barva skla
 *
 * @returns {{
 *   mesh: THREE.Group,
 *   position: {x: number, z: number},
 *   radius: number,
 *   floorY: number,
 *   innerRadius: number,
 * }}
 */
export function makeBiosphere({
    x = 0, z = 0,
    radius = BIOSPHERE_DEFAULTS.radius,
    floorY = BIOSPHERE_DEFAULTS.floorY,
    margin = BIOSPHERE_DEFAULTS.margin,
    color  = BIOSPHERE_DEFAULTS.color,
} = {}) {
    const d = BIOSPHERE_DEFAULTS;

    // Group pivot na podlaze → kopule roste vzhůru.
    const group = new THREE.Group();
    group.position.set(x, floorY, z);

    // Polokoule: thetaStart=0, thetaLength=π/2 = horní polovina (= dome).
    const geom = new THREE.SphereGeometry(
        radius,
        d.widthSegments,
        d.heightSegments,
        0,                  // phiStart (= úplný kruh kolem osy Y)
        Math.PI * 2,        // phiLength
        0,                  // thetaStart (= severní pól)
        Math.PI / 2,        // thetaLength (= jen horní polovina)
    );

    // Sklo: MeshPhysicalMaterial s transmission. DoubleSide = vidíme dovnitř i ven.
    // Note: transmission vyžaduje physically correct rendering (Three.js r155+
    // má default zapnuté). Pro low-end fallback by stačila MeshBasicMaterial
    // s opacity ~0.15, ale ztrácí lom světla.
    const mat = new THREE.MeshPhysicalMaterial({
        color,
        transmission: d.transmission,
        roughness:    d.roughness,
        thickness:    d.thickness,
        ior:          d.ior,
        transparent:  true,
        side:         THREE.DoubleSide,
    });

    const dome = new THREE.Mesh(geom, mat);
    dome.castShadow    = false;     // sklo nehází stín (= byl by černý kruh kolem)
    dome.receiveShadow = false;
    group.add(dome);

    return {
        mesh: group,
        position: { x, z },
        radius,
        floorY,
        innerRadius: radius - margin,
    };
}
