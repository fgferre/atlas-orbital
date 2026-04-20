// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Accordion } from "./Accordion";

describe("Accordion", () => {
  it("honors the default open state", () => {
    render(
      <Accordion label="World" defaultOpen={false}>
        <div>World content</div>
      </Accordion>
    );

    expect(screen.getByRole("button", { name: /^world$/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByText("World content")).not.toBeInTheDocument();
  });

  it("toggles content visibility when the header is clicked", () => {
    render(
      <Accordion label="Guides">
        <div>Guide content</div>
      </Accordion>
    );

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^guides$/i }));
    });

    expect(screen.getByRole("button", { name: /^guides$/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByText("Guide content")).not.toBeInTheDocument();
  });

  it("re-syncs with defaultOpen when the breakpoint-driven default changes", () => {
    const { rerender } = render(
      <Accordion label="Backdrop" defaultOpen={false}>
        <div>Backdrop content</div>
      </Accordion>
    );

    rerender(
      <Accordion label="Backdrop" defaultOpen={true}>
        <div>Backdrop content</div>
      </Accordion>
    );

    expect(screen.getByRole("button", { name: /^backdrop$/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByText("Backdrop content")).toBeInTheDocument();
  });
});
