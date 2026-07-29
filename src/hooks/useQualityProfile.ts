import {
  type QualityMode,
  type ResolvedQualityProfile,
  type WindowLike,
} from "../lib/qualityProfile";
import {
  projectToLegacyShape,
  resolveActivePreset,
  resolveEffectiveGraphics,
} from "../lib/graphics/resolver";
import { collectDeviceSignals } from "../lib/graphics/deviceSignals";
import {
  useActiveGraphicsPreset,
  useEffectiveGraphics,
} from "./useEffectiveGraphics";

/**
 * Compat-shim hook: preserves the pre-Wave-α `ResolvedQualityProfile`
 * shape so the 5 existing call sites (Scene.tsx, Starfield.tsx,
 * StarHoverPicker.tsx, LayersPanel.tsx) keep
 * working unchanged while Wave α Commit 3 introduces the graphics
 * slice.
 *
 * The `mode` parameter is intentionally ignored at runtime — the
 * graphics slice (populated by the persist v0→v1 migration from the
 * user's historical `qualityMode`) is the single source of truth now.
 * Keeping the signature avoids a mechanical rewrite across the 5
 * consumers; Wave 6 deletes both the parameter and this shim.
 *
 * The returned shape is derived through:
 *   useEffectiveGraphics → resolveActivePreset → projectToLegacyShape
 * which guarantees byte-parity with `RESOLVED_PROFILES` for every
 * tier (pinned by `src/lib/graphics/resolver.test.ts`).
 */
export const useQualityProfile = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _mode: QualityMode = "auto",
  windowLike?: WindowLike
): ResolvedQualityProfile => {
  const effective = useEffectiveGraphics(windowLike);
  const preset = useActiveGraphicsPreset(windowLike);
  return projectToLegacyShape(effective, preset);
};

/**
 * Non-hook accessor for code paths that need the legacy shape outside
 * React (e.g., Scene.tsx's `glConfig` useMemo that reads
 * `qualityProfile.antialias` at Canvas construction). Kept for parity
 * with `resolveQualityProfile` in `qualityProfile.ts`.
 */
export const getQualityProfileFromState = (
  state: Parameters<typeof resolveEffectiveGraphics>[0],
  windowLike?: WindowLike
): ResolvedQualityProfile => {
  const signals = collectDeviceSignals(windowLike);
  const effective = resolveEffectiveGraphics(state, signals);
  const preset = resolveActivePreset(state, signals);
  return projectToLegacyShape(effective, preset);
};
