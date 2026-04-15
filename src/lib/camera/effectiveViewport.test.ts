import { describe, expect, it } from "vitest";

import { resolveViewportFraming } from "./effectiveViewport";

describe("resolveViewportFraming", () => {
  it("shrinks the usable viewport around desktop chrome and keeps framing centered when panels are balanced", () => {
    const framing = resolveViewportFraming({
      viewportWidth: 1440,
      viewportHeight: 900,
      isMobile: false,
      topBarRect: {
        left: 12,
        top: 12,
        right: 352,
        bottom: 76,
        width: 340,
        height: 64,
      },
      timelineRect: {
        left: 480,
        top: 820,
        right: 960,
        bottom: 884,
        width: 480,
        height: 64,
      },
      sidebarRect: {
        left: 16,
        top: 100,
        right: 368,
        bottom: 780,
        width: 352,
        height: 680,
      },
      activePanelRect: {
        left: 1060,
        top: 180,
        right: 1424,
        bottom: 760,
        width: 364,
        height: 580,
      },
    });

    expect(framing.fitInsets.left).toBe(384);
    expect(framing.fitInsets.right).toBe(396);
    expect(framing.fitInsets.top).toBe(92);
    expect(framing.fitInsets.bottom).toBe(96);
    expect(framing.usableRect.width).toBe(660);
    expect(Math.abs(framing.compositionOffsetXPx)).toBeLessThan(8);
  });

  it("treats the mobile sidebar as bottom chrome instead of side chrome", () => {
    const framing = resolveViewportFraming({
      viewportWidth: 390,
      viewportHeight: 844,
      isMobile: true,
      sidebarRect: {
        left: 12,
        top: 520,
        right: 378,
        bottom: 812,
        width: 366,
        height: 292,
      },
    });

    expect(framing.fitInsets.left).toBe(12);
    expect(framing.fitInsets.right).toBe(12);
    expect(framing.fitInsets.bottom).toBe(336);
  });

  it("keeps overlay reservations separate from camera fit reservations", () => {
    const framing = resolveViewportFraming({
      viewportWidth: 1440,
      viewportHeight: 900,
      isMobile: false,
      searchRailRect: {
        left: 1392,
        top: 280,
        right: 1432,
        bottom: 360,
        width: 40,
        height: 80,
      },
      settingsRailRect: {
        left: 1392,
        top: 384,
        right: 1432,
        bottom: 640,
        width: 40,
        height: 256,
      },
    });

    expect(framing.fitInsets.right).toBe(16);
    expect(framing.overlayInsets.right).toBe(66);
  });

  it("preserves the sign of asymmetric composition offsets in the framing signature", () => {
    const framing = resolveViewportFraming({
      viewportWidth: 1440,
      viewportHeight: 900,
      isMobile: false,
      activePanelRect: {
        left: 1080,
        top: 160,
        right: 1424,
        bottom: 760,
        width: 344,
        height: 600,
      },
    });

    const signatureParts = framing.signature.split(":");

    expect(framing.compositionOffsetXPx).toBeLessThan(0);
    expect(signatureParts.at(-2)).toBe(
      String(Math.round(framing.compositionOffsetXPx))
    );
  });
});
