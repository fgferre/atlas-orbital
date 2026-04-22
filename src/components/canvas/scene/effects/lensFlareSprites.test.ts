// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  getLensColorSprite,
  getLensDirtSprite,
  getLensStarburstSprite,
  LENS_COLOR_TEXTURE_URL,
  LENS_DIRT_TEXTURE_URL,
  LENS_STARBURST_TEXTURE_URL,
} from "./lensFlareSprites";

// Post-T2.3a, the three sprites load asynchronously from
// `public/textures/lens/` via THREE.TextureLoader. Image dimensions
// are sourced from the placeholder (or future CC-BY-4.0 replacement)
// and intentionally NOT pinned — they are free variables per T2.3b.
// What the shader actually depends on is the synchronous texture
// configuration (filter, wrap, colorSpace, mipmap) set in
// `loadLens*Sprite`. Drift in any of these silently breaks
// `pseudolensflare.frag.glsl` / `lensdirt.frag.glsl` so they are
// pinned here.
//
// File-level jsdom env required because TextureLoader constructs an
// HTMLImageElement via `document.createElementNS(...)`; the sibling
// math tests in `lensFlareMath.test.ts` stay in the project-default
// node env to keep non-DOM paths honest.

describe("lens-flare sprites — shader sampling contract pins", () => {
  it("lensColor URL resolves under the Vite public textures/lens/ tree", () => {
    expect(LENS_COLOR_TEXTURE_URL.endsWith("textures/lens/lenscolor.png")).toBe(
      true
    );
  });

  it("lensColor samples linearly, clamp-wrapped, mipmap-free, without sRGB decode", () => {
    const tex = getLensColorSprite();
    expect(tex.minFilter).toBe(THREE.LinearFilter);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
    expect(tex.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.generateMipmaps).toBe(false);
    expect(tex.colorSpace).toBe(THREE.NoColorSpace);
  });

  it("lensDirt URL resolves under the Vite public textures/lens/ tree", () => {
    expect(
      LENS_DIRT_TEXTURE_URL.endsWith("textures/lens/lensdirt-low.jpg")
    ).toBe(true);
  });

  it("lensDirt samples linearly, clamp-wrapped, mipmap-free, without sRGB decode", () => {
    const tex = getLensDirtSprite();
    expect(tex.minFilter).toBe(THREE.LinearFilter);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
    expect(tex.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.generateMipmaps).toBe(false);
    expect(tex.colorSpace).toBe(THREE.NoColorSpace);
  });

  it("lensStarburst URL resolves under the Vite public textures/lens/ tree", () => {
    expect(
      LENS_STARBURST_TEXTURE_URL.endsWith("textures/lens/lensstarburst.jpg")
    ).toBe(true);
  });

  it("lensStarburst uses wrapS=Repeat for the mod(abs(..),1) sampling trick in lensdirt.frag.glsl:24-26", () => {
    // Unique per-texture requirement: the diffraction-spike math
    // depends on periodic sampling at the 0/1 wrap seam. Clamp here
    // would plateau the spike at the seam and visibly clip the
    // diffraction pattern as the camera angle rotates.
    const tex = getLensStarburstSprite();
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.minFilter).toBe(THREE.LinearFilter);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
    expect(tex.generateMipmaps).toBe(false);
    expect(tex.colorSpace).toBe(THREE.NoColorSpace);
  });

  it("sprite getters memoize the loaded texture across repeated calls", () => {
    // A fresh TextureLoader().load() call on every frame would leak
    // image downloads + GPU uploads. The caching contract guarantees
    // the Uniform in PseudoLensFlareEffect stays stable.
    expect(getLensColorSprite()).toBe(getLensColorSprite());
    expect(getLensDirtSprite()).toBe(getLensDirtSprite());
    expect(getLensStarburstSprite()).toBe(getLensStarburstSprite());
  });
});
