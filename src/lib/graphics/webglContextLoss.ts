/**
 * WebGL context-loss / restore wiring for the R3F canvas.
 *
 * The user's real failure mode is GPU VRAM exhaustion during the heavy
 * boot: the driver kills the WebGL context, the 3D canvas goes white, but
 * the HTML overlay + labels survive — so nothing in the React tree throws
 * and no ErrorBoundary fires. The only honest signal is the DOM
 * `webglcontextlost` event on the canvas element itself.
 *
 * Two responsibilities, kept together so the "correct" behaviour can't
 * drift apart:
 *  1. Call `preventDefault()` on `webglcontextlost`. This is the browser
 *     contract for "I want the context back" — without it the canvas is
 *     permanently dead and `webglcontextrestored` will never fire.
 *  2. Notify the caller (`onLost` / `onRestored`) so it can surface an
 *     honest failure card and dismiss it if the context is restored.
 *
 * Returns an unsubscribe fn so the caller can detach on unmount / HMR
 * dispose (duplicate handlers otherwise stack across Vite hot updates).
 */
export interface WebglContextLossHandlers {
  /** Fired after `preventDefault()` when the context is lost. */
  onLost?: () => void;
  /** Fired when the browser restores a previously-lost context. */
  onRestored?: () => void;
}

export function registerWebglContextLossHandlers(
  canvas: HTMLCanvasElement,
  handlers: WebglContextLossHandlers
): () => void {
  const handleLost = (event: Event) => {
    // Must run for the browser to attempt recovery — see (1) above.
    event.preventDefault();
    handlers.onLost?.();
  };
  const handleRestored = () => {
    handlers.onRestored?.();
  };

  canvas.addEventListener("webglcontextlost", handleLost);
  canvas.addEventListener("webglcontextrestored", handleRestored);

  return () => {
    canvas.removeEventListener("webglcontextlost", handleLost);
    canvas.removeEventListener("webglcontextrestored", handleRestored);
  };
}
