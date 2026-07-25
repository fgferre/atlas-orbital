import { describe, expect, it } from "vitest";

import {
  DEFAULT_LABEL_MODE,
  LABEL_MODE_LABELS,
  LABEL_MODES,
  type LabelMode,
} from "./labelMode";

describe("labelMode", () => {
  it("defaults to 'sdf' so labels can carry depth", () => {
    // Flipped from "html". The old pin was named "for a11y safety", but the
    // accessible surface is the icon <button> in PlanetOverlay, which keys
    // off `showIcons` and never reads `labelMode` — so the flip does not
    // move a11y either way. SDF is the default because a label living in
    // the scene can be occluded and depth-sorted; a DOM overlay cannot,
    // which is why a distant body's label could land inside a focused
    // planet's moon system.
    expect(DEFAULT_LABEL_MODE).toBe("sdf");
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
