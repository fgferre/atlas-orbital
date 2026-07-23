import { describe, expect, it } from "vitest";
import * as THREE from "three";

import type { HygCatalogData } from "../../utils/hygBinary";
import {
  HYG_FOCUS_DEFAULT_RADIUS_WORLD,
  HYG_FOCUS_PREFIX,
  formatHygFocusId,
  parseHygFocusId,
  resolveHygDistanceFromSunPc,
  resolveHygWorldPosition,
} from "./hygFocusResolver";
import { HYG_OBLIQUITY_RAD } from "../starfield/hygFrame";

const DISTANCE_SCALE = 206_265_000.0;
const OBLIQUITY_RAD = HYG_OBLIQUITY_RAD;

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
      // T6.2-β-α: HygCatalogHeader gained `hasSpectAndAbsmag`. M6-B
      // added `hasDesignations`. v1 mock buffers don't carry either,
      // matching the v1 parser's default-fill semantics.
      hasSpectAndAbsmag: false,
      hasDesignations: false,
    },
    positions: new Float32Array(positions),
    magnitudes: new Float32Array(n),
    colorIndices: new Float32Array(n),
    pmRA: new Int16Array(n),
    pmDec: new Int16Array(n),
    // T6.2-β-α v2 fields. Mock with v1-equivalent defaults.
    spectStrings: [""],
    spectIndices: new Uint8Array(n),
    absmag: (() => {
      const a = new Float32Array(n);
      a.fill(NaN);
      return a;
    })(),
    // M6-B v3 fields. Same v1-equivalent default-fill: empty sentinel
    // pools + zero-filled per-star indices + zero numeric IDs.
    properNameStrings: [""],
    properNameIndices: new Uint16Array(n),
    bayerStrings: [""],
    bayerIndices: new Uint8Array(n),
    constellationStrings: [""],
    constellationIndices: new Uint8Array(n),
    glieseStrings: [""],
    glieseIndices: new Uint16Array(n),
    flamsteed: new Uint8Array(n),
    hd: new Uint32Array(n),
    hip: new Uint32Array(n),
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
  // Frame contract (rewritten 2026-07-23). These three cases used to
  // assert a bare `R_x(obliquity)` on the raw equatorial vector —
  // i.e. the equatorial→ecliptic step WITHOUT the `ecliptic2ThreeJs`
  // `(x, z, −y)` remap every other position in the scene goes through
  // (`lib/orbital/analytical/coordUtils.ts:67`). That is a different
  // rotation: it put the celestial north pole at (0, −sinε, +cosε)
  // instead of (0, +cosε, −sinε), leaving the whole starfield 136.8°
  // off the scene frame. Render / picking / focus all shared the bug,
  // so it was self-consistent and invisible from inside the starfield.
  // The assertions below now pin the composed transform (see
  // `lib/starfield/hygFrame.ts`).
  //
  // Catalog: three unit-parsec stars on the equatorial axes:
  //   star 0: (1, 0, 0) — vernal equinox, invariant under the rotation
  //   star 1: (0, 1, 0) — equatorial y, 90° east on the equator
  //   star 2: (0, 0, 1) — celestial north pole
  const catalog = buildCatalog([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  it("returns the scaled position for x-axis star (rotation axis, unchanged)", () => {
    const out = resolveHygWorldPosition(0, catalog);
    expect(out).not.toBeNull();
    expect(out!.x).toBeCloseTo(DISTANCE_SCALE, 0);
    expect(out!.y).toBeCloseTo(0, 5);
    expect(out!.z).toBeCloseTo(0, 5);
  });

  it("maps the equatorial y axis to (0, -sinε, -cosε)", () => {
    // Equatorial (0, 1, 0) → ecliptic (0, cosε, −sinε) → three.js
    // (x, z, −y) = (0, −sinε, −cosε), scaled by DISTANCE_SCALE.
    const out = resolveHygWorldPosition(1, catalog);
    expect(out).not.toBeNull();
    expect(out!.x).toBeCloseTo(0, 5);
    expect(out!.y).toBeCloseTo(-Math.sin(OBLIQUITY_RAD) * DISTANCE_SCALE, 0);
    expect(out!.z).toBeCloseTo(-Math.cos(OBLIQUITY_RAD) * DISTANCE_SCALE, 0);
  });

  it("maps the celestial north pole to (0, +cosε, -sinε)", () => {
    // Physical anchor: the north celestial pole sits ε = 23.44° away
    // from the scene's +Y (ecliptic north), tilted toward −Z. The old
    // contract asserted (0, −sinε, +cosε), which is 90°−ε from +Y on
    // the wrong side — the signature of the missing remap.
    const out = resolveHygWorldPosition(2, catalog);
    expect(out).not.toBeNull();
    expect(out!.x).toBeCloseTo(0, 5);
    expect(out!.y).toBeCloseTo(Math.cos(OBLIQUITY_RAD) * DISTANCE_SCALE, 0);
    expect(out!.z).toBeCloseTo(-Math.sin(OBLIQUITY_RAD) * DISTANCE_SCALE, 0);
  });

  it("maps the ecliptic north pole to scene +Y exactly", () => {
    // Ecliptic north in equatorial cartesian is (0, −sinε, cosε).
    // Anything else means the starfield's 'up' disagrees with the
    // ecliptic plane the planets orbit in.
    const eclipticNorth = buildCatalog([
      0,
      -Math.sin(OBLIQUITY_RAD),
      Math.cos(OBLIQUITY_RAD),
    ]);
    const out = resolveHygWorldPosition(0, eclipticNorth)!;
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y / DISTANCE_SCALE).toBeCloseTo(1, 5);
    expect(out.z / DISTANCE_SCALE).toBeCloseTo(0, 5);
  });

  it("puts a star on the ecliptic at |Y| ≈ 0 (Regulus)", () => {
    // Physical anchor: Regulus (α Leo) has ecliptic latitude +0.465°,
    // i.e. it lies essentially ON the ecliptic. Its equatorial J2000
    // direction is RA 152.093°, Dec +11.967°, which is nowhere near
    // the equatorial plane — so this test only passes for a transform
    // that actually rotates equatorial → ecliptic and remaps to the
    // scene's Y-up frame. Under the old contract Regulus rendered at
    // ecliptic latitude ≈ −22.7°.
    const rad = Math.PI / 180;
    const ra = 152.09296 * rad;
    const dec = 11.96721 * rad;
    const cat = buildCatalog([
      Math.cos(dec) * Math.cos(ra),
      Math.cos(dec) * Math.sin(ra),
      Math.sin(dec),
    ]);
    const out = resolveHygWorldPosition(0, cat)!;
    const latDeg = Math.asin(out.y / out.length()) / rad;
    expect(latDeg).toBeCloseTo(0.465, 2);
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

  it("matches the hygFrame equatorial→scene chain for a Sirius-like position", () => {
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
      -py * Math.sin(OBLIQUITY_RAD) + pz * Math.cos(OBLIQUITY_RAD);
    const expectedZ = -(
      py * Math.cos(OBLIQUITY_RAD) +
      pz * Math.sin(OBLIQUITY_RAD)
    );

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

describe("resolveHygDistanceFromSunPc", () => {
  // Distance is invariant under rotation (R_x preserves vector
  // magnitude) AND independent of the parsec→world-unit scale, so
  // these tests use raw parsec inputs and expect the same value out.
  // Sirius lies at ~2.6 pc; tests pin a Sirius-like position to lock
  // the contract that the helper consumes RAW catalog positions
  // (pre-DISTANCE_SCALE), not the rotated world units.
  const catalog = buildCatalog([
    1,
    0,
    0, // index 0: 1 pc on x
    0,
    3,
    4, // index 1: 5 pc (3-4-5 right triangle)
    -1.71,
    0.08,
    -2.01, // index 2: Sirius ≈ 2.6437 pc
  ]);

  it("returns the parsec magnitude for an axis-aligned star", () => {
    expect(resolveHygDistanceFromSunPc(0, catalog)).toBeCloseTo(1.0, 5);
  });

  it("returns the Euclidean magnitude for an off-axis star (3-4-5)", () => {
    expect(resolveHygDistanceFromSunPc(1, catalog)).toBeCloseTo(5.0, 5);
  });

  it("matches the catalog magnitude for a Sirius-like position", () => {
    const distance = resolveHygDistanceFromSunPc(2, catalog);
    expect(distance).not.toBeNull();
    // sqrt(1.71² + 0.08² + 2.01²) = sqrt(6.9706) ≈ 2.6402. Float32
    // round-trip pulls the components toward the nearest float32 so
    // tolerance is loose at 1e-3 (matches `resolveHygWorldPosition`'s
    // precision pin).
    expect(distance!).toBeCloseTo(2.6402, 3);
  });

  it("returns null for negative / non-integer / out-of-range indices", () => {
    expect(resolveHygDistanceFromSunPc(-1, catalog)).toBeNull();
    expect(resolveHygDistanceFromSunPc(1.5, catalog)).toBeNull();
    expect(resolveHygDistanceFromSunPc(NaN, catalog)).toBeNull();
    expect(resolveHygDistanceFromSunPc(3, catalog)).toBeNull();
    expect(resolveHygDistanceFromSunPc(1_000_000, catalog)).toBeNull();
  });

  it("is independent of the obliquity rotation applied by resolveHygWorldPosition", () => {
    // The helper reads pre-rotation catalog values and computes the
    // raw magnitude. Confirm it agrees with the world-position
    // magnitude divided by DISTANCE_SCALE for a non-trivial star.
    const worldPos = resolveHygWorldPosition(2, catalog)!;
    expect(resolveHygDistanceFromSunPc(2, catalog)!).toBeCloseTo(
      worldPos.length() / DISTANCE_SCALE,
      3
    );
  });
});
