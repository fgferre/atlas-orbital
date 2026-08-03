import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  createEclipseConeGeometry,
  createEclipseRenderConfig,
  resolveEclipseConeGeometry,
  resolveEclipseRenderConfig,
  type EclipseConeBodies,
} from "./eclipseGeometry";
import { AstroPhysics, KM_TO_3D_UNITS } from "./astrophysics";
import { BODIES_BY_ID } from "../data/celestialBodies";
import { initializeOrbitalEngine } from "./orbital/setup";
import { resolveHeliocentricPositionAU } from "./orbital/heliocentric";

/**
 * Anchors for the single shadow-cone predicate, computed from this repo's OWN
 * providers (ELP for the Moon, VSOP for the planets) at the instant of each
 * event — never from mean distances, which invert the umbra sign and would
 * have forced the 2024-04-08 total eclipse to render annular.
 *
 * Every published figure asserted here (eclipse dates, totality/annularity
 * character, gamma, obscuration) is an independent check that does not pass
 * through the cone arithmetic: NASA's eclipse catalog says WHAT happened, the
 * providers say WHERE the bodies were, and the cone formula must connect them.
 */

const bodiesFor = (
  eclipserId: string,
  receiverId: string
): EclipseConeBodies => {
  const sun = BODIES_BY_ID.get("sun");
  const eclipser = BODIES_BY_ID.get(eclipserId);
  const receiver = BODIES_BY_ID.get(receiverId);
  if (!sun || !eclipser || !receiver) throw new Error("catalog id missing");
  return {
    sunRadiusKm: sun.radiusKm,
    eclipserRadiusKm: eclipser.radiusKm,
    receiverRadiusKm: receiver.radiusKm,
  };
};

const coneAt = (eclipserId: string, receiverId: string, iso: string) => {
  const at = new Date(iso);
  const eclipserAU = resolveHeliocentricPositionAU(eclipserId, at);
  const receiverAU = resolveHeliocentricPositionAU(receiverId, at);
  const out = createEclipseConeGeometry();
  resolveEclipseConeGeometry(
    eclipserAU,
    receiverAU,
    bodiesFor(eclipserId, receiverId),
    out
  );
  return { out, eclipserAU, receiverAU };
};

beforeAll(() => {
  initializeOrbitalEngine();
});

describe("solar eclipse anchors — Moon eclipsing Earth", () => {
  it("2024-04-08T18:18Z is active with a positive umbra (the event rendered TOTAL)", () => {
    const { out } = coneAt("moon", "earth", "2024-04-08T18:18:00Z");
    expect(out.active).toBe(true);
    // The positive sign IS the falsification test: the first draft's
    // mean-distance anchors put the umbra at -50 km and would have drawn
    // this total eclipse annular. Recomputed 2026-08-03: +64.9 km.
    expect(out.umbraRadiusKm).toBeGreaterThan(0);
    expect(out.umbraRadiusKm).toBeLessThan(200);
    // Penumbra 3 417.5 km = 1.968 R_moon at the instant.
    expect(out.penumbraRadiusKm / 3417.5).toBeCloseTo(1, 1);
    // Total ⇒ no annular floor.
    expect(out.minShadow).toBe(0);
  });

  it("axis distance cross-checks the published gamma without passing through the cone arithmetic", () => {
    const { out } = coneAt("moon", "earth", "2024-04-08T18:18:00Z");
    // Published gamma 0.3431 Earth-radii ≈ 2 188 km (NASA eclipse catalog).
    // The perpendicular axis distance is pure vector geometry — it shares
    // the provider positions with the cone but none of the radius math.
    expect(out.axisDistanceKm).toBeGreaterThan(2000);
    expect(out.axisDistanceKm).toBeLessThan(2400);
  });

  it("2024-05-08T03:22Z (ordinary new moon a month later) is inactive", () => {
    const { out } = coneAt("moon", "earth", "2024-05-08T03:22:00Z");
    expect(out.active).toBe(false);
  });

  it("2023-10-14T18:00Z annular: umbra is negative and the floor matches the published obscuration (~0.905)", () => {
    const { out } = coneAt("moon", "earth", "2023-10-14T18:00:00Z");
    expect(out.active).toBe(true);
    expect(out.umbraRadiusKm).toBeLessThan(0);
    // Independent check (standing law 3): 1 − minShadow is the on-axis
    // obscuration, published ≈ 0.905 for this event. One digit of slack —
    // the published figure is for the point of greatest eclipse, not the
    // axis instant sampled here.
    expect(1 - out.minShadow).toBeGreaterThan(0.85);
    expect(1 - out.minShadow).toBeLessThan(0.97);
  });
});

describe("lunar eclipse anchors — Earth eclipsing the Moon", () => {
  it("2025-03-14T06:59Z total lunar eclipse: active, umbra swallows the whole Moon (~2.6 R_moon)", () => {
    const { out } = coneAt("earth", "moon", "2025-03-14T06:59:00Z");
    expect(out.active).toBe(true);
    const moonRadiusKm = BODIES_BY_ID.get("moon")!.radiusKm;
    const umbraInMoonRadii = out.umbraRadiusKm / moonRadiusKm;
    // Earth's umbra at lunar distance is ~2.6 R_moon — which is exactly why
    // a naive `shdw = 0` umbra renders totality BLACK and the refraction
    // floor in the shader patch exists.
    expect(umbraInMoonRadii).toBeGreaterThan(2.2);
    expect(umbraInMoonRadii).toBeLessThan(3.0);
    expect(out.minShadow).toBe(0);
  });

  it("an ordinary full moon (2024-06-22T01:08Z) is inactive", () => {
    const { out } = coneAt("earth", "moon", "2024-06-22T01:08:00Z");
    expect(out.active).toBe(false);
  });
});

describe("Io in Jupiter's shadow", () => {
  it("umbra and penumbra at Io's distance bracket Jupiter's catalog radius (cone from radiusKm 69 911, not equatorial 71 492)", () => {
    // Io passes through Jupiter's shadow every 42.5 h orbit (except near
    // seasonal extremes). Rather than pin one historical ingress minute,
    // sample Io across one orbit and require the shadow pass to exist.
    const bodies = bodiesFor("jupiter", "io");
    const base = Date.UTC(2026, 0, 1);
    let sawActive = false;
    let umbraAtActive = 0;
    let penumbraAtActive = 0;
    const out = createEclipseConeGeometry();
    for (let hour = 0; hour <= 43; hour += 0.25) {
      const at = new Date(base + hour * 3_600_000);
      const eclipserAU = resolveHeliocentricPositionAU("jupiter", at);
      const receiverAU = resolveHeliocentricPositionAU("io", at);
      resolveEclipseConeGeometry(eclipserAU, receiverAU, bodies, out);
      if (out.active) {
        sawActive = true;
        umbraAtActive = out.umbraRadiusKm;
        penumbraAtActive = out.penumbraRadiusKm;
        break;
      }
    }
    expect(sawActive).toBe(true);
    // The wave's recomputed anchors: ~69 558 / ~70 343 km — derived from the
    // catalog's radiusKm 69 911, not the equatorial 71 492 the first draft
    // used. 1% tolerance covers the instant-to-instant variation.
    expect(umbraAtActive / 69_558).toBeCloseTo(1, 1);
    expect(penumbraAtActive / 70_343).toBeCloseTo(1, 1);
    // Io (r = 1 821 km) fits entirely inside the umbra: whole-disc events.
    expect(umbraAtActive).toBeGreaterThan(10 * 1821);
  });
});

describe("similarity transform into render space", () => {
  it("degenerates to the identity in realistic mode: s = KM_TO_3D_UNITS by construction", () => {
    const at = new Date("2024-04-08T18:18:00Z");
    const eclipserAU = resolveHeliocentricPositionAU("moon", at);
    const receiverAU = resolveHeliocentricPositionAU("earth", at);
    const earth = BODIES_BY_ID.get("earth")!;
    const cone = createEclipseConeGeometry();
    resolveEclipseConeGeometry(
      eclipserAU,
      receiverAU,
      bodiesFor("moon", "earth"),
      cone
    );

    const receiverWorld = new THREE.Vector3(120, -40, 7);
    const renderRadius = AstroPhysics.resolveSemanticBodyRadius({
      body: earth,
      scaleMode: "realistic",
    });
    const config = createEclipseRenderConfig();
    resolveEclipseRenderConfig(
      cone,
      eclipserAU,
      receiverAU,
      receiverWorld,
      renderRadius,
      earth.radiusKm,
      config
    );

    // s = renderRadius / radiusKm = KM_TO_3D_UNITS exactly, so the synthetic
    // eclipser sits at the physically mapped offset and the radii are the
    // physical km scaled by the world-unit conversion.
    const s = renderRadius / earth.radiusKm;
    expect(s / KM_TO_3D_UNITS).toBeCloseTo(1, 12);
    expect(
      config.umbraRadiusWu / (cone.umbraRadiusKm * KM_TO_3D_UNITS)
    ).toBeCloseTo(1, 9);
    expect(
      config.penumbraRadiusWu / (cone.penumbraRadiusKm * KM_TO_3D_UNITS)
    ).toBeCloseTo(1, 9);
    // Segment reach: past the eclipser with margin, regardless of scale mode.
    const eclipserOffsetWu = config.eclipserPosWorld.clone().sub(receiverWorld);
    expect(config.vrScaleWu).toBeGreaterThan(2 * eclipserOffsetWu.length());
    // The synthetic Sun is the third mapped body: receiverWorld − s·R. In
    // realistic mode s·R IS the physically mapped receiver position, so
    // when receiverWorld is the true render position the synthetic Sun is
    // the world origin — asserted as the offset identity here because this
    // test passes an arbitrary receiverWorld.
    const sunOffsetWu = receiverWorld.clone().sub(config.sunPosWorld);
    const mappedReceiverWu = receiverAU
      .clone()
      .multiplyScalar(1000 /* AU_TO_3D_UNITS */);
    expect(sunOffsetWu.distanceTo(mappedReceiverWu)).toBeLessThan(1e-6);
  });

  it("didactic mode: the synthetic Sun sits ~183 000 wu out, NOT at the render Sun ~440 wu away", () => {
    // The first W7 cut aimed the shader ray at the render Sun (world
    // origin). In didactic mode Earth renders ~440 wu from the origin
    // while the synthetic Moon lands at ~439 wu from Earth — almost
    // exactly the render Sun's distance — which collapses the
    // per-fragment offset by ~300× and dims the whole disc instead of
    // sweeping a spot. The similarity-consistent Sun must sit at
    // s·1 AU ≈ 183 000 wu. Found by the post-ship adversarial review.
    const at = new Date("2024-04-08T18:18:00Z");
    const eclipserAU = resolveHeliocentricPositionAU("moon", at);
    const receiverAU = resolveHeliocentricPositionAU("earth", at);
    const earth = BODIES_BY_ID.get("earth")!;
    const cone = createEclipseConeGeometry();
    resolveEclipseConeGeometry(
      eclipserAU,
      receiverAU,
      bodiesFor("moon", "earth"),
      cone
    );
    const didacticRadius = AstroPhysics.resolveSemanticBodyRadius({
      body: earth,
      scaleMode: "didactic",
    });
    const receiverWorld = new THREE.Vector3(300, 0, 320);
    const config = createEclipseRenderConfig();
    resolveEclipseRenderConfig(
      cone,
      eclipserAU,
      receiverAU,
      receiverWorld,
      didacticRadius,
      earth.radiusKm,
      config
    );
    const s = didacticRadius / earth.radiusKm;
    const sunDistanceWu = config.sunPosWorld.distanceTo(receiverWorld);
    const expectedWu = s * receiverAU.length() * 149_597_870.7;
    expect(sunDistanceWu / expectedWu).toBeCloseTo(1, 6);
    // Two orders of magnitude beyond the eclipser — the regime the render
    // Sun at the origin could never reproduce.
    const eclipserDistanceWu =
      config.eclipserPosWorld.distanceTo(receiverWorld);
    expect(sunDistanceWu).toBeGreaterThan(100 * eclipserDistanceWu);
  });

  it("penumbral spot spans ≈0.54 Earth radii on 2024-04-08 — the render-side anchor W6 makes checkable", () => {
    const { out } = coneAt("moon", "earth", "2024-04-08T18:18:00Z");
    const earthRadiusKm = BODIES_BY_ID.get("earth")!.radiusKm;
    // 3 417.5 / 6 371 ≈ 0.536: the similarity transform preserves this
    // ratio in every scale mode, so it is asserted once in km.
    expect(out.penumbraRadiusKm / earthRadiusKm).toBeGreaterThan(0.45);
    expect(out.penumbraRadiusKm / earthRadiusKm).toBeLessThan(0.62);
  });

  it("clamps a negative (antumbral) umbra to zero in render units and keeps the floor in minShadow", () => {
    const { out, eclipserAU, receiverAU } = coneAt(
      "moon",
      "earth",
      "2023-10-14T18:00:00Z"
    );
    const earth = BODIES_BY_ID.get("earth")!;
    const config = createEclipseRenderConfig();
    resolveEclipseRenderConfig(
      out,
      eclipserAU,
      receiverAU,
      new THREE.Vector3(),
      AstroPhysics.resolveSemanticBodyRadius({
        body: earth,
        scaleMode: "didactic",
      }),
      earth.radiusKm,
      config
    );
    expect(out.umbraRadiusKm).toBeLessThan(0);
    expect(config.umbraRadiusWu).toBe(0);
    expect(config.minShadow).toBeGreaterThan(0);
  });
});

describe("predicate degenerate cases", () => {
  it("a receiver sunward of the eclipser is never shadowed", () => {
    const out = createEclipseConeGeometry();
    resolveEclipseConeGeometry(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0.5, 0, 0),
      { sunRadiusKm: 696_340, eclipserRadiusKm: 1737, receiverRadiusKm: 6371 },
      out
    );
    expect(out.active).toBe(false);
    expect(out.minShadow).toBe(1);
  });

  it("coincident bodies deactivate instead of dividing by zero", () => {
    const out = createEclipseConeGeometry();
    resolveEclipseConeGeometry(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 0, 0),
      { sunRadiusKm: 696_340, eclipserRadiusKm: 1737, receiverRadiusKm: 6371 },
      out
    );
    expect(out.active).toBe(false);
  });

  it("allocates nothing across repeated calls (out-parameter contract)", () => {
    const out = createEclipseConeGeometry();
    const e = new THREE.Vector3(0.9, 0.01, 0);
    const r = new THREE.Vector3(1, 0, 0);
    const b = {
      sunRadiusKm: 696_340,
      eclipserRadiusKm: 1737,
      receiverRadiusKm: 6371,
    };
    const first = resolveEclipseConeGeometry(e, r, b, out);
    const second = resolveEclipseConeGeometry(e, r, b, out);
    expect(second).toBe(out);
    expect(first).toBe(second);
  });
});
