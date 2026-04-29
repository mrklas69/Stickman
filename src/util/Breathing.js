// src/util/Breathing.js
// =============================================================================
// Dýchání = pomalý overlay nad primární animaci. Pomalá sinusová modulace
// `torso.x` a `neck.x` simulující nádech-výdech v klidovém tempu (~15/min).
//
// Aplikuje se PO primárce v render loopu (stejně jako Neklid):
//
//   scene.onUpdate((dt) => {
//       globalTime += dt;
//       stickman.animate(dt);
//       applyBreathing(skel, globalTime, breathingLevel);
//       applyNeklid(skel, globalTime, neklidLevel);
//       skel.snapToFloor(FLOOR_Y);
//       view.update();
//   });
//
// Princip:
//   - JEDEN společný sin pro torso.x a neck.x (ne nezávislý hash per osa) —
//     dýchání je BIOLOGICKY KOHERENTNÍ pohyb, hrudník + krk se hýbou ve fázi.
//   - Frekvence ~0.25 Hz (= 4 s na cyklus = 15 dechů/min, klidové tempo).
//   - Amplituda 1° na trupu + 0.5° na krku při level=10 (drobné, ne nápadné).
//   - Pelvis, nohy, ramena, lokte se NEHÝBOU — viz memory
//     `feedback_neklid_anatomical_scope.md` (overlay cílí jen vrch těla,
//     nikdy rootRotation).
// =============================================================================

// Frekvence dýchání v klidu = ~15 dechů/min. Lze později parametrizovat
// (sport, stres, spánek), ale pro draft jedna hodnota.
const BREATH_FREQ = 0.25;          // Hz (= 4 s na cyklus)

// Amplitudy per level (na škále 0–10). Sezení 9: 3× původní hodnoty —
// dech předtím skoro neviditelný, zvětšili jsme.
//   torso.x: 3° × level/10 = max 3° (záklon nádech / předklon výdech)
//   neck.x:  1.5° × level/10 = max 1.5° (hlava lehce sleduje hrudník)
const AMP_TORSO_PER_LEVEL = 0.30;  // → max 3.0° při level=10
const AMP_NECK_PER_LEVEL  = 0.15;  // → max 1.5° při level=10

/**
 * Aplikuje dýchání overlay na skeleton. Volat v render loopu PO primární
 * animaci (a obvykle PŘED Neklidem — pořadí v praxi nezáleží, oba jsou
 * additivní a setAngle clampuje do limits).
 *
 * @param {Skeleton} skeleton
 * @param {number} time   - globální čas v sekundách
 * @param {number} level  - intenzita 0–10 (0 = no-op)
 */
export function applyBreathing(skeleton, time, level) {
    if (level <= 0) return;

    // Jeden sdílený phase pro celý dechový cyklus.
    // sin(0) = 0 = rest pose; +0.5 = peak nádech (záklon); 0 = rest;
    // -0.5 amplitude = peak výdech (předklon); 0 = rest.
    // (Anatomicky: nádech otvírá hrudník = lehký záklon ⇒ torso.x záporné;
    //  v Joint.signs.x torso = -1, takže pro Three.js to vyjde rotace nahoru.)
    const phase = Math.sin(2 * Math.PI * BREATH_FREQ * time);

    // torso.x — primární osa dýchání (záklon nádech / předklon výdech)
    // Záporné anatomické úhly = záklon (limit [-30, 30]) — sin v [-1, 1]
    // násobený amplitudou: oscilace centrované kolem 0, additivně k primárce.
    const torso = skeleton.joints.torso;
    if (torso && torso.axes.includes('x')) {
        const ampTorso = level * AMP_TORSO_PER_LEVEL;
        skeleton.setAngle('torso', 'x', torso.angles.x - phase * ampTorso);
    }

    // neck.x — hlava lehce sleduje hrudník (stejná fáze, menší amplituda).
    // Mínus stejně jako torso → krk jde ve stejném směru jako hrudník
    // (nesnažíme se dělat counter-rotation; v klidu hlava jen plave s tělem).
    const neck = skeleton.joints.neck;
    if (neck && neck.axes.includes('x')) {
        const ampNeck = level * AMP_NECK_PER_LEVEL;
        skeleton.setAngle('neck', 'x', neck.angles.x - phase * ampNeck);
    }
}
