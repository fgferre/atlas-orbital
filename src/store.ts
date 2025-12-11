import { create } from "zustand";
import type { VisualPresetType } from "./config/visualPresets";

interface AppState {
  datetime: Date;
  speed: number;
  isPlaying: boolean;
  selectedId: string | null;
  focusId: string | null;
  showLabels: boolean;
  showIcons: boolean;
  showStarfield: boolean;
  useNASAStarfield: boolean;
  showOrbits: boolean;
  scaleMode: "didactic" | "realistic";
  visualPreset: VisualPresetType;
  autoPresetEnabled: boolean;
  overlayItems: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    isSmall: boolean;
    showLabel: boolean;
    showIcon: boolean;
  }>;
  visibility: {
    planets: boolean;
    dwarfs: boolean;
    moons: boolean;
    asteroids: boolean;
    comets: boolean;
    tnos: boolean;
  };
  showTutorial: boolean;
  tutorialStep: number;
  isSceneReady: boolean;
  isLoaderHidden: boolean;
  hasPlayedIntroAnimation: boolean;
  isIntroAnimating: boolean;
  isLiveMode: boolean;
  tutorialCompletionStatus: "not-seen" | "skipped" | "completed" | null;

  setLiveMode: (isLive: boolean) => void;

  setDatetime: (date: Date | ((prev: Date) => Date)) => void;
  setSpeed: (speed: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setSelectedId: (id: string | null) => void;
  selectId: (id: string | null) => void;
  setFocusId: (id: string | null) => void;
  setOverlayItems: (items: AppState["overlayItems"]) => void;
  toggleLabels: () => void;
  toggleIcons: () => void;
  toggleOrbits: () => void;
  toggleScaleMode: () => void;
  setVisualPreset: (preset: VisualPresetType) => void;
  toggleAutoPreset: () => void;
  toggleShowStarfield: () => void;
  toggleStarfieldImplementation: () => void;
  toggleVisibility: (category: keyof AppState["visibility"]) => void;
  closeTutorial: (status?: "completed" | "skipped") => void;
  completeTutorial: () => void;
  openTutorial: () => void;
  reopenTutorial: () => void;
  setTutorialStep: (step: number) => void;
  setSceneReady: (ready: boolean) => void;
  setLoaderHidden: (hidden: boolean) => void;
  setHasPlayedIntroAnimation: (played: boolean) => void;
  setIsIntroAnimating: (animating: boolean) => void;
  debugMode: boolean;
  toggleDebugMode: () => void;
}

export const useStore = create<AppState>((set) => ({
  datetime: new Date(),
  speed: 1,
  isPlaying: true,
  selectedId: null,
  focusId: null,
  showLabels: true,
  showIcons: true,
  showOrbits: true,
  scaleMode: "didactic",
  visualPreset: "DEEP_SPACE",
  autoPresetEnabled: true,
  overlayItems: [],
  showStarfield: true,
  useNASAStarfield: false,
  visibility: {
    planets: true,
    dwarfs: true,
    moons: true,
    asteroids: true,
    comets: true,
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
  isSceneReady: false,
  isLoaderHidden: false,
  hasPlayedIntroAnimation: false, // Always play on page load
  isIntroAnimating: false,
  isLiveMode: true,

  setLiveMode: (isLiveMode) => set({ isLiveMode }),

  setDatetime: (value) =>
    set((state) => ({
      datetime: typeof value === "function" ? value(state.datetime) : value,
    })),
  setSpeed: (speed) => set({ speed }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setSelectedId: (selectedId) => set({ selectedId }),
  selectId: (selectedId) => set({ selectedId, focusId: selectedId }),
  setFocusId: (focusId) => set({ focusId }),
  setOverlayItems: (overlayItems) => set({ overlayItems }),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  toggleIcons: () => set((state) => ({ showIcons: !state.showIcons })),
  toggleOrbits: () => set((state) => ({ showOrbits: !state.showOrbits })),
  toggleShowStarfield: () =>
    set((state) => ({ showStarfield: !state.showStarfield })),
  toggleStarfieldImplementation: () =>
    set((state) => ({ useNASAStarfield: !state.useNASAStarfield })),
  toggleScaleMode: () =>
    set((state) => ({
      scaleMode: state.scaleMode === "didactic" ? "realistic" : "didactic",
    })),
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
    // Also keep the legacy key for backward compatibility if needed, or just rely on new one
    localStorage.setItem("hasSeenTutorial", "true");
    set({ showTutorial: false, tutorialCompletionStatus: status });
  },
  completeTutorial: () => {
    localStorage.setItem("tutorialStatus", "completed");
    localStorage.setItem("hasSeenTutorial", "true");
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
  setSceneReady: (ready) => set({ isSceneReady: ready }),
  setLoaderHidden: (hidden) => set({ isLoaderHidden: hidden }),
  setHasPlayedIntroAnimation: (played) =>
    set({ hasPlayedIntroAnimation: played }),
  setIsIntroAnimating: (animating) => set({ isIntroAnimating: animating }),
  debugMode: false,
  toggleDebugMode: () => set((state) => ({ debugMode: !state.debugMode })),
}));
