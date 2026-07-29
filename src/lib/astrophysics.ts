import * as THREE from "three";
// `bodyOrientation` imports only the `CelestialBody` *type* from this module,
// so the pair erases at compile time and forms no runtime import cycle.
import {
  resolveBodyIauOrientation,
  resolveIauOrientation,
  type IauOrientation,
} from "./bodyOrientation";
import { J2000_JD } from "./orbital/time";

export const AU_IN_KM = 149597870.7;
export const AU_TO_3D_UNITS = 1000;
export const KM_TO_3D_UNITS = AU_TO_3D_UNITS / AU_IN_KM;
const J2000_EPOCH = new Date("2000-01-01T12:00:00Z");

type NumericAnchor = readonly [number, number];

const DIDACTIC_RADIUS_ANCHORS = [
  [1, 0.8],
  [10, 0.95],
  [100, 1.35],
  [500, 2.25],
  [1000, 3.1],
  [2000, 4.2],
  [3000, 5.2],
  [6000, 7.6],
  [12000, 9.6],
  [25000, 13.8],
  [60000, 18.5],
  [700000, 60],
] as const satisfies readonly NumericAnchor[];

const DIDACTIC_HELIOCENTRIC_DISTANCE_ANCHORS = [
  [0.39, 220],
  [0.72, 340],
  [1.0, 440],
  [1.52, 560],
  [2.77, 740],
  [5.2, 960],
  [9.58, 1200],
  [19.2, 1500],
  [30.05, 1760],
  [39.48, 1920],
  [80, 2350],
] as const satisfies readonly NumericAnchor[];

/**
 * Hard cap on the didactic heliocentric world distance — the curve
 * saturates here so deep-Kuiper / scattered-disc bodies don't shoot
 * off to the scene horizon. Past this radius the compression is flat,
 * which is what makes `worldToAu` non-invertible beyond the cap.
 */
const DIDACTIC_HELIOCENTRIC_WORLD_CAP = 3200;

/**
 * The AU at which the (uncapped) didactic compression curve first
 * reaches `DIDACTIC_HELIOCENTRIC_WORLD_CAP`. Computed from the anchor
 * table (the log-linear extrapolation beyond the `80 AU → 2350`
 * anchor crosses 3200 at ≈323.13 AU). `worldToAu` clamps its inverse
 * search to this AU and returns it as the fixed effective-AU for any
 * world distance in the saturated regime, so decade selection stays
 * finite and bounded instead of frozen / NaN / runaway.
 */
const DIDACTIC_SATURATION_AU = 323.1341;

export type BodyType =
  | "star"
  | "planet"
  | "moon"
  | "dwarf"
  | "asteroid"
  | "comet"
  | "tno";

export interface OrbitParams {
  a: number; // Semi-major axis (AU)
  e: number; // Eccentricity
  i: number; // Inclination (deg)
  O: number; // Longitude of Ascending Node (deg)
  w: number; // Argument of Periapsis (deg)
  M0: number; // Mean Anomaly at Epoch (deg)
  n: number; // Mean Motion (deg/day)
}

export type ScaleMode = "didactic" | "realistic";
export type DidacticOrbitClass = "heliocentric" | "subsystem";

export type VisualFidelity =
  | "measured"
  | "observational-model"
  | "interpretive"
  | "procedural";

export interface VisualProvenance {
  fidelity: VisualFidelity;
  summary: string;
  limitationReason?: string;
  sources?: Array<{
    label: string;
    url: string;
  }>;
}

/**
 * Nishita-1993 atmospheric scattering parameters consumed by
 * `src/components/canvas/shaders/atmosphereShader.ts`. Mirror of Gaia
 * Sky's `AtmosphereComponent` (`/tmp/gaiasky/core/src/gaiasky/scene/record/AtmosphereComponent.java`):
 *
 * - **Required** fields (`kRayleigh`, `kMie`, `wavelengthsUm`) have no
 *   Gaia source default — `AtmosphereComponent.java:48,52` declares
 *   them as public fields that must be set per body (Gaia loads them
 *   from `$GS_DATA` scene descriptors that aren't in the MPL-licensed
 *   source tree). Atlas's default values here are standard Nishita
 *   Earth literature values.
 * - **Optional** fields fall back to Gaia's class-level defaults per
 *   `AtmosphereComponent.java`: `sampleCount=23` (line 56),
 *   `eSun=10` (line 55), `mieAsymmetryG=0.76` (line 112 constant),
 *   `scaleDepth=0.25` (line 120 constant),
 *   `outerRadiusRatio=1.025` (line 118 constant), `alpha=1.0` (line 130).
 *
 * Body opts in by setting this field on its `CelestialBody` record;
 * `Planet.tsx` renders the atmosphere mesh and drives per-frame
 * uniforms only when present.
 */
export interface AtmosphereScatteringConfig {
  /** Nishita Rayleigh scattering coefficient. Earth standard: 0.0025. */
  kRayleigh: number;
  /** Nishita Mie scattering coefficient. Earth standard: 0.0015. */
  kMie: number;
  /** RGB wavelengths in MICROMETERS. Earth standard: [0.650, 0.570, 0.475]. */
  wavelengthsUm: readonly [number, number, number];
  /** Sun brightness. Default = Gaia `AtmosphereComponent.java:55` → 10. */
  eSun?: number;
  /** Mie Henyey-Greenstein asymmetry. Default = Gaia `AtmosphereComponent.java:112` → +0.76. */
  mieAsymmetryG?: number;
  /** Integrator samples per fragment. Default = Gaia `AtmosphereComponent.java:56` → 23. */
  sampleCount?: number;
  /** Scale-height / atmosphere-height ratio. Default = Gaia `AtmosphereComponent.java:120` → 0.25. */
  scaleDepth?: number;
  /** Outer-atmosphere radius (inner=1.0). Default = Gaia `AtmosphereComponent.java:118` → 1.025. */
  outerRadiusRatio?: number;
  /** Opacity multiplier. Default = Gaia `AtmosphereComponent.java:130` → 1.0. */
  alpha?: number;
}

export interface CelestialBody {
  id: string;
  parentId?: string;
  group?: "inner" | "outer" | "other";
  type: BodyType;
  name: { en: string; pt: string };
  radiusKm: number;
  color: string;
  orbit: OrbitParams;
  rotationPeriodHours: number; // Sidereal rotation period in hours (negative for retrograde)
  /**
   * Axial tilt in degrees — a **legacy display field**, superseded by
   * `iauOrientation` and retained only for records with no measured pole.
   *
   * It is still load-bearing: Vanth, Weywot and the TNO moons have a measured
   * obliquity but no published pole solution, so deleting the field would
   * destroy real data. Where a body has a pole, this value is not consulted.
   */
  axialTilt?: number;
  /**
   * Measured IAU rotational elements — pole direction **and** prime-meridian
   * phase. Its presence is the discriminator for "this body has a full
   * rotation solution"; see `src/lib/bodyOrientation.ts`.
   *
   * A record with `poleRA`/`poleDec` but no `iauOrientation` has a measured
   * spin axis and an **unconstrained phase origin** — an honest gap, not a
   * modelled value.
   */
  iauOrientation?: IauOrientation;
  poleRA?: number; // Right Ascension of North Pole in degrees (IAU)
  poleDec?: number; // Declination of North Pole in degrees (IAU)

  // Enhanced Data Fields
  classification?: string; // e.g. "Terrestrial Planet", "Gas Giant"
  mass?: string;
  gravity?: string;
  composition?: string;
  atmosphere?: string;
  /**
   * Sidereal rotation period, as displayed text.
   *
   * This is one quantity across all 47 records — the time for one rotation
   * against the stars, matching `rotationPeriodHours`. It is NOT the solar
   * day. The panel labels it "Rotation Period" for exactly that reason:
   * until 2026-07-26 the label said "Day Length" while Earth alone quoted a
   * solar day ("24 hours"), so the field silently meant two different things.
   *
   * Three bodies have a solar day that differs materially from this value,
   * and each states it in its own `facts`: Mercury (58.6 d sidereal vs 175.94 d
   * solar, the 3:2 spin-orbit resonance), Venus (243 d retrograde sidereal vs
   * 116.75 d solar) and the Moon (27.32 d sidereal vs 29.53 d synodic).
   */
  dayLength?: string;
  yearLength?: string;
  curiosity?: string;
  facts?: string[]; // Changed from single fact to array
  spectralClass?: string; // For stars
  description?: string;
  distanceFromParent?: string; // String from catalog (e.g. "57,910,000 km")

  // Legacy info field (keep for now or deprecate)
  info: string;

  textures?: {
    map?: string;
    bump?: string;
    atmosphere?: string;
    ring?: string;
    clouds?: string;
    night?: string;
    normal?: string;
    roughness?: string;
  };

  // New Fields for Enhanced UI
  records?: string[]; // Superlatives/Records
  explorationMilestone?: {
    year: number;
    description: string;
  };

  ringSystem?: {
    innerRadius: number; // In planetary radii
    outerRadius: number; // In planetary radii
  };

  /**
   * Opt-in Rayleigh+Mie atmospheric scattering config (θ.5b-d).
   * Presence of this field switches on the atmosphere mesh + per-frame
   * uniform wiring in `Planet.tsx`. See `AtmosphereScatteringConfig`
   * JSDoc for field semantics + Gaia source citations.
   */
  atmosphereScattering?: AtmosphereScatteringConfig;

  /**
   * T3.3 eclipse geometry: the id of the body whose shadow can fall
   * on THIS body (the receiver). Presence of this field switches on
   * the eclipse shader patch in `usePlanetMaterials` + per-frame
   * uniform wiring in `Planet.tsx`. Mirrors Gaia's
   * `eclipsingBodyFlag` define at `eclipses.glsl:4`.
   *
   * Standard atlas pairing:
   * - Earth.eclipsingBodyId = "moon" (solar eclipse — Moon eclipses Sun)
   * - Moon.eclipsingBodyId = "earth" (lunar eclipse — Earth casts shadow)
   */
  eclipsingBodyId?: string;

  /**
   * True when the surface is bare regolith or ice with no optically
   * significant atmosphere — a physical property of the body, not a render
   * setting. W3 keys the Lommel-Seeliger diffuse patch off it (see
   * `regolithPhotometryPatch.ts`), because that law describes light returning
   * from exposed grains and is wrong for a scattering atmosphere.
   *
   * Opt-in per record: absent means "not reviewed", not "has an atmosphere".
   * Set on Mercury, the Moon, Io, Europa, Ganymede, Callisto and Enceladus.
   * The four `model`-path bodies (haumea, vesta, pallas, hygiea) qualify
   * physically but cannot receive the shader patch — recorded in that file.
   */
  airlessRegolith?: boolean;

  /**
   * Measured triaxial semi-axis ratios against `radiusKm`, in **publication
   * order** — `[a, b, c]` = semi-major, intermediate, minor, exactly as
   * occultation and lightcurve solutions quote them.
   *
   * **The order is data, not formatting.** For a relaxed rotator the SHORT
   * axis `c` is the spin axis, and the mesh spins about scene **Y**, so the
   * resolver maps `(x, y, z) = (a, c, b)`. Feeding the triple straight through
   * would put `b` at the pole and spin the body about its intermediate axis —
   * dynamically impossible, and it *looks* more convincing than the truth
   * because it swings the silhouette further. See `resolveBodyFigureRatio`.
   *
   * Mutually exclusive with `flattening` (a body has one figure, described one
   * way) and ignored on the `model` path, where the asset owns the figure.
   * Both enforced in `celestialBodies.test.ts`.
   */
  shapeScale?: [number, number, number];

  /**
   * Geometric flattening (Re − Rp) / Re of a rotationally symmetric body.
   *
   * Applied against `radiusKm`, which is the **volumetric mean** radius, so
   * the figure is volume-preserving: the equatorial semi-axis is
   * `R̄ · (1 − f)^(−1/3)` and the polar one `R̄ · (1 − f)^(2/3)`. Their product
   * `Re² · Rp` is `R̄³` by construction, and `Rp / Re` is `(1 − f)`.
   *
   * **Provenance and the independent check** (standing law 3). Values are
   * derived from JPL Solar System Dynamics' *Planetary Physical Parameters*
   * table (https://ssd.jpl.nasa.gov/planets/phys_par.html, read 2026-07-26),
   * as `f = 1 − (R̄ / Re)³` from that table's own equatorial and volumetric
   * mean radii — **two measured quantities**, so no third constant is
   * transcribed and the check does not pass through `f` itself. Feeding each
   * value back through the formula reproduces the published equatorial radius
   * to 0.015% or better (Jupiter and Saturn to the metre), which is what
   * `astrophysics.test.ts` asserts. The derived values also agree with the
   * NASA planetary fact sheet's own flattening row to four significant
   * figures — a second, independent corroboration.
   *
   * Mars is the one body where the catalog's `radiusKm` (3389) is rounded from
   * the source's 3389.50; `f` is taken from the source pair rather than from
   * the rounded mean, which costs 0.5 km on the rendered equator and keeps the
   * flattening itself right. Deriving it from 3389 instead would inflate `f`
   * by 7.5%, because `f` is a difference of near-equal cubes.
   *
   * Earth is deliberately **not** flagged: 0.00335 is sub-pixel at every
   * framing the app offers, and Earth is the only body with an
   * `atmosphereScattering` shell, whose Nishita integrator assumes a sphere.
   */
  flattening?: number;

  model?: {
    path: string;
    scale?: number;
    rotationOffset?: [number, number, number];
  };

  visualProvenance?: VisualProvenance;
}

export interface DisplayPositionContext {
  body: CelestialBody;
  parentBody?: CelestialBody | null;
  orbitParams?: OrbitParams;
  date: Date;
  scaleMode?: ScaleMode;
}

export interface PhysicalToDisplayPositionContext {
  body: CelestialBody;
  parentBody?: CelestialBody | null;
  positionAU: THREE.Vector3;
  scaleMode?: ScaleMode;
}

export interface SemanticBodyRadiusContext {
  body: CelestialBody;
  scaleMode?: ScaleMode;
}

export interface FocusExtentContext {
  body: CelestialBody;
  bodies: CelestialBody[];
  date: Date;
  scaleMode?: ScaleMode;
}

export type ShadowExtentContext = FocusExtentContext;

/**
 * How long a scale-mode change takes to glide. Long enough that the outer
 * planets visibly travel rather than jump, short enough not to feel like a
 * loading screen. See `AstroPhysics.beginScaleTransition`.
 */
const SCALE_TRANSITION_MS = 2200;

export class AstroPhysics {
  private static interpolateHermite(
    value: number,
    startInput: number,
    endInput: number,
    startOutput: number,
    endOutput: number,
    startSlope: number,
    endSlope: number
  ): number {
    if (endInput <= startInput) {
      return endOutput;
    }

    const t = THREE.MathUtils.clamp(
      (value - startInput) / (endInput - startInput),
      0,
      1
    );
    const h = endInput - startInput;
    const h00 = 2 * t * t * t - 3 * t * t + 1;
    const h10 = t * t * t - 2 * t * t + t;
    const h01 = -2 * t * t * t + 3 * t * t;
    const h11 = t * t * t - t * t;

    return (
      h00 * startOutput +
      h10 * h * startSlope +
      h01 * endOutput +
      h11 * h * endSlope
    );
  }

  private static interpolateLogAnchors(
    value: number,
    anchors: readonly NumericAnchor[]
  ): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }

    const [firstInput, firstOutput] = anchors[0];
    if (value <= firstInput) {
      return THREE.MathUtils.mapLinear(value, 0, firstInput, 0, firstOutput);
    }

    for (let index = 1; index < anchors.length; index++) {
      const [leftInput, leftOutput] = anchors[index - 1];
      const [rightInput, rightOutput] = anchors[index];

      if (value <= rightInput) {
        const t =
          (Math.log10(value) - Math.log10(leftInput)) /
          (Math.log10(rightInput) - Math.log10(leftInput));
        return THREE.MathUtils.lerp(leftOutput, rightOutput, t);
      }
    }

    const [leftInput, leftOutput] = anchors[anchors.length - 2];
    const [rightInput, rightOutput] = anchors[anchors.length - 1];
    const t =
      (Math.log10(value) - Math.log10(leftInput)) /
      (Math.log10(rightInput) - Math.log10(leftInput));
    return THREE.MathUtils.lerp(leftOutput, rightOutput, t);
  }

  static parseScientificValue(value?: string): number {
    if (!value) return Number.NaN;

    const supers: Record<string, string> = {
      "⁰": "0",
      "¹": "1",
      "²": "2",
      "³": "3",
      "⁴": "4",
      "⁵": "5",
      "⁶": "6",
      "⁷": "7",
      "⁸": "8",
      "⁹": "9",
      "⁻": "-",
      "⁺": "+",
    };

    const normalized = value
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/g, (match) => supers[match] ?? match)
      .replace(/[~≈]/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/×\s*10/g, "e")
      .replace(/,/g, "")
      .replace(/\s+/g, "");

    const numeric = normalized.match(/[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);
    if (!numeric) return Number.NaN;

    return Number.parseFloat(numeric[0]);
  }

  /**
   * Calculate position using Keplerian elements
   * @deprecated Use orbitalEngine.calculatePosition() instead. This method is kept for backward compatibility.
   */
  static calculatePhysicalLocalPositionAU(
    orbitParams: OrbitParams,
    date: Date
  ): THREE.Vector3 {
    const d = (date.getTime() - J2000_EPOCH.getTime()) / 86400000;
    const { a, e, i, O, w, M0, n } = orbitParams;
    const M = (M0 + n * d) % 360;
    const rad = Math.PI / 180;
    let E = M * rad;
    for (let k = 0; k < 5; k++)
      E = E - (E - e * Math.sin(E) - M * rad) / (1 - e * Math.cos(E));
    const P = a * (Math.cos(E) - e);
    const Q = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cosO = Math.cos(O * rad),
      sinO = Math.sin(O * rad);
    const cosw = Math.cos(w * rad),
      sinw = Math.sin(w * rad);
    const cosi = Math.cos(i * rad),
      sini = Math.sin(i * rad);
    const x =
      P * (cosw * cosO - sinw * sinO * cosi) -
      Q * (sinw * cosO + cosw * sinO * cosi);
    const y =
      P * (cosw * sinO + sinw * cosO * cosi) +
      Q * (cosw * cosO * cosi - sinw * sinO);
    const z = P * (sinw * sini) + Q * (cosw * sini);
    // Standard position in AU

    return new THREE.Vector3(x, z, -y);
  }

  static mapDidacticHeliocentricDistance(distanceAU: number): number {
    if (!Number.isFinite(distanceAU) || distanceAU <= 0) {
      return 0;
    }

    const [firstDistanceAU, firstVisualDistance] =
      DIDACTIC_HELIOCENTRIC_DISTANCE_ANCHORS[0];
    if (distanceAU <= firstDistanceAU) {
      const [secondDistanceAU, secondVisualDistance] =
        DIDACTIC_HELIOCENTRIC_DISTANCE_ANCHORS[1];
      const outgoingSlopeAtFirstAnchor =
        (secondVisualDistance - firstVisualDistance) /
        (Math.log10(secondDistanceAU) - Math.log10(firstDistanceAU)) /
        (firstDistanceAU * Math.LN10);

      return this.interpolateHermite(
        distanceAU,
        0,
        firstDistanceAU,
        0,
        firstVisualDistance,
        firstVisualDistance / firstDistanceAU,
        outgoingSlopeAtFirstAnchor
      );
    }

    const mapped = this.interpolateLogAnchors(
      distanceAU,
      DIDACTIC_HELIOCENTRIC_DISTANCE_ANCHORS
    );
    return Math.min(mapped, DIDACTIC_HELIOCENTRIC_WORLD_CAP);
  }

  /**
   * Canonical heliocentric AU → world-units transform. THE single
   * authority shared by the body positioner, the grid, and the AU
   * labels so "a planet at v AU sits on the grid feature for v AU"
   * holds by construction in both scale modes.
   *
   * Factored (not re-derived) from the inline logic the body
   * positioner already runs:
   *  - didactic: `mapDidacticHeliocentricDistance(au)` — the exact
   *    compression `calculateLocalPosition` applies at
   *    `astrophysics.ts:439-451` and `mapPhysicalPositionToDisplay`
   *    applies at `:623-626`.
   *  - realistic: `au × AU_TO_3D_UNITS` — the linear scale
   *    `calculateLocalPosition` applies at `:451`.
   *
   * Mirror of the tick-positioning patch in
   * `GridAuLabels.tsx:131-134`. No new physics.
   */
  static auToWorld(au: number, scaleMode: ScaleMode): number {
    const exact = (mode: ScaleMode) =>
      mode === "didactic"
        ? this.mapDidacticHeliocentricDistance(au)
        : au * AU_TO_3D_UNITS;

    // Scale-mode changes glide instead of cutting. See
    // `beginScaleTransition` for why this lives here rather than in the
    // 44 call sites.
    const active = AstroPhysics.scaleTransitionProgress();
    // Blend only for the mode the transition is heading INTO. A caller
    // asking for the mode we are leaving wants that mapping exactly, not a
    // value sliding away from it — inferring the direction from the
    // requested mode instead of recording it made those two cases blend
    // opposite ways.
    if (active === null || active.to !== scaleMode) return exact(scaleMode);

    const t = active.t;
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const from = exact(active.from);
    return from + (exact(scaleMode) - from) * eased;
  }

  /**
   * Start gliding between scale modes.
   *
   * **Why here.** Flipping `scaleMode` used to teleport every body, and the
   * jump *is* the lesson: watching the compression release and the planets
   * rush apart is the clearest statement the app can make about how empty
   * the solar system is. It was a radio button.
   *
   * `auToWorld` is the single chokepoint every position, orbit line, grid
   * ring and region label already routes through, and they all recompute
   * per frame — so blending inside it animates the whole scene without one
   * consumer changing. The alternative, threading a blend factor through 44
   * call sites, is the same behaviour with 44 chances to miss one and
   * desync the grid from the planets, which is a bug this project has
   * already had once.
   *
   * Self-advancing off the wall clock: no ticker, no store subscription,
   * nothing to unmount. When the window elapses the blend stops applying
   * and callers get the exact target mapping again.
   *
   * **Known scope.** Only DISTANCE glides. Body radii also differ between
   * modes (`resolveSemanticBodyRadius`) and still snap on the first frame.
   * Distance is the dominant motion and the part carrying the lesson; the
   * radius pop is one frame at the start, not a drift.
   *
   * **Grid LOD during the glide.** `worldToAu` keeps using the target
   * mode's exact inverse, so decade selection can lag the moving rings by
   * up to the transition window. Ring RADII come from `auToWorld` and move
   * with the planets, so nothing drifts apart on screen — only which
   * decade is chosen is briefly early or late.
   */
  static beginScaleTransition(
    from: ScaleMode,
    to: ScaleMode,
    nowMs: number = Date.now()
  ): void {
    if (from === to) return;
    AstroPhysics.scaleTransition = { from, to, startMs: nowMs };
  }

  /**
   * The in-flight transition and its raw progress in `[0, 1)`, or `null`
   * when there is nothing to blend. Self-clearing: the first read past the
   * window drops the state.
   */
  static scaleTransitionProgress(
    nowMs: number = Date.now()
  ): { from: ScaleMode; to: ScaleMode; t: number } | null {
    const active = AstroPhysics.scaleTransition;
    if (active === null) return null;
    const t = (nowMs - active.startMs) / SCALE_TRANSITION_MS;
    if (t >= 1 || t < 0) {
      AstroPhysics.scaleTransition = null;
      return null;
    }
    return { from: active.from, to: active.to, t };
  }

  /** Test seam — drops any in-flight transition. */
  static resetScaleTransition(): void {
    AstroPhysics.scaleTransition = null;
  }

  private static scaleTransition: {
    from: ScaleMode;
    to: ScaleMode;
    startMs: number;
  } | null = null;

  /**
   * Inverse of {@link auToWorld}: world-units → effective heliocentric
   * AU. Lets a consumer holding a world-space distance (e.g. the grid
   * driving its decade from `camera.position.length()`) recover the
   * AU it represents, so decade selection happens in the SAME space
   * the bodies are positioned in.
   *
   * - realistic: trivial linear inverse `world / AU_TO_3D_UNITS`.
   * - didactic: monotonic inverse of the (uncapped) compression curve
   *   via binary search over `DIDACTIC_HELIOCENTRIC_DISTANCE_ANCHORS`.
   *
   * **Saturated regime (the cap).** `mapDidacticHeliocentricDistance`
   * is hard-capped at `DIDACTIC_HELIOCENTRIC_WORLD_CAP` (3200 world
   * units), reached at ≈323 AU — so it is NOT invertible beyond the
   * cap (every farther AU maps to the same 3200). This method handles
   * that explicitly: for `world ≥ cap` it returns the fixed
   * saturation AU (`DIDACTIC_SATURATION_AU`) rather than NaN, a
   * frozen value, or a runaway search result. A consumer past the cap
   * therefore keeps reading a finite, bounded effective-AU — its
   * decade simply stops advancing, exactly as the planet positions
   * (which also cap at 3200) stop moving outward. Below the cap the
   * inverse is exact (round-trips `auToWorld`).
   */
  static worldToAu(world: number, scaleMode: ScaleMode): number {
    if (scaleMode === "realistic") {
      return world / AU_TO_3D_UNITS;
    }

    if (!Number.isFinite(world) || world <= 0) {
      return 0;
    }

    // Past the cap the forward curve is flat → no unique inverse.
    // Return the fixed saturation AU so callers stay finite + bounded.
    if (world >= DIDACTIC_HELIOCENTRIC_WORLD_CAP) {
      return DIDACTIC_SATURATION_AU;
    }

    // Monotonic-increasing curve over (0, DIDACTIC_SATURATION_AU];
    // binary-search in log space (the curve is ~log-linear). 60
    // iterations resolves AU to ~machine precision over this domain.
    let lowAU = 0;
    let highAU = DIDACTIC_SATURATION_AU;
    for (let iteration = 0; iteration < 60; iteration++) {
      const midAU = 0.5 * (lowAU + highAU);
      if (this.mapDidacticHeliocentricDistance(midAU) < world) {
        lowAU = midAU;
      } else {
        highAU = midAU;
      }
    }
    return 0.5 * (lowAU + highAU);
  }

  static resolveParallelLightReferencePoint(
    localSunPosition: THREE.Vector3,
    referenceDistance: number = 1e6
  ): THREE.Vector3 {
    if (localSunPosition.lengthSq() <= 1e-12) {
      return new THREE.Vector3(0, 0, referenceDistance);
    }

    return localSunPosition
      .clone()
      .normalize()
      .multiplyScalar(referenceDistance);
  }

  /**
   * Obliquity: the angle between the spin axis and the ORBITAL normal.
   *
   * Not the angle to ecliptic north. That distinction is the whole point —
   * Mercury's IAU pole sits 7.01° from ecliptic north while its obliquity is
   * 0.03°, because Mercury's orbit is itself inclined 7°. Deriving from ecliptic
   * north would be wrong by 6.98° for Mercury, 176.1° for Venus (reporting a
   * retrograde body as prograde) and 15.5° for Uranus, and right only for Earth,
   * whose orbit *is* the ecliptic.
   *
   * Four inputs: the IAU pole, the obliquity of the ecliptic (to rotate that
   * pole into the frame the orbit lives in), the orbit normal from the record's
   * own `i`/`Ω`, and the rotation sense — taken from the IAU model's own Ẇ,
   * for the reason spelled out at the return statement.
   *
   * Returns null when the body has no measured pole, or when its orbit is
   * referred to a plane the catalog does not record — every satellite today.
   */
  static resolveObliquityDeg(body: CelestialBody): number | null {
    const orientation = resolveBodyIauOrientation(body);
    if (!orientation) return null;
    // Satellite inclinations are referred to a mix of Laplace and
    // parent-equatorial planes with no field saying which, so the orbit normal
    // cannot be built for them.
    if (body.parentId) return null;

    // The pole comes from `bodyOrientation`, which is the one place that turns
    // (α₀, δ₀) into an ecliptic vector. This function used to hand-roll that
    // rotation with its own copy of the obliquity — the same duplication the
    // W6 helper exists to end. Evaluated at J2000, matching the epoch the
    // catalog's `axialTilt` values are quoted at.
    const [px, py, pz] = resolveIauOrientation(orientation, J2000_JD).poleEcl;
    const pole = new THREE.Vector3(px, py, pz);

    const inc = THREE.MathUtils.degToRad(body.orbit.i);
    const node = THREE.MathUtils.degToRad(body.orbit.O);
    const orbitNormal = new THREE.Vector3(
      Math.sin(inc) * Math.sin(node),
      -Math.sin(inc) * Math.cos(node),
      Math.cos(inc)
    );

    const angle = THREE.MathUtils.radToDeg(pole.angleTo(orbitNormal));
    // Obliquity is the angle between the **angular momentum** vector and the
    // orbit normal, and the IAU north pole is not always the angular-momentum
    // direction: the convention picks the pole on the north side of the
    // invariable plane, so a retrograde rotator spins clockwise about it and
    // its angular momentum points the other way. Hence the 180° complement.
    //
    // The sign must come from the IAU model's own Ẇ, not from
    // `rotationPeriodHours`. The two disagree for Pluto — the catalog marks it
    // −153.3 h (retrograde, true **of its orbit**) while `BODY999_PM` advances
    // at +56.36°/day (prograde about the IAU pole, also true) — and reading
    // the catalog field returned 60.38° for a body whose obliquity is 119.59°.
    // Venus and Uranus are unaffected: their kernel rates are negative too.
    return orientation.spinRateDegPerDay < 0 ? 180 - angle : angle;
  }

  /**
   * Where a body sits relative to the Sun, seen from Earth.
   *
   * `elongationDeg` is the Sun–Earth–body angle: 0° means the body is in the
   * Sun's direction, 180° means opposite it. `illuminatedFraction` is the lit
   * fraction of the disc, from the Sun–body–Earth phase angle.
   *
   * Purely geometric, from body centres. There is no observer location in this
   * app, so this states where a body IS relative to the Sun — never that it
   * will be visible. No atmosphere, no refraction, no twilight, no horizon.
   *
   * Both vectors must be heliocentric AU (see
   * `src/lib/orbital/heliocentric.ts`); passing a parent-centred satellite
   * vector silently yields the parent's answer.
   */
  static resolveSkyGeometry(
    bodyHelioAU: THREE.Vector3,
    earthHelioAU: THREE.Vector3
  ): { elongationDeg: number; illuminatedFraction: number } | null {
    const earthToBody = bodyHelioAU.clone().sub(earthHelioAU);
    const earthToSun = earthHelioAU.clone().negate();
    if (earthToBody.lengthSq() < 1e-12 || earthToSun.lengthSq() < 1e-12) {
      return null;
    }

    const elongationDeg = THREE.MathUtils.radToDeg(
      earthToSun.angleTo(earthToBody)
    );

    // Phase angle is measured AT the body, between the Sun and Earth.
    const bodyToSun = bodyHelioAU.clone().negate();
    const bodyToEarth = earthHelioAU.clone().sub(bodyHelioAU);
    if (bodyToSun.lengthSq() < 1e-12)
      return { elongationDeg, illuminatedFraction: 1 };
    const phase = bodyToSun.angleTo(bodyToEarth);

    return {
      elongationDeg,
      illuminatedFraction: (1 + Math.cos(phase)) / 2,
    };
  }

  static resolveOrbitDistanceBoundsAU(orbitParams: OrbitParams): {
    minAU: number;
    maxAU: number;
  } {
    const semiMajorAxis = Math.max(orbitParams.a, 0);
    const eccentricity = THREE.MathUtils.clamp(orbitParams.e, 0, 0.999999);
    const periapsisAU = semiMajorAxis * (1 - eccentricity);
    const apoapsisAU = semiMajorAxis * (1 + eccentricity);

    return {
      minAU: Math.min(periapsisAU, apoapsisAU),
      maxAU: Math.max(periapsisAU, apoapsisAU),
    };
  }

  static calculateLocalPosition(
    orbitParams: OrbitParams,
    date: Date,
    scaleMode: ScaleMode = "realistic"
  ): THREE.Vector3 {
    const posAU = this.calculatePhysicalLocalPositionAU(orbitParams, date);

    if (scaleMode === "didactic") {
      const visualDistance = this.mapDidacticHeliocentricDistance(
        posAU.length()
      );

      if (visualDistance <= 0 || posAU.lengthSq() <= 0) {
        return new THREE.Vector3(0, 0, 0);
      }

      return posAU.normalize().multiplyScalar(visualDistance);
    }

    return posAU.multiplyScalar(AU_TO_3D_UNITS);
  }

  static calculateDidacticRadius(radiusKm: number): number {
    return this.interpolateLogAnchors(radiusKm, DIDACTIC_RADIUS_ANCHORS);
  }

  static classifyDidacticOrbit(
    body: CelestialBody,
    parentBody?: CelestialBody | null
  ): DidacticOrbitClass {
    if (!body.parentId) {
      return "heliocentric";
    }

    if (body.parentId === "sun" || parentBody?.type === "star") {
      return "heliocentric";
    }

    return "subsystem";
  }

  /**
   * Per-axis figure of a body as multipliers on its mean radius, in **scene
   * axis order** `(x, y, z)` with **y the spin axis**, normalised so the
   * largest component is exactly `1`.
   *
   * Two sources, mutually exclusive by catalog contract:
   *
   * - `shapeScale` is in publication order `[a, b, c]` (semi-major,
   *   intermediate, minor). A relaxed rotator spins about its **short** axis,
   *   so this maps `(x, y, z) = (a, c, b)`. Getting that mapping wrong puts the
   *   intermediate axis at the pole, which is dynamically impossible and, worse,
   *   renders a *larger* silhouette swing than the truth — a wrong answer that
   *   photographs better. `celestialBodies.test.ts` pins `y === min(...)` for
   *   every triaxial rotator precisely because no visual check can catch it.
   * - `flattening` gives the volume-preserving oblate figure
   *   `((1−f)^(−1/3), (1−f)^(2/3), (1−f)^(−1/3))`. **Not** `y *= (1 − f)`:
   *   `radiusKm` is the volumetric mean, so squashing only the pole would leave
   *   Jupiter's equator 1.4% and its pole 2.2% small.
   *
   * Scale-mode independent on purpose — the renderer bakes this ratio into a
   * memoised geometry, and keying that geometry on scale mode would rebuild it
   * on every didactic/realistic toggle.
   */
  static resolveBodyFigureRatio(body: CelestialBody): [number, number, number] {
    let axes: [number, number, number];

    if (body.shapeScale) {
      const [a, b, c] = body.shapeScale;
      // (x, y, z) = (a, c, b) — spin about the short axis c.
      axes = [Math.abs(a), Math.abs(c), Math.abs(b)];
    } else if (body.flattening) {
      const oblate = 1 - body.flattening;
      const equatorial = Math.pow(oblate, -1 / 3);
      const polar = Math.pow(oblate, 2 / 3);
      axes = [equatorial, polar, equatorial];
    } else {
      return [1, 1, 1];
    }

    const longest = Math.max(axes[0], axes[1], axes[2]);
    if (!Number.isFinite(longest) || longest <= 0) return [1, 1, 1];
    return [axes[0] / longest, axes[1] / longest, axes[2] / longest];
  }

  /**
   * Absolute per-axis semi-axes in world units, in scene axis order with y the
   * spin axis. Its largest component equals `resolveSemanticBodyRadius` **by
   * construction** — both read the same ratio helper — which is the identity
   * every bounds and framing consumer depends on.
   */
  static resolveBodyAxisScale({
    body,
    scaleMode = "realistic",
  }: SemanticBodyRadiusContext): [number, number, number] {
    const semanticRadius = this.resolveSemanticBodyRadius({ body, scaleMode });
    const ratio = this.resolveBodyFigureRatio(body);
    return [
      semanticRadius * ratio[0],
      semanticRadius * ratio[1],
      semanticRadius * ratio[2],
    ];
  }

  /**
   * The body's **largest** semi-axis in world units.
   *
   * Max, not mean, and that is the right choice for every live consumer: it is
   * the upper bound framing, focus extent and near-plane logic need, and it is
   * stable across a spin, whereas a projected radius would flicker Quaoar's
   * texture tier twice per 17.68 h period.
   *
   * Note that "max = equatorial" is an accident of biaxial figures. For a
   * triaxial body the max is the **longest equatorial** semi-axis, which no
   * published ring ratio is quoted against — harmless while Saturn is the only
   * `ringSystem`, but Quaoar is simultaneously the one triaxial record and one
   * whose own prose mentions a ring, so read `resolveRingOuterRadius` before
   * assuming the two compose.
   */
  static resolveSemanticBodyRadius({
    body,
    scaleMode = "realistic",
  }: SemanticBodyRadiusContext): number {
    const baseRadius =
      scaleMode === "didactic"
        ? this.calculateDidacticRadius(body.radiusKm)
        : body.radiusKm * KM_TO_3D_UNITS;

    if (body.shapeScale) {
      const [sx, sy, sz] = body.shapeScale;
      return baseRadius * Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz));
    }
    if (body.flattening) {
      // Equatorial semi-axis of the volume-preserving oblate figure.
      return baseRadius * Math.pow(1 - body.flattening, -1 / 3);
    }
    return baseRadius;
  }

  static resolveRingOuterRadius(
    body: CelestialBody,
    scaleMode: ScaleMode = "realistic"
  ): number {
    if (!body.ringSystem) {
      return 0;
    }

    return (
      this.resolveSemanticBodyRadius({ body, scaleMode }) *
      body.ringSystem.outerRadius
    );
  }

  private static mapDidacticSubsystemDistance(
    distanceAU: number,
    parentBody: CelestialBody,
    body: CelestialBody
  ): number {
    const parentSemanticRadius = this.resolveSemanticBodyRadius({
      body: parentBody,
      scaleMode: "didactic",
    });
    const childSemanticRadius = this.resolveSemanticBodyRadius({
      body,
      scaleMode: "didactic",
    });

    const physicalParentRadii =
      (distanceAU * AU_IN_KM) / Math.max(parentBody.radiusKm, 1e-9);
    const localParentRadii = THREE.MathUtils.clamp(
      2.2 + 0.95 * Math.pow(physicalParentRadii, 0.55),
      3,
      15
    );

    const displayDistance = localParentRadii * parentSemanticRadius;
    let minimumDistance = parentSemanticRadius + childSemanticRadius + 2;

    if (parentBody.ringSystem) {
      // W5 stage B / F-09 — ring ratios are published against the parent's
      // EQUATORIAL radius, so the reach must be measured from the equatorial
      // radius too. `radiusKm` is the volumetric mean, which for Saturn is
      // 3.5% smaller and put the didactic ring reach short by the same amount.
      // `resolveSemanticBodyRadius` in realistic mode IS the equatorial radius
      // in world units, so dividing by `KM_TO_3D_UNITS` recovers it in km
      // without a second copy of the figure math.
      //
      // Deliberately NOT the same fix as `physicalParentRadii` above, which
      // wants the mean radius for moon-distance compression and is correct.
      const parentEquatorialKm =
        this.resolveSemanticBodyRadius({
          body: parentBody,
          scaleMode: "realistic",
        }) / KM_TO_3D_UNITS;
      const ringOuterPhysicalAU =
        (parentEquatorialKm * parentBody.ringSystem.outerRadius) / AU_IN_KM;

      if (distanceAU > ringOuterPhysicalAU) {
        minimumDistance = Math.max(
          minimumDistance,
          this.resolveRingOuterRadius(parentBody, "didactic") +
            childSemanticRadius +
            2
        );
      }
    }

    return Math.max(displayDistance, minimumDistance);
  }

  static resolveDisplayOrbitDistanceBounds({
    body,
    parentBody = null,
    orbitParams = body.orbit,
    scaleMode = "realistic",
  }: Omit<DisplayPositionContext, "date">): { min: number; max: number } {
    if (body.type === "star" || orbitParams.a === 0) {
      return { min: 0, max: 0 };
    }

    const { minAU, maxAU } = this.resolveOrbitDistanceBoundsAU(orbitParams);

    if (scaleMode === "realistic") {
      return {
        min: minAU * AU_TO_3D_UNITS,
        max: maxAU * AU_TO_3D_UNITS,
      };
    }

    const orbitClass = this.classifyDidacticOrbit(body, parentBody);

    if (orbitClass === "heliocentric" || !parentBody) {
      return {
        min: this.mapDidacticHeliocentricDistance(minAU),
        max: this.mapDidacticHeliocentricDistance(maxAU),
      };
    }

    return {
      min: this.mapDidacticSubsystemDistance(minAU, parentBody, body),
      max: this.mapDidacticSubsystemDistance(maxAU, parentBody, body),
    };
  }

  static resolveDisplayLocalPosition({
    body,
    parentBody = null,
    orbitParams = body.orbit,
    date,
    scaleMode = "realistic",
  }: DisplayPositionContext): THREE.Vector3 {
    if (scaleMode === "realistic") {
      return this.calculateLocalPosition(orbitParams, date, "realistic");
    }

    if (body.type === "star" || orbitParams.a === 0) {
      return new THREE.Vector3(0, 0, 0);
    }

    const posAU = this.calculatePhysicalLocalPositionAU(orbitParams, date);
    return this.mapPhysicalPositionToDisplay({
      body,
      parentBody,
      positionAU: posAU,
      scaleMode,
    });
  }

  static mapPhysicalPositionToDisplay({
    body,
    parentBody = null,
    positionAU,
    scaleMode = "realistic",
  }: PhysicalToDisplayPositionContext): THREE.Vector3 {
    if (scaleMode === "realistic") {
      return positionAU.clone().multiplyScalar(AU_TO_3D_UNITS);
    }

    if (body.type === "star" || positionAU.lengthSq() <= 0) {
      return new THREE.Vector3(0, 0, 0);
    }

    const distanceAU = positionAU.length();
    if (distanceAU <= 0) {
      return new THREE.Vector3(0, 0, 0);
    }

    const direction = positionAU.clone().normalize();
    const orbitClass = this.classifyDidacticOrbit(body, parentBody);

    if (orbitClass === "heliocentric" || !parentBody) {
      return direction.multiplyScalar(
        this.mapDidacticHeliocentricDistance(distanceAU)
      );
    }

    return direction.multiplyScalar(
      this.mapDidacticSubsystemDistance(distanceAU, parentBody, body)
    );
  }

  static getDisplayOrbitPoints({
    body,
    parentBody = null,
    segments = 1024,
    scaleMode = "realistic",
  }: {
    body: CelestialBody;
    parentBody?: CelestialBody | null;
    segments?: number;
    scaleMode?: ScaleMode;
  }): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const period = 360 / (body.orbit.n || 0.001);
    for (let j = 0; j <= segments; j++) {
      const t = new Date(
        J2000_EPOCH.getTime() + (j / segments) * period * 86400000
      );
      pts.push(
        this.resolveDisplayLocalPosition({
          body,
          parentBody,
          date: t,
          scaleMode,
        })
      );
    }
    return pts;
  }

  static resolveFocusExtent({
    body,
    bodies,
    scaleMode = "realistic",
  }: FocusExtentContext): number {
    const semanticBodyRadius = this.resolveSemanticBodyRadius({
      body,
      scaleMode,
    });
    const ringOuterRadius = this.resolveRingOuterRadius(body, scaleMode);
    let extent = Math.max(semanticBodyRadius, ringOuterRadius);

    // The system-wide overview walk below was didactic-only until the
    // realistic-mode boot needed one too (owner decision 2026-07-29,
    // `tasks/waves/lighting-redesign-2026-07-28.md` "queue step 2"): the
    // app now boots into REALISTIC scale on a system overview, camera far
    // enough to show every planetary orbit, planets rendered as the
    // point-lights they really are from that distance (NASA-Eyes style).
    //
    // The realistic branch stays scoped to the ONE caller that needs a
    // whole-system extent — a Sun focus — rather than every body. Widening
    // it unconditionally would also re-frame e.g. "focus Jupiter" in
    // realistic mode to include Callisto's true ~1.9M km orbit (versus
    // Jupiter's own ~0.48 world-unit radius), a large, unrequested
    // behavior change to an already-shipped, user-selectable mode. Every
    // non-Sun body's realistic-mode focus extent is therefore unchanged.
    const isRealisticSunOverview =
      scaleMode === "realistic" && body.id === "sun";
    if (scaleMode !== "didactic" && !isRealisticSunOverview) {
      return extent;
    }

    const directChildren = bodies.filter((candidate) => {
      if (body.id === "sun") {
        if (candidate.id === "sun") {
          return false;
        }

        return (
          !candidate.parentId &&
          (candidate.type === "planet" ||
            (candidate.type === "dwarf" && candidate.orbit.a <= 40))
        );
      }

      return candidate.parentId === body.id;
    });

    for (const child of directChildren) {
      // Mirrors the didactic walk's inclusion set exactly (same filter
      // above); only the scale used to measure each child's reach
      // changes, so a realistic-mode Sun overview reaches Pluto's real
      // ~49.3 AU aphelion instead of the didactic-compressed distance.
      const childDisplayDistance = this.resolveDisplayOrbitDistanceBounds({
        body: child,
        parentBody: body,
        scaleMode,
      }).max;
      const childSemanticRadius = this.resolveSemanticBodyRadius({
        body: child,
        scaleMode,
      });
      extent = Math.max(extent, childDisplayDistance + childSemanticRadius);
    }

    return extent;
  }

  static resolveShadowExtent({
    body,
    bodies,
    date,
    scaleMode = "realistic",
  }: ShadowExtentContext): number {
    const semanticBodyRadius = this.resolveSemanticBodyRadius({
      body,
      scaleMode,
    });
    const ringOuterRadius = this.resolveRingOuterRadius(body, scaleMode);
    const baseExtent = Math.max(semanticBodyRadius, ringOuterRadius);

    if (scaleMode !== "didactic") {
      return baseExtent;
    }

    const cameraExtent = this.resolveFocusExtent({
      body,
      bodies,
      date,
      scaleMode,
    });
    const cappedContextExtent = Math.max(
      baseExtent,
      Math.min(cameraExtent, baseExtent * 3)
    );

    return cappedContextExtent;
  }

  // Physics Helpers
  static calculateOrbitalVelocity(
    orbitParams: OrbitParams,
    currentDistanceAU: number,
    parentMassKg: number
  ): number {
    // Vis-viva equation: v = sqrt(GM * (2/r - 1/a))
    // G = 6.67430e-11 m^3 kg^-1 s^-2
    // But we can simplify for solar system relative to Earth/Sun if needed,
    // or use standard units. Let's use standard SI units.

    if (
      currentDistanceAU <= 0 ||
      !Number.isFinite(parentMassKg) ||
      parentMassKg <= 0
    ) {
      return Number.NaN;
    }

    const G = 6.6743e-11;
    const r = currentDistanceAU * AU_IN_KM * 1000; // meters
    const a = orbitParams.a * AU_IN_KM * 1000; // meters (semi-major axis)

    // If a is 0 (Sun), velocity is 0 (relative to itself)
    if (a === 0) return 0;

    // For circular approximation if e is small, v = sqrt(GM/r)
    // For elliptical: v = sqrt(GM * (2/r - 1/a))

    const v = Math.sqrt(G * parentMassKg * (2 / r - 1 / a));
    return v / 1000; // km/s
  }

  static calculateEscapeVelocity(massKg: number, radiusKm: number): number {
    // v_e = sqrt(2GM/r)
    if (!Number.isFinite(massKg) || massKg <= 0 || radiusKm <= 0) {
      return Number.NaN;
    }

    const G = 6.6743e-11;
    const r = radiusKm * 1000; // meters
    const v = Math.sqrt((2 * G * massKg) / r);
    return v / 1000; // km/s
  }
}
