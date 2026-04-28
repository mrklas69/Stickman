// src/scene/BasicScene.js
// =============================================================================
// BasicScene = společné prostředí pro všechna dema.
//   - WebGL renderer ve full-window
//   - perspektivní kamera + OrbitControls (tažením myši)
//   - ambientní + bodové světlo (žádná podlaha — postava visí ve vzduchu)
//   - animační smyčka, do které lze registrovat callbacky přes onUpdate()
//
// Postava se "dívá" podél -Z, takže kamera defaultně stojí na -Z straně,
// aby viděla její obličej.
// =============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class BasicScene {
    /**
     * @param {object} opts
     * @param {number} [opts.background=0x1a1a22]   barva pozadí
     * @param {number} [opts.cameraDistance=18]    vzdálenost kamery od cíle
     * @param {number} [opts.cameraHeight=0]        výška kamery (= y cíle)
     * @param {HTMLElement} [opts.container]        kam vložit canvas (default = document.body)
     * @param {boolean} [opts.shadows=true]         zapnout stíny (DirectionalLight + shadowMap)
     * @param {number|null} [opts.floorY=null]      Y úroveň podlahy (null = bez podlahy)
     */
    constructor({
        background = 0x1a1a22,
        cameraDistance = 18,
        cameraHeight = 0,
        container = null,
        shadows = true,
        floorY = null,
    } = {}) {
        // Pokud uživatel dodal vlastní container, měříme jeho velikost.
        // Jinak (default) = document.body, měříme celé okno (= chování pro demo01/02).
        this._customContainer = container !== null;
        this.container = container || document.body;
        const { width, height } = this._getSize();

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(background);

        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
        // Postava dívá -Z → kamera u -Z vidí obličej
        this.camera.position.set(0, cameraHeight, -cameraDistance);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        // Stíny — měkké (PCFSoft), kvalitnější než výchozí ostré
        if (shadows) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, cameraHeight, 0);
        this.controls.enableDamping = true;          // plynulé doběhnutí kamery

        // === Světla ===
        // POZOR: Three.js r155+ má defaultně "physically correct lights" =
        // intenzita ve fyzikálních jednotkách (lumeny/candely). Staré hodnoty
        // typu 0.5–1.5 jsou teď extrémně tmavé — proto pracujeme s desítkami.
        this.scene.add(new THREE.AmbientLight(0x8899aa, 1.5));

        // DirectionalLight = paralelní paprsky (jako slunce), vhodné pro stíny.
        // Cheaper na shadow map než PointLight a má větší dosah.
        const dir = new THREE.DirectionalLight(0xffffff, 3.5);
        dir.position.set(-8, 14, -12);
        if (shadows) {
            dir.castShadow = true;
            // Shadow camera bounds — co bude ve stínu zachyceno
            dir.shadow.camera.left   = -12;
            dir.shadow.camera.right  =  12;
            dir.shadow.camera.top    =  12;
            dir.shadow.camera.bottom = -12;
            dir.shadow.camera.near   = 0.5;
            dir.shadow.camera.far    = 50;
            dir.shadow.mapSize.set(1024, 1024);
            dir.shadow.bias = -0.001;          // potlačí "shadow acne" na vzdálených plochách
        }
        this.scene.add(dir);
        this.shadows = shadows;

        // === Volitelná podlaha ===
        // Pokud floorY je číslo, vyrobíme tmavý plane v této výšce, který stíny PŘIJÍMÁ.
        if (floorY !== null) {
            // 33% průhlednost (= 67% opacity) — dostatečně viditelná podlaha,
            // ale support polygon a další overlay vrstvy pod ní lehce prosvítají.
            const floorMat = new THREE.MeshStandardMaterial({
                color: 0x2a2a30, roughness: 0.9, metalness: 0.0,
                transparent: true, opacity: 0.67,
            });
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
            floor.rotation.x = -Math.PI / 2;        // do horizontální roviny
            floor.position.y = floorY;
            if (shadows) floor.receiveShadow = true;
            this.scene.add(floor);
            this.floor = floor;
        }

        // Reaktivní velikost na změnu okna (custom container se přepočítá taky)
        window.addEventListener('resize', () => {
            const { width, height } = this._getSize();
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        });

        // Pole callbacků, které se zavolají každý frame
        this._updaters = [];

        // Built-in pauza — pokud je true, animační smyčka přeskočí volání updaterů
        // (renderer ale pořád kreslí, aby OrbitControls fungovaly).
        this.paused = false;
    }

    /** Vrátí aktuální velikost renderovací plochy v pixelech. */
    _getSize() {
        if (this._customContainer) {
            return { width: this.container.clientWidth, height: this.container.clientHeight };
        }
        return { width: window.innerWidth, height: window.innerHeight };
    }

    /** Zaregistruje funkci volanou každý frame s parametry (delta, time). */
    onUpdate(fn) {
        this._updaters.push(fn);
    }

    /** Spustí animační smyčku. Volat až po sestavení scény. */
    start() {
        // THREE.Clock měří uplynulý čas mezi voláními getDelta()
        const clock = new THREE.Clock();
        // Akumulovaný "animation time" — neroste, když je paused (čas zamrzne).
        // Bez toho by po pauze animace skočila o uplynulou wall-clock dobu.
        let animTime = 0;
        const loop = () => {
            // requestAnimationFrame = "zavolej mě před dalším překreslením" (~60 Hz)
            requestAnimationFrame(loop);
            const delta = clock.getDelta();
            this.controls.update();
            if (!this.paused) {
                animTime += delta;
                this._updaters.forEach(fn => fn(delta, animTime));
            }
            this.renderer.render(this.scene, this.camera);
        };
        // Asynchronní spuštění (přes rAF) — tím se první iterace updaterů odloží
        // až do dalšího frame. Důvod: pokud je v módu modulu deklarace nějaké
        // proměnné (`const`/`let`) AŽ POTOM, co se zavolá scene.start(), synchronní
        // spuštění by sáhlo na proměnnou v Temporal Dead Zone a callback by spadl.
        requestAnimationFrame(loop);
    }
}
