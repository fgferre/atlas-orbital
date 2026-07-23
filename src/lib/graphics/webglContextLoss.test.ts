// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { registerWebglContextLossHandlers } from "./webglContextLoss";

/**
 * These tests cover the honest context-loss detection wired into the R3F
 * canvas (Scene.tsx `handleCanvasCreated`). The user's real symptom is a
 * white 3D canvas after GPU VRAM exhaustion kills the WebGL context while
 * the HTML overlay survives; the only signal is the DOM
 * `webglcontextlost` event, so the wiring must:
 *   - preventDefault on lost (browser contract for recovery),
 *   - notify onLost so the failure card can surface,
 *   - notify onRestored so an auto-recovered context dismisses the card,
 *   - detach cleanly on unmount / HMR dispose.
 */
describe("registerWebglContextLossHandlers", () => {
  it("calls preventDefault and onLost when the context is lost", () => {
    const canvas = document.createElement("canvas");
    const onLost = vi.fn();
    registerWebglContextLossHandlers(canvas, { onLost });

    const event = new Event("webglcontextlost", { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    canvas.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it("calls onRestored when the context is restored", () => {
    const canvas = document.createElement("canvas");
    const onRestored = vi.fn();
    registerWebglContextLossHandlers(canvas, { onRestored });

    canvas.dispatchEvent(new Event("webglcontextrestored"));

    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after the returned cleanup runs (HMR / unmount)", () => {
    const canvas = document.createElement("canvas");
    const onLost = vi.fn();
    const onRestored = vi.fn();
    const detach = registerWebglContextLossHandlers(canvas, {
      onLost,
      onRestored,
    });

    detach();

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    canvas.dispatchEvent(new Event("webglcontextrestored"));

    expect(onLost).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("still preventDefaults when no onLost callback is supplied", () => {
    const canvas = document.createElement("canvas");
    // No handlers — the preventDefault contract must hold regardless so the
    // browser can attempt recovery even if the caller opts out of a card.
    registerWebglContextLossHandlers(canvas, {});

    const event = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
