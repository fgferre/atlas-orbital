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
}

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
  dprMax: number;
  shadowMapSize: number;
  environmentResolution: number;
  bloomEnabled: boolean;
  bloomIntensityMultiplier: number;
  /**
   * Multiplier applied to each starfield fragment's RGB output to lift
   * bright catalogue stars above the selective-bloom `luminanceThreshold`
   * (1.0) while leaving the faint tail below it. Landed in Wave α
   * Commit 2 (R1 #1B) alongside the HDR pipeline contract.
   *
   * Tier defaults: ultra 2.0 / high 1.8 / balanced 1.5 / constrained 1.0
   * — constrained keeps 1.0 because `bloomEnabled: false` on that tier
   * makes the gain cosmetic (faint stars in LDR range = no visible shift).
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
    dprMax: 2,
    shadowMapSize: 4096,
    environmentResolution: 256,
    bloomEnabled: true,
    bloomIntensityMultiplier: 1,
    vfxHdrGain: 2.0,
  },
  high: {
    name: "high",
    antialias: true,
    dprMax: 1.75,
    shadowMapSize: 4096,
    environmentResolution: 256,
    bloomEnabled: true,
    bloomIntensityMultiplier: 1,
    vfxHdrGain: 1.8,
  },
  balanced: {
    name: "balanced",
    antialias: false,
    dprMax: 1.5,
    shadowMapSize: 2048,
    environmentResolution: 128,
    bloomEnabled: true,
    bloomIntensityMultiplier: 0.75,
    vfxHdrGain: 1.5,
  },
  constrained: {
    name: "constrained",
    antialias: false,
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
  windowLike?: WindowLike
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

export const resolveQualityProfile = (
  mode: QualityMode,
  signals: DeviceSignals = {}
): ResolvedQualityProfile => {
  if (mode !== "auto") {
    return RESOLVED_PROFILES[mode];
  }

  const score = calculateQualityScore(signals);

  if (score >= 4) return RESOLVED_PROFILES.ultra;
  if (score >= 2) return RESOLVED_PROFILES.high;
  if (score >= -1) return RESOLVED_PROFILES.balanced;
  return RESOLVED_PROFILES.constrained;
};

export const getResolvedQualityProfileOptions = () => RESOLVED_PROFILES;
