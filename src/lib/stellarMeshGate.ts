/**
 * T6.3-α — solid-angle hysteresis gate for the stellar-mesh swap.
 *
 * **Scope tag**: hybrid. The solid-angle threshold pattern is
 * Gaia-informed — `gaiasky/scene/system/render/draw/billboard/
 * BillboardEntityRenderSystem.java:122` (MPL-2.0) gates billboard
 * vs particle-point rendering on `solidAngle = size *
 * STAR_SIZE_FACTOR / distToCamera > threshold`. The single-mesh
 * proximity policy is also Gaia-informed —
 * `ModelEntityRenderSystem.java:429-443` (MPL-2.0) renders only
 * `proximity.updating[0]` (one focused star), with the rest as
 * sprites. The hysteresis cushion (Codex Rec 5) is atlas-added
 * — Gaia uses a single threshold without spawn/dispose
 * oscillation safeguard because Gaia's static-camera assumption
 * doesn't suffer from the threshold-jitter problem atlas's
 * dampened-camera does. T6.1's procedural mesh has higher cost
 * (per-spawn `ShaderMaterial` + `WebGLCubeRenderTarget` +
 * dispose lifecycle) than Gaia's pre-allocated model
 * instance, so jitter at the boundary is more expensive — cheap
 * 2× hysteresis cushion is good insurance.
 *
 * **Formula divergence from Gaia** (documented): atlas uses
 * physical radius in world units (`radiusFromSpect(spect) ×
 * SUN_RADIUS_WORLD_UNITS`) instead of Gaia's pseudoSize-based
 * `size × STAR_SIZE_FACTOR`. Gaia's pseudoSize is rendering-only
 * (Sirius and Betelgeuse have similar pseudoSizes despite
 * Betelgeuse being ~600× larger physically — see
 * `starPhysics.ts` module header). For T6.3's purpose ("is this
 * star big enough on screen to render as a procedural mesh?"),
 * physical radius is the correct metric. Gaia's pseudoSize-
 * based gate works for billboard alpha-fade because that's a
 * VISUAL concern; T6.3's gate is a STRUCTURAL concern (mount
 * a heavy mesh or stay sprite). Different physics, different
 * inputs.
 *
 * **T6.3-α scope** (this commit): module ships dormant. T6.3-β
 * will mount `<HygStellarMesh>` in `Scene.tsx` and consume
 * `shouldStellarMeshBeActive` per frame. Until that lands the
 * gate is pure-TS infra — testable in isolation, no UI surface.
 */

/**
 * Lower threshold (despawn): below this, an active mesh is torn
 * down and the sprite resumes via `Starfield.skipMask` clear.
 *
 * 5e-4 rad ≈ 0.029° apparent angular radius. At this size the
 * focused HYG star is ~10 px tall on a 1080p viewport — small
 * enough that the procedural mesh's surface detail is not
 * meaningfully visible vs the sprite kernel.
 */
export const STELLAR_MESH_EXIT_RAD = 5e-4;

/**
 * Upper threshold (spawn): above this, the procedural mesh
 * spawns and the sprite suppresses via `Starfield.skipMask` set.
 *
 * 1e-3 rad ≈ 0.057° apparent angular radius. At this size the
 * focused HYG star is ~20 px tall on a 1080p viewport — large
 * enough that surface detail (granulation, glow, rays, flares)
 * starts to matter for visual fidelity.
 *
 * 2× cushion above EXIT prevents spawn/dispose oscillation when
 * the camera sits near the boundary. With T4.2-γ's inertial
 * zoom physics + T4.2-α's proximity damping, the camera can
 * jitter ~10% around its rest position when at full damping;
 * the 2× cushion comfortably accommodates that without false
 * spawns.
 */
export const STELLAR_MESH_ENTER_RAD = 1e-3;

/**
 * Sun radius in atlas world units. Atlas convention: 1 AU =
 * 1000 world units, Sun radius = 696,340 km / 149,597,870.7 km
 * per AU × 1000 ≈ 4.654 world units. Mirrors the same constant
 * at `LensFlareInjector.tsx:68` — a future cleanup pass should
 * extract a single shared celestial-physics constants module
 * (M2 / DRY); for now both sites carry the literal expression
 * so they stay in lockstep by construction.
 *
 * Used as the per-star physical-radius unit:
 *   `starRadiusWorld = radiusFromSpect(spect) × SUN_RADIUS_WORLD_UNITS`
 * where `radiusFromSpect` returns solar radii (R_sun) per T6.2's
 * `stellarPhysics.ts`.
 */
export const SUN_RADIUS_WORLD_UNITS = (696_340 / 149_597_870.7) * 1000;

/**
 * Compute apparent angular radius (in radians) of a star at a
 * given camera distance.
 *
 * Small-angle approximation: for `radius ≪ distance`, the true
 * angular radius `arctan(radius / distance) ≈ radius / distance`.
 * Atlas's stellar zoom never approaches the regime where this
 * approximation breaks down (the user can't physically be inside
 * a star's photosphere), so the simple ratio is exact for the
 * gate's purposes.
 *
 * Returns 0 for zero / negative distance (defensive — the gate
 * treats that as "infinitely far away").
 */
export const computeStellarSolidAngle = (
  starRadiusWorldUnits: number,
  distanceToCameraWorldUnits: number
): number => {
  if (
    !Number.isFinite(starRadiusWorldUnits) ||
    !Number.isFinite(distanceToCameraWorldUnits) ||
    distanceToCameraWorldUnits <= 0 ||
    starRadiusWorldUnits <= 0
  ) {
    return 0;
  }
  return starRadiusWorldUnits / distanceToCameraWorldUnits;
};

/**
 * Hysteresis gate for the stellar-mesh swap. Returns whether the
 * procedural mesh should be active (mounted) for the next frame
 * given the previous frame's state and the current solid angle.
 *
 *   wasActive=false: spawn iff `solidAngle > ENTER_RAD`
 *   wasActive=true:  despawn iff `solidAngle < EXIT_RAD`
 *
 * Note the strict inequalities — `solidAngle === ENTER_RAD`
 * exactly does not flip from inactive→active; `solidAngle ===
 * EXIT_RAD` exactly does not flip from active→inactive. This
 * makes the boundary itself a "no-op" zone, which keeps the
 * test pin precise and avoids float-equality flapping.
 */
export const shouldStellarMeshBeActive = (
  wasActive: boolean,
  solidAngleRad: number
): boolean => {
  if (!Number.isFinite(solidAngleRad)) return wasActive;
  if (wasActive) {
    return solidAngleRad >= STELLAR_MESH_EXIT_RAD;
  }
  return solidAngleRad > STELLAR_MESH_ENTER_RAD;
};
