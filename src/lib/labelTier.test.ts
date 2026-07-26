import { describe, expect, it } from "vitest";

import { labelTierFor } from "./labelTier";

describe("labelTierFor", () => {
  it("splits planets from the long tail so EARTH cannot read like WEYWOT", () => {
    expect(labelTierFor("planet", false)).toBe("secondary");
    expect(labelTierFor("moon", false)).toBe("tertiary");
    expect(labelTierFor("dwarf", false)).toBe("tertiary");
    expect(labelTierFor("star", false)).toBe("primary");
  });

  it("promotes whatever is focused, type notwithstanding", () => {
    // The camera is pointed at it. A dim label would contradict that,
    // so focus outranks the body's own class — the one rule here that
    // is not derivable from the type table.
    expect(labelTierFor("moon", true)).toBe("primary");
    expect(labelTierFor("asteroid", true)).toBe("primary");
  });
});
