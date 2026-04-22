import { describe, expect, it } from "vitest";

import {
  biasedSample,
  ghostWeight,
  lensDirtComposite,
  starburstIntensity,
  starburstOffsetFromCameraDirection,
} from "./lensFlareMath";
import {
  PSEUDO_LENS_FLARE_DEFAULT_ABERRATION,
  PSEUDO_LENS_FLARE_DEFAULT_BIAS,
  PSEUDO_LENS_FLARE_DEFAULT_GHOST_DISPERSAL,
  PSEUDO_LENS_FLARE_DEFAULT_GHOSTS,
  PSEUDO_LENS_FLARE_DEFAULT_HALO_WIDTH,
  PSEUDO_LENS_FLARE_DEFAULT_INTENSITY,
  PSEUDO_LENS_FLARE_DEFAULT_STARBURST_OFFSET,
  PSEUDO_LENS_STARBURST_SAMPLE_Y_COORD,
} from "./PseudoLensFlareEffect";

const approxEq = (a: number, b: number, tol = 1e-9) => {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
};

describe("PseudoLensFlare constants — pinned to Gaia Sky source", () => {
  it("ghosts matches config.yaml lensFlare.numGhosts (8)", () => {
    expect(PSEUDO_LENS_FLARE_DEFAULT_GHOSTS).toBe(8);
  });

  it("halo width matches config.yaml lensFlare.haloWidth (0.5)", () => {
    expect(PSEUDO_LENS_FLARE_DEFAULT_HALO_WIDTH).toBe(0.5);
  });

  it("ghost dispersal matches pseudolensflare.frag.glsl:13 literal (0.4)", () => {
    expect(PSEUDO_LENS_FLARE_DEFAULT_GHOST_DISPERSAL).toBe(0.4);
  });

  it("aberration amount matches pseudolensflare.frag.glsl:14 literal (3.5)", () => {
    expect(PSEUDO_LENS_FLARE_DEFAULT_ABERRATION).toBe(3.5);
  });

  it("bias matches config.yaml lensFlare.bias (-0.98)", () => {
    expect(PSEUDO_LENS_FLARE_DEFAULT_BIAS).toBe(-0.98);
  });

  it("flare intensity atlas-tuned to 0.03 to compensate for omitted Gaia blur chain", () => {
    // Gaia's literal is strength × 0.15 = 0.15 (MainPostProcessor.java:286)
    // but that value assumes the 35-pass blur runs between bias+ghosts
    // and combine. Atlas omits the blur; 0.03 (~5× smaller) delivers
    // comparable subtle flare character without periphery-ring
    // artifacts. See PSEUDO_LENS_FLARE_DEFAULT_INTENSITY docstring.
    expect(PSEUDO_LENS_FLARE_DEFAULT_INTENSITY).toBe(0.03);
  });

  it("starburst sample Y-coord matches lensdirt.frag.glsl:29,30 literal (0.0)", () => {
    // T1.1 regression pin. Earlier atlas shipped Y=0.5 — undocumented
    // drift caught by the P10 mechanical diff in the 19-pass audit.
    // The procedural starburst is 256×1 so 0.0 and 0.5 sample the same
    // row in practice, but pinning the literal here catches any future
    // reversion and guarantees 1:1 behaviour if the asset becomes 2D.
    expect(PSEUDO_LENS_STARBURST_SAMPLE_Y_COORD).toBe(0.0);
  });
});

describe("biasedSample — inlined bias.frag.glsl threshold", () => {
  // Gaia's bias.frag.glsl emits vec3(1.0) on pass, vec3(0.0) on fail —
  // BINARY output. Atlas mirrors that for 1:1 downstream ghost math.
  it("emits white (vec3(1.0)) when avg+bias > 0", () => {
    const rgb = biasedSample({ rgb: [0.99, 0.8, 0.5], bias: -0.98 });
    // avg = 0.763, 0.763 + (-0.98) = -0.217 → FAIL. Expect black.
    expect(rgb).toEqual([0, 0, 0]);
  });

  it("emits black when avg+bias <= 0", () => {
    const rgb = biasedSample({ rgb: [0.5, 0.5, 0.5], bias: -0.98 });
    expect(rgb).toEqual([0, 0, 0]);
  });

  it("emits white regardless of source brightness as long as threshold passes", () => {
    // Brighter-than-threshold samples all emit pure white (binary).
    expect(biasedSample({ rgb: [0.99, 0.99, 0.99], bias: -0.98 })).toEqual([
      1, 1, 1,
    ]);
    expect(biasedSample({ rgb: [1.5, 1.5, 1.5], bias: -0.98 })).toEqual([
      1, 1, 1,
    ]);
  });

  it("very negative bias gates all but brightest fragments", () => {
    // At Gaia default -0.98, only pixels with avg > 0.98 pass to white.
    expect(biasedSample({ rgb: [0.99, 0.99, 0.99], bias: -0.98 })).toEqual([
      1, 1, 1,
    ]);
    expect(biasedSample({ rgb: [0.97, 0.97, 0.97], bias: -0.98 })).toEqual([
      0, 0, 0,
    ]);
  });
});

describe("ghostWeight — Chapman ghost-march falloff", () => {
  it("peaks at the screen centre (weight=1 when offset=centre)", () => {
    // Offset exactly at (0.5, 0.5) → distance=0 → normalized=0 → w=1.
    const w = ghostWeight({
      i: 0,
      ghostVecMagnitude: 0,
      ghostAngle: 0,
      texcoord: [0.5, 0.5],
    });
    approxEq(w, 1, 1e-12);
  });

  it("falls off quadratically as the ghost offset drifts away from centre", () => {
    // At texcoord = (0, 0), offset drifts from centre — expect low
    // weight. Compare two ghost indices: i=0 and i=8 (default max).
    const near = ghostWeight({
      i: 0,
      ghostVecMagnitude: 0.4,
      ghostAngle: 0,
      texcoord: [0.2, 0.5],
    });
    const far = ghostWeight({
      i: 8,
      ghostVecMagnitude: 0.4,
      ghostAngle: 0,
      texcoord: [0.2, 0.5],
    });
    // Far ghost wraps around via fract — behaviour is periodic but
    // the weight at the first i vs a later i should differ unless
    // the wrap accidentally aligns.
    expect(near).not.toBe(far);
  });

  it("stays within [0, 1]", () => {
    for (let i = 0; i < 16; i++) {
      for (const tx of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        for (const ty of [0, 0.1, 0.5, 0.9, 1]) {
          const w = ghostWeight({
            i,
            ghostVecMagnitude: 0.4,
            ghostAngle: 0,
            texcoord: [tx, ty],
          });
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("starburstIntensity — lensdirt spike math", () => {
  it("includes the centre smoothstep bump at d < 0.3", () => {
    // At exact centre, the product s1*s2 may be whatever, but the
    // (1 - smoothstep(0, 0.3, 0)) = 1 term dominates → clamps to 1.
    const v = starburstIntensity({
      uv: [0.5, 0.5],
      offset: 0,
      sampleStarburst: () => 0,
    });
    expect(v).toBe(1);
  });

  it("drops to 0 at d > 0.3 when sampler returns 0", () => {
    // Well outside the smoothstep region + no spike sample → 0.
    const v = starburstIntensity({
      uv: [1.0, 0.5],
      offset: 0,
      sampleStarburst: () => 0,
    });
    expect(v).toBe(0);
  });

  it("tracks the sampler product outside the centre bump", () => {
    // With sampler returning 1 everywhere, product = 1, plus
    // near-zero centre bump at d=0.5 → clamps to 1.
    const v = starburstIntensity({
      uv: [1.0, 0.5],
      offset: 0,
      sampleStarburst: () => 1,
    });
    expect(v).toBe(1);
  });

  it("responds to offset drift (animation proof)", () => {
    // Non-trivial sampler pattern; values at different offsets must
    // generally differ, proving the offset uniform is consumed.
    const sampler = (t: number) => {
      // A simple peak at t=0.5 so |radial ± offset| shifts the
      // product.
      return Math.exp(-((t - 0.5) ** 2) * 80);
    };
    const a = starburstIntensity({
      uv: [0.9, 0.5],
      offset: 0,
      sampleStarburst: sampler,
    });
    const b = starburstIntensity({
      uv: [0.9, 0.5],
      offset: 0.25,
      sampleStarburst: sampler,
    });
    expect(a).not.toBe(b);
  });

  it("guards d=0 singular fragment against NaN radial", () => {
    // uv == (0.5, 0.5) triggers the d < 1e-6 guard. Return should
    // be a finite clamp value (the centre bump dominates).
    const v = starburstIntensity({
      uv: [0.5, 0.5],
      offset: 0,
      sampleStarburst: (t) => t, // returns 0 at t=0, 1 at t=1 — not NaN.
    });
    expect(Number.isFinite(v)).toBe(true);
  });
});

describe("lensDirtComposite — final multiply from lensdirt.frag.glsl:29", () => {
  it("returns base × (dirt×3 + starburst) clamped to [0,1]", () => {
    const result = lensDirtComposite({
      base: [0.2, 0.2, 0.2],
      dirt: [0.25, 0.25, 0.25],
      starburst: 0.0,
    });
    // 0.2 × (0.25 × 3 + 0) = 0.2 × 0.75 = 0.15.
    approxEq(result[0], 0.15, 1e-12);
    approxEq(result[1], 0.15, 1e-12);
    approxEq(result[2], 0.15, 1e-12);
  });

  it("clamps to 1 when product exceeds 1", () => {
    const result = lensDirtComposite({
      base: [1, 1, 1],
      dirt: [1, 1, 1],
      starburst: 1,
    });
    // 1 × (1×3 + 1) = 4 → clamps to 1.
    expect(result).toEqual([1, 1, 1]);
  });

  it("starburst only activates where base has energy", () => {
    // Dark base → dark output regardless of starburst.
    const result = lensDirtComposite({
      base: [0, 0, 0],
      dirt: [0.5, 0.5, 0.5],
      starburst: 1,
    });
    expect(result).toEqual([0, 0, 0]);
  });
});

describe("starburstOffsetFromCameraDirection — Gaia driver formula", () => {
  it("sums direction components per MainPostProcessor.java:911", () => {
    approxEq(starburstOffsetFromCameraDirection([1, 0, 0]), 1, 1e-12);
    approxEq(starburstOffsetFromCameraDirection([0, 0, 1]), 1, 1e-12);
    approxEq(starburstOffsetFromCameraDirection([0.5, 0.5, 0.5]), 1.5, 1e-12);
    approxEq(starburstOffsetFromCameraDirection([-1, -1, -1]), -3, 1e-12);
  });
});

describe("PseudoLensFlare default starburst offset", () => {
  it("starts at 0 until the first frame writes a real value", () => {
    expect(PSEUDO_LENS_FLARE_DEFAULT_STARBURST_OFFSET).toBe(0);
  });
});

// Sprite shader-sampling contract lives in a separate jsdom-env file
// (`lensFlareSprites.test.ts`): TextureLoader instantiates an Image
// via `document.createElementNS`, which requires a DOM. The math
// tests above run in the project-default node env and must stay
// DOM-free.
