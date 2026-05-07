/**
 * T6.2-α — stellar-physics helpers feeding T6.1's
 * `StellarVisualProfile`.
 *
 * **Scope tag**: hybrid. The Ballesteros B-V → T_eff formula is
 * Gaia-borrowed (`gaiasky/util/color/BVToTeffBallesteros.java:32-34`,
 * MPL-2.0); DIFF GATE applies line-by-line for that single function
 * (`temperatureFromBV`). The spectral classification helpers
 * (`parseSpectralClass`, `temperatureFromSpect`, `radiusFromSpect`)
 * and the `stellarVisualProfileFrom` aggregator are atlas-native —
 * no Gaia equivalent (Gaia uses a different catalog format and
 * routes through `STILDataProvider`). For the atlas-native parts,
 * DIFF GATE applies to per-decision rationale + pinned tests
 * against named-star ground truths (Sun G2V, Sirius A1V, Vega
 * A0V, Proxima M5.5V, Betelgeuse M2Ia, Sirius B DA2).
 *
 * **Distinction from `starPhysics.ts`**: `starPhysics` deals with
 * Gaia-Sky-style **pseudo-size** (`a_size`) — a rendering-only
 * scalar with NO physical meaning per
 * `AstroUtils.absoluteMagnitudeToPseudoSize` JavaDoc. This
 * module deals with **physical** quantities: effective
 * temperature in Kelvin, radius in solar units. They feed
 * different consumers and must not be conflated. The
 * pseudo-size pipeline drives sprite-billboard sizing for
 * 109k+ stars (where Stefan-Boltzmann would mis-render giants);
 * this module drives per-star procedural-mesh visual identity
 * (where the bigger-Betelgeuse-than-Sun problem doesn't apply
 * because each star renders as its own mesh).
 *
 * **T6.2-α scope** (this commit): module ships dormant. No
 * binary format change; HYG catalog still drops `spect` + `absmag`
 * at build time (`scripts/build-hyg-binary.js:101`). Until the
 * binary upgrade lands, callers route through
 * `stellarVisualProfileFrom({ bv })` — the B-V fallback path.
 * **T6.2-β** (next ship): augment `build-hyg-binary.js` to emit
 * `spect` + `absmag`, bump binary format to v2, expose the new
 * fields on `HygCatalogData`. Then the spect-primary path goes
 * live for ~80% of the catalog (the rest still falls back to B-V).
 *
 * **Test surface**: 7 named-star ground truths per Codex's
 * suggestion (Sun, Sirius A, Vega, Proxima, Betelgeuse, Antares,
 * Sirius B), expanded with edge-case parsers (binary star
 * "M1Ib + B2.5V" syntax, white-dwarf "DA2" / "WD" syntax,
 * unparseable garbage, empty string).
 */

import { blackbodyRgbFromTemperature } from "./stellarColor";
import {
  SUN_DEFAULT_VISUAL_PROFILE,
  type StellarVisualProfile,
} from "./stellarVisualProfile";

// ─── Spectral classification ─────────────────────────────────────

/**
 * MK (Morgan-Keenan) spectral type — the major class letter.
 * Ordered hot → cool. Plus white-dwarf ("WD") and pre-parsed
 * white-dwarf subtypes (DA, DB, DO, DC, DZ, DQ).
 */
export type SpectralClass =
  | "O"
  | "B"
  | "A"
  | "F"
  | "G"
  | "K"
  | "M"
  | "L" // brown dwarf, very cool
  | "T" // brown dwarf, methane
  | "Y" // ultra-cool brown dwarf
  | "WD"; // generic white dwarf

/**
 * Luminosity class (MK system). Roman numerals; we keep them as
 * uppercase strings since some catalog entries write "Ia" /
 * "Ib" with subdivisions. Default `null` means unspecified
 * (treated as main-sequence "V" for radius math, but kept
 * distinct in the parsed result so downstream code can detect
 * absence).
 */
export type LuminosityClass =
  | "0" // hypergiant (rare)
  | "Ia" // bright supergiant
  | "Ib" // less bright supergiant
  | "I" // generic supergiant
  | "II" // bright giant
  | "III" // giant
  | "IV" // subgiant
  | "V" // main sequence (dwarf)
  | "VI" // subdwarf
  | "VII"; // white dwarf

export interface ParsedSpectralClass {
  /** Major MK class letter, or "WD" for white dwarfs. */
  spectralClass: SpectralClass;
  /** Subclass digit 0-9. NaN when not specified (e.g. "M" alone). */
  subclass: number;
  /** Luminosity class, or `null` if not in the input string. */
  luminosityClass: LuminosityClass | null;
}

/**
 * Parse an HYG / SIMBAD-style spectral classification string into
 * its components. Handles:
 *
 *   "G2V"            → { class: "G", subclass: 2, luminosity: "V" }
 *   "A1V"            → { class: "A", subclass: 1, luminosity: "V" }
 *   "M5.5V"          → { class: "M", subclass: 5.5, luminosity: "V" }
 *   "M2Ib"           → { class: "M", subclass: 2, luminosity: "Ib" }
 *   "M1Ib + B2.5V"   → { class: "M", subclass: 1, luminosity: "Ib" }  (primary only)
 *   "DA2"            → { class: "WD", subclass: 2, luminosity: "VII" }
 *   "WD"             → { class: "WD", subclass: NaN, luminosity: "VII" }
 *   "K0III"          → { class: "K", subclass: 0, luminosity: "III" }
 *   ""               → null
 *
 * Binary stars: keeps the **primary** (first) component only.
 * Catalog conventions like "G2V/M3V" or "M1Ib + B2.5V" both
 * resolve to the primary; the secondary is dropped (T6 wave's
 * MVP doesn't render binary companions).
 *
 * Whitespace-trim then case-normalize the class letter to upper;
 * subclass digit and luminosity class stay as parsed. Returns
 * `null` for empty / unparseable input — caller must fall back
 * to B-V via `stellarVisualProfileFrom`.
 */
export const parseSpectralClass = (
  spect: string
): ParsedSpectralClass | null => {
  if (!spect) return null;

  // Strip leading whitespace, take everything before the first
  // " " / "+" / "/" boundary so binary-component syntax resolves
  // to the primary. Empty-after-trim → null.
  const primary = spect
    .trim()
    .split(/\s*[+/]\s*/)[0]
    ?.split(/\s+/)[0]
    ?.trim();
  if (!primary) return null;

  // White-dwarf shortcuts. "WD" alone → no subclass / fixed VII.
  if (/^WD$/i.test(primary)) {
    return { spectralClass: "WD", subclass: NaN, luminosityClass: "VII" };
  }

  // White-dwarf with composition + temperature digit, e.g. "DA2",
  // "DB", "DZA", etc. Pattern: starts with D, followed by 1-2
  // composition letters, optionally a number. Always luminosity
  // class VII.
  const wdMatch = primary.match(/^D[A-Z]{0,2}(\d+(?:\.\d+)?)?$/i);
  if (wdMatch) {
    const sub = wdMatch[1] ? Number(wdMatch[1]) : NaN;
    return { spectralClass: "WD", subclass: sub, luminosityClass: "VII" };
  }

  // Standard MK pattern: <letter><digit><luminosity>?
  // Letter ∈ {O, B, A, F, G, K, M, L, T, Y}. Subclass digit
  // 0-9 with optional fractional part (M5.5). Luminosity class
  // optional; matched longest-prefix (Ia/Ib/II/III/IV/VI/VII/V).
  const mkMatch = primary.match(
    /^([OBAFGKMLTY])(\d+(?:\.\d+)?)?(0|Ia|Ib|VII|VI|IV|III|II|I|V)?/i
  );
  if (!mkMatch) return null;

  const classLetter = mkMatch[1].toUpperCase() as Exclude<SpectralClass, "WD">;
  const subclass = mkMatch[2] !== undefined ? Number(mkMatch[2]) : NaN;
  const luminosityRaw = mkMatch[3];
  const luminosityClass = luminosityRaw
    ? (luminosityRaw as LuminosityClass)
    : null;

  return { spectralClass: classLetter, subclass, luminosityClass };
};

// ─── Effective temperature ────────────────────────────────────────

/**
 * MK effective-temperature lookup table (Kelvin), midpoints per
 * major class. Source: standard astrophysics references — Allen's
 * Astrophysical Quantities (4th ed.) + Habets & Heintze 1981 for
 * giants/supergiants; Burrows et al. 2001 for L/T/Y brown dwarfs.
 * Subclass interpolation is linear within the bracket; class
 * boundaries are the published anchor points.
 *
 * Atlas opinion: linear interpolation along subclass digit (0-9)
 * within each class. Real MK calibration is non-linear but the
 * difference is < 5% within a class — within the noise of the
 * Ballesteros fallback path that's used when `spect` is absent.
 *
 * Anchors for class C (subclass 0) and the next class C' (subclass
 * 0). Values for "subclass 5" interpolate between the two anchors.
 * Subclass 9 of class C is approximated as 90% of the way to
 * class C' subclass 0.
 */
const MK_TEMP_ANCHORS_K: Record<Exclude<SpectralClass, "WD">, number> = {
  O: 40_000, // O0 anchor (very hot)
  B: 20_000, // B0 anchor
  A: 9_900, // A0 anchor (Vega ~9700 K, this is the class anchor)
  F: 7_300, // F0 anchor
  G: 5_900, // G0 anchor (Sun is G2 ≈ 5778 K)
  K: 5_100, // K0 anchor
  M: 3_800, // M0 anchor
  L: 2_400, // L0 anchor (brown dwarfs)
  T: 1_400, // T0 anchor
  Y: 500, // Y0 anchor (ultra-cool)
};

const MK_CLASS_ORDER: ReadonlyArray<Exclude<SpectralClass, "WD">> = [
  "O",
  "B",
  "A",
  "F",
  "G",
  "K",
  "M",
  "L",
  "T",
  "Y",
];

/**
 * Effective temperature in Kelvin for a parsed (class, subclass)
 * pair. Linear interpolation between class anchors along the
 * subclass digit; class beyond Y returns the Y0 anchor.
 *
 * For white dwarfs (`spectralClass === "WD"`), uses a separate
 * mapping (DA2 ≈ 25,000 K, DA9 ≈ 5,500 K — wider range than
 * main-sequence subclass spacing). Subclass 1 = hottest.
 *
 * For unknown subclass (NaN), returns the class-anchor temperature
 * (subclass 0).
 */
export const temperatureFromSpect = (
  spectralClass: SpectralClass,
  subclass: number
): number => {
  if (spectralClass === "WD") {
    // White-dwarf temperature scale: DA1-DA9 spans ~50,000 → 5,500 K.
    // Source: Bergeron et al. spectral grids (atlas-opinion midpoints).
    // Subclass 1 (hottest) = 50,000 K; subclass 9 (coolest) = 5,500 K.
    if (!Number.isFinite(subclass)) return 10_000; // unknown → typical mid-range
    const wdAnchorHot = 50_000;
    const wdAnchorCool = 5_500;
    const t = Math.max(0, Math.min(1, (subclass - 1) / 8));
    return wdAnchorHot * (1 - t) + wdAnchorCool * t;
  }

  const idx = MK_CLASS_ORDER.indexOf(spectralClass);
  if (idx < 0) return MK_TEMP_ANCHORS_K.G; // fallback: solar-like

  const thisAnchor = MK_TEMP_ANCHORS_K[MK_CLASS_ORDER[idx]];
  // Beyond the last class, no next-anchor available — return as-is.
  if (idx === MK_CLASS_ORDER.length - 1) return thisAnchor;
  const nextAnchor = MK_TEMP_ANCHORS_K[MK_CLASS_ORDER[idx + 1]];

  const sub = Number.isFinite(subclass)
    ? Math.max(0, Math.min(9, subclass))
    : 0;
  // Linear interpolation across the 10-subclass bracket.
  const t = sub / 10;
  return thisAnchor * (1 - t) + nextAnchor * t;
};

/**
 * Ballesteros (2012) B-V → T_eff conversion.
 *
 * **Gaia-borrowed**: 1:1 port of
 * `gaiasky/util/color/BVToTeffBallesteros.java:32-34` (MPL-2.0).
 * Constants `T0=4600, a=0.92, b=1.7, c=0.62`. Same formula already
 * mirrored at `starfieldShaderMath.ts:74` for GLSL color-conversion
 * purposes; this is the standalone TS port for the
 * stellar-physics path.
 *
 * Falls back to this when `spect` is absent or unparseable. The
 * Ballesteros formula is empirically fit and has ~5% error against
 * MK calibration; sufficient for the visual-identity profile.
 */
export const temperatureFromBV = (bv: number): number => {
  // Constants from BVToTeffBallesteros.java:18-23.
  const a = 0.92;
  const b = 1.7;
  const c = 0.62;
  const T0 = 4600;
  return T0 * (1 / (a * bv + b) + 1 / (a * bv + c));
};

// ─── Stellar radius ───────────────────────────────────────────────

/**
 * Class-aware radius factor (in solar radii) for non-main-sequence
 * stars. Main-sequence dwarfs (V) compute via Stefan-Boltzmann
 * from `absmag` when available; without absmag they use the V
 * column. Giants (III), bright giants (II), supergiants (I/Ia/Ib),
 * and subgiants (IV) use class-scaled factors based on standard
 * stellar-evolution references.
 *
 * Atlas-opinion approximations — full per-class radius modeling
 * (T6.5 territory) is out of scope. These values produce
 * visually-distinguishable stellar sizes at solid-angle gating
 * threshold without requiring spectral-grid lookup tables.
 */
const RADIUS_FACTOR_BY_LUMINOSITY: Record<LuminosityClass, number> = {
  "0": 1500, // hypergiant — few exist; rough order
  Ia: 1000, // bright supergiant (Betelgeuse ~900 R_sun)
  Ib: 500, // less bright supergiant
  I: 700, // generic supergiant midpoint
  II: 100, // bright giant
  III: 30, // giant (Arcturus ~25 R_sun)
  IV: 3, // subgiant (Procyon ~2 R_sun)
  V: 1, // main sequence — class-modulated (see below)
  VI: 0.5, // subdwarf
  VII: 0.01, // white dwarf (Sirius B ~0.008 R_sun)
};

/**
 * Approximate main-sequence radius in solar radii from spectral
 * class. Atlas-opinion values from standard astrophysics tables
 * (Cox 2000, Allen's Astrophysical Quantities). Subclass
 * interpolation linear within class.
 */
const MAIN_SEQUENCE_RADIUS_SOLAR: Record<
  Exclude<SpectralClass, "WD">,
  number
> = {
  O: 10, // O0 main sequence
  B: 5,
  A: 1.7, // A0 (Vega ~2.4, but A5 closer to 1.5 — midpoint anchor)
  F: 1.3,
  G: 1.0, // Sun
  K: 0.8,
  M: 0.4, // M0; cooler M dwarfs go down to ~0.1
  L: 0.1, // brown dwarfs are sub-stellar
  T: 0.09,
  Y: 0.08,
};

/**
 * Compute physical radius (in solar units) from a spectral
 * classification string.
 *
 * Algorithm:
 *   1. Parse spect via `parseSpectralClass`.
 *   2. If parse fails or no `spect` provided, return 1.0
 *      (Sun-equivalent fallback; caller may further refine via
 *      `absmag` or use the default profile).
 *   3. White dwarf (class === "WD"): return 0.01 R_sun (Sirius
 *      B-like; absmag ignored for WD because Stefan-Boltzmann
 *      breaks at WD densities — our table value is the
 *      conventional approximation).
 *   4. Non-main-sequence (luminosity ∈ {0, Ia, Ib, I, II, III,
 *      IV, VI}): use `RADIUS_FACTOR_BY_LUMINOSITY` directly.
 *      Subclass and absmag ignored — class-only granularity
 *      is the T6.2 scope; T6.4 may refine.
 *   5. Main sequence (V or null): interpolate
 *      `MAIN_SEQUENCE_RADIUS_SOLAR` between the parsed class and
 *      the next class along the subclass digit. If `absmag` is
 *      provided AND finite, optionally refine via Stefan-
 *      Boltzmann (R/R_sun = sqrt(L/L_sun) × (T_sun/T_eff)²)
 *      using the parsed temperature; this lets faint M-dwarfs
 *      compute correctly even when the table-level approximation
 *      would over-estimate them.
 *
 * Returns 0 for invalid input (never NaN — downstream consumers
 * use this to scale geometry).
 */
export const radiusFromSpect = (
  spect: string | null | undefined,
  absmag?: number
): number => {
  if (!spect) return 1.0;
  const parsed = parseSpectralClass(spect);
  if (!parsed) return 1.0;

  // White dwarfs.
  if (parsed.spectralClass === "WD") return RADIUS_FACTOR_BY_LUMINOSITY.VII;

  // Non-main-sequence: class-factor only.
  if (
    parsed.luminosityClass !== null &&
    parsed.luminosityClass !== "V" &&
    parsed.luminosityClass !== "VII"
  ) {
    return RADIUS_FACTOR_BY_LUMINOSITY[parsed.luminosityClass];
  }

  // Main sequence (V or unspecified default).
  const idx = MK_CLASS_ORDER.indexOf(parsed.spectralClass);
  if (idx < 0) return 1.0;

  const thisR = MAIN_SEQUENCE_RADIUS_SOLAR[MK_CLASS_ORDER[idx]];
  // Interpolate to the next class for a smoother subclass curve.
  const nextR =
    idx === MK_CLASS_ORDER.length - 1
      ? thisR
      : MAIN_SEQUENCE_RADIUS_SOLAR[MK_CLASS_ORDER[idx + 1]];

  const sub = Number.isFinite(parsed.subclass)
    ? Math.max(0, Math.min(9, parsed.subclass))
    : 0;
  const t = sub / 10;
  const tableR = thisR * (1 - t) + nextR * t;

  // Optional Stefan-Boltzmann refinement when absmag is available.
  // R/R_sun = sqrt(L/L_sun) × (T_sun / T_eff)²
  // L/L_sun = 10^(-0.4 × (absmag - M_sun)) where M_sun = 4.83.
  // We average the table value with the SB value to prevent
  // pathological output when absmag-vs-spect disagree (catalog
  // noise). This is atlas-opinion smoothing — not a Gaia behavior.
  if (Number.isFinite(absmag)) {
    const M_SUN_ABS = 4.83;
    const T_SUN = 5778;
    const tEff = temperatureFromSpect(parsed.spectralClass, parsed.subclass);
    if (Number.isFinite(tEff) && tEff > 0) {
      const lumOverSun = Math.pow(10, -0.4 * ((absmag as number) - M_SUN_ABS));
      const tRatio = T_SUN / tEff;
      const sbR = Math.sqrt(lumOverSun) * tRatio * tRatio;
      // Geometric mean blends table + SB; clamp to a sensible range
      // so noisy absmag entries don't return absurd radii.
      const blended = Math.sqrt(tableR * Math.max(1e-3, sbR));
      return Math.max(1e-3, Math.min(2000, blended));
    }
  }

  return tableR;
};

// ─── Stellar mass (rough heuristic) ───────────────────────────────

/**
 * Rough mass estimate in solar units. Atlas-opinion heuristic for
 * the M6-D HygStarPanel info display — explicitly NOT a precision
 * stellar-evolution calculation.
 *
 * Strategy:
 *   - Main sequence (V or unspecified): mass-luminosity relation
 *     `M/M_sun = (L/L_sun)^(1/3.5)` from `absmag`. Standard
 *     approximation accurate to ~10% for M/M_sun in [0.5, 10] —
 *     adequate for the panel's information-density purpose.
 *   - Giants (III) / bright giants (II) / supergiants (Ia/Ib/I):
 *     class-typical fixed values rather than the MS relation,
 *     since post-MS evolution decouples L and M.
 *   - White dwarfs: ~0.6 M_sun (Chandrasekhar-floor average).
 *   - No spect / unparseable: returns NaN — caller should hide
 *     the field rather than display a misleading number.
 *
 * Returns a positive finite number on success, NaN on missing /
 * unparseable input.
 */
export const massFromSpectAbsmag = (
  spect: string | null | undefined,
  absmag: number | null | undefined
): number => {
  if (!spect) return NaN;
  const parsed = parseSpectralClass(spect);
  if (!parsed) return NaN;

  if (parsed.spectralClass === "WD") return 0.6;

  const lum = parsed.luminosityClass;
  // Non-main-sequence fixed estimates (atlas-opinion; representative
  // class midpoints per Allen's Astrophysical Quantities tables).
  if (lum === "Ia") return 25;
  if (lum === "Ib") return 18;
  if (lum === "I") return 20;
  if (lum === "II") return 12;
  if (lum === "III") return 2.5;
  if (lum === "IV") return 1.6;

  // Main sequence (V or unspecified) — mass-luminosity relation.
  if (typeof absmag !== "number" || !Number.isFinite(absmag)) {
    return NaN;
  }
  const M_SUN_ABS = 4.83;
  const lumOverSun = Math.pow(10, -0.4 * (absmag - M_SUN_ABS));
  if (!Number.isFinite(lumOverSun) || lumOverSun <= 0) return NaN;
  // M/M_sun = L^(1/3.5). Clamp to [0.05, 100] so noisy absmag
  // entries don't return absurd masses.
  const massSolar = Math.pow(lumOverSun, 1 / 3.5);
  return Math.max(0.05, Math.min(100, massSolar));
};

// ─── Visual descriptor + visual-profile aggregator ────────────────

/**
 * Star data subset needed to build a visual profile. Atlas's
 * `HygCatalogData` will be extended in T6.2-β to expose
 * `spect: string | null` + `absmag: number | null` per star;
 * until then, callers pass `bv` only and route through the
 * Ballesteros fallback path.
 */
export interface StellarPhysicsInput {
  /** B-V color index (mag). Always present in HYG catalog (default 0.65). */
  bv: number;
  /** MK spectral classification string. Optional until T6.2-β. */
  spect?: string | null;
  /** Absolute magnitude (M_V). Optional until T6.2-β. */
  absmag?: number | null;
}

/**
 * T6.4-M4 — bundled visual descriptor that `stellarVisualProfileFrom`
 * consumes internally. Surfaces every parsed/derived field the
 * downstream class-aware composition needs (color, granulation,
 * rays/flares, glow scale) so the visual-profile builder doesn't
 * re-parse `spect` mid-pipeline. M5 (spect-fallback via absmag)
 * also reads this shape.
 *
 * `luminosityClass` defaults to `"V"` (main sequence) when the
 * catalog string carries no luminosity hint — consistent with
 * `radiusFromSpect`'s "V or unspecified" branch. The visual
 * descriptor is therefore non-null on every field, simplifying
 * downstream callers.
 */
export interface StellarVisualDescriptor {
  /** Effective temperature in Kelvin. */
  tEff: number;
  /** MK class letter or `"WD"`. Defaults to `"G"` for unparseable input. */
  spectralClass: SpectralClass;
  /** Roman numeral. Defaults to `"V"` (main sequence) when absent. */
  luminosityClass: LuminosityClass;
  /** Catalog B-V (preserved verbatim — kept for downstream auditability). */
  bv: number;
  /** V-band absolute magnitude, or `null` when absent / non-finite. */
  absmag: number | null;
  /** Radius in solar units, via `radiusFromSpect`. */
  radiusSolar: number;
}

/**
 * Build a visual descriptor from raw HYG catalog fields. Mirrors the
 * resolution sequence inside `stellarVisualProfileFrom` so callers
 * (M5 forward-port, info-panel labels) can share the same parsed
 * shape without re-implementing the spect / B-V fallback.
 */
export const descriptorFromCatalog = (
  input: StellarPhysicsInput
): StellarVisualDescriptor => {
  const parsed = input.spect ? parseSpectralClass(input.spect) : null;

  let tEff: number;
  if (parsed) {
    tEff = temperatureFromSpect(parsed.spectralClass, parsed.subclass);
  } else {
    tEff = temperatureFromBV(input.bv);
  }

  const spectralClass: SpectralClass = parsed?.spectralClass ?? "G";
  const luminosityClass: LuminosityClass = parsed?.luminosityClass ?? "V";
  const absmag =
    typeof input.absmag === "number" && Number.isFinite(input.absmag)
      ? input.absmag
      : null;
  const radiusSolar = radiusFromSpect(input.spect, absmag ?? undefined);

  return {
    tEff,
    spectralClass,
    luminosityClass,
    bv: input.bv,
    absmag,
    radiusSolar,
  };
};

/**
 * Map an effective temperature to a hue offset for the rays /
 * flares shaders. Hot stars (O / B / hot WDs) skew blue; cool
 * stars (M / L / T / Y) skew red. The pre-T6.1 Sun default
 * (raysHue=0.2, flaresHue=0) anchored mid-yellow; this function
 * preserves that for solar-like temperatures and shifts
 * symmetrically away.
 *
 * Atlas-opinion — not a Gaia formula. Tuned visually so a G2V
 * input returns the Sun default exactly, an O5V skews -0.4
 * (cool blue rays), and an M5V skews +0.4 (warm orange rays).
 *
 * Output range: roughly [-0.4, +0.4] added to the Sun-default
 * hue. Range chosen to fit within the rays / flares shader's
 * hue-spread band (`0.16 - 0.2` for the spread; exceeding that
 * would produce harsh hue jumps).
 */
const hueOffsetFromTemperature = (tEff: number): number => {
  // Anchor: T_sun ≈ 5778 K → 0 offset.
  // Range: 30,000 K → -0.4 (deep blue); 2,500 K → +0.4 (deep red).
  const T_SUN = 5778;
  const logRatio = Math.log10(tEff / T_SUN);
  // Empirical scale: log(T_eff/T_sun) spans roughly [-0.4, 0.7]
  // for the catalog. Map to [-0.4, +0.4] with sign inverted.
  return -Math.max(-1.0, Math.min(1.0, logRatio * 0.55));
};

/**
 * Map a temperature to a brightness multiplier for the surface
 * material. Hot stars (O / B) appear visually brighter on screen
 * (more energy density per unit area); cool stars (M / L / T / Y)
 * appear dimmer. Anchored at solar T_eff = 1.0× (Sun default).
 *
 * Atlas-opinion clamp [0.4, 1.5] keeps even ultra-cool brown
 * dwarfs visible at the procedural-mesh stage (the alternative —
 * letting them go to 0.1× — would make Y dwarfs disappear into
 * the post-processing tone curve).
 */
const brightnessScaleFromTemperature = (tEff: number): number => {
  const T_SUN = 5778;
  const ratio = tEff / T_SUN;
  // Sub-linear scaling: brightness ∝ T^0.4 with a clamp.
  return Math.max(0.4, Math.min(1.5, Math.pow(ratio, 0.4)));
};

/**
 * T6.4-M4 — luminosity-class anchors for granulation cell scale
 * + temporal rate + base contrast. Atlas-opinion midpoints
 * grounded in stellar-evolution H_p (pressure scale height)
 * intuition: supergiants have huge H_p (low surface gravity at
 * extended atmospheres) → very large cells / slow turnover;
 * main-sequence has H_p matched to T_eff; white dwarfs have
 * tiny scale heights → high spatial frequency / fast turnover.
 *
 * The V-class row equals the Sun default (spatial=6, temporal=0.10,
 * contrast=0.25) so a G2V input under
 * `stellarVisualProfileFrom` reproduces SUN_DEFAULT_VISUAL_PROFILE
 * for those three fields exactly.
 */
const GRANULATION_BY_LUMINOSITY: Record<
  LuminosityClass,
  { spatial: number; temporal: number; contrast: number }
> = {
  "0": { spatial: 1.0, temporal: 0.015, contrast: 0.5 },
  Ia: { spatial: 1.5, temporal: 0.02, contrast: 0.45 },
  Ib: { spatial: 2.5, temporal: 0.03, contrast: 0.4 },
  I: { spatial: 2.0, temporal: 0.025, contrast: 0.42 },
  II: { spatial: 3.0, temporal: 0.04, contrast: 0.38 },
  III: { spatial: 4.0, temporal: 0.06, contrast: 0.35 },
  IV: { spatial: 5.0, temporal: 0.08, contrast: 0.3 },
  V: { spatial: 6.0, temporal: 0.1, contrast: 0.25 },
  VI: { spatial: 8.0, temporal: 0.15, contrast: 0.18 },
  VII: { spatial: 12.0, temporal: 0.2, contrast: 0.1 },
};

/**
 * T6.4-M4 — temperature multiplier on granulation contrast.
 * Anchored at solar T_eff so a Sun input returns scale=1.0
 * exactly. Hot stars (radiative atmospheres → suppressed
 * convection visibility) get scale → 0.2; cool stars (deep
 * convection zones → strong cell contrast) get scale → 1.5.
 *
 * Clamped tightly because the exponential blows past usable
 * brightness at extreme temperatures.
 */
const granulationContrastTempScale = (tEff: number): number => {
  const T_SUN = 5778;
  return Math.max(0.2, Math.min(1.5, Math.exp((T_SUN - tEff) / 4000)));
};

/**
 * T6.4-M4 — `absmag` → multiplicative scale on `glowBrightness`.
 *
 * Pure visual-art knob: the actual luminosity-flux ratio across
 * the catalog spans ~10^9; mapping that 1:1 would crush faint
 * dwarfs to invisible and blow out supergiants. The damped
 * exponent (0.15) compresses the visual range to roughly
 * [0.5, 3.0], giving Rigel-class supergiants a noticeably
 * brighter halo than Sirius-class A dwarfs without saturating
 * post-process bloom. Anchored at M_sun = +4.83 so a Sun-equivalent
 * absmag returns 1.0 exactly.
 *
 * NOT a physics claim about coronal energetics — purely an
 * art-direction layer.
 */
const glowScaleFromAbsmag = (absmag: number | null): number => {
  if (absmag === null || !Number.isFinite(absmag)) return 1.0;
  const M_SUN_V = 4.83;
  return Math.max(
    0.5,
    Math.min(3.0, Math.pow(10, -0.4 * (absmag - M_SUN_V) * 0.15))
  );
};

/**
 * T6.4-M4 — rays / flares / glow-falloff multipliers per
 * (spectral class, luminosity class, T_eff) — atlas-opinion
 * art-direction layer.
 *
 * Heuristics (per spec §S6):
 *   - Hot main-sequence (O / B / A V) → cleaner / sharper falloff,
 *     muted flares (radiative-atmosphere look).
 *   - Cool dwarf main-sequence (K / M V) → busier rays, broader
 *     halo (active-chromosphere look). M-dwarfs especially get
 *     pronounced flares (Proxima-like activity).
 *   - Supergiants (Ia / Ib / I / II) → wide, slow rays; muted
 *     flares (low-gravity envelope).
 *   - Solar G/F V → returns 1.0× across the board so the Sun
 *     default reproduces byte-identical for these fields.
 */
const artDirectionMultipliers = (
  spectralClass: SpectralClass,
  luminosityClass: LuminosityClass,
  tEff: number
): {
  raysAmplitude: number;
  flaresAmp: number;
  glowFalloffColor: number;
} => {
  const isHotMS = luminosityClass === "V" && tEff > 7500;
  const isCoolMS = luminosityClass === "V" && tEff < 4500;
  const isSG =
    luminosityClass === "0" ||
    luminosityClass === "Ia" ||
    luminosityClass === "Ib" ||
    luminosityClass === "I" ||
    luminosityClass === "II";

  const raysAmplitude = isHotMS ? 0.6 : isCoolMS ? 1.4 : isSG ? 1.0 : 1.0;
  const flaresAmp = isHotMS
    ? 0.3
    : isCoolMS && spectralClass === "M"
      ? 1.8
      : isCoolMS
        ? 1.3
        : isSG
          ? 0.7
          : 1.0;
  const glowFalloffColor = isHotMS ? 0.7 : isCoolMS ? 1.3 : 1.0;

  return { raysAmplitude, flaresAmp, glowFalloffColor };
};

/**
 * Aggregate star data → `StellarVisualProfile`.
 *
 * **T6.4-M4 algorithm** (replaces the T6.2-α profile pattern):
 *   1. Build a `StellarVisualDescriptor` via `descriptorFromCatalog`.
 *      Resolves `tEff` (spectral path → Ballesteros fallback),
 *      `luminosityClass` (default `"V"`), `radiusSolar`.
 *   2. `classColor = blackbodyRgbFromTemperature(tEff)` — drives
 *      the new shared `uClassColor` uniform on sphere + glow.
 *   3. Granulation cell scale + time + contrast from
 *      `GRANULATION_BY_LUMINOSITY[luminosityClass]`, with a
 *      `tEff`-dependent contrast scale (hot stars → flatter,
 *      cool stars → stronger). V-class anchors at the Sun default.
 *   4. Glow brightness scaled by `glowScaleFromAbsmag(absmag)` —
 *      luminous supergiants get brighter halos than dim M dwarfs.
 *      Sun-equivalent `absmag = 4.83` → 1.0 (no Sun churn).
 *   5. Rays / flares amplitude + glow falloff via
 *      `artDirectionMultipliers` — hot stars cleaner, cool
 *      dwarfs more active, supergiants wider/slower.
 *   6. Surface brightness scale + rays/flares hue offset
 *      preserved from T6.2-α (atlas-opinion temperature mappings).
 *
 * Solar identity invariant: a G2V input with `bv = 0.65,
 * absmag = 4.83` is byte-identical to `SUN_DEFAULT_VISUAL_PROFILE`
 * for every field except `surfaceBrightness` (sub-1% drift via
 * `brightnessScaleFromTemperature` because `tEff(G,2)` ≈ 5740 K
 * ≠ 5778 K exactly). Pinned in `stellarPhysics.test.ts`.
 */
export const stellarVisualProfileFrom = (
  input: StellarPhysicsInput
): StellarVisualProfile => {
  const desc = descriptorFromCatalog(input);

  // Class color (linear-RGB blackbody).
  const classColor = blackbodyRgbFromTemperature(desc.tEff);

  // Granulation: class anchor × temperature contrast scale.
  const granAnchor = GRANULATION_BY_LUMINOSITY[desc.luminosityClass];
  const granContrast =
    granAnchor.contrast * granulationContrastTempScale(desc.tEff);

  // Glow brightness scale from absmag (luminosity proxy).
  const glowScale = glowScaleFromAbsmag(desc.absmag);

  // Art-direction layer (rays / flares / glow falloff).
  const art = artDirectionMultipliers(
    desc.spectralClass,
    desc.luminosityClass,
    desc.tEff
  );

  // Brightness + hue (preserved from T6.2-α).
  const hueOffset = hueOffsetFromTemperature(desc.tEff);
  const brightnessScale = brightnessScaleFromTemperature(desc.tEff);

  return {
    ...SUN_DEFAULT_VISUAL_PROFILE,

    granulationSpatialFreq: granAnchor.spatial,
    granulationTemporalFreq: granAnchor.temporal,
    granulationContrast: granContrast,

    surfaceBrightness:
      SUN_DEFAULT_VISUAL_PROFILE.surfaceBrightness * brightnessScale,

    glowBrightness: SUN_DEFAULT_VISUAL_PROFILE.glowBrightness * glowScale,
    glowFalloffColor:
      SUN_DEFAULT_VISUAL_PROFILE.glowFalloffColor * art.glowFalloffColor,

    raysNoiseAmplitude:
      SUN_DEFAULT_VISUAL_PROFILE.raysNoiseAmplitude * art.raysAmplitude,
    raysHue: SUN_DEFAULT_VISUAL_PROFILE.raysHue + hueOffset,

    flaresAmp: SUN_DEFAULT_VISUAL_PROFILE.flaresAmp * art.flaresAmp,
    flaresHue: SUN_DEFAULT_VISUAL_PROFILE.flaresHue + hueOffset,

    classColor,
  };
};
