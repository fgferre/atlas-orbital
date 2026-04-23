import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  GRID_ORIENTATION_COLOR_BYTES,
  GRID_ORIENTATION_COLORS,
  GRID_ORIENTATION_LABELS,
  GRID_ORIENTATIONS,
  GALACTIC_P_DEG,
  GALACTIC_Q_DEG,
  GALACTIC_R_DEG,
  OBLIQUITY_DEG_J2000,
  getEclipticToEquatorialMatrix,
  getGalacticToEquatorialMatrix,
  getGridOrientationMatrix,
  getGridRotationMatrix,
} from "./gridOrientation";

// Source citations under /tmp/gaiasky/core/src/gaiasky/ unless noted.

describe("gridOrientation — constants", () => {
  it("OBLIQUITY_DEG_J2000 = 23.4392808 (Coordinates.java:26)", () => {
    expect(OBLIQUITY_DEG_J2000).toBe(23.4392808);
  });

  it("galactic Euler angles R / Q / P match Coordinates.java:39-41", () => {
    expect(GALACTIC_R_DEG).toBe(32.93192);
    expect(GALACTIC_Q_DEG).toBe(27.12825);
    expect(GALACTIC_P_DEG).toBe(192.85948);
  });
});

describe("GRID_ORIENTATION_COLOR_BYTES — ColorUtils.java:28-32 + GridRecursive.java:21-23", () => {
  it("equatorial = ccEq = gRed = [219, 68, 55, 255]", () => {
    expect(GRID_ORIENTATION_COLOR_BYTES.equatorial).toEqual([219, 68, 55, 255]);
  });

  it("ecliptic = ccEcl = gGreen = [15, 157, 88, 255]", () => {
    expect(GRID_ORIENTATION_COLOR_BYTES.ecliptic).toEqual([15, 157, 88, 255]);
  });

  it("galactic = ccGal = gBlue = [66, 133, 244, 255]", () => {
    expect(GRID_ORIENTATION_COLOR_BYTES.galactic).toEqual([66, 133, 244, 255]);
  });
});

describe("GRID_ORIENTATION_COLORS — normalized-float vec4 variants", () => {
  it("every RGB component is the byte value divided by 255", () => {
    for (const o of GRID_ORIENTATIONS) {
      const bytes = GRID_ORIENTATION_COLOR_BYTES[o];
      const float = GRID_ORIENTATION_COLORS[o];
      for (let i = 0; i < 3; i++) {
        expect(float[i]).toBeCloseTo(bytes[i] / 255, 10);
      }
    }
  });

  it("alpha is always 1.0 (no per-orientation alpha curve on the swatch itself)", () => {
    for (const o of GRID_ORIENTATIONS) {
      expect(GRID_ORIENTATION_COLORS[o][3]).toBe(1);
    }
  });
});

describe("getGridRotationMatrix — Coordinates.getRotationMatrix port", () => {
  it("all-zero input is the identity matrix", () => {
    const m = getGridRotationMatrix(0, 0, 0);
    const id = new THREE.Matrix4().identity();
    for (let i = 0; i < 16; i++) {
      expect(m.elements[i]).toBeCloseTo(id.elements[i], 10);
    }
  });

  it("beta-only (0, 90, 0) is Rz(90°) — maps (1,0,0) → (0,1,0)", () => {
    const m = getGridRotationMatrix(0, 90, 0);
    const v = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(1, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it("gamma-only (0, 0, 90) is Ry(90°) — maps (1,0,0) → (0,0,-1)", () => {
    const m = getGridRotationMatrix(0, 0, 90);
    const v = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(-1, 10);
  });

  it("alpha-only (90, 0, 0) is Ry(90°) — same axis as gamma when beta=0 (degenerate)", () => {
    // `Ry(0) * Rz(0) * Ry(90) = Ry(90)` — single rotation
    const m = getGridRotationMatrix(90, 0, 0);
    const v = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(-1, 10);
  });
});

describe("getEclipticToEquatorialMatrix — Coordinates.java:69", () => {
  it("is a pure Z-rotation by OBLIQUITY_DEG_J2000 (alpha=0, beta=obliquity, gamma=0)", () => {
    const m = getEclipticToEquatorialMatrix();
    const rz = new THREE.Matrix4().makeRotationZ(
      THREE.MathUtils.degToRad(OBLIQUITY_DEG_J2000)
    );
    for (let i = 0; i < 16; i++) {
      expect(m.elements[i]).toBeCloseTo(rz.elements[i], 10);
    }
  });

  it("rotates the X axis by +obliquity around Z (X→X·cos + Y·sin)", () => {
    const m = getEclipticToEquatorialMatrix();
    const v = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
    const c = Math.cos(THREE.MathUtils.degToRad(OBLIQUITY_DEG_J2000));
    const s = Math.sin(THREE.MathUtils.degToRad(OBLIQUITY_DEG_J2000));
    expect(v.x).toBeCloseTo(c, 10);
    expect(v.y).toBeCloseTo(s, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it("leaves the Z axis (ecliptic pole) invariant", () => {
    const m = getEclipticToEquatorialMatrix();
    const v = new THREE.Vector3(0, 0, 1).applyMatrix4(m);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(1, 10);
  });
});

describe("getGalacticToEquatorialMatrix — Coordinates.java:73", () => {
  it("is not the identity (galactic plane is tilted vs the equatorial / ecliptic planes)", () => {
    const m = getGalacticToEquatorialMatrix();
    const id = new THREE.Matrix4().identity();
    let maxDiff = 0;
    for (let i = 0; i < 16; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(m.elements[i] - id.elements[i]));
    }
    expect(maxDiff).toBeGreaterThan(0.1);
  });

  it("is orthogonal (determinant = 1, pure rotation — no scaling, no shear)", () => {
    const m = getGalacticToEquatorialMatrix();
    const det = m.determinant();
    expect(det).toBeCloseTo(1, 6);
  });

  it("inverse equals transpose (invariant of pure rotation matrices)", () => {
    const m = getGalacticToEquatorialMatrix();
    const mInv = m.clone().invert();
    const mT = m.clone().transpose();
    for (let i = 0; i < 16; i++) {
      expect(mInv.elements[i]).toBeCloseTo(mT.elements[i], 8);
    }
  });
});

describe("getGridOrientationMatrix — dispatcher", () => {
  it("ecliptic returns the identity (atlas's world frame is ecliptic-aligned via planet orbits)", () => {
    const m = getGridOrientationMatrix("ecliptic");
    const id = new THREE.Matrix4().identity();
    for (let i = 0; i < 16; i++) {
      expect(m.elements[i]).toBeCloseTo(id.elements[i], 10);
    }
  });

  it("equatorial returns the ecliptic→equatorial rotation", () => {
    const got = getGridOrientationMatrix("equatorial");
    const want = getEclipticToEquatorialMatrix();
    for (let i = 0; i < 16; i++) {
      expect(got.elements[i]).toBeCloseTo(want.elements[i], 10);
    }
  });

  it("galactic returns the galactic→equatorial rotation", () => {
    const got = getGridOrientationMatrix("galactic");
    const want = getGalacticToEquatorialMatrix();
    for (let i = 0; i < 16; i++) {
      expect(got.elements[i]).toBeCloseTo(want.elements[i], 10);
    }
  });

  it("returns a fresh Matrix4 each call (no shared state aliasing)", () => {
    const a = getGridOrientationMatrix("equatorial");
    const b = getGridOrientationMatrix("equatorial");
    expect(a).not.toBe(b);
    a.elements[0] = 999;
    expect(b.elements[0]).not.toBe(999);
  });
});

describe("GRID_ORIENTATIONS + labels — UI wiring", () => {
  it("lists all three orientations in declared order (ecliptic first = atlas default)", () => {
    expect(GRID_ORIENTATIONS).toEqual(["ecliptic", "equatorial", "galactic"]);
  });

  it("every orientation has a human label", () => {
    for (const o of GRID_ORIENTATIONS) {
      expect(GRID_ORIENTATION_LABELS[o]).toBeTruthy();
    }
  });
});
