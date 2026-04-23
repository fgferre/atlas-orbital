// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  getLightGlowSprite,
  LIGHT_GLOW_SPRITE_SIGMA,
  LIGHT_GLOW_SPRITE_SIZE,
  LIGHT_GLOW_SPRITE_ZERO_RADIUS,
} from "./lightGlowSprite";

const readByte = (
  data: Uint8Array | Uint8ClampedArray,
  size: number,
  x: number,
  y: number,
  channel: 0 | 1 | 2 | 3 = 0
): number => data[(y * size + x) * 4 + channel];

describe("getLightGlowSprite — baked-texture contract", () => {
  it("sprite is a THREE.DataTexture with the advertised RGBA size (pinned contract)", () => {
    const tex = getLightGlowSprite();
    expect(tex).toBeInstanceOf(THREE.DataTexture);
    expect(tex.image.width).toBe(LIGHT_GLOW_SPRITE_SIZE);
    expect(tex.image.height).toBe(LIGHT_GLOW_SPRITE_SIZE);
    expect(tex.format).toBe(THREE.RGBAFormat);
    expect(tex.type).toBe(THREE.UnsignedByteType);
  });

  it("sprite is process-cached (same texture instance across calls)", () => {
    const a = getLightGlowSprite();
    const b = getLightGlowSprite();
    expect(a).toBe(b);
  });

  it("wrap mode is ClampToEdge on both axes (matches the shader's glow_tc overflow path)", () => {
    const tex = getLightGlowSprite();
    expect(tex.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.wrapT).toBe(THREE.ClampToEdgeWrapping);
  });

  it("center pixel is peak (255, 255, 255, 255) — gaussian maximum at r=0", () => {
    const tex = getLightGlowSprite();
    const data = tex.image.data as Uint8Array;
    const c = (LIGHT_GLOW_SPRITE_SIZE - 1) / 2;
    // Center is between two integer pixels for even size; probe the
    // nearest integer — both round to the same full-brightness value.
    const cx = Math.floor(c);
    const cy = Math.floor(c);
    expect(readByte(data, LIGHT_GLOW_SPRITE_SIZE, cx, cy, 0)).toBe(255);
    expect(readByte(data, LIGHT_GLOW_SPRITE_SIZE, cx, cy, 3)).toBe(255);
  });
});

describe("border-zero invariant — kills ClampToEdge leakage into the H/V axes", () => {
  // Without this invariant, a gaussian at σ=20 in a 128-extent sprite
  // leaves ~1.5/255 brightness at the middle of each edge pixel. The
  // shader's ClampToEdge sampler then replicates that thin non-zero
  // edge along whatever axis glow_tc overflows, producing 4 faint rays
  // out of every bright star — exactly the cross-spike artifact that
  // the (deleted) procedural-spikes approach had tried to emulate on
  // purpose before we realised it was wrong.

  it("LIGHT_GLOW_SPRITE_ZERO_RADIUS is strictly less than half the sprite extent (leaves a zero border)", () => {
    expect(LIGHT_GLOW_SPRITE_ZERO_RADIUS).toBeLessThan(
      LIGHT_GLOW_SPRITE_SIZE / 2
    );
    expect(LIGHT_GLOW_SPRITE_ZERO_RADIUS).toBeGreaterThan(0);
  });

  it("zero-radius sits well past the gaussian's 3σ shoulder so no visible halo is clipped", () => {
    // σ = 20; 3σ = 60. Zero radius should be ≥ 3σ so the disc inside the
    // cutoff still captures every part of the halo that's visually
    // meaningful (>1% peak brightness).
    expect(LIGHT_GLOW_SPRITE_ZERO_RADIUS).toBeGreaterThanOrEqual(
      3 * LIGHT_GLOW_SPRITE_SIGMA
    );
  });

  it("every pixel on the top edge (y=0) is exactly zero — no leakage along the N ray", () => {
    const tex = getLightGlowSprite();
    const data = tex.image.data as Uint8Array;
    for (let x = 0; x < LIGHT_GLOW_SPRITE_SIZE; x++) {
      expect(readByte(data, LIGHT_GLOW_SPRITE_SIZE, x, 0, 0)).toBe(0);
    }
  });

  it("every pixel on the bottom edge (y=size-1) is exactly zero — no leakage along the S ray", () => {
    const tex = getLightGlowSprite();
    const data = tex.image.data as Uint8Array;
    const lastY = LIGHT_GLOW_SPRITE_SIZE - 1;
    for (let x = 0; x < LIGHT_GLOW_SPRITE_SIZE; x++) {
      expect(readByte(data, LIGHT_GLOW_SPRITE_SIZE, x, lastY, 0)).toBe(0);
    }
  });

  it("every pixel on the left edge (x=0) is exactly zero — no leakage along the W ray", () => {
    const tex = getLightGlowSprite();
    const data = tex.image.data as Uint8Array;
    for (let y = 0; y < LIGHT_GLOW_SPRITE_SIZE; y++) {
      expect(readByte(data, LIGHT_GLOW_SPRITE_SIZE, 0, y, 0)).toBe(0);
    }
  });

  it("every pixel on the right edge (x=size-1) is exactly zero — no leakage along the E ray", () => {
    const tex = getLightGlowSprite();
    const data = tex.image.data as Uint8Array;
    const lastX = LIGHT_GLOW_SPRITE_SIZE - 1;
    for (let y = 0; y < LIGHT_GLOW_SPRITE_SIZE; y++) {
      expect(readByte(data, LIGHT_GLOW_SPRITE_SIZE, lastX, y, 0)).toBe(0);
    }
  });

  it("the RGB channels stay mirrored so gaiaLuma(rgb) collapses to the red channel", () => {
    const tex = getLightGlowSprite();
    const data = tex.image.data as Uint8Array;
    // Spot-check three interior pixels (center, mid-radius, inside-cutoff).
    for (const [x, y] of [
      [63, 63],
      [63, 50],
      [50, 50],
    ] as const) {
      const r = readByte(data, LIGHT_GLOW_SPRITE_SIZE, x, y, 0);
      const g = readByte(data, LIGHT_GLOW_SPRITE_SIZE, x, y, 1);
      const b = readByte(data, LIGHT_GLOW_SPRITE_SIZE, x, y, 2);
      expect(g).toBe(r);
      expect(b).toBe(r);
    }
  });

  it("alpha channel is 255 everywhere (opaque — additive blend handles occlusion)", () => {
    const tex = getLightGlowSprite();
    const data = tex.image.data as Uint8Array;
    for (let i = 3; i < data.length; i += 4) {
      expect(data[i]).toBe(255);
    }
  });
});
