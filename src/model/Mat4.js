// src/model/Mat4.js
// =============================================================================
// Mat4 = 4×4 transformační matice pro forward kinematics. Bez Three.js.
//
// Konvence: COLUMN-MAJOR (jako OpenGL/Three.js). Pole 16 čísel:
//   m[0]  m[4]  m[8]  m[12]      ← řádek 0 (rotace + translace X)
//   m[1]  m[5]  m[9]  m[13]      ← řádek 1
//   m[2]  m[6]  m[10] m[14]      ← řádek 2
//   m[3]  m[7]  m[11] m[15]      ← řádek 3 (homogenní, [0,0,0,1])
//
// Translation v sloupcích: m[12]=tx, m[13]=ty, m[14]=tz.
// =============================================================================

export class Mat4 {
    constructor() {
        // Float32Array = typed array, rychlejší než plain Array pro číselnou matematiku
        this.m = new Float32Array(16);
        this.identity();
    }

    /** Nastaví matici na jednotku (diagonála = 1, jinde 0). */
    identity() {
        const m = this.m;
        m.fill(0);
        m[0] = m[5] = m[10] = m[15] = 1;
        return this;
    }

    /** Zkopíruje obsah jiné matice. */
    copy(other) {
        this.m.set(other.m);
        return this;
    }

    clone() {
        return new Mat4().copy(this);
    }

    /**
     * Násobí matice: this = this × b. Pořadí je důležité — rotace nekomutují!
     * Pro skládání transformací: A.multiply(B).multiply(C) = A × B × C,
     * kdy bod se transformuje zprava: v' = A × B × C × v = A × (B × (C × v)).
     */
    multiply(b) {
        const a = this.m;
        const bm = b.m;
        const r = new Float32Array(16);
        // Standardní násobení matic v column-major: C[i,j] = Σ_k A[i,k] × B[k,j]
        // Index v poli: element (řádek i, sloupec j) = m[i + j*4]
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) {
                    sum += a[i + k * 4] * bm[k + j * 4];
                }
                r[i + j * 4] = sum;
            }
        }
        this.m = r;
        return this;
    }

    /** Translation matice (čistá). */
    setTranslation(x, y, z) {
        this.identity();
        this.m[12] = x;
        this.m[13] = y;
        this.m[14] = z;
        return this;
    }

    /** Rotace kolem osy +X o 'rad' radiánů (pravá ruka). */
    setRotationX(rad) {
        this.identity();
        const c = Math.cos(rad), s = Math.sin(rad);
        // Submatice (řádky 1-2, sloupce 1-2):
        //   [c  -s]
        //   [s   c]
        // V column-major: m[5]=c, m[6]=s, m[9]=-s, m[10]=c
        this.m[5] = c;  this.m[6] = s;
        this.m[9] = -s; this.m[10] = c;
        return this;
    }

    /** Rotace kolem osy +Y. */
    setRotationY(rad) {
        this.identity();
        const c = Math.cos(rad), s = Math.sin(rad);
        // [c  0  s]
        // [0  1  0]
        // [-s 0  c]
        this.m[0] = c;  this.m[2] = -s;
        this.m[8] = s;  this.m[10] = c;
        return this;
    }

    /** Rotace kolem osy +Z. */
    setRotationZ(rad) {
        this.identity();
        const c = Math.cos(rad), s = Math.sin(rad);
        // [c -s 0]
        // [s  c 0]
        // [0  0 1]
        this.m[0] = c;  this.m[1] = s;
        this.m[4] = -s; this.m[5] = c;
        return this;
    }

    /**
     * Transformuje bod (x, y, z) — implicitní homogenní složka w=1.
     * Vrátí nový plain objekt {x, y, z}.
     */
    transformPoint(p) {
        const m = this.m;
        return {
            x: m[0] * p.x + m[4] * p.y + m[8]  * p.z + m[12],
            y: m[1] * p.x + m[5] * p.y + m[9]  * p.z + m[13],
            z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
        };
    }
}
