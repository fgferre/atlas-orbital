// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStore } from "../../store";
import { GearPopover } from "./GearPopover";

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
      gearOpen: false,
      shortcutsModalOpen: false,
      showCredits: false,
      debugMode: false,
    },
    true
  );
};

describe("GearPopover", () => {
  beforeEach(() => {
    stubMatchMedia();
    resetStore();
  });

  it("does not render when gearOpen is false", () => {
    render(<GearPopover />);
    expect(screen.queryByTestId("gear-popover")).not.toBeInTheDocument();
  });

  it("renders the three sections with their action controls when open", () => {
    act(() => {
      useStore.setState({ gearOpen: true });
    });
    render(<GearPopover />);
    expect(screen.getByTestId("gear-popover")).toBeInTheDocument();
    // Identify each section by the action control it carries (help: Replay
    // Tutorial + Keyboard Shortcuts; about: Mission Report; developer:
    // Debug Logging toggle). Matching labels directly is ambiguous because
    // the breadcrumb "help · about · developer" also includes those words.
    expect(
      screen.getByRole("button", { name: /replay tutorial/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mission report/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /debug logging/i })
    ).toBeInTheDocument();
  });

  it("closes the popover and launches CreditsModal when Mission Report is clicked", () => {
    // §4.7 contract + Codex PR 2 review: popover must close BEFORE
    // CreditsModal opens to avoid modal-inside-popover focus stacking.
    act(() => {
      useStore.setState({ gearOpen: true, showCredits: false });
    });
    render(<GearPopover />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /mission report/i }));
    });

    const state = useStore.getState();
    expect(state.gearOpen).toBe(false);
    expect(state.showCredits).toBe(true);
  });

  it("hands off to KeyboardShortcutsModal from Help and closes the popover", () => {
    act(() => {
      useStore.setState({ gearOpen: true, shortcutsModalOpen: false });
    });
    render(<GearPopover />);

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /keyboard shortcuts/i })
      );
    });

    const state = useStore.getState();
    expect(state.gearOpen).toBe(false);
    expect(state.shortcutsModalOpen).toBe(true);
  });

  it("toggles debugMode when the Developer switch is clicked", () => {
    act(() => {
      useStore.setState({ gearOpen: true, debugMode: false });
    });
    render(<GearPopover />);

    act(() => {
      fireEvent.click(screen.getByRole("switch", { name: /debug logging/i }));
    });

    expect(useStore.getState().debugMode).toBe(true);
  });

  describe("Integrations / Wikipedia toggle (M6-G)", () => {
    it("renders the Wikipedia switch reflecting the current store value", () => {
      act(() => {
        useStore.setState({
          gearOpen: true,
          wikipediaIntegrationEnabled: true,
        });
      });
      render(<GearPopover />);

      const sw = screen.getByRole("switch", {
        name: /wikipedia about-text/i,
      });
      expect(sw).toBeInTheDocument();
      expect(sw).toHaveAttribute("aria-checked", "true");
      expect(sw.textContent).toMatch(/On/);
    });

    it("flips the store on click + reflects 'Off' immediately", () => {
      act(() => {
        useStore.setState({
          gearOpen: true,
          wikipediaIntegrationEnabled: true,
        });
      });
      render(<GearPopover />);

      const sw = screen.getByRole("switch", {
        name: /wikipedia about-text/i,
      });
      act(() => {
        fireEvent.click(sw);
      });

      expect(useStore.getState().wikipediaIntegrationEnabled).toBe(false);
      expect(sw).toHaveAttribute("aria-checked", "false");
      expect(sw.textContent).toMatch(/Off/);
    });

    it("flips back ON when re-clicked from the Off state", () => {
      act(() => {
        useStore.setState({
          gearOpen: true,
          wikipediaIntegrationEnabled: false,
        });
      });
      render(<GearPopover />);

      const sw = screen.getByRole("switch", {
        name: /wikipedia about-text/i,
      });
      expect(sw).toHaveAttribute("aria-checked", "false");

      act(() => {
        fireEvent.click(sw);
      });

      expect(useStore.getState().wikipediaIntegrationEnabled).toBe(true);
      expect(sw).toHaveAttribute("aria-checked", "true");
    });
  });
});
