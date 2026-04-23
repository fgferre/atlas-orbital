/**
 * T4.9a' — distance threshold deciding which Sun renderer is active.
 *
 * Gaia switches the Sun (and every star) between the body-pipeline
 * mesh and the star-billboard pipeline based on per-frame visibility
 * heuristics in `BillboardRenderer.java` / `SingleStarQuadRenderer.java`.
 * The actual Gaia formula combines apparent size, screen footprint,
 * and a quality-tier `STAR_THRESHOLD_QUAD` constant — too much
 * machinery for atlas's current scope. Atlas approximates the same
 * UX with a simple AU-distance threshold: when the camera sits beyond
 * `SUN_BILLBOARD_THRESHOLD_AU` from the Sun, the procedural cubemap
 * (`ProceduralSun3D`) hides and `SunBillboard` takes over. Inside
 * that radius the existing renderers run unchanged.
 *
 * Threshold rationale (`SUN_BILLBOARD_THRESHOLD_AU = 100`):
 *   - Pluto orbits at ~40 AU; Kuiper belt extends to ~50 AU.
 *   - 100 AU sits comfortably beyond the heliopause, in the
 *     interstellar visual regime where the procedural sphere
 *     becomes a sub-pixel point and Gaia would have already
 *     swapped to the billboard path.
 *   - Conservative choice for the first ship; can tighten to
 *     ~50 AU once the placeholder asset is replaced with the real
 *     `star-tex-04` and we trust the visual quality at the
 *     tighter boundary.
 *
 * Conversion: atlas world units use `AU_TO_3D_UNITS = 1000`
 * (`src/lib/astrophysics.ts:4`), so `100 AU = 100_000` world units.
 */

export const SUN_BILLBOARD_THRESHOLD_AU = 100;
export const SUN_BILLBOARD_THRESHOLD_WORLD_UNITS = 100_000;

export type SunRenderRange = "close" | "far";

/**
 * Decide which Sun renderer should be visible given the camera's
 * world-space distance from the Sun (origin). Pure function so the
 * useFrame call sites + the unit tests stay synchronised; do NOT
 * inline the comparison in components.
 */
export const resolveSunRenderRange = (
  distanceWorldUnits: number
): SunRenderRange =>
  distanceWorldUnits > SUN_BILLBOARD_THRESHOLD_WORLD_UNITS ? "far" : "close";
