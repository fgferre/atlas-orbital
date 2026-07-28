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
 * - Auto-mode picks a preset from device signals using the existing
 *   `calculateQualityScore` heuristic; Custom keeps `customBase` in
 *   `graphicsSlice` so "Reset to High" stays meaningful.
 */

import type {
  ResolvedQualityName,
  ResolvedQualityProfile,
  DeviceSignals,
} from "../qualityProfile";
import type { StarOpticsProfile } from "../starfieldShaderMath";
import { calculateQualityScore } from "./deviceSignals";

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
  /** Multiplier on `visualPreset.ambientIntensity`. */
  ambientIntensityMul?: number;
  /** Multiplier on `visualPreset.sunIntensity`. */
  sunIntensityMul?: number;
  /** Multiplier on `visualPreset.shadowIntensity`. */
  shadowIntensityMul?: number;
  /** Multiplier on `visualPreset.envMapIntensity`. */
  envMapIntensityMul?: number;
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
  /** Shadow map size override. */
  shadowMapSize?: 1024 | 2048 | 4096;
  /** Env-map resolution override. */
  environmentResolution?: 64 | 128 | 256;
  /** Bloom enable override. */
  bloomEnabled?: boolean;
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
  // Rendering (byte-match qualityProfile RESOLVED_PROFILES numerics)
  resolutionScale: number;
  antialias: boolean;
  shadowMapSize: 1024 | 2048 | 4096;
  environmentResolution: 64 | 128 | 256;
  bloomEnabled: boolean;
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
  shadowIntensityMul: number;
  envMapIntensityMul: number;
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
    shadowIntensityMul: 1,
    envMapIntensityMul: 1,
    lensFlareIntensityMul: 1,
    starOptics: "none",
  },
  high: {
    resolutionScale: 1.75,
    antialias: true,
    shadowMapSize: 4096,
    environmentResolution: 256,
    bloomEnabled: true,
    vfxHdrGain: 3.0,
    bloomIntensityMul: 1,
    bloomIntensity: undefined,
    toneMapping: "agx",
    saturationMul: 1,
    contrastDelta: 0,
    brightnessDelta: 0,
    ambientIntensityMul: 1,
    sunIntensityMul: 1,
    shadowIntensityMul: 1,
    envMapIntensityMul: 1,
    lensFlareIntensityMul: 1,
    starOptics: "none",
  },
  medium: {
    resolutionScale: 1.5,
    antialias: false,
    shadowMapSize: 2048,
    environmentResolution: 128,
    bloomEnabled: true,
    vfxHdrGain: 2.5,
    bloomIntensityMul: 0.75,
    bloomIntensity: undefined,
    toneMapping: "agx",
    saturationMul: 1,
    contrastDelta: 0,
    brightnessDelta: 0,
    ambientIntensityMul: 1,
    sunIntensityMul: 1,
    shadowIntensityMul: 1,
    envMapIntensityMul: 1,
    lensFlareIntensityMul: 1,
    starOptics: "none",
  },
  low: {
    resolutionScale: 1,
    antialias: false,
    shadowMapSize: 1024,
    environmentResolution: 64,
    bloomEnabled: false,
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
    shadowIntensityMul: 1,
    envMapIntensityMul: 1,
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
 * Auto-resolve a preset from device signals using the same scoring
 * heuristic that `qualityProfile.ts:resolveQualityProfile` applies in
 * `"auto"` mode. Keeps behavior identical when a user opts into Auto.
 */
export const autoResolvePreset = (
  signals: DeviceSignals
): Exclude<GraphicsPresetName, "custom"> => {
  const score = calculateQualityScore(signals);
  if (score >= 4) return "ultra";
  if (score >= 2) return "high";
  if (score >= -1) return "medium";
  return "low";
};

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
    shadowMapSize: ov.shadowMapSize ?? base.shadowMapSize,
    environmentResolution:
      ov.environmentResolution ?? base.environmentResolution,
    bloomEnabled: ov.bloomEnabled ?? base.bloomEnabled,
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
    shadowIntensityMul: base.shadowIntensityMul * (ov.shadowIntensityMul ?? 1),
    envMapIntensityMul: base.envMapIntensityMul * (ov.envMapIntensityMul ?? 1),
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
export const projectToLegacyShape = (
  effective: EffectiveGraphics,
  presetName: Exclude<GraphicsPresetName, "custom">
): ResolvedQualityProfile => ({
  name: mapPresetToTier(presetName),
  antialias: effective.antialias,
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
