// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import "../../i18n";
import { useStore } from "../../store";
import { ScalePill } from "./ScalePill";

const initialState = useStore.getState();

const resetStore = () => {
  useStore.setState({
    ...initialState,
    scaleMode: "didactic",
  });
};

describe("ScalePill", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders didactic scale mode pill by default", () => {
    render(<ScalePill />);

    expect(screen.getByTestId("scale-pill")).toBeInTheDocument();
    expect(screen.getByText("NOT TO SCALE")).toBeInTheDocument();
    expect(screen.getByText("sizes & gaps exaggerated")).toBeInTheDocument();
  });

  it("toggles scale mode to realistic when clicked", () => {
    render(<ScalePill />);

    const toggleButton = screen.getByRole("button", {
      name: /not to scale/i,
    });
    fireEvent.click(toggleButton);

    expect(useStore.getState().scaleMode).toBe("realistic");
    expect(screen.getByText("TRUE SCALE")).toBeInTheDocument();
    expect(screen.getByText("physical proportions")).toBeInTheDocument();
  });

  it("collapses description when chevron is clicked", () => {
    render(<ScalePill />);

    expect(screen.getByText("sizes & gaps exaggerated")).toBeInTheDocument();

    const collapseButton = screen.getByRole("button", {
      name: /collapse badge/i,
    });
    fireEvent.click(collapseButton);

    expect(
      screen.queryByText("sizes & gaps exaggerated")
    ).not.toBeInTheDocument();

    const expandButton = screen.getByRole("button", { name: /expand badge/i });
    fireEvent.click(expandButton);

    expect(screen.getByText("sizes & gaps exaggerated")).toBeInTheDocument();
  });
});
