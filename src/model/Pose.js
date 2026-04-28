// src/model/Pose.js
// =============================================================================
// Pose = snapshot stavu kostry: úhly všech aktivních os + root pozice/rotace.
// Slouží k uložení pojmenovaných póz ('sit', 'stand', 'wave') a jejich aplikaci
// na kostru. Bez závislosti na Three.js.
// =============================================================================

export class Pose {
    constructor(name = '') {
        this.name = name;
        // Mapa { jointName: { x?, y?, z? } } — držíme jen aktivní osy daného kloubu
        this.angles = {};
        this.rootPosition = { x: 0, y: 0, z: 0 };
        this.rootRotation = { x: 0, y: 0, z: 0 };
        // Body opory pro tuto pózu (např. ['wristL','wristR'] pro stoj na rukách).
        // null = zachovat default kostry (= chodidla po skel.reset()).
        this.supportPoints = null;
    }

    /**
     * Vyrobí Pose snapshot z aktuálního stavu kostry.
     * Statická metoda → voláme Pose.capture(skel, 'name').
     */
    static capture(skeleton, name = '') {
        const pose = new Pose(name);
        skeleton.forEachJoint(j => {
            // Koncové body (0 DOF) přeskakujeme — nemají co ukládat
            if (j.dof > 0) {
                pose.angles[j.name] = {};
                // Pro každou aktivní osu uložíme aktuální úhel
                j.axes.forEach(ax => pose.angles[j.name][ax] = j.angles[ax]);
            }
        });
        // Spread = shallow copy plain objektů
        pose.rootPosition = { ...skeleton.rootPosition };
        pose.rootRotation = { ...skeleton.rootRotation };
        // Body opory — capture si je pamatuje, aby lerp(captured, …) fungovala konzistentně
        pose.supportPoints = [...skeleton.supportPoints];
        return pose;
    }

    /**
     * Lineární interpolace mezi dvěma pózami pro daný parametr t ∈ [0,1].
     * t=0 → vrátí pózu 'a', t=1 → vrátí 'b', mezi tím lineární mix.
     *
     * Pravidla:
     * - Úhly: lineární interpolace per-osa. Pokud jeden z dvou pos kloub
     *   neuvádí, jeho hodnota = 0 (= rest pose) → interpolace s rest pose.
     * - rootPosition / rootRotation: lineární interpolace.
     * - supportPoints: DISKRÉTNÍ skok v půli (t<0.5 → a, jinak b).
     *   Body opory jsou množina, ne plynulý parametr — nelze interpolovat.
     */
    static lerp(a, b, t) {
        const result = new Pose(`${a.name || ''} → ${b.name || ''}`);

        // Sjednocení jmen kloubů ze obou pos (Set odstraní duplicity)
        const allJoints = new Set([
            ...Object.keys(a.angles),
            ...Object.keys(b.angles),
        ]);
        for (const jointName of allJoints) {
            const aAng = a.angles[jointName] || {};
            const bAng = b.angles[jointName] || {};
            const allAxes = new Set([...Object.keys(aAng), ...Object.keys(bAng)]);
            result.angles[jointName] = {};
            for (const axis of allAxes) {
                // ?? 0 = pokud osa chybí, default 0 (= rest pose pro tu osu)
                const va = aAng[axis] ?? 0;
                const vb = bAng[axis] ?? 0;
                result.angles[jointName][axis] = va + (vb - va) * t;
            }
        }

        // Root pos/rot — lineární interpolace per-osa
        for (const ax of ['x', 'y', 'z']) {
            result.rootPosition[ax] =
                a.rootPosition[ax] + (b.rootPosition[ax] - a.rootPosition[ax]) * t;
            result.rootRotation[ax] =
                a.rootRotation[ax] + (b.rootRotation[ax] - a.rootRotation[ax]) * t;
        }

        // Support points — diskrétní (žádné "půl chodidla, půl ruky")
        result.supportPoints = (t < 0.5) ? a.supportPoints : b.supportPoints;

        return result;
    }

    /**
     * Aplikuje pózu na kostru. Nejdřív zresetuje (= úhly chybějící v Pose
     * skončí na 0), pak nastaví úhly z této Pose.
     */
    apply(skeleton) {
        skeleton.reset();
        // Object.entries({a:1, b:2}) → [['a',1], ['b',2]] — destrukturace v for-of
        for (const [jointName, angles] of Object.entries(this.angles)) {
            for (const [axis, deg] of Object.entries(angles)) {
                skeleton.setAngle(jointName, axis, deg);
            }
        }
        skeleton.rootPosition = { ...this.rootPosition };
        skeleton.rootRotation = { ...this.rootRotation };
        // Pokud póza definuje vlastní body opory, přepíše default z reset()
        if (this.supportPoints !== null) {
            skeleton.supportPoints = [...this.supportPoints];
        }
    }
}
