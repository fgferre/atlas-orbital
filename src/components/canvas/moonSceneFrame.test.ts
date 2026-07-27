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

import { satelliteUsesParentEquatorialFrame } from "./moonSceneFrame";
import {
  computeBodyPoleQuaternion,
  resolveBodyIauOrientation,
} from "../../lib/bodyOrientation";
import { dateToTDB } from "../../lib/orbital/time";
import { BODIES_BY_ID } from "../../data/celestialBodies";
import type { CelestialBody } from "../../lib/astrophysics";
import {
  initializeOrbitalEngine,
  orbitalEngine,
  resolveOrbitalDisplayPosition,
} from "../../lib/orbital";
import { ecliptic2ThreeJs } from "../../lib/orbital/analytical/coordUtils";

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
    container.quaternion.copy(
      computeBodyPoleQuaternion(parent, dateToTDB(date))
    );
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
    //
    // W6 stage B emptied most of this list: Charon and Triton were given
    // Horizons-derived ecliptic elements and left the equatorial mount. What
    // remains is the two TNO moons, which have no measured orbit to derive
    // from — the gap here is now genuinely a gap rather than a backlog item.
    for (const id of ["vanth", "weywot"]) {
      expect(satelliteUsesParentEquatorialFrame(id), id).toBe(true);
    }
    for (const id of ["charon", "triton"]) {
      expect(satelliteUsesParentEquatorialFrame(id), id).toBe(false);
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

describe("Charon and Triton after W6 stage B", () => {
  it("charon: measured elements replaced the pole rotation, and the orbit still lies on Pluto's equator", () => {
    // The previous version of this test asserted the *gap*: Pluto had no
    // rotation solution, Charon's legacy elements were `i: 0, O: 0, w: 0,
    // M0: 0` — an equatorial-frame orbit with a fabricated phase — and the
    // parent's `axialTilt` quaternion was what tilted it into place.
    //
    // Both halves are now real. Pluto carries its IAU pole and Charon carries
    // Horizons-derived ECLIPTIC elements, so it mounts unrotated like every
    // other analytical moon. The physics that the old mount faked is now a
    // *prediction* that can fail: Charon's measured orbit normal must still
    // land on Pluto's measured spin axis, from two independently sourced sets
    // of numbers that never touch each other.
    const pluto = getBody("pluto");
    expect(resolveBodyIauOrientation(pluto)).not.toBeNull();
    expect(satelliteUsesParentEquatorialFrame("charon")).toBe(false);

    const spinAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(
      computeBodyPoleQuaternion(pluto, dateToTDB(EPOCH))
    );
    const normal = sceneOrbitNormal("charon", EPOCH);
    // 1° is the tidal-alignment budget, not a fitted bound: a mutually locked
    // pair's orbit and primary spin are coplanar to well under that, while the
    // failure this guards — a mistranscribed pole or a bad element block —
    // moves the two apart by tens of degrees.
    expect(angleDeg(normal, spinAxis)).toBeLessThan(1);

    // And the mount no longer rotates it: the scene offset IS the engine
    // vector, which is what leaving `equatorialChildren` means.
    expect(
      angleDeg(sceneOffset("charon", EPOCH), engineOffset("charon", EPOCH))
    ).toBeLessThan(1e-4);
  });

  it("charon and triton keep their orbit plane outside the validity window", () => {
    // The analytical mount discriminator is registry-driven and **date-blind**,
    // but the ENGINE is not: outside `plutoSat` / `neptunian` (2020-2030) it
    // drops to the Kepler fallback and reads `body.orbit`. Those fields used to
    // hold parent-EQUATORIAL elements that only made sense under a rotation the
    // mount no longer applies, so scrubbing across the window edge swung
    // Charon's orbit **67.2°** off Pluto's equator — breaking the mutual lock
    // this wave exists to demonstrate, at a date no fixture covers.
    //
    // They now hold the same fixture-derived ecliptic elements re-referenced to
    // J2000, so the fallback is geometrically identical to the analytical path
    // and only its (uncharacterised) accuracy degrades. This asserts the plane,
    // which is the part that was wrong; `isFallback` still flips, by design.
    const IN_WINDOW = new Date("2025-01-01T00:00:00Z");
    const OUT_OF_WINDOW = new Date("2035-01-01T00:00:00Z");

    for (const [id, parent] of [
      ["charon", "pluto"],
      ["triton", "neptune"],
    ] as const) {
      const shift = angleDeg(
        engineOrbitNormal(id, parent, IN_WINDOW),
        engineOrbitNormal(id, parent, OUT_OF_WINDOW)
      );
      expect(
        shift,
        `${id}: orbit plane moved ${shift.toFixed(2)}° crossing the validity window — the fallback elements are in a different frame from the analytical ones`
      ).toBeLessThan(0.1);
    }
  });

  it("triton: the fabricated node is gone and it now points at Horizons", () => {
    // This assertion is inverted from its previous form, exactly as its own
    // comment predicted. It used to assert a FLOOR — that Triton was more
    // than 5° off the truth in both mounted states — because `i = 156.8°` was
    // measured against Neptune's equator while `Ω` was invented, so no scene
    // graph arrangement could recover the orbit pole.
    expect(satelliteUsesParentEquatorialFrame("triton")).toBe(false);

    const truth = ecliptic2ThreeJs(
      new THREE.Vector3(
        tritonFixture.position.x,
        tritonFixture.position.y,
        tritonFixture.position.z
      )
    );
    const scene = sceneOffset("triton", EPOCH);
    expect(angleDeg(scene, truth)).toBeLessThan(MAX_TRUTH_AT_EPOCH_DEG);
  });
});

/**
 * Same envelope the analytical moons above are held to. Triton's measured
 * residual at epoch is 0.002°, three orders below this.
 */
const MAX_TRUTH_AT_EPOCH_DEG = 1.0;

/** Orbit normal straight from the engine, whichever provider is serving. */
function engineOrbitNormal(
  bodyId: string,
  parentId: string,
  date: Date
): THREE.Vector3 {
  const at = (d: Date) => {
    const r = orbitalEngine.calculatePosition(bodyId, d, parentId);
    return new THREE.Vector3(r.position.x, r.position.y, r.position.z);
  };
  return new THREE.Vector3()
    .crossVectors(at(date), at(new Date(date.getTime() + 3_600_000)))
    .normalize();
}
