import { create } from "zustand";
import type { VisualPresetType } from "./config/visualPresets";
import type { ViewportFramingState } from "./lib/camera/effectiveViewport";
import type { QualityMode } from "./lib/qualityProfile";
import { simulationClock } from "./lib/simulationClock";
import type { SunRenderMode } from "./lib/sunRenderMode";
import type {
  HoveredStarInfo,
  StarfieldProviderState,
  StarfieldSource,
} from "./lib/starfield";
import { createDefaultViewportFramingState } from "./lib/camera/effectiveViewport";

interface AppState {
  /**
   * Low-rate copy of the simulation clock intended for UI consumers
   * (Timeline readout, Sidebar stats, TopBar date label). Written from
   * the `simulationClock` bridge installed below at ~4 Hz while playing
   * plus on milestones (pause, seek, live-mode toggle). In-canvas
   * consumers inside `useFrame` should read `simulationClock.getNow()`
   * directly rather than subscribing to this field.
   */
  displayedDatetime: Date;
  speed: number;
  isPlaying: boolean;
  selectedId: string | null;
  focusId: string | null;
  showLabels: boolean;
  showIcons: boolean;
  showStarfield: boolean;
  starfieldSource: StarfieldSource;
  starfieldProviderStates: Record<StarfieldSource, StarfieldProviderState>;
  /**
   * Currently hovered HYG-named star, or null when the pointer is not
   * lingering on one. Written by `useStarHover`, consumed by the
   * `<StarHoverTooltip />` layer outside the Canvas.
   */
  hoveredStar: HoveredStarInfo | null;
  showCredits: boolean;
  showOrbits: boolean;
  declutterOrbits: boolean;
  showEclipticGrid: boolean;
  showProgradeVector: boolean;
  scaleMode: "didactic" | "realistic";
  qualityMode: QualityMode;
  sunRenderMode: SunRenderMode;
  visualPreset: VisualPresetType;
  autoPresetEnabled: boolean;
  focusHistory: string[];
  overlayItems: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    isSmall: boolean;
    showLabel: boolean;
    showIcon: boolean;
  }>;
  viewportFraming: ViewportFramingState;
  visibility: {
    planets: boolean;
    dwarfs: boolean;
    moons: boolean;
    asteroids: boolean;
    tnos: boolean;
  };
  showTutorial: boolean;
  tutorialStep: number;
  criticalAssetsReady: boolean;
  isSceneReady: boolean;
  isLoaderHidden: boolean;
  hasPlayedIntroAnimation: boolean;
  isIntroAnimating: boolean;
  isLiveMode: boolean;
  tutorialCompletionStatus: "not-seen" | "skipped" | "completed" | null;

  setLiveMode: (isLive: boolean) => void;

  /**
   * Milestone setter for the simulation time. Delegates to
   * `simulationClock.seek()`, which moves the authoritative clock and
   * synchronously updates `displayedDatetime` via the bridge below.
   * Use this for date-picker seeks and explicit snaps; do NOT call it
   * from a `requestAnimationFrame` loop (the clock already owns that).
   */
  setDisplayedDatetime: (date: Date | ((prev: Date) => Date)) => void;
  setSpeed: (speed: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setSelectedId: (id: string | null) => void;
  selectId: (id: string | null) => void;
  setFocusId: (id: string | null) => void;
  setOverlayItems: (items: AppState["overlayItems"]) => void;
  setViewportFraming: (next: ViewportFramingState) => void;
  toggleLabels: () => void;
  toggleIcons: () => void;
  toggleOrbits: () => void;
  toggleDeclutterOrbits: () => void;
  toggleEclipticGrid: () => void;
  toggleProgradeVector: () => void;
  toggleScaleMode: () => void;
  setQualityMode: (mode: QualityMode) => void;
  setSunRenderMode: (mode: SunRenderMode) => void;
  setVisualPreset: (preset: VisualPresetType) => void;
  toggleAutoPreset: () => void;
  toggleShowStarfield: () => void;
  setStarfieldSource: (source: StarfieldSource) => void;
  setHoveredStar: (next: HoveredStarInfo | null) => void;
  setStarfieldProviderState: (
    source: StarfieldSource,
    nextState: Partial<StarfieldProviderState>
  ) => void;
  toggleStarfieldImplementation: () => void;
  toggleCredits: () => void;
  focusHome: () => void;
  focusBack: () => void;
  toggleVisibility: (category: keyof AppState["visibility"]) => void;
  closeTutorial: (status?: "completed" | "skipped") => void;
  completeTutorial: () => void;
  openTutorial: () => void;
  reopenTutorial: () => void;
  setTutorialStep: (step: number) => void;
  setCriticalAssetsReady: (ready: boolean) => void;
  setSceneReady: (ready: boolean) => void;
  setLoaderHidden: (hidden: boolean) => void;
  setHasPlayedIntroAnimation: (played: boolean) => void;
  setIsIntroAnimating: (animating: boolean) => void;
  debugMode: boolean;
  toggleDebugMode: () => void;
}

const QUALITY_MODE_STORAGE_KEY = "qualityMode";
const SUN_RENDER_MODE_STORAGE_KEY = "sunRenderMode";

const canUseLocalStorage = () =>
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem === "function" &&
  typeof localStorage.setItem === "function";

const getInitialQualityMode = (): QualityMode => {
  if (typeof window === "undefined" || !window.localStorage) {
    return "auto";
  }

  const storedValue = localStorage.getItem(QUALITY_MODE_STORAGE_KEY);
  if (
    storedValue === "auto" ||
    storedValue === "ultra" ||
    storedValue === "high" ||
    storedValue === "balanced" ||
    storedValue === "constrained"
  ) {
    return storedValue;
  }

  return "auto";
};

const getInitialSunRenderMode = (): SunRenderMode => {
  if (!canUseLocalStorage()) {
    return "auto";
  }

  const storedValue = localStorage.getItem(SUN_RENDER_MODE_STORAGE_KEY);
  if (
    storedValue === "auto" ||
    storedValue === "texture" ||
    storedValue === "procedural"
  ) {
    return storedValue;
  }

  return "auto";
};

export const useStore = create<AppState>((set) => ({
  displayedDatetime: new Date(),
  speed: 1,
  isPlaying: true,
  selectedId: null,
  focusId: null,
  showLabels: true,
  showIcons: true,
  showOrbits: true,
  declutterOrbits: true,
  showEclipticGrid: true,
  showProgradeVector: true,
  scaleMode: "didactic",
  qualityMode: getInitialQualityMode(),
  sunRenderMode: getInitialSunRenderMode(),
  visualPreset: "DEEP_SPACE",
  autoPresetEnabled: true,
  focusHistory: [],
  overlayItems: [],
  viewportFraming:
    typeof window !== "undefined"
      ? createDefaultViewportFramingState(window.innerWidth, window.innerHeight)
      : createDefaultViewportFramingState(),
  showStarfield: true,
  starfieldSource: "hyg",
  starfieldProviderStates: {
    hyg: { status: "idle", error: null },
    nasa: { status: "idle", error: null },
  },
  hoveredStar: null,
  showCredits: false,
  visibility: {
    planets: true,
    dwarfs: true,
    moons: true,
    asteroids: true,
    tnos: true,
  },
  showTutorial:
    typeof window !== "undefined" && window.localStorage
      ? !localStorage.getItem("tutorialStatus")
      : true, // Default true for SSR
  tutorialCompletionStatus:
    typeof window !== "undefined" && window.localStorage
      ? (localStorage.getItem("tutorialStatus") as
          | "skipped"
          | "completed"
          | null)
      : null,
  tutorialStep: 0,
  criticalAssetsReady: false,
  isSceneReady: false,
  isLoaderHidden: false,
  hasPlayedIntroAnimation: false, // Always play on page load
  isIntroAnimating: false,
  isLiveMode: true,

  setLiveMode: (isLiveMode) => set({ isLiveMode }),

  setDisplayedDatetime: (value) => {
    const next =
      typeof value === "function" ? value(simulationClock.getNow()) : value;
    // Delegate to the clock so authoritative simulation time moves too.
    // `seek()` fires a UI tick synchronously, which the bridge mirrors
    // into `displayedDatetime`. The `set()` fallback below covers the
    // edge case where the bridge is disabled (tests / HMR teardown).
    simulationClock.seek(next);
    set({ displayedDatetime: next });
  },
  setSpeed: (speed) => set({ speed }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setSelectedId: (selectedId) => set({ selectedId }),
  selectId: (selectedId) =>
    set((state) => {
      if (selectedId === state.focusId) {
        return { selectedId, focusId: selectedId };
      }

      const focusHistory = [...state.focusHistory];
      if (state.focusId && state.focusId !== selectedId) {
        const last = focusHistory[focusHistory.length - 1];
        if (last !== state.focusId) focusHistory.push(state.focusId);
      }

      return { selectedId, focusId: selectedId, focusHistory };
    }),
  setFocusId: (focusId) => set({ focusId }),
  setOverlayItems: (overlayItems) => set({ overlayItems }),
  setViewportFraming: (viewportFraming) =>
    set((state) =>
      state.viewportFraming.signature === viewportFraming.signature &&
      state.viewportFraming.viewportWidth === viewportFraming.viewportWidth &&
      state.viewportFraming.viewportHeight === viewportFraming.viewportHeight
        ? state
        : { viewportFraming }
    ),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  toggleIcons: () => set((state) => ({ showIcons: !state.showIcons })),
  toggleOrbits: () => set((state) => ({ showOrbits: !state.showOrbits })),
  toggleDeclutterOrbits: () =>
    set((state) => ({ declutterOrbits: !state.declutterOrbits })),
  toggleEclipticGrid: () =>
    set((state) => ({ showEclipticGrid: !state.showEclipticGrid })),
  toggleProgradeVector: () =>
    set((state) => ({ showProgradeVector: !state.showProgradeVector })),
  toggleShowStarfield: () =>
    set((state) => ({ showStarfield: !state.showStarfield })),
  setStarfieldSource: (starfieldSource) =>
    set((state) =>
      state.starfieldSource === starfieldSource ? state : { starfieldSource }
    ),
  setHoveredStar: (hoveredStar) =>
    set((state) =>
      state.hoveredStar === hoveredStar ? state : { hoveredStar }
    ),
  setStarfieldProviderState: (source, nextState) =>
    set((state) => {
      const currentState = state.starfieldProviderStates[source];
      const mergedState = {
        ...currentState,
        ...nextState,
      };

      if (
        currentState.status === mergedState.status &&
        currentState.error === mergedState.error
      ) {
        return state;
      }

      return {
        starfieldProviderStates: {
          ...state.starfieldProviderStates,
          [source]: mergedState,
        },
      };
    }),
  toggleStarfieldImplementation: () =>
    set((state) => ({
      starfieldSource: state.starfieldSource === "nasa" ? "hyg" : "nasa",
    })),
  toggleCredits: () => set((state) => ({ showCredits: !state.showCredits })),
  focusHome: () =>
    set((state) => {
      const focusHistory = [...state.focusHistory];
      if (state.focusId && state.focusId !== "sun") {
        const last = focusHistory[focusHistory.length - 1];
        if (last !== state.focusId) focusHistory.push(state.focusId);
      }
      return { focusId: "sun", selectedId: null, focusHistory };
    }),
  focusBack: () =>
    set((state) => {
      if (state.focusHistory.length === 0) return {};
      const focusHistory = [...state.focusHistory];
      const prev = focusHistory.pop() ?? null;
      if (!prev) return { focusHistory };
      return { focusId: prev, selectedId: prev, focusHistory };
    }),
  toggleScaleMode: () =>
    set((state) => ({
      scaleMode: state.scaleMode === "didactic" ? "realistic" : "didactic",
    })),
  setQualityMode: (qualityMode) => {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(QUALITY_MODE_STORAGE_KEY, qualityMode);
    }

    set((state) =>
      state.qualityMode === qualityMode ? state : { qualityMode }
    );
  },
  setSunRenderMode: (sunRenderMode) => {
    if (canUseLocalStorage()) {
      localStorage.setItem(SUN_RENDER_MODE_STORAGE_KEY, sunRenderMode);
    }

    set((state) =>
      state.sunRenderMode === sunRenderMode ? state : { sunRenderMode }
    );
  },
  setVisualPreset: (visualPreset) => set({ visualPreset }),
  toggleAutoPreset: () =>
    set((state) => ({ autoPresetEnabled: !state.autoPresetEnabled })),
  toggleVisibility: (category) =>
    set((state) => ({
      visibility: {
        ...state.visibility,
        [category]: !state.visibility[category],
      },
    })),
  closeTutorial: (status = "completed") => {
    localStorage.setItem("tutorialStatus", status);
    set({ showTutorial: false, tutorialCompletionStatus: status });
  },
  completeTutorial: () => {
    localStorage.setItem("tutorialStatus", "completed");
    set({
      showTutorial: false,
      tutorialCompletionStatus: "completed",
      selectedId: null,
      focusId: null,
    });
  },
  openTutorial: () => set({ showTutorial: true, tutorialStep: 0 }),
  reopenTutorial: () =>
    set({
      showTutorial: true,
      tutorialStep: 0,
      tutorialCompletionStatus: null,
      hasPlayedIntroAnimation: false, // Triggers intro animation to replay
    }),
  setTutorialStep: (step) => set({ tutorialStep: step }),
  setCriticalAssetsReady: (ready) =>
    set((state) =>
      state.criticalAssetsReady === ready
        ? state
        : { criticalAssetsReady: ready }
    ),
  setSceneReady: (ready) =>
    set((state) =>
      state.isSceneReady === ready ? state : { isSceneReady: ready }
    ),
  setLoaderHidden: (hidden) =>
    set((state) =>
      state.isLoaderHidden === hidden ? state : { isLoaderHidden: hidden }
    ),
  setHasPlayedIntroAnimation: (played) =>
    set((state) =>
      state.hasPlayedIntroAnimation === played
        ? state
        : { hasPlayedIntroAnimation: played }
    ),
  setIsIntroAnimating: (animating) =>
    set((state) =>
      state.isIntroAnimating === animating
        ? state
        : { isIntroAnimating: animating }
    ),
  debugMode: false,
  toggleDebugMode: () => set((state) => ({ debugMode: !state.debugMode })),
}));

// ─── simulationClock ↔ store bridge ─────────────────────────────────────────
// The clock owns the passage of simulated time. The store owns the UI-facing
// copy (`displayedDatetime`) plus playback intents (isPlaying / speed /
// isLiveMode). This wiring mirrors changes in both directions without ever
// letting the clock's per-frame rhythm reach React.

// (1) Clock → store: mirror UI-tick snapshots into `displayedDatetime`.
const disposeClockToStoreBridge = simulationClock.onUiTick((now) => {
  const state = useStore.getState();
  if (state.displayedDatetime.getTime() !== now.getTime()) {
    useStore.setState({ displayedDatetime: now });
  }
});

// (2) Store → clock: keep playback intents in sync.
const disposeStoreToClockBridge = useStore.subscribe((state, prev) => {
  if (state.speed !== prev.speed) simulationClock.setSpeed(state.speed);
  if (state.isLiveMode !== prev.isLiveMode)
    simulationClock.setIsLiveMode(state.isLiveMode);
  if (state.isPlaying !== prev.isPlaying)
    simulationClock.setIsPlaying(state.isPlaying);
});

// (3) Initial alignment at module load (defaults: isPlaying=true, speed=1,
// isLiveMode=true). The clock starts its loop immediately so getNow() is
// valid before any Zustand subscribers mount.
simulationClock.syncFromState({
  speed: useStore.getState().speed,
  isPlaying: useStore.getState().isPlaying,
  isLiveMode: useStore.getState().isLiveMode,
});

// (4) Vite HMR: drop both bridges when the store module is torn down so
// a reload does not accumulate duplicate `onUiTick` and `subscribe`
// handlers on the long-lived simulationClock singleton. In production
// builds `import.meta.hot` is undefined and the block is tree-shaken.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeClockToStoreBridge();
    disposeStoreToClockBridge();
  });
}
