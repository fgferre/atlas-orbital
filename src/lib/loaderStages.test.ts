import { describe, expect, it } from "vitest";
import { resolveLoaderSnapshot } from "./loaderStages";

describe("resolveLoaderSnapshot", () => {
  it("reports the boot stage before the loading manager starts", () => {
    const snapshot = resolveLoaderSnapshot({
      progress: 0,
      active: false,
      isSceneReady: false,
      showStarfield: true,
      starfieldSource: "hyg",
      starfieldStatus: "idle",
    });

    expect(snapshot.currentStageId).toBe("boot");
    expect(snapshot.progressValue).toBe(8);
    expect(snapshot.metrics[0].value).toBe("waiting");
    expect(snapshot.metrics[1].value).toContain("waiting");
  });

  it("promotes the asset stage while loaders are active", () => {
    const snapshot = resolveLoaderSnapshot({
      progress: 42,
      active: true,
      isSceneReady: false,
      showStarfield: true,
      starfieldSource: "hyg",
      starfieldStatus: "loading",
    });

    expect(snapshot.currentStageId).toBe("assets");
    expect(snapshot.progressValue).toBeGreaterThan(40);
    expect(snapshot.stages.find((stage) => stage.id === "assets")?.state).toBe(
      "active"
    );
    expect(snapshot.metrics[1]).toEqual(
      expect.objectContaining({
        value: expect.stringContaining("downloading"),
      })
    );
  });

  it("switches to render warm-up once asset loading settles", () => {
    const snapshot = resolveLoaderSnapshot({
      progress: 96,
      active: false,
      isSceneReady: false,
      showStarfield: true,
      starfieldSource: "nasa",
      starfieldStatus: "ready",
    });

    expect(snapshot.currentStageId).toBe("render");
    expect(snapshot.progressValue).toBe(96);
    expect(snapshot.metrics[2].value).toBe("warming up");
  });

  it("marks the scene fully ready when the first frames are confirmed", () => {
    const snapshot = resolveLoaderSnapshot({
      progress: 100,
      active: false,
      isSceneReady: true,
      showStarfield: false,
      starfieldSource: "hyg",
      starfieldStatus: "idle",
    });

    expect(snapshot.currentStageId).toBe("ready");
    expect(snapshot.progressValue).toBe(100);
    expect(snapshot.stages.at(-1)?.state).toBe("active");
    expect(snapshot.metrics[1].value).toBe("disabled");
    expect(snapshot.metrics[2].value).toBe("online");
  });
});
