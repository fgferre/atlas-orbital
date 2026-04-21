import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  clampSolidAngle,
  computeFovFactor,
  DISTANCE_SCALE,
  GAIA_FOV_FACTOR_REFERENCE_DEG,
  LIGHT_GLOW_N_LIGHTS_BY_TIER,
  makeEmptyRegistry,
  MAX_LIGHTS,
  projectToNdc01,
  STAR_BRIGHTNESS_DEFAULT,
  updateLightRegistry,
} from "./lightRegistry";
import type { HygCatalogData } from "./starfield";
import {
  MAX_QUAD_SOLID_ANGLE_LITERAL,
  U_MIN_QUAD_SOLID_ANGLE_1440P_BASELINE,
} from "./starfieldShaderMath";

const makeCamera = (): THREE.PerspectiveCamera => {
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1e12);
  cam.position.set(0, 0, DISTANCE_SCALE * 1); // 1 pc behind origin
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
};

const buildStarRow = (
  out: Float32Array,
  outMag: Float32Array,
  outCi: Float32Array,
  i: number,
  xPc: number,
  yPc: number,
  zPc: number,
  mag: number,
  ci: number
): void => {
  out[i * 3 + 0] = xPc;
  out[i * 3 + 1] = yPc;
  out[i * 3 + 2] = zPc;
  outMag[i] = mag;
  outCi[i] = ci;
};

const makeCatalog = (
  stars: readonly {
    xPc: number;
    yPc: number;
    zPc: number;
    mag: number;
    ci: number;
  }[]
): HygCatalogData => {
  const count = stars.length;
  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colorIndices = new Float32Array(count);
  stars.forEach((s, i) =>
    buildStarRow(
      positions,
      magnitudes,
      colorIndices,
      i,
      s.xPc,
      s.yPc,
      s.zPc,
      s.mag,
      s.ci
    )
  );
  return {
    header: {
      magic: "HYG1",
      version: 1,
      count,
      flags: 1,
      hasProperMotion: true,
    },
    positions,
    magnitudes,
    colorIndices,
    pmRA: new Int16Array(count),
    pmDec: new Int16Array(count),
  } as unknown as HygCatalogData;
};

describe("lightRegistry — Gaia Sky LightPositionUpdater port", () => {
  it("exports MAX_LIGHTS matching #define N 8 in lightglow.*.glsl", () => {
    expect(MAX_LIGHTS).toBe(8);
  });

  it("tier nLights mirrors Settings.getGlowNLights() (Settings.java:672)", () => {
    expect(LIGHT_GLOW_N_LIGHTS_BY_TIER.low).toBe(4);
    expect(LIGHT_GLOW_N_LIGHTS_BY_TIER.normal).toBe(5);
    expect(LIGHT_GLOW_N_LIGHTS_BY_TIER.high).toBe(6);
    expect(LIGHT_GLOW_N_LIGHTS_BY_TIER.ultra).toBe(8);
  });

  it("STAR_BRIGHTNESS_DEFAULT matches config.yaml scene.star.brightness (2.22)", () => {
    expect(STAR_BRIGHTNESS_DEFAULT).toBe(2.22);
  });

  it("computeFovFactor matches Gaia AbstractCamera.java:148 (tan(fov/2)/tan(20°))", () => {
    // Reference: at 40° FOV, fovFactor = 1.0.
    expect(computeFovFactor(GAIA_FOV_FACTOR_REFERENCE_DEG)).toBeCloseTo(1.0, 6);
    // Atlas default 45° FOV → ~1.138.
    expect(computeFovFactor(45)).toBeCloseTo(1.138, 3);
    // 60° FOV → ~1.586.
    expect(computeFovFactor(60)).toBeCloseTo(1.586, 3);
  });
});

describe("projectToNdc01 — Gaia LightPositionUpdater NDC math", () => {
  it("projects world origin into the center of the viewport (0.5, 0.5)", () => {
    const cam = makeCamera();
    const ndc = projectToNdc01([0, 0, 0], cam);
    expect(ndc).not.toBeNull();
    expect(ndc![0]).toBeCloseTo(0.5, 5);
    expect(ndc![1]).toBeCloseTo(0.5, 5);
  });

  it("returns null for points behind the camera", () => {
    const cam = makeCamera();
    // Place a "star" far behind the camera.
    const behind: [number, number, number] = [0, 0, DISTANCE_SCALE * 10];
    const ndc = projectToNdc01(behind, cam);
    expect(ndc).toBeNull();
  });

  it("keeps visible points with negative NDC z inside the near half of the frustum", () => {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 1, 100);
    cam.position.set(0, 0, 0);
    cam.lookAt(0, 0, -1);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();

    const ndc = projectToNdc01([0, 0, -1.5], cam);
    expect(ndc).not.toBeNull();
    expect(ndc![0]).toBeCloseTo(0.5, 5);
    expect(ndc![1]).toBeCloseTo(0.5, 5);
  });

  it("returns null for points outside the NDC clip volume", () => {
    const cam = makeCamera();
    // Extreme horizontal offset → NDC x far outside [-1, 1].
    const offAxis: [number, number, number] = [
      DISTANCE_SCALE * 50,
      0,
      -DISTANCE_SCALE * 0.5,
    ];
    const ndc = projectToNdc01(offAxis, cam);
    expect(ndc).toBeNull();
  });
});

describe("clampSolidAngle — resolution-adaptive floor, 3e-8 ceiling", () => {
  it("clamps above the minQuad floor at 1440p", () => {
    const below = clampSolidAngle(1e-12, 1440);
    expect(below).toBe(U_MIN_QUAD_SOLID_ANGLE_1440P_BASELINE);
  });

  it("scales the floor inversely with backbuffer height", () => {
    const at1080 = clampSolidAngle(1e-12, 1080);
    const at1440 = clampSolidAngle(1e-12, 1440);
    expect(at1080).toBeGreaterThan(at1440);
  });

  it("clamps below the 3e-8 ceiling", () => {
    expect(clampSolidAngle(1e-2, 1440)).toBe(MAX_QUAD_SOLID_ANGLE_LITERAL);
  });
});

describe("updateLightRegistry — top-N HYG ranking", () => {
  it("emits no lights without a HYG billboard-star catalog", () => {
    const output = makeEmptyRegistry();
    const cam = makeCamera();
    updateLightRegistry({
      catalog: null,
      camera: cam,
      backBufferHeight: 1440,
      nSlots: 4,
      fovFactor: 1,
      obliquityMatrix: null,
      output,
    });
    expect(output.nLights).toBe(0);
  });

  it("ranks HYG stars by clamped solid angle, brightest first", () => {
    // Build three stars at explicit positions. Place them in front of
    // the camera so they all project inside NDC.
    // Camera is at z = +DISTANCE_SCALE, looking toward origin.
    const catalog = makeCatalog([
      // Bright + close (Sirius-like): mag -1.4, 3 pc away.
      { xPc: 0.2, yPc: 0, zPc: -2.9, mag: -1.4, ci: 0.0 },
      // Dim + close: mag 5.0, 5 pc away.
      { xPc: -0.2, yPc: 0, zPc: -4.9, mag: 5.0, ci: 0.5 },
      // Bright + distant: mag 0.5, 150 pc away (Betelgeuse-like).
      { xPc: 0, yPc: 0.1, zPc: -149.9, mag: 0.5, ci: 1.5 },
    ]);
    const output = makeEmptyRegistry();
    const cam = makeCamera();
    cam.far = 1e12;
    cam.updateProjectionMatrix();
    updateLightRegistry({
      catalog,
      camera: cam,
      backBufferHeight: 1440,
      nSlots: 3,
      fovFactor: 1,
      obliquityMatrix: null,
      output,
    });
    expect(output.nLights).toBe(3);
    // Rank 0 must be the brightest by clamped solidAngle.
    expect(output.solidAngles[0]).toBeGreaterThanOrEqual(output.solidAngles[1]);
    expect(output.solidAngles[1]).toBeGreaterThanOrEqual(output.solidAngles[2]);
  });

  it("respects nSlots when more HYG candidates are available", () => {
    const catalog = makeCatalog([
      { xPc: 0, yPc: 0, zPc: -5, mag: 0.0, ci: 0.0 },
      { xPc: 0.05, yPc: 0, zPc: -5, mag: 0.1, ci: 0.0 },
      { xPc: 0, yPc: 0.05, zPc: -5, mag: 0.2, ci: 0.0 },
      { xPc: -0.05, yPc: 0, zPc: -5, mag: 0.3, ci: 0.0 },
      { xPc: 0, yPc: -0.05, zPc: -5, mag: 0.4, ci: 0.0 },
    ]);
    const output = makeEmptyRegistry();
    const cam = makeCamera();
    updateLightRegistry({
      catalog,
      camera: cam,
      backBufferHeight: 1440,
      nSlots: 3,
      fovFactor: 1,
      obliquityMatrix: null,
      output,
    });
    expect(output.nLights).toBe(3);
  });

  it("skips candidates outside the camera frustum (no wasted slot)", () => {
    // Star positioned directly behind the camera — should be rejected
    // by `projectToNdc01`.
    const catalog = makeCatalog([
      { xPc: 0, yPc: 0, zPc: 50, mag: -1.0, ci: 0.0 }, // behind camera
      { xPc: 0, yPc: 0, zPc: -50, mag: 0.0, ci: 0.0 }, // in front
    ]);
    const output = makeEmptyRegistry();
    const cam = makeCamera();
    updateLightRegistry({
      catalog,
      camera: cam,
      backBufferHeight: 1440,
      nSlots: 3,
      fovFactor: 1,
      obliquityMatrix: null,
      output,
    });
    expect(output.nLights).toBe(1);
  });

  it("nSlots 0 yields zero active lights but still writes a valid buffer", () => {
    const output = makeEmptyRegistry();
    const cam = makeCamera();
    updateLightRegistry({
      catalog: null,
      camera: cam,
      backBufferHeight: 1440,
      nSlots: 0,
      fovFactor: 1,
      obliquityMatrix: null,
      output,
    });
    expect(output.nLights).toBe(0);
    expect(output.positions.length).toBe(MAX_LIGHTS * 2);
    expect(output.colors.length).toBe(MAX_LIGHTS * 3);
  });
});
