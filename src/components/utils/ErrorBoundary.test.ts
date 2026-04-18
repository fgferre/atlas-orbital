import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * These tests exercise the ErrorBoundary class directly (no DOM mount),
 * since the project's vitest environment is `node` and testing-library is
 * not installed. We validate: (a) state transitions via
 * getDerivedStateFromError, (b) render() output in both happy and error
 * paths, (c) the fallback-as-function contract, and (d) the reset callback.
 */

type Props = React.ComponentProps<typeof ErrorBoundary>;

const makeBoundary = (props: Props): ErrorBoundary => {
  const instance = new ErrorBoundary(props);
  // React assigns setState during mount; for direct-instance testing we
  // stub it to mutate local state synchronously.
  instance.setState = function (this: ErrorBoundary, updater) {
    const next =
      typeof updater === "function"
        ? (updater as (s: typeof this.state) => Partial<typeof this.state>)(
            this.state
          )
        : updater;
    this.state = { ...this.state, ...next } as typeof this.state;
  } as ErrorBoundary["setState"];
  return instance;
};

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children on the happy path", () => {
    const child = createElement("div", null, "ok");
    const boundary = makeBoundary({
      children: child,
      fallback: createElement("span", null, "fallback"),
    });
    expect(boundary.render()).toBe(child);
  });

  it("captures the error via getDerivedStateFromError", () => {
    const err = new Error("boom");
    const next = ErrorBoundary.getDerivedStateFromError(err);
    expect(next.hasError).toBe(true);
    expect(next.error).toBe(err);
  });

  it("renders a ReactNode fallback as-is when an error is caught", () => {
    const fallbackNode = createElement("span", null, "fallback");
    const boundary = makeBoundary({
      children: createElement("div", null),
      fallback: fallbackNode,
    });
    // Simulate post-catch state.
    boundary.state = { hasError: true, error: new Error("boom") };
    expect(boundary.render()).toBe(fallbackNode);
  });

  it("calls a function fallback with { error, reset } and renders the result", () => {
    const err = new Error("boom");
    const fallbackFn = vi.fn(
      ({ error }: { error: Error; reset: () => void }): ReactNode =>
        createElement("span", null, error.message)
    );
    const boundary = makeBoundary({
      children: createElement("div", null),
      fallback: fallbackFn,
    });
    boundary.state = { hasError: true, error: err };

    const output = boundary.render();

    expect(fallbackFn).toHaveBeenCalledTimes(1);
    const callArg = fallbackFn.mock.calls[0][0];
    expect(callArg.error).toBe(err);
    expect(typeof callArg.reset).toBe("function");
    expect(output).toBeTruthy();
  });

  it("reset() clears the error state so children render again", () => {
    const child = createElement("div", null, "ok");
    let captured: { reset: () => void } | null = null;
    const fallbackFn = ({
      reset,
    }: {
      error: Error;
      reset: () => void;
    }): ReactNode => {
      captured = { reset };
      return createElement("span", null, "err");
    };
    const boundary = makeBoundary({
      children: child,
      fallback: fallbackFn,
    });
    boundary.state = { hasError: true, error: new Error("boom") };

    // First render: fallback path + capture reset().
    boundary.render();
    expect(captured).not.toBeNull();

    // Invoke reset via the captured callback.
    captured!.reset();

    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
    expect(boundary.render()).toBe(child);
  });

  it("componentDidCatch routes the error through telemetry with a componentStack field", () => {
    const boundary = makeBoundary({
      children: createElement("div", null),
      fallback: null,
    });
    const err = new Error("boom");
    boundary.componentDidCatch(err, {
      componentStack: "\n  in SomeComponent",
    } as React.ErrorInfo);
    // telemetry.error routes through console.error in every build.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = consoleErrorSpy.mock.calls[0];
    expect(prefix).toMatch(/Uncaught error in ErrorBoundary/);
    expect(payload).toEqual(
      expect.objectContaining({
        error: err,
        componentStack: "\n  in SomeComponent",
      })
    );
  });
});
