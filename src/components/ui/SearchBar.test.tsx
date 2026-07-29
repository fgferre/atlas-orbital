// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import {
  encodeHygCatalog,
  parseHygBinaryBuffer,
  type HygCatalogData,
  type HygStarInput,
} from "../../utils/hygBinary";
import * as starfieldModule from "../../lib/starfield";
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

  it("stacks the search icon and vertical label in one internal column", () => {
    const setActivePanel = vi.fn();

    render(<SearchBar activePanel={null} setActivePanel={setActivePanel} />);

    const trigger = screen.getByRole("button", { name: /open search panel/i });
    expect(trigger.firstElementChild).toHaveClass("flex-col");
  });
});

describe("SearchBar / HYG matches (M6-C)", () => {
  // M6-C wires the HYG catalog into the search box. These tests prime
  // the cached-catalog path with a tiny in-memory v3 binary so the
  // hook hits the cache (not the real fetch) and the HYG section
  // renders with predictable indices.
  const SIRIUS: HygStarInput = {
    x: -0.496,
    y: -1.609,
    z: -2.053,
    mag: -1.46,
    ci: 0.009,
    pmRA: -546,
    pmDec: -1223,
    spect: "A1V",
    absmag: 1.45,
    proper: "Sirius",
    bayer: "Alp",
    constellation: "CMa",
    gliese: "Gl 244A",
    flamsteed: 9,
    hd: 48915,
    hip: 32349,
  };
  const VEGA: HygStarInput = {
    x: 7.7,
    y: 0.6,
    z: 1.7,
    mag: 0.03,
    ci: 0.0,
    pmRA: 200,
    pmDec: 286,
    spect: "A0V",
    absmag: 0.58,
    proper: "Vega",
    bayer: "Alp",
    constellation: "Lyr",
    flamsteed: 3,
    hd: 172167,
    hip: 91262,
  };

  let cachedCatalog: HygCatalogData;

  beforeEach(() => {
    stubMatchMedia();
    resetStore();
    cachedCatalog = parseHygBinaryBuffer(encodeHygCatalog([SIRIUS, VEGA]));
    vi.spyOn(starfieldModule, "getCachedHygCatalog").mockReturnValue(
      cachedCatalog
    );
    vi.spyOn(starfieldModule, "loadHygCatalog").mockResolvedValue(
      cachedCatalog
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a 'Stars (HYG)' section with Sirius when the query matches", () => {
    const setActivePanel = vi.fn();
    render(<SearchBar activePanel="search" setActivePanel={setActivePanel} />);

    act(() => {
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "Sirius" },
      });
    });

    expect(screen.getByText(/Stars \(HYG\)/i)).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options.some((node) => /sirius/i.test(node.textContent ?? ""))).toBe(
      true
    );
  });

  it("dispatches a 'hyg:K' focus ID via selectId when a HYG match is clicked", () => {
    const setActivePanel = vi.fn();
    const selectIdSpy = vi.fn();
    useStore.setState({ selectId: selectIdSpy });

    render(<SearchBar activePanel="search" setActivePanel={setActivePanel} />);

    act(() => {
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "Sirius" },
      });
    });

    const sirius = screen
      .getAllByRole("option")
      .find((node) => /sirius/i.test(node.textContent ?? ""));
    expect(sirius).toBeDefined();

    act(() => {
      fireEvent.click(sirius!);
    });

    // Sirius is the brightest star (sort by ascending magnitude), so
    // hyg:0 in the encoded fixture.
    expect(selectIdSpy).toHaveBeenCalledWith("hyg:0");
    expect(setActivePanel).toHaveBeenCalledWith(null);
  });

  it("matches the Greek-letter Bayer form (α CMa) and dispatches the same hyg:K id", () => {
    const setActivePanel = vi.fn();
    const selectIdSpy = vi.fn();
    useStore.setState({ selectId: selectIdSpy });

    render(<SearchBar activePanel="search" setActivePanel={setActivePanel} />);

    act(() => {
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "α CMa" },
      });
    });

    const sirius = screen
      .getAllByRole("option")
      .find((node) => /sirius/i.test(node.textContent ?? ""));
    expect(sirius).toBeDefined();

    act(() => {
      fireEvent.click(sirius!);
    });

    expect(selectIdSpy).toHaveBeenCalledWith("hyg:0");
  });
});
