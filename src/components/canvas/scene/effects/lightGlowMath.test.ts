import { describe, expect, it } from "vitest";

import { MAX_LIGHTS } from "../../../../lib/lightRegistry";
import { archimedesSpiralSamples, haloSize, polarMask } from "./lightGlowMath";
import {
  LIGHT_GLOW_DEFAULT_SAMPLES,
  LIGHT_GLOW_DEFAULT_SPIRAL_SCALE,
  LIGHT_GLOW_DEFAULT_TEXTURE_SCALE,
  LIGHT_GLOW_POLAR_FREQS,
  LIGHT_GLOW_POLAR_MASK_MIN_VAL,
  LIGHT_GLOW_POLAR_TIME_MULS,
} from "./LightGlowEffect";

describe("T5.3b vec4 packing assumption — MAX_LIGHTS must equal 8", () => {
  it("MAX_LIGHTS is exactly 8 (two vec4 varyings in LightGlowEffect vertex shader)", () => {
    // Pin: LightGlowEffect's vertex shader packs v_lumsA (lights
    // 0..3) + v_lumsB (lights 4..7). If MAX_LIGHTS ever grows, the
    // two-vec4 layout in `LightGlowEffect.ts` needs a corresponding
    // update (add v_lumsC, extend the getLum() branching in the
    // fragment stage). This assertion failing is a reminder to
    // touch BOTH files, not just lightRegistry.
    expect(MAX_LIGHTS).toBe(8);
  });
});

const approxEq = (actual: number, expected: number, tol = 1e-6) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
};

describe("LightGlow constants — pinned to Gaia Sky source", () => {
  it("samples default matches Gaia Sky runtime updateGlow() override (1)", () => {
    // config.yaml declares 10, but MainPostProcessor.updateGlow()
    // immediately sets LightGlow.setNSamples(1) and writes the same
    // value back to Settings.settings.postprocess.lightGlow.samples.
    expect(LIGHT_GLOW_DEFAULT_SAMPLES).toBe(1);
  });

  it("polar mask frequencies match lightglow.frag.glsl:50-52 literals (12, 37, 59)", () => {
    expect(LIGHT_GLOW_POLAR_FREQS).toEqual([12.0, 37.0, 59.0]);
  });

  it("polar mask time multipliers match lightglow.frag.glsl:50-52 (2.0, -1.3, 1.6)", () => {
    expect(LIGHT_GLOW_POLAR_TIME_MULS).toEqual([2.0, -1.3, 1.6]);
  });

  it("polar mask minVal floor = 0.55 (lightglow.frag.glsl:58)", () => {
    expect(LIGHT_GLOW_POLAR_MASK_MIN_VAL).toBe(0.55);
  });

  it("texture scale default matches MainPostProcessor.getGlowTextureScale (non-cubemap)", () => {
    // 2.22 × (0.055 / 0.06) × 0.2 = 0.407
    approxEq(LIGHT_GLOW_DEFAULT_TEXTURE_SCALE, 0.407, 1e-3);
  });

  it("spiral scale default matches MainPostProcessor.getGlowSpiralScale (fovFactor=1)", () => {
    // 2.22 × 3.0 × 0.5e-4 = 3.33e-4
    approxEq(LIGHT_GLOW_DEFAULT_SPIRAL_SCALE, 3.33e-4, 1e-6);
  });
});

describe("polarMask — time-animated angular modulation", () => {
  it("never returns below the minVal floor (0.55)", () => {
    for (const t of [0, 0.5, 1, 1.5, 2, 5, 10]) {
      for (let x = 0; x <= 1; x += 0.1) {
        for (let y = 0; y <= 1; y += 0.1) {
          const v = polarMask({ uv: [x, y], time: t });
          expect(v).toBeGreaterThanOrEqual(
            LIGHT_GLOW_POLAR_MASK_MIN_VAL - 1e-9
          );
          expect(v).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });

  it("hits the center bonus (r=0 → smoothstep(0.85, 1.0, 1.0) = 1.0) saturated to 1.0", () => {
    const v = polarMask({ uv: [0.5, 0.5], time: 0 });
    approxEq(v, 1.0, 1e-9);
  });

  it("is time-dependent at off-center points (animation proof)", () => {
    const uv: [number, number] = [0.3, 0.7];
    const a = polarMask({ uv, time: 0 });
    const b = polarMask({ uv, time: 1 });
    const c = polarMask({ uv, time: 5 });
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
  });

  it("respects an overridden minVal", () => {
    const uv: [number, number] = [0.1, 0.05]; // far corner, near min
    const v = polarMask({ uv, time: 0, minVal: 0.25 });
    expect(v).toBeGreaterThanOrEqual(0.25 - 1e-9);
  });
});

describe("haloSize — lightglow.frag.glsl:83 formula", () => {
  it("saturates at textureScale × 1.6 × lum when view angle is at/above the cap", () => {
    // min(0.0001, viewAngle) → 0.0001 for anything >= 1e-4 rad.
    // min(1.6, 1e-4 × 5e5) = min(1.6, 50) = 1.6.
    const size = haloSize(0.5, 1e-3, 1.0);
    approxEq(size, 0.5 * 1.6 * 1.0, 1e-12);
  });

  it("scales linearly with lum", () => {
    const a = haloSize(0.5, 1e-5, 0.5);
    const b = haloSize(0.5, 1e-5, 1.0);
    approxEq(b, 2 * a, 1e-12);
  });

  it("scales linearly with textureScale", () => {
    const a = haloSize(0.3, 5e-5, 1.0);
    const b = haloSize(0.6, 5e-5, 1.0);
    approxEq(b, 2 * a, 1e-12);
  });

  it("zero-view-angle inputs produce zero halo", () => {
    expect(haloSize(0.4, 0, 1.0)).toBe(0);
  });

  it("negative lum collapses to zero-or-negative halo (caller's responsibility to gate)", () => {
    // The shader does not special-case lum < 0; mirror that.
    expect(haloSize(0.4, 1e-3, -0.5)).toBeLessThan(0);
  });
});

describe("archimedesSpiralSamples — fx/fy parametric curve", () => {
  it("produces exactly nSamples entries", () => {
    expect(archimedesSpiralSamples(1e-3, 10).length).toBe(10);
    expect(archimedesSpiralSamples(1e-3, 30).length).toBe(30);
  });

  it("first sample is at the origin (t=0)", () => {
    const [first] = archimedesSpiralSamples(1e-3, 10);
    approxEq(first.t, 0, 1e-12);
    approxEq(first.fxVal, 0, 1e-12);
    approxEq(first.fyVal, 0, 1e-12);
  });

  it("parameter range spans [0, 3π) with dt = 3π/n", () => {
    const samples = archimedesSpiralSamples(1e-3, 10);
    approxEq(samples[samples.length - 1].t, 3 * Math.PI * (9 / 10), 1e-9);
    approxEq(samples[1].t - samples[0].t, (3 * Math.PI) / 10, 1e-9);
  });

  it("sample radii grow monotonically with t (spiral, not circle)", () => {
    const samples = archimedesSpiralSamples(1e-3, 30);
    for (let i = 1; i < samples.length; i++) {
      const prev = Math.sqrt(
        samples[i - 1].fxVal ** 2 + samples[i - 1].fyVal ** 2
      );
      const cur = Math.sqrt(samples[i].fxVal ** 2 + samples[i].fyVal ** 2);
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
    }
  });
});

// NOTE: The "conservative radial gaussian" test block that lived here
// (monotonic fall-off + radial symmetry) covered the procedural
// substitute used before the real Gaia `star-tex-03` asset was
// vendored as a placeholder at `public/textures/stars/`. Both
// invariants are FALSE for the real asset: the 4-ray cross-spikes
// are by-design anisotropic, so horizontal/vertical samples at the
// same radius are far brighter than diagonal samples. Texture-level
// contract (filter / wrap / colorSpace / cache identity) now lives
// in `lightGlowSprite.test.ts`; pixel-level probing moves to the
// CC-BY-4.0 replacement ship when the vendored asset lands under
// source control. See commits `d6165c6` (procedural border-zero
// fix — retired) and the follow-up asset swap in this file's
// companion test.
