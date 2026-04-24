/**
 * T4.1-α — double-double arithmetic primitives.
 *
 * Pure-TypeScript mirror of the precision semantics of Gaia Sky's
 * `gaiasky.util.math.Quadruple` (128-bit / ~33-digit) used by
 * `Vector3Q` (`core/src/gaiasky/util/math/Vector3Q.java:19-22`). Gaia
 * needs extended precision to preserve sub-meter accuracy at the
 * extremes of its rendered scene (out to 50 Gpc = 1.5e27 m from
 * the Sun). Standard IEEE 754 double has ~15-16 significant digits;
 * at 1e27 m the least-significant-bit is ~1e11 m — catastrophic
 * for rendering a planet-sized target.
 *
 * **Why double-double (~106-bit, ~31 digits) instead of full 128-bit
 * Quadruple**: JavaScript has no 128-bit float primitive. The
 * alternatives are:
 *   - BigInt + scaled fixed-point: arbitrary precision but slow
 *     (~10-100× vs IEEE math) and requires careful overflow tracking.
 *   - Decimal libraries (`decimal.js`): arbitrary precision, even
 *     slower than BigInt due to string / array representation.
 *   - Double-double (two doubles representing hi + lo): 106-bit
 *     effective precision, 2-4× slower than single-double, uses
 *     standard IEEE 754 hardware paths.
 *
 * Atlas's precision requirement: preserve sub-meter precision at
 * 50 Gpc. log2(1.5e27 / 1) ≈ 90 bits. Double-double's 106 bits
 * gives 16 bits of safety margin. 128-bit Quadruple would give 38
 * — overkill for atlas's scope. Port as double-double; documented
 * divergence from Gaia's Quadruple is the precision ceiling
 * (31 vs 33-36 digits; same order of magnitude).
 *
 * **References**:
 *   - Dekker (1971) "A Floating-Point Technique for Extending the
 *     Available Precision", Numer. Math. 18, 224-242 — TwoSum,
 *     FastTwoSum, Veltkamp split.
 *   - Hida/Li/Bailey (2001) "Algorithms for Quad-Double Precision
 *     Floating Point Arithmetic" — the canonical modern reference.
 *   - Shewchuk (1997) "Adaptive Precision Floating-Point Arithmetic
 *     and Fast Robust Geometric Predicates", Discrete Comput. Geom.
 *     18, 305-363 — robust expansion arithmetic.
 *
 * This module implements only the primitives T4.1's camera-relative
 * rendering path needs. The full double-double API (mul, div, sqrt,
 * trig) is a future sub-wave if atlas's use cases expand.
 */

/**
 * A double-double number: `hi + lo` where `|lo| <= ulp(hi) / 2`.
 * Expressed as a tuple for value semantics (no object identity
 * concerns, trivially structurally comparable in tests, cheap to
 * copy). `readonly` at the type level; consumers should treat QD
 * values as immutable and construct new tuples rather than mutate.
 *
 * Invariant: if `qd` is the result of any function in this module,
 * `qd[0]` (hi) is the best double approximation of the full value
 * and `qd[1]` (lo) is the residual error term. The full value is
 * `qd[0] + qd[1]` evaluated exactly (which needs extended precision
 * — the point of the whole module is that this full value is NOT
 * representable as a single double).
 */
export type QD = readonly [number, number];

/**
 * Dekker's TwoSum: given two doubles a, b, compute (sum, err) such
 * that `sum = round(a + b)` (standard IEEE 754 add) AND
 * `a + b = sum + err` evaluated exactly in real arithmetic.
 *
 * `err` is the rounding residual — the bits that got discarded by
 * IEEE round-to-nearest-even. Captures full precision in a pair of
 * doubles. No restriction on magnitude of a vs b.
 *
 * Cost: 6 IEEE 754 ops. See Knuth TAOCP vol. 2 §4.2.2 Theorem B.
 */
export const twoSum = (a: number, b: number): QD => {
  const sum = a + b;
  const bb = sum - a;
  const err = a - (sum - bb) + (b - bb);
  return [sum, err];
};

/**
 * Dekker's FastTwoSum: like `twoSum` but requires `|a| >= |b|`
 * (otherwise the returned err is wrong). Cheaper at 3 ops. Useful
 * inside double-double ops where the ordering is known to hold by
 * construction.
 *
 * Caller MUST verify the precondition; this function does not
 * validate for performance reasons. If in doubt, use `twoSum`.
 */
export const fastTwoSum = (a: number, b: number): QD => {
  const sum = a + b;
  const err = b - (sum - a);
  return [sum, err];
};

/**
 * Construct a QD from a single double. The low part is zero because
 * a single double has no extended precision to preserve.
 */
export const qdFromDouble = (x: number): QD => [x, 0];

/**
 * Collapse a QD to its best double approximation. Loses the low
 * part — meant for GPU uniform uploads or other consumers that
 * can't handle 106-bit. Rounds to nearest via IEEE add (`hi + lo`
 * uses standard round-to-nearest-even; if hi represents the full
 * value's best double approximation, hi + lo is either hi or the
 * neighbouring representable double depending on the magnitude of
 * lo).
 */
export const qdToDouble = (qd: QD): number => qd[0] + qd[1];

/**
 * Negate a QD. Both parts flip sign.
 */
export const qdNeg = (a: QD): QD => [-a[0], -a[1]];

/**
 * Add two QDs using Dekker's double-double algorithm.
 *
 * Pattern (Hida/Li/Bailey §3.1 "dd_add"):
 *   (sh, sl) = twoSum(a.hi, b.hi)     // 6 ops
 *   (eh, el) = twoSum(a.lo, b.lo)     // 6 ops
 *   sl = sl + eh
 *   (sh, sl) = fastTwoSum(sh, sl)     // 3 ops
 *   sl = sl + el
 *   (sh, sl) = fastTwoSum(sh, sl)     // 3 ops
 *   return (sh, sl)
 *
 * Total 20 IEEE ops. Error bound <= 2^-106 relative — the full
 * 106-bit precision.
 */
export const qdAdd = (a: QD, b: QD): QD => {
  const [sh1, sl1] = twoSum(a[0], b[0]);
  const [eh, el] = twoSum(a[1], b[1]);
  const sl2 = sl1 + eh;
  const [sh3, sl3] = fastTwoSum(sh1, sl2);
  const sl4 = sl3 + el;
  return fastTwoSum(sh3, sl4);
};

/**
 * Subtract two QDs: `a - b`. Implemented as `a + (-b)` for
 * correctness (sign propagation through double-double is non-
 * trivial; negate-then-add is the audited-correct pattern per
 * Hida/Li/Bailey).
 */
export const qdSub = (a: QD, b: QD): QD => qdAdd(a, qdNeg(b));

/**
 * Multiply a QD by a single double (the "QD × D" reduced form).
 * Full QD × QD would need 4 cross-products + compensations; single-
 * double on the right lets us use the cheaper QD-scale pattern.
 *
 * Pattern (2-ops form using FMA-equivalent via Veltkamp split):
 *   (ph, pl) = twoProduct(a.hi, b)
 *   pl += a.lo * b
 *   return fastTwoSum(ph, pl)
 *
 * Cost: twoProduct is 17 ops (uses Veltkamp split without FMA).
 * Total ~21 ops. Only exposed because `vector3QScl(v, scalar)`
 * benefits from it; not needed for the camera-relative subtract
 * critical path.
 */
export const qdMulDouble = (a: QD, b: number): QD => {
  const [ph, pl] = twoProduct(a[0], b);
  const pl2 = pl + a[1] * b;
  return fastTwoSum(ph, pl2);
};

/**
 * Dekker's TwoProduct (Veltkamp split form, no FMA assumed). Given
 * doubles a, b, compute (prod, err) such that `a × b = prod + err`
 * exactly, with `prod = round(a × b)`.
 *
 * Uses the Veltkamp split constant `2^27 + 1` for IEEE 754 double:
 * splits each operand into a 27-bit high half + 26-bit low half, so
 * their cross products fit in a double without loss.
 *
 * Exported as a helper so callers that need custom product chains
 * can reach for it; primary consumer is `qdMulDouble` above.
 */
export const twoProduct = (a: number, b: number): QD => {
  const SPLIT = 134217729; // 2^27 + 1 for IEEE 754 double
  const prod = a * b;
  const at = SPLIT * a;
  const ah = at - (at - a);
  const al = a - ah;
  const bt = SPLIT * b;
  const bh = bt - (bt - b);
  const bl = b - bh;
  const err = al * bl - (prod - ah * bh - al * bh - ah * bl);
  return [prod, err];
};
