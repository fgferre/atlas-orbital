import { create } from "zustand";

interface AppState {
  datetime: Date;
  speed: number;
  isPlaying: boolean;
  selectedId: string | null;
  focusId: string | null;
  showLabels: boolean;
  showOrbits: boolean;
  scaleMode: "didactic" | "realistic";
  overlayItems: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    isSmall: boolean;
  }>;

  setDatetime: (date: Date | ((prev: Date) => Date)) => void;
  setSpeed: (speed: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  selectId: (id: string | null) => void;
  setFocusId: (id: string | null) => void;
  setOverlayItems: (
    items: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      isSmall: boolean;
    }>
  ) => void;
  toggleLabels: () => void;
  toggleOrbits: () => void;
  toggleScaleMode: () => void;
}

export const useStore = create<AppState>((set) => ({
  datetime: new Date(),
  speed: 0.5,
  isPlaying: true,
  selectedId: "sun",
  focusId: "sun",
  showLabels: true,
  showOrbits: true,
  scaleMode: "didactic",
  overlayItems: [],

  setDatetime: (value) =>
    set((state) => ({
      datetime: typeof value === "function" ? value(state.datetime) : value,
    })),
  setSpeed: (speed) => set({ speed }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  selectId: (selectedId) => set({ selectedId, focusId: selectedId }),
  setFocusId: (focusId) => set({ focusId }),
  setOverlayItems: (overlayItems) => set({ overlayItems }),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  toggleOrbits: () => set((state) => ({ showOrbits: !state.showOrbits })),
  toggleScaleMode: () =>
    set((state) => ({
      scaleMode: state.scaleMode === "didactic" ? "realistic" : "didactic",
    })),
}));
