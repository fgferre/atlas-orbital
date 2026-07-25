// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useStore } from "../../store";
import { ContextLine } from "./ContextLine";

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
      selectedId: null,
      focusId: null,
    },
    true
  );
};

describe("ContextLine", () => {
  beforeEach(resetStore);

  // The reason this replaced FocusChip: it must answer "where am I" in
  // EVERY state, not only when the sidebar happens to be closed.
  it("always renders, naming the ambient context when nothing is focused", () => {
    render(<ContextLine />);
    expect(screen.getByTestId("context-line")).toHaveTextContent(
      /solar system/i
    );
  });

  it("names the focused body even while the Sidebar is open", () => {
    act(() => {
      useStore.setState({ selectedId: "earth", focusId: "earth" });
    });
    render(<ContextLine />);
    expect(screen.getByTestId("context-line")).toHaveTextContent(/earth/i);
  });

  it("says Star for a HYG focus instead of guessing a body", () => {
    act(() => {
      useStore.setState({ selectedId: null, focusId: "hyg:42" });
    });
    render(<ContextLine />);
    expect(screen.getByTestId("context-line")).toHaveTextContent(/star/i);
  });

  it("is only clickable when there is a panel to re-open", () => {
    act(() => {
      useStore.setState({ selectedId: "mars", focusId: "mars" });
    });
    const { unmount } = render(<ContextLine />);
    expect(screen.getByTestId("context-line").tagName).not.toBe("BUTTON");
    unmount();

    act(() => {
      useStore.setState({ selectedId: null, focusId: "mars" });
    });
    render(<ContextLine />);
    expect(screen.getByTestId("context-line").tagName).toBe("BUTTON");
  });

  it("re-opens the Sidebar via setSelectedId without touching focusHistory", () => {
    // Carried over from FocusChip: `selectId` would push "mars" onto the
    // stack here. Re-surfacing a panel for an already-focused body is not a
    // navigation event (Codex PR 2 review).
    act(() => {
      useStore.setState({
        selectedId: null,
        focusId: "mars",
        focusHistory: ["earth"],
      });
    });
    render(<ContextLine />);

    act(() => {
      fireEvent.click(screen.getByTestId("context-line"));
    });

    const state = useStore.getState();
    expect(state.selectedId).toBe("mars");
    expect(state.focusId).toBe("mars");
    expect(state.focusHistory).toEqual(["earth"]);
  });
});
