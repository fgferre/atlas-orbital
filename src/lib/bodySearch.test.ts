import { describe, expect, it } from "vitest";

import { SOLAR_SYSTEM_BODIES } from "../data/celestialBodies";
import { searchBodies } from "./bodySearch";

describe("searchBodies", () => {
  it("matches Portuguese names without requiring accents", () => {
    const results = searchBodies("Mercurio", SOLAR_SYSTEM_BODIES);

    expect(results[0]?.body.id).toBe("mercury");
  });

  it("matches core Portuguese names used in the handoff smoke cases", () => {
    expect(searchBodies("Sol", SOLAR_SYSTEM_BODIES)[0]?.body.id).toBe("sun");
    expect(searchBodies("Terra", SOLAR_SYSTEM_BODIES)[0]?.body.id).toBe(
      "earth"
    );
  });

  it("matches English names directly", () => {
    const results = searchBodies("Mars", SOLAR_SYSTEM_BODIES);

    expect(results[0]?.body.id).toBe("mars");
  });

  it("matches body type and keeps TNOs discoverable", () => {
    const results = searchBodies("TNO", SOLAR_SYSTEM_BODIES, 20);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.body.type === "tno")).toBe(true);
  });

  it("matches classifications as secondary signals", () => {
    const results = searchBodies("gas giant", SOLAR_SYSTEM_BODIES, 10);

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.body.id === "jupiter")).toBe(true);
    expect(results.some((result) => result.body.id === "saturn")).toBe(true);
  });

  it("returns no matches for an empty query", () => {
    expect(searchBodies("   ", SOLAR_SYSTEM_BODIES)).toEqual([]);
  });
});
