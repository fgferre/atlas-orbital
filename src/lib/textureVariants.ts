import type { CelestialBody } from "../lib/astrophysics";

export type TextureChannel =
  | "map"
  | "clouds"
  | "night"
  | "ring"
  | "atmosphere"
  | "normal"
  | "roughness";

export type TextureQualityProfile =
  | "ultra"
  | "high"
  | "balanced"
  | "constrained";

export type TextureTier = "boot" | "2k" | "4k" | "8k";

export interface TextureVariantSelection {
  boot?: string;
  variants?: Partial<Record<Exclude<TextureTier, "boot">, string>>;
}

export type TextureVariantManifest = Record<
  string,
  Partial<Record<TextureChannel, TextureVariantSelection>>
>;

export interface ResolvedTextureRequest {
  bodyId: string;
  channel: TextureChannel;
  profile: TextureQualityProfile;
  salience: number;
  canonicalPath: string | null;
  selectedPath: string | null;
  selectedTier: TextureTier | "canonical" | null;
  source: "manifest" | "inferred" | "canonical" | "missing";
  isBootAsset: boolean;
  availablePaths: Partial<Record<TextureTier | "canonical", string>>;
}

const EMPTY_MANIFEST: TextureVariantManifest = {};

/**
 * Filenames (without extension) of source textures that have a
 * sibling `.webp` on disk. Keep this list in lockstep with
 * `scripts/optimize-textures.js` — if a conversion is discarded or a
 * new asset is added, update both sides.
 *
 * The match is exact-basename; callers pass a full URL path and the
 * helper extracts the basename before looking up.
 */
const WEBP_AVAILABLE_BASENAMES: ReadonlySet<string> = new Set([
  "4k_oberon",
  "8k_mercury",
  "8k_moon",
]);

/**
 * Runtime WebP support detection. Evaluated lazily once per module
 * load and cached. Returns `false` on non-DOM environments (SSR,
 * Node test runners without jsdom) so the runtime pipeline is
 * unchanged there.
 */
let cachedWebPSupport: boolean | null = null;
export const detectWebPSupport = (): boolean => {
  if (cachedWebPSupport !== null) return cachedWebPSupport;
  if (typeof document === "undefined") {
    cachedWebPSupport = false;
    return cachedWebPSupport;
  }
  try {
    const canvas = document.createElement("canvas");
    cachedWebPSupport =
      typeof canvas.toDataURL === "function" &&
      canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  } catch {
    cachedWebPSupport = false;
  }
  return cachedWebPSupport;
};

/** Test hook: reset the memoised WebP-support result. */
export const __resetWebPSupportCache = () => {
  cachedWebPSupport = null;
};

const getPathBasename = (texturePath: string): string => {
  const withoutQuery = texturePath.split("?")[0];
  const withoutHash = withoutQuery.split("#")[0];
  const fileName =
    withoutHash.slice(withoutHash.lastIndexOf("/") + 1) || withoutHash;
  const extIndex = fileName.lastIndexOf(".");
  return extIndex >= 0 ? fileName.slice(0, extIndex) : fileName;
};

/**
 * Rewrite a texture path to its `.webp` sibling when the browser
 * supports WebP and the sibling exists on disk. Returns the input
 * unchanged when either condition fails, so this is a safe no-op
 * for all textures not covered by `WEBP_AVAILABLE_BASENAMES`.
 */
export const preferWebPAsset = (texturePath: string | null): string | null => {
  if (!texturePath) return texturePath;
  if (!detectWebPSupport()) return texturePath;

  const baseName = getPathBasename(texturePath);
  if (!WEBP_AVAILABLE_BASENAMES.has(baseName)) return texturePath;

  const lastSlash = texturePath.lastIndexOf("/");
  const dir = lastSlash >= 0 ? texturePath.slice(0, lastSlash + 1) : "";
  return `${dir}${baseName}.webp`;
};

const PROFILE_PREFERENCES: Record<TextureQualityProfile, TextureTier[]> = {
  ultra: ["8k", "4k", "2k"],
  high: ["4k", "2k", "8k"],
  balanced: ["2k", "4k", "8k", "boot"],
  constrained: ["boot", "2k", "4k", "8k"],
};

/**
 * Salience below this is treated as OVERVIEW: the body is neither focused
 * (baseTextureSalience 1.0 at assetPriority 0) nor blown up on screen
 * (screenSalience). At/above it the body is focused or zoomed and earns the
 * full-resolution promotion its profile allows.
 *
 * The overview band caps VRAM at boot: with every body drawing its heaviest
 * 8k canonical up front, an ultra profile allocated ~3.9 GB and lost the GL
 * context on real GPUs (white screen, N-9). Serving small tiers in the
 * overview and only promoting full-res on focus is the root fix.
 */
const OVERVIEW_SALIENCE_THRESHOLD = 0.9;

/**
 * Overview tier order — prioritise the smallest tiers regardless of profile
 * (ultra included). 2k is served whenever a 2k variant exists; boot is the
 * next-lightest fallback; 4k/8k only appear when nothing lighter is available
 * (a body with no 2k variant keeps its canonical, unchanged).
 */
const OVERVIEW_PREFERENCE_ORDER = ["2k", "boot", "4k", "8k"] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const getCanonicalTexturePath = (
  body: CelestialBody,
  channel: TextureChannel
): string | null => {
  return body.textures?.[channel] ?? null;
};

const splitPath = (path: string) => {
  const lastSlashIndex = path.lastIndexOf("/");
  const directory =
    lastSlashIndex >= 0 ? path.slice(0, lastSlashIndex + 1) : "";
  const fileName = lastSlashIndex >= 0 ? path.slice(lastSlashIndex + 1) : path;
  const extensionIndex = fileName.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? fileName.slice(extensionIndex) : "";
  const baseName =
    extensionIndex >= 0 ? fileName.slice(0, extensionIndex) : fileName;

  return { directory, baseName, extension };
};

const inferCanonicalTier = (canonicalPath: string): TextureTier | null => {
  const { baseName } = splitPath(canonicalPath);
  const match = baseName.match(/^(boot|2k|4k|8k)([-_]).*$/i);

  if (!match) {
    return null;
  }

  return match[1].toLowerCase() as TextureTier;
};

const mergeVariantSelections = (
  manifestSelection?: TextureVariantSelection
) => {
  const merged: Partial<Record<TextureTier, string>> = {};

  if (manifestSelection?.variants) {
    for (const tier of ["8k", "4k", "2k"] as const) {
      const manifestPath = manifestSelection.variants[tier];
      if (manifestPath) {
        merged[tier] = manifestPath;
      }
    }
  }

  if (manifestSelection?.boot) {
    merged.boot = manifestSelection.boot;
  }

  return merged;
};

const getPreferenceOrder = (
  profile: TextureQualityProfile,
  salience: number,
  hasBootAsset: boolean
) => {
  const normalizedSalience = clamp01(salience);

  // Special case preserved: for the balanced profile with a manifest boot
  // asset and a near-invisible body, boot (< 2k) is the leanest first paint.
  if (profile === "balanced" && hasBootAsset && normalizedSalience <= 0.2) {
    return ["boot", "2k", "4k", "8k"] as const;
  }

  // OVERVIEW: body is neither focused nor zoomed. Serve small tiers for every
  // profile (ultra included) so boot no longer allocates full-res everywhere.
  // Salience already encodes focus/zoom, so no separate focusId is needed.
  if (normalizedSalience < OVERVIEW_SALIENCE_THRESHOLD) {
    return OVERVIEW_PREFERENCE_ORDER;
  }

  // FOCUS/zoom: promote full-res per the profile (ultra → 8k/full).
  return PROFILE_PREFERENCES[profile];
};

const pickVariant = (
  availablePaths: Partial<Record<TextureTier | "canonical", string>>,
  preferenceOrder: readonly TextureTier[]
) => {
  for (const tier of preferenceOrder) {
    const candidate = availablePaths[tier];
    if (candidate) {
      return {
        selectedPath: candidate,
        selectedTier: tier,
        source: "manifest" as const,
      };
    }
  }

  return null;
};

export const resolveTextureRequest = (
  body: CelestialBody,
  channel: TextureChannel,
  profile: TextureQualityProfile,
  salience = 1,
  manifest: TextureVariantManifest = EMPTY_MANIFEST
): ResolvedTextureRequest => {
  const canonicalPath = getCanonicalTexturePath(body, channel);
  const manifestSelection = manifest[body.id]?.[channel];
  const canonicalTier = canonicalPath
    ? inferCanonicalTier(canonicalPath)
    : null;
  const variantPaths = mergeVariantSelections(manifestSelection);

  const availablePaths: Partial<Record<TextureTier | "canonical", string>> = {
    ...variantPaths,
  };

  if (canonicalPath) {
    availablePaths.canonical = canonicalPath;
    if (canonicalTier) {
      availablePaths[canonicalTier] ??= canonicalPath;
    }
  }

  const preferenceOrder = getPreferenceOrder(
    profile,
    salience,
    Boolean(availablePaths.boot)
  );

  const preferredVariant = pickVariant(availablePaths, preferenceOrder);

  if (preferredVariant) {
    const selectedFromCanonical =
      canonicalPath != null && preferredVariant.selectedPath === canonicalPath;

    return {
      bodyId: body.id,
      channel,
      profile,
      salience: clamp01(salience),
      canonicalPath,
      selectedPath: preferWebPAsset(preferredVariant.selectedPath),
      selectedTier: preferredVariant.selectedTier,
      source: selectedFromCanonical ? "canonical" : "manifest",
      isBootAsset: preferredVariant.selectedTier === "boot",
      availablePaths,
    };
  }

  if (canonicalPath) {
    return {
      bodyId: body.id,
      channel,
      profile,
      salience: clamp01(salience),
      canonicalPath,
      selectedPath: preferWebPAsset(canonicalPath),
      selectedTier: "canonical",
      source: "canonical",
      isBootAsset: false,
      availablePaths,
    };
  }

  if (availablePaths.boot) {
    return {
      bodyId: body.id,
      channel,
      profile,
      salience: clamp01(salience),
      canonicalPath: null,
      selectedPath: preferWebPAsset(availablePaths.boot),
      selectedTier: "boot",
      source: "manifest",
      isBootAsset: true,
      availablePaths,
    };
  }

  return {
    bodyId: body.id,
    channel,
    profile,
    salience: clamp01(salience),
    canonicalPath: null,
    selectedPath: null,
    selectedTier: null,
    source: "missing",
    isBootAsset: false,
    availablePaths,
  };
};
