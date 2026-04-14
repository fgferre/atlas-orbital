import { describe, expect, it } from "vitest";

import {
  ECLIPTIC_GRID_TICKS_AU,
  ECLIPTIC_GRID_LINEAR_UNITS_PER_AU,
  resolveEclipticGridTickDefinitions,
  resolveEclipticGridWorldDistance,
} from "./eclipticGridHelpers";

describe("EclipticGrid helpers", () => {
  it("keeps the realistic mapping linear in AU", () => {
    for (const au of ECLIPTIC_GRID_TICKS_AU) {
      expect(resolveEclipticGridWorldDistance(au, "realistic")).toBe(
        au * ECLIPTIC_GRID_LINEAR_UNITS_PER_AU
      );
    }
  });

  it("maps didactic ticks through a non-linear curve", () => {
    const didactic = resolveEclipticGridTickDefinitions("didactic");
    const distances = didactic.map((tick) => tick.distance);

    expect(didactic.map((tick) => tick.au)).toEqual([1, 2, 5, 10, 20, 30, 40]);
    expect(distances[0]).toBeCloseTo(440, 5);
    expect(distances[1]).toBeGreaterThan(distances[0]);
    expect(distances[2]).toBeGreaterThan(distances[1]);
    expect(distances[3]).toBeGreaterThan(distances[2]);
    expect(distances[1] - distances[0]).not.toBeCloseTo(
      distances[2] - distances[1],
      5
    );
    expect(resolveEclipticGridWorldDistance(10, "didactic")).not.toBe(
      10 * ECLIPTIC_GRID_LINEAR_UNITS_PER_AU
    );
  });
});
