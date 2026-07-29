// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { useStore } from "../../store";
import { Timeline } from "./Timeline";

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
      },
    },
    true
  );
};

describe("Timeline", () => {
  beforeEach(() => {
    stubMatchMedia();
    resetStore();
  });

  it("shows the Pause control when playback is active", () => {
    useStore.setState({ isPlaying: true });

    render(<Timeline />);

    expect(
      screen.getByRole("button", { name: /pause timeline/i })
    ).toBeInTheDocument();
  });

  it("shows the Play control when playback is paused", () => {
    useStore.setState({ isPlaying: false });

    render(<Timeline />);

    expect(
      screen.getByRole("button", { name: /play timeline/i })
    ).toBeInTheDocument();
  });

  it("toggles isPlaying via the store when the play/pause button is clicked", () => {
    const setIsPlayingSpy = vi.fn();
    useStore.setState({ isPlaying: true, setIsPlaying: setIsPlayingSpy });

    render(<Timeline />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /pause timeline/i }));
    });

    expect(setIsPlayingSpy).toHaveBeenCalledWith(false);
  });
});
