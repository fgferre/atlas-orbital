// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  buildGridRecShaderMaterial,
  buildGridRecShaderUniforms,
  DEFAULT_GRID_REC_UNIFORMS,
  GRID_REC_FRAGMENT_SHADER,
  GRID_REC_VERTEX_SHADER,
} from "./shaders/gridRecShader";
import { GRID_RECURSIVE_CONFIG } from "./gridRecursiveConfig";
import {
  GRIDREC_N,
  GRIDREC_BASE_LINE_WIDTH,
  GRIDREC_STYLE_CIRCULAR,
  GRIDREC_STYLE_SQUARE,
} from "./shaders/gridRecMath";

describe("buildGridRecShaderUniforms — default-uniform contract", () => {
  it("CIRCULAR style maps to u_elevationMultiplier = 0 (Gaia default per config.yaml:384)", () => {
    const u = buildGridRecShaderUniforms({ style: "CIRCULAR" });
    expect(u.u_elevationMultiplier.value).toBe(GRIDREC_STYLE_CIRCULAR);
    expect(u.u_elevationMultiplier.value).toBe(0);
  });

  it("SQUARE style maps to u_elevationMultiplier = 1", () => {
    const u = buildGridRecShaderUniforms({ style: "SQUARE" });
    expect(u.u_elevationMultiplier.value).toBe(GRIDREC_STYLE_SQUARE);
    expect(u.u_elevationMultiplier.value).toBe(1);
  });

  it("omitted init falls through to DEFAULT_GRID_REC_UNIFORMS (CIRCULAR)", () => {
    const u = buildGridRecShaderUniforms();
    expect(u.u_elevationMultiplier.value).toBe(GRIDREC_STYLE_CIRCULAR);
    expect(u.u_tessQuality.value).toBe(DEFAULT_GRID_REC_UNIFORMS.tessQuality);
    expect(u.u_heightScale.value).toBe(DEFAULT_GRID_REC_UNIFORMS.heightScale);
    expect(u.u_ts.value).toBe(DEFAULT_GRID_REC_UNIFORMS.ts);
    expect(u.u_opacity.value).toBe(DEFAULT_GRID_REC_UNIFORMS.opacity);
  });

  it("u_tessQuality default = 1.0 (neutral camera-distance scaling pre-T4.4c)", () => {
    expect(DEFAULT_GRID_REC_UNIFORMS.tessQuality).toBe(1.0);
  });

  it("u_heightScale default = 1.0 (level-1 fully faded-in pre-T4.4c)", () => {
    expect(DEFAULT_GRID_REC_UNIFORMS.heightScale).toBe(1.0);
  });

  it("u_ts default = 1.4 mirrors Gaia line.width * 1.4 at line.width=1 (ModelEntityRenderSystem.java:316)", () => {
    expect(DEFAULT_GRID_REC_UNIFORMS.ts).toBe(1.4);
  });

  it("default style is CIRCULAR matching Gaia config.yaml:384", () => {
    expect(DEFAULT_GRID_REC_UNIFORMS.style).toBe("CIRCULAR");
  });

  it("diffuseColor is a 4-component linear-RGBA vec4", () => {
    expect(DEFAULT_GRID_REC_UNIFORMS.diffuseColor).toHaveLength(4);
    for (const c of DEFAULT_GRID_REC_UNIFORMS.diffuseColor) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it("emissiveColor's alpha is less than diffuseColor's alpha (level-1 fades toward the inner tone)", () => {
    expect(DEFAULT_GRID_REC_UNIFORMS.emissiveColor[3]).toBeLessThan(
      DEFAULT_GRID_REC_UNIFORMS.diffuseColor[3]
    );
  });

  it("u_diffuseColor / u_emissiveColor are constructed as THREE.Vector4", () => {
    const u = buildGridRecShaderUniforms();
    expect(u.u_diffuseColor.value).toBeInstanceOf(THREE.Vector4);
    expect(u.u_emissiveColor.value).toBeInstanceOf(THREE.Vector4);
  });

  it("partial init merges with defaults (only overridden fields change)", () => {
    const u = buildGridRecShaderUniforms({ opacity: 0.5 });
    expect(u.u_opacity.value).toBe(0.5);
    // other fields stay on defaults
    expect(u.u_tessQuality.value).toBe(1.0);
    expect(u.u_elevationMultiplier.value).toBe(GRIDREC_STYLE_CIRCULAR);
  });
});

describe("buildGridRecShaderMaterial — Three.js wiring contract", () => {
  it("material is a transparent, additive, double-sided ShaderMaterial", () => {
    const m = buildGridRecShaderMaterial();
    expect(m).toBeInstanceOf(THREE.ShaderMaterial);
    expect(m.transparent).toBe(true);
    expect(m.blending).toBe(THREE.AdditiveBlending);
    expect(m.side).toBe(THREE.DoubleSide);
    expect(m.depthTest).toBe(true);
    expect(m.depthWrite).toBe(false);
    m.dispose();
  });

  it("material.toneMapped is false (grid lines should not be graded by the post-process tone map)", () => {
    const m = buildGridRecShaderMaterial();
    expect(m.toneMapped).toBe(false);
    m.dispose();
  });

  it("derivatives extension enabled (dFdx required by gridrec.fragment.glsl:88,116)", () => {
    const m = buildGridRecShaderMaterial();
    expect((m.extensions as { derivatives?: boolean }).derivatives).toBe(true);
    m.dispose();
  });

  it("uniforms match the default-uniform contract", () => {
    const m = buildGridRecShaderMaterial();
    expect(m.uniforms.u_elevationMultiplier.value).toBe(GRIDREC_STYLE_CIRCULAR);
    expect(m.uniforms.u_tessQuality.value).toBe(1.0);
    expect(m.uniforms.u_heightScale.value).toBe(1.0);
    expect(m.uniforms.u_ts.value).toBe(1.4);
    expect(m.uniforms.u_opacity.value).toBe(1.0);
    m.dispose();
  });

  it("init overrides flow through to the material", () => {
    const m = buildGridRecShaderMaterial({ style: "SQUARE", opacity: 0.5 });
    expect(m.uniforms.u_elevationMultiplier.value).toBe(GRIDREC_STYLE_SQUARE);
    expect(m.uniforms.u_opacity.value).toBe(0.5);
    m.dispose();
  });
});

describe("GRID_REC_FRAGMENT_SHADER — literal interpolation into GLSL", () => {
  it("embeds GRIDREC_N from gridRecMath (single source of truth)", () => {
    // Forces `GRIDREC_N 10.0`-style token into the GLSL so
    // changing the TS constant re-flows the shader.
    expect(GRID_REC_FRAGMENT_SHADER).toContain(
      `#define GRIDREC_N ${GRIDREC_N}.0`.replace(".0.0", ".0")
    );
  });

  it("embeds GRIDREC_BASE_LINE_WIDTH from gridRecMath", () => {
    expect(GRID_REC_FRAGMENT_SHADER).toContain(
      `#define GRIDREC_BASE_LINE_WIDTH ${GRIDREC_BASE_LINE_WIDTH}.0`.replace(
        ".0.0",
        ".0"
      )
    );
  });

  it("references gl_FragColor (not layout-qualified output) — WebGL1 GLSL path", () => {
    expect(GRID_REC_FRAGMENT_SHADER).toContain("gl_FragColor");
    expect(GRID_REC_FRAGMENT_SHADER).not.toContain("layout (location");
  });

  it("skips gl_FragDepth write (divergence documented in JSDoc — log-depth not ported in T4.4b)", () => {
    expect(GRID_REC_FRAGMENT_SHADER).not.toContain("gl_FragDepth");
    expect(GRID_REC_FRAGMENT_SHADER).not.toContain("getDepthValue");
  });

  it("does not carry the simple_noise.glsl include (Gaia defensive-only, unused by main)", () => {
    expect(GRID_REC_FRAGMENT_SHADER).not.toContain("simple_noise");
  });

  it("carries both branches (circle + square) so users can opt into SQUARE style", () => {
    expect(GRID_REC_FRAGMENT_SHADER).toContain("gridrec_circle(");
    expect(GRID_REC_FRAGMENT_SHADER).toContain("gridrec_square(");
  });

  it("branch threshold in main() matches gridrec.fragment.glsl:126 (< 0.5)", () => {
    expect(GRID_REC_FRAGMENT_SHADER).toMatch(
      /u_elevationMultiplier\s*<\s*0\.5/
    );
  });
});

describe("GRID_REC_VERTEX_SHADER — minimal transform + UV pass-through", () => {
  it("passes uv → v_texCoords0 (matches the fragment's varying name)", () => {
    expect(GRID_REC_VERTEX_SHADER).toContain("varying vec2 v_texCoords0");
    expect(GRID_REC_VERTEX_SHADER).toContain("v_texCoords0 = uv");
  });

  it("clip-space transform uses Three's projection + modelView matrices", () => {
    expect(GRID_REC_VERTEX_SHADER).toContain("projectionMatrix");
    expect(GRID_REC_VERTEX_SHADER).toContain("modelViewMatrix");
  });
});

describe("GRID_RECURSIVE_CONFIG — layout contract preserved from EclipticGrid predecessor", () => {
  it("world size (40k) + plane y-offset (-0.15) preserved so the camera-fade UX is unchanged", () => {
    expect(GRID_RECURSIVE_CONFIG.worldSize).toBe(40000);
    expect(GRID_RECURSIVE_CONFIG.planeYOffset).toBe(-0.15);
  });

  it("renderOrder = -100 keeps grid below orbits + planets (same as EclipticGrid)", () => {
    expect(GRID_RECURSIVE_CONFIG.renderOrder).toBe(-100);
  });

  it("opacity fade start/end bracket atlas's typical camera distances", () => {
    expect(GRID_RECURSIVE_CONFIG.opacityFadeStart).toBeLessThan(
      GRID_RECURSIVE_CONFIG.opacityFadeEnd
    );
  });
});
