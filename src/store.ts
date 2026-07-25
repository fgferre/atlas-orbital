import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { VisualPresetType } from "./config/visualPresets";
import type { ViewportFramingState } from "./lib/camera/effectiveViewport";
import { DEFAULT_LABEL_MODE, type LabelMode } from "./lib/labelMode";
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
  migrate,
  migrateLegacyStorage,
  PERSIST_KEY,
  PERSIST_VERSION,
  type PersistedSlice,
} from "./store.persistMigration";
import {
  DEFAULT_GRAPHICS_STATE,
  getDefaultAccessibilityState,
  type AccessibilityState,
  type GraphicsBasePreset,
  type GraphicsOverrides,
  type GraphicsPresetName,
} from "./store/graphicsSlice";
import { telemetry } from "./lib/telemetry";

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
  /**
   * T4.5-β — body label rendering mode. `"html"` keeps the existing
   * `PlanetOverlay` HTML path (keyboard focus + screen reader
   * compatible — default for a11y). `"sdf"` mounts drei `<Text>`
   * inside the canvas, mirroring Gaia's `font.fragment.glsl` +
   * `LabelEntityRenderSystem.renderCelestial` pipeline. The icon
   * buttons in `PlanetOverlay` remain the a11y surface in both
   * modes (the 3D text itself is not focusable / screen-readable).
   */
  labelMode: LabelMode;
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
  /**
   * Master toggle for the single square ecliptic floor grid (Workflow
   * #2b redesign, 2026-06-17). The store key is kept verbatim for
   * persist-migration safety; the UI copy reads "Grid". The grid renders
   * one ecliptic floor — the 3 switchable orientation frames (ecliptic /
   * equatorial / galactic) and the standing projection-line layer were
   * removed in the redesign (the decade scale label + extent disk ride
   * this same toggle).
   */
  showEclipticGrid: boolean;
  /**
   * T4.2-β — read-only signal flipped to `true` when the camera
   * crosses Gaia's surface-mode threshold (`distFromFocus <
   * focusRadius × 2.5 / fovFactor` AND focus is a planet).
   * Written from `CameraController`'s focus useFrame; consumers
   * (UI indicators, future rotation-handler swap) read it. Setter
   * dedups so per-frame writes only re-render React when the flag
   * actually flips (typically once per focus transit, not per
   * frame).
   */
  surfaceModeActive: boolean;
  showProgradeVector: boolean;
  scaleMode: "didactic" | "realistic";
  qualityMode: QualityMode;
  /**
   * Wave α Commit 3 (R2 Wave 1) graphics slice. `qualityMode` above
   * stays as a compat field that the old 28 consumer sites read via
   * `projectToLegacyShape` in `qualityProfile.ts`; Wave 6 retires it.
   */
  graphicsPreset: GraphicsPresetName;
  graphicsAutoMode: boolean;
  graphicsOverrides: GraphicsOverrides;
  customBase: GraphicsBasePreset;
  /** Accessibility state — sibling of the graphics slice. */
  accessibility: AccessibilityState;
  sunRenderMode: SunRenderMode;
  visualPreset: VisualPresetType;
  autoPresetEnabled: boolean;
  focusHistory: string[];
  overlayItems: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    /**
     * Screen-pixel offset of the label from the icon, chosen by
     * `OverlayPositionTracker`'s placement search. Both label renderers
     * (`PlanetOverlay` HTML, `PlanetLabels3D` SDF) must apply it, or a
     * nudged label lands somewhere the arbitration did not reserve.
     */
    labelDx: number;
    labelDy: number;
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
  setLabelMode: (mode: LabelMode) => void;
  toggleOrbits: () => void;
  toggleDeclutterOrbits: () => void;
  toggleEclipticGrid: () => void;
  setSurfaceModeActive: (active: boolean) => void;
  toggleProgradeVector: () => void;
  toggleScaleMode: () => void;
  setQualityMode: (mode: QualityMode) => void;
  setGraphicsPreset: (preset: GraphicsPresetName) => void;
  setGraphicsAutoMode: (on: boolean) => void;
  setGraphicsOverride: <K extends keyof GraphicsOverrides>(
    key: K,
    value: GraphicsOverrides[K]
  ) => void;
  resetGraphicsOverrides: () => void;
  setAccessibility: <K extends keyof AccessibilityState>(
    key: K,
    value: AccessibilityState[K]
  ) => void;
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
  /**
   * Menu structure v3.1 PR 3: UI state for the Gear popover anchored
   * on the TopBar `[⚙]` button. Lives outside `RightControlPanelId`
   * so Gear can coexist with a rail panel — they're non-competing
   * concerns (gear = meta/help, rail = task-time controls).
   */
  gearOpen: boolean;
  setGearOpen: (open: boolean) => void;
  /**
   * Menu structure v3.1 PR 3: UI state for the KeyboardShortcutsModal.
   * Independent of `gearOpen` — can be triggered either by the `?`
   * hotkey or from Gear > Help.
   */
  shortcutsModalOpen: boolean;
  setShortcutsModalOpen: (open: boolean) => void;
  /**
   * Gates the Wikipedia "About" section in `HygStarPanel`.
   * Default `true`; persisted via `partialize` (M6-G shipped the
   * Gear-popover toggle that flips it). `coerceToV1` defaults to
   * `true` for envelopes that predate this field.
   */
  wikipediaIntegrationEnabled: boolean;
  setWikipediaIntegrationEnabled: (enabled: boolean) => void;
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
      labelMode: DEFAULT_LABEL_MODE,
      showOrbits: true,
      declutterOrbits: true,
      showEclipticGrid: true,
      surfaceModeActive: false,
      showProgradeVector: true,
      scaleMode: "didactic",
      // Defaults overwritten by the persist middleware's rehydration
      // step when a previously-saved (or legacy-migrated) value is
      // available in localStorage.
      qualityMode: "auto",
      // Wave α Commit 3 defaults. Rehydrated from persist if available
      // (migrate v0 → v1 derives these from the legacy qualityMode so
      // no user preference is lost); first-boot users get auto-detect.
      graphicsPreset: DEFAULT_GRAPHICS_STATE.graphicsPreset,
      graphicsAutoMode: DEFAULT_GRAPHICS_STATE.graphicsAutoMode,
      graphicsOverrides: DEFAULT_GRAPHICS_STATE.graphicsOverrides,
      customBase: DEFAULT_GRAPHICS_STATE.customBase,
      accessibility: getDefaultAccessibilityState(),
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
      setLabelMode: (labelMode) =>
        set((state) => (state.labelMode === labelMode ? state : { labelMode })),
      toggleOrbits: () => set((state) => ({ showOrbits: !state.showOrbits })),
      toggleDeclutterOrbits: () =>
        set((state) => ({ declutterOrbits: !state.declutterOrbits })),
      toggleEclipticGrid: () =>
        set((state) => ({ showEclipticGrid: !state.showEclipticGrid })),
      setSurfaceModeActive: (surfaceModeActive) =>
        set((state) =>
          state.surfaceModeActive === surfaceModeActive
            ? state
            : { surfaceModeActive }
        ),
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
      // Wave α Commit 3 graphics-slice setters.
      //
      // setGraphicsPreset — choosing a named preset clears overrides
      // and pins that preset as the new customBase (so "Reset to X"
      // stays meaningful if the user immediately starts tweaking).
      // Selecting "custom" without overrides is a no-op (the UI flips
      // to custom automatically when any override is set).
      setGraphicsPreset: (graphicsPreset) =>
        set((state) => {
          if (state.graphicsPreset === graphicsPreset) return state;
          if (graphicsPreset === "custom") {
            return { graphicsPreset };
          }
          return {
            graphicsPreset,
            customBase: graphicsPreset,
            graphicsOverrides: {},
          };
        }),
      // setGraphicsAutoMode — enabling auto clears overrides + pins
      // customBase = "high" as a safe placeholder (the resolver picks
      // the actual tier from device signals, ignoring the label).
      setGraphicsAutoMode: (on) =>
        set((state) => {
          if (state.graphicsAutoMode === on) return state;
          if (on) {
            return {
              graphicsAutoMode: true,
              graphicsOverrides: {},
            };
          }
          return { graphicsAutoMode: false };
        }),
      // setGraphicsOverride — the design §5 "flip to custom" rule. Any
      // override write flips graphicsPreset to "custom" and records
      // customBase = the preset that WAS active (so the Reset button
      // surfaces the right target). Passing undefined clears that
      // override field; if the resulting record is empty AND the
      // preset was "custom", flip back to the customBase preset
      // (reverse of the flip — keeps the Custom label honest).
      setGraphicsOverride: (key, value) =>
        set((state) => {
          const nextOverrides: GraphicsOverrides = {
            ...state.graphicsOverrides,
          };
          if (value === undefined) {
            delete nextOverrides[key];
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (nextOverrides as any)[key] = value;
          }
          const anyOverride = Object.values(nextOverrides).some(
            (v) => v !== undefined
          );
          if (anyOverride) {
            if (state.graphicsPreset === "custom") {
              return { graphicsOverrides: nextOverrides };
            }
            return {
              graphicsOverrides: nextOverrides,
              customBase: state.graphicsPreset,
              graphicsPreset: "custom",
            };
          }
          // Empty overrides — reset back to the base preset if we
          // were showing Custom.
          if (state.graphicsPreset === "custom") {
            return {
              graphicsOverrides: nextOverrides,
              graphicsPreset: state.customBase,
            };
          }
          return { graphicsOverrides: nextOverrides };
        }),
      // resetGraphicsOverrides — button in the Display panel.
      resetGraphicsOverrides: () =>
        set((state) => ({
          graphicsOverrides: {},
          graphicsPreset:
            state.graphicsPreset === "custom"
              ? state.customBase
              : state.graphicsPreset,
        })),
      setAccessibility: (key, value) =>
        set((state) => ({
          accessibility: { ...state.accessibility, [key]: value },
        })),
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
      // One-way latch: scene-ready never retracts within a session. The
      // boot pipeline only ever needs to flip this true (SceneReadyChecker's
      // frame counter or its 8 s safety hatch). Spurious `false` writes —
      // from over-broad asset-gate effect re-runs/cleanups churning
      // `criticalAssetsReady` mid-boot — would otherwise regress the loader
      // stage out of "ready", re-flashing "Warming up renderer" and
      // collapsing the meter band to ~70 %. The loader is one-shot per
      // session, so a flag that only ever climbs to ready is correct, and
      // it makes the regression structurally impossible regardless of which
      // effect churns. `false` is ignored by design.
      setSceneReady: (ready) =>
        set((state) =>
          !ready || state.isSceneReady ? state : { isSceneReady: true }
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
      gearOpen: false,
      setGearOpen: (gearOpen) => set({ gearOpen }),
      shortcutsModalOpen: false,
      setShortcutsModalOpen: (shortcutsModalOpen) =>
        set({ shortcutsModalOpen }),
      wikipediaIntegrationEnabled: true,
      setWikipediaIntegrationEnabled: (wikipediaIntegrationEnabled) =>
        set({ wikipediaIntegrationEnabled }),
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
      // Wave α Commit 3 — expanded from 3 to 8 fields. `qualityMode`
      // stays as a compat field (read by `qualityProfile.ts` shim
      // during the transition; Wave 6 retires it). `customBase` is
      // persisted despite being absent from design §6's snippet
      // because the impl-plan's "Custom-base state loss" risk
      // requires it — without persistence, "Reset to High" loses
      // meaning across reloads.
      partialize: (state): PersistedSlice => ({
        qualityMode: state.qualityMode,
        sunRenderMode: state.sunRenderMode,
        tutorialCompletionStatus: state.tutorialCompletionStatus,
        graphicsPreset: state.graphicsPreset,
        graphicsAutoMode: state.graphicsAutoMode,
        graphicsOverrides: state.graphicsOverrides,
        customBase: state.customBase,
        accessibility: state.accessibility,
        wikipediaIntegrationEnabled: state.wikipediaIntegrationEnabled,
      }),
      migrate: (persistedState, version) => migrate(persistedState, version),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          telemetry.warn("boot", "store persist rehydrate error", { error });
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

// (3.5) Test-only: if Playwright set `window.__ATLAS_TEST_FREEZE__`
// before this module evaluated, pin clock + store to a fixed epoch so
// visual-diff specs capture a byte-stable frame. Wave α's identity
// gate in e2e/boot.spec.ts / focus.spec.ts / postprocessing.spec.ts
// depends on the simulation clock being stationary across runs;
// without this, wall-clock drift alone guarantees pixel diff > 0.1%.
// Production code never sets the flag.
//
// T6.4-M2.5 S7 — under the same flag, expose the store on
// `window.__ATLAS_TEST_STORE__` so the HYG focus e2e spec can call
// `setFocusId("hyg:K")` directly. The catalog-click path requires
// raycasting against star projections that depend on the live
// camera state (flaky at test cadence); imperative store access is
// the deterministic alternative. Production code never reads the
// flag, so no surface change for end users.
if (
  typeof window !== "undefined" &&
  (window as unknown as { __ATLAS_TEST_FREEZE__?: boolean })
    .__ATLAS_TEST_FREEZE__
) {
  const frozenEpoch = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
  useStore.setState({
    isPlaying: false,
    isLiveMode: false,
    displayedDatetime: frozenEpoch,
  });
  simulationClock.setIsPlaying(false);
  simulationClock.setIsLiveMode(false);
  simulationClock.seek(frozenEpoch);
  (
    window as unknown as { __ATLAS_TEST_STORE__?: typeof useStore }
  ).__ATLAS_TEST_STORE__ = useStore;
}

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
