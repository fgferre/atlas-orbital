/**
 * Scene-graph frame invariant for satellites.
 *
 * The bug this locks: `Planet.tsx` used to nest EVERY child under the
 * parent's pole quaternion (with a hard-coded `body.id !== "earth"`
 * exception), while the analytical providers already return
 * ecliptic-J2000 parent-centered vectors
 * (`src/lib/orbital/analytical/satellites.ts:10-11`). Every analytical
 * moon was therefore rotated twice. 395 unit tests stayed green because
 * they all stop at the engine boundary — nothing asserted what the scene
 * graph does with the engine's vector.
 *
 * So this suite mounts the real chain with `THREE.Object3D`s, exactly as
 * `Planet.tsx` composes it:
 *
 *   parentGroup (parent display position)
 *     └─ container (pole quaternion, only when the child's source frame
 *                   is parent-equatorial)
 *          └─ moonGroup (moon display position from the engine)
 *
 * and asserts, in world space, that `worldPos(moon) − worldPos(parent)`
 * still points where the engine (and Horizons) say it should.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as THREE from "three";

import {
  computePoleOrientationQuaternion,
  satelliteUsesParentEquatorialFrame,
} from "./moonSceneFrame";
import { BODIES_BY_ID } from "../../data/celestialBodies";
import type { CelestialBody } from "../../lib/astrophysics";
import {
  initializeOrbitalEngine,
  resolveOrbitalDisplayPosition,
} from "../../lib/orbital";
import { ecliptic2ThreeJs } from "../../lib/orbital/analytical/coordUtils";
import { dateToTDB } from "../../lib/orbital/time";

import phobosFixture from "../../test/fixtures/horizons/phobos-2025-01-01.json";
import deimosFixture from "../../test/fixtures/horizons/deimos-2025-01-01.json";
import ioFixture from "../../test/fixtures/horizons/io-2025-01-01.json";
import europaFixture from "../../test/fixtures/horizons/europa-2025-01-01.json";
import ganymedeFixture from "../../test/fixtures/horizons/ganymede-2025-01-01.json";
import callistoFixture from "../../test/fixtures/horizons/callisto-2025-01-01.json";
import mimasFixture from "../../test/fixtures/horizons/mimas-2025-01-01.json";
import titanFixture from "../../test/fixtures/horizons/titan-2025-01-01.json";
import iapetusFixture from "../../test/fixtures/horizons/iapetus-2025-01-01.json";
import mirandaFixture from "../../test/fixtures/horizons/miranda-2025-01-01.json";
import titaniaFixture from "../../test/fixtures/horizons/titania-2025-01-01.json";
import oberonFixture from "../../test/fixtures/horizons/oberon-2025-01-01.json";
import tritonFixture from "../../test/fixtures/horizons/triton-2025-01-01.json";

beforeAll(() => {
  initializeOrbitalEngine();
});

interface HorizonsFixture {
  bodyId: string;
  date: string;
  referenceFrame: string;
  position: { x: number; y: number; z: number };
}

/** Fixtures are parent-centered J2000 ecliptic state vectors. */
const FIXTURES: HorizonsFixture[] = [
  phobosFixture,
  deimosFixture,
  ioFixture,
  europaFixture,
  ganymedeFixture,
  callistoFixture,
  mimasFixture,
  titanFixture,
  iapetusFixture,
  mirandaFixture,
  titaniaFixture,
  oberonFixture,
];

const EPOCH = new Date(phobosFixture.date);

function getBody(id: string): CelestialBody {
  const body = BODIES_BY_ID.get(id);
  if (!body) throw new Error(`unknown body ${id}`);
  return body;
}

function getParent(body: CelestialBody): CelestialBody | null {
  if (!body.parentId || body.parentId === "sun") return null;
  return BODIES_BY_ID.get(body.parentId) ?? null;
}

/**
 * Rebuild the `Planet.tsx` chain and return the parent→moon offset in
 * WORLD space (i.e. what the camera actually sees), in display units.
 */
function sceneOffset(moonId: string, date: Date): THREE.Vector3 {
  const moon = getBody(moonId);
  const parent = getParent(moon);
  if (!parent) throw new Error(`${moonId} has no planetary parent`);

  const parentGroup = new THREE.Group();
  parentGroup.position.copy(
    resolveOrbitalDisplayPosition({
      body: parent,
      parentBody: getParent(parent),
      date,
      scaleMode: "realistic",
    })
  );

  const container = new THREE.Group();
  if (satelliteUsesParentEquatorialFrame(moon.id)) {
    container.quaternion.copy(computePoleOrientationQuaternion(parent));
  }
  parentGroup.add(container);

  const moonGroup = new THREE.Group();
  moonGroup.position.copy(
    resolveOrbitalDisplayPosition({
      body: moon,
      parentBody: parent,
      date,
      scaleMode: "realistic",
    })
  );
  container.add(moonGroup);

  parentGroup.updateMatrixWorld(true);

  return moonGroup
    .getWorldPosition(new THREE.Vector3())
    .sub(parentGroup.getWorldPosition(new THREE.Vector3()));
}

/** Engine vector for the moon, before the scene graph touches it. */
function engineOffset(moonId: string, date: Date): THREE.Vector3 {
  const moon = getBody(moonId);
  const parent = getParent(moon);
  if (!parent) throw new Error(`${moonId} has no planetary parent`);
  return resolveOrbitalDisplayPosition({
    body: moon,
    parentBody: parent,
    date,
    scaleMode: "realistic",
  });
}

function angleDeg(a: THREE.Vector3, b: THREE.Vector3): number {
  return THREE.MathUtils.radToDeg(a.angleTo(b));
}

/** Orbit-plane normal from two nearby scene samples (r(t) × r(t+dt)). */
function sceneOrbitNormal(moonId: string, date: Date): THREE.Vector3 {
  const period = 360 / Math.abs(getBody(moonId).orbit.n || 1);
  const later = new Date(date.getTime() + (period / 40) * 86400000);
  return sceneOffset(moonId, date)
    .cross(sceneOffset(moonId, later))
    .normalize();
}

describe("satelliteUsesParentEquatorialFrame — frame comes from the source, not the id", () => {
  it("is false for every analytically-served satellite (ecliptic J2000)", () => {
    for (const id of [
      "moon",
      "phobos",
      "deimos",
      "io",
      "europa",
      "ganymede",
      "callisto",
      "mimas",
      "enceladus",
      "tethys",
      "dione",
      "rhea",
      "titan",
      "iapetus",
      "miranda",
      "ariel",
      "umbriel",
      "titania",
      "oberon",
    ]) {
      expect(satelliteUsesParentEquatorialFrame(id), id).toBe(false);
    }
  });

  it("is true for the legacy Kepler satellites whose elements declare no frame", () => {
    // Data gap, not a modelled property — see the JSDoc on the predicate.
    for (const id of ["charon", "triton", "vanth", "weywot"]) {
      expect(satelliteUsesParentEquatorialFrame(id), id).toBe(true);
    }
  });

  it("keeps the legacy rotation for an unregistered satellite (conservative default)", () => {
    expect(satelliteUsesParentEquatorialFrame("not-a-body")).toBe(true);
  });
});

describe("scene graph preserves the engine vector for ecliptic-frame moons", () => {
  // The whole point of the invariant: mounting the moon must not rotate
  // it. The residue is float32-free but still not exact — the world-space
  // difference cancels two ~10^3–10^4 unit vectors to recover a ~1 unit
  // moon offset, so ~1e-6° of catastrophic-cancellation noise is expected
  // (worst observed: Titan/Ganymede ≈ 8.5e-7°). Still five orders of
  // magnitude below the 14°–81° the double rotation produced.
  const MAX_SCENE_VS_ENGINE_DEG = 1e-4;

  for (const fixture of FIXTURES) {
    it(`${fixture.bodyId}: world offset == engine vector`, () => {
      const scene = sceneOffset(fixture.bodyId, EPOCH);
      const engine = engineOffset(fixture.bodyId, EPOCH);
      expect(angleDeg(scene, engine)).toBeLessThan(MAX_SCENE_VS_ENGINE_DEG);
      // Magnitude must survive too (a rotation-only bug would hide here).
      const relativeError =
        Math.abs(scene.length() - engine.length()) / engine.length();
      expect(relativeError).toBeLessThan(1e-9);
    });
  }
});

describe("scene graph points at the Horizons truth direction", () => {
  /**
   * Envelope = what the two-body analytical elements can honestly deliver
   * at their own reference epoch (sub-degree, per
   * `analytical/satellites.ts`). It is NOT a free parameter: with the
   * double rotation the same moons sat 14°–81° off (Deimos 24.4°,
   * Titan 14.4°, Iapetus 27.9°, Oberon 80.4°), so a 1° gate is two
   * orders of magnitude below the bug it guards.
   */
  const MAX_TRUTH_DEG = 1.0;

  it("all fixtures are parent-centered J2000 ecliptic at the same epoch", () => {
    for (const fixture of FIXTURES) {
      expect(fixture.referenceFrame, fixture.bodyId).toBe("J2000_ECLIPTIC");
      expect(dateToTDB(new Date(fixture.date)), fixture.bodyId).toBeCloseTo(
        dateToTDB(EPOCH),
        9
      );
    }
  });

  for (const fixture of FIXTURES) {
    it(`${fixture.bodyId}: within ${MAX_TRUTH_DEG}° of Horizons`, () => {
      const truth = ecliptic2ThreeJs(
        new THREE.Vector3(
          fixture.position.x,
          fixture.position.y,
          fixture.position.z
        )
      );
      const scene = sceneOffset(fixture.bodyId, EPOCH);
      expect(angleDeg(scene, truth)).toBeLessThan(MAX_TRUTH_DEG);
    });
  }
});

describe("legacy Kepler satellites — documented state after the frame fix", () => {
  it("charon: the pole rotation is what puts it on Pluto's equator", () => {
    // Pluto has no poleRA/poleDec, so the quaternion falls back to
    // axialTilt = 122.53°. Charon's legacy elements (i = 0) are only
    // meaningful in that equatorial frame: dropping the rotation would
    // flatten its orbit onto the ecliptic, a ~112.8° regression.
    const pluto = getBody("pluto");
    expect(pluto.poleRA).toBeUndefined();
    expect(satelliteUsesParentEquatorialFrame("charon")).toBe(true);

    const spinAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(
      computePoleOrientationQuaternion(pluto)
    );
    const normal = sceneOrbitNormal("charon", EPOCH);
    // Orbit normal aligned with Pluto's spin axis ⇒ equatorial orbit.
    expect(angleDeg(normal, spinAxis)).toBeLessThan(1e-6);

    // And the mounted offset is genuinely rotated away from the raw
    // engine vector — that rotation is load-bearing here, unlike for the
    // analytical moons above.
    expect(
      angleDeg(sceneOffset("charon", EPOCH), engineOffset("charon", EPOCH))
    ).toBeGreaterThan(10);
  });

  it("triton: still equatorial-framed, and still off Horizons in both states", () => {
    // KNOWN GAP: i = 156.8° in `celestialBodies.ts` is Triton's
    // inclination to NEPTUNE'S EQUATOR while Ω = 0 is fabricated, so
    // neither state reproduces the true orbit pole. Removing the rotation
    // would not fix it (129.81° is the ecliptic truth; the rotated state
    // gives 158.69°, the unrotated one 156.80°). Locked here so the next
    // person sees it is a data problem, not a scene-graph one.
    expect(satelliteUsesParentEquatorialFrame("triton")).toBe(true);

    const truth = ecliptic2ThreeJs(
      new THREE.Vector3(
        tritonFixture.position.x,
        tritonFixture.position.y,
        tritonFixture.position.z
      )
    );
    const scene = sceneOffset("triton", EPOCH);
    expect(angleDeg(scene, truth)).toBeGreaterThan(MAX_TRITON_TRUTH_FLOOR_DEG);
  });
});

/**
 * Triton's direction error at epoch is dominated by the fabricated node,
 * not by the scene graph. The floor documents the known-bad state; when
 * Triton gets real ecliptic elements this assertion is expected to be
 * inverted into an upper bound.
 */
const MAX_TRITON_TRUTH_FLOOR_DEG = 5;
