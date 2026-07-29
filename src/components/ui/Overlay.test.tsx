// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStore } from "../../store";
import { Overlay } from "./Overlay";

vi.mock("../../hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));

vi.mock("./TopBar", () => ({
  TopBar: () => <div data-testid="top-bar" />,
}));

vi.mock("./Sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

vi.mock("./Timeline", () => ({
  Timeline: () => <div data-testid="timeline" />,
}));

vi.mock("./KeyboardShortcutsModal", () => ({
  KeyboardShortcutsModal: () => <div data-testid="shortcuts-modal" />,
}));

vi.mock("./ViewportFramingTracker", () => ({
  ViewportFramingTracker: () => null,
}));

vi.mock("./SearchBar", () => ({
  SearchBar: ({
    activePanel,
  }: {
    activePanel: "search" | "view" | "display" | "a11y" | null;
  }) => (
    <div data-testid="search-panel-state">
      {activePanel === "search" ? "open" : "closed"}
    </div>
  ),
}));

vi.mock("./LayersPanel", () => ({
  LayersPanel: () => <div data-testid="layers-panel" />,
}));

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
      showTutorial: false,
      showCredits: false,
      gearOpen: false,
      shortcutsModalOpen: false,
    },
    true
  );
};

describe("Overlay", () => {
  beforeEach(() => {
    resetStore();
  });

  it("opens Search through the global slash hotkey", () => {
    render(<Overlay />);

    fireEvent.keyDown(window, { key: "/" });

    expect(screen.getByTestId("search-panel-state")).toHaveTextContent("open");
  });

  it("opens Search through Ctrl+K as the same global shortcut", () => {
    render(<Overlay />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(screen.getByTestId("search-panel-state")).toHaveTextContent("open");
  });
});
