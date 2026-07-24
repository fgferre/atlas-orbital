// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppCrashCard } from "./AppCrashCard";

describe("AppCrashCard", () => {
  it("supports an honest single-action recovery surface", () => {
    const reset = vi.fn();
    render(
      <AppCrashCard
        error={new Error("WebGL context lost")}
        reset={reset}
        title="3D view stopped"
        description="The interface remains available."
        retryLabel="Reload 3D view"
        showReload={false}
      />
    );

    expect(screen.getByText("3D view stopped")).toBeTruthy();
    expect(screen.getByText("The interface remains available.")).toBeTruthy();
    expect(screen.queryByText("Part of the interface crashed.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reload 3D view" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
