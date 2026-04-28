// src/model/Joint.js
// =============================================================================
// Joint = jeden uzel hierarchické kostry. Drží:
//   - lokální offset vůči rodiči v REST POSE (= klidová poloha, všechny úhly 0)
//   - aktivní osy DOF (např. ['x', 'z']) s anatomickými limity ve stupních
//   - aktuální úhly v anatomických stupních (kladné = přirozený směr pohybu)
//   - znaménka (signs) per osa — View je použije při převodu na Three.js rotaci.
//
// Pojmem "anatomický úhel" myslíme: kladná hodnota = přirozený směr pohybu
// (předklon, předkop, předpažení, ohyb lokte, abdukce ven od těla...).
// Důvod: konfigurace dema je čitelná. Komplikaci s Three.js směry řeší
// jednou provždy 'signs' v definici kostry (Skeleton.js).
//
// Třída je čistá data — bez závislosti na Three.js.
// =============================================================================

export class Joint {
    /**
     * @param {string} name - jméno (např. 'shoulderL')
     * @param {Joint|null} parent - rodičovský kloub (null = root)
     * @param {{x:number, y:number, z:number}} localOffset - pozice vůči rodiči v rest pose
     * @param {string[]} axes - aktivní osy DOF, např. ['x', 'z']
     * @param {Object} limits - {x:[min,max], z:[min,max]} ve stupních (anatomické)
     * @param {Object} signs - {x:±1, y:±1, z:±1} — znaménko pro převod na Three.js rotaci
     */
    constructor(name, parent, localOffset, axes = [], limits = {}, signs = {}) {
        this.name = name;
        this.parent = parent;
        this.children = [];
        // Shallow copy ať nesdílíme reference s definicí kostry
        this.localOffset = { ...localOffset };
        this.axes = axes;
        this.limits = limits;
        // Spread defaultů s overridem — nepřítomné osy mají sign = 1
        this.signs = { x: 1, y: 1, z: 1, ...signs };
        // Aktuální úhly držíme pro všechny tři osy (i neaktivní jsou 0)
        this.angles = { x: 0, y: 0, z: 0 };

        // Auto-připojení k rodiči
        if (parent) parent.children.push(this);
    }

    /**
     * Nastaví úhel na ose. Validuje, že osa je aktivní; mimo limity klampuje.
     * Vrací skutečně nastavenou hodnotu (po klampování).
     */
    setAngle(axis, deg) {
        if (!this.axes.includes(axis)) {
            const aktivni = this.axes.length ? this.axes.join(', ') : '—';
            throw new Error(`Joint '${this.name}' nemá aktivní osu '${axis}'. Aktivní: [${aktivni}]`);
        }
        const [min, max] = this.limits[axis];
        // Math.max/min trik = clamp(deg, min, max)
        const clamped = Math.max(min, Math.min(max, deg));
        this.angles[axis] = clamped;
        return clamped;
    }

    getAngle(axis) {
        return this.angles[axis] || 0;
    }

    /** Vrátí všechny úhly do anatomické nuly. */
    reset() {
        this.angles = { x: 0, y: 0, z: 0 };
    }

    /** Počet stupňů volnosti tohoto kloubu. */
    get dof() {
        return this.axes.length;
    }
}
