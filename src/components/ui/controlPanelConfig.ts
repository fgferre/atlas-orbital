import {
  STARFIELD_SOURCE_LABELS,
  type StarfieldSource,
} from "../../lib/starfield";

export type RightControlPanelId =
  | "search"
  | "view"
  | "display"
  | "a11y"
  | "project";

export interface RightControlPanelState {
  activePanel: RightControlPanelId | null;
  queuedPanel: RightControlPanelId | null;
}

export type VisibilityCategory =
  | "planets"
  | "moons"
  | "dwarfs"
  | "asteroids"
  | "tnos";

// Menu structure v3.1 rail ordering (PR 2 state):
//   search | view | display | a11y | project
//
// Scene + Overlay consolidated into View; Project demote to the Gear
// popover lands in PR 3. Display + A11y sit left of Project because
// they're session-scoped (tweak-then-forget) rather than document-scoped
// (project name, epoch range).
export const RIGHT_CONTROL_BUTTONS = [
  { id: "search", label: "Search" },
  // "View" consolidates the former Scene + Overlay tabs (menu-structure-v3
  // §4.3). Covers world mode, body visibility, guides, and backdrop under
  // one coherent surface.
  { id: "view", label: "View" },
  { id: "display", label: "Display" },
  // "Access" instead of "Accessibility" — the vertical rail button
  // caps at roughly 7 characters before truncation; "Access" reads
  // as an abbreviation users parse correctly and keeps layout in
  // parity with the existing "Project" / "Display" labels. The
  // panel header (PANEL_COPY.a11y.title in LayersPanel.tsx) spells
  // it out in full.
  { id: "a11y", label: "Access" },
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
  { id: "hyg", label: STARFIELD_SOURCE_LABELS.hyg },
  { id: "nasa", label: STARFIELD_SOURCE_LABELS.nasa },
] as const satisfies ReadonlyArray<{ id: StarfieldSource; label: string }>;

export const SCENE_SCALE_OPTIONS = [
  { id: "didactic", label: "Didactic" },
  { id: "realistic", label: "Realistic" },
] as const;

export const OVERLAY_FILTER_OPTIONS = [
  { id: "planets", label: "Planets" },
  { id: "moons", label: "Moons" },
  { id: "dwarfs", label: "Dwarfs" },
  { id: "asteroids", label: "Asteroids" },
  { id: "tnos", label: "TNOs" },
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
