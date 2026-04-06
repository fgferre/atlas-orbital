import type { CelestialBody } from "../lib/astrophysics";

export type TextureChannel = "map" | "clouds" | "night" | "ring" | "atmosphere";

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

const PROFILE_PREFERENCES: Record<TextureQualityProfile, TextureTier[]> = {
  ultra: ["8k", "4k", "2k"],
  high: ["4k", "2k", "8k"],
  balanced: ["2k", "4k", "8k", "boot"],
  constrained: ["boot", "2k", "4k", "8k"],
};

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

  if (profile === "balanced" && hasBootAsset && normalizedSalience <= 0.2) {
    return ["boot", "2k", "4k", "8k"] as const;
  }

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
      selectedPath: preferredVariant.selectedPath,
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
      selectedPath: canonicalPath,
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
      selectedPath: availablePaths.boot,
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
