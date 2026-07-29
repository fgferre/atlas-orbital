import * as THREE from "three";
import { STAR_DISPLAY_BLACK_POINT } from "./starfieldShaderMath";

/**
 * Leinert et al. (1998) zodiacal light brightness table at 500 nm, plus
 * the build-time resampling and photometric calibration that turn it
 * into something the renderer can actually sample.
 *
 * Source: Leinert et al., "The 1997 reference of diffuse night sky
 * brightness", Astronomy & Astrophysics Supplement Series, 127, 1-99
 * (1998), Table 16 — the S10☉ grid re-published there as the update of
 * Levasseur-Regourd & Dumont (1980). Values are in S10☉ units (the
 * surface brightness of one 10th-magnitude solar-type star per square
 * degree); Leinert's Table 2 gives 1 S10☉ = 1.28e-8 W/m²/sr/µm at
 * 500 nm.
 *
 * ## Layout (this was wrong until 2026-07-29 — read this before editing)
 *
 * Table 16's ROWS are helioecliptic longitude difference λ−λ☉ and its
 * COLUMNS are ecliptic latitude β:
 *
 *   rows: λ−λ☉ ∈ {0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 60, 75, 90,
 *                 105, 120, 135, 150, 165, 180}   (19)
 *   cols: β    ∈ {0, 5, 10, 15, 20, 25, 30, 45, 60, 75}   (10)
 *
 * The layer shipped in 48a3acc declared these the other way round —
 * β over 19 values out to 180°, which is not a latitude any sky has.
 * The numbers themselves were always in Table 16 order; only the axis
 * labels, the docstring, and every consumer's sampling math were
 * transposed. Two checks that fix the orientation without the paper in
 * hand: the β = 0 column read down the rows is the textbook
 * in-ecliptic profile (9000 S10☉ at 15° elongation, a minimum of 140
 * near 135-150°, and the gegenschein rising back to 180 at the
 * antisolar point), and the β = 75 column is nearly flat at 56-78,
 * bracketing the 60 ± 3 S10☉ Leinert quotes for the ecliptic pole.
 *
 * ## Blank cells
 *
 * Table 16 leaves a wedge of cells empty near the Sun. They are `null`
 * here rather than 0, because "no datum" and "no light" are opposite
 * claims and the difference is 9000 S10☉ wide. Every blank cell lies
 * within 15° of the Sun's direction (the farthest is λ−λ☉ = 0°,
 * β = 15°, at exactly 15°; the nearest tabulated cell is λ−λ☉ = 10°,
 * β = 10°, at 14.1°). That solid angle is dominated by the solar
 * F-corona, which Leinert treats as a separate component and which
 * this layer does not model at all.
 *
 * {@link buildZodiacalUniformGrid} fills them by holding the innermost
 * tabulated value of the same β column inward — a constant extension,
 * introducing no shape that is not in the data, and one that
 * deliberately UNDER-states a region that is in reality far brighter.
 * The Sun's own rendering occupies that solid angle anyway.
 *
 * ## The pole row
 *
 * Table 16 stops at β = 75°, but ecliptic longitude is undefined at
 * the pole, so a grid that stops at 75° makes every direction within
 * 15° of the pole sample a λ-dependent value that the geometry cannot
 * distinguish — a pinwheel of ±20 % around the pole pixel. Leinert
 * publishes the pole brightness separately as 60 ± 3 S10☉, so the grid
 * is extended with a β = 90° column of a constant 60. That is a cited
 * measurement, not an extrapolation, and it restores the λ-independence
 * the geometry requires. The 56-78 range of the β = 75° column
 * brackets it, so the added column also joins the table smoothly.
 *
 * ## Non-uniform axes
 *
 * Both source axes change step part-way (5° then 15° in λ−λ☉ past 45°;
 * 5° then 15° in β past 30°), and a GPU `LinearFilter` fetch assumes a
 * uniform grid. Rather than carry per-axis lookup tables into GLSL,
 * {@link buildZodiacalUniformGrid} resamples once at build time onto a
 * uniform 5° lattice. Every source knot is a multiple of 5°, so the
 * lattice reproduces the table EXACTLY at its knots and linearly
 * between them — the uniform texture is not an approximation of the
 * non-uniform table, it is the same piecewise-bilinear function.
 */

/** Table 16 rows: helioecliptic longitude difference λ−λ☉, in degrees. */
export const ZODIACAL_TABLE_LAMBDA_AXIS_DEG: readonly number[] = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 60, 75, 90, 105, 120, 135, 150, 165,
  180,
];

/** Table 16 columns: ecliptic latitude β, in degrees. */
export const ZODIACAL_TABLE_BETA_AXIS_DEG: readonly number[] = [
  0, 5, 10, 15, 20, 25, 30, 45, 60, 75,
];

/**
 * Table 16 verbatim, in S10☉. `null` marks a cell the paper leaves
 * blank — see the "Blank cells" note above.
 *
 * Row `i` is λ−λ☉ = {@link ZODIACAL_TABLE_LAMBDA_AXIS_DEG}`[i]`;
 * column `j` is β = {@link ZODIACAL_TABLE_BETA_AXIS_DEG}`[j]`.
 *
 * Only |β| is tabulated: the interplanetary dust cloud is symmetric
 * about the ecliptic, so the southern sky mirrors the northern one and
 * the sampler reflects before looking up.
 */
export const ZODIACAL_BRIGHTNESS_S10: readonly (readonly (number | null)[])[] =
  [
    // λ−λ☉ ↓ / β →   0     5    10    15    20    25    30    45   60   75
    /*   0 */ [null, null, null, null, 2450, 1260, 770, 215, 117, 78],
    /*   5 */ [null, null, null, 2300, 1200, 740, 490, 212, 117, 78],
    /*  10 */ [null, null, 3700, 1930, 1070, 675, 460, 206, 116, 78],
    /*  15 */ [9000, 5300, 2690, 1450, 870, 590, 410, 196, 114, 78],
    /*  20 */ [5000, 3500, 1880, 1100, 710, 495, 355, 185, 110, 77],
    /*  25 */ [3000, 2210, 1350, 860, 585, 425, 320, 174, 106, 76],
    /*  30 */ [1940, 1460, 955, 660, 480, 365, 285, 162, 102, 74],
    /*  35 */ [1290, 990, 710, 530, 400, 310, 250, 151, 98, 73],
    /*  40 */ [925, 735, 545, 415, 325, 264, 220, 140, 94, 72],
    /*  45 */ [710, 570, 435, 345, 278, 228, 195, 130, 91, 70],
    /*  60 */ [395, 345, 275, 228, 190, 163, 143, 105, 81, 67],
    /*  75 */ [264, 248, 210, 177, 153, 134, 118, 91, 73, 64],
    /*  90 */ [202, 196, 176, 151, 130, 115, 103, 81, 67, 62],
    /* 105 */ [166, 164, 154, 133, 117, 104, 93, 75, 64, 60],
    /* 120 */ [147, 145, 138, 120, 108, 98, 88, 70, 60, 58],
    /* 135 */ [140, 139, 130, 115, 105, 95, 86, 70, 60, 57],
    /* 150 */ [140, 139, 129, 116, 107, 99, 91, 75, 62, 56],
    /* 165 */ [153, 150, 140, 129, 118, 110, 102, 81, 64, 56],
    /* 180 */ [180, 166, 152, 139, 127, 116, 105, 82, 65, 56],
  ];

/** Ecliptic-pole brightness, 60 ± 3 S10☉ — Leinert et al. (1998),
 *  quoted outside Table 16's grid. See "The pole row" above. */
export const ZODIACAL_POLE_S10 = 60;

/** Reference observer heliocentric distance in AU. Table 16 is measured
 *  from Earth, i.e. at 1 AU; the shader divides the live camera
 *  distance by this before applying the R^-2.5 law. Doubles as the
 *  INWARD clamp floor on that division — see
 *  {@link zodiacalHeliocentricFactor} for why the same number is
 *  correct in both roles. */
export const ZODIACAL_REFERENCE_R_AU = 1.0;

/** Dumont (1983) fan-cloud density exponent: the integrated zodiacal
 *  dust density scales as R^-2.5 with heliocentric distance. Applied
 *  outward of {@link ZODIACAL_REFERENCE_R_AU} by
 *  {@link zodiacalHeliocentricFactor}; see that function for the
 *  inward bound. */
export const ZODIACAL_R_EXPONENT = 2.5;

// -----------------------------------------------------------------------------
// Uniform resampling
// -----------------------------------------------------------------------------

/** Step of the uniform lattice, in degrees. 5° is the finest step both
 *  source axes use, and every source knot is a multiple of it, so the
 *  resample is exact at the knots. */
export const ZODIACAL_GRID_STEP_DEG = 5;

/** λ−λ☉ ∈ [0°, 180°] — a longitude DIFFERENCE, so 180° is the antisolar
 *  meridian and the axis needs no wrap. */
export const ZODIACAL_LAMBDA_MAX_DEG = 180;

/** |β| ∈ [0°, 90°] — Table 16's 75° edge plus the cited pole value. */
export const ZODIACAL_BETA_MAX_DEG = 90;

/** Lattice width (λ−λ☉ samples): 0, 5, … 180. */
export const ZODIACAL_GRID_LAMBDA_COUNT =
  ZODIACAL_LAMBDA_MAX_DEG / ZODIACAL_GRID_STEP_DEG + 1;

/** Lattice height (|β| samples): 0, 5, … 90. */
export const ZODIACAL_GRID_BETA_COUNT =
  ZODIACAL_BETA_MAX_DEG / ZODIACAL_GRID_STEP_DEG + 1;

interface AxisWeight {
  i0: number;
  i1: number;
  t: number;
}

/** Bracketing indices and interpolation fraction for `value` on a
 *  monotonically increasing, possibly non-uniform axis. Clamps at both
 *  ends, so the caller never has to. */
const axisWeight = (axis: readonly number[], value: number): AxisWeight => {
  const last = axis.length - 1;
  if (value <= axis[0]) return { i0: 0, i1: 0, t: 0 };
  if (value >= axis[last]) return { i0: last, i1: last, t: 0 };
  let i = 0;
  while (i < last - 1 && axis[i + 1] <= value) i++;
  const span = axis[i + 1] - axis[i];
  return { i0: i, i1: i + 1, t: span > 0 ? (value - axis[i]) / span : 0 };
};

/**
 * Table 16 with the blanks filled and the pole column appended:
 * `[19 λ−λ☉ rows][11 β columns]`, all finite.
 *
 * Blanks only ever occur at the low-λ end of a column (they are the
 * near-Sun wedge), so filling is a backward hold of that column's
 * innermost tabulated value.
 */
const buildFilledSourceTable = (): {
  betaAxis: readonly number[];
  values: readonly (readonly number[])[];
} => {
  const betaAxis = [...ZODIACAL_TABLE_BETA_AXIS_DEG, ZODIACAL_BETA_MAX_DEG];
  const rows = ZODIACAL_TABLE_LAMBDA_AXIS_DEG.length;
  // Pre-filling with the pole value IS the pole column: the loop below
  // only writes Table 16's own 10 columns, so the appended 11th keeps
  // the constant 60 S10☉ at every λ−λ☉.
  const values: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(betaAxis.length).fill(ZODIACAL_POLE_S10)
  );

  for (let c = 0; c < ZODIACAL_TABLE_BETA_AXIS_DEG.length; c++) {
    // Walk outward from the Sun to find the innermost tabulated cell,
    // then hold it across the blank wedge below it.
    let firstValid = 0;
    while (firstValid < rows && ZODIACAL_BRIGHTNESS_S10[firstValid][c] === null)
      firstValid++;
    const held = ZODIACAL_BRIGHTNESS_S10[firstValid]?.[c] ?? ZODIACAL_POLE_S10;
    for (let r = 0; r < rows; r++) {
      values[r][c] = ZODIACAL_BRIGHTNESS_S10[r][c] ?? held;
    }
  }

  return { betaAxis, values };
};

/**
 * Resample the source table onto the uniform 5° lattice.
 *
 * Returns a row-major `Float32Array` of
 * {@link ZODIACAL_GRID_LAMBDA_COUNT} × {@link ZODIACAL_GRID_BETA_COUNT}
 * S10☉ values, indexed `betaIndex * width + lambdaIndex` — the same
 * layout the `DataTexture` wants, with λ−λ☉ across and |β| down.
 *
 * Exact at every source knot; bilinear between them, in true axis
 * space. The GPU's uniform bilinear fetch of this lattice therefore
 * reproduces a correct non-uniform interpolation of Table 16 without
 * any axis LUT in the shader.
 */
export const buildZodiacalUniformGrid = (): Float32Array => {
  const { betaAxis, values } = buildFilledSourceTable();
  const width = ZODIACAL_GRID_LAMBDA_COUNT;
  const height = ZODIACAL_GRID_BETA_COUNT;
  const grid = new Float32Array(width * height);

  for (let j = 0; j < height; j++) {
    const b = axisWeight(betaAxis, j * ZODIACAL_GRID_STEP_DEG);
    for (let i = 0; i < width; i++) {
      const l = axisWeight(
        ZODIACAL_TABLE_LAMBDA_AXIS_DEG,
        i * ZODIACAL_GRID_STEP_DEG
      );
      const v00 = values[l.i0][b.i0];
      const v10 = values[l.i1][b.i0];
      const v01 = values[l.i0][b.i1];
      const v11 = values[l.i1][b.i1];
      grid[j * width + i] =
        v00 * (1 - l.t) * (1 - b.t) +
        v10 * l.t * (1 - b.t) +
        v01 * (1 - l.t) * b.t +
        v11 * l.t * b.t;
    }
  }

  return grid;
};

/**
 * Pure-TypeScript mirror of the GLSL lattice fetch: bilinear sample of
 * {@link buildZodiacalUniformGrid}'s output at a helioecliptic
 * direction, in S10☉.
 *
 * Uses the same texel-centre convention as the GPU — lattice cell
 * `(i, j)` holds the value at exactly `(i·5°, j·5°)`, which
 * `texture2D` returns for `uv = ((i + 0.5)/w, (j + 0.5)/h)` — so this
 * and the shader agree numerically, not just in spirit.
 *
 * `betaDeg` is reflected (the cloud is symmetric about the ecliptic)
 * and both axes clamp to the lattice edge.
 */
export const sampleZodiacalGridS10 = (
  grid: Float32Array,
  lambdaDeg: number,
  betaDeg: number
): number => {
  const width = ZODIACAL_GRID_LAMBDA_COUNT;
  const height = ZODIACAL_GRID_BETA_COUNT;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(Math.max(v, lo), hi);

  const x =
    clamp(lambdaDeg, 0, ZODIACAL_LAMBDA_MAX_DEG) / ZODIACAL_GRID_STEP_DEG;
  const y =
    clamp(Math.abs(betaDeg), 0, ZODIACAL_BETA_MAX_DEG) / ZODIACAL_GRID_STEP_DEG;

  const x0 = Math.min(Math.floor(x), width - 1);
  const y0 = Math.min(Math.floor(y), height - 1);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;

  const at = (i: number, j: number) => grid[j * width + i];
  return (
    at(x0, y0) * (1 - fx) * (1 - fy) +
    at(x1, y0) * fx * (1 - fy) +
    at(x0, y1) * (1 - fx) * fy +
    at(x1, y1) * fx * fy
  );
};

// -----------------------------------------------------------------------------
// Helioecliptic angles
// -----------------------------------------------------------------------------

/**
 * Ecliptic latitude β and helioecliptic longitude difference |λ−λ☉| of
 * a look direction, both in degrees. Pure mirror of `zodiacalAngles`
 * in {@link ZODIACAL_FRAGMENT_GLSL}.
 *
 * The scene frame is the three.js Y-up remap of ecliptic J2000 (see
 * `orbital/analytical/coordUtils.ts`), so +Y IS the ecliptic pole and
 * the XZ plane IS the ecliptic:
 *
 *   β    = asin(dir.y)
 *   |Δλ| = angle between the XZ-plane projections of `dir` and `sunDir`
 *
 * The projection form is used rather than inverting
 * `cos ε = cos β · cos Δλ` because it needs no division by `cos β`
 * (which vanishes at the pole) and stays exact when the observer is
 * off the ecliptic, where the Sun itself is no longer at β = 0.
 *
 * What it fixes: the shader shipped in 48a3acc passed the 3D angular
 * separation `acos(dot(dir, sunDir))` as if it were λ−λ☉. Those agree
 * only in the ecliptic plane. Everywhere else `cos ε = cos β · cos Δλ`
 * shrinks |cos ε| relative to |cos Δλ|, i.e. it pulls ε toward 90°:
 * inside quadrature ε > Δλ, so the old path sampled too FAR from the
 * Sun and thinned the cone; past quadrature ε < Δλ, so it sampled too
 * near and smeared inner-band brightness across the outer sky. At
 * β = 60°, Δλ = 120° the two differ by 15.5°.
 *
 * Both vectors are assumed normalised. When either projection
 * degenerates — a line of sight along the pole, or an observer sitting
 * on the ecliptic pole axis, where helioecliptic longitude is
 * genuinely undefined — |Δλ| falls back to 0; at the pole the lattice
 * is λ-independent by construction, so the fallback is invisible there.
 */
export const zodiacalAnglesFromDirection = (
  dir: readonly [number, number, number],
  sunDir: readonly [number, number, number]
): { betaDeg: number; lambdaDeg: number } => {
  const toDeg = 180 / Math.PI;
  const betaDeg = Math.asin(Math.min(Math.max(dir[1], -1), 1)) * toDeg;

  const dx = dir[0];
  const dz = dir[2];
  const sx = sunDir[0];
  const sz = sunDir[2];
  const lenDir = Math.hypot(dx, dz);
  const lenSun = Math.hypot(sx, sz);

  let cosDeltaLambda = 1;
  if (lenDir > 1e-6 && lenSun > 1e-6) {
    const c = (dx * sx + dz * sz) / (lenDir * lenSun);
    cosDeltaLambda = Math.min(Math.max(c, -1), 1);
  }

  return { betaDeg, lambdaDeg: Math.acos(cosDeltaLambda) * toDeg };
};

// -----------------------------------------------------------------------------
// Photometric calibration
// -----------------------------------------------------------------------------

/**
 * Bloom's bright-pass gate, shared by every entry in
 * `config/visualPresets.ts` and hard-coded in
 * `PostProcessingPipeline.tsx`. Bloom runs BEFORE the tone-mapping
 * pass, so it sees raw linear buffer values — which is why this, and
 * not a post-operator number, is the ceiling the calibration below has
 * to respect.
 *
 * Named here rather than imported so this module stays a leaf next to
 * `starfieldShaderMath.ts`, which states the display black point the
 * same way.
 */
export const ZODIACAL_BLOOM_THRESHOLD = 1.0;

/** Brightest tabulated cell: λ−λ☉ = 15°, β = 0°. */
export const ZODIACAL_BRIGHT_ANCHOR_S10 = 9000;

/** Faintest point of the in-ecliptic profile: λ−λ☉ = 135°/150°, β = 0°,
 *  the minimum between the inner cone and the gegenschein. */
export const ZODIACAL_FAINT_ANCHOR_S10 = 140;

/**
 * S10☉ → linear scene radiance.
 *
 * ## Why the old number was not a calibration
 *
 * The layer shipped with `4.0e-9`, justified as "a discretely small
 * scalar". It put the brightest cell in the entire table at
 * `9000 × 4.0e-9 = 3.6e-5` linear — 4600× below
 * {@link STAR_DISPLAY_BLACK_POINT}, and still 286× below it after the
 * largest exposure the registry allows (`SCENE_EXPOSURE_MAX = 16`).
 * The band could not have produced a lit pixel on any tier, at any
 * distance, under any grade. This constant is 90 468× larger.
 *
 * ## The derivation
 *
 * The graded pipeline has exactly one visible window for a diffuse
 * surface: below {@link STAR_DISPLAY_BLACK_POINT} = 0.165 the
 * `BrightnessContrast` grade clips it to black; above
 * {@link ZODIACAL_BLOOM_THRESHOLD} = 1.0 it stops reading as surface
 * brightness and starts being smeared as an emitter. That window spans
 * 1.0 / 0.165 = **6.06:1**.
 *
 * The band's own contrast range along the ecliptic — the axis the
 * feature is actually made of — spans
 * {@link ZODIACAL_BRIGHT_ANCHOR_S10} = 9000 S10☉ down to
 * {@link ZODIACAL_FAINT_ANCHOR_S10} = 140 S10☉, i.e. **64.3:1**. It
 * does not fit. Something has to sit outside the window, and the only
 * choice free of taste is to give both ends the same margin: map the
 * geometric mean of the band's range to the geometric mean of the
 * window.
 *
 *   k = √(0.165 × 1.0) / √(9000 × 140)
 *     = 0.406202 / 1122.50
 *     = 3.618734e-4
 *
 * Each end then overshoots by exactly √((9000/140) / (1.0/0.165)) =
 * **3.257×**, by construction.
 *
 * ## What that puts on screen at 1 AU (linear radiance, ×black point)
 *
 * | λ−λ☉, β = 0° | S10☉ | linear   | × black point            |
 * |--------------|------|----------|--------------------------|
 * | 15°          | 9000 | 3.257    | 19.7   (3.26× bloom)     |
 * | 25°          | 3000 | 1.086    | 6.58   (1.09× bloom)     |
 * | 30°          | 1940 | 0.702    | 4.25                     |
 * | 45°          |  710 | 0.257    | 1.56                     |
 * | 60°          |  395 | 0.143    | 0.87                     |
 * | 90°          |  202 | 0.0731   | 0.44                     |
 * | 180°         |  180 | 0.0651   | 0.39   (gegenschein)     |
 * | pole         |   60 | 0.0217   | 0.13                     |
 *
 * So at neutral exposure the band crosses the black point at
 * λ−λ☉ ≈ 57° in the ecliptic and crosses the bloom threshold at
 * ≈ 26° — a visible cone roughly 30° long with a bloomed root at the
 * Sun, which is what the feature looks like. The gegenschein sits at
 * 0.39× the black point: genuinely faint, invisible until eye
 * adaptation lifts scene exposure past ≈ 2.5×, which is the honest
 * answer for a feature most observers have never seen.
 *
 * ## The bright end, stated rather than hidden
 *
 * The near-Sun cells cross Bloom's gate by up to 3.26×. That is
 * accepted, not clamped: the 64:1 ratio is measured data and squashing
 * it would falsify the one thing a tabulated model is for. The region
 * above the gate reaches ≈ 26° from the Sun along the ecliptic and
 * ≈ 20° across it, and it is the same solid angle the Sun's own disc
 * and bloom already occupy. On every tier that mounts this layer the
 * AgX operator's shoulder is downstream of it.
 *
 * ## Disclosed as a display choice
 *
 * The window this is fitted into is a grade, not a photometric
 * standard, so this remains a calibration constant, disclosed in
 * `CreditsModal.tsx`, and it is still owed a human-eye pass — see
 * `tasks/waves/starfield-visual-upgrade-2026-07-28.md`. If that pass
 * says "too dim", the derived alternative is to anchor the canonical
 * quadrature value (λ−λ☉ = 90°, β = 0°, 202 S10☉) directly on the
 * black point, giving k = 0.165/202 = 8.168e-4 — 2.26× brighter, band
 * visible out to 90° elongation, peak at 7.35× the bloom gate. The
 * dial for a smaller correction is `u_brightnessMul`, which needs no
 * material rebuild.
 */
export const ZODIACAL_S10_TO_LINEAR =
  Math.sqrt(STAR_DISPLAY_BLACK_POINT * ZODIACAL_BLOOM_THRESHOLD) /
  Math.sqrt(ZODIACAL_BRIGHT_ANCHOR_S10 * ZODIACAL_FAINT_ANCHOR_S10);

// -----------------------------------------------------------------------------
// Heliocentric distance scaling
// -----------------------------------------------------------------------------

/**
 * R^-2.5 heliocentric brightness law, bounded inward of
 * {@link ZODIACAL_REFERENCE_R_AU} — pure-TypeScript mirror of the GLSL
 * `r` / `pow(r, -ZODIACAL_R_EXPONENT)` line in
 * {@link ZODIACAL_FRAGMENT_GLSL}.
 *
 * ## The regression this fixes (owner report, 2026-07-29)
 *
 * The calibration above ({@link ZODIACAL_S10_TO_LINEAR}) was derived
 * entirely AT `R = 1 AU`: it puts the brightest tabulated cell at
 * 3.26× {@link ZODIACAL_BLOOM_THRESHOLD} — deliberate, documented, and
 * fine, because the window it overflows into is the same solid angle
 * the Sun's own disc and bloom already occupy at that distance.
 *
 * The shader as first shipped then multiplied that already-at-the-
 * ceiling result by `pow(max(R_AU, 0.1), -2.5)` with NO upper bound on
 * the factor for `R < 1 AU`. That is `10^2.5 ≈ 316×` at the old 0.1 AU
 * floor — so the near-Sun band alone reached `3.26 × 316 ≈ 1030×` the
 * bloom gate, and every pixel within the inner cone (and, once bloom
 * spreads it, effectively the whole screen) washed out flat white as
 * the camera approached the Sun. Reported by the owner as a "glare"
 * that "não cumpre sua função planejada" (does not serve its intended
 * purpose) — confirmed against the arithmetic above, not just the
 * screenshot.
 *
 * ## Why the fix is a bound, not a re-tune
 *
 * The R^-2.5 law itself is real physics (Dumont 1983's fan-cloud
 * integral), and Helios photopolarimeter data shows the zodiacal
 * cloud genuinely DOES keep brightening inward of 1 AU, at a similar
 * exponent, to at least 0.3 AU (Leinert 1975). That is not in dispute.
 *
 * What is out of bounds is applying it to Table 16 as a WHOLE. Table
 * 16 (Leinert et al. 1998, A&AS 127) is the sky brightness as seen
 * FROM 1 AU — every one of its 190 cells was measured at that one
 * heliocentric distance. Nothing in the paper licenses sliding the
 * observer inward and keeping the same angular table; that would need
 * a second table Leinert never published. And even if the shape were
 * right, {@link ZODIACAL_S10_TO_LINEAR} was fitted to the display's
 * ~6:1 usable window (black point to bloom gate) with the band's OWN
 * 64:1 range already spending most of it — there is no 300× of spare
 * headroom in an 8-bit-equivalent graded image regardless of what the
 * true sky radiance does.
 *
 * ## The bound
 *
 * `factor(R) = pow(max(R, 1 AU) / 1 AU, -2.5)`, i.e. `pow(r, -2.5)`
 * unchanged for `R >= 1 AU` (untouched — calibrated and verified, see
 * `tasks/waves/starfield-visual-upgrade-2026-07-28.md`), clamped to
 * exactly `1.0` for every `R <= 1 AU`. The band never gets brighter
 * than its already-3.26×-over-gate value at 1 AU, no matter how close
 * the camera gets to the Sun; it only ever dims going outward. This
 * deliberately UNDER-states the real Helios-measured inward
 * brightening — the same policy {@link buildZodiacalUniformGrid}'s
 * blank-cell fill uses above ("no invented shape, only a floor") —
 * because Table 16's validity domain stops at 1 AU and the display's
 * headroom stops at the bloom gate; a display bound, disclosed here
 * with its own arithmetic rather than silently folded into the
 * calibration constant.
 *
 * Continuous at `R = 1 AU` by construction (both branches evaluate to
 * `1.0` there), so there is no seam to see crossing it.
 */
export const zodiacalHeliocentricFactor = (cameraRAu: number): number => {
  const r =
    Math.max(cameraRAu, ZODIACAL_REFERENCE_R_AU) / ZODIACAL_REFERENCE_R_AU;
  return Math.pow(r, -ZODIACAL_R_EXPONENT);
};

// -----------------------------------------------------------------------------
// GPU upload
// -----------------------------------------------------------------------------

/**
 * Build the uniform lattice as a `DataTexture`
 * ({@link ZODIACAL_GRID_LAMBDA_COUNT} × {@link ZODIACAL_GRID_BETA_COUNT},
 * RGBA16F). One texel = one S10☉ value in R; the shader applies the
 * photometric scale, so what lives on the GPU stays the data table.
 *
 * `HalfFloatType` gives ~11 bits of mantissa, so the 9000 S10☉ peak is
 * stored to ±4 — four parts in ten thousand, far below the grade's
 * resolution. `NoColorSpace` because this is a lookup table, not
 * colour; the previous `SRGBColorSpace` tag was inert under the custom
 * `texture2D` fetch but claimed a transfer function that does not
 * apply. The caller owns disposal.
 */
export const buildZodiacalLutTexture = (): THREE.DataTexture => {
  const grid = buildZodiacalUniformGrid();
  const width = ZODIACAL_GRID_LAMBDA_COUNT;
  const height = ZODIACAL_GRID_BETA_COUNT;
  const data = new Uint16Array(width * height * 4);

  for (let i = 0; i < grid.length; i++) {
    data[i * 4] = THREE.DataUtils.toHalfFloat(grid[i]);
  }

  const tex = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
    THREE.UVMapping,
    THREE.ClampToEdgeWrapping,
    THREE.ClampToEdgeWrapping,
    THREE.LinearFilter,
    THREE.LinearFilter,
    0,
    THREE.NoColorSpace
  );
  tex.needsUpdate = true;
  tex.name = "zodiacal-lut";
  return tex;
};

// -----------------------------------------------------------------------------
// GLSL
// -----------------------------------------------------------------------------

/** Render a JS number as a GLSL float literal — GLSL ES has no
 *  implicit int→float conversion, so `37` would be a type error where
 *  `37.0` is not. */
const glslFloat = (value: number): string => {
  const text = value.toPrecision(10);
  return /[.eE]/.test(text) ? text : `${text}.0`;
};

/**
 * GLSL pasted into the fragment shader by `ZodiacalLightSkybox.tsx`.
 *
 * Every constant is interpolated from the TypeScript above, so the
 * shader and {@link sampleZodiacalGridS10} /
 * {@link zodiacalAnglesFromDirection} cannot drift — the version this
 * replaced kept its own copy of `ZODIACAL_S10_TO_LINEAR` and its own
 * axis maxima, and both copies were wrong in different ways.
 *
 * Exports `zodiacalAngles` (direction → β, |λ−λ☉|) and
 * `zodiacalBrightness` (β, |λ−λ☉| → linear scene radiance). The R-scaling
 * inside `zodiacalBrightness` mirrors {@link zodiacalHeliocentricFactor}
 * exactly — see that function's JSDoc for the near-Sun bound and why it
 * exists (2026-07-29 whiteout fix).
 */
export const ZODIACAL_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D u_zodiacalLut;
uniform vec3 u_sunDir;
uniform float u_cameraR_AU;
uniform float u_brightnessMul;

// Lattice geometry — see buildZodiacalUniformGrid() in zodiacalLightLut.ts.
const float ZODIACAL_STEP_DEG       = ${glslFloat(ZODIACAL_GRID_STEP_DEG)};
const float ZODIACAL_LAMBDA_MAX_DEG = ${glslFloat(ZODIACAL_LAMBDA_MAX_DEG)};
const float ZODIACAL_BETA_MAX_DEG   = ${glslFloat(ZODIACAL_BETA_MAX_DEG)};
const vec2  ZODIACAL_LUT_SIZE       = vec2(${glslFloat(
  ZODIACAL_GRID_LAMBDA_COUNT
)}, ${glslFloat(ZODIACAL_GRID_BETA_COUNT)});

// Photometry — derived in zodiacalLightLut.ts, not tuned here.
const float ZODIACAL_S10_TO_LINEAR  = ${glslFloat(ZODIACAL_S10_TO_LINEAR)};
const float ZODIACAL_REFERENCE_R_AU = ${glslFloat(ZODIACAL_REFERENCE_R_AU)};

// Dumont (1983): the integrated fan-cloud density scales as R^-2.5 with
// heliocentric distance, applied OUTWARD of 1 AU only — see
// zodiacalHeliocentricFactor() in zodiacalLightLut.ts for the inward bound
// (this is that function's exponent, not a free-standing tunable).
const float ZODIACAL_R_EXPONENT = ${glslFloat(ZODIACAL_R_EXPONENT)};

// Helioecliptic angles of a look direction. +Y is the ecliptic pole and
// XZ is the ecliptic plane, so beta is the elevation and the longitude
// difference is the angle between the two XZ projections. Both inputs
// must be normalised.
void zodiacalAngles(vec3 dir, vec3 sunDir, out float betaDeg, out float lambdaDeg) {
  betaDeg = degrees(asin(clamp(dir.y, -1.0, 1.0)));

  vec2 hDir = vec2(dir.x, dir.z);
  vec2 hSun = vec2(sunDir.x, sunDir.z);
  float lenDir = length(hDir);
  float lenSun = length(hSun);
  // Longitude is undefined looking along the pole, and undefined for an
  // observer sitting on the pole axis. The lattice is lambda-independent
  // at the pole by construction, so 0.0 is a safe degenerate value.
  float cosDLambda = 1.0;
  if (lenDir > 1e-6 && lenSun > 1e-6) {
    cosDLambda = clamp(dot(hDir, hSun) / (lenDir * lenSun), -1.0, 1.0);
  }
  lambdaDeg = degrees(acos(cosDLambda));
}

float zodiacalBrightness(float betaDeg, float lambdaDeg) {
  // The dust cloud is symmetric about the ecliptic, so the lattice
  // stores |beta| only. Both axes clamp at the lattice edge, which the
  // ClampToEdge sampler would do anyway; doing it here keeps the texel
  // -centre offset below exact.
  vec2 deg = vec2(
    clamp(lambdaDeg, 0.0, ZODIACAL_LAMBDA_MAX_DEG),
    clamp(abs(betaDeg), 0.0, ZODIACAL_BETA_MAX_DEG)
  );
  // Lattice cell (i, j) holds the value at exactly (i, j) * step, and a
  // LinearFilter fetch returns it at uv = (index + 0.5) / size.
  vec2 uv = (deg / ZODIACAL_STEP_DEG + 0.5) / ZODIACAL_LUT_SIZE;
  float s10 = texture2D(u_zodiacalLut, uv).r;

  // Dim outward of 1 AU (Dumont R^-2.5); hold flat inward of it. Table 16
  // was measured FROM 1 AU only, and the calibration above has no headroom
  // to extrapolate that law toward the Sun (an unclamped floor of 0.1 AU
  // used to multiply the already-3.26x-over-gate inner band by a further
  // ~316x -- the reported near-Sun whiteout). Real inward brightening
  // exists (Helios: ~R^-2.3..-2.5 to 0.3 AU) but is deliberately NOT
  // reproduced past this bound -- see zodiacalHeliocentricFactor() in
  // zodiacalLightLut.ts for the full arithmetic and rationale.
  float r = max(u_cameraR_AU, ZODIACAL_REFERENCE_R_AU) / ZODIACAL_REFERENCE_R_AU;
  return s10 * pow(r, -ZODIACAL_R_EXPONENT) * ZODIACAL_S10_TO_LINEAR * u_brightnessMul;
}
`;
