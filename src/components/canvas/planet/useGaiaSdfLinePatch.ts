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

    // Preserve LineMaterial's own onBeforeCompile (sets
    // USE_LINE_COLOR_ALPHA based on transparent flag) and chain our
    // patch after it. LineMaterial's ctor assigns the handler as
    // `this.onBeforeCompile = function() { this.defines... }` — so
    // we bind it to the material explicitly to preserve the `this`
    // context before wrapping.
    const originalRaw = mat.onBeforeCompile;
    const originalBound =
      typeof originalRaw === "function" ? originalRaw.bind(mat) : null;
    const patched: OnBeforeCompile = (shader, renderer) => {
      if (originalBound) {
        originalBound(shader, renderer);
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
    mat.onBeforeCompile = patched;

    // Force recompilation: LineMaterial may have already compiled
    // with the original onBeforeCompile before this effect fires.
    mat.needsUpdate = true;
  }, [lineRef]);
}
