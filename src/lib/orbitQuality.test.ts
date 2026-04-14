import { describe, expect, it } from "vitest";
import {
  getOrbitAncestryIds,
  getOrbitCacheKey,
  getOrbitSegments,
} from "./orbitQuality";

describe("getOrbitSegments", () => {
  it("keeps the focused body at maximum fidelity", () => {
    expect(
      getOrbitSegments({
        bodyId: "earth",
        focusId: "earth",
        orbitProfile: "constrained",
      })
    ).toBe(16384);
  });

  it("maps non-focused bodies by profile", () => {
    expect(
      getOrbitSegments({
        bodyId: "mars",
        focusId: "earth",
        orbitProfile: "ultra",
      })
    ).toBe(4096);

    expect(
      getOrbitSegments({
        bodyId: "mars",
        focusId: "earth",
        orbitProfile: "high",
      })
    ).toBe(4096);

    expect(
      getOrbitSegments({
        bodyId: "mars",
        focusId: "earth",
        orbitProfile: "balanced",
      })
    ).toBe(2048);

    expect(
      getOrbitSegments({
        bodyId: "mars",
        focusId: "earth",
        orbitProfile: "constrained",
      })
    ).toBe(1024);
  });
});

describe("getOrbitCacheKey", () => {
  it("includes the body, scale mode, and resolved segment count", () => {
    expect(
      getOrbitCacheKey({
        bodyId: "moon",
        focusId: "earth",
        orbitProfile: "balanced",
        scaleMode: "realistic",
      })
    ).toBe("moon:realistic:2048");
  });

  it("keeps focused orbits on a distinct key via their higher segment count", () => {
    const focused = getOrbitCacheKey({
      bodyId: "earth",
      focusId: "earth",
      orbitProfile: "constrained",
      scaleMode: "didactic",
    });
    const nonFocused = getOrbitCacheKey({
      bodyId: "earth",
      focusId: "sun",
      orbitProfile: "constrained",
      scaleMode: "didactic",
    });

    expect(focused).not.toBe(nonFocused);
  });
});

describe("getOrbitAncestryIds", () => {
  it("walks parent links until the root", () => {
    expect(
      getOrbitAncestryIds("moon", {
        moon: "earth",
        earth: "sun",
        sun: null,
      })
    ).toEqual(["earth", "sun"]);
  });

  it("guards against cycles in the parent chain", () => {
    expect(
      getOrbitAncestryIds("a", {
        a: "b",
        b: "c",
        c: "a",
      })
    ).toEqual(["b", "c", "a"]);
  });
});
