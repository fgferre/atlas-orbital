// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import "../../i18n";
import {
  DEFAULT_SUNLIGHT_ASSIST_POLICY,
  getSunlightAssistPolicy,
  setSunlightAssistPolicy,
} from "../../lib/graphics/solarIrradiance";
import { useStore } from "../../store";
import { FidelityBadge } from "./FidelityBadge";

const initialState = useStore.getState();

const HEADER_TITLE = "What in this view is adjusted, and what is measured";
const SCALE_ROW_TITLE = "Click to switch scale mode";
const BRIGHTNESS_ROW_TITLE = "Click to switch brightness mode";

const expand = () => fireEvent.click(screen.getByTitle(HEADER_TITLE));
const aggregateDotClass = () =>
  screen.getByTestId("fidelity-aggregate-dot").className;
/**
 * Scoped to the collapsed header, because once expanded each axis title
 * appears twice by design — the summary line and its own row.
 */
const header = () => within(screen.getByTitle(HEADER_TITLE));

beforeEach(() => {
  useStore.setState({ ...initialState, scaleMode: "didactic" });
  setSunlightAssistPolicy(DEFAULT_SUNLIGHT_ASSIST_POLICY);
});

afterEach(() => {
  // Unmount FIRST: the policy is a module singleton with live
  // `useSyncExternalStore` subscribers, so resetting it while the badge is
  // still mounted is a React state update outside `act`.
  cleanup();
  // Module-level singleton — it would otherwise leak into the next file.
  setSunlightAssistPolicy(DEFAULT_SUNLIGHT_ASSIST_POLICY);
});

describe("FidelityBadge", () => {
  it("names both deviating axes while collapsed", () => {
    render(<FidelityBadge />);

    expect(screen.getByTestId("fidelity-badge")).toBeInTheDocument();
    // Both defaults deviate (didactic scale, assisted brightness), and the
    // collapsed badge is the only thing most viewers will ever read — so it
    // has to say so without being opened.
    expect(screen.getByText("NOT TO SCALE")).toBeInTheDocument();
    expect(screen.getByText("ASSISTED")).toBeInTheDocument();
    expect(screen.getByTitle(HEADER_TITLE)).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("expands into one described row per axis", () => {
    render(<FidelityBadge />);
    expect(screen.queryByText(/sizes and gaps are exaggerated/i)).toBeNull();

    expand();

    expect(
      screen.getByText(/sizes and gaps are exaggerated/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/order of brightness is preserved/i)
    ).toBeInTheDocument();
    expect(screen.getByTitle(HEADER_TITLE)).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("toggles scale mode from its row", () => {
    render(<FidelityBadge />);
    expand();

    fireEvent.click(screen.getByTitle(SCALE_ROW_TITLE));

    expect(useStore.getState().scaleMode).toBe("realistic");
    expect(header().getByText("TRUE SCALE")).toBeInTheDocument();
  });

  it("cycles the brightness policy from its row", () => {
    render(<FidelityBadge />);
    expand();
    const row = screen.getByTitle(BRIGHTNESS_ROW_TITLE);

    fireEvent.click(row);
    expect(getSunlightAssistPolicy()).toBe("compensated");
    expect(header().getByText("EQUALIZED")).toBeInTheDocument();

    fireEvent.click(row);
    expect(getSunlightAssistPolicy()).toBe("real");
    expect(header().getByText("TRUE BRIGHTNESS")).toBeInTheDocument();
  });

  it("goes emerald only when EVERY axis is faithful", () => {
    // handoff §6 item 10's UI half: the badge must never read "faithful"
    // while an assist is active — and one faithful axis is not enough.
    render(<FidelityBadge />);
    expand();

    expect(aggregateDotClass()).toContain("amber");

    // Brightness → "real", scale still didactic.
    fireEvent.click(screen.getByTitle(BRIGHTNESS_ROW_TITLE));
    fireEvent.click(screen.getByTitle(BRIGHTNESS_ROW_TITLE));
    expect(getSunlightAssistPolicy()).toBe("real");
    expect(aggregateDotClass()).toContain("amber");

    fireEvent.click(screen.getByTitle(SCALE_ROW_TITLE));
    expect(aggregateDotClass()).toContain("emerald");
  });
});
