// src/view/StickmanView.js
// =============================================================================
// StickmanView = vizuální reprezentace Skeleton modelu v Three.js.
//
// Jak to funguje:
//   1. Pro každý Joint vytvoříme THREE.Group ("pivot kloubu"). Tyto skupiny
//      tvoří hierarchii zrcadlící Joint hierarchii. Pivot kloubu sedí na
//      localOffset od pivotu rodiče.
//   2. Pro každou viditelnou kost (= úsečka mezi rodičem a dítětem) vytvoříme
//      THREE.Mesh (válec) jako dítě pivotu RODIČE — kost se s rodičem rotuje,
//      ne s dítětem.
//   3. update() přečte úhly z modelu a aplikuje je na Three.js rotace
//      (s respektováním per-joint signs).
//
// Vše se renderuje uvnitř this.group, kterou stačí přidat do scény.
// =============================================================================

import * as THREE from 'three';
import { convexHullXZ } from '../util/Geometry.js';
import { PAL } from '../util/Palette.js';

const DEG_TO_RAD = Math.PI / 180;

// Mapa parent+child → jméno kosti (= klíč v proportions.MASS).
// Single source of truth pro DebugView hover (jméno, hmotnost) — duplikuje info
// z Skeleton.getCenterOfMass() bones tabulky, ale tady je potřeba lookup.
const BONE_NAMES = {
    'pelvis|torso':     'torsoLower',
    'torso|neck':       'torsoUpper',
    'shoulderL|elbowL': 'upperArmL',
    'elbowL|wristL':    'forearmL',
    'shoulderR|elbowR': 'upperArmR',
    'elbowR|wristR':    'forearmR',
    'hipL|kneeL':       'thighL',
    'kneeL|ankleL':     'shinL',
    'hipR|kneeR':       'thighR',
    'kneeR|ankleR':     'shinR',
};

export class StickmanView {
    /**
     * @param {Skeleton} skeleton
     * @param {object} [opts]
     * @param {number} [opts.boneColor] — override barvy kostí (default PAL.bone).
     *                                     Pro per-Stickman vizuální varianty
     *                                     (F3 biosféra: zdraví/štěstí jako barva).
     */
    constructor(skeleton, opts = {}) {
        this.skeleton = skeleton;
        const boneColor = opts.boneColor ?? PAL.bone;
        // Materiály — vlastní instance per-View (= per-Stickman barva).
        // Note: pro N postav s identickou barvou by bylo úspornější sdílet
        // mats globálně, ale pro biosféru chceme různé barvy → vlastní materials.
        this.mats = {
            torso: new THREE.MeshStandardMaterial({ color: boneColor, roughness: 0.5 }),
            limb:  new THREE.MeshStandardMaterial({ color: boneColor, roughness: 0.5 }),
            // Joint sféry sdílejí barvu se support markery — joints JSOU supports.
            joint: new THREE.MeshStandardMaterial({ color: PAL.support, roughness: 0.4 }),
            head:  new THREE.MeshStandardMaterial({ color: PAL.head,    roughness: 0.6 }),
        };
        this.group = new THREE.Group();          // root celé postavy ve scéně
        this.jointObjects = {};                  // jointName → THREE.Group (pivot kloubu)
        this.jointSpheres = {};                  // jointName → THREE.Mesh (sféra v kloubu) — jen pro DOF jointy
        this.boneMeshes = {};                    // boneName → THREE.Mesh (kost) — pro hover picking v DebugView
        this.headMesh = null;                    // THREE.Mesh hlavy — pro hover picking
        this._build();
        this.update();                            // sync s rest pose
    }

    /** Sestaví hierarchii Three.js objektů zrcadlící hierarchii Joint. */
    _build() {
        const root = this.skeleton.root;

        // Pivot rootu (= pelvis) — jediný pivot bez offsetu
        const rootObj = new THREE.Group();
        this.group.add(rootObj);
        this.jointObjects[root.name] = rootObj;

        // Rekurzivní DFS přes hierarchii
        const visit = (joint, parentObj) => {
            for (const child of joint.children) {
                // Pivot dětského kloubu — umístěný na localOffset v souřadnicích parenta
                const pivot = new THREE.Group();
                pivot.position.set(
                    child.localOffset.x,
                    child.localOffset.y,
                    child.localOffset.z
                );
                parentObj.add(pivot);
                this.jointObjects[child.name] = pivot;

                // Kost mezi parentem a tímto dítětem (mesh sedí v parentObj)
                const boneType = this._boneTypeFor(joint, child);
                if (boneType) {
                    const mesh = this._makeBoneMesh(joint, child, boneType);
                    mesh.castShadow = true;          // kost vrhá stín na podlahu
                    // userData pro hover picking (DebugView). Pokud kost nemá záznam
                    // v BONE_NAMES (= neoceňovaná kost, např. nemělo by se stát),
                    // jméno = "parent→child" jako fallback.
                    const key = `${joint.name}|${child.name}`;
                    const boneName = BONE_NAMES[key] || `${joint.name}→${child.name}`;
                    const length = Math.hypot(child.localOffset.x, child.localOffset.y, child.localOffset.z);
                    const mass = this.skeleton.proportions.MASS[boneName];   // může být undefined pro neoceňované
                    mesh.userData = {
                        type: 'bone',
                        name: boneName,
                        parent: joint.name,
                        child: child.name,
                        length,
                        mass,
                    };
                    parentObj.add(mesh);
                    this.boneMeshes[boneName] = mesh;
                }

                // Sféra v kloubu — jen pro klouby s DOF (ne pro koncové body)
                if (child.dof > 0) {
                    const sphere = new THREE.Mesh(
                        new THREE.SphereGeometry(this.skeleton.proportions.JOINT_RADIUS, 12, 12),
                        this.mats.joint
                    );
                    sphere.position.copy(pivot.position);
                    sphere.castShadow = true;
                    // userData pro hover picking. type='joint' + jointName = klíč do skeleton.joints.
                    sphere.userData = {
                        type: 'joint',
                        jointName: child.name,
                    };
                    parentObj.add(sphere);
                    this.jointSpheres[child.name] = sphere;
                }

                // Hlava jako sféra "stojící" pod headTopem
                if (child.name === 'headTop') {
                    const r = this.skeleton.proportions.HEAD_RADIUS;
                    const head = new THREE.Mesh(
                        new THREE.SphereGeometry(r, 16, 16),
                        this.mats.head
                    );
                    // headTop je vrchol hlavy → střed sféry je o HEAD_RADIUS níž
                    head.position.set(0, -r, 0);
                    head.castShadow = true;
                    head.userData = {
                        type: 'head',
                        name: 'head',
                        radius: r,
                        mass: this.skeleton.proportions.MASS.head,
                    };
                    pivot.add(head);
                    this.headMesh = head;
                }

                visit(child, pivot);
            }
        };
        visit(root, rootObj);
    }

    /**
     * Pro hranu (parent → child) vrátí typ kosti k vykreslení nebo null
     * (= žádná viditelná kost — vizuálně součást něčeho jiného).
     */
    _boneTypeFor(parent, child) {
        // R3a: trup tvoří 2 kosti — pelvis→torso (bederní) a torso→neck (hrudní).
        // Komolé kužely se ztenčí v kloubu torso (R.pelvis < R.torso < R.neck) → trup
        // má tvar lichoběžníka, jako dřív.
        if (parent.name === 'pelvis' && child.name === 'torso') return 'torso';
        if (parent.name === 'torso'  && child.name === 'neck' ) return 'torso';
        // Ramena vystupují z hrudního trupu, kyčle z pánve — kost mezi nimi nekreslíme
        if (parent.name === 'torso'  && ['shoulderL', 'shoulderR'].includes(child.name)) return null;
        if (parent.name === 'pelvis' && ['hipL', 'hipR'].includes(child.name)) return null;
        // Krk → headTop nekreslíme jako kost; sféra hlavy zakryje krk
        if (child.name === 'headTop') return null;
        // Vše ostatní = standardní končetinová kost
        return 'limb';
    }

    /**
     * Vyrobí komolý kužel mezi parent a child klouby. Poloměry odečte z proporcí
     * podle jména kloubu (R[parent.name], R[child.name]) — kost se tak plynule
     * ztenčí od širšího ramene/kyčle ke konci končetiny.
     * Pivot meshe je v parent originu, vrchní konec leží v child.localOffset.
     */
    _makeBoneMesh(parent, child, type) {
        const p = this.skeleton.proportions;
        const off = child.localOffset;
        const length = Math.hypot(off.x, off.y, off.z);
        // CylinderGeometry: 1. arg = radiusTop (lokální +Y), 2. arg = radiusBottom (lokální -Y).
        // Po geo.translate(0, length/2, 0) je pivot na -Y konci → pivot drží radiusBottom.
        // Po quaternion rotaci do směru off je top end na pozici child → drží radiusTop.
        // Tedy: radiusTop = R[child] (u dítěte), radiusBottom = R[parent] (u rodiče).
        const childR  = p.R[child.name];
        const parentR = p.R[parent.name];
        const geo = new THREE.CylinderGeometry(childR, parentR, length, 12);
        geo.translate(0, length / 2, 0);
        const mesh = new THREE.Mesh(geo, this.mats[type]);
        // Otočíme tak, aby kost mířila podél localOffset.
        const dir = new THREE.Vector3(off.x, off.y, off.z).normalize();
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        return mesh;
    }

    /**
     * Vyrobí vizualizaci těžiště:
     *  - jasně zelená sféra na pozici CoM
     *  - křížek na podlaze pod CoM (= horizontální projekce)
     *  - svislá čára spojující CoM a křížek
     * Vrací THREE.Group, který stačí přidat do scény. Pro update volej
     * updateCenterOfMassMarker(group) — typicky každý frame.
     *
     * Marker NEPATŘÍ do this.group (= postavy), protože jeho pozice je
     * world, ne v souřadnicích postavy.
     */
    createCenterOfMassMarker(floorY = -4) {
        const group = new THREE.Group();
        const r = this.skeleton.proportions.JOINT_RADIUS * 1.6;
        const COLOR = PAL.com;

        // Zelená sféra na CoM. MeshBasicMaterial = bez stínování → svítí stále.
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(r, 16, 16),
            new THREE.MeshBasicMaterial({ color: COLOR })
        );
        group.add(sphere);

        // Křížek na podlaze (dvě úsečky kolmé na sebe v rovině XZ)
        const crossMat = new THREE.LineBasicMaterial({ color: COLOR });
        const sz = 0.35;
        const crossX = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-sz, 0, 0), new THREE.Vector3(sz, 0, 0)
            ]), crossMat);
        const crossZ = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, -sz), new THREE.Vector3(0, 0, sz)
            ]), crossMat);
        const cross = new THREE.Group();
        cross.add(crossX);
        cross.add(crossZ);
        group.add(cross);

        // Svislá čára CoM → projekce. Začíná jako (0,0,0)–(0,0,0), updatuje se.
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0], 3));
        const line = new THREE.Line(
            lineGeo,
            new THREE.LineBasicMaterial({ color: COLOR, transparent: true, opacity: 0.5 })
        );
        group.add(line);

        // Uložíme reference do userData pro update
        group.userData = { sphere, cross, line, floorY };
        return group;
    }

    /**
     * Aktualizuje pozici CoM markeru. Pokud `colorByStability=true`, obarví
     * sféru/křížek/čáru podle isStable() — zelená = stabilní, červená = padá.
     */
    updateCenterOfMassMarker(marker, colorByStability = false) {
        const com = this.skeleton.getCenterOfMass();
        const { sphere, cross, line, floorY } = marker.userData;

        sphere.position.set(com.x, com.y, com.z);
        cross.position.set(com.x, floorY, com.z);

        // Update positions ve sdíleném bufferu (rychlejší než nový BufferGeometry)
        const pos = line.geometry.attributes.position.array;
        pos[0] = com.x; pos[1] = com.y;   pos[2] = com.z;
        pos[3] = com.x; pos[4] = floorY;  pos[5] = com.z;
        line.geometry.attributes.position.needsUpdate = true;

        if (colorByStability) {
            const stable = this.skeleton.isStable();
            const color = stable ? PAL.com : PAL.comUnstable;
            sphere.material.color.setHex(color);
            // Křížek a čára mají sdílené materiály mezi svými potomky/sebou
            cross.children.forEach(c => c.material.color.setHex(color));
            line.material.color.setHex(color);
        }
    }

    /**
     * Vyrobí vizualizaci podpůrného polygonu:
     *  - oranžová sféra na každém bodě opory (v jeho 3D pozici)
     *  - oranžový bod na podlaze pod každým support pointem
     *  - oranžová čára/polygon na podlaze spojující projekce
     * Vrací prázdnou THREE.Group, která se naplní/přebuduje v každém update.
     */
    createSupportPolygonMarker(floorY = -4) {
        const group = new THREE.Group();
        group.userData = { floorY };
        return group;
    }

    /** Přebuduje support marker podle aktuálního stavu modelu. */
    updateSupportPolygonMarker(marker) {
        const { floorY } = marker.userData;
        // Smažeme staré děti (jednoduchá rekonstrukce — málo objektů)
        while (marker.children.length) {
            const c = marker.children[0];
            marker.remove(c);
            // Geometrie/materiály nechám GC — jednoduchá rovnice životnosti
            if (c.geometry) c.geometry.dispose?.();
        }

        const sp = this.skeleton.getSupportPoints();
        if (sp.length === 0) return;

        const COLOR = PAL.support;
        const r = this.skeleton.proportions.JOINT_RADIUS * 1.4;
        const sphereGeo = new THREE.SphereGeometry(r, 12, 12);
        const projGeo = new THREE.SphereGeometry(r * 0.7, 10, 10);
        const sphereMat = new THREE.MeshBasicMaterial({ color: COLOR });

        // 1) Sféra v každém support pointu (jeho 3D pozice)
        sp.forEach(p => {
            const sphere = new THREE.Mesh(sphereGeo, sphereMat);
            sphere.position.set(p.x, p.y, p.z);
            marker.add(sphere);
        });
        // 2) Projekce na podlahu — menší body
        sp.forEach(p => {
            const proj = new THREE.Mesh(projGeo, sphereMat);
            proj.position.set(p.x, floorY, p.z);
            marker.add(proj);
        });
        // 3) Polygon na podlaze (spojnice mezi projekcemi).
        // Pro 3+ body musíme body seřadit do konvexního obalu, jinak se čáry
        // kříží podle vstupního pořadí supportPoints.
        if (sp.length >= 2) {
            const ordered = (sp.length >= 3) ? convexHullXZ(sp) : sp;
            const points = ordered.map(p => new THREE.Vector3(p.x, floorY + 0.01, p.z));
            if (ordered.length >= 3) points.push(points[0]);   // uzavřít polygon
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(
                lineGeo,
                new THREE.LineBasicMaterial({ color: COLOR, linewidth: 2 })
            );
            marker.add(line);
        }
    }

    /**
     * Synchronizuje Three.js objekty s aktuálním stavem modelu.
     * Volat po každé změně úhlů (typicky každý frame v animační smyčce).
     */
    update() {
        const root = this.skeleton.root;
        const rootObj = this.jointObjects[root.name];

        // Root — pozice + orientace celé postavy ve světě
        // (rootRotation je v "raw" Three.js stupních, nikoli anatomické)
        rootObj.position.set(
            this.skeleton.rootPosition.x,
            this.skeleton.rootPosition.y,
            this.skeleton.rootPosition.z
        );
        rootObj.rotation.set(
            this.skeleton.rootRotation.x * DEG_TO_RAD,
            this.skeleton.rootRotation.y * DEG_TO_RAD,
            this.skeleton.rootRotation.z * DEG_TO_RAD
        );

        // Ostatní klouby — anatomický úhel × sign → Three.js rotace
        this.skeleton.forEachJoint(j => {
            if (j === root) return;
            const obj = this.jointObjects[j.name];
            obj.rotation.set(
                j.angles.x * j.signs.x * DEG_TO_RAD,
                j.angles.y * j.signs.y * DEG_TO_RAD,
                j.angles.z * j.signs.z * DEG_TO_RAD
            );
        });
    }
}
