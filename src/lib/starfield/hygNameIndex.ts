/**
 * HYG name index — search structure backing M6's SearchBar HYG matches.
 *
 * Builds a `Map<lowercased-key, starIndex[]>` over a parsed
 * `HygCatalogData` so the SearchBar can resolve a free-text query
 * (e.g. "Sirius", "α CMa", "HD 48915", "Gl 244") to one or more star
 * indices. The index covers five key shapes:
 *
 *   - properName               ("Sirius", "Tupã", ...)
 *   - "<bayer-abbrev> <con>"   ("alp cma", "bet ori", ...)
 *   - "<bayer-greek> <con>"    ("α cma", "β ori", ...) — same star,
 *                              second key so users can type either
 *                              the HYG abbreviation OR the Greek
 *                              glyph the IAU designation uses.
 *   - "hd <id>"                ("hd 48915")
 *   - "hip <id>"               ("hip 32349")
 *   - gliese designation       ("gl 244a", "gj 411", ...)
 *
 * Index queries are diacritic-insensitive (NFD + combining-marks
 * strip), so "tupa" matches "Tupã" and "bibha" matches "Bibhā" —
 * critical for the pt-BR keyboard path where typing accents
 * is friction.
 *
 * **Caching contract**: the module-level `WeakMap<HygCatalogData,
 * HygNameIndex>` caches one index per parsed catalog reference.
 * Re-runs against the same catalog return the cached structure;
 * GC can reclaim it when no consumer holds the catalog. Callers
 * never need to invalidate manually.
 */

import type { HygCatalogData } from "../../utils/hygBinary";

/**
 * IAU constellation abbreviation (HYG's `con` column) -> full display name.
 *
 * W4 moved this out of `StarHoverTooltip.tsx`, where it was a component-private
 * const, so the hover tooltip and the star panel cannot drift apart on what
 * "Ori" is called. This module is already the HYG-abbreviation-to-display
 * layer (see `BAYER_TO_GREEK` below) and is already imported by
 * `hygStarInfo.ts`, so nothing new is coupled by the move.
 *
 * Names are intentionally NOT translated. IAU constellation names are Latin
 * and are used untranslated in both locales, the same convention the catalog
 * itself follows.
 *
 * Keep the abbreviation for Bayer/Flamsteed designations ("beta Ori") and use
 * the expansion only where the constellation is the subject of the row —
 * "beta Orion" is not a designation anyone writes.
 */
export const CONSTELLATION_NAMES: Record<string, string> = {
  And: "Andromeda",
  Ant: "Antlia",
  Aps: "Apus",
  Aqr: "Aquarius",
  Aql: "Aquila",
  Ara: "Ara",
  Ari: "Aries",
  Aur: "Auriga",
  Boo: "Boötes",
  Cae: "Caelum",
  Cam: "Camelopardalis",
  Cnc: "Cancer",
  CVn: "Canes Venatici",
  CMa: "Canis Major",
  CMi: "Canis Minor",
  Cap: "Capricornus",
  Car: "Carina",
  Cas: "Cassiopeia",
  Cen: "Centaurus",
  Cep: "Cepheus",
  Cet: "Cetus",
  Cha: "Chamaeleon",
  Cir: "Circinus",
  Col: "Columba",
  Com: "Coma Berenices",
  CrA: "Corona Australis",
  CrB: "Corona Borealis",
  Crv: "Corvus",
  Crt: "Crater",
  Cru: "Crux",
  Cyg: "Cygnus",
  Del: "Delphinus",
  Dor: "Dorado",
  Dra: "Draco",
  Equ: "Equuleus",
  Eri: "Eridanus",
  For: "Fornax",
  Gem: "Gemini",
  Gru: "Grus",
  Her: "Hercules",
  Hor: "Horologium",
  Hya: "Hydra",
  Hyi: "Hydrus",
  Ind: "Indus",
  Lac: "Lacerta",
  Leo: "Leo",
  LMi: "Leo Minor",
  Lep: "Lepus",
  Lib: "Libra",
  Lup: "Lupus",
  Lyn: "Lynx",
  Lyr: "Lyra",
  Men: "Mensa",
  Mic: "Microscopium",
  Mon: "Monoceros",
  Mus: "Musca",
  Nor: "Norma",
  Oct: "Octans",
  Oph: "Ophiuchus",
  Ori: "Orion",
  Pav: "Pavo",
  Peg: "Pegasus",
  Per: "Perseus",
  Phe: "Phoenix",
  Pic: "Pictor",
  Psc: "Pisces",
  PsA: "Piscis Austrinus",
  Pup: "Puppis",
  Pyx: "Pyxis",
  Ret: "Reticulum",
  Sge: "Sagitta",
  Sgr: "Sagittarius",
  Sco: "Scorpius",
  Scl: "Sculptor",
  Sct: "Scutum",
  Ser: "Serpens",
  Sex: "Sextans",
  Tau: "Taurus",
  Tel: "Telescopium",
  Tri: "Triangulum",
  TrA: "Triangulum Australe",
  Tuc: "Tucana",
  UMa: "Ursa Major",
  UMi: "Ursa Minor",
  Vel: "Vela",
  Vir: "Virgo",
  Vol: "Volans",
  Vul: "Vulpecula",
};

/**
 * Expand a HYG `con` abbreviation for display, falling back to the
 * abbreviation itself when the catalog carries something unmapped — an
 * unfamiliar three-letter code is still more use than an empty cell.
 */
export const constellationDisplayName = (abbrev: string): string =>
  CONSTELLATION_NAMES[abbrev] ?? abbrev;

/**
 * HYG Bayer abbreviation → Greek letter glyph. HYG stores
 * Latin abbreviations ("Alp" / "Bet" / ...) per Yale Bright Star
 * Catalogue convention; canonical IAU display uses Greek glyphs.
 * The index keys BOTH forms so a user typing "alp cma" or
 * "α CMa" both land on Sirius.
 */
export const BAYER_TO_GREEK: Record<string, string> = {
  Alp: "α",
  Bet: "β",
  Gam: "γ",
  Del: "δ",
  Eps: "ε",
  Zet: "ζ",
  Eta: "η",
  The: "θ",
  Iot: "ι",
  Kap: "κ",
  Lam: "λ",
  Mu: "μ",
  Nu: "ν",
  Xi: "ξ",
  Omi: "ο",
  Pi: "π",
  Rho: "ρ",
  Sig: "σ",
  Tau: "τ",
  Ups: "υ",
  Phi: "φ",
  Chi: "χ",
  Psi: "ψ",
  Ome: "ω",
};

export type HygMatchedField = "proper" | "bayer" | "hd" | "hip" | "gliese";

export interface HygNameIndex {
  /**
   * The catalog this index was built against. Exposed so the
   * SearchBar can pass it back to `searchHygCatalog` without
   * re-resolving the cached reference.
   */
  catalog: HygCatalogData;
  /**
   * Lowercased / normalized key → list of star indices that match
   * the key (multiple stars can share the same Bayer designation
   * across binary systems, so the value is an array, not a single
   * index).
   */
  byKey: Map<string, number[]>;
  /** Per-key origin so search results carry the matched-field tag. */
  fieldByKey: Map<string, HygMatchedField>;
}

export interface HygSearchResult {
  starIndex: number;
  properName: string | null;
  bayerAbbrev: string | null;
  bayerGreek: string | null;
  constellation: string | null;
  spect: string | null;
  hd: number | null;
  hip: number | null;
  gliese: string | null;
  /**
   * Distance from the Sun in parsec, derived from the catalog's
   * Cartesian position. `null` if the catalog reports a degenerate
   * origin position (~0 pc, used by HYG for the Sun row, which
   * the build script already filters out).
   */
  distancePc: number | null;
  mag: number;
  matchedField: HygMatchedField;
  score: number;
}

/**
 * Normalize a string for index keying / query lookup. Strips
 * combining diacritic marks (Tupã → Tupa), lowercases, trims
 * whitespace, and collapses internal whitespace runs to single
 * spaces. Greek glyphs survive (NFD on basic Greek letters does
 * not decompose them).
 */
export function normalizeHygQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

const indexCache = new WeakMap<HygCatalogData, HygNameIndex>();

/**
 * Build (or return the cached) HYG name index for a parsed catalog.
 * Multiple calls with the same catalog reference reuse the same
 * `HygNameIndex` instance; the WeakMap allows GC to reclaim it once
 * no consumer holds the catalog reference.
 */
export function buildHygNameIndex(catalog: HygCatalogData): HygNameIndex {
  const cached = indexCache.get(catalog);
  if (cached) return cached;

  const byKey = new Map<string, number[]>();
  const fieldByKey = new Map<string, HygMatchedField>();

  const addKey = (
    rawKey: string,
    starIndex: number,
    field: HygMatchedField
  ): void => {
    const key = normalizeHygQuery(rawKey);
    if (!key) return;
    const existing = byKey.get(key);
    if (existing) {
      existing.push(starIndex);
    } else {
      byKey.set(key, [starIndex]);
      fieldByKey.set(key, field);
    }
  };

  const count = catalog.header.count;
  for (let i = 0; i < count; i++) {
    const proper =
      catalog.properNameStrings[catalog.properNameIndices[i]] ?? "";
    const bayerAbbrev = catalog.bayerStrings[catalog.bayerIndices[i]] ?? "";
    const con =
      catalog.constellationStrings[catalog.constellationIndices[i]] ?? "";
    const gliese = catalog.glieseStrings[catalog.glieseIndices[i]] ?? "";
    const hd = catalog.hd[i];
    const hip = catalog.hip[i];

    if (proper) addKey(proper, i, "proper");
    if (hd > 0) addKey(`hd ${hd}`, i, "hd");
    if (hip > 0) addKey(`hip ${hip}`, i, "hip");
    if (gliese) addKey(gliese, i, "gliese");
    if (bayerAbbrev && con) {
      addKey(`${bayerAbbrev} ${con}`, i, "bayer");
      const greek = BAYER_TO_GREEK[bayerAbbrev];
      if (greek) addKey(`${greek} ${con}`, i, "bayer");
    }
  }

  const index: HygNameIndex = { catalog, byKey, fieldByKey };
  indexCache.set(catalog, index);
  return index;
}

interface ScoredKeyMatch {
  score: number;
  field: HygMatchedField;
}

/**
 * Score a single index key against the normalized query. Mirrors the
 * tier rubric in `bodySearch.ts` (exact > prefix > word-prefix >
 * substring) so HYG and curated body results sort against the same
 * scale when interleaved in the SearchBar listbox.
 */
function scoreKey(key: string, query: string): number {
  if (key === query) return 140;
  if (key.startsWith(query)) return 110;
  for (const word of key.split(" ")) {
    if (word.startsWith(query)) return 90;
  }
  if (key.includes(query)) return 75;
  return 0;
}

/**
 * Search the HYG catalog by free-text query. Returns up to `limit`
 * star matches sorted by score (descending) then by apparent
 * magnitude (brightest first as tie-breaker, matching how named-star
 * lists conventionally surface the prominent body).
 */
export function searchHygCatalog(
  query: string,
  catalog: HygCatalogData,
  limit: number = 5
): HygSearchResult[] {
  const normalized = normalizeHygQuery(query);
  if (!normalized) return [];

  const index = buildHygNameIndex(catalog);
  const bestPerStar = new Map<number, ScoredKeyMatch>();

  for (const [key, starIndices] of index.byKey) {
    const score = scoreKey(key, normalized);
    if (score === 0) continue;
    const field = index.fieldByKey.get(key) ?? "proper";
    for (const starIndex of starIndices) {
      const existing = bestPerStar.get(starIndex);
      if (!existing || score > existing.score) {
        bestPerStar.set(starIndex, { score, field });
      }
    }
  }

  const results: HygSearchResult[] = [];
  for (const [starIndex, match] of bestPerStar) {
    results.push(buildSearchResult(catalog, starIndex, match));
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.mag - b.mag;
  });

  return results.slice(0, limit);
}

function buildSearchResult(
  catalog: HygCatalogData,
  starIndex: number,
  match: ScoredKeyMatch
): HygSearchResult {
  const proper =
    catalog.properNameStrings[catalog.properNameIndices[starIndex]] ?? "";
  const bayerAbbrev =
    catalog.bayerStrings[catalog.bayerIndices[starIndex]] ?? "";
  const con =
    catalog.constellationStrings[catalog.constellationIndices[starIndex]] ?? "";
  const gliese = catalog.glieseStrings[catalog.glieseIndices[starIndex]] ?? "";
  const spect = catalog.spectStrings[catalog.spectIndices[starIndex]] ?? "";
  const hd = catalog.hd[starIndex];
  const hip = catalog.hip[starIndex];

  const px = catalog.positions[starIndex * 3 + 0];
  const py = catalog.positions[starIndex * 3 + 1];
  const pz = catalog.positions[starIndex * 3 + 2];
  const distancePc = Math.sqrt(px * px + py * py + pz * pz);

  return {
    starIndex,
    properName: proper || null,
    bayerAbbrev: bayerAbbrev || null,
    bayerGreek: bayerAbbrev ? (BAYER_TO_GREEK[bayerAbbrev] ?? null) : null,
    constellation: con || null,
    spect: spect || null,
    hd: hd > 0 ? hd : null,
    hip: hip > 0 ? hip : null,
    gliese: gliese || null,
    distancePc: distancePc > 0 ? distancePc : null,
    mag: catalog.magnitudes[starIndex],
    matchedField: match.field,
    score: match.score,
  };
}
