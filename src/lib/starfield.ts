import { parseHygBinaryBuffer, type HygCatalogData } from "../utils/hygBinary";
import type { ResolvedQualityName } from "./qualityProfile";

export type { HygCatalogData } from "../utils/hygBinary";

/**
 * Available starfield providers.
 *
 * - `hyg`: the only preset, backed by the Astronexus HYG v4.2 database
 *   delivered as the binary assets under `public/data/hyg-stars/`. Carries
 *   real B-V colour, per-magnitude size and proper motion.
 *
 * The NASA "Eyes on the Solar System" comparison preset was removed
 * 2026-07-28 — the HYG renderer had long superseded it and the second
 * catalog was dead weight in the loader, the UI and the credits. The type
 * stays a (one-member) union because the provider-state plumbing
 * (`useStarfieldCatalog`, `loaderStages`, `store.starfieldProviderStates`)
 * is keyed by it and is genuinely provider-agnostic.
 */
export type StarfieldSource = "hyg";
export type StarfieldLoadStatus = "idle" | "loading" | "ready" | "error";

export interface StarfieldSourceMetadata {
  label: string;
  creditsTitle: string;
  creditsDescription: string;
  creditsLink?: string;
  loadErrorMessage: string;
}

export interface StarfieldProviderState {
  status: StarfieldLoadStatus;
  error: string | null;
}

export const STARFIELD_SOURCE_METADATA: Record<
  StarfieldSource,
  StarfieldSourceMetadata
> = {
  hyg: {
    label: "HYG v4.2",
    creditsTitle: "HYG v4.2 stellar database",
    creditsDescription:
      "Astronexus HYG v4.2: 109,400 runtime stars with real B-V colour index, per-magnitude size, and annual proper motion from pmra/pmdec. Delivered as device-tier binaries under public/data/hyg-stars/.",
    creditsLink: "https://www.astronexus.com/hyg",
    loadErrorMessage: "Failed to load HYG v4.2 catalog",
  },
};

export const STARFIELD_SOURCE_LABELS: Record<StarfieldSource, string> = {
  hyg: STARFIELD_SOURCE_METADATA.hyg.label,
};

export const getStarfieldLoadErrorMessage = (
  source: StarfieldSource,
  error: unknown
) => {
  const fallback = STARFIELD_SOURCE_METADATA[source].loadErrorMessage;
  if (!(error instanceof Error) || !error.message) {
    return fallback;
  }
  return error.message;
};

// --- HYG catalog loading ----------------------------------------------------
//
// The HYG binary ships under `public/data/hyg-stars/` in four LOD tiers. For
// HYG-B we always fetch the `full` tier; HYG-C will wire tier selection into
// the device quality profile. The runtime transparently decompresses the
// gzipped payload via `DecompressionStream` and falls back to the raw `.bin`
// when the stream API is missing (rare, only very old browsers).

export type HygTier = "low" | "medium" | "high" | "full";

const DEFAULT_HYG_TIER: HygTier = "full";

/**
 * Map the resolved device quality profile to the HYG tier file the
 * browser should fetch. Wave α's UX pass bound each of the four
 * Display-panel presets to a distinct on-disk HYG binary so preset
 * clicks produce a visible density change (the earlier
 * `balanced → high` collapse made Medium and High render identically).
 *
 * Current mapping (gzip sizes measured from the on-disk v3 binaries
 * 2026-07-28 — the pre-v3 figures this docstring used to carry were
 * stale by up to 1.8×, which matters because they are exactly the
 * numbers a mobile / 3G tier decision reads):
 *   constrained → low    (19.5 KB gzip,     500 stars — mobile / 3G)
 *   balanced    → medium (304 KB gzip,   10 000 stars — gives Medium a
 *                         distinct density from High; keeps load
 *                         cost moderate for mid-range hardware)
 *   high        → high   (1.42 MB gzip,  50 000 stars — broadband
 *                         default; recovers tycho2-era density
 *                         without forcing the 109 k decode cost)
 *   ultra       → full   (3.04 MB gzip, 109 400 stars — opt-in ceiling;
 *                         every surviving HYG row after the offline
 *                         filter removes the Sun / invalid rows /
 *                         distance-sentinel entries)
 * The named-star sidecar (`hyg-v1.names.json`, 340 KB) is fetched
 * separately and only when hover labels are first used.
 *
 * Density is a pure count change: since the θ.2 rewrite every star is
 * drawn with the same flux-conserving PSF regardless of tier, so a
 * lower tier removes stars rather than dimming the ones that remain.
 */
export function hygTierForQuality(name: ResolvedQualityName): HygTier {
  switch (name) {
    case "constrained":
      return "low";
    case "balanced":
      return "medium";
    case "high":
      return "high";
    case "ultra":
      return "full";
  }
}

const getHygTierPath = (tier: HygTier, compressed: boolean) => {
  const base = import.meta.env.BASE_URL || "/";
  const suffix = compressed ? ".gz" : "";
  return `${base}data/hyg-stars/hyg-v1-${tier}.bin${suffix}`;
};

const supportsGzipDecompression = () =>
  typeof DecompressionStream !== "undefined";

async function fetchHygBinaryAsset(tier: HygTier): Promise<ArrayBuffer> {
  if (supportsGzipDecompression()) {
    try {
      const response = await fetch(getHygTierPath(tier, true));
      if (!response.ok || !response.body) {
        throw new Error(
          `Failed to load compressed HYG ${tier} catalog (${response.status})`
        );
      }

      // If the server already decompressed the body (Content-Encoding: gzip)
      // then the ArrayBuffer is the raw binary directly.
      if (response.headers.get("content-encoding") === "gzip") {
        return await response.arrayBuffer();
      }

      const decompressedStream = response.body.pipeThrough(
        new DecompressionStream("gzip")
      );
      return await new Response(decompressedStream).arrayBuffer();
    } catch (error) {
      console.warn("Falling back to uncompressed HYG catalog:", error);
    }
  }

  const response = await fetch(getHygTierPath(tier, false));
  if (!response.ok) {
    throw new Error(`Failed to load HYG ${tier} catalog (${response.status})`);
  }
  return response.arrayBuffer();
}

const hygCatalogCache = new Map<HygTier, HygCatalogData>();
const hygCatalogPromise = new Map<HygTier, Promise<HygCatalogData>>();

/**
 * A labelled star from `public/data/hyg-stars/hyg-v1.names.json`.
 * `index` points into the tier's binary record array; tier files are a
 * strict prefix of the next larger tier, so an entry that exists in the
 * Low tier also sits at the same index in Medium / High / Full.
 */
export interface HygNamedStar {
  index: number;
  proper?: string;
  bayer?: string;
  flam?: string;
  con?: string;
  hip?: number;
  mag: number;
}

export interface HygNamesSidecar {
  version: number;
  source: string;
  entries: HygNamedStar[];
}

/**
 * Runtime hover state — what the pointer currently resolves to, if anything.
 * `screenX` / `screenY` are pixel coordinates inside the canvas; the
 * tooltip uses them to position itself.
 */
export interface HoveredStarInfo {
  entry: HygNamedStar;
  distanceParsecs: number | null;
  colorIndex: number;
  screenX: number;
  screenY: number;
}

let hygNamesSidecarCache: HygNamesSidecar | null = null;
let hygNamesSidecarPromise: Promise<HygNamesSidecar> | null = null;

export const getCachedHygNamesSidecar = () => hygNamesSidecarCache;

/**
 * Fetch the named-star sidecar. Kept as a separate file so users who never
 * enable hover labels never pay the ~226 KB cost, and the binary catalog
 * stays pure numeric data. Only fetched on first call; cached forever after.
 */
export const loadHygNamesSidecar = async (): Promise<HygNamesSidecar> => {
  if (hygNamesSidecarCache) return hygNamesSidecarCache;
  if (hygNamesSidecarPromise) return hygNamesSidecarPromise;

  const base = import.meta.env.BASE_URL || "/";
  hygNamesSidecarPromise = fetch(`${base}data/hyg-stars/hyg-v1.names.json`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load HYG names sidecar (${response.status})`
        );
      }
      const payload = (await response.json()) as HygNamesSidecar;
      hygNamesSidecarCache = payload;
      return payload;
    })
    .catch((error: unknown) => {
      hygNamesSidecarPromise = null;
      throw error;
    });

  return hygNamesSidecarPromise;
};

export const getCachedHygCatalog = (tier: HygTier = DEFAULT_HYG_TIER) =>
  hygCatalogCache.get(tier) ?? null;

export const loadHygCatalog = async (
  tier: HygTier = DEFAULT_HYG_TIER
): Promise<HygCatalogData> => {
  const cached = hygCatalogCache.get(tier);
  if (cached) return cached;

  const inflight = hygCatalogPromise.get(tier);
  if (inflight) return inflight;

  const promise = fetchHygBinaryAsset(tier)
    .then((buffer) => {
      const catalog = parseHygBinaryBuffer(buffer);
      hygCatalogCache.set(tier, catalog);
      return catalog;
    })
    .catch((error: unknown) => {
      hygCatalogPromise.delete(tier);
      throw error;
    });

  hygCatalogPromise.set(tier, promise);
  return promise;
};
