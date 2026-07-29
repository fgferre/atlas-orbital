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

  // Was "promotes Europa and Titan after the external sweep". The promotion
  // was recorded on 2026-04-06 but never reached the runtime, and when the
  // mosaics were finally rendered on a sphere (2026-07-27) both turned out to
  // be undroppable as-is: monochrome, and Europa has a solid no-data gore at
  // the south pole. The row now records the blocker instead of a promotion
  // that did not happen.
  it("holds Europa and Titan mosaics as alternatives until they are renderable", () => {
    expect(getAssetStudyRow("titan")?.verdict).toBe("manter como alternativa");
    expect(getAssetStudyRow("europa")?.verdict).toBe("manter como alternativa");
    expect(getAssetStudyRow("titan")?.candidateAssetIds).toEqual([
      "titan-mosaic-reference",
    ]);
    expect(getAssetStudyRow("europa")?.candidateAssetIds).toEqual([
      "europa-mosaic-reference",
    ]);
  });
});
