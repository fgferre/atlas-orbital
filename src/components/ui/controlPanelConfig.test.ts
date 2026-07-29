import { describe, expect, it } from "vitest";

import {
  getRightControlDesktopHandleOffsetStyle,
  getRightControlDesktopWrapperOffsetStyle,
  getRightControlPanelDomId,
  getTrackedRightControlPanelDomIds,
  OVERLAY_FILTER_OPTIONS,
  OVERLAY_GUIDE_OPTIONS,
  RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_PX,
  RIGHT_CONTROL_DESKTOP_TAB_OVERLAP_PX,
  RIGHT_CONTROL_DESKTOP_TAB_STRIDE_PX,
  RIGHT_CONTROL_BUTTONS,
  RIGHT_CONTROL_TRIGGER_SELECTOR,
  SCENE_SCALE_OPTIONS,
  SEARCH_QUICK_TARGETS,
  resolveRightControlPanelExit,
  resolveRightControlPanelRequest,
} from "./controlPanelConfig";

describe("controlPanelConfig", () => {
  it("keeps the explicit right-side tool order intact", () => {
    // Menu structure v3.1 PR 3: Project demoted to the Gear popover.
    // Rail is now Search + View + Display + Access only.
    expect(RIGHT_CONTROL_BUTTONS.map((button) => button.label)).toEqual([
      "Search",
      "View",
      "Display",
      "Access",
    ]);
  });

  it("keeps the required search quick targets available", () => {
    expect(SEARCH_QUICK_TARGETS.map((target) => target.label)).toEqual([
      "Sun",
      "Earth",
      "Mars",
      "Jupiter",
      "Titan",
      "Pluto",
    ]);
  });

  it("keeps both scale modes visible", () => {
    expect(SCENE_SCALE_OPTIONS.map((option) => option.label)).toEqual([
      "Didactic",
      "Realistic",
    ]);
  });

  it("keeps category and guide overlays in the inventory", () => {
    expect(OVERLAY_FILTER_OPTIONS.map((option) => option.label)).toEqual([
      "Planets",
      "Moons",
      "Dwarfs",
      "Asteroids",
      "TNOs",
    ]);
    expect(OVERLAY_GUIDE_OPTIONS.map((option) => option.label)).toEqual([
      "Icons",
      "Labels",
      "Orbits",
      "Context Orbits",
      "Ecliptic Grid",
      "Prograde Vector",
    ]);
  });

  it("queues panel swaps instead of replacing them abruptly", () => {
    expect(
      resolveRightControlPanelRequest(
        { activePanel: "view", queuedPanel: null },
        "display"
      )
    ).toEqual({
      activePanel: null,
      queuedPanel: "display",
    });
    expect(
      resolveRightControlPanelRequest(
        { activePanel: null, queuedPanel: "display" },
        "a11y"
      )
    ).toEqual({
      activePanel: null,
      queuedPanel: "a11y",
    });
  });

  it("opens queued panels only after the previous exit completes", () => {
    expect(
      resolveRightControlPanelExit({
        activePanel: null,
        queuedPanel: "search",
      })
    ).toEqual({
      activePanel: "search",
      queuedPanel: null,
    });
    expect(
      resolveRightControlPanelExit({
        activePanel: "view",
        queuedPanel: "a11y",
      })
    ).toEqual({
      activePanel: "view",
      queuedPanel: "a11y",
    });
  });

  it("keeps a shared selector for all right-side panel triggers", () => {
    expect(RIGHT_CONTROL_TRIGGER_SELECTOR).toBe("[data-right-control-trigger]");
  });

  it("tracks all right-side panel DOM ids while a panel is exiting", () => {
    expect(getTrackedRightControlPanelDomIds(null)).toEqual([
      getRightControlPanelDomId("search"),
      getRightControlPanelDomId("view"),
      getRightControlPanelDomId("display"),
      getRightControlPanelDomId("a11y"),
    ]);
    expect(getTrackedRightControlPanelDomIds("display")).toEqual([
      getRightControlPanelDomId("display"),
    ]);
  });

  it("derives the filing-cabinet stride and offsets from one source", () => {
    expect(RIGHT_CONTROL_DESKTOP_TAB_STRIDE_PX).toBe(
      RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_PX - RIGHT_CONTROL_DESKTOP_TAB_OVERLAP_PX
    );
    expect(getRightControlDesktopWrapperOffsetStyle()).toEqual({
      top: `-${RIGHT_CONTROL_DESKTOP_TAB_STRIDE_PX}px`,
    });
    expect(getRightControlDesktopHandleOffsetStyle(3)).toEqual({
      marginTop: `${RIGHT_CONTROL_DESKTOP_TAB_STRIDE_PX * 3}px`,
    });
  });
});
