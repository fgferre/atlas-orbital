import { useLayoutEffect, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import type { Line2, LineSegments2 } from "three-stdlib";

import {
  LINE_SDF_ALPHA_EXPONENT,
  LINE_SDF_BRIGHT_CORE_EXPONENT,
} from "../shaders/lineSdfMath";

type LineLike = Line2 | LineSegments2;
type OnBeforeCompile = (
  shader: THREE.WebGLProgramParametersWithUniforms,
  renderer: THREE.WebGLRenderer
) => void;

/**
 * Sentinel property attached to the wrapped `onBeforeCompile` so a
 * re-entry of this hook (React StrictMode double-invocation, Vite
 * HMR hot-replace, or component remount) can recognise its own
 * patch and avoid stacking a second SDF block on top of the first.
 * Pre-T5.4 bug: every re-entry captured the already-patched handler
 * as the "original", wrapping it again and injecting the SDF block
 * twice into the shader source.
 */
const ATLAS_SDF_PATCH_TAG = "__atlasSdfPatchInstalled";

/**
 * Container for the TRUE original handler, stashed on the patched
 * function instance so cleanup can restore it even after N layers
 * of re-entry were prevented.
 */
const ATLAS_SDF_PATCH_ORIGINAL = "__atlasSdfPatchOriginal";

interface AtlasSdfPatchedFn extends OnBeforeCompile {
  [ATLAS_SDF_PATCH_TAG]?: true;
  [ATLAS_SDF_PATCH_ORIGINAL]?: OnBeforeCompile | undefined;
}

/**
 * `THREE.Material.onBeforeCompile` is declared non-optional in
 * three.js types (`Material.ts:onBeforeCompile: (...) => void`) but
 * defaults to an empty no-op function per its constructor. When
 * cleanup restores the "original" handler, we may find the slot
 * was never assigned (real original = undefined). Fall back to
 * this module-local no-op so the type contract stays satisfied —
 * equivalent to three.js's own default.
 */
const NOOP_ON_BEFORE_COMPILE: OnBeforeCompile = () => {};

/**
 * Installs Gaia Sky's quad-strip line SDF feathering on a drei
 * `<Line>`'s underlying `LineMaterial` via `onBeforeCompile`.
 *
 * Gaia source: `/tmp/gaiasky/assets/shader/line.quad.cpu.fragment.glsl:20-33`.
 * The math is mirrored pure-TS in `shaders/lineSdfMath.ts` and pinned
 * by `lineSdfMath.test.ts` (14 tests).
 *
 * The patch inserts a shader block RIGHT BEFORE the LineMaterial's
 * `gl_FragColor = diffuseColor;` assignment (three-stdlib 2.36+
 * fragment-shader template). It:
 *   1. Computes `x = vUv.y` (atlas's LineMaterial already gives
 *      this in [-1, 1] including endcap regions |vUv.y| > 1; the
 *      lineSdfMath.ts `lineSdfCore` clamps to 0 outside the body
 *      so `pow(negative, 1.8)` can't NaN).
 *   2. Computes `core = min(cos(PI*x/2), 1 - |x|)` clamped to 0.
 *   3. Applies `alpha *= pow(core, 1.8)` — softens edges.
 *   4. Applies `rgb += vec3(pow(core, 10.0))` — bright centerline
 *      stripe, matching Gaia's `vec4(rgb + cplus, 1.0)` output.
 *
 * Documented divergences from Gaia source:
 *   - Gaia's `v_uv.y ∈ [0, 1]` remap `(v_uv.y - 0.5) * 2.0 → x`
 *     is skipped because drei's LineMaterial already emits `vUv.y`
 *     in `[-1, 1]`. Same resulting `x` value, one step fewer.
 *   - Gaia writes a separate `layerBuffer` output; atlas composes
 *     into `gl_FragColor` via the standard Three.js single-output
 *     path (drei's LineMaterial is single-buffer).
 *   - Gaia's `logarithmicDepth()` call is skipped — atlas's Scene
 *     has `logarithmicDepthBuffer: true` set at the renderer
 *     level (`Scene.tsx:261`), which Three's
 *     `#include <logdepthbuf_fragment>` already handles (that
 *     include is still present in LineMaterial's fragment).
 *
 * **T5.4 (2026-04-24) — HMR / StrictMode re-entry correctness**:
 *
 * Gaia applies the line patch once via `RenderAssets.java` shader
 * binding — static, no re-patch cycle. Atlas runs this hook inside
 * a React component, so every mount / HMR hot-replace / StrictMode
 * double-invocation re-enters it. The pre-T5.4 implementation
 * captured `mat.onBeforeCompile` as the "original" each time —
 * but after the first run, that handler was already OUR patch, so
 * the second run wrapped the patch-of-a-patch, injecting the SDF
 * block a second time into the shader source. Repeat N times per
 * long dev session → N stacked SDF blocks (shader compiles but
 * edges get feathered N × heavier than intended).
 *
 * Fix (below):
 *   1. Tag the patched handler with a sentinel property so we can
 *      recognise our own previous install (`ATLAS_SDF_PATCH_TAG`).
 *   2. On re-entry, skip the wrap entirely if our patch is already
 *      installed on this material — the cached real original is
 *      pulled from the patch's own `ATLAS_SDF_PATCH_ORIGINAL`
 *      property so cleanup can still restore it correctly.
 *   3. Return a cleanup function from the `useLayoutEffect` that
 *      restores the TRUE original `onBeforeCompile` and forces a
 *      recompile (`needsUpdate = true`) so the shader rebuilds
 *      without our patch — critical for Vite HMR cycles where the
 *      material persists but this hook re-mounts.
 */
export function useGaiaSdfLinePatch(
  lineRef: MutableRefObject<LineLike | null> | RefObject<LineLike | null>
): void {
  useLayoutEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    const mat = line.material as THREE.Material & {
      onBeforeCompile?: OnBeforeCompile;
    };
    if (!mat) return;

    const currentHandler = mat.onBeforeCompile as AtlasSdfPatchedFn | undefined;

    // If our patch is already installed (Strict-Mode double-invoke,
    // HMR re-entry), skip the wrap: the existing patch already
    // does the right thing and further wrapping would stack SDF
    // blocks. The cleanup below still needs to run — so read the
    // real original from the already-installed patch and keep a
    // stable `patched` reference for the cleanup's identity check.
    let patched: AtlasSdfPatchedFn;
    let realOriginal: OnBeforeCompile | undefined;
    if (currentHandler?.[ATLAS_SDF_PATCH_TAG] === true) {
      patched = currentHandler;
      realOriginal = currentHandler[ATLAS_SDF_PATCH_ORIGINAL];
    } else {
      // First install (or first after a clean restore). `currentHandler`
      // IS the real original — either LineMaterial's built-in
      // `USE_LINE_COLOR_ALPHA` define-setter or undefined. Bind it to
      // the material so the downstream call has the correct `this`.
      realOriginal = currentHandler;
      const realBound =
        typeof realOriginal === "function" ? realOriginal.bind(mat) : null;
      const newPatched: AtlasSdfPatchedFn = (shader, renderer) => {
        if (realBound) {
          realBound(shader, renderer);
        }
        shader.fragmentShader = shader.fragmentShader.replace(
          "gl_FragColor = diffuseColor;",
          /* glsl */ `
          {
            // Gaia Sky line.quad.cpu.fragment.glsl:20-33 port (T4.6).
            // See shaders/lineSdfMath.ts for the pure-TS mirror + pins.
            float sdfX = vUv.y;
            float sdfCos = cos(3.14159265 * sdfX / 2.0);
            float sdfLin = 1.0 - abs(sdfX);
            float sdfCore = max(0.0, min(sdfCos, sdfLin));
            float sdfAlpha = pow(sdfCore, ${LINE_SDF_ALPHA_EXPONENT.toFixed(1)});
            float sdfCplus = pow(sdfCore, ${LINE_SDF_BRIGHT_CORE_EXPONENT.toFixed(1)});
            diffuseColor.a *= sdfAlpha;
            diffuseColor.rgb += vec3(sdfCplus);
          }
          gl_FragColor = diffuseColor;
          `
        );
      };
      newPatched[ATLAS_SDF_PATCH_TAG] = true;
      newPatched[ATLAS_SDF_PATCH_ORIGINAL] = realOriginal;
      patched = newPatched;
      mat.onBeforeCompile = patched;
      // Force recompilation so the shader picks up the patch on
      // the next render pass. Harmless if the material hasn't
      // compiled yet.
      mat.needsUpdate = true;
    }

    return () => {
      // Only restore if OUR patch is still installed. If something
      // else clobbered `onBeforeCompile` between mount and unmount,
      // leave it alone — restoring would overwrite whatever took
      // our slot. The identity check is strict (===) so a different
      // patched instance (e.g. from a HMR re-run that skipped the
      // wrap) doesn't match here; the sibling re-run's own cleanup
      // owns the restore in that case.
      if (mat.onBeforeCompile === patched) {
        mat.onBeforeCompile = realOriginal ?? NOOP_ON_BEFORE_COMPILE;
        mat.needsUpdate = true;
      }
    };
  }, [lineRef]);
}
