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

  // Replaces "marks Titan and Europa official mosaics as active runtime maps"
  // (2026-04-06 → 2026-07-27). That assertion was false about the product: the
  // mosaics were declared active but the tier ladder never resolved to them,
  // so the app served 2k_titan.jpg / 2k_europa.jpg the whole time. `active`
  // has to mean "this is what renders", or the manifest is decoration.
  it("reserves 'active' for the map the runtime actually renders", () => {
    expect(getVisualAssetById("titan-map-active")?.filePath).toContain(
      "2k_titan"
    );
    expect(getVisualAssetById("europa-map-active")?.filePath).toContain(
      "2k_europa"
    );
    expect(getVisualAssetById("io-map-active")?.filePath).toContain(
      "jupiter_nasa_io_b_3d_resource"
    );
  });

  it("keeps the official mosaics as measured references, not runtime maps", () => {
    for (const id of ["titan-mosaic-reference", "europa-mosaic-reference"]) {
      const entry = getVisualAssetById(id);
      expect(entry?.status, `${id} must not claim to be the runtime map`).toBe(
        "candidate"
      );
      expect(entry?.sourceUrl).toContain("astrogeology.usgs.gov");
    }
  });

  it("files the NASA Io map under Io", () => {
    // It lived under bodyId "jupiter" because NASA publishes it on a Jupiter
    // page. The image is Io, so the Jupiter study row was comparing a Jupiter
    // map against an Io map.
    expect(getVisualAssetById("io-map-active")?.bodyId).toBe("io");
    expect(getVisualAssetById("jupiter-map-candidate")).toBeNull();
  });
});
