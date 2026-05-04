// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  LENS_FLARE_DEFAULT_FLARE_INTENSITY,
  LENS_FLARE_DEFAULT_INTENSITY,
  LENS_FLARE_MAX_LIGHTS,
  LENS_FLARE_OCCLUSION_SAMPLES,
  LENS_FLARE_SPIRAL_AMPLITUDE,
  LENS_FLARE_SPIRAL_STEP_RADIANS,
  LensFlareEffect,
} from "./LensFlareEffect";

describe("LensFlareEffect — Gaia COMPLEX lensflare.frag.glsl port", () => {
  describe("Source-pinned numeric invariants", () => {
    it("MAX_LIGHTS = 10 (Gaia lensflare.frag.glsl:8)", () => {
      expect(LENS_FLARE_MAX_LIGHTS).toBe(10);
    });

    it("N_SAMPLES = 6 (Gaia lensflare.frag.glsl:173)", () => {
      expect(LENS_FLARE_OCCLUSION_SAMPLES).toBe(6);
    });

    it("spiral amplitude a = 0.01 (Gaia lensflare.frag.glsl:187)", () => {
      expect(LENS_FLARE_SPIRAL_AMPLITUDE).toBeCloseTo(0.01, 6);
    });

    it("spiral step dt = 3π / N_SAMPLES (Gaia lensflare.frag.glsl:188)", () => {
      expect(LENS_FLARE_SPIRAL_STEP_RADIANS).toBeCloseTo(
        (3.0 * Math.PI) / 6,
        6
      );
    });

    it("default u_intensity = 1.0 (Gaia config.yaml:608 strength: 1.0)", () => {
      expect(LENS_FLARE_DEFAULT_INTENSITY).toBe(1.0);
    });

    it("default u_flareIntensity = 1.0 (atlas-only post-multiplier)", () => {
      expect(LENS_FLARE_DEFAULT_FLARE_INTENSITY).toBe(1.0);
    });
  });

  describe("Constructor uniform contract", () => {
    it("u_lightPositions seeded with MAX_LIGHTS Vector2(0,0) entries", () => {
      const effect = new LensFlareEffect();
      const positions = effect.uniforms.get("u_lightPositions")
        ?.value as Array<{ x: number; y: number }>;
      expect(positions).toBeDefined();
      expect(positions.length).toBe(LENS_FLARE_MAX_LIGHTS);
      for (const p of positions) {
        expect(p.x).toBe(0);
        expect(p.y).toBe(0);
      }
      effect.dispose();
    });

    it("u_lightIntensities seeded with MAX_LIGHTS zeros", () => {
      const effect = new LensFlareEffect();
      const intensities = effect.uniforms.get("u_lightIntensities")
        ?.value as number[];
      expect(intensities).toBeDefined();
      expect(intensities.length).toBe(LENS_FLARE_MAX_LIGHTS);
      for (const v of intensities) expect(v).toBe(0);
      effect.dispose();
    });

    it("u_nLights starts at 0 — shader's u_intensity guard takes the cheap early-out", () => {
      const effect = new LensFlareEffect();
      expect(effect.uniforms.get("u_nLights")?.value).toBe(0);
      effect.dispose();
    });

    it("u_color defaults to (1, 1, 1) (Gaia LensFlareFilter.java:32)", () => {
      const effect = new LensFlareEffect();
      const color = effect.uniforms.get("u_color")?.value as {
        r: number;
        g: number;
        b: number;
      };
      expect(color.r).toBe(1);
      expect(color.g).toBe(1);
      expect(color.b).toBe(1);
      effect.dispose();
    });

    it("u_starburstOffset stays at 0 (Gaia COMPLEX never animates offset)", () => {
      const effect = new LensFlareEffect();
      expect(effect.uniforms.get("u_starburstOffset")?.value).toBe(0);
      effect.dispose();
    });
  });

  describe("Imperative setters", () => {
    it("setLight populates slot 0 + bumps u_nLights to 1", () => {
      const effect = new LensFlareEffect();
      effect.setLight([0.42, 0.13], 0.7);
      const positions = effect.uniforms.get("u_lightPositions")
        ?.value as Array<{ x: number; y: number }>;
      const intensities = effect.uniforms.get("u_lightIntensities")
        ?.value as number[];
      expect(positions[0].x).toBeCloseTo(0.42, 6);
      expect(positions[0].y).toBeCloseTo(0.13, 6);
      expect(intensities[0]).toBeCloseTo(0.7, 6);
      expect(effect.uniforms.get("u_nLights")?.value).toBe(1);
      effect.dispose();
    });

    it("clearLights resets u_nLights to 0 — shader early-out", () => {
      const effect = new LensFlareEffect();
      effect.setLight([0.5, 0.5], 1.0);
      expect(effect.uniforms.get("u_nLights")?.value).toBe(1);
      effect.clearLights();
      expect(effect.uniforms.get("u_nLights")?.value).toBe(0);
      effect.dispose();
    });

    it("setIntensity / setFlareIntensity / setStarburstOffset write the right uniforms", () => {
      const effect = new LensFlareEffect();
      effect.setIntensity(0.42);
      expect(effect.uniforms.get("u_intensity")?.value).toBeCloseTo(0.42, 6);
      effect.setFlareIntensity(0.5);
      expect(effect.uniforms.get("u_flareIntensity")?.value).toBeCloseTo(
        0.5,
        6
      );
      effect.setStarburstOffset(0.1);
      expect(effect.uniforms.get("u_starburstOffset")?.value).toBeCloseTo(
        0.1,
        6
      );
      effect.dispose();
    });

    it("setViewportSize writes pixel-unit u_viewport (LensFlareFilter.java:30,51)", () => {
      const effect = new LensFlareEffect();
      effect.setViewportSize(1920, 1080);
      const viewport = effect.uniforms.get("u_viewport")?.value as {
        x: number;
        y: number;
      };
      expect(viewport.x).toBe(1920);
      expect(viewport.y).toBe(1080);
      effect.dispose();
    });
  });

  describe("Shader source — T2.1-fix-α LDR clamp invariant (2026-05-04)", () => {
    /**
     * The spiral occlusion sampler at Gaia's
     * `lensflare.frag.glsl:181-202` operates on the LDR-clamped scene
     * buffer that LightGlow at `lightglow.frag.glsl:97`
     * (`saturate(effectColor + scene)`) writes upstream. atlas's pmndrs
     * `BlendFunction.ADD` LightGlow does NOT chain its output via
     * inputBuffer (verified vs `postprocessing/build/postprocessing.js`
     * EffectComposer flow), so atlas's LensFlare reads the raw HDR
     * scene from `inputBuffer` — without a clamp, the procedural Sun's
     * emissive HDR pixels (>1.0 brightness) drive the per-light luma
     * accumulator past 1.0 and amplify the 10-iteration
     * `lensFlareCircle` accumulator beyond Gaia's intended visual.
     *
     * The LDR clamp inside the spiral sampler emulates the LDR-boundary
     * Gaia gets via composite saturation. This test pins the clamp's
     * presence on every sampler call so a future shader edit can't
     * silently remove it (which would re-introduce the "exploding
     * halo" defect users reported on 2026-05-04).
     */
    it("spiral occlusion sampler clamps inputBuffer reads to [0, 1]", () => {
      const effect = new LensFlareEffect();
      const shaderSource = effect.getFragmentShader() as string;
      // Match the surface area of the clamp pattern. Permissive whitespace
      // so prettier/eslint formatting doesn't break the pin.
      expect(shaderSource).toMatch(
        /clamp\s*\(\s*texture2D\s*\(\s*inputBuffer\s*,\s*curr_coord\s*\)\s*\.\s*rgb\s*,\s*0\.0\s*,\s*1\.0\s*\)/
      );
      effect.dispose();
    });

    it("flareColor still gets the Gaia-source-pinned post-accumulator clamp (lensflare.frag.glsl:203)", () => {
      const effect = new LensFlareEffect();
      const shaderSource = effect.getFragmentShader() as string;
      expect(shaderSource).toMatch(
        /flareColor\s*=\s*clamp\s*\(\s*flareColor\s*,\s*0\.0\s*,\s*1\.0\s*\)/
      );
      effect.dispose();
    });

    it("modulated flare gets the pre-output clamp (codex 2026-04-22 audit fix)", () => {
      const effect = new LensFlareEffect();
      const shaderSource = effect.getFragmentShader() as string;
      expect(shaderSource).toMatch(
        /modulated\s*=\s*clamp\s*\(\s*modulated\s*,\s*0\.0\s*,\s*1\.0\s*\)/
      );
      effect.dispose();
    });
  });
});
