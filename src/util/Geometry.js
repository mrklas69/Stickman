// src/util/Geometry.js
// =============================================================================
// 2D geometrické helpery v rovině XZ. Jediný zdroj pravdy pro:
//   - distXZ(a, b)                       — euklidovská vzdálenost (Y se ignoruje)
//   - distPointToSegmentXZ(p, a, b)      — vzdálenost bodu od úsečky
//   - convexHullXZ(points)               — Andrew's monotone chain, O(n log n), CCW
//   - pointInConvexPolygonXZ(p, poly, tol) — point-in-convex-polygon s tolerancí
//
// Vstup: objekty se složkami {x, z, ...} (Y je ignorováno; lze předat 3D body
// se složkou y — funkce ji prostě nepoužije).
// =============================================================================

/** Euklidovská vzdálenost dvou bodů v rovině XZ. */
export function distXZ(a, b) {
    const dx = a.x - b.x, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Vzdálenost bodu p od úsečky AB v rovině XZ (s klampováním na úsečku).
 * Pokud je úsečka degenerovaná (A == B), vrátí distance bodu od A.
 */
export function distPointToSegmentXZ(p, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) return distXZ(p, a);
    // Projekční parametr t = (P-A)·(B-A) / |B-A|², klamp do [0,1]
    let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx;
    const projZ = a.z + t * dz;
    const ex = p.x - projX, ez = p.z - projZ;
    return Math.sqrt(ex * ex + ez * ez);
}

/**
 * Konvexní obal bodů v rovině XZ. Algoritmus: Andrew's monotone chain
 * (O(n log n) díky úvodnímu sortu, samotný hull je O(n)).
 *
 * Vrátí body v PROTISMĚRU hodinových ručiček (CCW). Vrací stejné objekty
 * jako vstup (žádné kopie), takže bezpečné pro reference.
 *
 * Pokud je < 3 bodů na vstupu, vrátí je seřazené po X (degenerace OK).
 */
export function convexHullXZ(points) {
    // Seřadit podle X, pak Z (pro stejné X)
    const pts = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
    const n = pts.length;
    if (n <= 2) return pts;

    // Cross product (b - a) × (c - a) v rovině XZ.
    // Kladný = c je vlevo od přímky a→b (CCW), záporný = vpravo (CW), 0 = kolineární.
    const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

    // Spodní řetězec (po X, vybírá body s nejnižším Z na "spodní" hranici)
    const lower = [];
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }
    // Horní řetězec (zpětně po X)
    const upper = [];
    for (let i = n - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }
    // Spojit a vyhodit duplicitní endpointy
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

/**
 * Test: leží bod p uvnitř konvexního polygonu (v CCW pořadí) v rovině XZ?
 * Polygon je rozšířen o `tolerance` (= povolená "exterior" vzdálenost od hrany).
 *
 * Algoritmus: pro každou hranu spočítat signed distance bodu od přímky hrany.
 * Pro CCW polygon je bod uvnitř, pokud jsou všechny signed distances >= -tolerance.
 *
 * Pro polygon s < 3 body vrátí false (nemá to "uvnitř").
 */
export function pointInConvexPolygonXZ(p, polygon, tolerance = 0) {
    const n = polygon.length;
    if (n < 3) return false;
    for (let i = 0; i < n; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % n];
        const ex = b.x - a.x, ez = b.z - a.z;
        const edgeLen = Math.hypot(ex, ez);
        if (edgeLen === 0) continue;             // degenerovaná hrana
        // Cross product (b - a) × (p - a)
        const cross = ex * (p.z - a.z) - ez * (p.x - a.x);
        // signed distance = cross / edgeLen (positive = uvnitř pro CCW)
        if (cross / edgeLen < -tolerance) return false;
    }
    return true;
}
