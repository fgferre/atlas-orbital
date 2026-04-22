import type * as THREE from "three";

// TypeScript mirrors of the five scalar helpers from Gaia Sky's
// `/tmp/gaiasky/assets/shader/lib/atmscattering.frag.glsl` (commit
// 450c344ca). Exist solely so the port can be unit-pinned against
// Gaia numerics — the live path remains GLSL (copied verbatim in
// `atmscatteringSnippet.ts`). The two big vec3-loop integrators
// (`computeAtmosphericScatteringGround`, `computeAtmosphericScattering`)
// stay in the shader; their behavior is covered indirectly by these
// scalar pins plus runtime smoke.
//
// Naming: Gaia uses Hungarian-ish `fCos2`, `fG`. TypeScript drops the
// `f`/`v3` prefix (language-level diff, not numeric).

/**
 * Rayleigh phase function.
 *
 * Gaia source: `atmscattering.frag.glsl:28-33` —
 *   `return 0.75 + 0.75 * fCos2;`
 *
 * NOTE: Gaia's source comment claims "3/16π · (1 + cos²θ)" but the
 * formula is `0.75 · (1 + cos²θ)` = `(3/4)(1 + cos²θ)`. The `3/(16π)`
 * pre-factor ≈ 0.0596 is absorbed into the exposure/ESun constants
 * upstream (a common realtime-renderer shortcut). We mirror Gaia's
 * actual formula, not the aspirational comment.
 */
export const rayleighPhase = (cos2: number): number => 0.75 + 0.75 * cos2;

/**
 * Henyey-Greenstein Mie phase function with asymmetry factor `g`.
 *
 * Gaia source: `atmscattering.frag.glsl:35-39` —
 *   `1.5 * ((1 - g²) / (2 + g²)) * (1 + fCos2)
 *        / pow(1 + g² - 2·fG·fCos, 1.5)`
 */
export const miePhase = (cos: number, cos2: number, g: number): number => {
  const g2 = g * g;
  return (
    1.5 *
    ((1.0 - g2) / (2.0 + g2)) *
    ((1.0 + cos2) / Math.pow(1.0 + g2 - 2.0 * g * cos, 1.5))
  );
};

/**
 * Nishita optical-depth polynomial approximation.
 *
 * Gaia source: `atmscattering.frag.glsl:40-43` —
 *   `x = 1 - fCos;`
 *   `return fScaleDepth * exp(-0.00287
 *     + x·(0.459 + x·(3.83 + x·(-6.80 + x·5.25))));`
 *
 * Horner form of `fScaleDepth · exp(-0.00287 + 0.459x + 3.83x²
 * − 6.80x³ + 5.25x⁴)`. Fast drop-in for the true integral of
 * optical depth along a ray through an exponential atmosphere.
 */
export const scale = (cos: number, scaleDepth: number): number => {
  const x = 1.0 - cos;
  return (
    scaleDepth *
    Math.exp(-0.00287 + x * (0.459 + x * (3.83 + x * (-6.8 + x * 5.25))))
  );
};

/**
 * Near-intersection parameter `t` for a ray with a centered sphere.
 *
 * Gaia source: `atmscattering.frag.glsl:44-50` —
 *   `B = 2·dot(pos, ray); C = distance2 − radius2;`
 *   `fDet = max(0, B² − 4C); return 0.5·(-B − sqrt(fDet));`
 *
 * `distance2` is `dot(pos, pos)` precomputed by the caller;
 * `radius2` is `radius²`. Sphere is centered at origin.
 */
export const getNearIntersection = (
  pos: THREE.Vector3,
  ray: THREE.Vector3,
  distance2: number,
  radius2: number
): number => {
  const B = 2.0 * pos.dot(ray);
  const C = distance2 - radius2;
  const det = Math.max(0.0, B * B - 4.0 * C);
  return 0.5 * (-B - Math.sqrt(det));
};

/**
 * Far-intersection parameter `t` for a ray with a centered sphere.
 *
 * Gaia source: `atmscattering.frag.glsl:52-57` — same form as
 * `getNearIntersection` with `+sqrt(fDet)` instead of `−sqrt(fDet)`.
 */
export const getFarIntersection = (
  pos: THREE.Vector3,
  ray: THREE.Vector3,
  distance2: number,
  radius2: number
): number => {
  const B = 2.0 * pos.dot(ray);
  const C = distance2 - radius2;
  const det = Math.max(0.0, B * B - 4.0 * C);
  return 0.5 * (-B + Math.sqrt(det));
};
