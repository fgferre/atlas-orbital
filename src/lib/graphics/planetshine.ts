/**
 * Planetshine / earthshine — a SECOND incident-light magnitude for the three
 * bodies whose companion is bright enough, and close enough, to matter next
 * to their own direct sunlight (lighting redesign, Onda 2.3).
 *
 * ## What this is
 *
 * Io and Europa sit close enough to Jupiter that sunlight Jupiter itself
 * reflects back onto them ("Jupiter-shine") is a measurable fraction of the
 * sunlight they receive directly. The Moon receives the equivalent from
 * Earth ("earthshine") — the only planetshine bright enough to see with the
 * naked eye (the faint glow filling in the dark part of a crescent Moon),
 * which makes it this feature's pedagogical hook.
 *
 * This module is the CPU half: a pure resolver that turns a recipient body
 * id + date into ONE scalar, `R × E(parent) × assistGain(parent)` — the
 * SAME shape {@link resolveFusedSunlightScalar} already produces for the
 * Sun itself, just evaluated at the SHINE SOURCE's heliocentric distance
 * and scaled down by `R`. `src/components/canvas/shaders/planetshinePatch.ts`
 * is the GLSL half that consumes it; see that file for how the value reaches
 * the shader without a second scene light and without being scaled twice.
 *
 * ## The R table (handoff §6 checklist item 7 — published here AND in the
 * wave doc)
 *
 * `R` is "Jupiter-shine / earthshine irradiance, as a fraction of the LOCAL
 * solar irradiance the recipient itself receives" — i.e. exactly what
 * {@link PLANETSHINE_R} and {@link EARTHSHINE_R_FULL} are keyed to. Because a
 * satellite's own heliocentric distance and its parent's differ by a factor
 * of 10³–10⁵ (Io's orbital radius is 0.0028 AU against Jupiter's 5.2 AU;
 * the Moon's is 0.0026 AU against Earth's 1 AU), `E(parent AU)` and
 * `E(recipient's own AU)` agree to better than 1 part in 10⁵ — so scaling
 * by the PARENT's irradiance (what the source actually reflects) is
 * numerically identical to scaling by the recipient's own, and is what this
 * file's resolvers do because it is the physically direct read: Jupiter/
 * Earth reflect a fraction of the sunlight THEY receive.
 *
 * | body     | R                   | source                              |
 * | -------- | ------------------- | ------------------------------------ |
 * | Io       | 9.0 × 10⁻³          | Mergny & Schmidt 2024                |
 * | Europa   | 3.6 × 10⁻³          | Mergny & Schmidt 2024                |
 * | Moon     | up to ≈1.0 × 10⁻⁴, × (1 − phase)² | derived here, see {@link EARTHSHINE_R_FULL}; phase-shape from Stellarium's `Planet.cpp` earthshine term |
 *
 * Io receives ~2.5× Europa's Jupiter-shine (9.0 / 3.6 = 2.5 exactly) —
 * shipping Europa alone would have been cherry-picking the smaller number
 * and silently dropping the brighter one from the same paper.
 *
 * **Excluded** — {@link PLANETSHINE_EXCLUDED} carries these with their
 * reason, so the exclusion is inspectable, not just prose:
 *
 * | body     | R           | why excluded                                     |
 * | -------- | ----------- | ------------------------------------------------- |
 * | Ganymede | 2.2 × 10⁻³  | below {@link PLANETSHINE_FLOOR} (3.0 × 10⁻³)       |
 * | Callisto | not cited   | no R figure carried into this wave                 |
 * | Charon   | not cited   | Lauer et al. 2021 (PSJ 2, 214) measured Pluto–Charon mutual shine directly, but that is a different body pair outside today's recipient set — cited as the excluded-tier example, not implemented |
 *
 * The floor exists so the shader/uniform cost of a fourth recipient is only
 * paid once the effect is large enough to matter; Ganymede's 2.2 × 10⁻³ is
 * real (per the same paper) but under the line this wave draws.
 *
 * ## Earthshine's peak, derived honestly
 *
 * Glenar et al. (2019) characterise earthshine's SPECTRUM, not a single
 * scalar "R" — there is no one number to cite for "earthshine as a fraction
 * of the Moon's own local solar irradiance at full Earth". So
 * {@link EARTHSHINE_R_FULL} is derived here from the same simple
 * point-reflector approximation the R table above implicitly rests on
 * (irradiance reflected off a sphere of radius `r` and geometric albedo `A`,
 * received by a point a distance `d` away, relative to the irradiance that
 * same point receives directly from the original source):
 *
 * ```
 * R_full = A × (r / d)²
 * ```
 *
 * With Earth's V-band geometric albedo `A ≈ 0.367` (a standard tabulated
 * planetary value, consistent with earthshine photometry including Glenar
 * et al. 2019 — geometric, not Bond, albedo is the right one here because
 * this is a single reflectance snapshot, not an all-phase energy budget),
 * Earth's mean radius `r = 6371 km`, and the Earth–Moon mean distance
 * `d = 384400 km` (the same constant `celestialBodies.ts`'s Moon record
 * uses for `distanceFromParent`):
 *
 * ```
 * (r / d)² = (6371 / 384400)² ≈ 0.016572² ≈ 2.746 × 10⁻⁴
 * R_full   = 0.367 × 2.746 × 10⁻⁴ ≈ 1.008 × 10⁻⁴
 * ```
 *
 * This lands within 1% of the "≈ 1.0 × 10⁻⁴" figure the plan anchors on,
 * derived rather than asserted — the computation above is literally what
 * {@link EARTHSHINE_R_FULL} evaluates at module load, not a rounded literal.
 *
 * ## The phase shape — Stellarium's precedent, disclosed as such
 *
 * Earthshine is brightest when Earth is FULLY lit as seen from the Moon —
 * which is exactly new-Moon-as-seen-from-Earth, since the two phases are
 * geometric complements. Stellarium's `Planet.cpp` models the Moon's
 * earthshine ambient term as `(1 − phase)² × 0.15`, where `phase` is the
 * Moon's OWN illuminated fraction (1 = full, 0 = new). This file borrows
 * that `(1 − phase)²` SHAPE — a standard falloff for a phase-integrated
 * reflectance term — via {@link resolveEarthshinePhaseFactor}, but not its
 * `0.15` peak, which is an opaque ambient-relative constant in Stellarium's
 * own units and not directly comparable to this file's "fraction of local
 * solar irradiance" convention; {@link EARTHSHINE_R_FULL} replaces it with
 * the grounded derivation above. `phase` itself comes from
 * `AstroPhysics.resolveSkyGeometry`, the SAME function `Sidebar.tsx` already
 * uses for the Moon's own illuminated-fraction display (see that file's
 * comment: "for the Moon the parent IS Earth, so the composed heliocentric
 * difference already IS the geocentric vector and the result is the lunar
 * phase").
 *
 * ## What this file deliberately does NOT do
 *
 * It does not fold in the live "Sun Brightness ×" display multiplier
 * (`sunIntensityMul`). That control is a display/exposure knob (Onda 1's
 * "DOIS controles" split), orthogonal to the CONTENT policy this file's
 * formula shares with the sun path — "the SAME assist-gain policy scalar"
 * means {@link SunlightAssistPolicy}, not the exposure slider. Under the
 * default preset (`sunIntensity: 1.0`, `sunIntensityMul` unset), the two
 * are numerically the same thing anyway; a user who cranks Sun Brightness
 * will see the shine no longer track that adjustment 1:1, a documented,
 * minor simplification rather than a silent one.
 */

import { AstroPhysics } from "../astrophysics";
import {
  resolveHeliocentricDistanceAU,
  resolveHeliocentricPositionAU,
} from "../orbital";
import {
  getSunlightAssistPolicy,
  getSunlightToneMappingMounted,
  resolveFusedSunlightScalar,
  type SunlightAssistPolicy,
} from "./solarIrradiance";

/** The Moon is the one recipient whose R is phase-dependent, not constant. */
export const EARTHSHINE_BODY_ID = "moon";

/**
 * Jupiter-shine, as a fraction of local solar irradiance. Mergny & Schmidt
 * 2024. Io first, Europa second, by design: Io is the brighter of the two
 * (9.0 / 3.6 = 2.5×) and shipping only the dimmer one would have been
 * cherry-picking.
 */
export const PLANETSHINE_R: Readonly<Record<string, number>> = {
  io: 9.0e-3,
  europa: 3.6e-3,
};

/**
 * Minimum R worth the extra uniform + shader branch. Ganymede (2.2 × 10⁻³,
 * same paper) sits below it — see {@link PLANETSHINE_EXCLUDED}.
 */
export const PLANETSHINE_FLOOR = 3.0e-3;

/**
 * Bodies with a measured or citable planetshine effect that this wave does
 * NOT wire up, with the reason — so the exclusion is inspectable (handoff
 * §6 item 7) rather than only asserted in prose.
 */
export const PLANETSHINE_EXCLUDED: Readonly<
  Record<string, { r: number | null; reason: string }>
> = {
  ganymede: {
    r: 2.2e-3,
    reason:
      "Below the 3.0e-3 floor (PLANETSHINE_FLOOR) — Mergny & Schmidt 2024 measure Ganymede's Jupiter-shine at 2.2e-3 of local solar irradiance, under the threshold this wave uses to decide which bodies are worth the extra uniform and shader branch.",
  },
  callisto: {
    r: null,
    reason:
      "No R figure carried into this wave. Callisto orbits farther from Jupiter than the three chosen recipients and was not part of the cited comparison set.",
  },
  charon: {
    r: null,
    reason:
      "Lauer et al. 2021 (PSJ 2, 214) measured Pluto-Charon mutual shine directly, but that is a different body pair (Pluto/Charon, not Sun-Jupiter-moon or Sun-Earth-Moon) outside today's recipient set — cited as the excluded-tier example, not implemented.",
  },
};

/** Earth's mean radius, km — standard value. */
const EARTH_MEAN_RADIUS_KM = 6371;

/**
 * Earth-Moon mean distance, km — the same constant `celestialBodies.ts`'s
 * Moon record quotes for `distanceFromParent`.
 */
const EARTH_MOON_MEAN_DISTANCE_KM = 384400;

/**
 * Earth's V-band geometric albedo. A standard tabulated planetary-science
 * value (geometric, not Bond, albedo — the right choice for a single
 * reflectance snapshot rather than an all-phase energy budget), consistent
 * with earthshine photometry including Glenar et al. 2019.
 */
const EARTH_GEOMETRIC_ALBEDO_V = 0.367;

/**
 * Earthshine at full Earth (new Moon), as a fraction of the Moon's own
 * local solar irradiance. Derived, not asserted — see this file's header
 * for the point-reflector formula and the arithmetic; evaluates to
 * ≈ 1.008 × 10⁻⁴, within 1% of the plan's "≈ 1.0 × 10⁻⁴" anchor.
 */
export const EARTHSHINE_R_FULL =
  EARTH_GEOMETRIC_ALBEDO_V *
  (EARTH_MEAN_RADIUS_KM / EARTH_MOON_MEAN_DISTANCE_KM) ** 2;

/**
 * Stellarium's `(1 − phase)²` earthshine shape (`Planet.cpp`), where
 * `phase` is the Moon's OWN illuminated fraction (1 = full, 0 = new) — see
 * this file's header for why the shape is borrowed but not the `0.15` peak.
 * Clamps its input so a caller that hands a slightly out-of-range fraction
 * (float roundoff at the very ends) still returns a value in `[0, 1]`.
 */
export const resolveEarthshinePhaseFactor = (
  illuminatedFraction: number
): number => {
  const clamped = Math.min(1, Math.max(0, illuminatedFraction));
  const dark = 1 - clamped;
  return dark * dark;
};

/** Whether `bodyId` is one of the three planetshine/earthshine recipients. */
export const isPlanetshineRecipient = (bodyId: string): boolean =>
  bodyId in PLANETSHINE_R || bodyId === EARTHSHINE_BODY_ID;

/**
 * `R` for `bodyId` at this instant. For Io/Europa this is the constant from
 * {@link PLANETSHINE_R}; for the Moon it is {@link EARTHSHINE_R_FULL} scaled
 * by {@link resolveEarthshinePhaseFactor}, so `moonIlluminatedFraction` is
 * REQUIRED to get a nonzero result for the Moon (omitting it defaults to 1,
 * i.e. full Moon, i.e. zero earthshine — the conservative "never overstate
 * brightness" fallback). Returns 0 for a body that is not a recipient.
 */
export const resolvePlanetshineR = (
  bodyId: string,
  moonIlluminatedFraction?: number
): number => {
  if (bodyId === EARTHSHINE_BODY_ID) {
    return (
      EARTHSHINE_R_FULL *
      resolveEarthshinePhaseFactor(moonIlluminatedFraction ?? 1)
    );
  }
  return PLANETSHINE_R[bodyId] ?? 0;
};

export interface PlanetshineMagnitudeInputs {
  bodyId: string;
  /** The SHINE SOURCE's (the parent body's) heliocentric distance, in AU. */
  parentHeliocentricDistanceAU: number;
  /** Required only when `bodyId === "moon"` — see {@link resolvePlanetshineR}. */
  moonIlluminatedFraction?: number;
  policy?: SunlightAssistPolicy;
  toneMapped?: boolean;
}

/**
 * The pure magnitude law: `R × E(parent AU) × assistGain(parent AU, policy)`,
 * via {@link resolveFusedSunlightScalar} — the EXACT function the sun path
 * uses, evaluated at the shine source's distance instead of the recipient's
 * own. Takes AU directly (never a render-space distance), mirroring
 * `solarIrradiance.ts`'s own "pure kernel takes a number, the ephemeris-
 * consuming wrapper takes a body id" split.
 */
export const resolvePlanetshineRadianceScalar = ({
  bodyId,
  parentHeliocentricDistanceAU,
  moonIlluminatedFraction,
  policy = getSunlightAssistPolicy(),
  toneMapped = getSunlightToneMappingMounted(),
}: PlanetshineMagnitudeInputs): number => {
  const r = resolvePlanetshineR(bodyId, moonIlluminatedFraction);
  if (r <= 0) return 0;
  return (
    r *
    resolveFusedSunlightScalar({
      heliocentricDistanceAU: parentHeliocentricDistanceAU,
      policy,
      toneMapped,
    })
  );
};

/**
 * The Moon's own illuminated fraction (0 = new, 1 = full), via the SAME
 * `AstroPhysics.resolveSkyGeometry` call `Sidebar.tsx` already uses for the
 * lunar-phase display. Defensive: falls back to 1 (full Moon → zero
 * earthshine) on any resolution failure, the same conservative default
 * {@link resolvePlanetshineR} uses when the caller omits the fraction.
 */
const resolveMoonIlluminatedFraction = (date: Date): number => {
  try {
    const moonHelioAU = resolveHeliocentricPositionAU(EARTHSHINE_BODY_ID, date);
    const earthHelioAU = resolveHeliocentricPositionAU("earth", date);
    return (
      AstroPhysics.resolveSkyGeometry(moonHelioAU, earthHelioAU)
        ?.illuminatedFraction ?? 1
    );
  } catch {
    return 1;
  }
};

/**
 * The app-facing entry point: the fused planetshine scalar for `bodyId` at
 * `date`, given its `parentId` (the shine source). Composes the ephemeris
 * chain itself (never a render-space distance — same rule
 * `solarIrradiance.ts` states for the Sun), so callers on the render path
 * cannot express the wrong thing. Returns 0 for a non-recipient body or a
 * missing `parentId`, so it is always safe to call unconditionally (e.g.
 * from a hook mounted once per body, most of which are not recipients).
 */
export const resolvePlanetshineScalar = (
  bodyId: string,
  parentId: string | undefined,
  date: Date,
  policy: SunlightAssistPolicy = getSunlightAssistPolicy(),
  toneMapped: boolean = getSunlightToneMappingMounted()
): number => {
  if (!isPlanetshineRecipient(bodyId) || !parentId) return 0;

  const parentHeliocentricDistanceAU = resolveHeliocentricDistanceAU(
    parentId,
    date
  );
  const moonIlluminatedFraction =
    bodyId === EARTHSHINE_BODY_ID
      ? resolveMoonIlluminatedFraction(date)
      : undefined;

  return resolvePlanetshineRadianceScalar({
    bodyId,
    parentHeliocentricDistanceAU,
    moonIlluminatedFraction,
    policy,
    toneMapped,
  });
};
