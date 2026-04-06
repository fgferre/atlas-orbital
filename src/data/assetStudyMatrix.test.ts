import { describe, expect, it } from "vitest";
import {
  ASSET_STUDY_MATRIX,
  getAssetStudyEntries,
  getAssetStudyRow,
} from "./assetStudyMatrix";

describe("asset study matrix", () => {
  it("covers the eight bodies queued for the controlled study", () => {
    expect(ASSET_STUDY_MATRIX.map((row) => row.bodyId)).toEqual([
      "pallas",
      "hygiea",
      "vesta",
      "haumea",
      "jupiter",
      "uranus",
      "titan",
      "europa",
    ]);
  });

  it("only references manifest entries that exist", () => {
    for (const row of ASSET_STUDY_MATRIX) {
      expect(getAssetStudyEntries(row.currentAssetIds)).toHaveLength(
        row.currentAssetIds.length
      );
      expect(getAssetStudyEntries(row.candidateAssetIds)).toHaveLength(
        row.candidateAssetIds.length
      );
    }
  });

  it("keeps Jupiter as-is and leaves Uranus without an approved external replacement", () => {
    expect(getAssetStudyRow("jupiter")?.verdict).toBe("manter");
    expect(getAssetStudyRow("uranus")?.verdict).toBe("manter");
    expect(getAssetStudyRow("uranus")?.candidateAssetIds).toEqual([]);
  });

  it("promotes Europa and Titan after the external sweep", () => {
    expect(getAssetStudyRow("titan")?.verdict).toBe("substituir");
    expect(getAssetStudyRow("europa")?.verdict).toBe("substituir");
  });
});
