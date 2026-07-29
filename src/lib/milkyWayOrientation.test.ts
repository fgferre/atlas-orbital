import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  GALACTIC_NGP_DEC_DEG,
  GALACTIC_NGP_RA_DEG,
  GALACTIC_TO_EQUATORIAL_MATRIX,
  GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR,
  applyRotation,
  applyRotationTranspose,
  galacticLonLatToEquirectUv,
  galacticLonLatToUnitVector,
  galacticToEclipticLonLatDeg,
  galacticToSceneDirection,
  sceneDirectionToMilkyWayUv,
  MILKY_WAY_BAND_EDGE_LINEAR,
  MILKY_WAY_BAND_PEAK_LINEAR,
  MILKY_WAY_BLOOM_THRESHOLD,
  MILKY_WAY_BRIGHTNESS_MULTIPLIER,
  MILKY_WAY_TEXTURE_CEILING,
} from "./milkyWayOrientation";
import { STAR_DISPLAY_BLACK_POINT } from "./starfieldShaderMath";

// Published numeric ICRS<->Galactic rotation matrix (row-major,
// equatorial->galactic), reproduced in Liu, Zhu & Zhang (2010) and
// identical to the one published in the ESA Hipparcos & Tycho
// Catalogues (1997), Vol. 1, Section 1.5.3. Independent of this
// module's Gram-Schmidt construction -- used only to cross-check it.
const PUBLISHED_EQ_TO_GAL_ROW_MAJOR = [
  -0.0548755604162154, -0.873437090234885, -0.4838350155487132,
  0.4941094278755837, -0.4448296299600112, 0.746982244497219,
  -0.8676661490190047, -0.1980763734312015, 0.4559837761750669,
];

describe("galactic->equatorial matrix (Gram-Schmidt from cited R,Q,P)", () => {
  it("agrees with the independently published numeric matrix to 1e-12", () => {
    // GALACTIC_TO_EQUATORIAL_MATRIX is galactic->equatorial; the
    // published constant above is equatorial->galactic, so compare
    // against its transpose.
    const published = new THREE.Matrix3().set(
      PUBLISHED_EQ_TO_GAL_ROW_MAJOR[0],
      PUBLISHED_EQ_TO_GAL_ROW_MAJOR[1],
      PUBLISHED_EQ_TO_GAL_ROW_MAJOR[2],
      PUBLISHED_EQ_TO_GAL_ROW_MAJOR[3],
      PUBLISHED_EQ_TO_GAL_ROW_MAJOR[4],
      PUBLISHED_EQ_TO_GAL_ROW_MAJOR[5],
      PUBLISHED_EQ_TO_GAL_ROW_MAJOR[6],
      PUBLISHED_EQ_TO_GAL_ROW_MAJOR[7],
      PUBLISHED_EQ_TO_GAL_ROW_MAJOR[8]
    );
    const publishedGalToEq = published.clone().transpose();

    const ours = GALACTIC_TO_EQUATORIAL_MATRIX.elements; // column-major
    const theirs = publishedGalToEq.elements;
    for (let i = 0; i < 9; i++) {
      expect(ours[i]).toBeCloseTo(theirs[i], 12);
    }
  });

  it("maps the North Galactic Pole to its known equatorial RA/Dec", () => {
    const ngp = galacticLonLatToUnitVector(0, 90).applyMatrix3(
      GALACTIC_TO_EQUATORIAL_MATRIX
    );
    const raDeg = (Math.atan2(ngp.y, ngp.x) * 180) / Math.PI;
    const decDeg = (Math.asin(ngp.z) * 180) / Math.PI;
    expect(((raDeg % 360) + 360) % 360).toBeCloseTo(GALACTIC_NGP_RA_DEG, 6);
    expect(decDeg).toBeCloseTo(GALACTIC_NGP_DEC_DEG, 6);
  });

  it("maps the Galactic Center to its known equatorial RA/Dec (266.405, -28.936)", () => {
    const gc = galacticLonLatToUnitVector(0, 0).applyMatrix3(
      GALACTIC_TO_EQUATORIAL_MATRIX
    );
    const raDeg = (Math.atan2(gc.y, gc.x) * 180) / Math.PI;
    const decDeg = (Math.asin(gc.z) * 180) / Math.PI;
    expect(((raDeg % 360) + 360) % 360).toBeCloseTo(266.405, 2);
    expect(decDeg).toBeCloseTo(-28.936, 2);
  });
});

describe("galactic -> ecliptic pin (THE classic failure mode: wrong handedness/transpose)", () => {
  it("Galactic Center (l=0,b=0) lands within tolerance of its known ecliptic direction", () => {
    // Task-specified pin: galactic center, equatorial RA 266.405 deg,
    // Dec -28.936 deg J2000 -> ecliptic lon ~=266.84 deg, lat ~=-5.54 deg.
    const { lonDeg, latDeg } = galacticToEclipticLonLatDeg(0, 0);
    expect(lonDeg).toBeCloseTo(266.84, 1);
    expect(latDeg).toBeCloseTo(-5.54, 1);
    // Tighter bound to actually catch a wrong-handedness/transposed-Euler
    // bug, which would miss by tens of degrees, not hundredths.
    expect(Math.abs(lonDeg - 266.84)).toBeLessThan(0.05);
    expect(Math.abs(latDeg - -5.54)).toBeLessThan(0.05);
  });

  it("North Galactic Pole ecliptic position matches the standard ~29.8 deg ecliptic latitude", () => {
    // Independent second pin, not given in the task text: the NGP's
    // ecliptic coordinates are a standard citable value
    // (lon ~=180.02 deg, lat ~=29.81 deg, J2000) -- a wrong rotation
    // that happened to pass the GC pin by coincidence would still be
    // caught here.
    const { lonDeg, latDeg } = galacticToEclipticLonLatDeg(0, 90);
    expect(lonDeg).toBeCloseTo(180.02, 0);
    expect(latDeg).toBeCloseTo(29.81, 1);
  });
});

describe("galactic <-> scene rotation (forward/inverse consistency)", () => {
  it("is a proper rotation (determinant +1, orthogonal)", () => {
    const m = GALACTIC_TO_EQUATORIAL_MATRIX;
    expect(m.determinant()).toBeCloseTo(1, 10);

    const rowMajor = GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR;
    const full = new THREE.Matrix3().set(
      rowMajor[0],
      rowMajor[1],
      rowMajor[2],
      rowMajor[3],
      rowMajor[4],
      rowMajor[5],
      rowMajor[6],
      rowMajor[7],
      rowMajor[8]
    );
    expect(full.determinant()).toBeCloseTo(1, 10);
  });

  it("applyRotationTranspose is the exact inverse of applyRotation", () => {
    const v = new THREE.Vector3(0.4, -0.5, 0.767).normalize();
    const forward = applyRotation(GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR, v);
    const back = applyRotationTranspose(
      GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR,
      forward
    );
    expect(back.x).toBeCloseTo(v.x, 10);
    expect(back.y).toBeCloseTo(v.y, 10);
    expect(back.z).toBeCloseTo(v.z, 10);
  });

  it("round-trips galactic (l,b) -> scene direction -> galactic (l,b)", () => {
    for (const [l, b] of [
      [0, 0],
      [45, 20],
      [180, -60],
      [270, 5],
      [10, 89],
    ]) {
      const scene = galacticToSceneDirection(l, b);
      const back = applyRotationTranspose(
        GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR,
        scene
      ).normalize();
      const lBack = (Math.atan2(back.y, back.x) * 180) / Math.PI;
      const bBack =
        (Math.asin(Math.max(-1, Math.min(1, back.z))) * 180) / Math.PI;
      const lWrapped = (((((l % 360) + 360) % 360) + 540) % 360) - 180;
      const lBackWrapped = ((lBack + 540) % 360) - 180;
      // Near the pole (b=+-90) longitude is degenerate; skip the l check there.
      if (Math.abs(b) < 89.9) {
        expect(lBackWrapped).toBeCloseTo(lWrapped, 6);
      }
      expect(bBack).toBeCloseTo(b, 6);
    }
  });
});

describe("equirectangular UV mapping (empirically-validated orientation)", () => {
  it("centers the galactic center at u=0.5", () => {
    const { u, v } = galacticLonLatToEquirectUv(0, 0);
    expect(u).toBeCloseTo(0.5, 10);
    expect(v).toBeCloseTo(0.5, 10);
  });

  it("longitude increases to the LEFT (u decreases as l increases), per NASA SVS", () => {
    const u10 = galacticLonLatToEquirectUv(10, 0).u;
    const u0 = galacticLonLatToEquirectUv(0, 0).u;
    expect(u10).toBeLessThan(u0);
  });

  it("south galactic pole is at v=0 (image top), north at v=1 (image bottom)", () => {
    // Empirically determined via LMC/SMC pixel brightness -- see module
    // doc. b=-90 (south) -> v=0; b=+90 (north) -> v=1.
    expect(galacticLonLatToEquirectUv(0, -90).v).toBeCloseTo(0, 10);
    expect(galacticLonLatToEquirectUv(0, 90).v).toBeCloseTo(1, 10);
  });

  it("wraps the +-180 meridian to the same edge (u=1) on both sides", () => {
    expect(galacticLonLatToEquirectUv(180, 0).u).toBeCloseTo(1, 10);
    expect(galacticLonLatToEquirectUv(-180, 0).u).toBeCloseTo(1, 10);
  });

  it("sceneDirectionToMilkyWayUv agrees with the direct galactic-lon/lat path", () => {
    const dir = galacticToSceneDirection(123, -17);
    const { u, v } = sceneDirectionToMilkyWayUv(dir);
    const direct = galacticLonLatToEquirectUv(123, -17);
    expect(u).toBeCloseTo(direct.u, 6);
    expect(v).toBeCloseTo(direct.v, 6);
  });
});

describe("display calibration (derived, not tuned)", () => {
  it("MILKY_WAY_BRIGHTNESS_MULTIPLIER matches the documented geometric-mean derivation", () => {
    const peakTex = MILKY_WAY_BAND_PEAK_LINEAR / MILKY_WAY_TEXTURE_CEILING;
    const edgeTex = MILKY_WAY_BAND_EDGE_LINEAR / MILKY_WAY_TEXTURE_CEILING;
    const expected =
      Math.sqrt(STAR_DISPLAY_BLACK_POINT * MILKY_WAY_BLOOM_THRESHOLD) /
      Math.sqrt(peakTex * edgeTex);
    expect(MILKY_WAY_BRIGHTNESS_MULTIPLIER).toBeCloseTo(expected, 10);
  });

  it("the band's own brightest latitude lands near the bloom gate, not far past it", () => {
    const peakTex = MILKY_WAY_BAND_PEAK_LINEAR / MILKY_WAY_TEXTURE_CEILING;
    const onScreen = peakTex * MILKY_WAY_BRIGHTNESS_MULTIPLIER;
    expect(onScreen).toBeGreaterThan(STAR_DISPLAY_BLACK_POINT);
    // Subordinate to the zodiacal band's peak (19.7x black point / 3.26x
    // bloom, per zodiacalLightLut.ts) -- the product requirement is that
    // the diffuse Milky Way must not dominate zodiacal light at 1 AU.
    expect(onScreen).toBeLessThan(1.5);
  });

  it("the band's faint edge sits at or just below the display black point", () => {
    const edgeTex = MILKY_WAY_BAND_EDGE_LINEAR / MILKY_WAY_TEXTURE_CEILING;
    const onScreen = edgeTex * MILKY_WAY_BRIGHTNESS_MULTIPLIER;
    expect(onScreen).toBeCloseTo(STAR_DISPLAY_BLACK_POINT, 2);
  });
});
