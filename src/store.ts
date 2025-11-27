import { create } from "zustand";

interface AppState {
  datetime: Date;
  speed: number;
  isPlaying: boolean;
  selectedId: string | null;
  focusId: string | null;
  showLabels: boolean;
  showIcons: boolean;
  showStarfield: boolean;
  showOrbits: boolean;
  scaleMode: "didactic" | "realistic";
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

  setDatetime: (date: Date | ((prev: Date) => Date)) => void;
  setSpeed: (speed: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setSelectedId: (id: string | null) => void;
  selectId: (id: string | null) => void;
  setFocusId: (id: string | null) => void;
  setOverlayItems: (
    items: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      isSmall: boolean;
      showLabel: boolean;
      showIcon: boolean;
    }>
  ) => void;
  toggleLabels: () => void;
  toggleIcons: () => void;
  toggleOrbits: () => void;
  toggleScaleMode: () => void;
  toggleShowStarfield: () => void;
  toggleVisibility: (category: keyof AppState["visibility"]) => void;
  closeTutorial: () => void;
  setTutorialStep: (step: number) => void;
  setSceneReady: (ready: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  datetime: new Date(),
  speed: 0.5,
  isPlaying: true,
  selectedId: "sun",
  focusId: "sun",
  showLabels: true,
  showIcons: true,
  showOrbits: true,
  scaleMode: "didactic",
  overlayItems: [],
  showStarfield: true,
  visibility: {
    planets: true,
    dwarfs: true,
    moons: true,
    asteroids: true,
    comets: true,
    tnos: true,
  },
  showTutorial: !localStorage.getItem("hasSeenTutorial"),
  tutorialStep: 0,
  isSceneReady: false,

  setDatetime: (value) =>
    set((state) => ({
      datetime: typeof value === "function" ? value(state.datetime) : value,
    })),
  setSpeed: (speed) => set({ speed }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setSelectedId: (selectedId: string | null) => set({ selectedId }),
  selectId: (selectedId) => set({ selectedId, focusId: selectedId }),
  setFocusId: (focusId) => set({ focusId }),
  setOverlayItems: (overlayItems) => set({ overlayItems }),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  toggleIcons: () => set((state) => ({ showIcons: !state.showIcons })),
  toggleOrbits: () => set((state) => ({ showOrbits: !state.showOrbits })),
  toggleShowStarfield: () =>
    set((state) => ({ showStarfield: !state.showStarfield })),
  toggleScaleMode: () =>
    set((state) => ({
      scaleMode: state.scaleMode === "didactic" ? "realistic" : "didactic",
    })),
  toggleVisibility: (category) =>
    set((state) => ({
      visibility: {
        ...state.visibility,
        [category]: !state.visibility[category],
      },
    })),
  closeTutorial: () => {
    localStorage.setItem("hasSeenTutorial", "true");
    set({ showTutorial: false });
  },
  setTutorialStep: (step) => set({ tutorialStep: step }),
  setSceneReady: (ready) => set({ isSceneReady: ready }),
}));
