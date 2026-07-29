/**
 * One-shot WebGL availability + capability probe.
 *
 * It answers two questions from a single throwaway context: can this
 * browser render at all, and what hard limits does the GPU report. The
 * second is what keeps auto tier detection from handing the heaviest
 * assets to hardware it never looked at.
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
export interface WebglCapabilities {
  supported: boolean;
  /** `gl.MAX_TEXTURE_SIZE`, or `undefined` when it could not be read. */
  maxTextureSize?: number;
  /**
   * `true` only when the renderer identifies *itself* as a software
   * rasterizer. `undefined` when unreadable (privacy-masked, or the
   * extension is absent) — we did not measure it, so we do not claim it.
   */
  softwareRenderer?: boolean;
}

/**
 * Renderers that name themselves software. Deliberately not a
 * GPU-model → performance table: that is a guess dressed as a
 * measurement and it rots with every hardware generation. A miss yields
 * `undefined`, which downgrades nothing.
 */
const SOFTWARE_RENDERER_MARKERS = [
  "swiftshader",
  "llvmpipe",
  "softpipe",
  "software adapter",
  "basic render driver",
];

const readPositiveNumber = (
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  pname: number
): number | undefined => {
  try {
    const value: unknown = gl.getParameter(pname);
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : undefined;
  } catch {
    return undefined;
  }
};

const detectSoftwareRenderer = (
  gl: WebGLRenderingContext | WebGL2RenderingContext
): boolean | undefined => {
  try {
    // Extension absent means the string is unreadable, not that the
    // renderer is hardware. Mirrors the "(privacy-masked)" substitution
    // in `Scene.tsx`'s diagnostic. Falling back to plain `gl.RENDERER`
    // and returning `false` would be a positive claim we never measured.
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) {
      return undefined;
    }

    const renderer: unknown = gl.getParameter(
      debugInfo.UNMASKED_RENDERER_WEBGL
    );
    if (typeof renderer !== "string") {
      return undefined;
    }

    const normalized = renderer.toLowerCase();
    return SOFTWARE_RENDERER_MARKERS.some((marker) =>
      normalized.includes(marker)
    );
  } catch {
    return undefined;
  }
};

let cachedCapabilities: WebglCapabilities | null = null;

/**
 * Memoised — this is correctness, not micro-optimisation. The device
 * signals are collected on every render, so an unmemoised probe would
 * create a WebGL context per render and evict the real renderer's
 * context through the browser's ~8-16 context cap.
 */
export const probeWebglCapabilities = (): WebglCapabilities => {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  // No DOM (SSR / unit environments without a document): assume support
  // rather than showing a fallback that nobody can act on.
  if (
    typeof document === "undefined" ||
    typeof document.createElement !== "function"
  ) {
    cachedCapabilities = { supported: true };
    return cachedCapabilities;
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
      cachedCapabilities = { supported: false };
      return cachedCapabilities;
    }

    // Every `getParameter` has to run before the context is released.
    cachedCapabilities = {
      supported: true,
      maxTextureSize: readPositiveNumber(gl, gl.MAX_TEXTURE_SIZE),
      softwareRenderer: detectSoftwareRenderer(gl),
    };

    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return cachedCapabilities;
  } catch {
    // Some browsers throw (instead of returning null) when WebGL is
    // disabled by policy or the GPU process is unavailable.
    cachedCapabilities = { supported: false };
    return cachedCapabilities;
  } finally {
    canvas?.remove();
  }
};

export const detectWebGLSupport = (): boolean =>
  probeWebglCapabilities().supported;
