// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  encodeHygCatalog,
  parseHygBinaryBuffer,
  type HygCatalogData,
  type HygStarInput,
} from "../../utils/hygBinary";
import * as starfieldModule from "../../lib/starfield";
import { buildHygStarInfo } from "../../lib/starfield/hygStarInfo";
import * as wikipediaModule from "../../lib/wikipedia/wikipediaClient";
import { useStore } from "../../store";
import { HygStarPanel } from "./HygStarPanel";

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

describe("buildHygStarInfo", () => {
  it("derives the full info shape from a catalog + index pair", () => {
    const catalog = parseHygBinaryBuffer(encodeHygCatalog([SIRIUS]));
    const info = buildHygStarInfo(catalog, 0);
    expect(info).not.toBeNull();
    expect(info?.starIndex).toBe(0);
    expect(info?.properName).toBe("Sirius");
    expect(info?.bayerAbbrev).toBe("Alp");
    expect(info?.bayerGreek).toBe("α");
    expect(info?.constellation).toBe("CMa");
    expect(info?.spect).toBe("A1V");
    expect(info?.hd).toBe(48915);
    expect(info?.hip).toBe(32349);
    expect(info?.gliese).toBe("Gl 244A");
    expect(info?.flamsteed).toBe(9);
    expect(info?.primaryName).toBe("Sirius");
    expect(info?.designation).toContain("α CMa");
    expect(info?.designation).toContain("HD 48915");
    expect(info?.wikipediaQuery).toBe("Sirius");
    expect(info?.distancePc).toBeCloseTo(2.64, 1);
    // A1V dwarf — temperature ~9700 K range.
    expect(info?.tEffK).toBeGreaterThan(8000);
    expect(info?.tEffK).toBeLessThan(11000);
    // Sirius A radius ~1.7 solar; mass ~2 solar (rough).
    expect(info?.radiusSolar).toBeGreaterThan(0.5);
    expect(info?.massSolar).toBeGreaterThan(0.5);
    expect(info?.massSolar).toBeLessThan(10);
  });

  it("returns null for out-of-range starIndex", () => {
    const catalog = parseHygBinaryBuffer(encodeHygCatalog([SIRIUS]));
    expect(buildHygStarInfo(catalog, -1)).toBeNull();
    expect(buildHygStarInfo(catalog, 999)).toBeNull();
  });

  it("falls back to Bayer-Greek + con primary when proper name is empty", () => {
    const catalog = parseHygBinaryBuffer(
      encodeHygCatalog([{ ...SIRIUS, proper: "" }])
    );
    const info = buildHygStarInfo(catalog, 0);
    expect(info?.primaryName).toBe("α CMa");
    // Wikipedia query also flips to the Greek form.
    expect(info?.wikipediaQuery).toBe("α CMa");
  });

  it("falls back to HD designation when no Bayer / proper exists", () => {
    const catalog = parseHygBinaryBuffer(
      encodeHygCatalog([
        {
          ...SIRIUS,
          proper: "",
          bayer: "",
          flamsteed: 0,
        },
      ])
    );
    const info = buildHygStarInfo(catalog, 0);
    expect(info?.primaryName).toBe("HD 48915");
    expect(info?.wikipediaQuery).toBe("HD 48915");
  });
});

describe("HygStarPanel — visibility gate", () => {
  beforeEach(() => {
    stubMatchMedia();
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when no body is selected", () => {
    const { container } = render(<HygStarPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the focus is a curated solar-system body", () => {
    useStore.setState({ selectedId: "earth" });
    const { container } = render(<HygStarPanel />);
    expect(container.firstChild).toBeNull();
  });
});

describe("HygStarPanel — focused HYG star", () => {
  let cachedCatalog: HygCatalogData;

  beforeEach(() => {
    stubMatchMedia();
    resetStore();
    cachedCatalog = parseHygBinaryBuffer(encodeHygCatalog([SIRIUS]));
    vi.spyOn(starfieldModule, "getCachedHygCatalog").mockReturnValue(
      cachedCatalog
    );
    vi.spyOn(starfieldModule, "loadHygCatalog").mockResolvedValue(
      cachedCatalog
    );
    // Default: Wikipedia returns a successful summary.
    vi.spyOn(wikipediaModule, "fetchSummary").mockResolvedValue({
      title: "Sirius",
      extract:
        "Sirius is the brightest star in the night sky, located in the constellation Canis Major.",
      thumbnailUrl: "https://upload.wikimedia.org/sirius.jpg",
      pageUrl: "https://en.wikipedia.org/wiki/Sirius",
      language: "en",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the star primary name + designation header", () => {
    useStore.setState({ selectedId: "hyg:0" });
    render(<HygStarPanel />);

    expect(screen.getByText("Sirius")).toBeInTheDocument();
    const header = screen.getByText(/α CMa/);
    expect(header).toBeInTheDocument();
    expect(header.textContent).toContain("HD 48915");
    expect(header.textContent).toContain("HIP 32349");
  });

  it("shows the spectral class, distance, and constellation rows", () => {
    useStore.setState({ selectedId: "hyg:0" });
    render(<HygStarPanel />);

    // Spectral class label + value
    expect(screen.getByText(/spectral class/i)).toBeInTheDocument();
    expect(screen.getByText("A1V")).toBeInTheDocument();
    // Distance contains both pc and ly (Sirius ≈ 2.66 pc / 8.65 ly).
    expect(
      screen.getByText(/\d\.\d{2} pc · \d\.\d{2} ly/i)
    ).toBeInTheDocument();
    // Constellation
    expect(screen.getByText("CMa")).toBeInTheDocument();
  });

  it("renders the Wikipedia 'About' section after the summary resolves", async () => {
    useStore.setState({ selectedId: "hyg:0" });
    render(<HygStarPanel />);

    // Loading skeleton appears first.
    expect(screen.getByTestId("wiki-loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("wiki-ready")).toBeInTheDocument();
    });
    expect(screen.getByText(/brightest star/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Read more/i });
    expect(link).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Sirius"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the empty state when Wikipedia returns null", async () => {
    vi.spyOn(wikipediaModule, "fetchSummary").mockResolvedValue(null);
    useStore.setState({ selectedId: "hyg:0" });
    render(<HygStarPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("wiki-empty")).toBeInTheDocument();
    });
  });

  it("shows the error state and re-fires the fetch when Retry is clicked", async () => {
    const fetchSpy = vi
      .spyOn(wikipediaModule, "fetchSummary")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        title: "Sirius",
        extract: "Recovery extract.",
        thumbnailUrl: null,
        pageUrl: "https://en.wikipedia.org/wiki/Sirius",
        language: "en",
      });

    useStore.setState({ selectedId: "hyg:0" });
    render(<HygStarPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("wiki-error")).toBeInTheDocument();
    });

    const retry = screen.getByRole("button", { name: /retry/i });
    act(() => {
      fireEvent.click(retry);
    });

    await waitFor(() => {
      expect(screen.getByTestId("wiki-ready")).toBeInTheDocument();
    });
    expect(screen.getByText(/Recovery extract/)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("hides the Wikipedia section entirely when wikipediaIntegrationEnabled is false", async () => {
    useStore.setState({
      selectedId: "hyg:0",
      wikipediaIntegrationEnabled: false,
    });
    const fetchSpy = vi.spyOn(wikipediaModule, "fetchSummary");
    render(<HygStarPanel />);

    expect(screen.queryByTestId("wiki-loading")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wiki-ready")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wiki-empty")).not.toBeInTheDocument();
    expect(screen.queryByText(/About/i)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clears the focus when the close button is clicked", () => {
    useStore.setState({ selectedId: "hyg:0" });
    render(<HygStarPanel />);

    const close = screen.getByRole("button", { name: /close/i });
    act(() => {
      fireEvent.click(close);
    });
    expect(useStore.getState().selectedId).toBeNull();
  });
});
