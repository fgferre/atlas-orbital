import { describe, expect, it } from "vitest";

import {
  DEFAULT_LABEL_MODE,
  LABEL_MODE_LABELS,
  LABEL_MODES,
  type LabelMode,
} from "./labelMode";

describe("labelMode", () => {
  it("defaults to 'html' for a11y safety", () => {
    expect(DEFAULT_LABEL_MODE).toBe("html");
  });

  it("exposes both modes in the canonical array", () => {
    expect(LABEL_MODES).toEqual(["html", "sdf"]);
  });

  it("provides a UI label per mode", () => {
    expect(LABEL_MODE_LABELS.html).toBe("HTML 2D");
    expect(LABEL_MODE_LABELS.sdf).toBe("SDF 3D");
  });

  it("exhausts the LabelMode union (compile-time check)", () => {
    const exhaust = (m: LabelMode): string => {
      switch (m) {
        case "html":
          return "html";
        case "sdf":
          return "sdf";
      }
    };
    expect(LABEL_MODES.map(exhaust)).toEqual(["html", "sdf"]);
  });
});
