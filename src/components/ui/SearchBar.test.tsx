// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { useStore } from "../../store";
import { SearchBar } from "./SearchBar";

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

describe("SearchBar", () => {
  beforeEach(() => {
    stubMatchMedia();
    resetStore();
  });

  it("renders Quick Jumps when the panel opens with an empty query", () => {
    const setActivePanel = vi.fn();

    render(<SearchBar activePanel="search" setActivePanel={setActivePanel} />);

    expect(screen.getByText(/Quick Jumps/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^mars$/i })).toBeInTheDocument();
  });

  it("surfaces a Mars result when the query is 'mars'", () => {
    const setActivePanel = vi.fn();

    render(<SearchBar activePanel="search" setActivePanel={setActivePanel} />);

    const input = screen.getByRole("combobox");
    act(() => {
      fireEvent.change(input, { target: { value: "mars" } });
    });

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((node) => /mars/i.test(node.textContent ?? ""))).toBe(
      true
    );
  });

  it("calls selectId and closes the panel when a result is clicked", () => {
    const setActivePanel = vi.fn();
    const selectIdSpy = vi.fn();
    useStore.setState({ selectId: selectIdSpy });

    render(<SearchBar activePanel="search" setActivePanel={setActivePanel} />);

    act(() => {
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "mars" },
      });
    });

    const marsOption = screen
      .getAllByRole("option")
      .find((node) => /mars/i.test(node.textContent ?? ""));
    expect(marsOption).toBeDefined();

    act(() => {
      fireEvent.click(marsOption!);
    });

    expect(selectIdSpy).toHaveBeenCalledWith("mars");
    expect(setActivePanel).toHaveBeenCalledWith(null);
  });
});
