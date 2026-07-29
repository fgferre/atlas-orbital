import { probeWebglCapabilities } from "./graphics/webglSupport";

export type QualityMode =
  | "auto"
  | "ultra"
  | "high"
  | "balanced"
  | "constrained";

export type ResolvedQualityName = Exclude<QualityMode, "auto">;

export interface DeviceSignals {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  effectiveType?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
  /**
   * `gl.MAX_TEXTURE_SIZE` from the boot probe. A capability, not a speed:
   * a weak integrated GPU reports 16384 exactly like a discrete one. It
   * may lower a tier, never raise one.
   */
  maxTextureSize?: number;
  /**
   * `true` only when the renderer names itself software. `undefined`
   * means unreadable, not hardware.
   */
  softwareRenderer?: boolean;
}

/** The GPU-derived subset of {@link DeviceSignals}. */
export type GpuCapabilitySignals = Pick<
  DeviceSignals,
  "maxTextureSize" | "softwareRenderer"
>;

export interface DeviceConnectionLike {
  effectiveType?: string;
}

export interface NavigatorLike {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: DeviceConnectionLike;
}

export interface WindowLike {
  innerWidth?: number;
  innerHeight?: number;
  devicePixelRatio?: number;
  navigator?: NavigatorLike;
  document?: {
    documentElement?: {
      clientWidth?: number;
      clientHeight?: number;
    };
  };
  addEventListener?: (
    type: string,
    listener: () => void,
    options?: boolean | AddEventListenerOptions
  ) => void;
  removeEventListener?: (
    type: string,
    listener: () => void,
    options?: boolean | EventListenerOptions
  ) => void;
}

export interface ResolvedQualityProfile {
  name: ResolvedQualityName;
  antialias: boolean;
  /**
   * MSAA sample count for the `EffectComposer`'s internal HalfFloat render
   * targets. Explicit because @react-three/postprocessing defaults to 8, and
   * that default was never a decision here: two full-resolution HalfFloat
   * buffers at 8x MSAA cost ~1.6 GB of VRAM on a 4K desktop, which is an order
   * of magnitude more than every planetary texture in the app combined. It
   * scales with devicePixelRatio squared, so desktop pays the most.
   */
  composerMultisampling: number;
  dprMax: number;
  shadowMapSize: number;
  environmentResolution: number;
  bloomEnabled: boolean;
  bloomIntensityMultiplier: number;
  /**
   * Legacy NASA-starfield RGB gain. The Gaia HYG path no longer uses
   * this value: it mirrors Gaia Sky's clamped star fragment and fixed
   * `u_alphaSizeBr.z` default instead.
   *
   * Tier defaults: ultra 4.0 / high 3.0 / balanced 2.5 / constrained 1.0
   * — constrained keeps 1.0 because `bloomEnabled: false` on that tier
   * makes the legacy gain cosmetic.
   * The earlier Wave α Commit 2 values (2.0 / 1.8 / 1.5 / 1.0) were
   * calibrated for the older per-pixel threshold checks. The current
   * Gaia HYG renderer gets named-star halo weight from LightGlow/lens
   * flare work, not from this selective-bloom gain.
   *
   * Commit 3 moves these values into the graphics resolver's
   * `PRESET_DEFAULTS`; this field stays on `ResolvedQualityProfile` as
   * the compat-shim projection so consumers keep a single read.
   */
  vfxHdrGain: number;
}

export const QUALITY_PROFILE_ORDER: ResolvedQualityName[] = [
  "ultra",
  "high",
  "balanced",
  "constrained",
];

const RESOLVED_PROFILES: Record<ResolvedQualityName, ResolvedQualityProfile> = {
  ultra: {
    name: "ultra",
    antialias: true,
    composerMultisampling: 4,
    dprMax: 2,
    shadowMapSize: 4096,
    environmentResolution: 256,
    bloomEnabled: true,
    bloomIntensityMultiplier: 1,
    vfxHdrGain: 4.0,
  },
  high: {
    name: "high",
    antialias: true,
    composerMultisampling: 2,
    dprMax: 1.75,
    shadowMapSize: 4096,
    environmentResolution: 256,
    bloomEnabled: true,
    bloomIntensityMultiplier: 1,
    vfxHdrGain: 3.0,
  },
  balanced: {
    name: "balanced",
    antialias: false,
    composerMultisampling: 0,
    dprMax: 1.5,
    shadowMapSize: 2048,
    environmentResolution: 128,
    bloomEnabled: true,
    bloomIntensityMultiplier: 0.75,
    vfxHdrGain: 2.5,
  },
  constrained: {
    name: "constrained",
    antialias: false,
    composerMultisampling: 0,
    dprMax: 1,
    shadowMapSize: 1024,
    environmentResolution: 64,
    bloomEnabled: false,
    bloomIntensityMultiplier: 0,
    vfxHdrGain: 1.0,
  },
};

const normalizeEffectiveType = (effectiveType?: string) =>
  effectiveType?.toLowerCase().trim();

const getViewportMaxSide = (signals: DeviceSignals) => {
  const width = signals.viewportWidth ?? 0;
  const height = signals.viewportHeight ?? 0;
  return Math.max(width, height);
};

export const collectDeviceSignals = (
  windowLike?: WindowLike,
  // A default parameter rather than caller injection: a future call site
  // that forgot to pass it would silently lose the GPU signal, which is
  // the exact bug class this exists to close.
  gpu: GpuCapabilitySignals = probeWebglCapabilities()
): DeviceSignals => {
  if (!windowLike) {
    return {};
  }

  const viewportWidth =
    windowLike.innerWidth ??
    windowLike.document?.documentElement?.clientWidth ??
    undefined;
  const viewportHeight =
    windowLike.innerHeight ??
    windowLike.document?.documentElement?.clientHeight ??
    undefined;

  return {
    deviceMemory: windowLike.navigator?.deviceMemory,
    hardwareConcurrency: windowLike.navigator?.hardwareConcurrency,
    effectiveType: windowLike.navigator?.connection?.effectiveType,
    viewportWidth,
    viewportHeight,
    devicePixelRatio: windowLike.devicePixelRatio,
    maxTextureSize: gpu.maxTextureSize,
    softwareRenderer: gpu.softwareRenderer,
  };
};

export const calculateQualityScore = (signals: DeviceSignals): number => {
  let score = 0;

  const deviceMemory = signals.deviceMemory;
  if (typeof deviceMemory === "number") {
    if (deviceMemory <= 2) score -= 2;
    else if (deviceMemory <= 4) score -= 1;
    else if (deviceMemory >= 16) score += 2;
    else if (deviceMemory >= 8) score += 1;
  }

  const hardwareConcurrency = signals.hardwareConcurrency;
  if (typeof hardwareConcurrency === "number") {
    if (hardwareConcurrency <= 4) score -= 1;
    else if (hardwareConcurrency >= 12) score += 2;
    else if (hardwareConcurrency >= 8) score += 1;
  }

  const effectiveType = normalizeEffectiveType(signals.effectiveType);
  if (effectiveType === "slow-2g" || effectiveType === "2g") {
    score -= 2;
  } else if (effectiveType === "3g") {
    score -= 1;
  }

  const viewportMaxSide = getViewportMaxSide(signals);
  if (viewportMaxSide > 0) {
    if (viewportMaxSide <= 900) score -= 1;
    else if (viewportMaxSide >= 1400) score += 1;
  }

  const devicePixelRatio = signals.devicePixelRatio;
  if (typeof devicePixelRatio === "number" && devicePixelRatio > 2.25) {
    score -= 1;
  }

  return score;
};

/**
 * GL-derived ceiling on the auto-resolved tier.
 *
 * One-way by construction. WebGL exposes capability, not throughput, so
 * these facts can prove a machine is *below* a tier and can never prove
 * it is above one. Folding them into the additive score instead would
 * let a large CPU/RAM total cancel a hard limit — a 32-core box on a
 * software rasterizer would still reach `high`.
 *
 * Known gap, stated rather than hidden: no static WebGL query separates
 * a weak integrated GPU from a discrete one (both report 16384), so the
 * 4K-desktop-on-a-weak-iGPU case is *not* caught here. Closing that
 * needs a measured signal — a frame-time sample after boot — which is a
 * different and larger change.
 */
const resolveGlTierCeiling = (signals: DeviceSignals): ResolvedQualityName => {
  if (signals.softwareRenderer === true) {
    return "constrained";
  }

  // `high` and `ultra` promote to 4096- and 8192-wide equirect maps.
  // Below 8192 the driver downscales that promotion anyway, so the
  // decode and the upload are paid for nothing.
  if (
    typeof signals.maxTextureSize === "number" &&
    signals.maxTextureSize > 0 &&
    signals.maxTextureSize < 8192
  ) {
    return "balanced";
  }

  return "ultra";
};

/**
 * Single source of truth for auto tier selection — the score ladder and
 * the hardware ceiling, in one place. `graphics/resolver.ts` maps the
 * result onto its own preset names rather than repeating the thresholds.
 */
export const resolveQualityTierFromSignals = (
  signals: DeviceSignals
): ResolvedQualityName => {
  const score = calculateQualityScore(signals);
  const scored: ResolvedQualityName =
    score >= 4
      ? "ultra"
      : score >= 2
        ? "high"
        : score >= -1
          ? "balanced"
          : "constrained";

  // QUALITY_PROFILE_ORDER runs best → worst, so the larger index is the
  // more constrained tier and always wins.
  return QUALITY_PROFILE_ORDER[
    Math.max(
      QUALITY_PROFILE_ORDER.indexOf(scored),
      QUALITY_PROFILE_ORDER.indexOf(resolveGlTierCeiling(signals))
    )
  ];
};

export const resolveQualityProfile = (
  mode: QualityMode,
  signals: DeviceSignals = {}
): ResolvedQualityProfile => {
  if (mode !== "auto") {
    return RESOLVED_PROFILES[mode];
  }

  return RESOLVED_PROFILES[resolveQualityTierFromSignals(signals)];
};

export const getResolvedQualityProfileOptions = () => RESOLVED_PROFILES;
