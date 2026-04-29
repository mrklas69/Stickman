// src/util/Neklid.js
// =============================================================================
// Neklid = globální overlay drobných oscilací na vrchu těla. Aplikuje se PO
// primární animaci (Walk / Run / Drift / Lay …) v render loopu.
// Účel: simulovat dýchání, drobné fidgety — "postava-žije" feeling.
//
// Princip:
//   - Pro každou (joint, axis) vytvoříme deterministicky frekvenci a fázi
//     (hash z názvu) → každá osa se kýve trochu jinak, výsledek vypadá
//     organicky (ne jeden monotónní šum).
//   - Amplituda škáluje s `level` ∈ [0, 10] (UI slider). Max ~5° per kloub.
//   - Aplikuje se JEN na vrch těla (krk, ramena, lokte, torso.x/z).
//     Pelvis, kyčle, kolena a body-twist osy (torso.y, neck.y) jsou
//     vyloučené — viz NEKLID_EXCLUDED a NEKLID_EXCLUDED_AXES.
//   - Root rotation se NEMUTUJE (Sezení 9 fix): mutace pelvisu = postava
//     visela za těžiště a vlála ve větru. Anatomický fidget = stoj na
//     nohou + drobný pohyb vrchu.
//
// State management:
//   - Funkce JE stavová napříč voláními (cache hash výsledků), ale stav je
//     deterministický a nemění chování (pouze cachuje výpočet).
//   - Per-frame NIC neukládáme → každý frame Stickman.animate volá
//     skeleton.reset() + setAngle (= primárka přepíše předchozí Neklid).
//     Neklid pak přidá noise nad čerstvou primárku. Žádný kumulativní bug.
//
// Použití:
//   import { applyNeklid } from '../src/util/Neklid.js';
//   let globalTime = 0;
//   scene.onUpdate((dt) => {
//       globalTime += dt;
//       stickman.animate(dt);
//       applyNeklid(skel, globalTime, neklidLevel);
//       skel.snapToFloor(FLOOR_Y);
//       view.update();
//   });
// =============================================================================

// Frekvenční rozsah per osa (Hz). Pomalé = "dýchání", rychlejší = "drobné
// fidgety". Hash konkrétní osy zvolí frekvenci v tomto rozsahu deterministicky.
const FREQ_MIN = 0.3;
const FREQ_MAX = 0.8;

// Amplituda per level (na škále 0–10). Vrch těla = 0.5° × level → max 5°.
// Dolní polovina (boky, kolena) = no-op: noha = bod opory, hýbání kolenem
// by v kombinaci se snap-to-floor způsobilo vertikální jojo celé postavy.
const AMP_PER_LEVEL_JOINT = 0.5;

// Klouby vyloučené z Neklidu (= dolní polovina + páteřní twist trupu, který
// by viditelně rozkmital pánev). Noise se aplikuje na zbytek: neck, shoulder*,
// elbow*, torso.x/z (drobný předklon a úklon trupu). Sezení 9 fix.
const NEKLID_EXCLUDED = new Set([
    'pelvis',
    'hipL', 'hipR',
    'kneeL', 'kneeR',
]);

// Konkrétní osy trupu, které do Neklidu NEzahrnujeme: torso.y = body roll
// (twist celé horní poloviny), který vypadá nepřirozeně bez korelace s pánví.
// torso.x (předklon) a torso.z (lateral flexe) jsou OK — jsou to čisté
// fidget pohyby trupu. Stejně tak neck.y by působilo nezávisle se hýbající
// hlavou bez ramen — vyloučeno.
const NEKLID_EXCLUDED_AXES = new Set([
    'torso.y',
    'neck.y',
]);

// Cache deterministických (frekvence, fáze) per klíč "joint.axis" nebo "root.x".
// Lazy init při prvním přístupu, drží se napořád. Hash je stabilní → každý
// kloub má svou unikátní noise charakteristiku napříč spuštěními aplikace.
const _cache = new Map();

/**
 * Jednoduchý hash stringu na 32-bit int. djb2-like algoritmus — pro naše
 * potřeby (deterministická distribuce frekvencí) stačí. Nesmí být kryptografický.
 */
function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        // ((h << 5) - h) = h * 31 — klasický string hash
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;     // |0 = 32-bit truncation
    }
    return Math.abs(h);
}

/** Spočítá / nacacheuje { freq, phase } pro daný klíč. */
function getNoiseParams(key) {
    let cached = _cache.get(key);
    if (cached) return cached;
    const h = hashString(key);
    // Frekvence v [FREQ_MIN, FREQ_MAX] — modulo 1000 dává pseudo-uniform rozdělení
    const freq = FREQ_MIN + (h % 1000) / 1000 * (FREQ_MAX - FREQ_MIN);
    // Fáze v [0, 1) — bity z jiné části hashe ať freq a phase nejsou korelované
    const phase = ((h >> 8) % 1000) / 1000;
    cached = { freq, phase };
    _cache.set(key, cached);
    return cached;
}

/**
 * Aplikuje Neklid overlay na skeleton. Volat v render loopu PO primární
 * animaci. `time` je globální čas (ne stickman.time — Stickman.time se
 * resetuje při setStatus, my chceme kontinuální oscilaci přes přechody).
 *
 * @param {Skeleton} skeleton
 * @param {number} time - globální čas v sekundách (akumulátor v demu)
 * @param {number} level - intenzita 0–10 (UI slider; 0 = no-op)
 */
export function applyNeklid(skeleton, time, level) {
    if (level <= 0) return;
    const ampJoint = level * AMP_PER_LEVEL_JOINT;
    const tau = 2 * Math.PI;

    // === DOF osy vybraných kloubů (vrch těla) ===
    // setAngle clampuje do limits → bezpečné, Neklid nikdy nevytvoří
    // anatomicky nemožnou pozici. Klouby v NEKLID_EXCLUDED a osy
    // v NEKLID_EXCLUDED_AXES se přeskakují — viz konstanty výše.
    skeleton.forEachJoint(j => {
        if (j.dof === 0) return;
        if (NEKLID_EXCLUDED.has(j.name)) return;
        for (const ax of j.axes) {
            if (NEKLID_EXCLUDED_AXES.has(`${j.name}.${ax}`)) continue;
            const { freq, phase } = getNoiseParams(`${j.name}.${ax}`);
            const noise = Math.sin(tau * (time * freq + phase));
            skeleton.setAngle(j.name, ax, j.angles[ax] + noise * ampJoint);
        }
    });

    // Root rotation se NEMUTUJE — způsobovala efekt „loutka pověšená za
    // pelvis pivot". Anatomický fidget = stoj na nohou + drobný pohyb
    // vrchu těla. Stabilita postavy zůstává zachována napříč levelem.
}
