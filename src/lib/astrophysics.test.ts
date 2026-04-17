import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { SOLAR_SYSTEM_BODIES } from "../data/celestialBodies";
import { AstroPhysics } from "./astrophysics";

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

  it("parses approximate values with estimates and mixed exponent glyphs", () => {
    expect(
      AstroPhysics.parseScientificValue("~3.3 × 10¹8 kg (estimated)")
    ).toBe(3.3e18);
    expect(
      AstroPhysics.parseScientificValue("~0.13 m/s² (estimated)")
    ).toBeCloseTo(0.13);
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
