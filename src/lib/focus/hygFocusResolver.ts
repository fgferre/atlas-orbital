/**
 * T6.0 — HYG focus-id resolver (atlas-native).
 *
 * Today (`CameraController.tsx:127-128, :309-310, :375`) the focus
 * pipeline gates targets through `BODIES_BY_ID.get(focusId)`. The
 * curated map carries ~20 solar-system bodies; HYG stars (109 k+
 * entries) are out of reach. T6.3 needs HYG stars to be focusable so
 * the procedural-mesh spawn can be gated on `focusId === hyg:K`. This
 * module ships the parse / format / position-resolve primitives that
 * gate; CameraController will consume them as a fallback branch when
 * `BODIES_BY_ID.get` returns undefined.
 *
 * **Why a parallel resolver, not a `BODIES_BY_ID` extension?** Bloating
 * the curated map with 109 k entries violates SRP (`AGENTS.md` §17)
 * and increases memory of the curated path. HYG positions also need
 * different resolution (binary catalog + obliquity rotation) than
 * the orbital-mechanics propagation that drives `CelestialBody`. A
 * parallel module also gives a clean seam for T4.1-γ camera-relative
 * adoption when stellar-zoom world units cross the float32 jitter
 * floor (~1e15) — the resolver can return a `Vector3Q`-friendly path
 * without touching the curated body code.
 *
 * **Scope tag**: atlas-native. No Gaia source has a direct analog:
 * libGDX uses ECS scene-graph manipulation directly, with no
 * "focus-id string → world position" indirection. Per
 * `tasks/STATUS.md` Kickoff "Sub-onda scope tags" note, DIFF GATE
 * applies only to per-decision rationale documentation — every
 * branch / constant / divergence carries a one-line comment
 * justifying the choice.
 */

import * as THREE from "three";

import type { HygCatalogData } from "../../utils/hygBinary";
import { hygEquatorialToScene } from "../starfield/hygFrame";

/**
 * Prefix for focus IDs targeting HYG catalog stars. Matches the
 * `BODIES_BY_ID.get(focusId)` shape of the existing curated path:
 * the focusId remains a single string slot in the store, with the
 * prefix discriminating the resolver path.
 *
 * Case-sensitive (lowercase `"hyg:"` only). T6.3 will write this
 * prefix when StarHoverPicker dispatches focus on click; today
 * StarHoverPicker writes only `hoveredStar` and never invokes
 * focus, so the introduction of this prefix has no live consumers
 * yet (predecessor sweep on commit confirmed zero hits in `src/`).
 */
export const HYG_FOCUS_PREFIX = "hyg:" as const;

/**
 * Placeholder body radius in world units used by CameraController's
 * proximity-damping + camera.near when focused on a HYG star.
 * **Not a physical radius** — actual class-tuned radius lands in
 * T6.2's `radiusFromSpect`; T6.3 wires it to T6.1's procedural
 * mesh. T6.0 only needs the camera math to run with a sane number
 * (1.0 world unit ≈ 1 km at atlas's solar-system scale, which
 * keeps `minDistance = 1.1` and `camera.near = 0.011` well within
 * Three.js's float32 depth buffer).
 *
 * **Why 1.0?** The smallest non-zero round value that avoids
 * `controlsInstance.minDistance = 0` (degenerate orbit-controls
 * state) and `cameraInstance.near = 0` (clipping plane crash).
 * Replaced wholesale by T6.2 — no need to refine here.
 */
export const HYG_FOCUS_DEFAULT_RADIUS_WORLD = 1.0;

/**
 * 1 parsec in scene units. Mirrors the constant duplicated in
 * `Starfield.tsx:73` and `StarHoverPicker.tsx:51`. Sharing a
 * single source-of-truth across all three sites is a separate
 * cleanup (M2 / DRY) — this module deliberately mirrors the same
 * literal so a refactor moves all three at once.
 */
const DISTANCE_SCALE = 206_265_000.0;

/**
 * Format a HYG star's catalog index as a focus ID string.
 *
 * @example formatHygFocusId(42) === "hyg:42"
 */
export const formatHygFocusId = (starIndex: number): string =>
  `${HYG_FOCUS_PREFIX}${starIndex}`;

/**
 * Parse a focus ID string. Returns the integer star index when
 * `focusId` matches `hyg:<non-negative-integer>`, or `null` for any
 * other shape (curated body IDs, malformed prefix, non-numeric
 * suffix, empty index, uppercase prefix).
 *
 * Case-sensitive on the prefix to match the lowercase `HYG_FOCUS_PREFIX`
 * constant — keeps the comparison deterministic and avoids a stray
 * caller passing `"HYG:42"` and getting a silent match. The cost of
 * being strict is one assert in the test suite; the win is no hidden
 * casing-coupling debt later.
 *
 * Returns `null` (not `undefined`) so the curated-vs-HYG branch in
 * CameraController stays explicit (`if (hygIndex !== null)`).
 */
export const parseHygFocusId = (focusId: string | null): number | null => {
  if (focusId == null) return null;
  if (!focusId.startsWith(HYG_FOCUS_PREFIX)) return null;
  const suffix = focusId.slice(HYG_FOCUS_PREFIX.length);
  if (suffix.length === 0) return null;
  // Reject negative, non-integer, or non-numeric suffixes. Number()
  // alone would accept "42.5" (NaN would not survive the integer
  // check below, but "42abc" parses to NaN cleanly — keep the regex
  // explicit so the rule is grep-able).
  if (!/^\d+$/.test(suffix)) return null;
  const index = Number(suffix);
  if (!Number.isFinite(index) || !Number.isInteger(index) || index < 0) {
    return null;
  }
  return index;
};

/**
 * Resolve a HYG star's world-space position for the camera focus
 * pipeline. Returns `null` when the index is out of range; otherwise
 * writes the result into `out` (default new Vector3) and returns it.
 *
 * Mirrors `StarHoverPicker.buildPickCandidates` exactly:
 *   1. Read `catalog.positions[3*K..3*K+3]` (parsec-scale equatorial J2000).
 *   2. Multiply by `DISTANCE_SCALE` (parsec → atlas world unit).
 *   3. Convert equatorial J2000 → scene frame via
 *      `lib/starfield/hygFrame.ts:hygEquatorialToScene` — the SAME
 *      helper `Starfield` bakes into its instance buffer and
 *      `StarHoverPicker` uses to build pick candidates, so render,
 *      picking and focus cannot drift apart. (Pre-fix this step was a
 *      bare `R_x(obliquity)` with no ecliptic→three.js remap, which
 *      put the starfield 136.8° off the scene frame; see the hygFrame
 *      module docstring.)
 *
 * Float32 throughout — atlas's stellar world units max out at ~1e12
 * which fits float32 comfortably. T4.1-γ would replace this with a
 * Vector3Q-aware path if/when stellar zoom crosses the precision
 * floor; the `out` parameter shape is already compatible (T4.1-γ
 * would extend the signature with a `cameraPos` parameter and call
 * `cameraRelativeVector3` internally).
 *
 * The optional `out` parameter mirrors atlas's existing math-lib
 * idiom — see `cameraRelative.ts:90` for the same pattern. Callers
 * inside useFrame can pass a scratch vector to avoid per-frame
 * allocation; one-shot callers can omit it.
 */
export const resolveHygWorldPosition = (
  starIndex: number,
  catalog: HygCatalogData,
  out: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 | null => {
  if (!Number.isInteger(starIndex) || starIndex < 0) return null;
  if (starIndex >= catalog.header.count) return null;

  const i = starIndex * 3;
  const px = catalog.positions[i] * DISTANCE_SCALE;
  const py = catalog.positions[i + 1] * DISTANCE_SCALE;
  const pz = catalog.positions[i + 2] * DISTANCE_SCALE;

  return hygEquatorialToScene(px, py, pz, out);
};

/**
 * Resolve a HYG star's distance from the Sun in parsec. Reads the
 * raw catalog position (which is stored in parsec, pre-scale) so
 * the result is independent of the obliquity rotation and the
 * `DISTANCE_SCALE` parsec→world-unit factor (rotation preserves
 * vector magnitude; the scale is just a unit change).
 *
 * Used by T6.4-M2.5 S4's HYG fly-to to feed
 * `computeAtlasFlightLanding(radiusWu, distancePc)` from
 * `lib/camera/stellarFlightSolidAngle.ts` — the Gaia-faithful
 * adaptive landing target lerps anchor distances in pc, not
 * world units.
 *
 * Returns `null` for an out-of-range / negative / non-integer
 * index, matching `resolveHygWorldPosition`'s contract.
 */
export const resolveHygDistanceFromSunPc = (
  starIndex: number,
  catalog: HygCatalogData
): number | null => {
  if (!Number.isInteger(starIndex) || starIndex < 0) return null;
  if (starIndex >= catalog.header.count) return null;

  const i = starIndex * 3;
  const px = catalog.positions[i];
  const py = catalog.positions[i + 1];
  const pz = catalog.positions[i + 2];

  return Math.sqrt(px * px + py * py + pz * pz);
};
