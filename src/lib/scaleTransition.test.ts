import { afterEach, describe, expect, it } from "vitest";

import { AstroPhysics } from "./astrophysics";

const NEPTUNE_AU = 30.05;

afterEach(() => AstroPhysics.resetScaleTransition());

/** Recover the blend factor a call was produced with. */
const factorFrom = (au: number, blended: number) => {
  const from = AstroPhysics.auToWorld(au, "didactic");
  const to = au * 1000; // AU_TO_3D_UNITS
  return (blended - from) / (to - from);
};

describe("scale-mode transition", () => {
  it("leaves the mode being LEFT exact while heading into the other", () => {
    const pureDidactic = AstroPhysics.auToWorld(NEPTUNE_AU, "didactic");
    AstroPhysics.beginScaleTransition(
      "didactic",
      "realistic",
      Date.now() - 1100
    );
    // Asking for the source mode must not slide: only the target blends.
    expect(AstroPhysics.auToWorld(NEPTUNE_AU, "didactic")).toBe(pureDidactic);
  });

  it("returns the exact mapping when nothing is in flight", () => {
    const didactic = AstroPhysics.auToWorld(NEPTUNE_AU, "didactic");
    const realistic = AstroPhysics.auToWorld(NEPTUNE_AU, "realistic");
    expect(didactic).not.toBeCloseTo(realistic, 0);
    expect(AstroPhysics.auToWorld(NEPTUNE_AU, "didactic")).toBe(didactic);
  });

  it("lands exactly on the target once the window closes", () => {
    const exact = NEPTUNE_AU * 1000;
    AstroPhysics.beginScaleTransition(
      "didactic",
      "realistic",
      Date.now() - 60_000
    );
    expect(AstroPhysics.auToWorld(NEPTUNE_AU, "realistic")).toBe(exact);
  });

  it("sits between the two mappings while in flight", () => {
    const from = AstroPhysics.auToWorld(NEPTUNE_AU, "didactic");
    const to = NEPTUNE_AU * 1000;
    AstroPhysics.beginScaleTransition(
      "didactic",
      "realistic",
      Date.now() - 1100
    );
    const mid = AstroPhysics.auToWorld(NEPTUNE_AU, "realistic");
    expect(mid).toBeGreaterThan(Math.min(from, to));
    expect(mid).toBeLessThan(Math.max(from, to));
  });

  it("blends every body with ONE factor, so nothing drifts apart", () => {
    // The contract that matters. Planets, orbit lines, grid rings and
    // region labels all route through `auToWorld`. If the factor varied
    // between call sites the grid would separate from the planets — a
    // failure this project has already had once, from a different cause.
    // Deriving the factor back out of two very different radii must give
    // the same answer.
    AstroPhysics.beginScaleTransition(
      "didactic",
      "realistic",
      Date.now() - 1100
    );
    const fEarth = factorFrom(1, AstroPhysics.auToWorld(1, "realistic"));
    const fNeptune = factorFrom(
      NEPTUNE_AU,
      AstroPhysics.auToWorld(NEPTUNE_AU, "realistic")
    );
    expect(fEarth).toBeGreaterThan(0);
    expect(fEarth).toBeLessThan(1);
    // Tolerance covers only the sub-millisecond drift between the two
    // wall-clock reads, which is ~0.05 % of a 2.2 s window.
    expect(Math.abs(fEarth - fNeptune)).toBeLessThan(0.005);
  });
});
