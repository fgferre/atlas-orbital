import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { sceneExposure } from "../../../lib/graphics/exposureRegistry";

/**
 * 1c — mounts once inside `<Canvas>` and pushes the exposure registry's
 * scalar into `gl.toneMappingExposure` every frame.
 *
 * With AgX default (sub-pull 1a) the `@react-three/postprocessing`
 * `ToneMapping` effect reads `toneMappingExposure` via three.js's
 * `<tonemapping_pars_fragment>` chunk (which it includes in its
 * shader source). Three.js auto-binds the renderer's `toneMappingExposure`
 * value to any program that declares the uniform — the EffectPass
 * program does — so a single write here propagates into the AgX curve
 * the next frame.
 *
 * This is the "tonemap-stage" path. The "per-shader internal" path
 * (where each emissive shader family subscribes its INTERNAL exposure
 * constant to the same registry) is opt-in; 1c ships only the
 * tonemap-stage path. Per-shader subscribers can plug in later
 * (sub-pulls after 1c) if A/B testing shows the AgX-only linear
 * scaling produces the "halo descola" failure mode the fable-5
 * audit flagged — see `exposureRegistry.ts` for the rationale.
 *
 * ## Why `toneMappingExposure` when Scene.tsx sets `gl.toneMapping=NoToneMapping`
 *
 * That `NoToneMapping` disables the renderer's BUILT-IN per-material
 * tonemapping pass, which is what we want: the postprocessing
 * `ToneMappingEffect` is the single authority on tone mapping, so the
 * renderer passes raw linear values into the HalfFloat composer target.
 * `toneMappingExposure` is a separate uniform — three.js pushes its
 * value to every program that declares it (via the auto-bound
 * `toneMappingExposure` uniform in `<tonemapping_pars_fragment>`),
 * regardless of whether the renderer itself applies a tonemap curve.
 * The postprocessing lib's `ToneMappingEffect` shader includes that
 * chunk and reads the uniform, so this bridge's write matters even
 * though `gl.toneMapping === NoToneMapping`.
 *
 * ## Immutability on the default
 *
 * The registry starts at `1.0`, so this bridge is a no-op until 1d
 * (eye-adaptation) drives the number. Pixels render byte-identical to
 * the pre-1c state during that window.
 *
 * ## The ref pattern
 *
 * `useThree((s) => s.gl)` yields the live renderer, but the
 * `react-hooks/immutability` lint rule blocks writing to its members
 * from inside `useFrame`. Stashing the renderer in a `useRef`
 * (mirroring the same pattern `useVisualPresetLerp.ts` uses for
 * `scene.environmentIntensity`) lets the per-frame write remain
 * imperative Three.js without tripping the lint surface.
 */
export const ExposureBridge = () => {
  const glFromHook = useThree((state) => state.gl);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  useEffect(() => {
    glRef.current = glFromHook;
  }, [glFromHook]);
  useFrame(() => {
    const gl = glRef.current;
    if (gl) gl.toneMappingExposure = sceneExposure.value;
  });
  return null;
};
