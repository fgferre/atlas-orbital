import { describe, expect, it } from "vitest";

import {
  OVERLAY_FILTER_OPTIONS,
  OVERLAY_GUIDE_OPTIONS,
  RIGHT_CONTROL_BUTTONS,
  SCENE_QUALITY_OPTIONS,
  SCENE_SCALE_OPTIONS,
  SCENE_SOURCE_OPTIONS,
  SEARCH_QUICK_TARGETS,
} from "./controlPanelConfig";

describe("controlPanelConfig", () => {
  it("keeps the explicit right-side tool order intact", () => {
    expect(RIGHT_CONTROL_BUTTONS.map((button) => button.label)).toEqual([
      "Search",
      "Scene",
      "Overlay",
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
      "Tycho-2",
      "NASA Eyes",
    ]);
    expect(SCENE_SCALE_OPTIONS.map((option) => option.label)).toEqual([
      "Didactic",
      "Realistic",
    ]);
  });

  it("keeps all required quality options available", () => {
    expect(SCENE_QUALITY_OPTIONS.map((option) => option.label)).toEqual([
      "Auto",
      "Ultra",
      "High",
      "Balanced",
      "Saver",
    ]);
  });

  it("keeps comets and guide overlays in the inventory", () => {
    expect(OVERLAY_FILTER_OPTIONS.map((option) => option.label)).toEqual([
      "Planets",
      "Moons",
      "Dwarfs",
      "Asteroids",
      "TNOs",
      "Comets",
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
});
