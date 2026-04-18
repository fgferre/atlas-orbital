import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useStore } from "../store";
import {
  collectDeviceSignals,
  type WindowLike,
} from "../lib/graphics/deviceSignals";
import {
  resolveActivePreset,
  resolveEffectiveGraphics,
  type EffectiveGraphics,
  type GraphicsBasePreset,
} from "../lib/graphics/resolver";

/**
 * Selector hook: returns the `EffectiveGraphics` record the renderer
 * should apply this frame, resolved from the graphics slice + live
 * device signals.
 *
 * Wave α Commit 3 (R2 Wave 1). Consumers that need the legacy
 * `ResolvedQualityProfile` shape go through `useQualityProfile`, which
 * wraps this hook + `projectToLegacyShape`.
 *
 * Shallow-selecting only the slice fields we need keeps this hook out
 * of the hot re-render path — explicitly avoids subscribing to
 * `displayedDatetime` (L19 "overlay hot-path hygiene"). The resize /
 * orientation listener bumps a local revision so auto-mode reflects
 * viewport changes without listening on anything bigger.
 */
const getDefaultWindowLike = (): WindowLike | undefined => {
  if (typeof window === "undefined") return undefined;
  return window as unknown as WindowLike;
};

export const useEffectiveGraphics = (
  windowLike?: WindowLike
): EffectiveGraphics => {
  const resolvedWindow = windowLike ?? getDefaultWindowLike();

  const { graphicsPreset, graphicsAutoMode, graphicsOverrides, customBase } =
    useStore(
      useShallow((state) => ({
        graphicsPreset: state.graphicsPreset,
        graphicsAutoMode: state.graphicsAutoMode,
        graphicsOverrides: state.graphicsOverrides,
        customBase: state.customBase,
      }))
    );

  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!graphicsAutoMode || !resolvedWindow?.addEventListener) return;
    const bump = () => setRevision((n) => n + 1);
    resolvedWindow.addEventListener("resize", bump);
    resolvedWindow.addEventListener("orientationchange", bump);
    return () => {
      resolvedWindow.removeEventListener?.("resize", bump);
      resolvedWindow.removeEventListener?.("orientationchange", bump);
    };
  }, [graphicsAutoMode, resolvedWindow]);
  void revision;

  const signals = collectDeviceSignals(resolvedWindow);
  return resolveEffectiveGraphics(
    { graphicsPreset, graphicsAutoMode, graphicsOverrides, customBase },
    signals
  );
};

/**
 * Convenience wrapper exposing the preset name the resolver picked
 * (named preset, customBase when Custom, or auto-resolved when Auto).
 * Display panel uses this to label the dropdown and the "Reset to X"
 * button target.
 */
export const useActiveGraphicsPreset = (
  windowLike?: WindowLike
): GraphicsBasePreset => {
  const resolvedWindow = windowLike ?? getDefaultWindowLike();
  const { graphicsPreset, graphicsAutoMode, graphicsOverrides, customBase } =
    useStore(
      useShallow((state) => ({
        graphicsPreset: state.graphicsPreset,
        graphicsAutoMode: state.graphicsAutoMode,
        graphicsOverrides: state.graphicsOverrides,
        customBase: state.customBase,
      }))
    );
  const signals = collectDeviceSignals(resolvedWindow);
  return resolveActivePreset(
    { graphicsPreset, graphicsAutoMode, graphicsOverrides, customBase },
    signals
  );
};
