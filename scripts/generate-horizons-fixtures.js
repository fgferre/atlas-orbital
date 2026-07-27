#!/usr/bin/env node

/**
 * NASA JPL Horizons Fixture Generator
 *
 * Generates reference position fixtures from NASA Horizons API for
 * numerical regression testing of the orbital engine.
 *
 * Usage:
 *   node scripts/generate-horizons-fixtures.js
 *
 * Optional environment variables:
 *   HORIZONS_DATES=2020-01-01T00:00:00Z,2021-01-01T00:00:00Z
 *   HORIZONS_BODIES=europa,ganymede   (comma-separated subset of body ids)
 *   HORIZONS_RATE_LIMIT_MS=250
 *   HORIZONS_SKIP_EXISTING=1          (skip bodies already on disk for date)
 *   HORIZONS_MODE=vectors|subpoint    (default: vectors)
 *
 * ## `subpoint` mode — the orientation oracle
 *
 * `vectors` fixtures answer "is the body in the right PLACE". They say nothing
 * about which way it is FACING, so the whole of W6 — poles, prime meridians,
 * spin phase — had no ground truth on disk and fell back to a human being asked
 * to judge a terminator by eye. Nobody can see 2° of longitude, so that was not
 * a gate.
 *
 * `subpoint` mode asks Horizons for the **sub-observer point of the body as
 * seen from the Sun**: the body-fixed latitude/longitude where the Sun is
 * directly overhead. That is a pure orientation quantity — it moves if and only
 * if the pole, the prime-meridian constant, the spin rate or the time scale is
 * wrong — and JPL computes it from the same IAU model the catalog transcribes,
 * but from **JPL's own** transcription. So it falsifies this repo's copy of the
 * numbers, which is the named risk of the wave.
 *
 * **Light time is in these values and must not be "corrected" with a fudge.**
 * Horizons reports where the sub-solar point was when the light left, so its
 * value equals the geometric one evaluated at `t − range/c`. The fixture
 * therefore stores `lightTimeSeconds` and the consumer re-evaluates at the
 * retarded instant. Confirmed numerically for Earth at 2026-03-20T12:00Z:
 * Horizons 3.9351°E, geometric ≈1.85°E, and Earth turns 2.08° in the 499 s of
 * light time.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(
  __dirname,
  "..",
  "src",
  "test",
  "fixtures",
  "horizons"
);

const API_ENDPOINT = "https://ssd.jpl.nasa.gov/api/horizons.api";

// Bodies required by the recovery plan. Centers match the parent-centric
// local coordinates used by Atlas instead of Solar System barycentric vectors.
const TARGET_BODIES = [
  // Major planets (heliocentric)
  { id: "mercury", command: "199", center: "500@10", name: "Mercury" },
  { id: "earth", command: "399", center: "500@10", name: "Earth" },
  { id: "mars", command: "499", center: "500@10", name: "Mars" },
  { id: "neptune", command: "899", center: "500@10", name: "Neptune" },
  { id: "pluto", command: "999", center: "500@10", name: "Pluto" },
  // Earth system
  { id: "moon", command: "301", center: "500@399", name: "Moon" },
  // Martian moons
  { id: "phobos", command: "401", center: "500@499", name: "Phobos" },
  { id: "deimos", command: "402", center: "500@499", name: "Deimos" },
  // Galilean moons
  { id: "io", command: "501", center: "500@599", name: "Io" },
  { id: "europa", command: "502", center: "500@599", name: "Europa" },
  { id: "ganymede", command: "503", center: "500@599", name: "Ganymede" },
  { id: "callisto", command: "504", center: "500@599", name: "Callisto" },
  // Saturnian moons
  { id: "mimas", command: "601", center: "500@699", name: "Mimas" },
  { id: "enceladus", command: "602", center: "500@699", name: "Enceladus" },
  { id: "tethys", command: "603", center: "500@699", name: "Tethys" },
  { id: "dione", command: "604", center: "500@699", name: "Dione" },
  { id: "rhea", command: "605", center: "500@699", name: "Rhea" },
  { id: "titan", command: "606", center: "500@699", name: "Titan" },
  { id: "iapetus", command: "608", center: "500@699", name: "Iapetus" },
  // Uranian moons
  { id: "miranda", command: "705", center: "500@799", name: "Miranda" },
  { id: "ariel", command: "701", center: "500@799", name: "Ariel" },
  { id: "umbriel", command: "702", center: "500@799", name: "Umbriel" },
  { id: "titania", command: "703", center: "500@799", name: "Titania" },
  { id: "oberon", command: "704", center: "500@799", name: "Oberon" },
  // Neptunian moons
  { id: "triton", command: "801", center: "500@899", name: "Triton" },
  // Pluto system. Centered on Pluto's BODY centre (999), not the system
  // barycentre (9): Charon's rendered offset is measured from Pluto itself,
  // and the two differ by ~2 100 km — the whole point of OPP-PC.
  { id: "charon", command: "901", center: "500@999", name: "Charon" },
  // Asteroids (heliocentric)
  { id: "ceres", command: "1;", center: "500@10", name: "Ceres" },
  { id: "pallas", command: "2;", center: "500@10", name: "Pallas" },
  { id: "vesta", command: "4;", center: "500@10", name: "Vesta" },
];

// Canonical shipped regression set. Matches `MULTI_EPOCH_DATES` in
// `src/lib/orbital/regression.test.ts` and the analytical element epoch in
// `src/lib/orbital/analytical/satellites.ts`. Override with
// `HORIZONS_DATES=...,...` env when capturing historical / experimental
// points.
const DEFAULT_TEST_DATES = [
  "2025-01-01T00:00:00Z",
  "2025-07-01T00:00:00Z",
  "2026-01-01T00:00:00Z",
];

const TEST_DATES = (
  process.env.HORIZONS_DATES
    ? process.env.HORIZONS_DATES.split(",")
    : DEFAULT_TEST_DATES
)
  .map((value) => value.trim())
  .filter(Boolean);

const RATE_LIMIT_MS = Number(process.env.HORIZONS_RATE_LIMIT_MS ?? 1200);
const SKIP_EXISTING = Boolean(process.env.HORIZONS_SKIP_EXISTING);

// Optional body filter: HORIZONS_BODIES=europa,ganymede
const BODY_FILTER = process.env.HORIZONS_BODIES
  ? new Set(
      process.env.HORIZONS_BODIES.split(",").map((s) => s.trim().toLowerCase())
    )
  : null;

/**
 * Bodies that only `subpoint` mode needs.
 *
 * Kept out of `TARGET_BODIES` on purpose: that list drives the *vectors*
 * regression set, `regression.test.ts` iterates whatever is on disk, and
 * silently minting new position fixtures would silently mint new position
 * assertions. Orientation truth for these bodies is wanted; new position
 * assertions are a separate decision.
 */
const SUBPOINT_ONLY_BODIES = [
  { id: "venus", command: "299", center: "500@10", name: "Venus" },
  { id: "jupiter", command: "599", center: "500@10", name: "Jupiter" },
  { id: "saturn", command: "699", center: "500@10", name: "Saturn" },
  { id: "uranus", command: "799", center: "500@10", name: "Uranus" },
];

const MODE_BODIES =
  process.env.HORIZONS_MODE === "subpoint"
    ? [...TARGET_BODIES, ...SUBPOINT_ONLY_BODIES]
    : TARGET_BODIES;

// Active body list (filtered if HORIZONS_BODIES set)
const ACTIVE_BODIES = BODY_FILTER
  ? MODE_BODIES.filter((b) => BODY_FILTER.has(b.id))
  : MODE_BODIES;

function buildHorizonsUrl(body, date) {
  const stopDate = new Date(date);
  stopDate.setUTCDate(stopDate.getUTCDate() + 1);

  const params = new URLSearchParams({
    format: "json",
    COMMAND: `'${body.command}'`,
    OBJ_DATA: "'YES'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: `'${body.center}'`,
    START_TIME: `'${date}'`,
    STOP_TIME: `'${stopDate.toISOString()}'`,
    STEP_SIZE: "'1d'",
    OUT_UNITS: "'AU-D'",
    VEC_TABLE: "'2'",
    VEC_CORR: "'NONE'",
    REF_SYSTEM: "'ICRF'",
    REF_PLANE: "'ECLIPTIC'",
    TIME_TYPE: "'UT'",
    CAL_FORMAT: "'CAL'",
  });

  return `${API_ENDPOINT}?${params.toString()}`;
}

const MODE = process.env.HORIZONS_MODE === "subpoint" ? "subpoint" : "vectors";

/**
 * Sub-observer point + range, as seen from the Sun.
 *
 * QUANTITIES 14 = observer sub-lon/sub-lat (body-fixed, east longitude),
 * 20 = range & range-rate, which carries the light time the consumer needs.
 */
function buildSubpointUrl(body, date) {
  const stopDate = new Date(new Date(date).getTime() + 60_000);

  const params = new URLSearchParams({
    format: "text",
    COMMAND: `'${body.command}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'500@10'",
    START_TIME: `'${date.replace("Z", "")}'`,
    STOP_TIME: `'${stopDate.toISOString().replace(/\.\d+Z$/, "")}'`,
    STEP_SIZE: "'1m'",
    QUANTITIES: "'14,20'",
    TIME_TYPE: "'UT'",
    CAL_FORMAT: "'CAL'",
  });

  return `${API_ENDPOINT}?${params.toString()}`;
}

function parseSubpointResponse(text) {
  // Horizons states the target's body-fixed frame and its longitude sense in
  // the header, e.g.
  //   Target pole/equ : IAU_MARS                {West-longitude positive}
  //   Target pole/equ : ITRF93 (high precision) {East-longitude positive}
  // Read it; never assume it. The IAU planetographic convention runs longitude
  // WEST for prograde rotators, while Earth, the Moon and the Sun are
  // conventionally given EAST — so a fixture set that hard-codes one sense is
  // wrong for most of the catalog, and wrong by a SIGN, which reads on screen
  // as a plausible orientation rather than as an error.
  //
  // The frame string is kept too, because it is not always the IAU model: for
  // Earth, Horizons uses ITRF93 with full precession/nutation/polar motion/UT1.
  // That is a better model than the IAU/WGCCRE Earth expression this repo
  // ships, so Earth's residual against it has a floor that is not this repo's
  // bug. Recording the frame keeps that explanation attached to the data.
  const frameLine = text.match(
    /Target pole\/equ\s*:\s*(\S+)[^\n{]*\{(East|West)-longitude positive\}/i
  );
  if (!frameLine) {
    throw new Error(
      "Could not read target frame / longitude sense from Horizons header"
    );
  }

  const block = text.match(/\$\$SOE\r?\n([\s\S]*?)\$\$EOE/);
  if (!block) throw new Error("Could not find $$SOE block in Horizons reply");

  const first = block[1].split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!first) throw new Error("Empty $$SOE block");

  // date time, sub-lon, sub-lat, range (AU), range-rate
  const numbers = first
    .replace(/^\s*\d{4}-\w{3}-\d{2}\s+[\d:.]+\s*/, "")
    .trim()
    .split(/\s+/)
    .map(Number);

  if (numbers.length < 4 || numbers.some((n) => !Number.isFinite(n))) {
    throw new Error(`Unparsable sub-point row: "${first}"`);
  }

  const [subLonDeg, subLatDeg, rangeAU] = numbers;
  // IAU 2012 astronomical unit and the defined speed of light. Neither is
  // measured here, so this introduces no constant the fixture is testing.
  const LIGHT_SECONDS_PER_AU = 149597870.7 / 299792.458;

  return {
    targetFrame: frameLine[1],
    longitudeSense: frameLine[2].toLowerCase() === "west" ? "west" : "east",
    subSolarLonDeg: subLonDeg,
    subSolarLatDeg: subLatDeg,
    rangeAU,
    lightTimeSeconds: rangeAU * LIGHT_SECONDS_PER_AU,
  };
}

function parseHorizonsResponse(data) {
  const match = data.result.match(
    /\$\$SOE[\s\S]*?X\s*=\s*([+\-]?\d+\.\d+E[+\-]?\d+)\s+Y\s*=\s*([+\-]?\d+\.\d+E[+\-]?\d+)\s+Z\s*=\s*([+\-]?\d+\.\d+E[+\-]?\d+)\s*[\r\n]+\s*VX=\s*([+\-]?\d+\.\d+E[+\-]?\d+)\s+VY=\s*([+\-]?\d+\.\d+E[+\-]?\d+)\s+VZ=\s*([+\-]?\d+\.\d+E[+\-]?\d+)/m
  );

  if (!match) {
    throw new Error("Could not parse state vector from Horizons response");
  }

  const [, x, y, z, vx, vy, vz] = match;
  return {
    x: Number.parseFloat(x),
    y: Number.parseFloat(y),
    z: Number.parseFloat(z),
    vx: Number.parseFloat(vx),
    vy: Number.parseFloat(vy),
    vz: Number.parseFloat(vz),
  };
}

async function fetchHorizonsPosition(body, date, retries = 4) {
  const url =
    MODE === "subpoint"
      ? buildSubpointUrl(body, date)
      : buildHorizonsUrl(body, date);

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response;
    try {
      response = await fetch(url);
    } catch (networkErr) {
      if (attempt === retries) throw networkErr;
      const wait = 2000 * (attempt + 1);
      console.warn(
        `    Network error (attempt ${attempt + 1}), retrying in ${wait}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }

    if (response.status === 503 || response.status === 429) {
      if (attempt === retries) {
        throw new Error(
          `HTTP ${response.status} after ${retries + 1} attempts`
        );
      }
      const wait = 3000 * (attempt + 1);
      console.warn(
        `    HTTP ${response.status} (attempt ${attempt + 1}), retrying in ${wait}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (MODE === "subpoint") {
      const text = await response.text();
      if (/\bNo ephemeris for target\b|\bError\b/i.test(text.slice(0, 400))) {
        throw new Error(`Horizons API error: ${text.slice(0, 200)}`);
      }
      return { url, subpoint: parseSubpointResponse(text) };
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Horizons API error: ${data.error}`);
    }

    return {
      url,
      stateVector: parseHorizonsResponse(data),
    };
  }
  throw new Error("Unreachable");
}

async function generateFixture(body, date) {
  console.log(`  Fetching ${body.name} at ${date}...`);

  try {
    const { url, stateVector, subpoint } = await fetchHorizonsPosition(
      body,
      date
    );

    if (MODE === "subpoint") {
      return {
        kind: "subpoint",
        bodyId: body.id,
        horizonsCommand: body.command,
        name: body.name,
        date,
        center: "500@10",
        timeScale: "UT",
        /**
         * Body-fixed east longitude / latitude where the Sun is overhead.
         * Light-time included: this is the value at `date − lightTimeSeconds`,
         * so a consumer must evaluate its own model at that retarded instant
         * rather than applying an angular correction.
         */
        /** Body-fixed frame Horizons evaluated, verbatim from its header. */
        targetFrame: subpoint.targetFrame,
        /** "east" or "west", verbatim from the same header. */
        longitudeSense: subpoint.longitudeSense,
        subSolarLonDeg: subpoint.subSolarLonDeg,
        subSolarLatDeg: subpoint.subSolarLatDeg,
        rangeAU: subpoint.rangeAU,
        lightTimeSeconds: subpoint.lightTimeSeconds,
        generatedAt: new Date().toISOString(),
        source: "NASA JPL Horizons API (OBSERVER, QUANTITIES 14,20)",
        apiUrl: url,
      };
    }

    return {
      bodyId: body.id,
      horizonsCommand: body.command,
      name: body.name,
      date,
      center: body.center,
      timeScale: "UT",
      referenceFrame: "J2000_ECLIPTIC",
      position: {
        x: stateVector.x,
        y: stateVector.y,
        z: stateVector.z,
        unit: "AU",
      },
      velocity: {
        x: stateVector.vx,
        y: stateVector.vy,
        z: stateVector.vz,
        unit: "AU/day",
      },
      generatedAt: new Date().toISOString(),
      source: "NASA JPL Horizons API",
      apiUrl: url,
    };
  } catch (error) {
    console.error(`    ERROR: ${error.message}`);
    return null;
  }
}

function saveFixture(fixture) {
  if (!fixture) {
    return false;
  }

  const dateStr = fixture.date.replace(/[:]/g, "").replace(/\.\d+/, "");
  const filename =
    fixture.kind === "subpoint"
      ? `subsolar-${fixture.bodyId}-${dateStr}.json`
      : `${fixture.bodyId}-${fixture.date.split("T")[0]}.json`;
  const filepath = path.join(FIXTURES_DIR, filename);

  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(fixture, null, 2));

  console.log(`    Saved: ${filename}`);
  return true;
}

/**
 * Rebuild index.json from ALL fixture files currently on disk.
 * This ensures partial runs (e.g. HORIZONS_BODIES=…) don't erase other entries.
 */
function rebuildIndexFromDisk() {
  if (!fs.existsSync(FIXTURES_DIR)) return;

  const allFiles = fs.readdirSync(FIXTURES_DIR).filter(
    (f) =>
      f.endsWith(".json") &&
      f !== "index.json" &&
      // Sub-point fixtures are a different data product with their own
      // consumer; keeping them out of this index leaves the vectors
      // regression set exactly as it was.
      !f.startsWith("subsolar-")
  );

  const fixtures = allFiles
    .map((file) => {
      try {
        const raw = JSON.parse(
          fs.readFileSync(path.join(FIXTURES_DIR, file), "utf8")
        );
        return { bodyId: raw.bodyId, date: raw.date, file };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort(
      (a, b) => a.bodyId.localeCompare(b.bodyId) || a.date.localeCompare(b.date)
    );

  const index = {
    generatedAt: new Date().toISOString(),
    totalFixtures: fixtures.length,
    bodies: [...new Set(fixtures.map((f) => f.bodyId))],
    dates: [...new Set(fixtures.map((f) => f.date))],
    fixtures,
  };

  const indexPath = path.join(FIXTURES_DIR, "index.json");
  // Trailing newline: without it every run leaves a one-character diff on a
  // file whose content did not change.
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
  console.log(`\nIndex saved: ${indexPath} (${fixtures.length} fixtures)`);
}

async function main() {
  console.log("NASA JPL Horizons Fixture Generator");
  console.log("====================================\n");

  if (BODY_FILTER) {
    console.log(`Body filter active: ${[...BODY_FILTER].join(", ")}`);
  }
  if (SKIP_EXISTING) {
    console.log(
      "Skip-existing mode: already-generated fixtures will not be re-fetched."
    );
  }
  console.log();

  let generated = 0;
  let skipped = 0;

  for (const body of ACTIVE_BODIES) {
    console.log(`Processing ${body.name}...`);

    for (const date of TEST_DATES) {
      const dateStr = date.split("T")[0];
      const filename =
        MODE === "subpoint"
          ? `subsolar-${body.id}-${date.replace(/[:]/g, "").replace(/\.\d+/, "")}.json`
          : `${body.id}-${dateStr}.json`;
      const filepath = path.join(FIXTURES_DIR, filename);

      if (SKIP_EXISTING && fs.existsSync(filepath)) {
        console.log(`    Skipping (already exists): ${filename}`);
        skipped++;
        continue;
      }

      const fixture = await generateFixture(body, date);

      if (fixture) {
        saveFixture(fixture);
        generated++;
      }

      if (RATE_LIMIT_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
      }
    }

    console.log();
  }

  rebuildIndexFromDisk();

  console.log(`\nGenerated ${generated} new fixtures (${skipped} skipped)`);
  console.log(`Output directory: ${FIXTURES_DIR}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
