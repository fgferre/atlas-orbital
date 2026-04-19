import { describe, expect, it } from "vitest";

import {
  STARFIELD_SOURCE_LABELS,
  STARFIELD_SOURCE_METADATA,
  getStarfieldLoadErrorMessage,
  hygTierForQuality,
} from "./starfield";

describe("hygTierForQuality", () => {
  // Wave α UX remap: 1:1 correspondence between graphics tier and HYG
  // catalogue tier so preset clicks translate to visible density
  // changes. Previously balanced collapsed to the same tier as high.
  it("keeps the constrained profile on the smallest tier", () => {
    expect(hygTierForQuality("constrained")).toBe("low");
  });

  it("binds balanced to the medium tier (distinct from high)", () => {
    expect(hygTierForQuality("balanced")).toBe("medium");
  });

  it("leaves the high profile on the high tier", () => {
    expect(hygTierForQuality("high")).toBe("high");
  });

  it("reserves the full catalogue for ultra", () => {
    expect(hygTierForQuality("ultra")).toBe("full");
  });
});

describe("starfield metadata", () => {
  it("advertises the HYG v4.2 preset with the real data source", () => {
    expect(STARFIELD_SOURCE_LABELS.hyg).toBe("HYG v4.2");
    expect(STARFIELD_SOURCE_METADATA.hyg.creditsTitle).toBe(
      "HYG v4.2 stellar database"
    );
    expect(STARFIELD_SOURCE_METADATA.hyg.creditsDescription).toContain(
      "109,400"
    );
    expect(STARFIELD_SOURCE_METADATA.hyg.creditsDescription).toContain(
      "proper motion"
    );
    expect(STARFIELD_SOURCE_METADATA.hyg.creditsLink).toBe(
      "https://www.astronexus.com/hyg"
    );
  });

  it("surfaces raw HYG loader errors verbatim", () => {
    expect(
      getStarfieldLoadErrorMessage(
        "hyg",
        new Error("Failed to load HYG full catalog (404)")
      )
    ).toBe("Failed to load HYG full catalog (404)");

    expect(
      getStarfieldLoadErrorMessage(
        "hyg",
        new Error('Invalid HYG binary header: "TYC2"')
      )
    ).toBe('Invalid HYG binary header: "TYC2"');
  });

  it("falls back to the canonical load error copy when no error object exists", () => {
    expect(getStarfieldLoadErrorMessage("nasa", null)).toBe(
      "Failed to load NASA Eyes catalog"
    );
    expect(getStarfieldLoadErrorMessage("hyg", undefined)).toBe(
      "Failed to load HYG v4.2 catalog"
    );
  });
});
