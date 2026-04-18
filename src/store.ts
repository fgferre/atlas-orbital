import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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
import {
  createDedupedStorage,
  migrateLegacyStorage,
  PERSIST_KEY,
  PERSIST_VERSION,
  type PersistedSlice,
} from "./store.persistMigration";

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

// ─── Persist configuration ──────────────────────────────────────────────────
// The migration helper, dedupe wrapper, and key/version constants live
// in `./store.persistMigration` so they can be unit-tested without
// dragging in the module-level side effects below (Zustand store
// creation, simulationClock bridge). Comments at that file document
// the contract; here we just wire everything up.
//
// `migrateLegacyStorage()` runs synchronously at module load — before
// `persist(...)` evaluates — so rehydration picks up the migrated
// envelope without racing against the pre-persist per-key layout.
migrateLegacyStorage();

// ─── Store definition ───────────────────────────────────────────────────────

export const useStore = create<AppState>()(
  persist(
    (set) => ({
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
      // Defaults overwritten by the persist middleware's rehydration
      // step when a previously-saved (or legacy-migrated) value is
      // available in localStorage.
      qualityMode: "auto",
      sunRenderMode: "auto",
      visualPreset: "DEEP_SPACE",
      autoPresetEnabled: true,
      focusHistory: [],
      overlayItems: [],
      viewportFraming:
        typeof window !== "undefined"
          ? createDefaultViewportFramingState(
              window.innerWidth,
              window.innerHeight
            )
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
      // Derived from `tutorialCompletionStatus` after rehydration — see
      // `onRehydrateStorage` below. The `true` default is only correct
      // for a brand-new user; returning visitors get it flipped to
      // `false` when their saved status is non-null.
      showTutorial: true,
      tutorialCompletionStatus: null,
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
        // Delegate to the clock so authoritative simulation time moves
        // too. `seek()` fires a UI tick synchronously, which the bridge
        // mirrors into `displayedDatetime`. The `set()` fallback below
        // covers the edge case where the bridge is disabled (tests /
        // HMR teardown).
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
          state.viewportFraming.viewportWidth ===
            viewportFraming.viewportWidth &&
          state.viewportFraming.viewportHeight ===
            viewportFraming.viewportHeight
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
          state.starfieldSource === starfieldSource
            ? state
            : { starfieldSource }
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
      toggleCredits: () =>
        set((state) => ({ showCredits: !state.showCredits })),
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
      // Persistence of `qualityMode`, `sunRenderMode`, and
      // `tutorialCompletionStatus` is handled entirely by the persist
      // middleware below — these setters no longer write to
      // localStorage directly.
      setQualityMode: (qualityMode) =>
        set((state) =>
          state.qualityMode === qualityMode ? state : { qualityMode }
        ),
      setSunRenderMode: (sunRenderMode) =>
        set((state) =>
          state.sunRenderMode === sunRenderMode ? state : { sunRenderMode }
        ),
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
      closeTutorial: (status = "completed") =>
        set({ showTutorial: false, tutorialCompletionStatus: status }),
      completeTutorial: () =>
        set({
          showTutorial: false,
          tutorialCompletionStatus: "completed",
          selectedId: null,
          focusId: null,
        }),
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
    }),
    {
      name: PERSIST_KEY,
      version: PERSIST_VERSION,
      // In SSR / node-vitest there is no `localStorage`; pass
      // `undefined` straight through so the persist middleware
      // degrades to in-memory only instead of crashing on
      // `getItem`/`setItem` against a null storage.
      //
      // `createDedupedStorage` wraps `localStorage.setItem` so that
      // it no-ops when the serialised value is identical to the
      // previous write. Zustand 5's persist calls `setItem` on every
      // `set()` regardless of whether `partialize`'s output changed,
      // and this store mutates multiple times per second from the
      // simulationClock UI tick and overlay updates — without the
      // dedupe we'd be firing a synchronous `localStorage.setItem`
      // at 4–60 Hz writing the same three-field envelope over and
      // over. The wrapper is in `./store.persistMigration` and is
      // covered by `store.persistMigration.test.ts`.
      storage:
        typeof localStorage === "undefined"
          ? undefined
          : createJSONStorage(() => createDedupedStorage(localStorage)),
      partialize: (state): PersistedSlice => ({
        qualityMode: state.qualityMode,
        sunRenderMode: state.sunRenderMode,
        tutorialCompletionStatus: state.tutorialCompletionStatus,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn("[store] persist rehydrate error:", error);
          return;
        }
        if (!state) return;
        // `showTutorial` is derived, not persisted. A returning user
        // (non-null completion status) should NOT see the tutorial
        // overlay on boot; a brand-new user (null status) should.
        state.showTutorial = state.tutorialCompletionStatus === null;
      },
    }
  )
);

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
