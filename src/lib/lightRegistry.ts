/**
 * CPU-side light registry for the Gaia Sky LightGlow port (θ.3).
 *
 * Gaia Sky's `LightPositionUpdater.run()` walks the render list once per
 * frame, picks the first N billboard stars in the proximity order, and
 * uploads their normalised screen positions, solid angles, and RGB
 * colours to the LightGlow post-process. Atlas mirrors that here with
 * one adaptation:
 *
 *   **HYG star selection uses pseudo-size / distance** (Gaia's
 *   `solidAngleApparent`) rather than proximity list order, since
 *   atlas doesn't maintain a frame-by-frame proximity sort in the
 *   first place. Picks the top-N stars in the camera frustum by
 *   clamped solid angle.
 *
 * `MAX_LIGHTS = 8` matches the `#define N 8` hardcoded in
 * `lightglow.vert.glsl` and `lightglow.frag.glsl`.
 *
 * Per-tier `nLights` matches `Settings.java:672` (`getGlowNLights`):
 *   low      → 4
 *   normal   → 5
 *   high     → 6
 *   ultra    → 8
 *
 * The registry output format matches Gaia's GlowFilter uniforms:
 *   positions     : Float32Array(N × 2)  — NDC [0, 1]
 *   solidAngles   : Float32Array(N)      — apparent view angle radians
 *   colors        : Float32Array(N × 3)  — linear RGB ∈ [0, 1]
 *   nLights       : number               — count of ACTIVE lights this frame
 */

import * as THREE from "three";
import type { HygCatalogData } from "./starfield";
import {
  absoluteMagnitudeToPseudoSize,
  apparentToAbsMag,
  STAR_SIZE_FACTOR,
} from "./starPhysics";
import {
  gaiaBvToRgb,
  MAX_QUAD_SOLID_ANGLE_LITERAL,
  saturateStarRgb,
  U_MIN_QUAD_SOLID_ANGLE_1440P_BASELINE,
} from "./starfieldShaderMath";

/** Shader `#define N 8` — must match `lightglow.vert.glsl` + `.frag.glsl`. */
export const MAX_LIGHTS = 8;

/**
 * DISTANCE_SCALE from Starfield.tsx — 1 parsec = 206,265,000 scene
 * units. Used to convert HYG parsec positions to scene-space for the
 * projection step.
 */
export const DISTANCE_SCALE = 206_265_000.0;

/**
 * Default star-brightness multiplier fed into `solidAngleApparent`.
 * Matches Gaia Sky's `GraphUpdater.java:182` formula for star-type
 * particles:
 *   solidAngleApparent = (radius / dist) × scene.star.brightness / fovFactor
 * with `scene.star.brightness = 2.22` (config.yaml).
 */
export const STAR_BRIGHTNESS_DEFAULT = 2.22;

/**
 * Gaia's reference FOV baseline. `AbstractCamera.java:42` pins
 * `TAN_REF_FOV = tan(40° / 2)`, and `fovFactor = tan(fov/2) / TAN_REF_FOV`.
 * Exposed so callers can compute a matching scalar in atlas.
 */
export const GAIA_FOV_FACTOR_REFERENCE_DEG = 40.0;

/**
 * Compute `fovFactor` mirroring Gaia Sky's `AbstractCamera.java:148`:
 *   tan(fovDeg/2) / tan(20°)
 * Returns 1.0 at the reference 40° FOV. Atlas's 45° camera yields
 * ≈ 1.138; a hypothetical 60° FOV would return ≈ 1.586.
 */
export const computeFovFactor = (fovDeg: number): number => {
  const toRad = Math.PI / 180.0;
  const tanRef = Math.tan((GAIA_FOV_FACTOR_REFERENCE_DEG * toRad) / 2);
  return Math.tan((fovDeg * toRad) / 2) / tanRef;
};

/**
 * Per-tier `nLights` — matches `Settings.java:672` (`getGlowNLights`)
 * directly. Keeps atlas within the hardcoded shader `#define N 8`
 * budget regardless of tier.
 */
export type LightGlowTier = "low" | "normal" | "high" | "ultra";
export const LIGHT_GLOW_N_LIGHTS_BY_TIER: Readonly<
  Record<LightGlowTier, number>
> = {
  low: 4,
  normal: 5,
  high: 6,
  ultra: 8,
};

export interface LightRegistryOutput {
  /** [x0, y0, x1, y1, …] in NDC [0,1]. Length = MAX_LIGHTS × 2. */
  positions: Float32Array;
  /** Apparent view angle (rad) per slot. Length = MAX_LIGHTS. */
  solidAngles: Float32Array;
  /** Linear RGB per slot. Length = MAX_LIGHTS × 3. */
  colors: Float32Array;
  /** Active count ∈ [0, nSlots]. */
  nLights: number;
}

export const makeEmptyRegistry = (): LightRegistryOutput => ({
  positions: new Float32Array(MAX_LIGHTS * 2),
  solidAngles: new Float32Array(MAX_LIGHTS),
  colors: new Float32Array(MAX_LIGHTS * 3),
  nLights: 0,
});

/**
 * Project a world-space point into NDC [0, 1] via the supplied camera.
 * Returns `null` when the point is outside the Three.js clip volume
 * (NDC x/y/z each in [-1, 1]) — those lights never contribute glow.
 *
 * Three.js's `Vector3.project(camera)` outputs NDC [-1, 1]; we rescale
 * to [0, 1] to match Gaia's `auxV.x / w` convention from
 * `LightPositionUpdater.java:124`.
 */
const projectionTarget = new THREE.Vector3();

export const projectToNdc01 = (
  worldPosition: THREE.Vector3 | readonly [number, number, number],
  camera: THREE.Camera
): [number, number] | null => {
  if (Array.isArray(worldPosition)) {
    projectionTarget.set(worldPosition[0], worldPosition[1], worldPosition[2]);
  } else {
    projectionTarget.copy(worldPosition as THREE.Vector3);
  }
  projectionTarget.project(camera);
  const { x, y, z } = projectionTarget;
  // Gaia skips lights outside the frustum via the camera angle gate;
  // we use Three.js's standard clip-space bounds instead.
  if (z < -1 || z > 1 || x < -1 || x > 1 || y < -1 || y > 1) {
    return null;
  }
  return [(x + 1) * 0.5, (y + 1) * 0.5];
};

/**
 * Clamp a raw solid angle through the same `[min, 3e-8]` band the
 * vertex shader uses, so downstream LightGlow receives values in the
 * expected range. Mirrors the `clamp(radians12(pow(degrees12(sa), 1))
 * , minQuad, 3e-8)` branch from `star.group.quad.vertex.glsl:103`.
 */
export const clampSolidAngle = (
  rawSolidAngle: number,
  backBufferHeight: number
): number => {
  const minQuad =
    (U_MIN_QUAD_SOLID_ANGLE_1440P_BASELINE * 1440) /
    Math.max(backBufferHeight, 1);
  return Math.max(
    minQuad,
    Math.min(rawSolidAngle, MAX_QUAD_SOLID_ANGLE_LITERAL)
  );
};

interface HygCandidate {
  index: number;
  distPc: number;
  apparentMag: number;
  colorIndex: number;
  /**
   * Clamped solid angle (rad) — used ONLY to RANK brightness for
   * top-N selection. The shader receives `solidAngleApparent`
   * instead (see below).
   */
  clampedSolidAngle: number;
  /**
   * Gaia's `solidAngleApparent = rawSolidAngle × starBrightness /
   * fovFactor` (fovFactor = 1 at default FOV). This is what
   * `u_lightViewAngles[li]` expects in the LightGlow fragment
   * (`GraphUpdater.java:182`).
   */
  solidAngleApparent: number;
  worldX: number;
  worldY: number;
  worldZ: number;
}

/**
 * Compute the top-(maxCount) HYG stars by clamped solid angle. Does
 * one linear pass, maintaining a small min-heap of size `maxCount`,
 * so we avoid sorting the entire catalog every frame.
 */
const pickTopHygByBrightness = (
  catalog: HygCatalogData,
  maxCount: number,
  backBufferHeight: number,
  fovFactor: number,
  /**
   * Pre-computed rotation matrix if the starfield parent applies a
   * world rotation (e.g. J2000 obliquity). Callers pass `null` when
   * the catalog positions are already in the same frame as the
   * camera.
   */
  obliquityMatrix: THREE.Matrix3 | null
): HygCandidate[] => {
  const positions = catalog.positions;
  const mags = catalog.magnitudes;
  const cis = catalog.colorIndices;
  const count = catalog.header.count;

  const heap: HygCandidate[] = [];

  const sink = (c: HygCandidate): void => {
    // Simple insertion-sort — the heap is ≤ 7 entries so the loop
    // cost is irrelevant compared to the solid-angle computation.
    heap.push(c);
    heap.sort((a, b) => b.clampedSolidAngle - a.clampedSolidAngle);
    if (heap.length > maxCount) heap.length = maxCount;
  };

  const tmp = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const px = positions[i * 3 + 0];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const distPc = Math.sqrt(px * px + py * py + pz * pz);
    if (!Number.isFinite(distPc) || distPc <= 0) continue;

    const apparentMag = mags[i];
    const absMag = apparentToAbsMag(apparentMag, distPc);
    const pseudoPc = absoluteMagnitudeToPseudoSize(absMag);
    if (pseudoPc <= 0) continue;

    const aSize = pseudoPc * DISTANCE_SCALE * STAR_SIZE_FACTOR;
    const distScene = distPc * DISTANCE_SCALE;
    const rawSolidAngle = aSize / Math.max(distScene, 1e-20);
    const clamped = clampSolidAngle(rawSolidAngle, backBufferHeight);
    // Gaia's "apparent" — rawSolidAngle lifted by star.brightness
    // then divided by fovFactor (GraphUpdater.java:182). fovFactor
    // is 1.0 at Gaia's reference 40° FOV; 1.138 at atlas's 45° FOV.
    const solidAngleApparent =
      (rawSolidAngle * STAR_BRIGHTNESS_DEFAULT) / Math.max(fovFactor, 1e-6);

    // Early-skip stars already dimmer than the weakest current entry.
    if (
      heap.length === maxCount &&
      clamped <= heap[maxCount - 1].clampedSolidAngle
    )
      continue;

    tmp.set(px * DISTANCE_SCALE, py * DISTANCE_SCALE, pz * DISTANCE_SCALE);
    if (obliquityMatrix) tmp.applyMatrix3(obliquityMatrix);

    sink({
      index: i,
      distPc,
      apparentMag,
      colorIndex: cis[i],
      clampedSolidAngle: clamped,
      solidAngleApparent,
      worldX: tmp.x,
      worldY: tmp.y,
      worldZ: tmp.z,
    });
  }

  return heap;
};

export interface UpdateLightRegistryParams {
  /** HYG catalog (already loaded). */
  catalog: HygCatalogData | null;
  /** Active perspective camera. */
  camera: THREE.Camera;
  /** Current backbuffer height in pixels (for minQuad clamp). */
  backBufferHeight: number;
  /**
   * Active slot count for this frame. Typically
   * `LIGHT_GLOW_N_LIGHTS_BY_TIER[tier]`. Clamped to
   * `[1, MAX_LIGHTS]` here so callers never overflow the shader
   * array.
   */
  nSlots: number;
  /**
   * Gaia's `fovFactor = tan(fov/2) / tan(20°)` (AbstractCamera.java:148).
   * Used to divide `solidAngleApparent` per `GraphUpdater.java:182`.
   */
  fovFactor: number;
  /**
   * Optional rotation matrix for the HYG catalog's parent transform
   * (J2000 obliquity). `null` if the catalog sits at world origin
   * without rotation.
   */
  obliquityMatrix: THREE.Matrix3 | null;
  /** In-place output (avoids per-frame allocations). */
  output: LightRegistryOutput;
}

/**
 * Populate `output` with top HYG stars visible from the camera.
 * Lights outside the frustum are silently skipped (no slot wasted).
 * When fewer than `nSlots` lights are visible, unused slots keep
 * their previous values but `output.nLights` reflects the actual
 * count — the shader only reads `[0, output.nLights)`.
 */
export const updateLightRegistry = (
  params: UpdateLightRegistryParams
): LightRegistryOutput => {
  const {
    catalog,
    camera,
    backBufferHeight,
    nSlots,
    fovFactor,
    obliquityMatrix,
    output,
  } = params;
  const slots = Math.max(0, Math.min(MAX_LIGHTS, nSlots));
  let written = 0;

  const writeSlot = (
    xNdc: number,
    yNdc: number,
    solidAngle: number,
    r: number,
    g: number,
    b: number
  ): void => {
    output.positions[written * 2] = xNdc;
    output.positions[written * 2 + 1] = yNdc;
    output.solidAngles[written] = solidAngle;
    output.colors[written * 3] = r;
    output.colors[written * 3 + 1] = g;
    output.colors[written * 3 + 2] = b;
    written += 1;
  };

  // Top-N HYG stars by clamped solid angle. Gaia's LightPositionUpdater
  // is attached to the BILLBOARD_STAR render group; Atlas's local Sun
  // meshes/sprites are intentionally not injected as LightGlow lights.
  const remaining = slots - written;
  if (catalog && remaining > 0) {
    // Pick the top-K candidates. Oversample by a small factor so that
    // any candidate outside the frustum still leaves us enough to
    // fill the slots from in-frustum stars.
    const oversample = Math.min(MAX_LIGHTS * 2, remaining * 3);
    const candidates = pickTopHygByBrightness(
      catalog,
      oversample,
      backBufferHeight,
      fovFactor,
      obliquityMatrix
    );
    for (const c of candidates) {
      if (written >= slots) break;
      const ndc = projectToNdc01([c.worldX, c.worldY, c.worldZ], camera);
      if (!ndc) continue;
      const rgb = saturateStarRgb(gaiaBvToRgb(c.colorIndex));
      writeSlot(ndc[0], ndc[1], c.solidAngleApparent, rgb[0], rgb[1], rgb[2]);
    }
  }

  output.nLights = written;
  return output;
};
