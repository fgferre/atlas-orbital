/**
 * Ring-selection resolver for the CONCENTRIC AU DISTANCE-RING grid
 * (Sun-centered polar grid on the ecliptic), redesign 2026-06-18.
 *
 * **What this module does.** The grid is a set of concentric circles
 * centered on the Sun (origin) drawn on the ecliptic (XZ) plane. A ring
 * for AU value `v` is drawn at world radius `AstroPhysics.auToWorld(v,
 * scaleMode)`. Because the body positioner places a body at world radius
 * `auToWorld(distanceAU, scaleMode)`, a planet at `D` AU sits EXACTLY on
 * the ring for `D` — in BOTH didactic and realistic modes. This radial
 * alignment is the whole point of the redesign: distance-from-Sun is the
 * meaningful heliocentric quantity, and the rings show it directly. The
 * companion {@link GridDecadeLabel} labels the major rings with their AU
 * value (auto-switching to light-years only at realistic stellar scale).
 *
 * **What drives WHICH rings show: VIEW SCALE.** The grid must stay
 * visible across all zoom levels — fine rings when zoomed in, coarse
 * decade rings when zoomed out, never empty. We drive ring selection
 * from the on-screen view extent
 *
 *   viewExtentWorld ≈ 2 · camToTargetDist · tan(fov / 2)
 *
 * (camera → OrbitControls look-at target; the Sun when nothing is
 * focused). We invert that world extent to AU via `worldToAu`, pick the
 * decade band the view sits in, and emit a 1-2-5 sequence of AU ring
 * values spanning a few decades around it: a finer (minor) tier within
 * the in-view decade and coarser (major) decade rings outward, so the
 * ring set is always non-empty and reads as a polar distance grid at any
 * zoom. Major rings (the round powers of ten + the focused decade's 1/2/5
 * leaders) get the AU label.
 *
 * **Honesty (AGENTS.md pillar 18).** In didactic mode world space is
 * COMPRESSED and capped: the curve saturates at ≈323 AU (world 3200), so
 * rings beyond that collapse onto the cap radius. We clamp the emitted AU
 * set to the reachable range so we never draw a ring the transform cannot
 * place, and {@link formatDecadeScaleLabel} suppresses unreachable LY
 * units. The existing "not to scale" framing still governs.
 */

import * as THREE from "three";

import { AstroPhysics, type ScaleMode } from "../../../lib/astrophysics";

/**
 * Decade bounds for the ring grid (AU exponents). The LABELED (major) ring
 * ladder follows pure powers of ten across this whole range, SSS-style,
 * so a learner can zoom continuously from the inner solar system out to
 * GALACTIC scale in realistic mode.
 *
 * `MIN = -1` → finest labeled ring at 0.1 AU (Mercury at 0.39 AU reads).
 * `MAX = 10` → 10^10 AU. Since 1 LY = `AU_PER_LY` ≈ 63 241 AU, the label
 * auto-switches to light-years at 10^5 AU (≈1.6 LY) and the top decade
 * 10^10 AU ≈ 158 000 LY — past the galactic disc thickness, the SSS
 * "all the way out" ladder. **Realistic mode only** reaches the upper
 * decades; didactic compression saturates at ≈323 AU (`atDidacticCap`),
 * so its labeled rings stop at the outer solar system and never show LY.
 */
export const GRID_DECADE_MIN = -1;
export const GRID_DECADE_MAX = 10;

/**
 * The 1-2-5 mantissa sequence for the MINOR (intermediate) rings drawn
 * WITHIN the in-view decade. A polar grid reads cleanly with rings at 1,
 * 2, 5 × 10^k AU (the "engineering" subdivision). The `1` is the decade's
 * own major ring; `2` and `5` are the faint minors that give intermediate
 * distance reading inside the focused decade. The LABELED ladder outside
 * the in-view decade is pure powers of ten (no 2/5), so the major rings
 * read as a clean ×10-per-step scale bar.
 */
export const RING_MANTISSAS = [1, 2, 5] as const;

/**
 * Target number of MAJOR (decade) rings to span across the on-screen view
 * extent radius. Picked so the grid reads as a handful of labelled
 * distance rings, not a dense bullseye. The view radius is half the view
 * extent; we choose the in-view decade so a few decade rings sit inside it.
 */
export const TARGET_RINGS_ACROSS = 3;

/**
 * How many pure-decade MAJOR rings to draw inward of the in-view decade,
 * and how many outward. The outward span is generous so zooming out always
 * reveals the next labeled decade ring (the continuous SSS ladder out to
 * galactic scale); the inward span keeps a couple of coarser rings behind
 * the focus. The in-view decade additionally carries faint 1-2-5 minors.
 */
const DECADES_INWARD = 2;
const DECADES_OUTWARD = 5;

/**
 * Default vertical field-of-view (radians) used when a caller cannot
 * supply the live camera FOV. Matches `Scene.tsx`'s camera config
 * (`fov: 45`). Only used as a fallback; live code passes the real FOV.
 */
const DEFAULT_FOV_RAD = THREE.MathUtils.degToRad(45);

/** A single ring in the selected set. */
export interface GridRing {
  /** The ring's AU value (e.g. 1, 2, 5, 10). */
  au: number;
  /** World radius the ring is drawn at = `auToWorld(au, scaleMode)`. */
  radius: number;
  /**
   * True for a MAJOR ring — a round power of ten on the decade ladder.
   * Major rings are brighter and carry the AU/LY label. Minor rings (the
   * in-view decade's 2× / 5× leaders) are faint and unlabeled.
   */
  major: boolean;
}

export interface GridRingSet {
  /** The integer decade the current view scale sits in (clamped). */
  decade: number;
  /** AU value of the in-view decade — `10^decade`. */
  decadeLowerAU: number;
  /**
   * World radius of the in-view decade ring = `auToWorld(10^decade,
   * scaleMode)`. The radius the decade label is sized/placed against.
   */
  decadeRadius: number;
  /** The selected rings, ascending by AU (and thus by radius). */
  rings: GridRing[];
  /**
   * The AU value of the IN-VIEW decade ring (`10^decade`) — the prominent
   * "current scale" label the SSS-style scale bar announces for the
   * framing the learner is in.
   */
  labelAU: number;
  /** World radius of `labelAU` — where the scale label sits. */
  labelRadius: number;
  /**
   * True when the didactic compression has saturated (view scale is past
   * the ≈323-AU cap). Honesty flag: larger units (LY) are unreachable by
   * design and must not be displayed.
   */
  atDidacticCap: boolean;
}

/**
 * World extent (in world units) visible across the frame at the depth of
 * the OrbitControls look-at target. Drives ring selection — it shrinks as
 * the learner dollies in on whatever they are focused on, so finer rings
 * are chosen, unlike heliocentric distance which barely changes around a
 * distant focused body.
 *
 *   viewExtentWorld = 2 · camToTargetDist · tan(fov / 2)
 *
 * Shared by {@link GridRecursive} and {@link GridDecadeLabel} so both feed
 * {@link resolveGridRingSet} the IDENTICAL input (the per-frame memo then
 * coalesces their two calls into one selection).
 *
 * @param camera the active perspective camera.
 * @param target the OrbitControls look-at target (focused body world
 *   position, or the Sun/origin when nothing is focused). When `null`
 *   (controls not yet mounted) we fall back to the heliocentric distance.
 */
export const computeViewExtentWorld = (
  camera: THREE.Camera,
  target: THREE.Vector3 | null
): number => {
  const camToTarget = target
    ? camera.position.distanceTo(target)
    : camera.position.length();

  const fovRad =
    camera instanceof THREE.PerspectiveCamera
      ? THREE.MathUtils.degToRad(camera.fov)
      : DEFAULT_FOV_RAD;

  return 2 * camToTarget * Math.tan(fovRad / 2);
};

/**
 * Pick the decade whose decade ring fits ≈{@link TARGET_RINGS_ACROSS}
 * rings across the on-screen AU view radius, clamped to
 * `[GRID_DECADE_MIN, GRID_DECADE_MAX]`.
 *
 * We want `10^decade ≈ viewRadiusAU / TARGET`, so `decade =
 * round(log10(viewRadiusAU / TARGET))`. As the learner zooms in
 * (`viewAU` shrinks) the chosen decade drops and the grid refines; as
 * they zoom out it rises and the grid coarsens.
 *
 * @returns the integer decade. Returns `GRID_DECADE_MIN` for degenerate
 *   input (non-finite / non-positive).
 */
export const resolveGridDecade = (viewAU: number): number => {
  if (!Number.isFinite(viewAU) || viewAU <= 0) {
    return GRID_DECADE_MIN;
  }
  // viewAU is the full view extent in AU; the radius is half of it.
  const viewRadiusAU = viewAU / 2;
  const raw = Math.round(Math.log10(viewRadiusAU / TARGET_RINGS_ACROSS));
  return Math.min(GRID_DECADE_MAX, Math.max(GRID_DECADE_MIN, raw));
};

// ── Per-frame memo ──────────────────────────────────────────────────
// GridRecursive and GridDecadeLabel both resolve the ring set each frame
// from the SAME view extent. In didactic mode `worldToAu` runs a 60-iter
// binary search and `auToWorld` runs per ring, so we cache the last
// result keyed on (rounded viewExtent, scaleMode); the second caller in a
// frame passes identical inputs and hits the cache. One-slot is
// sufficient because the two callers run back-to-back with identical args.
let memoViewExtentKey = Number.NaN;
let memoScaleMode: ScaleMode | null = null;
let memoResult: GridRingSet | null = null;

const buildRingSet = (
  viewExtentWorld: number,
  scaleMode: ScaleMode
): GridRingSet => {
  // Invert the world view-extent to AU so decade selection happens in the
  // SAME AU space the bodies live in (the radial-alignment identity).
  const viewAU = AstroPhysics.worldToAu(viewExtentWorld, scaleMode);
  const decade = resolveGridDecade(viewAU);
  const decadeLowerAU = Math.pow(10, decade);
  const decadeRadius = AstroPhysics.auToWorld(decadeLowerAU, scaleMode);

  // Didactic saturation honesty: the didactic compression curve is flat
  // at/above its world cap. We detect saturation behaviourally (doubling
  // the world distance no longer changes the recovered AU); in that
  // regime light-years are unreachable BY DESIGN and the label must not
  // present LY.
  const atDidacticCap =
    scaleMode === "didactic" &&
    Number.isFinite(viewExtentWorld) &&
    viewExtentWorld > 0 &&
    viewAU >= AstroPhysics.worldToAu(viewExtentWorld * 2, "didactic");

  // Build the ring set as:
  //  (a) MAJOR rings = the pure power-of-ten ladder across
  //      [decade - INWARD, decade + OUTWARD], clamped to [MIN, MAX]. These
  //      are the labeled rings and follow a clean ×10-per-step scale bar
  //      out to galactic scale (realistic). The outward span is generous so
  //      zooming out always reveals the next labeled decade ring.
  //  (b) MINOR rings = the 2× and 5× leaders of the IN-VIEW decade only,
  //      faint, giving intermediate distance reading inside the focus.
  // Collect into a map keyed by AU so a value can't be added twice, then
  // sort ascending and de-dup coincident radii (didactic saturation).
  const loDecade = Math.max(GRID_DECADE_MIN, decade - DECADES_INWARD);
  const hiDecade = Math.min(GRID_DECADE_MAX, decade + DECADES_OUTWARD);

  const byAU = new Map<number, { au: number; major: boolean }>();
  // (a) pure-decade major ladder.
  for (let d = loDecade; d <= hiDecade; d++) {
    const au = Math.pow(10, d);
    byAU.set(au, { au, major: true });
  }
  // (b) in-view decade 2× / 5× minors (the 1× is already the decade major).
  const decadeBase = Math.pow(10, decade);
  for (const mantissa of RING_MANTISSAS) {
    if (mantissa === 1) continue;
    const au = mantissa * decadeBase;
    if (!byAU.has(au)) byAU.set(au, { au, major: false });
  }

  const sorted = [...byAU.values()].sort((a, b) => a.au - b.au);

  const rings: GridRing[] = [];
  // De-dup guard: when the didactic curve saturates, distinct AU values map
  // to the same world radius (the cap). Drop rings whose radius coincides
  // with one already emitted so saturated didactic zoom doesn't stack
  // dozens of coincident circles. Realistic radii never coincide.
  let lastRadius = Number.NEGATIVE_INFINITY;
  const RADIUS_EPS = 1e-3;
  for (const entry of sorted) {
    const radius = AstroPhysics.auToWorld(entry.au, scaleMode);
    if (!Number.isFinite(radius) || radius <= 0) continue;
    if (radius - lastRadius < RADIUS_EPS && rings.length > 0) continue;
    lastRadius = radius;
    rings.push({ au: entry.au, radius, major: entry.major });
  }

  // Defensive: if every ring was filtered (degenerate transform), emit at
  // least the in-view decade ring so the grid is never empty.
  if (rings.length === 0) {
    rings.push({ au: decadeLowerAU, radius: decadeRadius, major: true });
  }

  // The prominent "current scale" label announces the IN-VIEW decade ring
  // (`10^decade`) — the SSS-style scale-bar for the framing the learner is
  // actually in, not the largest off-screen ring. Find that ring in the
  // set; fall back to the nearest major ring if it was de-duped away.
  let labelAU = decadeLowerAU;
  let labelRadius = decadeRadius;
  const decadeRing = rings.find((r) => Math.abs(r.au - decadeLowerAU) < 1e-9);
  if (!decadeRing) {
    // The in-view decade ring is not in the emitted set (e.g. saturated
    // didactic cap collapsed it); use the nearest major ring by radius.
    let best: GridRing | null = null;
    for (const r of rings) {
      if (!r.major) continue;
      if (
        !best ||
        Math.abs(r.radius - decadeRadius) < Math.abs(best.radius - decadeRadius)
      ) {
        best = r;
      }
    }
    if (best) {
      labelAU = best.au;
      labelRadius = best.radius;
    }
  }

  return {
    decade,
    decadeLowerAU,
    decadeRadius,
    rings,
    labelAU,
    labelRadius,
    atDidacticCap,
  };
};

/**
 * Resolve the concentric AU ring set for a given on-screen VIEW EXTENT
 * (world units, from {@link computeViewExtentWorld}). Memoised per-frame
 * so the grid mesh and the decade label share ONE selection instead of
 * each running the didactic inverse + per-ring transforms.
 *
 * @param viewExtentWorld the world width visible across the frame at the
 *   look-at target depth (`2·camToTarget·tan(fov/2)`).
 * @param scaleMode the active scale mode (the rings read it so didactic
 *   compression and realistic linear scaling both resolve correctly).
 */
export const resolveGridRingSet = (
  viewExtentWorld: number,
  scaleMode: ScaleMode
): GridRingSet => {
  // Round the key so float-equality between the two callers' identical
  // inputs still coalesces; the decade is a coarse `round(log10)` so
  // rounding to an integer world unit never shifts the result.
  const key = Math.round(viewExtentWorld);
  if (key === memoViewExtentKey && scaleMode === memoScaleMode && memoResult) {
    return memoResult;
  }
  const result = buildRingSet(viewExtentWorld, scaleMode);
  memoViewExtentKey = key;
  memoScaleMode = scaleMode;
  memoResult = result;
  return result;
};

// ── Decade SCALE-label formatting ───────────────────────────────────
// Lives here (not in `GridDecadeLabel.tsx`) so the component file stays
// component-only for React Fast Refresh, and because the formatter is the
// textual face of the same ring AU the selector above resolves.

/** 1 light-year in AU (IAU). The label's AU→LY unit-switch boundary. */
export const AU_PER_LY = 63241.077;

/**
 * Group a non-negative integer's thousands with a regular ASCII space
 * ("1 000"). A plain space (not a thin space) keeps the glyph inside the
 * troika default font's coverage and the output deterministic.
 */
const groupThousands = (value: number): string =>
  Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/**
 * Format a ring's AU value as the flat-floor label text. Below 1 LY it
 * reads in AU; at and beyond 1 LY it auto-switches to light-years.
 *
 * **Didactic honesty.** In didactic mode world space caps at ≈323 AU, so
 * the rings can never reach light-years; presenting "LY" there would be a
 * unit the regime cannot reach. Pass `allowLY = false` (the didactic
 * regime) to suppress the AU→LY switch and keep the label in honest,
 * reachable AU.
 *
 * @param au the ring's AU value.
 * @param allowLY whether the AU→LY switch is permitted. Defaults to `true`
 *   (realistic regime); the didactic caller passes `false`.
 */
export const formatDecadeScaleLabel = (au: number, allowLY = true): string => {
  if (!Number.isFinite(au) || au <= 0) return "1 AU";
  if (!allowLY || au < AU_PER_LY) {
    // Sub-AU rings (didactic inner-planet decade) need a fractional digit.
    if (au < 1) {
      const rounded = Math.round(au * 100) / 100;
      return `${rounded} AU`;
    }
    return `${groupThousands(au)} AU`;
  }
  const ly = au / AU_PER_LY;
  if (ly < 10) {
    const rounded = Math.round(ly * 10) / 10;
    const text = Number.isInteger(rounded)
      ? rounded.toString()
      : rounded.toFixed(1);
    return `${text} LY`;
  }
  return `${groupThousands(ly)} LY`;
};
