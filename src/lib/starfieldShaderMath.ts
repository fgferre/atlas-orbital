/**
 * Pure-TypeScript mirrors of the star point-spread math that ships in
 * `src/components/canvas/Starfield.tsx`. The shader is authoritative;
 * this file exists so the math has an executable shape unit tests can
 * pin, and so `lightRegistry.ts` can share the colour pipeline.
 *
 * ## θ.2 (2026-07-28) — what changed and why
 *
 * The previous renderer was a port of Gaia Sky's `star.group.quad`
 * pair: `solidAngle = a_size / dist`, opacity through a smoothstep
 * `lint`, a quad clamped into `[u_minQuadSolidAngle, 3e-8]`, and a
 * baked 64×64 Gaussian sprite sampled with a razor-thin additive core.
 * Three measured defects retired it:
 *
 *  1. **Every star was the same size.** `u_minQuadSolidAngle` floors
 *     the quad at 3.7546 px — resolution-invariantly, because the
 *     floor scales as `1440/H` and pixels-per-radian scales as `H`, so
 *     the two cancel exactly. 97.5 % of renderable stars in
 *     `hyg-v1-full.bin` sat on that floor. Magnitude survived only as
 *     a grey level, and the grey level is the axis the display has
 *     least of (see the black-point note below), so the sky read flat.
 *  2. **The sprite shimmered.** The baked σ=10-texel Gaussian was
 *     minified 17.05× onto that 3.75 px quad with `LinearFilter` and
 *     no mipmaps, giving an on-screen σ of 0.587 px. Sampled at pixel
 *     centres, the peak swung **105.7 %** as a star crossed sub-pixel
 *     phases. On top of that the `smoothstep(0.0, 0.04, r)` core term
 *     was 0.075 px in radius — it fired on 1.77 % of phases and, for
 *     stars fainter than mag 7 (the catalog median is 8.40), very
 *     nearly **doubled** the star's total flux for one frame.
 *  3. **Colour was double-encoded.** `gaiaBvToRgb` ends in an OETF, so
 *     the attribute was display-referred, and it was written into the
 *     composer's LINEAR HalfFloat buffer, which `postprocessing`
 *     encodes again at `ENCODE_OUTPUT`. Worse, that OETF used
 *     `a = 0.5` where sRGB is `a = 0.055`; a piecewise
 *     `(1+a)·x^(1/2.4) − a` over `12.92·x` with a 0.0031308 knee is
 *     continuous **only** at `a = 0.055`, so the curve had a step in
 *     it. `src/lib/stellarColor.ts` already had the constant right,
 *     citing IEC 61966-2-1 — this module contradicted its own sibling.
 *
 * θ.2 replaces all of it with the standard real-time treatment of a
 * sub-pixel point source (Stellarium's `StelSkyDrawer`, Celestia's
 * star renderer, and Schneegans/Kreskowski/Gerndt, *Smaller than
 * Pixels: Rendering Millions of Stars in Real-Time*, EG 2025 all build
 * on the same two ideas):
 *
 *  - **Pogson photometry.** Per star we upload a luminosity proxy
 *    `10^(-0.4·M)`; the vertex divides by the LIVE squared distance to
 *    get apparent flux. Approaching a star brightens it as the inverse
 *    square, for free and for the right reason.
 *  - **A flux-conserving, pixel-INTEGRATED PSF.** The fragment does
 *    not point-sample a profile — it integrates a Gaussian over the
 *    fragment analytically, which for a separable Gaussian is a
 *    product of two `erf` differences. Energy is conserved by
 *    construction at any σ, and the per-pixel contribution is a
 *    C-infinity function of the star's sub-pixel position, which is
 *    what actually removes the shimmer.
 *
 * ## The display black point, and why size carries magnitude
 *
 * `config/visualPresets.ts` grades every context through
 * `BrightnessContrast` with `contrast ≈ 0.33`, and `postprocessing`
 * implements that as `(x + brightness − 0.5)/(1 − contrast) + 0.5` on
 * the LINEAR buffer. That puts a hard black point at
 * `0.5·(1 − contrast) ≈ 0.165` and gives roughly **2 magnitudes** of
 * usable core range between "invisible" and "clipped white". Measured
 * A/B on a settled boot frame: lit-pixel fraction 6.62 % with the
 * grade, 16.33 % with `contrastDelta: -0.33`.
 *
 * That is not something the star shader can or should fight — the same
 * contrast is what keeps the asteroid/Kuiper diffuse haze out of the
 * black. The consequence is a design constraint, not a bug to route
 * around: **grey level cannot encode magnitude, so size must.** Above
 * the point where the core clips to display white, the surplus flux is
 * moved into a bounded glare lobe whose radius has a closed form, so
 * brighter stars get visibly larger rather than merely whiter. That is
 * both what a camera does and what the eye does, and it is the axis
 * the previous renderer had none of.
 */

// -----------------------------------------------------------------------------
// Colour: B−V → chromaticity → linear RGB
// -----------------------------------------------------------------------------

export type Rgb = readonly [number, number, number];

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(Math.max(value, lo), hi);

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Gaia Sky `ColorUtils.BVtoRGB` port. B−V → effective temperature with
 * Ballesteros, then to xyY, XYZ, and gamma-corrected sRGB, finally
 * normalised by `max(1, maxChannel)`.
 *
 * Returns a **display-referred** (sRGB-encoded) triple, which is what
 * the Gaia chain and `lightRegistry`'s LDR consumer both want. The
 * starfield needs scene-referred values and goes through
 * `starLinearRgbFromBv` instead.
 */
export const gaiaBvToRgb = (bv: number): Rgb => {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));

  let x = 0;
  let y = 0;

  if (t >= 1667 && t <= 4000) {
    x =
      -0.2661239e9 / (t * t * t) +
      -0.234358e6 / (t * t) +
      0.8776956e3 / t +
      0.17991;
  } else if (t > 4000 && t <= 25000) {
    x =
      -3.0258469e9 / (t * t * t) +
      2.1070379e6 / (t * t) +
      0.2226347e3 / t +
      0.24039;
  }

  if (t >= 1667 && t <= 2222) {
    y =
      -1.1063814 * x * x * x - 1.3481102 * x * x + 2.18555832 * x - 0.20219683;
  } else if (t > 2222 && t <= 4000) {
    y =
      -0.9549476 * x * x * x - 1.37418593 * x * x + 2.09137015 * x - 0.16748867;
  } else if (t > 4000 && t <= 25000) {
    y = 3.081758 * x * x * x - 5.8733867 * x * x + 3.75112997 * x - 0.37001483;
  }

  const Y = y === 0 ? 0 : 1;
  const X = y === 0 ? 0 : (x * Y) / y;
  const Z = y === 0 ? 0 : ((1 - x - y) * Y) / y;

  const r = linearToSrgb(3.2406 * X - 1.5372 * Y - 0.4986 * Z);
  const g = linearToSrgb(-0.9689 * X + 1.8758 * Y + 0.0415 * Z);
  const b = linearToSrgb(0.0557 * X - 0.204 * Y + 1.057 * Z);
  const maxChannel = Math.max(1, r, g, b);

  return [
    Math.max(r / maxChannel, 0),
    Math.max(g / maxChannel, 0),
    Math.max(b / maxChannel, 0),
  ];
};

/**
 * sRGB OETF (IEC 61966-2-1). Was written with `a = 0.5` before θ.2,
 * which is not a transcription of any standard: the piecewise function
 * `(1+a)·x^(1/2.4) − a` over `12.92·x` is continuous at the 0.0031308
 * knee only for `a = 0.055` (12.92 × 0.0031308 = 0.040450, and the
 * power branch returns 0.040450 at a = 0.055 versus −0.364289 at
 * a = 0.5). `src/lib/stellarColor.ts:41-46` already used the correct
 * constants for the inverse transfer, so the two modules disagreed.
 */
export const SRGB_OETF_ALPHA = 0.055;

const linearToSrgb = (linear: number): number => {
  if (linear <= 0.0031308) {
    return 12.92 * linear;
  }
  return (1 + SRGB_OETF_ALPHA) * Math.pow(linear, 1 / 2.4) - SRGB_OETF_ALPHA;
};

/** sRGB EOTF — inverse of {@link linearToSrgb}. */
const srgbToLinear = (encoded: number): number => {
  if (encoded <= 0.04045) {
    return encoded / 12.92;
  }
  return Math.pow((encoded + SRGB_OETF_ALPHA) / (1 + SRGB_OETF_ALPHA), 2.4);
};

export const GAIA_STAR_COLOR_SATURATION = 0.16;

/**
 * Gaia Sky `ParticleUtils.saturateColor` equivalent for non-highlighted
 * stars: RGB → HSV, add `scene.star.saturate` to S, clamp, back to RGB.
 *
 * Operates in the DISPLAY domain, which is where Gaia defines it and
 * where a saturation lift behaves the way an artist expects. That is
 * why `starLinearRgbFromBv` encodes, saturates, then decodes rather
 * than saturating linear values.
 */
export const saturateStarRgb = (
  rgb: Rgb,
  amount = GAIA_STAR_COLOR_SATURATION
): Rgb => {
  const [h, s, v] = rgbToHsv(rgb);
  return hsvToRgb(h, clamp(s + amount, 0, 1), v);
};

const rgbToHsv = ([r, g, b]: Rgb): Rgb => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h /= 6;
    if (h < 0) h += 1;
  }

  return [h, max === 0 ? 0 : delta / max, max];
};

const hsvToRgb = (h: number, s: number, v: number): Rgb => {
  if (s === 0) return [v, v, v];
  const sector = h * 6;
  const i = Math.floor(sector);
  const f = sector - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));

  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
};

/**
 * Scene-referred (LINEAR) star colour for the instanced `starColor`
 * attribute.
 *
 * The chromaticity chain and the +0.16 HSV saturation lift both stay
 * exactly where Gaia defines them — in the display domain — and the
 * result is decoded once so the value written to the vertex buffer is
 * linear. The renderer then applies exactly one OETF, via
 * `#include <colorspace_fragment>`, which resolves to identity when
 * rendering into the composer's linear target and to the sRGB transfer
 * when the constrained tier's `DirectRenderPass` draws straight to the
 * canvas. Both tiers land on the same pixel; before θ.2 they did not
 * (an A0 star was `(192,219,255)` on ultra and `(140,166,244)` on
 * constrained).
 *
 * Normalised so the largest channel is 1.0: brightness is carried by
 * the photometry, never by the colour.
 */
export const starLinearRgbFromBv = (bv: number): Rgb => {
  const display = saturateStarRgb(gaiaBvToRgb(bv));
  const linear: [number, number, number] = [
    srgbToLinear(display[0]),
    srgbToLinear(display[1]),
    srgbToLinear(display[2]),
  ];
  const max = Math.max(linear[0], linear[1], linear[2], 1e-6);
  return [linear[0] / max, linear[1] / max, linear[2] / max];
};

/**
 * The catalog stores B−V quantised into a `uint8` (`hygBinary.ts`
 * `ci = ciQ * 0.01 - 0.5`), so the colour pipeline has exactly 256
 * distinct inputs no matter how many stars are loaded. Before θ.2 the
 * geometry build ran the full Ballesteros → CIE → sRGB → HSV → RGB
 * chain once per star: 109 400 evaluations and ~328 000 short-lived
 * arrays for 256 distinct answers, measured at ~63 ms of the ~114 ms
 * synchronous `useMemo`.
 *
 * Returns a flat `Float32Array(256 * 3)` indexed by the quantised
 * value, i.e. `lut[ciQ * 3 + channel]`.
 */
export const buildBvLinearRgbLut = (
  ciOffset: number,
  ciStep: number
): Float32Array => {
  const lut = new Float32Array(256 * 3);
  for (let q = 0; q < 256; q++) {
    const rgb = starLinearRgbFromBv(q * ciStep + ciOffset);
    lut[q * 3 + 0] = rgb[0];
    lut[q * 3 + 1] = rgb[1];
    lut[q * 3 + 2] = rgb[2];
  }
  return lut;
};

// -----------------------------------------------------------------------------
// Photometry: Pogson magnitudes → linear flux → screen radiance
// -----------------------------------------------------------------------------

/**
 * Luminosity proxy uploaded per star: `10^(-0.4 · M)` for absolute
 * magnitude `M`. Dimensionless and Vega-normalised — the constant that
 * would turn it into W/m² is folded into the exposure, because the
 * renderer only ever needs ratios.
 */
export const luminosityProxyFromAbsMag = (absMag: number): number => {
  if (!Number.isFinite(absMag)) return 0;
  return Math.pow(10, -0.4 * absMag);
};

/**
 * Apparent flux at a live distance, in the same Vega-normalised units
 * as {@link luminosityProxyFromAbsMag}.
 *
 * From the distance modulus `m = M + 5·log10(d/10pc)`:
 *   `10^(-0.4m) = 10^(-0.4M) · (10/d)²`
 * so the factor is exactly 100/d² with `d` in parsecs. No fitted
 * constant — this is why flying toward a star brightens it correctly
 * instead of by a tuned curve.
 */
export const apparentFluxFromLuminosity = (
  luminosityProxy: number,
  distancePc: number
): number => {
  const d2 = Math.max(distancePc * distancePc, 1e-12);
  return (luminosityProxy * 100) / d2;
};

/**
 * Display black point of the graded pipeline, in LINEAR radiance.
 *
 * `postprocessing`'s BrightnessContrast is
 * `(x + brightness − 0.5)/(1 − contrast) + 0.5`, so with the
 * `DEEP_SPACE` preset's `contrast = 0.33` and `brightness = 0` every
 * linear value below `0.5 · (1 − 0.33)` maps to a negative number and
 * clips to black. Everything about the exposure calibration below is
 * anchored to this number; if the grade is ever retuned, the star
 * field's faint limit moves with it and this constant is the single
 * place to follow.
 *
 * The constrained tier renders without the composer and therefore
 * without the grade, so its effective black point is 0 and it shows
 * MORE faint stars, not fewer. That asymmetry is deliberate and
 * harmless: it degrades toward showing more of the catalog, never less.
 */
export const STAR_DISPLAY_BLACK_POINT = 0.165;

/**
 * Apparent magnitude that lands exactly on the display black point.
 * Stars fainter than this are still drawn — their radiance is real, and
 * the ungraded constrained tier shows them — but the graded tiers clip
 * them to black.
 *
 * This is the one number that decides how the sky reads, because the
 * grade leaves only ~2 magnitudes between "invisible" and "clipped
 * white". Placing it at 10.5 (below the full tier's 8.40 median) put
 * more than half the catalog above threshold and, since the usable
 * range is so narrow, saturated nearly all of it: measured 18.0 % lit
 * pixels against 6.6 % before, with the field reading as a wall of
 * white blobs rather than a sky.
 *
 * 8.0 keeps roughly 30 000 stars above threshold sky-wide — about
 * 2 200 in a 45° frustum, a dense field — while putting saturation
 * (and therefore the glare lobe, and therefore the visible size
 * hierarchy) at magnitude ≈ 6, the naked-eye limit. Everything the eye
 * would call "a bright star" grows; everything below it stays a point.
 */
export const STAR_THRESHOLD_MAGNITUDE = 8.0;

/**
 * Standard deviation of the display point-spread function, in PHYSICAL
 * pixels (device pixels, not CSS pixels — aliasing happens on the
 * device grid, so that is where the band limit belongs).
 *
 * σ trades sharpness against temporal stability. Measured peak swing as
 * a star crosses sub-pixel phases, with the pixel-integrated Gaussian
 * below: 70 % at σ = 0.60, 53 % at σ = 0.70, 31 % at σ = 0.90, 18 % at
 * σ = 1.20 — against **106 %** for the retired baked sprite, which
 * additionally carried a 0-to-clipped-white core spike on 1.8 % of
 * phases.
 *
 * θ.2 first shipped 0.95, chasing the low end of that swing, and it was
 * the wrong trade: the owner's first look reported the field had lost
 * resolution and faint stars read as small blocks. That is what a wide
 * σ does — it spreads a faint star's flux across four pixels of nearly
 * equal weight (0.27 / 0.19 / 0.19 / 0.13 at σ = 0.95), and once the
 * display grade crushes the shoulder those four land at similar values
 * and read as a square. At 0.62 the centre pixel takes ~0.42 and its
 * neighbours ~0.12, which reads as a point.
 *
 * 0.62 also lands next to the retired renderer's effective on-screen
 * σ of 0.587 px, so sharpness is preserved rather than traded away.
 * The residual swing is higher than 0.95 would give, but it is now
 * pure redistribution between neighbouring pixels: total flux is
 * invariant to sub-pixel phase by construction, and there is no core
 * spike. The old path could claim neither.
 */
export const STAR_PSF_SIGMA_PX = 0.62;

/**
 * Quad half-extent for the core lobe, in units of σ. At 2.8σ a
 * separable Gaussian keeps `erf(2.8/√2)² = 99.0 %` of its energy
 * inside the quad; {@link CORE_TRUNCATION_NORMALISATION} divides that
 * back out so the drawn total is exactly the star's flux and the quad
 * boundary carries no step.
 */
export const STAR_PSF_QUAD_SIGMAS = 2.8;

/** Peak of a unit-flux 2D Gaussian: `1 / (2πσ²)`. */
export const gaussianPeak = (sigmaPx: number): number =>
  1 / (2 * Math.PI * sigmaPx * sigmaPx);

/**
 * How far below the display black point a lobe must fall before the
 * quad may stop drawing it. 1/64 puts the truncated value around 8-bit
 * 11 on the ungraded tier and far below anything on the graded ones.
 */
export const STAR_QUAD_CUTOFF_FRACTION = 1 / 64;

/**
 * Half-extent the core lobe needs, in pixels, for a star of the given
 * peak.
 *
 * A FIXED multiple of σ is wrong, and this is the bug the owner caught
 * on first look: a Gaussian truncated at 2.8σ still carries 2 % of its
 * peak there, which for a bright star is far above display white, so
 * the quad's edge rasterised as a hard bright SQUARE around the star.
 * The radius has to follow the brightness — solving
 * `peak · exp(-r²/2σ²) = cutoff` costs one `log` and one `sqrt`, and
 * it grows only as `sqrt(ln peak)`, so even Sirius needs about 5.3 σ.
 */
export const coreQuadHalfExtentPx = (
  corePeak: number,
  sigmaPx = STAR_PSF_SIGMA_PX,
  blackPoint = STAR_DISPLAY_BLACK_POINT
): number => {
  const floor = STAR_PSF_QUAD_SIGMAS * sigmaPx;
  const cutoff = blackPoint * STAR_QUAD_CUTOFF_FRACTION;
  if (!(corePeak > cutoff)) return floor;
  return Math.max(floor, sigmaPx * Math.sqrt(2 * Math.log(corePeak / cutoff)));
};

/**
 * Fraction of the quad's outer edge over which every lobe is faded to
 * zero.
 *
 * Sizing a quad to where a profile "becomes invisible" still leaves a
 * step of exactly that size at the boundary, and whether it reads as a
 * square depends on the tier's grade — which is not a thing to leave to
 * chance. Multiplying by a window that reaches exactly zero at the edge
 * removes the discontinuity outright, for any profile and any tier, at
 * the cost of one `smoothstep`. The energy it removes sits inside the
 * outermost 15 % of an already-generous quad.
 */
export const STAR_QUAD_EDGE_WINDOW = 0.85;

/** Edge window: 1 across the interior, easing to 0 at the quad edge. */
export const starQuadEdgeWindow = (
  radiusPx: number,
  quadHalfExtentPx: number
): number => {
  if (quadHalfExtentPx <= 0) return 0;
  const t = radiusPx / quadHalfExtentPx;
  return 1 - smoothstep(STAR_QUAD_EDGE_WINDOW, 1, t);
};

/**
 * Exposure scalar mapping Vega-normalised flux to linear screen
 * radiance, derived — not tuned — from the two constants above:
 * the peak pixel of a star at {@link STAR_THRESHOLD_MAGNITUDE} equals
 * {@link STAR_DISPLAY_BLACK_POINT}.
 */
export const starExposure = (
  sigmaPx = STAR_PSF_SIGMA_PX,
  thresholdMagnitude = STAR_THRESHOLD_MAGNITUDE,
  blackPoint = STAR_DISPLAY_BLACK_POINT
): number =>
  (blackPoint / gaussianPeak(sigmaPx)) * Math.pow(10, 0.4 * thresholdMagnitude);

/**
 * `erf` via Abramowitz & Stegun 7.1.26 — one `exp`, no branching,
 * |ε| < 1.5e-7. The GLSL side uses the identical rational form so the
 * mirror is exact rather than approximate.
 */
export const erfApprox = (x: number): number => {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
};

const INV_SQRT2 = Math.SQRT1_2;

/**
 * Fraction of a unit-volume 2D Gaussian that falls inside ONE pixel,
 * where `(qx, qy)` is the pixel centre's offset from the star centre in
 * pixels.
 *
 * This is the whole antialiasing argument. A star is a delta function,
 * so no post-process filter can rescue it — the signal has to be band
 * limited at raster time. Point-sampling a profile (what the retired
 * baked sprite did) leaves the sampled value a function of where the
 * pixel grid happens to fall; integrating it analytically does not.
 * Summed over every pixel this returns exactly 1 for any σ, so the
 * star's total contribution is invariant to its sub-pixel position and
 * to σ itself.
 */
export const gaussianPixelCoverage = (
  qx: number,
  qy: number,
  sigmaPx: number
): number => {
  const k = INV_SQRT2 / sigmaPx;
  const cx = 0.5 * (erfApprox((qx + 0.5) * k) - erfApprox((qx - 0.5) * k));
  const cy = 0.5 * (erfApprox((qy + 0.5) * k) - erfApprox((qy - 0.5) * k));
  return cx * cy;
};

/**
 * Reciprocal of the Gaussian mass enclosed by the `±STAR_PSF_QUAD_SIGMAS·σ`
 * quad. Multiplying the coverage by this makes the truncated splat
 * integrate to exactly 1, so truncation costs no energy and leaves no
 * visible edge.
 */
export const CORE_TRUNCATION_NORMALISATION =
  1 / Math.pow(erfApprox(STAR_PSF_QUAD_SIGMAS * INV_SQRT2), 2);

// -----------------------------------------------------------------------------
// Glare: where the magnitude range actually lives
// -----------------------------------------------------------------------------

/**
 * Fraction of a saturating star's flux moved from the core into the
 * glare lobe. Subtracted from the core rather than added on top, so
 * total rendered flux stays equal to the star's flux and relative
 * photometry between stars is untouched.
 */
export const STAR_GLARE_FRACTION = 0.35;

/**
 * Inner scale of the glare lobe, in physical pixels. Sets how compact
 * the halo's bright centre is; the falloff beyond it is `r⁻³`.
 */
export const STAR_GLARE_CORE_PX = 1.5;

/**
 * `r⁻³` glare profile, normalised so `∫ G(r) · 2πr dr = 1` over the
 * plane:  `G(r) = r0 / (2π · (r² + r0²)^{3/2})`.
 *
 * The exponent is not a look choice. Spencer, Shirley, Zimmerman &
 * Greenberg, *Physically-Based Glare Effects for Digital Images*
 * (SIGGRAPH 1995) decompose the photopic point-source response of the
 * eye into three lobes, and the dominant one — the ciliary corona,
 * weight 0.478 — goes as `(θ + 0.02)⁻³`. A `r⁻²` veiling term (Vos
 * 2003) is closer to the CIE glare equation but is not integrable in
 * 2D without an outer cutoff, which would put an arbitrary constant
 * where this form needs none.
 *
 * This is an OBSERVER artefact, not light from the star, and is
 * disclosed as such in the Credits panel. It is also the only reason
 * the renderer can express more than ~2 magnitudes of range against a
 * display black point at {@link STAR_DISPLAY_BLACK_POINT}.
 */
export const glareProfile = (r: number, r0 = STAR_GLARE_CORE_PX): number => {
  const denom = Math.pow(r * r + r0 * r0, 1.5);
  return r0 / (2 * Math.PI * denom);
};

/**
 * Flux carried by the glare lobe. Ramps in with `smoothstep(1, 4)` on
 * the core's peak so the lobe is exactly zero until the core actually
 * clips to display white and cannot express any more brightness — the
 * gate is the physical event, not a tuned magnitude cut.
 */
export const glareFlux = (
  fluxScreen: number,
  corePeak: number,
  fraction = STAR_GLARE_FRACTION
): number => fluxScreen * fraction * smoothstep(1, 4, corePeak);

/**
 * Radius, in pixels, at which the glare lobe drops to the display
 * black point — i.e. exactly as far as it can still be seen.
 *
 * Solving `haloFlux · G(r) = blackPoint` for r is closed form, which
 * matters: the vertex shader can size the quad to the visible extent
 * with one `pow` and one `sqrt` instead of guessing a bound. Returns 0
 * when the lobe is invisible, so faint stars keep the small core quad
 * and cost nothing. Measured on `hyg-v1-full.bin`, only stars brighter
 * than mag ≈ 5 (about 1 600 of 109 400) grow past the core quad at all.
 */
export const glareVisibleRadiusPx = (
  haloFlux: number,
  r0 = STAR_GLARE_CORE_PX,
  blackPoint = STAR_DISPLAY_BLACK_POINT
): number => {
  if (haloFlux <= 0) return 0;
  const scaled = (haloFlux * r0) / (2 * Math.PI * blackPoint);
  const r2 = Math.pow(scaled, 2 / 3) - r0 * r0;
  return r2 <= 0 ? 0 : Math.sqrt(r2);
};

/**
 * Largest angular footprint a single star may occupy, as a fraction of
 * the smaller viewport dimension.
 *
 * The inverse square is unbounded and the camera can fly to a star: at
 * LEN0 the flux is ~2×10⁸ times its value at 10 pc, and the glare radius
 * grows as its cube root, so without a ceiling the sprite swells past
 * the whole viewport before the procedural mesh takes over. The first
 * θ.2 build shipped exactly that — the star filled the screen white and
 * then popped to a small procedural mesh when the cross-fade completed.
 * The Gaia port this replaced was implicitly bounded by its `3e-8`
 * solid-angle ceiling; dropping that clamp without replacing it was the
 * bug.
 *
 * Capping the FOOTPRINT rather than the flux keeps the limit stated in
 * the units that matter, and {@link maxFluxScreenForViewport} inverts it
 * into the flux ceiling the shader actually applies.
 */
export const STAR_MAX_FOOTPRINT_FRACTION = 0.05;

/**
 * Flux ceiling that keeps a star's glare inside
 * {@link STAR_MAX_FOOTPRINT_FRACTION} of the viewport. Inverts
 * {@link glareVisibleRadiusPx}.
 */
export const maxFluxScreenForViewport = (
  minViewportPx: number,
  glareFraction = STAR_GLARE_FRACTION,
  r0 = STAR_GLARE_CORE_PX,
  blackPoint = STAR_DISPLAY_BLACK_POINT
): number => {
  const maxRadius = Math.max(
    minViewportPx * STAR_MAX_FOOTPRINT_FRACTION,
    r0 * 2
  );
  const scaled = Math.pow(maxRadius * maxRadius + r0 * r0, 1.5);
  return (scaled * 2 * Math.PI * blackPoint) / (r0 * glareFraction);
};

export interface StarSplatInputs {
  /** `10^(-0.4·M)`, from {@link luminosityProxyFromAbsMag}. */
  luminosityProxy: number;
  /** Live camera→star distance in parsecs. */
  distancePc: number;
  /** {@link starExposure}; injectable so tests can pin the derivation. */
  exposure?: number;
  sigmaPx?: number;
  glareFraction?: number;
  /** Extra multiplier for the near-camera fade / mesh cross-fade. */
  attenuation?: number;
}

export interface StarSplatMetrics {
  /** Vega-normalised apparent flux. */
  flux: number;
  /** Linear screen radiance integrated over the whole splat. */
  fluxScreen: number;
  /** Peak pixel value of the core lobe, in linear radiance. */
  corePeak: number;
  /** Radiance moved into the glare lobe. */
  haloFlux: number;
  /** Visible glare radius in physical pixels; 0 when there is none. */
  haloRadiusPx: number;
  /** Half-extent the core lobe alone needs, in physical pixels. */
  coreRadiusPx: number;
  /** Half-extent of the drawn quad in physical pixels. */
  quadHalfExtentPx: number;
}

/**
 * Pure-TS mirror of the θ.2 vertex stage. Same order of operations as
 * the GLSL so a divergence shows up as a numeric difference rather
 * than as a look someone has to notice.
 */
export const starSplatMetrics = (input: StarSplatInputs): StarSplatMetrics => {
  const sigmaPx = input.sigmaPx ?? STAR_PSF_SIGMA_PX;
  const exposure = input.exposure ?? starExposure(sigmaPx);
  const attenuation = input.attenuation ?? 1;

  const flux = apparentFluxFromLuminosity(
    input.luminosityProxy,
    input.distancePc
  );
  const fluxScreen = flux * exposure * attenuation;
  const corePeak = fluxScreen * gaussianPeak(sigmaPx);
  const haloFlux = glareFlux(fluxScreen, corePeak, input.glareFraction);
  const haloRadiusPx = glareVisibleRadiusPx(haloFlux);
  const coreQuad = coreQuadHalfExtentPx(corePeak, sigmaPx);

  return {
    flux,
    fluxScreen,
    corePeak,
    haloFlux,
    haloRadiusPx,
    coreRadiusPx: coreQuad,
    quadHalfExtentPx: Math.max(coreQuad, haloRadiusPx),
  };
};

// -----------------------------------------------------------------------------
// Optics profile (diffraction spikes)
// -----------------------------------------------------------------------------

/**
 * Spikes are the Fourier transform of whatever obstructs the aperture,
 * so the COUNT is real, checkable geometry: N struts give N spikes for
 * even N (opposite pairs overlap) and 2N for odd N; JWST's hexagonal
 * segments give 6 plus 2 fainter ones from the secondary strut.
 *
 * A star has no spikes. They belong to an instrument, and rendering
 * them unlabelled in a tool that claims measured fidelity would teach
 * a false fact — the same category of error the "not to scale" toggle
 * exists to prevent. So the profile is a named, user-chosen setting
 * that defaults to `none` (unaided eye), and the Credits panel states
 * which aperture is being simulated. Chosen that way it stops being a
 * liability and becomes the one part of the glow a user can reason
 * about.
 */
export type StarOpticsProfile = "none" | "newtonian" | "jwst" | "cinema";

export interface StarOpticsParams {
  /** Number of angular lobes; 0 disables the branch entirely. */
  spikeCount: number;
  /** Exponent on `|cos(n·φ/2)|`; higher is a thinner spike. */
  sharpness: number;
  /** Peak spike intensity relative to the glare lobe. */
  gain: number;
}

export const STAR_OPTICS_PARAMS: Record<StarOpticsProfile, StarOpticsParams> = {
  /** Unaided eye / unobstructed aperture — no spikes exist. */
  none: { spikeCount: 0, sharpness: 0, gain: 0 },
  /** Four-vane secondary spider: the classic reflector cross. */
  newtonian: { spikeCount: 4, sharpness: 26, gain: 0.55 },
  /** Hexagonal segmented primary — the six-spike signature. */
  jwst: { spikeCount: 6, sharpness: 30, gain: 0.5 },
  /** Eight-blade iris — a lens artefact, not a telescope one. */
  cinema: { spikeCount: 8, sharpness: 34, gain: 0.4 },
};

/**
 * Radius, in pixels, at which a spike drops to the display black point.
 *
 * Far-field diffraction along a spike falls as `r⁻²`, slower than the
 * halo's `r⁻³`, so spikes stay visible three to four times further out.
 * Sizing the quad by scaling the halo radius by a guessed factor clips
 * them square at the boundary; this is the closed form instead.
 */
export const spikeVisibleRadiusPx = (
  haloFlux: number,
  gain: number,
  r0 = STAR_GLARE_CORE_PX,
  blackPoint = STAR_DISPLAY_BLACK_POINT
): number => {
  if (haloFlux <= 0 || gain <= 0) return 0;
  return r0 * Math.sqrt((haloFlux * gain) / (2 * Math.PI * blackPoint));
};

// -----------------------------------------------------------------------------
// Near-camera handoff (unchanged from θ.1b) + projection helpers
// -----------------------------------------------------------------------------

// LEN0 controls the near-camera fade-out: stars inside LEN0 (in
// scene-space dist) fade to invisibility; stars between LEN0 and
// LEN0×1e3 ramp in via smoothstep. Inside LEN0 the θ.7 hero-star
// billboard / procedural mesh takes over.
//
// Gaia Sky declares `#define LEN0 20000.0` in
// `star.group.quad.vertex.glsl:59`, expressed in Gaia's INTERNAL
// UNITS, where 1 pc = PC_TO_M × ORIGINAL_M_TO_U = 3.0857e16 × 1e-9
// = 3.0857e7 internal_u. So Gaia's LEN0 is 20000 / 3.0857e7 ≈
// 6.48e-4 pc ≈ 134 AU. Atlas uses 1 pc = 206_265_000 scene_u, so the
// same PHYSICAL threshold needs the unit-convention ratio applied.
export const GAIA_LEN0_INTERNAL_UNITS = 20000.0;
export const GAIA_INTERNAL_UNITS_PER_PC = 3.0857e16 * 1e-9; // ≈ 3.0857e7
export const ATLAS_SCENE_UNITS_PER_PC = 206_265_000.0;
export const LEN0 =
  GAIA_LEN0_INTERNAL_UNITS *
  (ATLAS_SCENE_UNITS_PER_PC / GAIA_INTERNAL_UNITS_PER_PC);

/**
 * Near-camera boundary fade. 0 at `dist = LEN0`, 1 at `LEN0 × 1000`.
 * The focused star bypasses it so the sprite stays alive across the
 * whole `LEN0 → mesh ENTER` band; see `HygStellarMesh` for the
 * cross-fade contract this participates in.
 */
export const starBoundaryFade = (dist: number, focused: boolean): number =>
  focused ? 1 : smoothstep(LEN0, LEN0 * 1000, dist);

// Gaia Sky's solid-angle band. The star sprites no longer use it after
// θ.2, but `lightRegistry.ts` still ranks and gates its LightGlow
// lights by clamped solid angle, so the two constants stay here rather
// than being duplicated into that module.
export const MAX_QUAD_SOLID_ANGLE_LITERAL = 3.0e-8;
export const U_MIN_QUAD_SOLID_ANGLE_1440P_BASELINE = 1.8e-9;

/**
 * Resolution-adaptive minimum solid angle — Gaia Sky's
 * `updateMinQuadSolidAngle` (`StarSetQuadComponent.java:68`).
 * `backBufferHeight` is the render-buffer height in physical pixels.
 */
export const computeMinQuadSolidAngle = (backBufferHeight: number): number => {
  const h = Math.max(backBufferHeight, 1);
  return (U_MIN_QUAD_SOLID_ANGLE_1440P_BASELINE * 1440) / h;
};

/**
 * Pixels-per-radian at unit distance for a perspective projection.
 * `projMatrix11 = cot(fovY/2)` as it appears at `projectionMatrix[1][1]`
 * in three.js; `viewportHeight` is in physical pixels.
 */
export const computePixelsPerRadian = (
  projMatrix11: number,
  viewportHeight: number
): number => {
  return projMatrix11 * viewportHeight * 0.5;
};

/**
 * Render-buffer height in physical pixels, from the CSS-pixel canvas
 * height and the renderer's clamped DPR (`gl.getPixelRatio()`, which
 * already has `qualityProfile.dprMax` applied).
 */
export const computeViewportHeightScalar = (
  canvasHeightCss: number,
  rendererDpr: number
): number => {
  return Math.max(canvasHeightCss, 0) * Math.max(rendererDpr, 0);
};
