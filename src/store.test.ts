import { beforeEach, describe, expect, it, vi } from "vitest";

// Gotcha: this file imports `./store` BEFORE it stubs `localStorage`
// in `beforeEach`. By the time the import resolves, the persist
// middleware has already captured `storage: undefined` (because
// `typeof localStorage === "undefined"` in the Node test env at
// import time) and `migrateLegacyStorage` has already early-returned.
// So the assertions below do NOT exercise the persist runtime path —
// they validate pure state-shape behaviour. Migration and dedupe
// wrapper coverage lives in `store.persistMigration.test.ts`, which
// can take a `Storage` by parameter and avoid this ordering issue.
import { useStore } from "./store";

const createStorageMock = () => {
  let storage = new Map<string, string>();

  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage = new Map<string, string>();
    },
  };
};

const localStorageMock = createStorageMock();

const initialState = useStore.getState();

const resetStore = () => {
  useStore.setState(
    {
      ...initialState,
      displayedDatetime: new Date(initialState.displayedDatetime),
      focusHistory: [...initialState.focusHistory],
      overlayItems: [...initialState.overlayItems],
      visibility: { ...initialState.visibility },
      starfieldProviderStates: {
        hyg: { ...initialState.starfieldProviderStates.hyg },
        nasa: { ...initialState.starfieldProviderStates.nasa },
      },
    },
    true
  );
};

describe("store phase 4 regression guards", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.stubGlobal("localStorage", localStorageMock);
    resetStore();
  });

  it("keeps starfield, overlay visibility, and credits actions functional", () => {
    expect(useStore.getState().showStarfield).toBe(true);

    useStore.getState().toggleShowStarfield();
    expect(useStore.getState().showStarfield).toBe(false);

    useStore.getState().setStarfieldSource("nasa");
    expect(useStore.getState().starfieldSource).toBe("nasa");

    useStore.getState().toggleStarfieldImplementation();
    expect(useStore.getState().starfieldSource).toBe("hyg");

    useStore.getState().setSunRenderMode("procedural");
    expect(useStore.getState().sunRenderMode).toBe("procedural");
    // The persist middleware now owns localStorage writes via its
    // unified `atlas-orbital-store` JSON envelope; we no longer assert
    // the raw legacy key here — the state change above is the
    // behavior contract.

    expect(useStore.getState().visibility.asteroids).toBe(true);
    useStore.getState().toggleVisibility("asteroids");
    expect(useStore.getState().visibility.asteroids).toBe(false);

    expect(useStore.getState().showLabels).toBe(true);
    useStore.getState().toggleLabels();
    expect(useStore.getState().showLabels).toBe(false);

    // labelMode now defaults to "sdf" (see labelMode.ts); the contract
    // here is that the setter round-trips without touching showLabels.
    expect(useStore.getState().labelMode).toBe("sdf");
    useStore.getState().setLabelMode("html");
    expect(useStore.getState().labelMode).toBe("html");
    useStore.getState().setLabelMode("sdf");
    expect(useStore.getState().labelMode).toBe("sdf");

    expect(useStore.getState().showCredits).toBe(false);
    useStore.getState().toggleCredits();
    expect(useStore.getState().showCredits).toBe(true);
  });

  it("keeps focus history, tutorial replay, and debug actions functional", () => {
    useStore.setState({
      focusId: "earth",
      selectedId: "earth",
      focusHistory: ["mars"],
      showTutorial: false,
      tutorialStep: 4,
      tutorialCompletionStatus: "completed",
      hasPlayedIntroAnimation: true,
      debugMode: false,
    });

    useStore.getState().focusHome();
    expect(useStore.getState().focusId).toBe("sun");
    expect(useStore.getState().selectedId).toBeNull();
    expect(useStore.getState().focusHistory).toEqual(["mars", "earth"]);

    useStore.getState().focusBack();
    expect(useStore.getState().focusId).toBe("earth");
    expect(useStore.getState().selectedId).toBe("earth");
    expect(useStore.getState().focusHistory).toEqual(["mars"]);

    useStore.getState().reopenTutorial();
    expect(useStore.getState().showTutorial).toBe(true);
    expect(useStore.getState().tutorialStep).toBe(0);
    expect(useStore.getState().tutorialCompletionStatus).toBeNull();
    expect(useStore.getState().hasPlayedIntroAnimation).toBe(false);

    useStore.getState().toggleDebugMode();
    expect(useStore.getState().debugMode).toBe(true);

    useStore.getState().closeTutorial("skipped");
    expect(useStore.getState().showTutorial).toBe(false);
    expect(useStore.getState().tutorialCompletionStatus).toBe("skipped");
  });

  it("latches isSceneReady true and ignores spurious false resets", () => {
    expect(useStore.getState().isSceneReady).toBe(false);

    // Genuine readiness latches true.
    useStore.getState().setSceneReady(true);
    expect(useStore.getState().isSceneReady).toBe(true);

    // A spurious reset (asset-gate effect churn mid-boot) must NOT
    // retract readiness — this is what regressed the loader stage out
    // of "ready" and collapsed the meter to ~70 %.
    useStore.getState().setSceneReady(false);
    expect(useStore.getState().isSceneReady).toBe(true);
  });

  it("keeps tutorial completion clearing selection and persisting completion", () => {
    useStore.setState({
      selectedId: "earth",
      focusId: "earth",
      showTutorial: true,
      tutorialCompletionStatus: null,
    });

    useStore.getState().completeTutorial();

    expect(useStore.getState().showTutorial).toBe(false);
    expect(useStore.getState().selectedId).toBeNull();
    expect(useStore.getState().focusId).toBeNull();
    expect(useStore.getState().tutorialCompletionStatus).toBe("completed");
  });
});
