/**
 * Per-star info shape M6-D's `HygStarPanel` UI consumes.
 *
 * Lives outside the panel component file so:
 *   1. The Fast Refresh rule (react-refresh/only-export-components)
 *      stays clean — `HygStarPanel.tsx` only exports a component.
 *   2. The build helper is independently unit-testable without
 *      mounting the React tree.
 *   3. Future curated-body panels can reuse the formatting
 *      heuristics without taking a dependency on the HYG-specific
 *      panel surface.
 */

import type { HygCatalogData } from "../../utils/hygBinary";
import {
  massFromSpectAbsmag,
  parseSpectralClass,
  radiusFromSpect,
  temperatureFromBV,
  temperatureFromSpect,
} from "../stellarPhysics";
import { BAYER_TO_GREEK } from "./hygNameIndex";

export interface HygStarInfo {
  starIndex: number;
  properName: string | null;
  bayerAbbrev: string | null;
  bayerGreek: string | null;
  flamsteed: number;
  constellation: string | null;
  spect: string | null;
  hd: number;
  hip: number;
  gliese: string | null;
  mag: number;
  /** NaN if absent in the catalog. */
  absmag: number;
  bv: number;
  /** Distance from the Sun in parsec; 0 only for the (filtered-out) Sun row. */
  distancePc: number;
  /** Effective temperature in Kelvin; NaN if neither spect nor B-V are usable. */
  tEffK: number;
  /** Radius in solar units. */
  radiusSolar: number;
  /** Mass in solar units; NaN when class + absmag don't yield a usable estimate. */
  massSolar: number;
  /** Display string for the panel header (proper name preferred, then Bayer-Greek + con, ...). */
  primaryName: string;
  /** Comma-joined secondary designations or null when nothing else applies. */
  designation: string | null;
  /** Title to send to Wikipedia summary lookup; null when no human-readable name exists. */
  wikipediaQuery: string | null;
}

interface PrimaryNameArgs {
  properName: string;
  bayerGreek: string | null;
  bayerAbbrev: string;
  flamsteed: number;
  constellation: string;
  hd: number;
  hip: number;
  gliese: string;
  starIndex: number;
}

function buildPrimaryName(args: PrimaryNameArgs): string {
  if (args.properName) return args.properName;
  if (args.bayerGreek && args.constellation) {
    return `${args.bayerGreek} ${args.constellation}`;
  }
  if (args.bayerAbbrev && args.constellation) {
    return `${args.bayerAbbrev} ${args.constellation}`;
  }
  if (args.flamsteed > 0 && args.constellation) {
    return `${args.flamsteed} ${args.constellation}`;
  }
  if (args.hd > 0) return `HD ${args.hd}`;
  if (args.hip > 0) return `HIP ${args.hip}`;
  if (args.gliese) return args.gliese;
  return `Star #${args.starIndex}`;
}

interface DesignationArgs {
  hasProper: boolean;
  bayerGreek: string | null;
  flamsteed: number;
  constellation: string;
  hd: number;
  hip: number;
  gliese: string;
}

function buildDesignations(args: DesignationArgs): string | null {
  const parts: string[] = [];
  if (args.hasProper && args.bayerGreek && args.constellation) {
    parts.push(`${args.bayerGreek} ${args.constellation}`);
  }
  if (args.flamsteed > 0 && args.constellation) {
    parts.push(`${args.flamsteed} ${args.constellation}`);
  }
  if (args.hd > 0) parts.push(`HD ${args.hd}`);
  if (args.hip > 0) parts.push(`HIP ${args.hip}`);
  if (args.gliese) parts.push(args.gliese);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Build the displayable info for a single HYG star. Returns `null`
 * for out-of-range indices so callers can branch without throwing.
 */
export function buildHygStarInfo(
  catalog: HygCatalogData,
  starIndex: number
): HygStarInfo | null {
  if (starIndex < 0 || starIndex >= catalog.header.count) return null;

  const proper =
    catalog.properNameStrings[catalog.properNameIndices[starIndex]] ?? "";
  const bayerAbbrev =
    catalog.bayerStrings[catalog.bayerIndices[starIndex]] ?? "";
  const constellation =
    catalog.constellationStrings[catalog.constellationIndices[starIndex]] ?? "";
  const gliese = catalog.glieseStrings[catalog.glieseIndices[starIndex]] ?? "";
  const spect = catalog.spectStrings[catalog.spectIndices[starIndex]] ?? "";
  const flamsteed = catalog.flamsteed[starIndex];
  const hd = catalog.hd[starIndex];
  const hip = catalog.hip[starIndex];
  const mag = catalog.magnitudes[starIndex];
  const absmag = catalog.absmag[starIndex];
  const bv = catalog.colorIndices[starIndex];

  const px = catalog.positions[starIndex * 3 + 0];
  const py = catalog.positions[starIndex * 3 + 1];
  const pz = catalog.positions[starIndex * 3 + 2];
  const distancePc = Math.sqrt(px * px + py * py + pz * pz);

  // Derived stellar physics. Spect → tEff is preferred; Ballesteros
  // B-V is the fallback. Mass + radius use the full helpers
  // (with absmag refinement when finite).
  const parsed = spect ? parseSpectralClass(spect) : null;
  let tEffK: number;
  if (parsed) {
    tEffK = temperatureFromSpect(parsed.spectralClass, parsed.subclass);
  } else if (Number.isFinite(bv)) {
    tEffK = temperatureFromBV(bv);
  } else {
    tEffK = NaN;
  }
  const radiusSolar = radiusFromSpect(
    spect,
    Number.isFinite(absmag) ? absmag : undefined
  );
  const massSolar = massFromSpectAbsmag(
    spect,
    Number.isFinite(absmag) ? absmag : null
  );

  const bayerGreek = bayerAbbrev ? (BAYER_TO_GREEK[bayerAbbrev] ?? null) : null;

  const primaryName = buildPrimaryName({
    properName: proper,
    bayerGreek,
    bayerAbbrev,
    flamsteed,
    constellation,
    hd,
    hip,
    gliese,
    starIndex,
  });

  const designation = buildDesignations({
    hasProper: proper.length > 0,
    bayerGreek,
    flamsteed,
    constellation,
    hd,
    hip,
    gliese,
  });

  let wikipediaQuery: string | null = null;
  if (proper) wikipediaQuery = proper;
  else if (bayerGreek && constellation) {
    wikipediaQuery = `${bayerGreek} ${constellation}`;
  } else if (hd > 0) {
    wikipediaQuery = `HD ${hd}`;
  }

  return {
    starIndex,
    properName: proper || null,
    bayerAbbrev: bayerAbbrev || null,
    bayerGreek,
    flamsteed,
    constellation: constellation || null,
    spect: spect || null,
    hd,
    hip,
    gliese: gliese || null,
    mag,
    absmag,
    bv,
    distancePc,
    tEffK,
    radiusSolar,
    massSolar,
    primaryName,
    designation,
    wikipediaQuery,
  };
}
