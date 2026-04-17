import { parseHygBinaryBuffer, type HygCatalogData } from "../utils/hygBinary";
import { parseNASAStarFile, type NASAStar } from "../utils/nasaStarParser";

export type { NASAStar } from "../utils/nasaStarParser";
export type { HygCatalogData } from "../utils/hygBinary";

/**
 * Available starfield providers.
 *
 * - `hyg`: the primary preset, backed by the Astronexus HYG v4.2 database
 *   delivered as the binary assets under `public/data/hyg-stars/`. Carries
 *   real B-V colour, per-magnitude size and proper motion.
 * - `nasa`: the NASA "Eyes on the Solar System" asset family, kept around
 *   as a visual comparison reference.
 */
export type StarfieldSource = "hyg" | "nasa";
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
  nasa: {
    label: "NASA Eyes",
    creditsTitle: "NASA Eyes on the Solar System",
    creditsDescription:
      "Alternate starfield mode backed by the NASA Eyes asset split in public/data/nasa-stars, also used as a visual comparison reference.",
    creditsLink: "https://eyes.nasa.gov/",
    loadErrorMessage: "Failed to load NASA Eyes catalog",
  },
};

export const STARFIELD_SOURCE_LABELS: Record<StarfieldSource, string> = {
  hyg: STARFIELD_SOURCE_METADATA.hyg.label,
  nasa: STARFIELD_SOURCE_METADATA.nasa.label,
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

// --- NASA catalog loading (unchanged from the NASA Eyes binary family) -----

const NASA_STAR_FILES = [
  "galaxies.0.bin",
  "stars.0.bin",
  "stars.1.bin",
  "stars.2.bin",
  "stars.3.bin",
  "stars.4.bin",
  "stars.5.bin",
] as const;

const getNASAStarFilePath = (filename: string) =>
  `${import.meta.env.BASE_URL || "/"}data/nasa-stars/${filename}`;

let nasaStarCatalogCache: NASAStar[] | null = null;
let nasaStarCatalogPromise: Promise<NASAStar[]> | null = null;

export const getCachedNASAStarCatalog = () => nasaStarCatalogCache;

export const loadNASAStarCatalog = async (): Promise<NASAStar[]> => {
  if (nasaStarCatalogCache) {
    return nasaStarCatalogCache;
  }

  if (!nasaStarCatalogPromise) {
    nasaStarCatalogPromise = Promise.allSettled(
      NASA_STAR_FILES.map((file) =>
        parseNASAStarFile(getNASAStarFilePath(file))
      )
    )
      .then((results) => {
        const allStars: NASAStar[] = [];

        for (const result of results) {
          if (result.status === "fulfilled") {
            allStars.push(...result.value);
            continue;
          }

          console.warn("Failed to load NASA star file:", result.reason);
        }

        if (allStars.length === 0) {
          throw new Error(
            "No NASA star data loaded. Run: npm run download:nasa-stars"
          );
        }

        nasaStarCatalogCache = allStars;
        return allStars;
      })
      .catch((error: unknown) => {
        nasaStarCatalogPromise = null;
        throw error;
      });
  }

  return nasaStarCatalogPromise;
};

// --- HYG catalog loading (new pipeline) -------------------------------------
//
// The HYG binary ships under `public/data/hyg-stars/` in four LOD tiers. For
// HYG-B we always fetch the `full` tier; HYG-C will wire tier selection into
// the device quality profile. The runtime transparently decompresses the
// gzipped payload via `DecompressionStream` and falls back to the raw `.bin`
// when the stream API is missing (rare, only very old browsers).

export type HygTier = "low" | "medium" | "high" | "full";

const DEFAULT_HYG_TIER: HygTier = "full";

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
