// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { getLightGlowSprite, LIGHT_GLOW_SPRITE_URL } from "./lightGlowSprite";

describe("getLightGlowSprite — vendored `star-tex-03` contract", () => {
  it("URL points at the gitignored placeholder under public/textures/stars/", () => {
    expect(LIGHT_GLOW_SPRITE_URL).toMatch(/textures\/stars\/star-tex-03\.jpg$/);
  });

  it("sprite is a THREE.Texture (not DataTexture — no procedural bake)", () => {
    const tex = getLightGlowSprite();
    expect(tex).toBeInstanceOf(THREE.Texture);
  });

  it("sprite is process-cached (same Texture instance across calls)", () => {
    const a = getLightGlowSprite();
    const b = getLightGlowSprite();
    expect(a).toBe(b);
  });

  it("min + mag filter are Linear (Gaia libGDX default smooth sampler)", () => {
    const tex = getLightGlowSprite();
    expect(tex.minFilter).toBe(THREE.LinearFilter);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
  });

  it("wrap is ClampToEdge on both axes (out-of-halo UVs return the asset's zero border — no leakage)", () => {
    const tex = getLightGlowSprite();
    expect(tex.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.wrapT).toBe(THREE.ClampToEdgeWrapping);
  });

  it("mipmaps disabled (halo size driven by uniform, not screen-res mip chain)", () => {
    const tex = getLightGlowSprite();
    expect(tex.generateMipmaps).toBe(false);
  });

  it("colorSpace = NoColorSpace (Gaia reads raw bytes without sRGB decode)", () => {
    const tex = getLightGlowSprite();
    expect(tex.colorSpace).toBe(THREE.NoColorSpace);
  });
});
