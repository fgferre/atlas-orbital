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
 *   HORIZONS_RATE_LIMIT_MS=250
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
  { id: "mercury", command: "199", center: "500@10", name: "Mercury" },
  { id: "earth", command: "399", center: "500@10", name: "Earth" },
  { id: "mars", command: "499", center: "500@10", name: "Mars" },
  { id: "moon", command: "301", center: "500@399", name: "Moon" },
  { id: "neptune", command: "899", center: "500@10", name: "Neptune" },
  { id: "pluto", command: "999", center: "500@10", name: "Pluto" },
  { id: "io", command: "501", center: "500@599", name: "Io" },
  { id: "titan", command: "606", center: "500@699", name: "Titan" },
  { id: "oberon", command: "704", center: "500@799", name: "Oberon" },
  { id: "ceres", command: "1;", center: "500@10", name: "Ceres" },
  { id: "vesta", command: "4;", center: "500@10", name: "Vesta" },
  { id: "triton", command: "801", center: "500@899", name: "Triton" },
];

const DEFAULT_TEST_DATES = [
  "2020-01-01T00:00:00Z",
  "2020-06-15T12:00:00Z",
  "2021-01-01T00:00:00Z",
  "2022-03-20T00:00:00Z",
  "2023-09-23T00:00:00Z",
  "2024-12-31T23:59:59Z",
];

const TEST_DATES = (
  process.env.HORIZONS_DATES
    ? process.env.HORIZONS_DATES.split(",")
    : DEFAULT_TEST_DATES
)
  .map((value) => value.trim())
  .filter(Boolean);

const RATE_LIMIT_MS = Number(process.env.HORIZONS_RATE_LIMIT_MS ?? 1000);

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

async function fetchHorizonsPosition(body, date) {
  const url = buildHorizonsUrl(body, date);
  const response = await fetch(url);

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

function generateIndex(fixtures) {
  const index = {
    generatedAt: new Date().toISOString(),
    totalFixtures: fixtures.length,
    bodies: [...new Set(fixtures.map((fixture) => fixture.bodyId))],
    dates: [...new Set(fixtures.map((fixture) => fixture.date))],
    fixtures: fixtures.map((fixture) => ({
      bodyId: fixture.bodyId,
      date: fixture.date,
      file: `${fixture.bodyId}-${fixture.date.split("T")[0]}.json`,
    })),
  };

  const indexPath = path.join(FIXTURES_DIR, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\nIndex saved: ${indexPath}`);
}

async function main() {
  console.log("NASA JPL Horizons Fixture Generator");
  console.log("====================================\n");

  const allFixtures = [];

  for (const body of TARGET_BODIES) {
    console.log(`Processing ${body.name}...`);

    for (const date of TEST_DATES) {
      const fixture = await generateFixture(body, date);

      if (fixture) {
        saveFixture(fixture);
        allFixtures.push(fixture);
      }

      if (RATE_LIMIT_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
      }
    }

    console.log();
  }

  generateIndex(allFixtures);

  console.log(`\nGenerated ${allFixtures.length} fixtures`);
  console.log(`Output directory: ${FIXTURES_DIR}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
