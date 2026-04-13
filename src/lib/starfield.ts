import tycho2CatalogBinaryUrl from "../data/tycho2-processed.bin?url";
import tycho2CatalogBinaryGzipUrl from "../data/tycho2-processed.bin.gz?url";
import { parseNASAStarFile, type NASAStar } from "../utils/nasaStarParser";
import {
  parseTycho2BinaryBuffer,
  type Tycho2CatalogData,
} from "../utils/tycho2Binary";

export type { NASAStar } from "../utils/nasaStarParser";

export type StarfieldSource = "tycho2" | "nasa";
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
  tycho2: {
    label: "HYG v4.2",
    creditsTitle: "HYG v4.2 processed catalog",
    creditsDescription:
      "Processed HYG v4.2 (Hipparcos/Yale/Gliese) star data with 117,931 runtime stars, shipped in the app's legacy tycho2 binary asset.",
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
  tycho2: STARFIELD_SOURCE_METADATA.tycho2.label,
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

  if (source === "tycho2") {
    return error.message.replaceAll("Tycho-2", STARFIELD_SOURCE_LABELS.tycho2);
  }

  return error.message;
};

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

let tycho2CatalogCache: Tycho2CatalogData | null = null;
let tycho2CatalogPromise: Promise<Tycho2CatalogData> | null = null;

let nasaStarCatalogCache: NASAStar[] | null = null;
let nasaStarCatalogPromise: Promise<NASAStar[]> | null = null;

const supportsGzipDecompression = () =>
  typeof DecompressionStream !== "undefined";

async function fetchTycho2BinaryAsset(): Promise<ArrayBuffer> {
  if (supportsGzipDecompression()) {
    try {
      const compressedResponse = await fetch(tycho2CatalogBinaryGzipUrl);
      if (!compressedResponse.ok || !compressedResponse.body) {
        throw new Error(
          `Failed to load compressed Tycho-2 catalog (${compressedResponse.status})`
        );
      }

      if (compressedResponse.headers.get("content-encoding") === "gzip") {
        return await compressedResponse.arrayBuffer();
      }

      const decompressedStream = compressedResponse.body.pipeThrough(
        new DecompressionStream("gzip")
      );

      return await new Response(decompressedStream).arrayBuffer();
    } catch (error) {
      console.warn("Falling back to uncompressed Tycho-2 catalog:", error);
    }
  }

  const binaryResponse = await fetch(tycho2CatalogBinaryUrl);
  if (!binaryResponse.ok) {
    throw new Error(
      `Failed to load Tycho-2 catalog (${binaryResponse.status})`
    );
  }

  return binaryResponse.arrayBuffer();
}

export const getCachedTycho2Catalog = () => tycho2CatalogCache;

export const loadTycho2Catalog = async (): Promise<Tycho2CatalogData> => {
  if (tycho2CatalogCache) {
    return tycho2CatalogCache;
  }

  if (!tycho2CatalogPromise) {
    tycho2CatalogPromise = fetchTycho2BinaryAsset()
      .then((buffer) => {
        const catalog = parseTycho2BinaryBuffer(buffer);
        tycho2CatalogCache = catalog;
        return catalog;
      })
      .catch((error: unknown) => {
        tycho2CatalogPromise = null;
        throw error;
      });
  }

  return tycho2CatalogPromise;
};

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
