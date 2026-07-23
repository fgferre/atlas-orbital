/**
 * One-shot WebGL availability probe.
 *
 * Without it, a browser/GPU that cannot create a WebGL context fails
 * *inside* `<Canvas>`: three.js throws while constructing the renderer,
 * the R3F frame loop never starts, `SceneReadyChecker` never advances
 * (and its 8 s safety hatch never arms, because `criticalAssetsReady`
 * is only set by a child that never mounts), and the loader sits at
 * 8 % forever with no `[role=alert]` anywhere. Probing *before* the
 * Canvas mounts lets `Scene.tsx` render an honest fallback instead.
 *
 * The probe canvas is throwaway: the context is explicitly released via
 * `WEBGL_lose_context` because browsers cap the number of simultaneous
 * WebGL contexts (~8-16) and evict the oldest — leaking one here could
 * later kill the real renderer's context.
 */
export const detectWebGLSupport = (): boolean => {
  // No DOM (SSR / unit environments without a document): assume support
  // rather than showing a fallback that nobody can act on.
  if (typeof document === "undefined") {
    return true;
  }

  let canvas: HTMLCanvasElement | null = null;

  try {
    canvas = document.createElement("canvas");
    // `webgl2` first (what three.js prefers), then `webgl` for older
    // hardware. Falling back on the SAME canvas is safe: `getContext`
    // only returns null for the second call once the first one
    // succeeded, and in that case we already returned.
    const gl =
      (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null);

    if (!gl) {
      return false;
    }

    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    // Some browsers throw (instead of returning null) when WebGL is
    // disabled by policy or the GPU process is unavailable.
    return false;
  } finally {
    canvas?.remove();
  }
};
