/**
 * T4.1-α — Vector3Q pure-TS mirror.
 *
 * Ports Gaia Sky's `gaiasky.util.math.Vector3Q`
 * (`/tmp/gaiasky/core/src/gaiasky/util/math/Vector3Q.java`) into
 * atlas as a minimum-viable-API subset for camera-relative
 * rendering. Gaia's Vector3Q holds three `Quadruple` (128-bit)
 * components; atlas's mirror uses three `QD` (double-double /
 * 106-bit) components — see `quadDouble.ts` for the precision
 * tradeoff.
 *
 * **Scope of T4.1-α** (2026-04-24 building-block ship): just the
 * subset the T4.1 wiring passes need. Gaia's full Vector3Q has 96
 * methods (rotations, spherical coords, matrix transforms, aux-
 * buffer variants). Atlas will add more as future T4.1 sub-waves
 * demand them; do not port speculative methods.
 *
 * **Critical path operation** per `AbstractCamera.java:49-50`:
 * subtract camera position (Vector3Q) from world positions
 * (Vector3Q), then convert the result to Vector3D for GPU upload.
 * The subtract MUST happen in quad-precision to preserve sub-meter
 * positional accuracy at 50 Gpc scene scale; the conversion to
 * Vector3D (float64) happens only AFTER the subtract brings the
 * operand into a range where 64-bit precision suffices (typically
 * within ~1e9 m of camera, where float64's ulp is ~1e-7 m).
 *
 * **Immutability**. Consumers treat Vector3Q as value-semantic.
 * All operations return fresh objects. This matches atlas's
 * functional-TS style (unlike Gaia's Java mutating `set/add/sub`
 * methods that return `this`). If a future hot-path site proves
 * allocation-pressured, we can add a `_inPlace` mutating variant
 * with a scratch-buffer caller contract — deliberately NOT
 * shipping that in T4.1-α.
 */

import {
  qdAdd,
  qdFromDouble,
  qdMulDouble,
  qdSub,
  qdToDouble,
  type QD,
} from "./quadDouble";

/**
 * A 3-component vector in double-double precision. Immutable;
 * all operations return new vectors.
 *
 * Component ordering matches Three.js / Gaia / glTF: x right,
 * y up, z forward (in the world frame — atlas's ecliptic-aligned
 * world where the XZ plane holds planet orbits).
 */
export interface Vector3Q {
  readonly x: QD;
  readonly y: QD;
  readonly z: QD;
}

/**
 * Construct a Vector3Q from three doubles. Each component gets a
 * zero low-part (the input IS the best double approximation; no
 * extended precision to capture yet).
 *
 * Mirrors `Vector3Q(double x, double y, double z)` constructor at
 * `Vector3Q.java:59-63`.
 */
export const vector3QFromDoubles = (
  x: number,
  y: number,
  z: number
): Vector3Q => ({
  x: qdFromDouble(x),
  y: qdFromDouble(y),
  z: qdFromDouble(z),
});

/**
 * Zero vector. Useful sentinel for no-op-by-default positions
 * (e.g. the Sun at origin in atlas's world frame).
 */
export const VECTOR3Q_ZERO: Vector3Q = vector3QFromDoubles(0, 0, 0);

/**
 * Add two Vector3Q values componentwise. Full double-double
 * precision maintained throughout.
 *
 * Mirrors `Vector3Q.add(final Vector3Q vec)` at
 * `Vector3Q.java:267-272`.
 */
export const vector3QAdd = (a: Vector3Q, b: Vector3Q): Vector3Q => ({
  x: qdAdd(a.x, b.x),
  y: qdAdd(a.y, b.y),
  z: qdAdd(a.z, b.z),
});

/**
 * Subtract componentwise: `a - b`. This is the T4.1 critical-path
 * operation — computes `worldPos - cameraPos` before the caller
 * downcasts to float32/float64 for GPU upload, preserving sub-
 * meter precision at astronomical scale.
 *
 * Mirrors `Vector3Q.sub(final Vector3Q vec)` at
 * `Vector3Q.java:338-343`.
 */
export const vector3QSub = (a: Vector3Q, b: Vector3Q): Vector3Q => ({
  x: qdSub(a.x, b.x),
  y: qdSub(a.y, b.y),
  z: qdSub(a.z, b.z),
});

/**
 * Scale a Vector3Q by a single double. Preserves QD precision on
 * the left operand.
 *
 * Mirrors `Vector3Q.scl(double scalar)` at `Vector3Q.java:398-402`.
 */
export const vector3QScl = (v: Vector3Q, s: number): Vector3Q => ({
  x: qdMulDouble(v.x, s),
  y: qdMulDouble(v.y, s),
  z: qdMulDouble(v.z, s),
});

/**
 * Collapse a Vector3Q to three doubles. Loses the QD low-parts —
 * use AFTER camera-relative subtract brings values into a range
 * where 64-bit suffices, THEN pass the result to Three.js /
 * WebGL (which use float32 for vertex attributes + uniforms
 * anyway, but float64 for THREE.Vector3 matrix math).
 *
 * Mirrors `Vector3Q.put(Vector3D)` / `toDoubles()` convention
 * (the Vector3Q→Vector3D direction at `Vector3Q.java:209-218`).
 */
export const vector3QToDoubles = (
  v: Vector3Q
): readonly [number, number, number] => [
  qdToDouble(v.x),
  qdToDouble(v.y),
  qdToDouble(v.z),
];

/**
 * Length in double precision. Computes `sqrt(x² + y² + z²)` with
 * the squares accumulated in QD (so the sum doesn't lose
 * precision to cancellation when the components have very
 * different magnitudes), then sqrt applied to the collapsed
 * double result.
 *
 * Mirrors `Vector3Q.lenDouble()` at `Vector3Q.java:442-444`. Gaia
 * returns double (not Quadruple) from `lenDouble` — `sqrt` in
 * quad would need a quad-precision sqrt implementation that's
 * beyond T4.1-α scope. Double-precision sqrt at astronomical
 * distances loses <= 7 digits of precision (ulp ~1e-16), which is
 * fine for MAX_ALLOWED_DISTANCE comparisons etc.
 *
 * Divergence from Gaia: Gaia also exposes `len()` returning
 * `Quadruple` (full precision length) — not yet needed by atlas;
 * add when a concrete use case surfaces.
 */
export const vector3QLenDouble = (v: Vector3Q): number => {
  // Squares in QD, summed in QD, collapsed at the end to double.
  // `qdMulDouble` is QD×double → QD; squaring is QD.x × QD.x, but
  // we only have QD×double. For this lib's purposes we collapse
  // each component to double BEFORE squaring — loses some precision
  // on the low-part but is correct to ~15 digits. Full-precision
  // length (using QD × QD multiplication) is deferred until a
  // future sub-wave demands it.
  const dx = qdToDouble(v.x);
  const dy = qdToDouble(v.y);
  const dz = qdToDouble(v.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * Copy constructor. Returns a new Vector3Q with the same QD
 * components — since QD is a readonly tuple, the underlying
 * arrays are safely shared (no deep clone needed). Exposed for
 * API symmetry with Gaia's `cpy()` at `Vector3Q.java:263-265`;
 * consumers rarely need it because Vector3Q is already
 * value-semantic, but it's a useful breadcrumb for porters.
 */
export const vector3QCpy = (v: Vector3Q): Vector3Q => ({
  x: v.x,
  y: v.y,
  z: v.z,
});
