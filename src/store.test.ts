import { beforeEach, describe, expect, it, vi } from "vitest";

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
      datetime: new Date(initialState.datetime),
      focusHistory: [...initialState.focusHistory],
      overlayItems: [...initialState.overlayItems],
      visibility: { ...initialState.visibility },
      starfieldProviderStates: {
        tycho2: { ...initialState.starfieldProviderStates.tycho2 },
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
    expect(useStore.getState().starfieldSource).toBe("tycho2");

    expect(useStore.getState().visibility.comets).toBe(true);
    useStore.getState().toggleVisibility("comets");
    expect(useStore.getState().visibility.comets).toBe(false);

    expect(useStore.getState().showLabels).toBe(true);
    useStore.getState().toggleLabels();
    expect(useStore.getState().showLabels).toBe(false);

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
    expect(localStorageMock.getItem("tutorialStatus")).toBe("skipped");
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
    expect(localStorageMock.getItem("tutorialStatus")).toBe("completed");
  });
});
