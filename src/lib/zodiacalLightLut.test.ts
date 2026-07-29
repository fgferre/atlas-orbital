import { describe, expect, it } from "vitest";
import {
  buildZodiacalUniformGrid,
  sampleZodiacalGridS10,
  zodiacalAnglesFromDirection,
  zodiacalHeliocentricFactor,
  ZODIACAL_BLOOM_THRESHOLD,
  ZODIACAL_BRIGHT_ANCHOR_S10,
  ZODIACAL_BRIGHTNESS_S10,
  ZODIACAL_FAINT_ANCHOR_S10,
  ZODIACAL_FRAGMENT_GLSL,
  ZODIACAL_GRID_BETA_COUNT,
  ZODIACAL_GRID_LAMBDA_COUNT,
  ZODIACAL_GRID_STEP_DEG,
  ZODIACAL_POLE_S10,
  ZODIACAL_REFERENCE_R_AU,
  ZODIACAL_R_EXPONENT,
  ZODIACAL_S10_TO_LINEAR,
  ZODIACAL_TABLE_BETA_AXIS_DEG,
  ZODIACAL_TABLE_LAMBDA_AXIS_DEG,
} from "./zodiacalLightLut";
import { STAR_DISPLAY_BLACK_POINT } from "./starfieldShaderMath";

const DEG = Math.PI / 180;

/** Angular distance from the Sun for a helioecliptic cell, via
 *  `cos ε = cos β · cos Δλ` with the Sun at β = 0. */
const elongationDeg = (lambdaDeg: number, betaDeg: number): number =>
  Math.acos(Math.cos(betaDeg * DEG) * Math.cos(lambdaDeg * DEG)) / DEG;

const cell = (lambdaDeg: number, betaDeg: number): number | null => {
  const r = ZODIACAL_TABLE_LAMBDA_AXIS_DEG.indexOf(lambdaDeg);
  const c = ZODIACAL_TABLE_BETA_AXIS_DEG.indexOf(betaDeg);
  expect(r, `λ−λ☉=${lambdaDeg} is a table row`).toBeGreaterThanOrEqual(0);
  expect(c, `β=${betaDeg} is a table column`).toBeGreaterThanOrEqual(0);
  return ZODIACAL_BRIGHTNESS_S10[r][c];
};

describe("Leinert Table 16 layout", () => {
  // The layer shipped in 48a3acc declared rows = β over 19 values out to
  // 180°, which is not a latitude any sky has. These are the anchors that
  // prove the orientation without the paper in hand.
  it("indexes rows by λ−λ☉ and columns by β", () => {
    expect(ZODIACAL_BRIGHTNESS_S10).toHaveLength(
      ZODIACAL_TABLE_LAMBDA_AXIS_DEG.length
    );
    for (const row of ZODIACAL_BRIGHTNESS_S10) {
      expect(row).toHaveLength(ZODIACAL_TABLE_BETA_AXIS_DEG.length);
    }
    expect(ZODIACAL_TABLE_LAMBDA_AXIS_DEG.at(-1)).toBe(180);
    expect(ZODIACAL_TABLE_BETA_AXIS_DEG.at(-1)).toBe(75);
  });

  it("places the named cells where Table 16 puts them", () => {
    expect(cell(15, 0)).toBe(9000); // brightest tabulated: the inner cone
    expect(cell(30, 0)).toBe(1940);
    expect(cell(90, 0)).toBe(202); // canonical quadrature brightness
    expect(cell(180, 0)).toBe(180); // gegenschein
    expect(cell(0, 30)).toBe(770); // straight "above" the Sun
  });

  it("reads as an in-ecliptic profile down the β=0 column", () => {
    const profile = ZODIACAL_TABLE_LAMBDA_AXIS_DEG.map(
      (l) => cell(l, 0) as number | null
    );
    const tabulated = profile.slice(3) as number[]; // λ−λ☉ ≥ 15°
    // Monotone decline from the inner cone to the minimum, then the
    // gegenschein rise. Anything transposed breaks this immediately.
    const minIndex = tabulated.indexOf(Math.min(...tabulated));
    expect(tabulated[minIndex]).toBe(140);
    for (let i = 1; i <= minIndex; i++) {
      expect(tabulated[i]).toBeLessThanOrEqual(tabulated[i - 1]);
    }
    expect(tabulated.at(-1)).toBe(180);
    expect(tabulated.at(-1)!).toBeGreaterThan(tabulated[minIndex]);
  });

  it("keeps the β=75 column bracketing the 60 ± 3 pole value", () => {
    const last = ZODIACAL_TABLE_BETA_AXIS_DEG.length - 1;
    for (const row of ZODIACAL_BRIGHTNESS_S10) {
      expect(row[last]).toBeGreaterThanOrEqual(56);
      expect(row[last]).toBeLessThanOrEqual(78);
    }
  });

  it("leaves blanks only inside 15° of the Sun", () => {
    let blanks = 0;
    ZODIACAL_TABLE_LAMBDA_AXIS_DEG.forEach((l, r) => {
      ZODIACAL_TABLE_BETA_AXIS_DEG.forEach((b, c) => {
        if (ZODIACAL_BRIGHTNESS_S10[r][c] !== null) return;
        blanks++;
        expect(elongationDeg(l, b)).toBeLessThanOrEqual(15 + 1e-9);
      });
    });
    expect(blanks).toBe(9);
  });
});

describe("uniform resampling", () => {
  const grid = buildZodiacalUniformGrid();

  it("covers λ−λ☉ ∈ [0,180] and |β| ∈ [0,90] at a 5° step", () => {
    expect(ZODIACAL_GRID_STEP_DEG).toBe(5);
    expect(ZODIACAL_GRID_LAMBDA_COUNT).toBe(37);
    expect(ZODIACAL_GRID_BETA_COUNT).toBe(19);
    expect(grid).toHaveLength(37 * 19);
    expect(grid.every(Number.isFinite)).toBe(true);
  });

  it("reproduces every tabulated cell exactly", () => {
    ZODIACAL_TABLE_LAMBDA_AXIS_DEG.forEach((l) => {
      ZODIACAL_TABLE_BETA_AXIS_DEG.forEach((b) => {
        const source = cell(l, b);
        if (source === null) return;
        expect(sampleZodiacalGridS10(grid, l, b)).toBeCloseTo(source, 4);
      });
    });
  });

  it("holds the innermost tabulated value across the blank wedge", () => {
    // Constant extension inward, not a fade to zero: "no datum" and "no
    // light" are opposite claims, and the gap between them is 9000 S10☉.
    expect(sampleZodiacalGridS10(grid, 0, 0)).toBeCloseTo(9000, 4);
    expect(sampleZodiacalGridS10(grid, 10, 0)).toBeCloseTo(9000, 4);
    expect(sampleZodiacalGridS10(grid, 0, 10)).toBeCloseTo(3700, 4);
  });

  it("adds a λ-independent pole row at |β| = 90°", () => {
    for (let l = 0; l <= 180; l += 45) {
      expect(sampleZodiacalGridS10(grid, l, 90)).toBeCloseTo(
        ZODIACAL_POLE_S10,
        4
      );
    }
  });

  it("interpolates in true axis space across the 15°-wide knots", () => {
    // λ−λ☉ 45 → 60 is a 15° source interval. A sampler that assumed a
    // uniform axis would land somewhere else entirely here.
    const at45 = cell(45, 0) as number;
    const at60 = cell(60, 0) as number;
    expect(sampleZodiacalGridS10(grid, 50, 0)).toBeCloseTo(
      at45 + (at60 - at45) / 3,
      3
    );
    // β 30 → 45 likewise.
    const b30 = cell(90, 30) as number;
    const b45 = cell(90, 45) as number;
    expect(sampleZodiacalGridS10(grid, 90, 35)).toBeCloseTo(
      b30 + (b45 - b30) / 3,
      3
    );
  });

  it("mirrors the southern sky and clamps past the domain", () => {
    expect(sampleZodiacalGridS10(grid, 45, -20)).toBeCloseTo(
      sampleZodiacalGridS10(grid, 45, 20),
      6
    );
    expect(sampleZodiacalGridS10(grid, 240, 120)).toBeCloseTo(
      sampleZodiacalGridS10(grid, 180, 90),
      6
    );
  });
});

describe("helioecliptic angles", () => {
  const dirOf = (lonDeg: number, latDeg: number) =>
    [
      Math.cos(latDeg * DEG) * Math.cos(lonDeg * DEG),
      Math.sin(latDeg * DEG),
      Math.cos(latDeg * DEG) * Math.sin(lonDeg * DEG),
    ] as const;

  const sunDir = dirOf(0, 0);

  it("equals the 3D elongation for a line of sight in the ecliptic", () => {
    for (const lon of [0, 15, 45, 90, 137, 180]) {
      const { betaDeg, lambdaDeg } = zodiacalAnglesFromDirection(
        dirOf(lon, 0),
        sunDir
      );
      expect(betaDeg).toBeCloseTo(0, 9);
      expect(lambdaDeg).toBeCloseTo(lon, 9);
      expect(lambdaDeg).toBeCloseTo(elongationDeg(lon, 0), 9);
    }
  });

  it("is a longitude difference off the plane, not the separation", () => {
    // The shipped shader passed acos(dot(dir, sunDir)) as λ−λ☉. The two
    // are tied by cos ε = cos β · cos Δλ, which pulls ε toward 90°: the
    // old path sampled too far from the Sun inside quadrature and too
    // near it beyond, in both cases off the axis the table is indexed on.
    const separationDeg = (dir: readonly number[]) =>
      Math.acos(dir[0] * sunDir[0] + dir[1] * sunDir[1] + dir[2] * sunDir[2]) /
      DEG;

    for (const [lon, lat] of [
      [30, 40],
      [60, 20],
      [120, 60],
    ]) {
      const dir = dirOf(lon, lat);
      const { betaDeg, lambdaDeg } = zodiacalAnglesFromDirection(dir, sunDir);
      expect(betaDeg).toBeCloseTo(lat, 9);
      expect(lambdaDeg).toBeCloseTo(lon, 9);
      expect(Math.cos(separationDeg(dir) * DEG)).toBeCloseTo(
        Math.cos(betaDeg * DEG) * Math.cos(lambdaDeg * DEG),
        9
      );
    }

    // Direction of the error, both sides of quadrature.
    expect(separationDeg(dirOf(30, 40))).toBeGreaterThan(30);
    expect(separationDeg(dirOf(120, 60))).toBeLessThan(120);
  });

  it("stays finite looking along the ecliptic pole", () => {
    const { betaDeg, lambdaDeg } = zodiacalAnglesFromDirection(
      [0, 1, 0],
      sunDir
    );
    expect(betaDeg).toBeCloseTo(90, 9);
    expect(Number.isFinite(lambdaDeg)).toBe(true);
  });
});

describe("visibility calibration", () => {
  const grid = buildZodiacalUniformGrid();
  const linear = (lambdaDeg: number, betaDeg: number) =>
    sampleZodiacalGridS10(grid, lambdaDeg, betaDeg) * ZODIACAL_S10_TO_LINEAR;

  it("maps the band's log-centre onto the display window's log-centre", () => {
    expect(
      ZODIACAL_S10_TO_LINEAR *
        Math.sqrt(ZODIACAL_BRIGHT_ANCHOR_S10 * ZODIACAL_FAINT_ANCHOR_S10)
    ).toBeCloseTo(
      Math.sqrt(STAR_DISPLAY_BLACK_POINT * ZODIACAL_BLOOM_THRESHOLD),
      12
    );
  });

  it("gives both ends of the table the same margin", () => {
    const over = linear(15, 0) / ZODIACAL_BLOOM_THRESHOLD;
    const under = STAR_DISPLAY_BLACK_POINT / linear(135, 0);
    expect(over).toBeCloseTo(under, 9);
    expect(over).toBeCloseTo(3.2569, 3);
  });

  it("puts the band in the visible window at 1 AU", () => {
    // Above the black point through the body of the cone…
    expect(linear(30, 0)).toBeGreaterThan(STAR_DISPLAY_BLACK_POINT);
    expect(linear(45, 0)).toBeGreaterThan(STAR_DISPLAY_BLACK_POINT);
    // …and below the bloom gate there, so it reads as surface brightness.
    expect(linear(30, 0)).toBeLessThan(ZODIACAL_BLOOM_THRESHOLD);
    // The gegenschein is genuinely faint: below threshold, but within one
    // adaptation stop and a half of it rather than lost.
    const gegenschein = linear(180, 0) / STAR_DISPLAY_BLACK_POINT;
    expect(gegenschein).toBeLessThan(1);
    expect(gegenschein).toBeGreaterThan(0.25);
    // The ecliptic pole stays dark, as 60 S10☉ should.
    expect(linear(90, 90)).toBeLessThan(0.2 * STAR_DISPLAY_BLACK_POINT);
  });
});

describe("heliocentric distance scaling (2026-07-29 near-Sun whiteout fix)", () => {
  // Owner report: a white "penumbra" grew around the Sun on zoom-in until
  // the whole screen washed out. Root cause: the shader's old floor
  // (`max(R_AU, 0.1)`) let pow(r, -2.5) reach ~316x at 0.1 AU, on top of
  // the already-3.26x-over-bloom-gate value the 1 AU calibration puts on
  // the brightest cell -- ~1030x the gate with no display headroom for it.
  // These pin the replacement: dims outward of 1 AU exactly as before,
  // holds flat (never brightens) inward of it.

  it("matches R^-2.5 outward of 1 AU -- untouched, calibrated behaviour", () => {
    expect(zodiacalHeliocentricFactor(1)).toBeCloseTo(1, 12);
    expect(zodiacalHeliocentricFactor(2)).toBeCloseTo(Math.pow(2, -2.5), 12);
    expect(zodiacalHeliocentricFactor(5.17)).toBeCloseTo(
      Math.pow(5.17, -2.5),
      12
    ); // Jupiter
    expect(zodiacalHeliocentricFactor(29.9)).toBeCloseTo(
      Math.pow(29.9, -2.5),
      12
    ); // Neptune
  });

  it("holds flat at the 1 AU value inward of 1 AU instead of exploding", () => {
    // The old unclamped shader floor was 0.1 AU: pow(0.1, -2.5) ~= 316x.
    // None of these should exceed the 1 AU factor of 1.0.
    expect(zodiacalHeliocentricFactor(0.1)).toBeCloseTo(1, 12);
    expect(zodiacalHeliocentricFactor(0.39)).toBeCloseTo(1, 12); // Mercury
    expect(zodiacalHeliocentricFactor(0.72)).toBeCloseTo(1, 12); // Venus
    expect(zodiacalHeliocentricFactor(0.9)).toBeCloseTo(1, 12);
    expect(zodiacalHeliocentricFactor(0)).toBeCloseTo(1, 12);
  });

  it("is continuous at R = 1 AU -- no seam between the two branches", () => {
    const justBelow = zodiacalHeliocentricFactor(1 - 1e-6);
    const justAt = zodiacalHeliocentricFactor(1);
    const justAbove = zodiacalHeliocentricFactor(1 + 1e-6);
    expect(justBelow).toBeCloseTo(1, 5);
    expect(justAt).toBe(1);
    expect(justAbove).toBeCloseTo(1, 5);
  });

  it("never lets the inner-cone peak exceed its calibrated 1 AU value, at any distance inward", () => {
    const peakAt1Au =
      ZODIACAL_BRIGHT_ANCHOR_S10 *
      ZODIACAL_S10_TO_LINEAR *
      zodiacalHeliocentricFactor(1);
    // 1 AU calibration already puts this at 3.26x the bloom gate, by
    // design (see ZODIACAL_S10_TO_LINEAR's JSDoc) -- that overshoot is
    // untouched, just no longer multipliable by approaching the Sun.
    expect(peakAt1Au / ZODIACAL_BLOOM_THRESHOLD).toBeCloseTo(3.2569, 3);
    for (const r of [0, 0.01, 0.1, 0.3, 0.39, 0.5, 0.99, 1]) {
      const peakAtR =
        ZODIACAL_BRIGHT_ANCHOR_S10 *
        ZODIACAL_S10_TO_LINEAR *
        zodiacalHeliocentricFactor(r);
      expect(peakAtR).toBeCloseTo(peakAt1Au, 12);
    }
  });

  it("still dims monotonically going outward past 1 AU", () => {
    const rs = [1, 1.5, 2, 5.17, 29.9, 148];
    for (let i = 1; i < rs.length; i++) {
      expect(zodiacalHeliocentricFactor(rs[i])).toBeLessThan(
        zodiacalHeliocentricFactor(rs[i - 1])
      );
    }
  });

  it("carries the same exponent and reference distance into the GLSL as the TS constants", () => {
    const exponentMatch = ZODIACAL_FRAGMENT_GLSL.match(
      /ZODIACAL_R_EXPONENT\s*=\s*([0-9.eE+-]+);/
    );
    expect(exponentMatch).not.toBeNull();
    expect(Number(exponentMatch![1])).toBeCloseTo(ZODIACAL_R_EXPONENT, 9);

    // The clamp itself: GLSL must bound the ratio at ZODIACAL_REFERENCE_R_AU,
    // not at some other hard-coded floor (e.g. the old 0.1).
    expect(ZODIACAL_FRAGMENT_GLSL).toContain(
      "max(u_cameraR_AU, ZODIACAL_REFERENCE_R_AU) / ZODIACAL_REFERENCE_R_AU"
    );
    expect(ZODIACAL_FRAGMENT_GLSL).not.toContain("0.1)");
    expect(ZODIACAL_REFERENCE_R_AU).toBe(1);
  });
});

describe("GLSL contract", () => {
  it("declares every custom uniform it reads", () => {
    // A ShaderMaterial's fragment prefix carries three.js built-ins only,
    // so an undeclared uniform is a link failure, not a warning. u_sunDir
    // was missing until 2026-07-29 and the layer never drew a pixel.
    for (const decl of [
      "uniform sampler2D u_zodiacalLut;",
      "uniform vec3 u_sunDir;",
      "uniform float u_cameraR_AU;",
      "uniform float u_brightnessMul;",
    ]) {
      expect(ZODIACAL_FRAGMENT_GLSL).toContain(decl);
    }
  });

  it("carries the same photometric constant as the TypeScript", () => {
    const match = ZODIACAL_FRAGMENT_GLSL.match(
      /ZODIACAL_S10_TO_LINEAR\s*=\s*([0-9.eE+-]+);/
    );
    expect(match).not.toBeNull();
    expect(Number(match![1]) / ZODIACAL_S10_TO_LINEAR).toBeCloseTo(1, 9);
  });
});
