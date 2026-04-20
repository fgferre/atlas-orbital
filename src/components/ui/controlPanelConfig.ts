import {
  STARFIELD_SOURCE_LABELS,
  type StarfieldSource,
} from "../../lib/starfield";

export type RightControlPanelId = "search" | "view" | "display" | "a11y";

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

// Shared filing-cabinet rail geometry. Keeping the desktop rail math in one
// place avoids silent drift between Overlay, SearchBar, and LayersPanel.
export const RIGHT_CONTROL_TAB_WIDTH_CLASS = "w-10";
export const RIGHT_CONTROL_MOBILE_TAB_HEIGHT_CLASS = "h-[4.5rem]";
export const RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_CLASS = "h-[5rem]";
export const RIGHT_CONTROL_DESKTOP_TAB_SHAPE_CLASS =
  "[clip-path:polygon(0_6px,100%_0,100%_100%,0_calc(100%-6px))]";
export const RIGHT_CONTROL_DESKTOP_TAB_SHADOW_CLASS =
  "[filter:drop-shadow(0_3px_4px_rgba(0,0,0,0.45))]";
export const RIGHT_CONTROL_DESKTOP_TAB_OVERLAP_CLASS = "[&>*+*]:-mt-[0.375rem]";
export const RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_PX = 80;
export const RIGHT_CONTROL_DESKTOP_TAB_OVERLAP_PX = 6;
export const RIGHT_CONTROL_DESKTOP_TAB_STRIDE_PX =
  RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_PX - RIGHT_CONTROL_DESKTOP_TAB_OVERLAP_PX;
export const RIGHT_CONTROL_DESKTOP_PANEL_EXIT_X = "calc(100% - 2.5rem)";

// Menu structure v3.1 rail ordering (PR 3 state):
//   search | view | display | a11y
//
// Project tab was demoted to the Gear popover (Help/About/Developer
// sections) because its items are session-episodic (tutorial replay,
// mission report, debug logging) and didn't warrant permanent rail
// real estate. See tasks/menu-structure-v3.md §4.7.
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
] as const satisfies ReadonlyArray<{
  id: RightControlPanelId;
  label: string;
}>;

export const getRightControlPanelDomId = (panelId: RightControlPanelId) =>
  `atlas-${panelId}-panel`;

export const getTrackedRightControlPanelDomIds = (
  activePanel: RightControlPanelId | null
) =>
  activePanel
    ? [getRightControlPanelDomId(activePanel)]
    : RIGHT_CONTROL_BUTTONS.map(({ id }) => getRightControlPanelDomId(id));

export const getRightControlDesktopWrapperOffsetStyle = (stackOffset = 1) => ({
  top: `-${RIGHT_CONTROL_DESKTOP_TAB_STRIDE_PX * stackOffset}px`,
});

export const getRightControlDesktopHandleOffsetStyle = (
  stackIndex: number
) => ({
  marginTop: `${stackIndex * RIGHT_CONTROL_DESKTOP_TAB_STRIDE_PX}px`,
});

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
