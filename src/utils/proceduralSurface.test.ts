import { describe, expect, it } from "vitest";
import { SOLAR_SYSTEM_BODIES } from "../data/celestialBodies";
import { shouldRenderDirectSurfaceMap } from "./proceduralSurface";

const getBody = (id: string) => {
  const body = SOLAR_SYSTEM_BODIES.find((candidate) => candidate.id === id);
  expect(body).toBeDefined();
  return body!;
};

describe("shouldRenderDirectSurfaceMap", () => {
  it("keeps Hygiea's annotated reference map out of the diffuse render path", () => {
    expect(shouldRenderDirectSurfaceMap(getBody("hygiea"))).toBe(false);
  });

  it("preserves direct measured maps for bodies that have proper surface assets", () => {
    expect(shouldRenderDirectSurfaceMap(getBody("vesta"))).toBe(true);
  });
});
