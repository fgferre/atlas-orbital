import type { QualityMode } from "../../lib/qualityProfile";
import {
  STARFIELD_SOURCE_LABELS,
  type StarfieldSource,
} from "../../lib/starfield";
import type { SunRenderMode } from "../../lib/sunRenderMode";

export type RightControlPanelId = "search" | "scene" | "overlay" | "project";

export interface RightControlPanelState {
  activePanel: RightControlPanelId | null;
  queuedPanel: RightControlPanelId | null;
}

export type VisibilityCategory =
  | "planets"
  | "moons"
  | "dwarfs"
  | "asteroids"
  | "tnos"
  | "comets";

export const RIGHT_CONTROL_BUTTONS = [
  { id: "search", label: "Search" },
  { id: "scene", label: "Scene" },
  { id: "overlay", label: "Overlay" },
  { id: "project", label: "Project" },
] as const satisfies ReadonlyArray<{
  id: RightControlPanelId;
  label: string;
}>;

export const RIGHT_CONTROL_TRIGGER_SELECTOR = "[data-right-control-trigger]";

export const resolveRightControlPanelRequest = (
  state: RightControlPanelState,
  requestedPanel: RightControlPanelId | null
): RightControlPanelState => {
  if (requestedPanel === null) {
    return {
      activePanel: null,
      queuedPanel: null,
    };
  }

  if (state.activePanel === null) {
    if (state.queuedPanel) {
      return {
        activePanel: null,
        queuedPanel: requestedPanel,
      };
    }

    return {
      activePanel: requestedPanel,
      queuedPanel: null,
    };
  }

  if (state.activePanel === requestedPanel) {
    return {
      activePanel: null,
      queuedPanel: null,
    };
  }

  return {
    activePanel: null,
    queuedPanel: requestedPanel,
  };
};

export const resolveRightControlPanelExit = (
  state: RightControlPanelState
): RightControlPanelState => {
  if (!state.queuedPanel || state.activePanel) {
    return state;
  }

  return {
    activePanel: state.queuedPanel,
    queuedPanel: null,
  };
};

export const SEARCH_QUICK_TARGETS = [
  { id: "sun", label: "Sun" },
  { id: "earth", label: "Earth" },
  { id: "mars", label: "Mars" },
  { id: "jupiter", label: "Jupiter" },
  { id: "titan", label: "Titan" },
  { id: "pluto", label: "Pluto" },
] as const;

export const SCENE_SOURCE_OPTIONS = [
  { id: "tycho2", label: STARFIELD_SOURCE_LABELS.tycho2 },
  { id: "nasa", label: STARFIELD_SOURCE_LABELS.nasa },
] as const satisfies ReadonlyArray<{ id: StarfieldSource; label: string }>;

export const SCENE_SCALE_OPTIONS = [
  { id: "didactic", label: "Didactic" },
  { id: "realistic", label: "Realistic" },
] as const;

export const SCENE_QUALITY_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "ultra", label: "Ultra" },
  { id: "high", label: "High" },
  { id: "balanced", label: "Balanced" },
  { id: "constrained", label: "Saver" },
] as const satisfies ReadonlyArray<{ id: QualityMode; label: string }>;

export const SCENE_SUN_RENDER_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "procedural", label: "Procedural" },
  { id: "texture", label: "Texture" },
] as const satisfies ReadonlyArray<{ id: SunRenderMode; label: string }>;

export const OVERLAY_FILTER_OPTIONS = [
  { id: "planets", label: "Planets" },
  { id: "moons", label: "Moons" },
  { id: "dwarfs", label: "Dwarfs" },
  { id: "asteroids", label: "Asteroids" },
  { id: "tnos", label: "TNOs" },
  { id: "comets", label: "Comets" },
] as const satisfies ReadonlyArray<{
  id: VisibilityCategory;
  label: string;
}>;

export const OVERLAY_GUIDE_OPTIONS = [
  { id: "icons", label: "Icons" },
  { id: "labels", label: "Labels" },
  { id: "orbits", label: "Orbits" },
  { id: "context-orbits", label: "Context Orbits" },
  { id: "ecliptic-grid", label: "Ecliptic Grid" },
  { id: "prograde-vector", label: "Prograde Vector" },
] as const;
