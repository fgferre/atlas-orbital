import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { SOLAR_SYSTEM_BODIES } from "../data/celestialBodies";
import { AstroPhysics, AU_TO_3D_UNITS } from "./astrophysics";
import { resolveHeliocentricPositionAU } from "./orbital/heliocentric";
import { initializeOrbitalEngine } from "./orbital/setup";

const TEST_DATE = new Date("2000-01-01T12:00:00Z");

const getBody = (id: string) => {
  const body = SOLAR_SYSTEM_BODIES.find((candidate) => candidate.id === id);
  if (!body) {
    throw new Error(`Body "${id}" not found in test catalog.`);
  }

  return body;
};

describe("AstroPhysics.parseScientificValue", () => {
  it("parses exact catalog masses with superscript exponents", () => {
    expect(AstroPhysics.parseScientificValue("2.59 × 10²⁰ kg")).toBe(2.59e20);
  });

  it("parses approximate values with estimates", () => {
    expect(
      AstroPhysics.parseScientificValue("~3.3 × 10¹⁸ kg (estimated)")
    ).toBe(3.3e18);
    expect(
      AstroPhysics.parseScientificValue("~0.13 m/s² (estimated)")
    ).toBeCloseTo(0.13);
  });

  it("stays tolerant of mixed superscript/ASCII exponent glyphs", () => {
    // The parser must keep salvaging dirty input coming from external
    // sources, but the catalog itself is no longer allowed to contain
    // such a string — see the negative guard below and the
    // "no ASCII digit glued to a superscript exponent" invariant in
    // src/data/celestialBodies.test.ts.
    expect(
      AstroPhysics.parseScientificValue("~3.3 × 10¹8 kg (estimated)")
    ).toBe(3.3e18);
  });

  it("no longer ships a body whose mass or gravity has a broken exponent", () => {
    const brokenExponent = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺][0-9]/;

    for (const body of SOLAR_SYSTEM_BODIES) {
      expect(body.mass ?? "", `${body.id}.mass`).not.toMatch(brokenExponent);
      expect(body.gravity ?? "", `${body.id}.gravity`).not.toMatch(
        brokenExponent
      );
    }
  });

  it("returns NaN when no numeric payload exists", () => {
    expect(AstroPhysics.parseScientificValue("Not detected")).toBeNaN();
  });
});

describe("AstroPhysics telemetry guards", () => {
  it("returns NaN for orbital velocity when parent mass is invalid", () => {
    expect(
      AstroPhysics.calculateOrbitalVelocity(
        { a: 39.4, e: 0.22, i: 20.6, O: 0, w: 0, M0: 0, n: 0.004 },
        39.4,
        Number.NaN
      )
    ).toBeNaN();
  });

  it("returns NaN for escape velocity when mass is invalid", () => {
    expect(AstroPhysics.calculateEscapeVelocity(Number.NaN, 85)).toBeNaN();
  });
});

describe("AstroPhysics didactic geometry", () => {
  it("preserves monotonic size ordering for key bodies", () => {
    const orderedIds = ["sun", "jupiter", "earth", "moon", "pluto", "phobos"];
    const radii = orderedIds.map((id) =>
      AstroPhysics.resolveSemanticBodyRadius({
        body: getBody(id),
        scaleMode: "didactic",
      })
    );

    for (let index = 1; index < radii.length; index++) {
      expect(radii[index - 1]).toBeGreaterThan(radii[index]);
    }
  });

  it("keeps physically larger counterintuitive pairs ordered correctly", () => {
    const ganymedeRadius = AstroPhysics.resolveSemanticBodyRadius({
      body: getBody("ganymede"),
      scaleMode: "didactic",
    });
    const mercuryRadius = AstroPhysics.resolveSemanticBodyRadius({
      body: getBody("mercury"),
      scaleMode: "didactic",
    });

    expect(ganymedeRadius).toBeGreaterThan(mercuryRadius);
  });

  it("never collapses close didactic moons into the parent center", () => {
    const cases = [
      ["phobos", "mars"],
      ["charon", "pluto"],
      ["vanth", "orcus"],
    ] as const;

    for (const [childId, parentId] of cases) {
      const child = getBody(childId);
      const parent = getBody(parentId);
      const position = AstroPhysics.resolveDisplayLocalPosition({
        body: child,
        parentBody: parent,
        date: TEST_DATE,
        scaleMode: "didactic",
      });

      expect(position.length()).toBeGreaterThan(0);
    }
  });

  it("guarantees minimum didactic clearance for representative moon systems", () => {
    const cases = [
      ["moon", "earth"],
      ["deimos", "mars"],
      ["charon", "pluto"],
    ] as const;

    for (const [childId, parentId] of cases) {
      const child = getBody(childId);
      const parent = getBody(parentId);
      const position = AstroPhysics.resolveDisplayLocalPosition({
        body: child,
        parentBody: parent,
        date: TEST_DATE,
        scaleMode: "didactic",
      });
      const minimumClearance =
        AstroPhysics.resolveSemanticBodyRadius({
          body: parent,
          scaleMode: "didactic",
        }) +
        AstroPhysics.resolveSemanticBodyRadius({
          body: child,
          scaleMode: "didactic",
        }) +
        2;

      expect(position.length() + 1e-6).toBeGreaterThanOrEqual(minimumClearance);
    }
  });

  it("keeps the didactic transform stable when starting from a physical orbital position", () => {
    const cases = [
      ["earth", "sun"],
      ["moon", "earth"],
      ["io", "jupiter"],
    ] as const;

    for (const [childId, parentId] of cases) {
      const child = getBody(childId);
      const parent = getBody(parentId);
      const physicalPosition = AstroPhysics.calculatePhysicalLocalPositionAU(
        child.orbit,
        TEST_DATE
      );
      const mapped = AstroPhysics.mapPhysicalPositionToDisplay({
        body: child,
        parentBody: parent,
        positionAU: physicalPosition,
        scaleMode: "didactic",
      });
      const legacy = AstroPhysics.resolveDisplayLocalPosition({
        body: child,
        parentBody: parent,
        date: TEST_DATE,
        scaleMode: "didactic",
      });

      expect(mapped.distanceTo(legacy)).toBeLessThan(1e-9);
    }
  });

  it("keeps heliocentric didactic anchors strictly increasing", () => {
    const anchors = [
      0.39, 0.72, 1.0, 1.52, 2.77, 5.2, 9.58, 19.2, 30.05, 39.48,
    ];
    const mapped = anchors.map((distanceAU) =>
      AstroPhysics.mapDidacticHeliocentricDistance(distanceAU)
    );

    for (let index = 1; index < mapped.length; index++) {
      expect(mapped[index]).toBeGreaterThan(mapped[index - 1]);
    }
  });

  it("keeps the first heliocentric didactic transition slope-continuous enough for Mercury", () => {
    const derivative = (distanceAU: number) => {
      const h = 1e-6;
      return (
        (AstroPhysics.mapDidacticHeliocentricDistance(distanceAU + h) -
          AstroPhysics.mapDidacticHeliocentricDistance(distanceAU - h)) /
        (2 * h)
      );
    };

    const leftSlope = derivative(0.3899);
    const rightSlope = derivative(0.3901);

    expect(Math.abs(leftSlope - rightSlope)).toBeLessThan(40);
  });

  it("turns local sun positions into distance-independent parallel light references", () => {
    const localSunPosition = new THREE.Vector3(-4, 3, 12);
    const referencePoint =
      AstroPhysics.resolveParallelLightReferencePoint(localSunPosition);

    expect(referencePoint.length()).toBeCloseTo(1e6, 3);
    expect(
      referencePoint
        .clone()
        .normalize()
        .distanceTo(localSunPosition.clone().normalize())
    ).toBeLessThan(1e-9);
  });

  it("expands the didactic sun focus to include the full major planetary overview", () => {
    const sun = getBody("sun");
    const pluto = getBody("pluto");
    const eris = getBody("eris");
    const sunExtent = AstroPhysics.resolveFocusExtent({
      body: sun,
      bodies: SOLAR_SYSTEM_BODIES,
      date: TEST_DATE,
      scaleMode: "didactic",
    });
    const plutoReach =
      AstroPhysics.resolveDisplayLocalPosition({
        body: pluto,
        parentBody: sun,
        date: TEST_DATE,
        scaleMode: "didactic",
      }).length() +
      AstroPhysics.resolveSemanticBodyRadius({
        body: pluto,
        scaleMode: "didactic",
      });

    expect(sunExtent + 1e-6).toBeGreaterThanOrEqual(plutoReach);
    const erisReach =
      AstroPhysics.resolveDisplayLocalPosition({
        body: eris,
        parentBody: sun,
        date: TEST_DATE,
        scaleMode: "didactic",
      }).length() +
      AstroPhysics.resolveSemanticBodyRadius({
        body: eris,
        scaleMode: "didactic",
      });

    expect(sunExtent).toBeLessThan(erisReach);
  });

  it("keeps didactic sun framing stable across dates by using orbital envelopes", () => {
    const sun = getBody("sun");
    const extentAtJ2000 = AstroPhysics.resolveFocusExtent({
      body: sun,
      bodies: SOLAR_SYSTEM_BODIES,
      date: new Date("2000-01-01T12:00:00Z"),
      scaleMode: "didactic",
    });
    const extentAtFutureDate = AstroPhysics.resolveFocusExtent({
      body: sun,
      bodies: SOLAR_SYSTEM_BODIES,
      date: new Date("2050-01-01T12:00:00Z"),
      scaleMode: "didactic",
    });

    expect(extentAtFutureDate).toBeCloseTo(extentAtJ2000, 8);
  });

  it("includes each focused subsystem's visible extent in didactic framing", () => {
    const cases = [
      ["earth", "moon"],
      ["mars", "deimos"],
      ["jupiter", "callisto"],
      ["pluto", "charon"],
      ["saturn", "titan"],
    ] as const;

    for (const [parentId, childId] of cases) {
      const parent = getBody(parentId);
      const child = getBody(childId);
      const extent = AstroPhysics.resolveFocusExtent({
        body: parent,
        bodies: SOLAR_SYSTEM_BODIES,
        date: TEST_DATE,
        scaleMode: "didactic",
      });
      const childReach =
        AstroPhysics.resolveDisplayLocalPosition({
          body: child,
          parentBody: parent,
          date: TEST_DATE,
          scaleMode: "didactic",
        }).length() +
        AstroPhysics.resolveSemanticBodyRadius({
          body: child,
          scaleMode: "didactic",
        });
      const ringReach = AstroPhysics.resolveRingOuterRadius(parent, "didactic");

      expect(extent + 1e-6).toBeGreaterThanOrEqual(
        Math.max(childReach, ringReach)
      );
    }
  });

  it("keeps didactic subsystem framing stable across dates by using orbital envelopes", () => {
    const earth = getBody("earth");
    const extentAtJ2000 = AstroPhysics.resolveFocusExtent({
      body: earth,
      bodies: SOLAR_SYSTEM_BODIES,
      date: new Date("2000-01-01T12:00:00Z"),
      scaleMode: "didactic",
    });
    const extentAtFutureDate = AstroPhysics.resolveFocusExtent({
      body: earth,
      bodies: SOLAR_SYSTEM_BODIES,
      date: new Date("2050-01-01T12:00:00Z"),
      scaleMode: "didactic",
    });

    expect(extentAtFutureDate).toBeCloseTo(extentAtJ2000, 8);
  });

  it("uses a tighter didactic shadow extent than camera framing for wide subsystems", () => {
    const earth = getBody("earth");
    const cameraExtent = AstroPhysics.resolveFocusExtent({
      body: earth,
      bodies: SOLAR_SYSTEM_BODIES,
      date: TEST_DATE,
      scaleMode: "didactic",
    });
    const shadowExtent = AstroPhysics.resolveShadowExtent({
      body: earth,
      bodies: SOLAR_SYSTEM_BODIES,
      date: TEST_DATE,
      scaleMode: "didactic",
    });
    const semanticRadius = AstroPhysics.resolveSemanticBodyRadius({
      body: earth,
      scaleMode: "didactic",
    });

    expect(shadowExtent).toBeGreaterThanOrEqual(semanticRadius);
    expect(shadowExtent).toBeLessThan(cameraExtent);
  });

  it("keeps realistic shadow extent anchored to the body itself", () => {
    const earth = getBody("earth");
    const shadowExtent = AstroPhysics.resolveShadowExtent({
      body: earth,
      bodies: SOLAR_SYSTEM_BODIES,
      date: TEST_DATE,
      scaleMode: "realistic",
    });
    const semanticRadius = AstroPhysics.resolveSemanticBodyRadius({
      body: earth,
      scaleMode: "realistic",
    });

    expect(shadowExtent).toBeCloseTo(semanticRadius, 8);
    expect(shadowExtent).toBeLessThan(0.1);
  });

  it("auToWorld(realistic) is the linear au × AU_TO_3D_UNITS transform", () => {
    expect(AstroPhysics.auToWorld(1, "realistic")).toBe(AU_TO_3D_UNITS);
    expect(AstroPhysics.auToWorld(1, "realistic")).toBe(1000);
    expect(AstroPhysics.auToWorld(5.2, "realistic")).toBe(5200);
    expect(AstroPhysics.auToWorld(0, "realistic")).toBe(0);
  });

  it("auToWorld(didactic) equals the heliocentric compression curve", () => {
    // Factored from mapDidacticHeliocentricDistance — must agree exactly.
    for (const au of [0.39, 1, 5.2, 30.05, 80, 400]) {
      expect(AstroPhysics.auToWorld(au, "didactic")).toBe(
        AstroPhysics.mapDidacticHeliocentricDistance(au)
      );
    }
    // Anchor spot-checks: 1 AU → 440, 80 AU → 2350 (anchor table).
    expect(AstroPhysics.auToWorld(1, "didactic")).toBeCloseTo(440, 6);
    expect(AstroPhysics.auToWorld(80, "didactic")).toBeCloseTo(2350, 6);
  });

  it("auToWorld(didactic) saturates at the 3200 world cap", () => {
    // Past ≈323 AU the curve is flat at the cap.
    expect(AstroPhysics.auToWorld(400, "didactic")).toBe(3200);
    expect(AstroPhysics.auToWorld(60000, "didactic")).toBe(3200);
  });

  it("worldToAu(realistic) inverts auToWorld linearly", () => {
    expect(AstroPhysics.worldToAu(1000, "realistic")).toBe(1);
    for (const au of [0.1, 1, 9.58, 40, 1000]) {
      const world = AstroPhysics.auToWorld(au, "realistic");
      expect(AstroPhysics.worldToAu(world, "realistic")).toBeCloseTo(au, 9);
    }
  });

  it("round-trips worldToAu(auToWorld(x)) ≈ x across the anchor regime (didactic)", () => {
    // Below the cap the didactic compression is strictly monotonic, so
    // the binary-search inverse is exact (to ~machine precision).
    for (const au of [0.05, 0.39, 1, 1.52, 5.2, 19.2, 39.48, 80, 100, 300]) {
      const world = AstroPhysics.auToWorld(au, "didactic");
      expect(AstroPhysics.worldToAu(world, "didactic")).toBeCloseTo(au, 4);
    }
  });

  it("round-trips both modes at the cap boundary without NaN / runaway (didactic saturated regime)", () => {
    // AT the cap: worldToAu returns the fixed saturation AU (finite).
    const atCap = AstroPhysics.worldToAu(3200, "didactic");
    expect(Number.isFinite(atCap)).toBe(true);
    expect(atCap).toBeGreaterThan(300);
    expect(atCap).toBeLessThan(400);

    // PAST the cap: still finite + bounded (the decade freezes rather
    // than advancing into a runaway value or NaN).
    for (const world of [3200, 5000, 20000, 1e6]) {
      const au = AstroPhysics.worldToAu(world, "didactic");
      expect(Number.isFinite(au)).toBe(true);
      expect(au).toBe(atCap);
    }
    // And it never returns NaN for degenerate inputs.
    expect(AstroPhysics.worldToAu(0, "didactic")).toBe(0);
    expect(AstroPhysics.worldToAu(-5, "didactic")).toBe(0);
    expect(Number.isNaN(AstroPhysics.worldToAu(Number.NaN, "didactic"))).toBe(
      false
    );
  });

  it("auToWorld places planets on their AU-decade world radius identically to the body positioner (the scale-lock invariant)", () => {
    // The HARD requirement reduced to a unit invariant: the world
    // radius auToWorld(au) MUST match the radius the heliocentric body
    // positioner draws a body at that AU (mapDidacticHeliocentricDistance
    // in didactic; au×1000 in realistic). This is what the grid now
    // locks its rings to, so a planet at v AU sits on the v-AU feature.
    for (const au of [1, 5.2, 9.58, 30.05]) {
      const direction = new THREE.Vector3(1, 0, 0);
      const didacticBody = AstroPhysics.mapPhysicalPositionToDisplay({
        body: getBody("earth"),
        parentBody: getBody("sun"),
        positionAU: direction.clone().multiplyScalar(au),
        scaleMode: "didactic",
      });
      expect(didacticBody.length()).toBeCloseTo(
        AstroPhysics.auToWorld(au, "didactic"),
        6
      );

      const realisticBody = AstroPhysics.mapPhysicalPositionToDisplay({
        body: getBody("earth"),
        parentBody: getBody("sun"),
        positionAU: direction.clone().multiplyScalar(au),
        scaleMode: "realistic",
      });
      expect(realisticBody.length()).toBeCloseTo(
        AstroPhysics.auToWorld(au, "realistic"),
        6
      );
    }
  });

  it("preserves more visible hierarchy across large moon systems", () => {
    const jupiter = getBody("jupiter");
    const io = getBody("io");
    const callisto = getBody("callisto");
    const ioDistance = AstroPhysics.resolveDisplayLocalPosition({
      body: io,
      parentBody: jupiter,
      date: TEST_DATE,
      scaleMode: "didactic",
    }).length();
    const callistoDistance = AstroPhysics.resolveDisplayLocalPosition({
      body: callisto,
      parentBody: jupiter,
      date: TEST_DATE,
      scaleMode: "didactic",
    }).length();

    expect(callistoDistance / ioDistance).toBeGreaterThan(1.5);
  });
});

describe("resolveSkyGeometry", () => {
  // Ephemeris contract (AGENTS §6): the panel states where a body sits
  // relative to the Sun. Mercury's elongation is the sharpest available
  // falsification — it is bounded by the geometry of its own orbit, so a frame
  // error, a parent-centred vector or a swapped subtraction all break it.
  it("keeps Mercury inside its real elongation bound across a year", () => {
    initializeOrbitalEngine();
    let maxElongation = 0;

    for (let day = 0; day < 366; day += 1) {
      const date = new Date(Date.UTC(2025, 0, 1 + day));
      const geometry = AstroPhysics.resolveSkyGeometry(
        resolveHeliocentricPositionAU("mercury", date),
        resolveHeliocentricPositionAU("earth", date)
      );
      if (geometry) {
        maxElongation = Math.max(maxElongation, geometry.elongationDeg);
      }
    }

    // Mercury's greatest elongation ranges 18°–28° depending on where in its
    // eccentric orbit the alignment falls. Anything past 30° is not Mercury.
    expect(maxElongation).toBeGreaterThan(17);
    expect(maxElongation).toBeLessThan(30);
  });

  it("reports Venus half-lit at greatest elongation", () => {
    initializeOrbitalEngine();
    // The dichotomy: an inner planet shows 50% of its disc exactly when the
    // Sun-Venus-Earth angle is 90°, which is greatest elongation. This pins the
    // phase angle to the right vertex — computing it at Earth instead of at the
    // body gives a different, wrong number here.
    let best = { elongation: 0, lit: 0 };
    for (let day = 0; day < 584; day += 1) {
      const date = new Date(Date.UTC(2025, 0, 1 + day));
      const geometry = AstroPhysics.resolveSkyGeometry(
        resolveHeliocentricPositionAU("venus", date),
        resolveHeliocentricPositionAU("earth", date)
      );
      if (geometry && geometry.elongationDeg > best.elongation) {
        best = {
          elongation: geometry.elongationDeg,
          lit: geometry.illuminatedFraction,
        };
      }
    }

    expect(best.elongation).toBeGreaterThan(44);
    expect(best.elongation).toBeLessThan(48);
    expect(best.lit).toBeGreaterThan(0.45);
    expect(best.lit).toBeLessThan(0.55);
  });
});
