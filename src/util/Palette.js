// src/util/Palette.js
// =============================================================================
// Hi-tech paleta projektu Stickman.
//
// Inspirace: Blade Runner / cyberpunk — hluboké tmavé pozadí, teplé akcenty
// (amber, gold) + chladné akcenty (ice blue, turquoise). Kontrastní výrazné
// barvy (magenta) pro vrstvy debug overlay, ať jsou vidět proti šedé postavě.
//
// Použití:
//   import { PAL } from '../util/Palette.js';
//   const mat = new THREE.MeshBasicMaterial({ color: PAL.com });
//
// Barvy jsou hex literály (Three.js akceptuje number | hex). CSS odpovídající
// barvy v demos jsou v `#1a1a22` formátu — záměrně paralelně.
// =============================================================================

export const PAL = {
    // === Pozadí, panely (= zachováno z původní palety dem) ===
    bg:          0x1a1a22,   // hluboké pozadí scény + body
    panel:       0x22222b,   // panely UI (vedle viewportu)

    // === Tělo postavy (zachováno) ===
    bone:        0xaaaaaa,   // kosti, trup
    head:        0xddccbb,   // pleť hlavy
    joint:       0xff7733,   // sféry kloubů (amber-orange)

    // === Debug overlay — hi-tech akcenty ===
    com:         0x26d9b8,   // CoM stabilní — turquoise (chladná = klid)
    comUnstable: 0xff5577,   // CoM nestabilní — magenta-coral (warning)
    support:     0xff5aa8,   // body opory — magenta-pink (kontrast s amber)
    gravity:     0xffdd44,   // gravitační šipka — gold
    bodyMarker:  0xffcc00,   // nos / anáhata — sytá gold

    // === UI accents (zachováno) ===
    amber:       0xffaa66,   // primární UI akcent (titulky, aktivní tlačítka)
    ice:         0x88ccff,   // sekundární UI akcent (číselné hodnoty)
};
