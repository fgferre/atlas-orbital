import { describe, expect, it } from "vitest";

import {
  OVERLAY_FILTER_OPTIONS,
  OVERLAY_GUIDE_OPTIONS,
  RIGHT_CONTROL_BUTTONS,
  RIGHT_CONTROL_TRIGGER_SELECTOR,
  SCENE_SCALE_OPTIONS,
  SCENE_SOURCE_OPTIONS,
  SEARCH_QUICK_TARGETS,
  resolveRightControlPanelExit,
  resolveRightControlPanelRequest,
} from "./controlPanelConfig";

describe("controlPanelConfig", () => {
  it("keeps the explicit right-side tool order intact", () => {
    // Menu structure v3.1 PR 2: Scene + Overlay consolidated into View.
    // Project still sits at tail; PR 3 demotes it into the Gear popover.
    expect(RIGHT_CONTROL_BUTTONS.map((button) => button.label)).toEqual([
      "Search",
      "View",
      "Display",
      "Access",
      "Project",
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

  it("keeps both starfield sources and scale modes visible", () => {
    expect(SCENE_SOURCE_OPTIONS.map((option) => option.label)).toEqual([
      "HYG v4.2",
      "NASA Eyes",
    ]);
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
        "project"
      )
    ).toEqual({
      activePanel: null,
      queuedPanel: "project",
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
        queuedPanel: "project",
      })
    ).toEqual({
      activePanel: "view",
      queuedPanel: "project",
    });
  });

  it("keeps a shared selector for all right-side panel triggers", () => {
    expect(RIGHT_CONTROL_TRIGGER_SELECTOR).toBe("[data-right-control-trigger]");
  });
});
