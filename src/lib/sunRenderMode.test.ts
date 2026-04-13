import { describe, expect, it } from "vitest";

import { resolveSunRenderMode } from "./sunRenderMode";

describe("resolveSunRenderMode", () => {
  it("enables the procedural sun automatically on ultra", () => {
    expect(resolveSunRenderMode("auto", "ultra")).toBe("procedural");
  });

  it("keeps the texture sun for non-ultra auto profiles", () => {
    expect(resolveSunRenderMode("auto", "high")).toBe("texture");
    expect(resolveSunRenderMode("auto", "balanced")).toBe("texture");
    expect(resolveSunRenderMode("auto", "constrained")).toBe("texture");
  });

  it("respects explicit overrides", () => {
    expect(resolveSunRenderMode("texture", "ultra")).toBe("texture");
    expect(resolveSunRenderMode("procedural", "constrained")).toBe(
      "procedural"
    );
  });
});
