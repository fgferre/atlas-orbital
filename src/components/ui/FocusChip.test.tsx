// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useStore } from "../../store";
import { FocusChip } from "./FocusChip";

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

describe("FocusChip", () => {
  beforeEach(() => {
    resetStore();
  });

  it("is not rendered when no body is focused", () => {
    const { container } = render(<FocusChip />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("focus-chip")).not.toBeInTheDocument();
  });

  it("is not rendered while the Sidebar is open (selectedId is set)", () => {
    act(() => {
      useStore.setState({ selectedId: "earth", focusId: "earth" });
    });
    render(<FocusChip />);
    expect(screen.queryByTestId("focus-chip")).not.toBeInTheDocument();
  });

  it("renders when the Sidebar is closed but the camera is still focused", () => {
    act(() => {
      useStore.setState({ selectedId: null, focusId: "mars" });
    });
    render(<FocusChip />);
    const chip = screen.getByTestId("focus-chip");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent(/mars/i);
  });

  it("re-opens the Sidebar via setSelectedId without touching focusHistory", () => {
    // Seed focusHistory with a value to guard against accidental mutation.
    act(() => {
      useStore.setState({
        selectedId: null,
        focusId: "mars",
        focusHistory: ["earth"],
      });
    });
    render(<FocusChip />);

    act(() => {
      fireEvent.click(screen.getByTestId("focus-chip"));
    });

    const state = useStore.getState();
    expect(state.selectedId).toBe("mars");
    expect(state.focusId).toBe("mars");
    // Critical: the click must not mutate focusHistory (Codex PR 2
    // review). `selectId` would have pushed "mars" here; `setSelectedId`
    // leaves the stack untouched.
    expect(state.focusHistory).toEqual(["earth"]);
  });
});
