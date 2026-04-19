// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStore } from "../../store";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";

const stubMatchMedia = () => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

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
      shortcutsModalOpen: false,
    },
    true
  );
};

describe("KeyboardShortcutsModal", () => {
  beforeEach(() => {
    stubMatchMedia();
    resetStore();
  });

  it("does not render when shortcutsModalOpen is false", () => {
    render(<KeyboardShortcutsModal />);
    expect(
      screen.queryByTestId("keyboard-shortcuts-modal")
    ).not.toBeInTheDocument();
  });

  it("renders the shortcut table when open", () => {
    act(() => {
      useStore.setState({ shortcutsModalOpen: true });
    });
    render(<KeyboardShortcutsModal />);
    expect(screen.getByTestId("keyboard-shortcuts-modal")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /keyboard shortcuts/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/focus search/i)).toBeInTheDocument();
    expect(screen.getByText(/focus home/i)).toBeInTheDocument();
    expect(screen.getByText(/focus back/i)).toBeInTheDocument();
    expect(screen.getByText(/replay tutorial/i)).toBeInTheDocument();
  });

  it("clears shortcutsModalOpen when Close is clicked", () => {
    act(() => {
      useStore.setState({ shortcutsModalOpen: true });
    });
    render(<KeyboardShortcutsModal />);

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /close keyboard shortcuts/i })
      );
    });

    expect(useStore.getState().shortcutsModalOpen).toBe(false);
  });
});
