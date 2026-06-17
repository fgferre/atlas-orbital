import * as THREE from "three";

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
  axialTilt: number; // Axial tilt in degrees
  rotationOffsetDegrees?: number; // Rotation offset at epoch for time synchronization (optional, default 0)
  rotationEpoch?: string; // ISO date for rotation reference (optional, default J2000.0)
  poleRA?: number; // Right Ascension of North Pole in degrees (IAU)
  poleDec?: number; // Declination of North Pole in degrees (IAU)

  // Enhanced Data Fields
  classification?: string; // e.g. "Terrestrial Planet", "Gas Giant"
  mass?: string;
  gravity?: string;
  composition?: string;
  atmosphere?: string;
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

  // Optional non-uniform scale for observation-based ellipsoids.
  shapeScale?: [number, number, number];

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
    return scaleMode === "didactic"
      ? this.mapDidacticHeliocentricDistance(au)
      : au * AU_TO_3D_UNITS;
  }

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

  static resolveSemanticBodyRadius({
    body,
    scaleMode = "realistic",
  }: SemanticBodyRadiusContext): number {
    const baseRadius =
      scaleMode === "didactic"
        ? this.calculateDidacticRadius(body.radiusKm)
        : body.radiusKm * KM_TO_3D_UNITS;

    const [sx, sy, sz] = body.shapeScale ?? [1, 1, 1];
    const shapeMultiplier = Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz));
    return baseRadius * shapeMultiplier;
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
      const ringOuterPhysicalAU =
        (parentBody.radiusKm * parentBody.ringSystem.outerRadius) / AU_IN_KM;

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

    if (scaleMode !== "didactic") {
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
      const childDisplayDistance = this.resolveDisplayOrbitDistanceBounds({
        body: child,
        parentBody: body,
        scaleMode: "didactic",
      }).max;
      const childSemanticRadius = this.resolveSemanticBodyRadius({
        body: child,
        scaleMode: "didactic",
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

  /**
   * Calculate rotation angle synchronized with real astronomical time
   * @param date Current date/time
   * @param rotationPeriodHours Sidereal rotation period in hours (negative for retrograde)
   * @param rotationOffsetDegrees Rotation offset at epoch in degrees (default 0)
   * @param rotationEpoch Reference date for the offset (default J2000.0)
   * @returns Rotation angle in radians
   */
  static calculateRotationAngle(
    date: Date,
    rotationPeriodHours: number,
    rotationOffsetDegrees: number = 0,
    rotationEpoch: Date = new Date("2000-01-01T12:00:00Z")
  ): number {
    const elapsed = date.getTime() - rotationEpoch.getTime();
    const elapsedHours = elapsed / 3600000;
    const rotations = elapsedHours / rotationPeriodHours;
    const angle = (rotations * 360 + rotationOffsetDegrees) % 360;
    return (angle * Math.PI) / 180; // Convert to radians
  }

  /**
   * Convert Equatorial Coordinates (RA, Dec) to Ecliptic Cartesian Vector
   * Used for orienting planetary poles correctly in the scene.
   * @param ra Right Ascension in degrees
   * @param dec Declination in degrees
   * @returns Normalized Vector3 representing the pole direction in Ecliptic space
   */
  static equatorialToEcliptic(ra: number, dec: number): THREE.Vector3 {
    const rad = Math.PI / 180;
    const alpha = ra * rad;
    const delta = dec * rad;

    // 1. Convert to Equatorial Cartesian (ICRF)
    // x points to Vernal Equinox
    // z points to Celestial North Pole
    const x = Math.cos(delta) * Math.cos(alpha);
    const y = Math.cos(delta) * Math.sin(alpha);
    const z = Math.sin(delta);

    // 2. Rotate to Ecliptic System
    // Rotate around X-axis by Earth's obliquity (epsilon)
    // epsilon ~ 23.43928 degrees
    const epsilon = 23.43928 * rad;
    const cosE = Math.cos(epsilon);
    const sinE = Math.sin(epsilon);

    // Rotation Matrix (X-axis rotation)
    // [ 1    0      0    ]
    // [ 0   cosE   sinE  ]
    // [ 0  -sinE   cosE  ]

    // However, we want to go from Equatorial TO Ecliptic.
    // The Ecliptic is tilted relative to Equatorial.
    // Usually, we define Ecliptic as the "flat" plane (XZ in our scene).
    // So we need to rotate the Equatorial vector by -epsilon (or +epsilon depending on definition).
    // Let's verify: North Celestial Pole (0, 0, 1) should become tilted by 23.44 deg.
    // If we rotate by -epsilon around X:
    // y' = y*cos(-e) - z*sin(-e) = y*cos(e) + z*sin(e)
    // z' = y*sin(-e) + z*cos(-e) = -y*sin(e) + z*cos(e)
    // For NCP (0,0,1): y'=sin(e), z'=cos(e). This tilts it "back" towards +Y.
    // Wait, in Three.js usually Y is up.
    // Let's assume our Scene: XZ is orbital plane (Ecliptic). Y is Ecliptic North.
    // So (0, 1, 0) is Ecliptic North Pole.
    // Earth's axis is tilted 23.44 deg from this.
    // The NCP (Equatorial North) is tilted 23.44 deg from Ecliptic North.

    // Let's stick to standard conversion:
    // Equatorial (x, y, z) -> Ecliptic (x', y', z')
    // x' = x
    // y' = y * cos(e) + z * sin(e)
    // z' = -y * sin(e) + z * cos(e)

    const y_ecl = y * cosE + z * sinE;
    const z_ecl = -y * sinE + z * cosE;

    // Now map to Three.js coordinates
    // Standard Astronomy: X=Vernal Equinox, Y=90deg East, Z=North Pole
    // Three.js Scene: X=Right, Y=Up, Z=Back (or similar)
    // In our app:
    // XZ plane is the orbit plane.
    // Y is Up (Ecliptic North).
    // So we map:
    // Astro X -> Three X
    // Astro Y -> Three -Z (since Z is usually "depth") or just Z?
    // Let's check calculateLocalPosition:
    // const posAU = new THREE.Vector3(x, z, -y);
    // It maps Astro X -> Three X
    // Astro Z (Up/North) -> Three Y
    // Astro Y -> Three -Z

    // So for our pole vector:
    // Astro x' -> Three X
    // Astro z' (Ecliptic North component) -> Three Y
    // Astro y' -> Three -Z

    return new THREE.Vector3(x, z_ecl, -y_ecl).normalize();
  }
}
