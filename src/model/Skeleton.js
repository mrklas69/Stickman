// src/model/Skeleton.js
// =============================================================================
// Skeleton "Minimal" — 9 funkčních kloubů + 4 koncové body, celkem 15 DOF.
//
// SVĚTOVÁ KONVENCE:
//   - Postava stojí v origin a "dívá se" podél -Z (Three.js standard).
//   - Postavova PRAVÁ ruka = +X, postavova LEVÁ = -X.
//   - Rest pose (všechny úhly 0): postava stojí svisle, ruce visí dolů.
//
// ANATOMICKÉ ÚHLY (model) → THREE.JS ROTACE (view):
//   - Úhly v Joint.angles jsou ANATOMICKÉ: kladné = přirozený směr.
//   - Mapování na Three.js rotaci řeší per-osa 'sign' v definici kloubu.
//   - Příklad: ohyb kolena (lýtko dozadu) je anatomicky kladný, ale
//     v Three.js jde o zápornou rotaci.x → kneeL/R má signX = -1.
//
// HIERARCHIE (Minimal):
//   pelvis (root, 0 DOF)
//   ├── torso (3) ── neck (3) ── headTop (0)
//   ├── shoulderL (2) ── elbowL (1) ── wristL (0)
//   ├── shoulderR (2) ── elbowR (1) ── wristR (0)
//   ├── hipL (2) ── kneeL (1) ── ankleL (0)
//   └── hipR (2) ── kneeR (1) ── ankleR (0)
// =============================================================================

import { Joint } from './Joint.js';
import { Mat4 }  from './Mat4.js';
import {
    distXZ,
    distPointToSegmentXZ,
    convexHullXZ,
    pointInConvexPolygonXZ,
} from '../util/Geometry.js';

/**
 * Vrátí proporce postavy relativně k výšce H. Inspirace Vitruviem (8 hlav).
 * Všechny hodnoty jsou v "world units" (= jednotkách scény).
 */
function buildProportions(H) {
    // Trup rozdělen na 2 segmenty (R3a — body roll & flexe v pase):
    //   pelvis → torso  = bederní segment (lumbar)
    //   torso  → neck   = hrudní segment (thoracic)
    // Kloub `torso` umožňuje twist (body roll) a flexi v pase.
    // TORSO_LENGTH = LOWER_TORSO + UPPER_TORSO (zachováno pro zpětnou kompatibilitu — žádná pose ho přímo nepoužívá).
    const LOWER_TORSO = 0.16 * H;   // pelvis → torso (½ původního)
    const UPPER_TORSO = 0.16 * H;   // torso  → neck  (½ původního)

    return {
        H,
        // === DÉLKY KOSTÍ a klíčové vzdálenosti ===
        HEAD_RADIUS:   0.0625 * H,  // = H/16, sféra hlavy
        LOWER_TORSO,                // pelvis → torso (bederní)
        UPPER_TORSO,                // torso → neck (hrudní)
        TORSO_LENGTH:  LOWER_TORSO + UPPER_TORSO,  // celkový trup, pro referenci
        // SHOULDER_X = R.neck → ramenní klouby leží přesně na povrchu trupu nahoře
        SHOULDER_X:    0.075  * H,
        // HIP_X mírně > R.pelvis → pánevní klouby vyčnívají z pasu (vidět)
        HIP_X:         0.050  * H,
        UPPER_ARM:     0.180  * H,  // rameno → loket (kratší biceps)
        FOREARM:       0.215  * H,  // loket → zápěstí (delší předloktí — pro ohnutý loket dlaň doráží k hlavě/krku)
        THIGH:         0.245  * H,  // kyčel → koleno
        SHIN:          0.245  * H,  // koleno → kotník

        // === TLOUŠŤKY KOSTÍ — per-joint poloměry ===
        // Kost mezi parent a child se vykreslí jako komolý kužel (radiusBottom=parent, radiusTop=child),
        // takže končetiny plynule ztenčí: rameno → loket → zápěstí, kyčel → koleno → kotník.
        // Trup je obrácený lichoběžník: užší u pasu (pelvis), torso uprostřed, širší u ramen (neck).
        // Pravidlo "trup > hlava" se počítá z R.neck = 0.075H > HEAD_RADIUS = 0.0625H ✓
        R: {
            pelvis:    0.040 * H,                          // úzký pas
            torso:     0.060 * H,                          // střed trupu (mezi pelvis a neck)
            neck:      0.075 * H,                          // široká ramena (vrch trupu)
            shoulderL: 0.030 * H, shoulderR: 0.030 * H,
            elbowL:    0.022 * H, elbowR:    0.022 * H,
            wristL:    0.016 * H, wristR:    0.016 * H,
            hipL:      0.034 * H, hipR:      0.034 * H,
            kneeL:     0.024 * H, kneeR:     0.024 * H,
            ankleL:    0.018 * H, ankleR:    0.018 * H,
        },
        JOINT_RADIUS:  0.020 * H,  // koule v kloubech

        // === HMOTNOSTI KOSTÍ pro výpočet těžiště ===
        // Relativní hodnoty (jednotka libovolná, jde jen o poměry).
        // Anatomicky: trup ~50 %, hlava ~8 %, noha ~14 % (stehno+lýtko), paže ~5 % (paže+předloktí).
        // Suma ≈ 1; nevadí, getCenterOfMass normalizuje.
        // R3a: trup rozdělen napůl — torsoLower (bederní + břicho) a torsoUpper (hrudník).
        MASS: {
            head:        0.08,
            torsoLower:  0.25,                      // pelvis → torso
            torsoUpper:  0.25,                      // torso → neck
            upperArmL:   0.03, upperArmR: 0.03,
            forearmL:    0.02, forearmR:  0.02,
            thighL:      0.10, thighR:    0.10,
            shinL:       0.04, shinR:     0.04,
        },
    };
}

export class Skeleton {
    constructor(H = 8) {
        this.H = H;
        this.proportions = buildProportions(H);
        this.joints = {};                            // flat mapa name → Joint
        this.rootPosition = { x: 0, y: 0, z: 0 };    // umístění celé postavy ve světě
        this.rootRotation = { x: 0, y: 0, z: 0 };    // orientace ve stupních (Three.js přímo)
        // Body opory NEJSOU explicitní field — joints jsou supports automaticky.
        // Contact body se počítají dynamicky z aktuální world Y (viz getContactPoints).
        // `supportPoints` getter níže zachován pro legacy přístup ze starých dem.
        this._build();
        this.root = this.joints.pelvis;
    }

    /**
     * Legacy getter — vrací jména kontaktních kloubů (= těch s Y blízko nejnižšího
     * po current world transformations). Žádný setter — assignment ze starých dem
     * se ignoruje.
     */
    get supportPoints() {
        this.computeWorldTransforms();
        const tol = this.H * 0.04;
        let minY = Infinity;
        for (const j of Object.values(this.joints)) {
            if (j.worldPosition.y < minY) minY = j.worldPosition.y;
        }
        return Object.values(this.joints)
            .filter(j => j.worldPosition.y <= minY + tol)
            .map(j => j.name);
    }
    // Setter no-op pro backward compat — stará dema dělají skel.supportPoints = [...]
    set supportPoints(_) { /* ignorováno — supports jsou teď dynamicky určené */ }

    /**
     * Sestaví hierarchii. Každý kloub má lokální offset vůči rodiči
     * v REST POSE (postava stojí svisle, ruce dolů).
     */
    _build() {
        const p = this.proportions;
        // Krátká pomocná funkce pro přidání kloubu do mapy
        const add = (name, parent, off, axes = [], limits = {}, signs = {}) => {
            const j = new Joint(name, parent, off, axes, limits, signs);
            this.joints[name] = j;
            return j;
        };

        // === ROOT — pelvis ===
        // Virtuální kořen, jeho světová pozice = rootPosition.
        const pelvis = add('pelvis', null, { x: 0, y: 0, z: 0 });

        // === Pas → trup → krk → hlava ===
        // R3a: torso = nový kloub uprostřed trupu (lumbar/thoracic). 3 DOF:
        //   x = flexe (předklon kupředu = anatomicky kladné). Stejné jako neck — Three.js Rx záporné, signX = -1.
        //   y = twist (rotace kolem podélné osy páteře = body roll). Anatomicky kladné = otočení doprava
        //       (= ramena se natáčejí tak, že pravé jde dopředu = -Z; Three.js Ry takhle to dělá → signY = +1).
        //   z = lateral flexe (úklon do strany). Anatomicky kladné = úklon doleva (postavy). signZ = +1 (jako neck).
        const torso = add('torso', pelvis,
            { x: 0, y: p.LOWER_TORSO, z: 0 },
            ['x', 'y', 'z'],
            // x: -30 záklon (lumbar extension pro Sphinx/kobra), 30 předklon
            // y: ±45 twist (body roll v plavu)
            // z: ±20 lateral flexe (úklon, anatomicky ~25-30°)
            { x: [-30, 30], y: [-45, 45], z: [-20, 20] },
            { x: -1, y: +1, z: +1 }
        );

        // neck sedí na vrcholu trupu, NAD torso (= druhá polovina páteře = hrudní/krční).
        //   x = předklon/záklon (signX = -1; hlava +Y → -Z; v Three.js by to bylo +X, ale chceme -Z → invert)
        //   y = twist hlavy (signY = +1, stejná konvence jako torso.y — v lokále neck
        //       je Three.js Ry+ otočení kolem osy páteře vůči parent torso). Limity ±90°.
        //   z = úklon hlavy (signZ = +1; úklon doleva postavy = -X)
        const neck = add('neck', torso,
            { x: 0, y: p.UPPER_TORSO, z: 0 },
            ['x', 'y', 'z'],
            { x: [-30, 60], y: [-90, 90], z: [-40, 40] },
            { x: -1, y: +1, z: +1 }
        );
        // Vršek hlavy — koncový bod (0 DOF). View tu položí sféru hlavy se středem
        // o HEAD_RADIUS níž, takže její SPODEK leží přesně na krčním kloubu.
        add('headTop', neck,
            { x: 0, y: p.HEAD_RADIUS * 2, z: 0 }
        );

        // === Levá paže (-X strana = postavova LEVÁ) ===
        // R3a: ramena teď visí na `torso` (= rotují s body rollem), ne na pelvis.
        // Lokální offset = (±SHOULDER_X, UPPER_TORSO, 0) — v lokálu torso je shoulder
        // na vrchu hrudního segmentu (= u krku).
        // Paže visí (0, -UPPER_ARM, 0) v lokálu shoulderL.
        // Předpažení (paže kupředu = -Z): vec(0,-1,0) +θ kolem +X = -Z pro +90°. signX = +1.
        // Anatomická abdukce (paže ven od těla, pro shoulderL = -X):
        //   vec(0,-1,0) -θ kolem +Z = -X pro -90° → potřeba -Three.js Z → signZ = -1.
        const shoulderL = add('shoulderL', torso,
            { x: -p.SHOULDER_X, y: p.UPPER_TORSO, z: 0 },
            ['x', 'z'],
            // x: -90 = paže za záda (extension), 200 = paže přes hlavu dozadu (hyperextenze
            //         pro plavce/gymnasty — reálně se kombinuje s body roll v torso.y)
            { x: [-90, 200], z: [-30, 120] },
            { x: +1, z: -1 }
        );
        // Loket: ohyb předloktí kupředu. Vec(0,-1,0) +θ X = -Z pro +90°. signX = +1.
        const elbowL = add('elbowL', shoulderL,
            { x: 0, y: -p.UPPER_ARM, z: 0 },
            ['x'],
            { x: [0, 170] },
            { x: +1 }
        );
        add('wristL', elbowL,
            { x: 0, y: -p.FOREARM, z: 0 }
        );

        // === Pravá paže (+X strana = postavova PRAVÁ) — zrcadlová abdukce ===
        // Anatomická abdukce (paže ven, pro shoulderR = +X):
        //   vec(0,-1,0) +θ kolem +Z = +X pro +90° → bez invertu → signZ = +1.
        const shoulderR = add('shoulderR', torso,
            { x: p.SHOULDER_X, y: p.UPPER_TORSO, z: 0 },
            ['x', 'z'],
            { x: [-90, 200], z: [-30, 120] },
            { x: +1, z: +1 }
        );
        const elbowR = add('elbowR', shoulderR,
            { x: 0, y: -p.UPPER_ARM, z: 0 },
            ['x'],
            { x: [0, 170] },
            { x: +1 }
        );
        add('wristR', elbowR,
            { x: 0, y: -p.FOREARM, z: 0 }
        );

        // === Levá noha (-X) ===
        // Předkop (noha kupředu = -Z): stejně jako rameno, signX = +1.
        // Roznožka (noha ven, -X): jako abdukce shoulderL, signZ = -1.
        const hipL = add('hipL', pelvis,
            { x: -p.HIP_X, y: 0, z: 0 },
            ['x', 'z'],
            // x: -30 = záklop, 140 = hluboký předkop (klečení, hluboký dřep, yoga)
            { x: [-30, 140], z: [-10, 60] },
            { x: +1, z: -1 }
        );
        // Koleno: ohyb (lýtko dozadu = +Z). Vec(0,-1,0) -θ X = +Z pro -90°. signX = -1.
        const kneeL = add('kneeL', hipL,
            { x: 0, y: -p.THIGH, z: 0 },
            ['x'],
            { x: [0, 130] },
            { x: -1 }
        );
        add('ankleL', kneeL,
            { x: 0, y: -p.SHIN, z: 0 }
        );

        // === Pravá noha (+X) ===
        const hipR = add('hipR', pelvis,
            { x: p.HIP_X, y: 0, z: 0 },
            ['x', 'z'],
            { x: [-30, 140], z: [-10, 60] },
            { x: +1, z: +1 }
        );
        const kneeR = add('kneeR', hipR,
            { x: 0, y: -p.THIGH, z: 0 },
            ['x'],
            { x: [0, 130] },
            { x: -1 }
        );
        add('ankleR', kneeR,
            { x: 0, y: -p.SHIN, z: 0 }
        );
    }

    getJoint(name) {
        const j = this.joints[name];
        if (!j) throw new Error(`Skeleton nemá kloub '${name}'`);
        return j;
    }

    setAngle(jointName, axis, deg) {
        return this.getJoint(jointName).setAngle(axis, deg);
    }

    /** Resetuje všechny klouby do rest pose a root do origin. */
    reset() {
        Object.values(this.joints).forEach(j => j.reset());
        this.rootPosition = { x: 0, y: 0, z: 0 };
        this.rootRotation = { x: 0, y: 0, z: 0 };
    }

    /** Iteruje přes všechny klouby (callback dostane Joint). */
    forEachJoint(fn) {
        Object.values(this.joints).forEach(fn);
    }

    /** Suma DOF napříč klouby — pro Minimal má být 14. */
    get totalDOF() {
        return Object.values(this.joints).reduce((sum, j) => sum + j.dof, 0);
    }

    // =========================================================================
    // FORWARD KINEMATICS — výpočet world transforms a center of mass
    // =========================================================================

    /**
     * Spočítá pro každý kloub `worldMatrix` (transform v globálních souřadnicích)
     * a `worldPosition` (pivot kloubu ve světě). Volat po každé změně úhlů
     * nebo root transformace, pokud chceš přesné world pozice.
     *
     * Pravidlo skládání:
     *   world(joint) = world(parent) × Translation(localOffset) × Rotation(angles)
     * Pro root: world = Translation(rootPosition) × Rotation(rootRotation).
     */
    computeWorldTransforms() {
        const DEG = Math.PI / 180;
        const RX = new Mat4(), RY = new Mat4(), RZ = new Mat4(), TM = new Mat4();

        // === Root (pelvis) ===
        const root = this.root;
        root.worldMatrix = new Mat4()
            .setTranslation(this.rootPosition.x, this.rootPosition.y, this.rootPosition.z);
        // Root rotace = "raw" Three.js stupně (bez signs), order XYZ
        RX.setRotationX(this.rootRotation.x * DEG); root.worldMatrix.multiply(RX);
        RY.setRotationY(this.rootRotation.y * DEG); root.worldMatrix.multiply(RY);
        RZ.setRotationZ(this.rootRotation.z * DEG); root.worldMatrix.multiply(RZ);

        // === Rekurzivní DFS přes děti ===
        const visit = (joint) => {
            for (const child of joint.children) {
                // Lokální transformace = T(localOffset) × R (rotace uvnitř kloubu)
                // Anatomický úhel × sign = Three.js rotace v lokálních souřadnicích
                const local = new Mat4().setTranslation(
                    child.localOffset.x, child.localOffset.y, child.localOffset.z
                );
                // Order rotací XYZ (stejně jako Three.js Object3D.rotation default)
                // Pro nás jen X a Z (Y je vždy 0, nemáme twist DOF), ale pro úplnost necháme všechny.
                RX.setRotationX(child.angles.x * child.signs.x * DEG); local.multiply(RX);
                RY.setRotationY(child.angles.y * child.signs.y * DEG); local.multiply(RY);
                RZ.setRotationZ(child.angles.z * child.signs.z * DEG); local.multiply(RZ);

                // worldMatrix(child) = worldMatrix(parent) × local
                child.worldMatrix = joint.worldMatrix.clone().multiply(local);
                visit(child);
            }
        };
        visit(root);

        // Pro každý joint cache world position (origin transformovaný world matricí)
        const ORIGIN = { x: 0, y: 0, z: 0 };
        this.forEachJoint(j => {
            j.worldPosition = j.worldMatrix.transformPoint(ORIGIN);
        });
    }

    /**
     * Vrátí pozici pivotu kloubu ve světových souřadnicích {x, y, z}.
     * Implicitně volá computeWorldTransforms() — pokud voláš víc takových dotazů
     * najednou, zavolej raději jednou computeWorldTransforms() ručně a čti
     * `joint.worldPosition` přímo.
     */
    getJointWorldPosition(name) {
        this.computeWorldTransforms();
        return { ...this.getJoint(name).worldPosition };
    }

    /**
     * Vrátí těžiště postavy ve světových souřadnicích {x, y, z}.
     * Sečte vážené středy všech kostí (a hlavy) podle proportions.MASS.
     */
    getCenterOfMass() {
        this.computeWorldTransforms();
        const M = this.proportions.MASS;
        const J = this.joints;

        // Tabulka kostí: [parent jméno, child jméno, klíč v MASS]
        // Středem kosti rozumíme polovinu úsečky parent↔child ve světě.
        // R3a: trup rozdělen na 2 segmenty (pelvis→torso = bederní, torso→neck = hrudní).
        const bones = [
            ['pelvis',    'torso',    'torsoLower'],
            ['torso',     'neck',     'torsoUpper'],
            ['shoulderL', 'elbowL',   'upperArmL'],
            ['elbowL',    'wristL',   'forearmL'],
            ['shoulderR', 'elbowR',   'upperArmR'],
            ['elbowR',    'wristR',   'forearmR'],
            ['hipL',      'kneeL',    'thighL'],
            ['kneeL',     'ankleL',   'shinL'],
            ['hipR',      'kneeR',    'thighR'],
            ['kneeR',     'ankleR',   'shinR'],
        ];

        let sumX = 0, sumY = 0, sumZ = 0, sumM = 0;
        for (const [pn, cn, mk] of bones) {
            const a = J[pn].worldPosition;
            const b = J[cn].worldPosition;
            const m = M[mk];
            sumX += (a.x + b.x) * 0.5 * m;
            sumY += (a.y + b.y) * 0.5 * m;
            sumZ += (a.z + b.z) * 0.5 * m;
            sumM += m;
        }

        // Hlava — sféra vystředěná na (0, -HEAD_RADIUS, 0) v lokálu headTopu.
        // Aplikujeme world matrix headTopu na tento bod.
        const headLocal = { x: 0, y: -this.proportions.HEAD_RADIUS, z: 0 };
        const headCenter = J.headTop.worldMatrix.transformPoint(headLocal);
        const mHead = M.head;
        sumX += headCenter.x * mHead;
        sumY += headCenter.y * mHead;
        sumZ += headCenter.z * mHead;
        sumM += mHead;

        return { x: sumX / sumM, y: sumY / sumM, z: sumZ / sumM };
    }

    // =========================================================================
    // BODY OPORY a STABILITA
    // =========================================================================

    /**
     * Vrátí world pozice {x,y,z} kontaktních kloubů (= těch s Y blízko nejnižšího,
     * uvnitř `tolerance`). Joints jsou supports automaticky a contact body se
     * počítají dynamicky podle current geometrie pose.
     *
     * @param {number} [tolerance] - šířka pásu od minY (default = 0.04 × H)
     */
    getSupportPoints(tolerance = null) {
        this.computeWorldTransforms();
        const tol = tolerance ?? this.H * 0.04;
        let minY = Infinity;
        for (const j of Object.values(this.joints)) {
            if (j.worldPosition.y < minY) minY = j.worldPosition.y;
        }
        return Object.values(this.joints)
            .filter(j => j.worldPosition.y <= minY + tol)
            .map(j => ({ ...j.worldPosition }));
    }

    /**
     * Posune rootPosition.y tak, aby NEJNIŽŠÍ joint ležel přesně na floorY.
     * Joints jsou nyní všechny supports — algoritmus prochází všechny pivots,
     * najde minimum Y, a srovná na podlahu.
     *
     * Pozor: po snapu jsou cached worldPositions zastaralé. Pokud chceš dál
     * pracovat s world pozicemi, zavolej computeWorldTransforms() znovu nebo
     * přímo getCenterOfMass() (která to volá interně).
     */
    snapToFloor(floorY = 0) {
        this.computeWorldTransforms();
        let minY = Infinity;
        for (const j of Object.values(this.joints)) {
            if (j.worldPosition.y < minY) minY = j.worldPosition.y;
        }
        if (minY === Infinity) return;
        this.rootPosition.y += (floorY - minY);
    }

    /**
     * Test stability: leží horizontální projekce CoM uvnitř contact polygonu?
     * - 0 bodů: nestabilní vždy
     * - 1 bod: stabilní pokud distance(CoM_xz, point_xz) <= tolerance (= "velikost chodidla")
     * - 2 body: stabilní pokud distance od úsečky AB v rovině XZ <= tolerance
     * - 3+ bodů: convex hull v rovině XZ + point-in-polygon test (s tolerance jako rozšíření)
     *
     * @param {number} [tolerance] - rozšíření polygonu (default = 0.04 × H, "velikost chodidla")
     */
    isStable(tolerance = null) {
        const cp = this.getSupportPoints(tolerance);
        if (cp.length === 0) return false;
        const com = this.getCenterOfMass();
        const tol = tolerance ?? this.H * 0.04;

        if (cp.length === 1) return distXZ(com, cp[0]) <= tol;
        if (cp.length === 2) return distPointToSegmentXZ(com, cp[0], cp[1]) <= tol;
        const hull = convexHullXZ(cp);
        return pointInConvexPolygonXZ(com, hull, tol);
    }
}

// (Geometrie přesunuta do src/util/Geometry.js — single source of truth)
