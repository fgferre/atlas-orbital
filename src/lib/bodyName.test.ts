import { describe, expect, it } from "vitest";

import { resolveBodyName } from "./bodyName";

const MARS = { en: "MARS", pt: "MARTE" };

describe("resolveBodyName", () => {
  it("maps every pt-* tag i18next can resolve to the Portuguese name", () => {
    // i18next hands back the full BCP-47 tag, so a bare `=== "pt"` check
    // would silently fall through to English for the configured "pt-BR".
    for (const tag of ["pt", "pt-BR", "pt-br", "pt-PT"]) {
      expect(resolveBodyName(MARS, tag)).toBe("MARTE");
    }
  });

  it("falls back to English for other languages and for no language", () => {
    for (const tag of ["en", "en-US", "es", undefined]) {
      expect(resolveBodyName(MARS, tag)).toBe("MARS");
    }
  });
});
