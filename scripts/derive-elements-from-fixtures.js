/**
 * Derive ecliptic-J2000 osculating elements from Horizons state vector
 * fixtures.
 *
 * This is the reproducible companion to the tabulated elements in
 * `src/lib/orbital/analytical/satellites.ts` and `asteroids.ts`. For every
 * body covered by a fixture at a given epoch it reads the parent-centered
 * (r, v) pair, inverts it through the standard two-body RV→COE algorithm
 * (Vallado / Curtis), and prints the element block in the exact format
 * expected by the analytical modules.
 *
 * Usage:
 *   node scripts/derive-elements-from-fixtures.js
 *
 * The script is deterministic: given the same fixture, it always emits the
 * same element values. No network calls.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, "../src/test/fixtures/horizons");

const K = 0.01720209895; // Gaussian gravitational constant (AU^(3/2)/day)
const K2 = K * K;

// Standard gravitational parameters (AU^3/day^2), expressed as mass-ratio × k²
// so the μ values match those already used in the analytical modules.
const MU_PARENT = {
  sun: 1.0 * K2,
  mars: 3.22715144e-7 * K2,
  jupiter: 9.54791915e-4 * K2,
  saturn: 2.8588567e-4 * K2,
  uranus: 4.366244e-5 * K2,
};

// Body → parent mapping. Pairs must match `satellites.ts` / `asteroids.ts`.
const BODIES = {
  // Martian satellites
  phobos: { parent: "mars", epoch: "2025-01-01" },
  deimos: { parent: "mars", epoch: "2025-01-01" },
  // Galilean moons
  io: { parent: "jupiter", epoch: "2025-01-01" },
  europa: { parent: "jupiter", epoch: "2025-01-01" },
  ganymede: { parent: "jupiter", epoch: "2025-01-01" },
  callisto: { parent: "jupiter", epoch: "2025-01-01" },
  // Major Saturnian satellites
  mimas: { parent: "saturn", epoch: "2025-01-01" },
  enceladus: { parent: "saturn", epoch: "2025-01-01" },
  tethys: { parent: "saturn", epoch: "2025-01-01" },
  dione: { parent: "saturn", epoch: "2025-01-01" },
  rhea: { parent: "saturn", epoch: "2025-01-01" },
  titan: { parent: "saturn", epoch: "2025-01-01" },
  iapetus: { parent: "saturn", epoch: "2025-01-01" },
  // Major Uranian satellites
  miranda: { parent: "uranus", epoch: "2025-01-01" },
  ariel: { parent: "uranus", epoch: "2025-01-01" },
  umbriel: { parent: "uranus", epoch: "2025-01-01" },
  titania: { parent: "uranus", epoch: "2025-01-01" },
  oberon: { parent: "uranus", epoch: "2025-01-01" },
  // Asteroids
  ceres: { parent: "sun", epoch: "2025-01-01" },
  pallas: { parent: "sun", epoch: "2025-01-01" },
  vesta: { parent: "sun", epoch: "2025-01-01" },
};

// --- Vector helpers ----------------------------------------------------------

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => Math.sqrt(dot(a, a));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/**
 * Invert a state vector (r, v) into classical orbital elements.
 *
 * Frame of (r, v) is the same frame in which the returned elements are
 * expressed. For all our fixtures that is J2000 mean ecliptic, parent-centered.
 *
 * Returns everything in a stable, human-readable unit set:
 *   a      — AU
 *   e      — dimensionless
 *   iDeg, OmegaDeg, omegaDeg, M0Deg — degrees in [0, 360)
 *
 * @param {number[]} r  position in AU (length 3)
 * @param {number[]} v  velocity in AU/day (length 3)
 * @param {number}   mu gravitational parameter (AU^3/day^2)
 */
function rvToElements(r, v, mu) {
  const rMag = norm(r);
  const vMag = norm(v);

  // Specific angular momentum h = r × v
  const h = cross(r, v);
  const hMag = norm(h);

  // Inclination
  const iRad = Math.acos(Math.max(-1, Math.min(1, h[2] / hMag)));

  // Node line n = ẑ × h
  const n = [-h[1], h[0], 0];
  const nMag = norm(n);

  // Longitude of ascending node Ω
  let OmegaRad;
  if (nMag < 1e-12) {
    // Equatorial (non-inclined) orbit: Ω is undefined; pick 0.
    OmegaRad = 0;
  } else {
    OmegaRad = Math.acos(Math.max(-1, Math.min(1, n[0] / nMag)));
    if (n[1] < 0) OmegaRad = 2 * Math.PI - OmegaRad;
  }

  // Eccentricity vector e = ((v² - μ/r)·r - (r·v)·v) / μ
  const rDotV = dot(r, v);
  const factor1 = (vMag * vMag - mu / rMag) / mu;
  const factor2 = rDotV / mu;
  const eVec = [
    factor1 * r[0] - factor2 * v[0],
    factor1 * r[1] - factor2 * v[1],
    factor1 * r[2] - factor2 * v[2],
  ];
  const e = norm(eVec);

  // Semi-major axis via vis-viva
  const specificEnergy = (vMag * vMag) / 2 - mu / rMag;
  const a = -mu / (2 * specificEnergy);

  // Argument of periapsis ω
  let omegaRad;
  if (nMag < 1e-12 || e < 1e-12) {
    // Degenerate: fallback to angle of e_vec in the reference plane.
    omegaRad = Math.atan2(eVec[1], eVec[0]);
    if (omegaRad < 0) omegaRad += 2 * Math.PI;
  } else {
    omegaRad = Math.acos(Math.max(-1, Math.min(1, dot(n, eVec) / (nMag * e))));
    if (eVec[2] < 0) omegaRad = 2 * Math.PI - omegaRad;
  }

  // True anomaly ν
  let nuRad;
  if (e < 1e-12) {
    // Circular: take the angle from the node vector to r.
    const refVec = nMag > 1e-12 ? n : [1, 0, 0];
    const refMag = nMag > 1e-12 ? nMag : 1;
    nuRad = Math.acos(
      Math.max(-1, Math.min(1, dot(refVec, r) / (refMag * rMag)))
    );
    const refCross = cross(refVec, r);
    if (refCross[2] < 0) nuRad = 2 * Math.PI - nuRad;
  } else {
    nuRad = Math.acos(Math.max(-1, Math.min(1, dot(eVec, r) / (e * rMag))));
    if (rDotV < 0) nuRad = 2 * Math.PI - nuRad;
  }

  // Eccentric anomaly E and mean anomaly M
  const E =
    2 *
    Math.atan2(
      Math.sqrt(Math.max(0, 1 - e)) * Math.sin(nuRad / 2),
      Math.sqrt(Math.max(0, 1 + e)) * Math.cos(nuRad / 2)
    );
  let M = E - e * Math.sin(E);
  if (M < 0) M += 2 * Math.PI;

  const r2d = 180 / Math.PI;
  return {
    aAU: a,
    e,
    iDeg: iRad * r2d,
    OmegaDeg: OmegaRad * r2d,
    omegaDeg: omegaRad * r2d,
    M0Deg: M * r2d,
  };
}

// --- Epoch conversion --------------------------------------------------------
//
// The analytical engine evaluates positions at `jdTDB` (Barycentric Dynamical
// Time). Fixture timestamps are UT. If we tag elements with a UT JD and the
// engine evaluates at jdTDB = UT JD + ~74 s at 2020-01-01, then `dt` at the
// supposed "epoch" is actually 74 s — enough to push Phobos (n ≈ 1128 °/day)
// about 1° out of sync. So we store elements with epochJD in TDB scale,
// matching `src/lib/orbital/time.ts > dateToTDB`.

const J2000_JD = 2451545.0;

function isoToTDB_JD(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);

  // JD (UT)
  const msSinceJ2000 =
    date.getTime() - new Date("2000-01-01T12:00:00Z").getTime();
  const jdUT = J2000_JD + msSinceJ2000 / 86_400_000;

  // Delta-T approximation (time.ts polynomial, clamped 30..100 s)
  const year =
    date.getUTCFullYear() +
    (date.getUTCMonth() + 1) / 12 +
    date.getUTCDate() / 365.25;
  const t = year - 2000;
  const deltaT = Math.max(30, Math.min(100, 64 + 0.5 * t + 0.001 * t * t));

  // JD (TT) then JD (TDB) with the periodic term
  const jdTT = jdUT + deltaT / 86400;
  const d = jdTT - J2000_JD;
  const g = (357.53 + 0.98560028 * d) * (Math.PI / 180);
  const tdbMinusTTSeconds = 0.001658 * Math.sin(g) + 0.000014 * Math.sin(2 * g);
  return jdTT + tdbMinusTTSeconds / 86400;
}

// --- Main --------------------------------------------------------------------

function loadFixture(bodyId, epoch) {
  const file = path.join(FIXTURES_DIR, `${bodyId}-${epoch}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function formatElementsBlock(bodyId, parent, epochJD, el) {
  const fix = (v, p) => Number(v.toFixed(p));
  return `  ${bodyId}: {
    parent: "${parent}",
    elements: {
      epochJD: ${epochJD},
      aAU: ${fix(el.aAU, 9)},
      e: ${fix(el.e, 6)},
      iDeg: ${fix(el.iDeg, 6)},
      OmegaDeg: ${fix(el.OmegaDeg, 6)},
      omegaDeg: ${fix(el.omegaDeg, 6)},
      M0Deg: ${fix(el.M0Deg, 6)},
    },
  },`;
}

function formatAsteroidBlock(bodyId, epochJD, el) {
  const fix = (v, p) => Number(v.toFixed(p));
  return `  ${bodyId}: {
    epochJD: ${epochJD},
    aAU: ${fix(el.aAU, 9)},
    e: ${fix(el.e, 6)},
    iDeg: ${fix(el.iDeg, 6)},
    OmegaDeg: ${fix(el.OmegaDeg, 6)},
    omegaDeg: ${fix(el.omegaDeg, 6)},
    M0Deg: ${fix(el.M0Deg, 6)},
  },`;
}

function main() {
  const results = { satellites: [], asteroids: [], missing: [] };

  for (const [bodyId, cfg] of Object.entries(BODIES)) {
    const fx = loadFixture(bodyId, cfg.epoch);
    if (!fx) {
      results.missing.push(`${bodyId}@${cfg.epoch}`);
      continue;
    }
    const r = [fx.position.x, fx.position.y, fx.position.z];
    const v = [fx.velocity.x, fx.velocity.y, fx.velocity.z];
    const mu = MU_PARENT[cfg.parent];
    if (mu == null) {
      throw new Error(`No μ for parent ${cfg.parent} (body ${bodyId})`);
    }
    const epochJD = isoToTDB_JD(cfg.epoch);
    const el = rvToElements(r, v, mu);

    if (cfg.parent === "sun") {
      results.asteroids.push({
        bodyId,
        block: formatAsteroidBlock(bodyId, epochJD, el),
      });
    } else {
      results.satellites.push({
        bodyId,
        block: formatElementsBlock(bodyId, cfg.parent, epochJD, el),
      });
    }
  }

  console.log("// ====== satellites.ts SATELLITES entries ======");
  for (const { block } of results.satellites) console.log(block);
  console.log("");
  console.log("// ====== asteroids.ts ASTEROIDS entries ======");
  for (const { block } of results.asteroids) console.log(block);
  if (results.missing.length > 0) {
    console.log("");
    console.log("// ====== missing fixtures ======");
    for (const id of results.missing) console.log(`// ${id}`);
  }
}

main();
