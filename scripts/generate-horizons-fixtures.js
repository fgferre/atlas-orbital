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
  // Asteroids (heliocentric)
  { id: "ceres", command: "1;", center: "500@10", name: "Ceres" },
  { id: "pallas", command: "2;", center: "500@10", name: "Pallas" },
  { id: "vesta", command: "4;", center: "500@10", name: "Vesta" },
];

const DEFAULT_TEST_DATES = ["2020-01-01T00:00:00Z"];

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

// Active body list (filtered if HORIZONS_BODIES set)
const ACTIVE_BODIES = BODY_FILTER
  ? TARGET_BODIES.filter((b) => BODY_FILTER.has(b.id))
  : TARGET_BODIES;

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
  const url = buildHorizonsUrl(body, date);

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
    const { url, stateVector } = await fetchHorizonsPosition(body, date);

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

  const dateStr = fixture.date.split("T")[0];
  const filename = `${fixture.bodyId}-${dateStr}.json`;
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

  const allFiles = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json");

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
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
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
      const filename = `${body.id}-${dateStr}.json`;
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
