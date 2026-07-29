/**
 * Graphics resolver — single source of truth for "what values should the
 * renderer apply this frame" given the persisted preset, the override
 * layer, and live device signals.
 *
 * Wave α Commit 3 (R2 Wave 1) lands this module. Wave 0 pre-wired the
 * per-frame write path via `useVisualPresetLerp`'s `userOverrides`
 * parameter; Commit 3 plugs the resolver's output into that parameter
 * through the `useEffectiveGraphics` hook and the compat shim on
 * `qualityProfile.ts`.
 *
 * Invariants (per graphics-settings-design.md §9):
 * - PRESET_DEFAULTS Rendering block BYTE-MATCHES `qualityProfile.ts`'s
 *   `RESOLVED_PROFILES` numerics — pinned by `resolver.test.ts`.
 * - `graphicsOverrides = {}` yields the preset base; all *Mul fields
 *   default to 1, all *Delta fields default to 0, bare fields are
 *   absolute overrides (undefined = fall through).
 * - Auto-mode picks a preset from device signals via
 *   `resolveQualityTierFromSignals` (the score heuristic plus the GPU
 *   capability ceiling); Custom keeps `customBase` in `graphicsSlice`
 *   so "Reset to High" stays meaningful.
 */

import type {
  ResolvedQualityName,
  ResolvedQualityProfile,
  DeviceSignals,
} from "../qualityProfile";
import type { StarOpticsProfile } from "../starfieldShaderMath";
import { resolveQualityTierFromSignals } from "./deviceSignals";

/** User-facing preset identifier. `custom` = at least one override is set. */
export type GraphicsPresetName = "low" | "medium" | "high" | "ultra" | "custom";

/** Presets excluding `custom` — i.e., the concrete defaults tables. */
export type GraphicsBasePreset = Exclude<GraphicsPresetName, "custom">;

/** Per-field overrides carried on the persisted slice. */
export interface GraphicsOverrides {
  /** Multiplier on `preset.bloomIntensityMul × visualPreset.bloomIntensity`. */
  bloomIntensityMul?: number;
  /** Absolute bloom intensity override; lets users opt into bloom over Gaia's 0.0 default. */
  bloomIntensity?: number;
  /** Absolute override for bloom threshold (preset base ignored). */
  bloomThreshold?: number;
  /** Multiplier on `visualPreset.saturation`. */
  saturationMul?: number;
  /** Additive delta over `visualPreset.contrast`. */
  contrastDelta?: number;
  /** Additive delta over `visualPreset.brightness`. */
  brightnessDelta?: number;
  /**
   * Multiplier on the display ambient floor composed in
   * `resolveLerpRefTargets` (Onda 1.3) — see that function's JSDoc and
   * `AMBIENT_VIEWING_FLOOR` in `visualPresetOverrides.ts` for the
   * citations. Field name kept from the pre-Onda-1 "ambient intensity
   * multiplier" control it repurposes; the DisplayPanel label changed
   * to "Ambient Floor ×" to describe the new behavior.
   */
  ambientIntensityMul?: number;
  /** Multiplier on `visualPreset.sunIntensity`. */
  sunIntensityMul?: number;
  /**
   * Multiplier on the COMPLEX `LensFlareEffect` `u_flareIntensity`
   * knob (atlas-only UX tuning, not in Gaia). Default 1.0; users can
   * dial down the lens-flare composite (halo + ghosts) without
   * touching the underlying COMPLEX shader port. The shader stays 1:1
   * with `lensflare.frag.glsl` — this multiplier scales the final
   * additive contribution before the composer ADD blend.
   */
  lensFlareIntensityMul?: number;
  /**
   * User-selected tone mapping operator. Default per preset is "agx" on
   * composer-enabled tiers (ultra/high/medium) — see PRESET_DEFAULTS — and
   * "none" on `low` because Scene.tsx unmounts the EffectComposer there.
   */
  toneMapping?: ToneMappingName;
  /** Resolution scale override (dprMax). */
  resolutionScale?: number;
  /** Antialias override (reload-required per graphics-settings-design §8). */
  antialias?: boolean;
  /** Bloom enable override. */
  bloomEnabled?: boolean;
  /**
   * LightGlow (theta.3) enable override. Default `true` — unaudited
   * change from the pre-existing always-on behavior. A runtime FPS A/B
   * was attempted (starfield-visual-upgrade wave) but every environment
   * available in that session resolved to the `constrained` quality tier
   * (no real GPU), which unmounts the whole EffectComposer including
   * LightGlow — so the audit could not produce a real-hardware number.
   * This flag exists so the decision (>=10% frame-time win on a real
   * ultra/high tier -> flip this default to false) can be made from an
   * actual measurement instead of guessed. See the wave file's "LightGlow
   * performance audit" section for the full trail.
   */
  lightGlowEnabled?: boolean;
  /** vfxHdrGain absolute override (preset base ignored). */
  vfxHdrGain?: number;
  /**
   * Simulated aperture for the star field's diffraction spikes.
   *
   * Not a look preset: a star has no spikes, they are the Fourier
   * transform of whatever obstructs a specific instrument's aperture.
   * Rendering them unlabelled would present an instrument artefact as
   * sky, so the choice is the user's, it is named after the aperture it
   * simulates, and the Credits panel states which one is active. The
   * default is `none` — the unaided eye.
   */
  starOptics?: StarOpticsProfile;
}

export type ToneMappingName = "none" | "agx" | "aces" | "reinhard" | "cineon";

/**
 * Flat contract of everything the renderer needs for a frame. Constructed
 * from `(presetBase, overrides, deviceSignals)` by `resolveEffectiveGraphics`.
 */
export interface EffectiveGraphics {
  // Rendering (byte-match qualityProfile RESOLVED_PROFILES numerics).
  // shadowMapSize / environmentResolution are tier-only (not user
  // overridable) — see resolver.ts's GraphicsOverrides JSDoc trail for
  // why the Onda 1.1 removal left them here: SceneLighting's
  // SmartSunLight and the Environment cubemap still consume them, they
  // just no longer take a DisplayPanel override.
  resolutionScale: number;
  antialias: boolean;
  shadowMapSize: 1024 | 2048 | 4096;
  environmentResolution: 64 | 128 | 256;
  bloomEnabled: boolean;
  lightGlowEnabled: boolean;
  vfxHdrGain: number;
  // Post-process override layer (multiplicative / additive over visualPreset)
  bloomIntensityMul: number;
  bloomIntensity?: number;
  bloomThreshold?: number;
  toneMapping: ToneMappingName;
  saturationMul: number;
  contrastDelta: number;
  brightnessDelta: number;
  ambientIntensityMul: number;
  sunIntensityMul: number;
  lensFlareIntensityMul: number;
  starOptics: StarOpticsProfile;
}

/**
 * Preset defaults. Byte-match the Rendering block to
 * `qualityProfile.ts` `RESOLVED_PROFILES` — verified by `resolver.test.ts`.
 * Commit 3's compat shim reads through this table; existing 28 consumer
 * sites keep working unchanged.
 */
export const PRESET_DEFAULTS: Record<
  Exclude<GraphicsPresetName, "custom">,
  EffectiveGraphics
> = {
  ultra: {
    resolutionScale: 2,
    antialias: true,
    shadowMapSize: 4096,
    environmentResolution: 256,
    bloomEnabled: true,
    lightGlowEnabled: true,
    vfxHdrGain: 4.0,
    bloomIntensityMul: 1,
    bloomIntensity: undefined,
    // AgX is now the default display transform. Atlas's EffectComposer runs
    // on a HalfFloat target end-to-end (see PostProcessingPipeline.tsx:167),
    // so without a filmic operator every genuinely-HDR pixel — Sun disk,
    // sun-glint, lit terminator — hard-clips to flat white. AgX preserves
    // hue through the shoulder and gives highlights shape, which is exactly
    // the 2-magnitude grey range the starfield black-point note in
    // starfieldShaderMath.ts was fighting. User can switch to ACES / Reinhard
    // / Cineon / None from the Display panel; the override composes cleanly.
    // See tasks/archive/sweeps/opportunity-sweep-findings-v2-2026-06-16.md §127.
    toneMapping: "agx",
    saturationMul: 1,
    contrastDelta: 0,
    brightnessDelta: 0,
    ambientIntensityMul: 1,
    sunIntensityMul: 1,
    lensFlareIntensityMul: 1,
    starOptics: "none",
  },
  high: {
    resolutionScale: 1.75,
    antialias: true,
    shadowMapSize: 4096,
    environmentResolution: 256,
    bloomEnabled: true,
    lightGlowEnabled: true,
    vfxHdrGain: 3.0,
    bloomIntensityMul: 1,
    bloomIntensity: undefined,
    toneMapping: "agx",
    saturationMul: 1,
    contrastDelta: 0,
    brightnessDelta: 0,
    ambientIntensityMul: 1,
    sunIntensityMul: 1,
    lensFlareIntensityMul: 1,
    starOptics: "none",
  },
  medium: {
    resolutionScale: 1.5,
    antialias: false,
    shadowMapSize: 2048,
    environmentResolution: 128,
    bloomEnabled: true,
    lightGlowEnabled: true,
    vfxHdrGain: 2.5,
    bloomIntensityMul: 0.75,
    bloomIntensity: undefined,
    toneMapping: "agx",
    saturationMul: 1,
    contrastDelta: 0,
    brightnessDelta: 0,
    ambientIntensityMul: 1,
    sunIntensityMul: 1,
    lensFlareIntensityMul: 1,
    starOptics: "none",
  },
  low: {
    resolutionScale: 1,
    antialias: false,
    shadowMapSize: 1024,
    environmentResolution: 64,
    bloomEnabled: false,
    // Moot in practice: Scene.tsx unmounts the whole EffectComposer (and
    // therefore LightGlowSlot) on this tier regardless of this value —
    // kept `true` for consistency with the other tiers rather than
    // carrying a value nothing reads.
    lightGlowEnabled: true,
    vfxHdrGain: 1.0,
    bloomIntensityMul: 0,
    bloomIntensity: undefined,
    // Constrained tier keeps `none`: Scene.tsx unmounts the entire
    // EffectComposer when name === "constrained" (see Scene.tsx:522),
    // so no ToneMapping pass ever runs here — making the field a no-op
    // rather than a misleading default. Also preserves strict Gaia
    // parity (config.yaml: bloom.intensity 0, tonemapping NONE) as the
    // honest floor of the adaptive ladder, per
    // tasks/archive/sweeps/opportunity-sweep-findings-v2-2026-06-16.md §127.
    toneMapping: "none",
    saturationMul: 1,
    contrastDelta: 0,
    brightnessDelta: 0,
    ambientIntensityMul: 1,
    sunIntensityMul: 1,
    lensFlareIntensityMul: 1,
    starOptics: "none",
  },
};

/**
 * Persisted slice shape consumed by the resolver. Matches the
 * `GraphicsState` contract in `src/store/graphicsSlice.ts` without
 * importing from it (keeps the resolver free of store dependencies for
 * unit testing).
 */
export interface GraphicsStateLike {
  graphicsPreset: GraphicsPresetName;
  graphicsAutoMode: boolean;
  graphicsOverrides: GraphicsOverrides;
  customBase: Exclude<GraphicsPresetName, "custom">;
}

/**
 * Map an auto-resolved quality tier to the user-facing preset name.
 * `balanced` → `medium`, `constrained` → `low`; others pass through.
 */
export const mapTierToPreset = (
  tier: ResolvedQualityName
): Exclude<GraphicsPresetName, "custom"> => {
  switch (tier) {
    case "balanced":
      return "medium";
    case "constrained":
      return "low";
    case "ultra":
      return "ultra";
    case "high":
      return "high";
  }
};

/** Inverse of `mapTierToPreset` — used by the legacy-shape projection. */
export const mapPresetToTier = (
  preset: Exclude<GraphicsPresetName, "custom">
): ResolvedQualityName => {
  switch (preset) {
    case "medium":
      return "balanced";
    case "low":
      return "constrained";
    case "ultra":
      return "ultra";
    case "high":
      return "high";
  }
};

/**
 * Auto-resolve a preset from device signals. Delegates to
 * `resolveQualityTierFromSignals` rather than repeating the threshold
 * ladder, so the score cutoffs and the GPU ceiling live in exactly one
 * place — this is the only auto path with runtime consumers.
 */
export const autoResolvePreset = (
  signals: DeviceSignals
): Exclude<GraphicsPresetName, "custom"> =>
  mapTierToPreset(resolveQualityTierFromSignals(signals));

/**
 * Core resolver. Given the persisted state and live device signals,
 * returns the concrete `EffectiveGraphics` the renderer + panel should
 * use.
 *
 * Precedence:
 *   1. If `graphicsAutoMode`, device signals pick the preset.
 *   2. Else if `graphicsPreset === "custom"`, the `customBase` preset
 *      is the foundation, and overrides layer on top.
 *   3. Else the named preset is the foundation.
 *   4. `graphicsOverrides` merge last — absolute fields replace, *Mul
 *      and *Delta fields compose with the base.
 *
 * The design doc's §7 pattern `{ ...PRESET_DEFAULTS[preset], ...overrides }`
 * works for absolute fields but silently breaks for *Mul/*Delta (they
 * would replace the preset's own multiplier rather than compose). Since
 * PRESET_DEFAULTS only carries `1` for all *Mul except
 * `bloomIntensityMul` (where medium=0.75 / low=0) and `0` for all
 * *Delta, the explicit merge below is equivalent TODAY, but future
 * per-tier override tuning would want per-field composition semantics.
 * Kept explicit for readability.
 */
export const resolveEffectiveGraphics = (
  state: GraphicsStateLike,
  signals: DeviceSignals
): EffectiveGraphics => {
  const presetName: Exclude<GraphicsPresetName, "custom"> =
    state.graphicsAutoMode
      ? autoResolvePreset(signals)
      : state.graphicsPreset === "custom"
        ? state.customBase
        : state.graphicsPreset;

  const base = PRESET_DEFAULTS[presetName];
  const ov = state.graphicsOverrides;

  return {
    resolutionScale: ov.resolutionScale ?? base.resolutionScale,
    antialias: ov.antialias ?? base.antialias,
    // Onda 1.1: shadowMapSize / environmentResolution are no longer
    // user-overridable (the DisplayPanel controls drove an inert
    // SmartSunLight shadow map and a cubemap whose intensity is force-
    // zeroed by every preset — see visualPresets.ts's envMapIntensity
    // JSDoc). Tier value only.
    shadowMapSize: base.shadowMapSize,
    environmentResolution: base.environmentResolution,
    bloomEnabled: ov.bloomEnabled ?? base.bloomEnabled,
    lightGlowEnabled: ov.lightGlowEnabled ?? base.lightGlowEnabled,
    vfxHdrGain: ov.vfxHdrGain ?? base.vfxHdrGain,
    bloomIntensityMul: base.bloomIntensityMul * (ov.bloomIntensityMul ?? 1),
    bloomIntensity: ov.bloomIntensity,
    bloomThreshold: ov.bloomThreshold,
    toneMapping: ov.toneMapping ?? base.toneMapping,
    saturationMul: base.saturationMul * (ov.saturationMul ?? 1),
    contrastDelta: base.contrastDelta + (ov.contrastDelta ?? 0),
    brightnessDelta: base.brightnessDelta + (ov.brightnessDelta ?? 0),
    ambientIntensityMul:
      base.ambientIntensityMul * (ov.ambientIntensityMul ?? 1),
    sunIntensityMul: base.sunIntensityMul * (ov.sunIntensityMul ?? 1),
    lensFlareIntensityMul:
      base.lensFlareIntensityMul * (ov.lensFlareIntensityMul ?? 1),
    starOptics: ov.starOptics ?? base.starOptics,
  };
};

/**
 * Project the effective graphics into the legacy
 * `ResolvedQualityProfile` shape for the 28 consumer sites that predate
 * Wave α Commit 3. `qualityProfile.ts` uses this inside
 * `getQualityProfile` so `useQualityProfile` keeps working as a
 * backward-compatible read path until Wave 6 inlines the new fields.
 *
 * The `name` field is resolved from the preset used to compute
 * `effective` (caller provides it since `EffectiveGraphics` itself is
 * name-less after the merge).
 */
const COMPOSER_MULTISAMPLING: Record<ResolvedQualityName, number> = {
  ultra: 4,
  high: 2,
  balanced: 0,
  constrained: 0,
};

export const projectToLegacyShape = (
  effective: EffectiveGraphics,
  presetName: Exclude<GraphicsPresetName, "custom">
): ResolvedQualityProfile => ({
  name: mapPresetToTier(presetName),
  antialias: effective.antialias,
  // Derived from the tier rather than carried on EffectiveGraphics: composer
  // MSAA is a VRAM budget decision, not a user-facing graphics slider.
  composerMultisampling: COMPOSER_MULTISAMPLING[mapPresetToTier(presetName)],
  dprMax: effective.resolutionScale,
  shadowMapSize: effective.shadowMapSize,
  environmentResolution: effective.environmentResolution,
  bloomEnabled: effective.bloomEnabled,
  bloomIntensityMultiplier: effective.bloomIntensityMul,
  vfxHdrGain: effective.vfxHdrGain,
});

/**
 * Resolve the active preset name the resolver used. Separated so the
 * compat shim can compute it once and pass to both
 * `resolveEffectiveGraphics` and `projectToLegacyShape`.
 */
export const resolveActivePreset = (
  state: GraphicsStateLike,
  signals: DeviceSignals
): Exclude<GraphicsPresetName, "custom"> =>
  state.graphicsAutoMode
    ? autoResolvePreset(signals)
    : state.graphicsPreset === "custom"
      ? state.customBase
      : state.graphicsPreset;
