// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { render } from "@testing-library/react";

import { useStore } from "../../store";
import { Sidebar } from "./Sidebar";

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

// T6.4 post-audit-of-audit (Codex 2026-05-08): when M6-D wired the
// HygStarPanel to `selectedId`, SearchBar HYG selection started
// dispatching `selectId("hyg:K")` which set `selectedId="hyg:K"`
// on the store. Sidebar happily set `isVisible=false` for those
// (`BODIES_BY_ID.get("hyg:K")` is undefined), but still passed the
// HYG ID into `useOrbitalCalculation` — the orbital engine has no
// provider for HYG IDs, throws "No orbital provider available",
// `resolveOrbitalResult` catches and forwards via `telemetry.error`
// → `console.error`. The panel was visually correct but every
// SearchBar HYG selection polluted the level:error console.
//
// Once `StarHoverPicker` also switches to `selectId` (same
// post-audit), the bug spreads to click. Both paths fixed by
// guarding the orbital call in Sidebar to receive "sun" for any
// non-curated selectedId.

describe("Sidebar — non-curated selectedId guard (T6.4 post-audit)", () => {
  beforeEach(() => {
    stubMatchMedia();
    resetStore();
  });

  afterEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it("does not emit console.error when selectedId is a HYG focus ID", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      useStore.setState({ selectedId: "hyg:0", focusId: "hyg:0" });
    });

    render(<Sidebar />);

    // Pre-fix: useOrbitalCalculation("hyg:0", undefined) →
    // calculatePosition throws → telemetry.error → console.error.
    // Post-fix: orbitalBodyId resolves to "sun", which is special-
    // cased to return zero-vector without provider lookup.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("does not emit console.error when selectedId is null (default state)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<Sidebar />);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("renders off-screen for HYG selectedId (mutually exclusive with HygStarPanel)", () => {
    useStore.setState({ selectedId: "hyg:0", focusId: "hyg:0" });

    const { container } = render(<Sidebar />);

    const panel = container.querySelector('[data-ui-framing="sidebar"]');
    expect(panel).not.toBeNull();
    // Desktop path (matchMedia stub returns matches=false): when
    // not visible, classNames include `-translate-x-[120%]` and
    // `opacity-0` which together hide the panel via CSS transitions.
    // HygStarPanel takes over the active sidepanel role for HYG IDs.
    const cls = panel?.className ?? "";
    expect(cls).toMatch(/-translate-x-\[120%\]/);
    expect(cls).toMatch(/opacity-0/);
  });

  it("does not emit console.error when selectedId is an unknown non-HYG string", () => {
    // Defensive: any selectedId that BODIES_BY_ID can't resolve
    // (e.g. a stale ID after a body removal, or a typo in test
    // fixtures) should fall through the same guard.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      useStore.setState({ selectedId: "non-existent-body-id", focusId: null });
    });

    render(<Sidebar />);

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
