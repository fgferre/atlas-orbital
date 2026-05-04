import { describe, expect, it } from "vitest";
import * as THREE from "three";

import type { HygCatalogData } from "../../utils/hygBinary";
import {
  HYG_FOCUS_DEFAULT_RADIUS_WORLD,
  HYG_FOCUS_PREFIX,
  formatHygFocusId,
  parseHygFocusId,
  resolveHygWorldPosition,
} from "./hygFocusResolver";

const DISTANCE_SCALE = 206_265_000.0;
const OBLIQUITY_RAD = (23.4 * Math.PI) / 180;

const buildCatalog = (
  positions: ReadonlyArray<number>,
  count?: number
): HygCatalogData => {
  const n = count ?? positions.length / 3;
  return {
    header: {
      magic: "HYG1",
      version: 1,
      count: n,
      flags: 1,
      hasProperMotion: true,
      // T6.2-β-α: HygCatalogHeader gained `hasSpectAndAbsmag`. v1
      // mock buffers don't carry spect/absmag so the flag is false;
      // matches the v1 parser's default-fill semantics.
      hasSpectAndAbsmag: false,
    },
    positions: new Float32Array(positions),
    magnitudes: new Float32Array(n),
    colorIndices: new Float32Array(n),
    pmRA: new Int16Array(n),
    pmDec: new Int16Array(n),
    // T6.2-β-α: HygCatalogData gained spectStrings / spectIndices /
    // absmag. Mock with v1-equivalent defaults (empty sentinel
    // string table + zero-filled indices + NaN-filled absmag).
    spectStrings: [""],
    spectIndices: new Uint8Array(n),
    absmag: (() => {
      const a = new Float32Array(n);
      a.fill(NaN);
      return a;
    })(),
  };
};

describe("HYG_FOCUS_PREFIX", () => {
  it("is the lowercase 'hyg:' prefix", () => {
    expect(HYG_FOCUS_PREFIX).toBe("hyg:");
  });
});

describe("HYG_FOCUS_DEFAULT_RADIUS_WORLD", () => {
  it("is positive and finite (placeholder until T6.2 radiusFromSpect)", () => {
    expect(HYG_FOCUS_DEFAULT_RADIUS_WORLD).toBeGreaterThan(0);
    expect(Number.isFinite(HYG_FOCUS_DEFAULT_RADIUS_WORLD)).toBe(true);
  });
});

describe("formatHygFocusId", () => {
  it("prefixes with 'hyg:'", () => {
    expect(formatHygFocusId(0)).toBe("hyg:0");
    expect(formatHygFocusId(42)).toBe("hyg:42");
    expect(formatHygFocusId(109_614)).toBe("hyg:109614");
  });
});

describe("parseHygFocusId", () => {
  it("returns the integer index for valid 'hyg:<n>' input", () => {
    expect(parseHygFocusId("hyg:0")).toBe(0);
    expect(parseHygFocusId("hyg:42")).toBe(42);
    expect(parseHygFocusId("hyg:109614")).toBe(109_614);
  });

  it("returns null for curated solar-system IDs", () => {
    expect(parseHygFocusId("earth")).toBeNull();
    expect(parseHygFocusId("sun")).toBeNull();
    expect(parseHygFocusId("moon")).toBeNull();
  });

  it("returns null for empty index suffix", () => {
    expect(parseHygFocusId("hyg:")).toBeNull();
  });

  it("returns null for non-numeric suffix", () => {
    expect(parseHygFocusId("hyg:abc")).toBeNull();
    expect(parseHygFocusId("hyg:42abc")).toBeNull();
    expect(parseHygFocusId("hyg:42.5")).toBeNull();
  });

  it("returns null for negative or signed suffix", () => {
    expect(parseHygFocusId("hyg:-1")).toBeNull();
    expect(parseHygFocusId("hyg:+1")).toBeNull();
  });

  it("is case-sensitive on the prefix", () => {
    expect(parseHygFocusId("HYG:42")).toBeNull();
    expect(parseHygFocusId("Hyg:42")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseHygFocusId(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseHygFocusId("")).toBeNull();
  });
});

describe("resolveHygWorldPosition", () => {
  // Build a catalog with two stars at known parsec positions:
  //   star 0: (1, 0, 0) parsec — pure x axis, no obliquity rotation
  //   star 1: (0, 1, 0) parsec — pure y axis, rotated by R_x(obliquity)
  //   star 2: (0, 0, 1) parsec — pure z axis, rotated by R_x(obliquity)
  const catalog = buildCatalog([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  it("returns the scaled position for x-axis star (no rotation effect)", () => {
    const out = resolveHygWorldPosition(0, catalog);
    expect(out).not.toBeNull();
    expect(out!.x).toBeCloseTo(DISTANCE_SCALE, 0);
    expect(out!.y).toBeCloseTo(0, 5);
    expect(out!.z).toBeCloseTo(0, 5);
  });

  it("applies R_x(obliquity) rotation to y-axis star", () => {
    // Pre-rotation: (0, 1, 0) * DISTANCE_SCALE
    // Post R_x(obliquity): (0, cos·1·DISTANCE_SCALE, sin·1·DISTANCE_SCALE)
    const out = resolveHygWorldPosition(1, catalog);
    expect(out).not.toBeNull();
    expect(out!.x).toBeCloseTo(0, 5);
    expect(out!.y).toBeCloseTo(Math.cos(OBLIQUITY_RAD) * DISTANCE_SCALE, 0);
    expect(out!.z).toBeCloseTo(Math.sin(OBLIQUITY_RAD) * DISTANCE_SCALE, 0);
  });

  it("applies R_x(obliquity) rotation to z-axis star", () => {
    // Pre-rotation: (0, 0, 1) * DISTANCE_SCALE
    // Post R_x(obliquity): (0, -sin·1·DISTANCE_SCALE, cos·1·DISTANCE_SCALE)
    const out = resolveHygWorldPosition(2, catalog);
    expect(out).not.toBeNull();
    expect(out!.x).toBeCloseTo(0, 5);
    expect(out!.y).toBeCloseTo(-Math.sin(OBLIQUITY_RAD) * DISTANCE_SCALE, 0);
    expect(out!.z).toBeCloseTo(Math.cos(OBLIQUITY_RAD) * DISTANCE_SCALE, 0);
  });

  it("returns null for negative index", () => {
    expect(resolveHygWorldPosition(-1, catalog)).toBeNull();
  });

  it("returns null for non-integer index", () => {
    expect(resolveHygWorldPosition(1.5, catalog)).toBeNull();
    expect(resolveHygWorldPosition(NaN, catalog)).toBeNull();
  });

  it("returns null when index >= catalog count", () => {
    expect(resolveHygWorldPosition(3, catalog)).toBeNull();
    expect(resolveHygWorldPosition(1_000_000, catalog)).toBeNull();
  });

  it("reuses the provided scratch vector (no new allocation)", () => {
    const scratch = new THREE.Vector3();
    const out = resolveHygWorldPosition(0, catalog, scratch);
    expect(out).toBe(scratch);
  });

  it("allocates a fresh Vector3 when out is omitted", () => {
    const a = resolveHygWorldPosition(0, catalog);
    const b = resolveHygWorldPosition(0, catalog);
    expect(a).not.toBe(b);
    expect(a).toBeInstanceOf(THREE.Vector3);
  });

  it("matches StarHoverPicker.buildPickCandidates rotation chain for a Sirius-like position", () => {
    // Sirius at ~2.64 pc in the equatorial J2000 frame: roughly
    // (-1.71, +0.08, -2.01) parsec. Verify the resolver returns the
    // same rotated world-units that StarHoverPicker computes.
    //
    // Float32 round-trip note: the catalog's positions field is a
    // Float32Array, so the resolver reads -1.71 as the nearest
    // float32 (-1.7099999...). Round-trip the expected values
    // through Float32 first so the comparison reflects the runtime
    // path, not the literal-precision float64 path.
    const positions = new Float32Array([-1.71, 0.08, -2.01]);
    const cat = buildCatalog([-1.71, 0.08, -2.01]);
    const out = resolveHygWorldPosition(0, cat);
    expect(out).not.toBeNull();

    const px = positions[0] * DISTANCE_SCALE;
    const py = positions[1] * DISTANCE_SCALE;
    const pz = positions[2] * DISTANCE_SCALE;
    const expectedX = px;
    const expectedY =
      py * Math.cos(OBLIQUITY_RAD) - pz * Math.sin(OBLIQUITY_RAD);
    const expectedZ =
      py * Math.sin(OBLIQUITY_RAD) + pz * Math.cos(OBLIQUITY_RAD);

    expect(out!.x).toBeCloseTo(expectedX, 0);
    expect(out!.y).toBeCloseTo(expectedY, 0);
    expect(out!.z).toBeCloseTo(expectedZ, 0);
  });
});

describe("formatHygFocusId / parseHygFocusId roundtrip", () => {
  it("parse(format(K)) === K for a sample of indices", () => {
    for (const k of [0, 1, 42, 1000, 109_614]) {
      expect(parseHygFocusId(formatHygFocusId(k))).toBe(k);
    }
  });
});
