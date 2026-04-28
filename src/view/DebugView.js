// src/view/DebugView.js
// =============================================================================
// DebugView = facade nad StickmanView pro debug overlay vrstvy.
//
// Vrstvy:
//   - 'com'      → zelená sféra na CoM + projekce na podlahu (delegace na view)
//   - 'support'  → oranžové sféry support pointů + polygon na podlaze (delegace)
//   - 'gravity'  → žlutá šipka z CoM dolů (délka = vzdálenost CoM → podlaha)
//   - 'body'     → žluté polokoule jako orientační body: nos (-Z hlavy)
//                  + Anáhata = srdeční čakra (uprostřed hrudi, -Z trupu)
//   - 'tooltip'  → mousehover nad kloubem/kostí/hlavou → floating panel
//                  s názvem a metadaty (parent, DOF, limity, sign / délka, masa)
//
// Existující createCenterOfMassMarker / createSupportPolygonMarker zůstávají
// v StickmanView (existující dema je používají přímo). DebugView je jen
// orchestrátor: vyrobí všechny vrstvy najednou, dá jim per-vrstva toggle,
// a v update() je drží sync se stavem modelu.
//
// Použití:
//   const debug = new DebugView(view, { floorY: -4 });
//   debug.attachToScene(scene);
//   debug.setRaycaster(renderer.domElement, camera);   // jen pokud chceš tooltip
//   debug.setVisible('com', true);
//   debug.setVisible('body', true);
//   // v render loopu:
//   debug.update();
// =============================================================================

import * as THREE from 'three';
import { PAL } from '../util/Palette.js';

// Seznam podporovaných vrstev — single source of truth pro setVisible/isVisible
const LAYERS = ['com', 'support', 'gravity', 'body', 'tooltip'];

export class DebugView {
    /**
     * @param {StickmanView} stickmanView - existující view, ke které se přimontujeme
     * @param {object} [options]
     * @param {number} [options.floorY=-4] - Y úroveň podlahy (pro projekce a gravity arrow)
     */
    constructor(stickmanView, options = {}) {
        this.view = stickmanView;
        this.skeleton = stickmanView.skeleton;
        this.floorY = options.floorY ?? -4;

        // Stav viditelnosti per vrstva (default vše vypnuto — uživatel zapne, co chce)
        this._visible = {};
        for (const layer of LAYERS) this._visible[layer] = false;

        // Markery — vyrobíme všechny dopředu. Toggle = .visible flag (žádné add/remove).
        this._markers = {};
        this._markers.com     = this.view.createCenterOfMassMarker(this.floorY);
        this._markers.support = this.view.createSupportPolygonMarker(this.floorY);
        this._markers.gravity = this._makeGravityArrow();
        this._markers.com.visible = false;
        this._markers.support.visible = false;
        this._markers.gravity.visible = false;

        // Body markery (nos + anáhata) jsou v hierarchii postavy — rotují s hlavou/trupem.
        // Toggle = .visible flag.
        this._bodyMarkers = this._makeBodyMarkers();
        this._bodyMarkers.forEach(m => m.visible = false);

        // === Tooltip — stav (raycaster + floating HTML panel) ===
        this._tooltipPanel = null;
        this._raycaster = null;
        this._mouse = new THREE.Vector2();
        this._mouseClient = { x: 0, y: 0 };   // pixely v okně, pro umístění panelu
        this._camera = null;
        this._canvas = null;
        this._moveHandler = null;
        this._leaveHandler = null;
        this._hoverPending = false;            // throttle přes rAF

        // Reference na scénu pro dispose
        this._scene = null;
    }

    /**
     * Přidá markery do scény. Volat jednou po vytvoření DebugView.
     * Body markery už v scéně jsou (jako děti view.jointObjects.headTop / .torso).
     */
    attachToScene(scene) {
        this._scene = scene;
        scene.add(this._markers.com);
        scene.add(this._markers.support);
        scene.add(this._markers.gravity);
    }

    /**
     * Připojí raycaster pro hover tooltip. Volat až po attachToScene.
     * Pokud tooltip nepotřebuješ, nevolat.
     */
    setRaycaster(canvas, camera) {
        this._canvas = canvas;
        this._camera = camera;
        this._raycaster = new THREE.Raycaster();

        if (!this._tooltipPanel) {
            this._tooltipPanel = this._makeTooltipPanel();
            document.body.appendChild(this._tooltipPanel);
        }

        // mousemove → uložíme NDC + clientPos a požádáme o rAF tick
        // (throttling: ne každý mousemove event, ale max 1× per frame)
        this._moveHandler = (event) => {
            const rect = canvas.getBoundingClientRect();
            this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            this._mouseClient.x = event.clientX;
            this._mouseClient.y = event.clientY;
            if (!this._hoverPending) {
                this._hoverPending = true;
                requestAnimationFrame(() => {
                    this._hoverPending = false;
                    if (this._visible.tooltip) this._handleHover();
                });
            }
        };
        canvas.addEventListener('mousemove', this._moveHandler);

        // mouseleave → schovat tooltip (jinak by trčel na poslední pozici)
        this._leaveHandler = () => {
            if (this._tooltipPanel) this._tooltipPanel.style.display = 'none';
        };
        canvas.addEventListener('mouseleave', this._leaveHandler);
    }

    setVisible(layer, on) {
        if (!LAYERS.includes(layer)) {
            throw new Error(`DebugView: neznámá vrstva '${layer}'. Dostupné: ${LAYERS.join(', ')}`);
        }
        this._visible[layer] = !!on;

        if (layer === 'body') {
            this._bodyMarkers.forEach(m => m.visible = !!on);
        } else if (layer === 'tooltip') {
            // Tooltip element zůstává vždy v DOM, jen ho schováme když vypnuto.
            // Při zapnutí čeká na další mousemove — neukáže se hned.
            if (!on && this._tooltipPanel) {
                this._tooltipPanel.style.display = 'none';
            }
        } else {
            this._markers[layer].visible = !!on;
        }
    }

    isVisible(layer) {
        return !!this._visible[layer];
    }

    /**
     * Sync markerů se stavem modelu. Volat každý frame.
     * Pro vypnuté vrstvy přeskakujeme drahé operace (FK).
     */
    update() {
        if (this._visible.com) {
            this.view.updateCenterOfMassMarker(this._markers.com);
        }
        if (this._visible.support) {
            this.view.updateSupportPolygonMarker(this._markers.support);
        }
        if (this._visible.gravity) {
            this._updateGravityArrow();
        }
        // body, tooltip → bez per-frame updatu (body sleduje hierarchii postavy,
        // tooltip update se dělá v _handleHover přes mousemove)
    }

    /** Cleanup — odebere markery, listenery a HTML panel. */
    dispose() {
        if (this._moveHandler && this._canvas) {
            this._canvas.removeEventListener('mousemove', this._moveHandler);
            this._canvas.removeEventListener('mouseleave', this._leaveHandler);
        }
        if (this._tooltipPanel && this._tooltipPanel.parentNode) {
            this._tooltipPanel.parentNode.removeChild(this._tooltipPanel);
        }
        if (this._scene) {
            this._scene.remove(this._markers.com);
            this._scene.remove(this._markers.support);
            this._scene.remove(this._markers.gravity);
        }
        this._bodyMarkers.forEach(m => {
            if (m.parent) m.parent.remove(m);
        });
    }

    // =========================================================================
    // Privátní — gravity arrow
    // =========================================================================

    _makeGravityArrow() {
        // Default direction = -Y (gravitace dolů); pozice + délka se nastaví v _updateGravityArrow.
        const dir = new THREE.Vector3(0, -1, 0);
        const origin = new THREE.Vector3(0, 0, 0);
        return new THREE.ArrowHelper(dir, origin, 1, PAL.gravity, 0.3, 0.15);
    }

    _updateGravityArrow() {
        // Šipka začíná na CoM, míří dolů, konec přesně na podlaze.
        const com = this.skeleton.getCenterOfMass();
        const arrow = this._markers.gravity;
        arrow.position.set(com.x, com.y, com.z);
        const length = Math.max(0.01, com.y - this.floorY);
        // setLength(length, headLength, headWidth) — proporcionální hlavička šipky
        arrow.setLength(length, length * 0.15, length * 0.08);
    }

    // =========================================================================
    // Privátní — body markery (nos + anáhata)
    // =========================================================================

    _makeBodyMarkers() {
        // Žluté polokoule jako orientační body. Pomáhají rozpoznat orientaci
        // hlavy a trupu (sférická hlava + sférický trup jsou z dálky symetrické).
        //
        // Nos:    na povrchu hlavy směrem -Z (= kupředu pro postavu).
        // Anáhata: srdeční čakra v hatha yoga, uprostřed hrudi, taky směrem -Z.
        //
        // Polokoule = SphereGeometry s thetaLength=π/2 → severní polokoule.
        // Default orientace: plochá strana (-Y) dole, vyklenutá (+Y) nahoru.
        // Otáčíme přes Quaternion.setFromUnitVectors(+Y, look) ať vyklenutí míří ven.
        //
        // VYČNÍVÁNÍ 1/3: polokoule s poloměrem R sahá od plochy R nahoru.
        // Aby vyčnívala R/3 (a 2R/3 byla zapuštěná), posuneme střed polokoule
        // proti směru "ven" o 2R/3. Tj. plochý kruh polokoule je 2R/3 pod
        // povrchem těla.

        const r = this.skeleton.proportions.HEAD_RADIUS;
        const markerRadius = r * 0.25;                       // stejná velikost pro nos i anáhatu
        const insetDepth = (2 / 3) * markerRadius;           // posun dovnitř těla
        const yellow = new THREE.MeshBasicMaterial({ color: PAL.bodyMarker, side: THREE.DoubleSide });

        const markers = [];

        // === Nos — na hlavě ===
        // Hlava je v lokálu jointObjects.headTop sféra se středem (0, -r, 0), poloměr r.
        // Povrch sféry směrem -Z je v lokálu (0, -r, -r). Posun dovnitř = +Z.
        const noseGeo = new THREE.SphereGeometry(markerRadius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const nose = new THREE.Mesh(noseGeo, yellow);
        nose.position.set(0, -r, -r + insetDepth);
        // +Y → -Z: vyklenutá strana polokoule míří ven z hlavy
        nose.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 0, -1)
        );
        nose.userData = { type: 'body', name: 'nos' };
        nose.castShadow = true;
        this.view.jointObjects.headTop.add(nose);
        markers.push(nose);

        // === Anáhata — na hrudi ===
        // Trup horní segment (torso → neck) má délku UPPER_TORSO. Anáhata sedí
        // ve výšce 50% segmentu (= "srdce") na povrchu trupu směrem -Z.
        // Trup je trapezoid: torso radius 0.06H, neck radius 0.075H. V polovině
        // je radius ≈ 0.0675H. Posun dovnitř = +Z.
        const upperTorso = this.skeleton.proportions.UPPER_TORSO;
        const chestRadius = 0.0675 * this.skeleton.H;
        const anaGeo = new THREE.SphereGeometry(markerRadius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const anahata = new THREE.Mesh(anaGeo, yellow);
        anahata.position.set(0, upperTorso * 0.5, -chestRadius + insetDepth);
        anahata.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 0, -1)
        );
        anahata.userData = { type: 'body', name: 'anáhata (srdeční čakra)' };
        anahata.castShadow = true;
        this.view.jointObjects.torso.add(anahata);
        markers.push(anahata);

        return markers;
    }

    // =========================================================================
    // Privátní — hover tooltip
    // =========================================================================

    _makeTooltipPanel() {
        // Floating panel sledující kurzor. position:fixed, pointer-events:none
        // (klik proteče skrz na canvas).
        const panel = document.createElement('div');
        panel.id = 'debug-tooltip';
        panel.style.cssText = [
            'position: fixed',
            'left: 0',
            'top: 0',
            'background: rgba(20, 20, 30, 0.92)',
            'color: #ddd',
            'padding: 8px 12px',
            'border-radius: 4px',
            'border-left: 3px solid #ffaa66',
            'font-family: monospace',
            'font-size: 11px',
            'line-height: 1.45',
            'min-width: 160px',
            'max-width: 280px',
            'display: none',
            'z-index: 200',
            'pointer-events: none',
            'box-shadow: 0 2px 8px rgba(0,0,0,0.4)',
        ].join('; ');
        return panel;
    }

    _handleHover() {
        // Targets = vše hover-able: sféry kloubů, kosti, hlava.
        // Body markery (nos/anáhata) hover ignorujeme — jsou jen visual cue.
        const targets = [
            ...Object.values(this.view.jointSpheres),
            ...Object.values(this.view.boneMeshes),
        ];
        if (this.view.headMesh) targets.push(this.view.headMesh);

        this._raycaster.setFromCamera(this._mouse, this._camera);
        const hits = this._raycaster.intersectObjects(targets, false);

        if (hits.length === 0) {
            this._tooltipPanel.style.display = 'none';
            return;
        }

        // Nejbližší zásah → naplnit panel + umístit u kurzoru
        const hit = hits[0].object;
        this._fillTooltip(hit);
        this._positionTooltip();
        this._tooltipPanel.style.display = 'block';
    }

    _fillTooltip(mesh) {
        const ud = mesh.userData;
        let html = '';

        if (ud.type === 'joint') {
            const j = this.skeleton.joints[ud.jointName];
            const parentName = j.parent ? j.parent.name : '<root>';
            html += `<div style="color:#ffaa66; font-weight:bold">${j.name}</div>`;
            html += `<div style="opacity:0.6; font-size:10px; margin-bottom:4px">`
                 +  `kloub · parent: ${parentName} · DOF: ${j.dof}</div>`;
            // Pro každou aktivní osu řádek s aktuální hodnotou + limity + sign
            for (const ax of j.axes) {
                const lim = j.limits[ax];
                const signCh = j.signs[ax] >= 0 ? '+' : '−';
                const cur = j.angles[ax].toFixed(1);
                html += `<div>${ax}: <b style="color:#88ccff">${cur}°</b> `
                     +  `<span style="opacity:0.55">∈ [${lim[0]}, ${lim[1]}], sign ${signCh}</span></div>`;
            }
            if (j.axes.length === 0) {
                html += `<div style="opacity:0.55">koncový bod (0 DOF)</div>`;
            }
        } else if (ud.type === 'bone') {
            html += `<div style="color:#ffaa66; font-weight:bold">${ud.name}</div>`;
            html += `<div style="opacity:0.6; font-size:10px; margin-bottom:4px">`
                 +  `kost · ${ud.parent} → ${ud.child}</div>`;
            html += `<div>délka: <b style="color:#88ccff">${ud.length.toFixed(2)}</b></div>`;
            if (ud.mass !== undefined) {
                html += `<div>hmotnost: <b style="color:#88ccff">${ud.mass.toFixed(2)}</b> `
                     +  `<span style="opacity:0.55">(rel.)</span></div>`;
            }
        } else if (ud.type === 'head') {
            html += `<div style="color:#ffaa66; font-weight:bold">${ud.name}</div>`;
            html += `<div style="opacity:0.6; font-size:10px; margin-bottom:4px">hlava</div>`;
            html += `<div>poloměr: <b style="color:#88ccff">${ud.radius.toFixed(2)}</b></div>`;
            html += `<div>hmotnost: <b style="color:#88ccff">${ud.mass.toFixed(2)}</b> `
                 +  `<span style="opacity:0.55">(rel.)</span></div>`;
        } else {
            // Defenzivní fallback — nestane se, ale ať to neumře
            html = `<div>${ud.type || 'unknown'}</div>`;
        }

        this._tooltipPanel.innerHTML = html;
    }

    _positionTooltip() {
        // Pozice = kurzor + offset, ale clamp do okna ať tooltip nepřeteče.
        // Offset ~12px doprava + dolů ať nezakrývá hover target.
        const OFFSET_X = 14;
        const OFFSET_Y = 10;
        const panel = this._tooltipPanel;

        // Před pozicováním musíme znát skutečnou velikost panelu.
        // V tomto frame už je naplněný (innerHTML byl set v _fillTooltip),
        // ale display je 'none' — přepnout na block, změřit, pak set position.
        panel.style.display = 'block';
        panel.style.visibility = 'hidden';
        const rect = panel.getBoundingClientRect();
        panel.style.visibility = 'visible';

        const winW = window.innerWidth;
        const winH = window.innerHeight;
        // Default position (vpravo dole od kurzoru); fallback vlevo nahoru pokud přetekl.
        let x = this._mouseClient.x + OFFSET_X;
        let y = this._mouseClient.y + OFFSET_Y;
        if (x + rect.width > winW - 8)  x = this._mouseClient.x - rect.width - OFFSET_X;
        if (y + rect.height > winH - 8) y = this._mouseClient.y - rect.height - OFFSET_Y;
        // Po fallbacku ještě clamp na 0+ ať se nezašokovaně neztratil
        x = Math.max(4, x);
        y = Math.max(4, y);
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
    }
}
