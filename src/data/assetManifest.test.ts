import { describe, expect, it } from "vitest";
import {
  VISUAL_ASSET_MANIFEST,
  getVisualAssetByBodyPath,
  getVisualAssetById,
  toPublicAssetUrl,
  toRepoAssetPath,
} from "./assetManifest";

describe("visual asset manifest", () => {
  it("tracks the Phase 6 study bodies in a single governed manifest", () => {
    for (const bodyId of [
      "pallas",
      "hygiea",
      "vesta",
      "haumea",
      "jupiter",
      "uranus",
      "titan",
      "europa",
    ]) {
      expect(
        VISUAL_ASSET_MANIFEST.some((entry) => entry.bodyId === bodyId)
      ).toBe(true);
    }
  });

  it("marks Hygiea's published map as candidate-only until visual validation", () => {
    expect(getVisualAssetById("hygiea-map-candidate")?.status).toBe(
      "candidate"
    );
  });

  it("promotes the new DAMIT models for Pallas and Hygiea", () => {
    expect(getVisualAssetById("pallas-model-active")?.filePath).toContain(
      "Pallas_DAMIT_101.obj"
    );
    expect(getVisualAssetById("hygiea-model-active")?.filePath).toContain(
      "Hygiea_DAMIT_4392.obj"
    );
  });

  it("can resolve manifest entries from runtime-style public URLs", () => {
    const publicUrl = toPublicAssetUrl(
      "public/textures/hygiea_vlt_2017_2018_map.png"
    );

    expect(toRepoAssetPath(publicUrl)).toBe(
      "public/textures/hygiea_vlt_2017_2018_map.png"
    );
    expect(getVisualAssetByBodyPath("hygiea", publicUrl, "texture")?.id).toBe(
      "hygiea-map-candidate"
    );
  });

  it("marks Titan and Europa official mosaics as active runtime maps", () => {
    expect(getVisualAssetById("titan-map-active")?.filePath).toContain(
      "titan_cassini_iss_global_mosaic_4km"
    );
    expect(getVisualAssetById("europa-map-active")?.filePath).toContain(
      "europa_voyager_galileo_global_mosaic_500m"
    );
  });
});
