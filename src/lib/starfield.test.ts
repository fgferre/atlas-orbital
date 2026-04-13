import { describe, expect, it } from "vitest";

import {
  STARFIELD_SOURCE_LABELS,
  STARFIELD_SOURCE_METADATA,
  getStarfieldLoadErrorMessage,
} from "./starfield";

describe("starfield metadata", () => {
  it("keeps the processed HYG catalog copy aligned with runtime provenance", () => {
    expect(STARFIELD_SOURCE_LABELS.tycho2).toBe("HYG v4.2");
    expect(STARFIELD_SOURCE_METADATA.tycho2.creditsTitle).toBe(
      "HYG v4.2 processed catalog"
    );
    expect(STARFIELD_SOURCE_METADATA.tycho2.creditsDescription).toContain(
      "117,931"
    );
    expect(STARFIELD_SOURCE_METADATA.tycho2.creditsDescription).toContain(
      "legacy tycho2 binary asset"
    );
  });

  it("sanitizes legacy tycho2 errors before surfacing them to the UI", () => {
    expect(
      getStarfieldLoadErrorMessage(
        "tycho2",
        new Error("Failed to load Tycho-2 catalog (404)")
      )
    ).toBe("Failed to load HYG v4.2 catalog (404)");

    expect(
      getStarfieldLoadErrorMessage(
        "tycho2",
        new Error("Invalid Tycho-2 binary header: TYC3")
      )
    ).toBe("Invalid HYG v4.2 binary header: TYC3");
  });

  it("falls back to the canonical load error copy when no error object exists", () => {
    expect(getStarfieldLoadErrorMessage("nasa", null)).toBe(
      "Failed to load NASA Eyes catalog"
    );
  });
});
