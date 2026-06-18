/**
 * Layout + style constants for the CONCENTRIC AU DISTANCE-RING grid
 * (Sun-centered polar grid on the ecliptic), shared by `GridRecursive.tsx`
 * and `GridDecadeLabel.tsx`. Lives in its own module so the component
 * files stay pure-component (React Fast Refresh enforces
 * `react-refresh/only-export-components`).
 *
 * Redesign 2026-06-18 replaced the square drei `<Grid>` floor with
 * concentric circles at physical AU radii. The single teal accent is the
 * one measurement hue (`--color-nasa-accent` #00f0ff) — the grid IS the
 * distance indicator, so there is no separate "extent disk" element to
 * mismatch. Two tiers read by opacity + line width: brighter/thicker
 * major rings (round powers of ten + the in-view decade's 1/2/5 leaders)
 * carry the AU label; dim/thin minor rings fill the polar grid. Faint
 * radial spokes give bearing lines.
 */

/**
 * The single teal measurement accent — the same hue as the app chrome's
 * `--color-nasa-accent`. The grid is the distance indicator, so it owns
 * this accent (body names stay neutral in PlanetLabels3D).
 */
export const GRID_RING_COLOR = "#00f0ff";

export const GRID_RECURSIVE_CONFIG = {
  /**
   * Rings sit a hair below the ecliptic plane (world units) so orbit
   * lines at y≈0 win the depth test and occlude them rather than
   * z-fighting (the rings also `depthWrite: false`, so this is only a
   * coplanar nudge).
   */
  planeYOffset: -0.15,
  /** Draws before orbits + planets so content occludes the rings. */
  renderOrder: -100,

  /** The single teal ring/spoke color (both tiers share one hue). */
  ringColor: GRID_RING_COLOR,

  // ── Two-tier opacity (the dim-minor / bright-major contrast) ──
  /** Major (power-of-ten + in-view-decade leader) ring opacity. */
  majorOpacity: 0.4,
  /** Minor (1-2-5 filler) ring opacity. */
  minorOpacity: 0.16,
  /** Radial spoke opacity — faintest layer, just enough for bearing. */
  spokeOpacity: 0.1,

  // ── Line widths (Line2 fat-line units, constant-pixel) ──
  /** Major ring line width. */
  majorLineWidth: 1.6,
  /** Minor ring + spoke line width. */
  minorLineWidth: 1.0,
} as const;
