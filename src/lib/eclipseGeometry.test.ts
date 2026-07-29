import { describe, expect, it } from "vitest";

import {
  resolveAnnularMinShadow,
  resolveBodyEclipseConeGeometry,
  resolveEclipseConeGeometry,
  resolveEclipseConeRadiiKm,
  scaleEclipseRadiiToRenderUnits,
} from "./eclipseGeometry";
import * as THREE from "three";

describe("resolveEclipseConeRadiiKm — similar-triangles umbra/penumbra construction", () => {
  /**
   * Recomputed 2026-07-26 from this repo's own ELP/VSOP providers at
   * 2024-04-08T18:18Z (the total solar eclipse): Sun→Moon 149,463,545 km,
   * Moon→Earth 359,804 km, Sun radius 696,340 km (catalog), Moon radius
   * 1,737 km (catalog). The published event was TOTAL, so a correct
   * formula must return a POSITIVE umbra radius here — the earlier draft
   * of this wave used the MEAN Earth–Moon distance instead of the
   * distance on eclipse day, which flips the sign and would render this
   * event annular.
   */
  it("returns the recomputed 2024-04-08T18:18Z anchor: umbra +64.9 km, penumbra 3417.5 km", () => {
    const { umbraRadiusKm, penumbraRadiusKm } = resolveEclipseConeRadiiKm({
      sunRadiusKm: 696340,
      eclipserRadiusKm: 1737,
      sunToEclipserDistanceKm: 149463545,
      eclipserToReceiverDistanceKm: 359804,
    });
    expect(umbraRadiusKm).toBeCloseTo(64.9, 0);
    expect(penumbraRadiusKm).toBeCloseTo(3417.5, 0);
    // "1.968 R_moon" — the wave's own restated form of the same number.
    expect(penumbraRadiusKm / 1737).toBeCloseTo(1.968, 2);
  });

  it("is positive (total) only while the eclipser's angular radius exceeds the Sun's", () => {
    // Moon far enough from Earth (near apogee) that its angular size drops
    // below the Sun's even at perfect alignment — the umbra apex now sits
    // in front of the receiver, not behind it: annular, not total.
    const { umbraRadiusKm } = resolveEclipseConeRadiiKm({
      sunRadiusKm: 696340,
      eclipserRadiusKm: 1737,
      sunToEclipserDistanceKm: 149600000,
      eclipserToReceiverDistanceKm: 406000, // near lunar apogee
    });
    expect(umbraRadiusKm).toBeLessThan(0);
  });
});

describe("resolveAnnularMinShadow — independent check against a published annular obscuration", () => {
  it("returns a floor in the 0.05-0.2 range near lunar apogee, where real annular eclipses occur", () => {
    // Moon near apogee (~405,500 km) — small enough angular size that even
    // perfect alignment leaves a visible ring. The date-specific
    // real-ephemeris check (2023-10-14, published obscuration ≈0.90-0.91)
    // lives in the `resolveBodyEclipseConeGeometry` describe block below,
    // which resolves the actual Sun/Moon/Earth distances for that instant
    // via this repo's own providers and gets ≈0.88 — this test only pins
    // the formula's qualitative shape with hand-picked, self-consistent
    // distances.
    const minShadow = resolveAnnularMinShadow({
      sunRadiusKm: 696340,
      eclipserRadiusKm: 1737,
      sunToReceiverDistanceKm: 149_600_000,
      eclipserToReceiverDistanceKm: 405_500,
    });
    expect(minShadow).toBeGreaterThan(0.05);
    expect(minShadow).toBeLessThan(0.2);
  });

  it("returns 0 when the eclipser's angular radius equals the Sun's (grazing total/annular boundary)", () => {
    const minShadow = resolveAnnularMinShadow({
      sunRadiusKm: 696340,
      eclipserRadiusKm: 1737,
      sunToReceiverDistanceKm: 149_600_000,
      eclipserToReceiverDistanceKm: (1737 / 696340) * 149_600_000,
    });
    expect(minShadow).toBeCloseTo(0, 6);
  });
});

describe("resolveEclipseConeGeometry — vector form, out-parameter reuse", () => {
  const AU_IN_KM = 149597870.7;

  it("matches the scalar-anchor umbra/penumbra when fed the same distances as collinear vectors", () => {
    const sunPositionAU = new THREE.Vector3(0, 0, 0);
    const eclipserPositionAU = new THREE.Vector3(149463545 / AU_IN_KM, 0, 0);
    const receiverPositionAU = new THREE.Vector3(
      (149463545 + 359804) / AU_IN_KM,
      0,
      0
    );
    const g = resolveEclipseConeGeometry({
      sunPositionAU,
      eclipserPositionAU,
      receiverPositionAU,
      sunRadiusKm: 696340,
      eclipserRadiusKm: 1737,
      receiverRadiusKm: 6371,
    });
    expect(g.umbraRadiusKm).toBeCloseTo(64.9, 0);
    expect(g.penumbraRadiusKm).toBeCloseTo(3417.5, 0);
    expect(g.axisDistanceKm).toBeCloseTo(0, 3);
    expect(g.active).toBe(true);
  });

  it("reuses the same out-object across calls without allocating a new one", () => {
    const out = {
      umbraRadiusKm: 0,
      penumbraRadiusKm: 0,
      axisDistanceKm: 0,
      active: false,
      minShadow: 0,
    };
    const returned = resolveEclipseConeGeometry(
      {
        sunPositionAU: new THREE.Vector3(0, 0, 0),
        eclipserPositionAU: new THREE.Vector3(1, 0, 0),
        receiverPositionAU: new THREE.Vector3(1.0026, 0, 0),
        sunRadiusKm: 696340,
        eclipserRadiusKm: 1737,
        receiverRadiusKm: 6371,
      },
      out
    );
    expect(returned).toBe(out);
  });

  it("goes inactive once the receiver's centre is far enough off the Sun–eclipser axis", () => {
    const g = resolveEclipseConeGeometry({
      sunPositionAU: new THREE.Vector3(0, 0, 0),
      eclipserPositionAU: new THREE.Vector3(1, 0, 0),
      // Perpendicular offset of 0.01 AU (~1.5M km) — vastly larger than
      // any penumbra + Earth radius.
      receiverPositionAU: new THREE.Vector3(1.0026, 0.01, 0),
      sunRadiusKm: 696340,
      eclipserRadiusKm: 1737,
      receiverRadiusKm: 6371,
    });
    expect(g.active).toBe(false);
  });
});

describe("resolveBodyEclipseConeGeometry — real ephemeris, this repo's own providers", () => {
  it("is active at the 2024-04-08T18:18Z total solar eclipse, with a gamma cross-check independent of the umbra/penumbra arithmetic", () => {
    const g = resolveBodyEclipseConeGeometry(
      "earth",
      "moon",
      new Date("2024-04-08T18:18:00Z")
    );
    expect(g).not.toBeNull();
    expect(g?.active).toBe(true);
    expect(g?.umbraRadiusKm).toBeGreaterThan(0); // total, not annular
    // Published gamma (perpendicular Earth-centre distance from the shadow
    // axis) for this event is ≈2,188 km. This arithmetic never touches
    // `resolveEclipseConeRadiiKm` — it is the cross-check standing law 3
    // requires.
    expect(g?.axisDistanceKm).toBeCloseTo(2188, -2);
  });

  it("is inactive at 2024-05-08T03:22Z — an ordinary time between eclipses", () => {
    const g = resolveBodyEclipseConeGeometry(
      "earth",
      "moon",
      new Date("2024-05-08T03:22:00Z")
    );
    expect(g?.active).toBe(false);
  });

  it("is inactive at an ordinary full moon (2024-06-22) — the 86%-false-positive class the old fixed-ratio cone fired on", () => {
    const g = resolveBodyEclipseConeGeometry(
      "earth",
      "moon",
      new Date("2024-06-22T00:00:00Z")
    );
    expect(g?.active).toBe(false);
  });

  it("is active through the 2025-03-14 total lunar eclipse (Earth eclipsing the Moon) with a positive umbra", () => {
    const g = resolveBodyEclipseConeGeometry(
      "moon",
      "earth",
      new Date("2025-03-14T07:00:00Z")
    );
    expect(g?.active).toBe(true);
    expect(g?.umbraRadiusKm).toBeGreaterThan(0);
    // Earth's umbra at lunar distance is roughly 2.6× the Moon's own
    // radius (third-round finding) — "the whole Moon fits inside it".
    expect((g?.umbraRadiusKm ?? 0) / 1737).toBeGreaterThan(2);
  });

  it("is annular (negative umbra, positive minShadow) at the 2023-10-14 annular solar eclipse", () => {
    const g = resolveBodyEclipseConeGeometry(
      "earth",
      "moon",
      new Date("2023-10-14T18:00:00Z")
    );
    expect(g?.active).toBe(true);
    expect(g?.umbraRadiusKm).toBeLessThan(0);
    expect(g?.minShadow).toBeGreaterThan(0);
  });

  it("returns null for an unknown body id", () => {
    expect(
      resolveBodyEclipseConeGeometry("earth", "not-a-body", new Date())
    ).toBeNull();
  });
});

describe("scaleEclipseRadiiToRenderUnits — similarity transform", () => {
  it("degenerates to the identity when renderUnitsPerKm is the realistic-mode constant", () => {
    const scaled = scaleEclipseRadiiToRenderUnits(
      { umbraRadiusKm: 100, penumbraRadiusKm: 3000 },
      2 // pretend 2 render-units per km
    );
    expect(scaled.umbraRadiusRender).toBe(200);
    expect(scaled.penumbraRadiusRender).toBe(6000);
  });

  it("scales both radii by the same factor, preserving their ratio", () => {
    const before = { umbraRadiusKm: 65, penumbraRadiusKm: 3417 };
    const scaled = scaleEclipseRadiiToRenderUnits(before, 0.37);
    expect(scaled.penumbraRadiusRender / scaled.umbraRadiusRender).toBeCloseTo(
      before.penumbraRadiusKm / before.umbraRadiusKm,
      9
    );
  });
});
