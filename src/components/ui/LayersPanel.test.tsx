// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { useStore } from "../../store";
import { LayersPanel } from "./LayersPanel";

// jsdom doesn't implement matchMedia; useMediaQuery reads it directly.
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
    },
    true
  );
};

describe("LayersPanel", () => {
  beforeEach(() => {
    stubMatchMedia();
    resetStore();
  });

  it("renders the body category toggles when the view panel is active", () => {
    const setActivePanel = vi.fn();

    render(<LayersPanel activePanel="view" setActivePanel={setActivePanel} />);

    expect(
      screen.getByRole("button", { name: /asteroids/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /planets/i })
    ).toBeInTheDocument();
  });

  it("flips visibility.asteroids in the store when the Asteroids toggle is clicked", () => {
    const setActivePanel = vi.fn();

    render(<LayersPanel activePanel="view" setActivePanel={setActivePanel} />);

    expect(useStore.getState().visibility.asteroids).toBe(true);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /asteroids/i }));
    });

    expect(useStore.getState().visibility.asteroids).toBe(false);
  });

  it("invokes setActivePanel with null when the Close control is used", () => {
    const setActivePanel = vi.fn();

    render(<LayersPanel activePanel="view" setActivePanel={setActivePanel} />);

    // Two controls both carry aria-label "Close view panel": the
    // desktop rail tab and the explicit Close button in the header.
    // The header button is the one whose visible text is "Close".
    const closeButtons = screen.getAllByRole("button", {
      name: /close view panel/i,
    });
    const headerCloseButton = closeButtons.find(
      (node) => node.textContent?.trim().toLowerCase() === "close"
    );
    expect(headerCloseButton).toBeDefined();

    act(() => {
      fireEvent.click(headerCloseButton!);
    });

    expect(setActivePanel).toHaveBeenCalledWith(null);
  });
});
