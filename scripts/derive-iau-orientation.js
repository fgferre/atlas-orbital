#!/usr/bin/env node

/**
 * Derive `iauOrientation` records from NAIF's generic planetary constants
 * kernel.
 *
 * This is the reproducible companion to the rotational elements tabulated in
 * `src/data/celestialBodies.ts`, in the same spirit as
 * `scripts/derive-elements-from-fixtures.js` is for the orbital elements: the
 * script reads the published source and prints the exact block to paste, so
 * the numbers in the catalog are a *transcription of a machine-readable file*
 * rather than a human copying a table out of a PDF.
 *
 * That distinction is the whole point. W6's named risk is mistranscription —
 * a wrong W₀ renders as a perfectly plausible planet — and the bodies stage B
 * adds carry up to 26 periodic terms each, indexed positionally into a shared
 * angle table. Reading those by eye is how the sign of one amplitude ends up
 * on the wrong argument. Reading them with 40 lines of parser does not.
 *
 * Usage:
 *   node scripts/derive-iau-orientation.js                # all known bodies
 *   node scripts/derive-iau-orientation.js moon triton    # a subset
 *
 * Environment:
 *   PCK_FILE=/path/to/pck00011.tpc   use a local copy instead of fetching
 *   PCK_URL=...                      override the NAIF download URL
 *
 * ## The kernel's model, and how it maps onto `IauOrientation`
 *
 *   RA  = ra0  + ra1·T  + ra2·T²  + Σ raAmp_i ·sin(θ_i)
 *   DEC = dec0 + dec1·T + dec2·T² + Σ decAmp_i·cos(θ_i)
 *   W   = w0   + w1·d   + w2·d²   + Σ pmAmp_i ·sin(θ_i)
 *
 * with T in Julian centuries TDB past J2000 and d in days. **The pole rates
 * are per century and the spin rate is per day** — the one asymmetry in the
 * format, and mixing them up moves a body by a factor of 36525.
 *
 * The θ_i come from `BODY<system>_NUT_PREC_ANGLES`, a flat list shared by a
 * planet and all its satellites, where `system` is the leading digit of the
 * NAIF id (Phobos 401 → Mars system 4). Each body's `_NUT_PREC_RA/_DEC/_PM`
 * arrays are **positional** into that list, so amplitude *k* belongs to angle
 * *k* and a short array simply means the later angles have zero amplitude.
 * Nothing names the pairing; get the index wrong and the result is a body
 * wobbling to the wrong argument at the right amplitude.
 *
 * `BODY<system>_MAX_PHASE_DEGREE` (only Mars has it, = 2) says each angle
 * carries a quadratic coefficient too, so the angle list is read three numbers
 * at a time instead of two. Phobos genuinely needs it: its largest term
 * (−1.143° on W) rides angle M5, whose argument accelerates.
 */

import fs from "node:fs";

const PCK_URL =
  process.env.PCK_URL ??
  "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc";

/**
 * NAIF id → catalog id, for every body the app draws that has a kernel entry.
 * The Sun and the eight planets are here too: they shipped in W6 stage A and
 * re-emitting them is how a later run proves the parser reproduces what is
 * already on disk, rather than only being checkable on the new bodies.
 */
const BODIES = {
  10: "sun",
  199: "mercury",
  299: "venus",
  399: "earth",
  499: "mars",
  599: "jupiter",
  699: "saturn",
  799: "uranus",
  899: "neptune",
  301: "moon",
  401: "phobos",
  402: "deimos",
  501: "io",
  502: "europa",
  503: "ganymede",
  504: "callisto",
  601: "mimas",
  602: "enceladus",
  603: "tethys",
  604: "dione",
  605: "rhea",
  606: "titan",
  608: "iapetus",
  701: "ariel",
  702: "umbriel",
  703: "titania",
  704: "oberon",
  705: "miranda",
  801: "triton",
  901: "charon",
  999: "pluto",
};

/** Fortran-style exponents (`-1.4D-12`) are legal in a text kernel. */
function toNumber(token) {
  return Number(token.replace(/[Dd]/, "e"));
}

/**
 * Every `NAME = value` / `NAME = ( … )` assignment inside the kernel's
 * `\begindata` regions. Text outside them is prose — including worked
 * examples with numbers in them, which is why the regions are honoured
 * instead of grepping the whole file.
 */
function parseKernel(text) {
  const assignments = new Map();

  for (const region of text.split(/\\begindata/).slice(1)) {
    const data = region.split(/\\begintext/)[0];
    const re = /([A-Z0-9_]+)\s*=\s*(\(([^)]*)\)|[^\s(][^\n]*)/g;
    let match;
    while ((match = re.exec(data)) !== null) {
      const body = match[3] ?? match[2];
      const values = body
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(toNumber);
      if (values.every(Number.isFinite)) assignments.set(match[1], values);
    }
  }

  return assignments;
}

function coefficients(assignments, key) {
  return assignments.get(key) ?? [];
}

/**
 * The shared angle table for a NAIF system, as `{ phase, rate, accel }`
 * triples. `accel` is 0 for every system except Mars.
 */
function nutPrecAngles(assignments, system) {
  const flat = coefficients(assignments, `BODY${system}_NUT_PREC_ANGLES`);
  const degree =
    coefficients(assignments, `BODY${system}_MAX_PHASE_DEGREE`)[0] ?? 1;
  const stride = degree + 1;

  const angles = [];
  for (let i = 0; i + stride <= flat.length; i += stride) {
    angles.push({
      phase: flat[i],
      rate: flat[i + 1],
      accel: stride > 2 ? flat[i + 2] : 0,
    });
  }
  return angles;
}

function deriveOrientation(assignments, naifId) {
  const ra = coefficients(assignments, `BODY${naifId}_POLE_RA`);
  const dec = coefficients(assignments, `BODY${naifId}_POLE_DEC`);
  const pm = coefficients(assignments, `BODY${naifId}_PM`);
  if (!ra.length || !dec.length || !pm.length) return null;

  const system = naifId < 100 ? naifId : Math.floor(naifId / 100);
  const angles = nutPrecAngles(assignments, system);
  const raAmp = coefficients(assignments, `BODY${naifId}_NUT_PREC_RA`);
  const decAmp = coefficients(assignments, `BODY${naifId}_NUT_PREC_DEC`);
  const pmAmp = coefficients(assignments, `BODY${naifId}_NUT_PREC_PM`);

  const used = Math.max(raAmp.length, decAmp.length, pmAmp.length);
  if (used > angles.length) {
    throw new Error(
      `body ${naifId}: ${used} amplitudes but only ${angles.length} angles in BODY${system}_NUT_PREC_ANGLES`
    );
  }

  const terms = [];
  for (let i = 0; i < used; i++) {
    const term = {
      phaseDeg: angles[i].phase,
      rateDegPerCentury: angles[i].rate,
      raAmpDeg: raAmp[i] ?? 0,
      decAmpDeg: decAmp[i] ?? 0,
      pmAmpDeg: pmAmp[i] ?? 0,
    };
    if (angles[i].accel) term.rateDegPerCentury2 = angles[i].accel;
    if (term.raAmpDeg || term.decAmpDeg || term.pmAmpDeg) terms.push(term);
  }

  return {
    poleRaDeg: ra[0],
    poleRaRateDegPerCentury: ra[1] || 0,
    poleDecDeg: dec[0],
    poleDecRateDegPerCentury: dec[1] || 0,
    primeMeridianDeg: pm[0],
    spinRateDegPerDay: pm[1],
    spinAccelDegPerDay2: pm[2] || 0,
    terms,
    // Quadratic pole rates are not modelled; report so a nonzero one is loud
    // rather than silently dropped.
    unmodelled: {
      poleRaAccel: ra[2] || 0,
      poleDecAccel: dec[2] || 0,
    },
  };
}

function emitTerm(term) {
  const lines = [`        {`, `          phaseDeg: ${term.phaseDeg},`];
  lines.push(`          rateDegPerCentury: ${term.rateDegPerCentury},`);
  if (term.rateDegPerCentury2 !== undefined) {
    lines.push(`          rateDegPerCentury2: ${term.rateDegPerCentury2},`);
  }
  if (term.raAmpDeg) lines.push(`          raAmpDeg: ${term.raAmpDeg},`);
  if (term.decAmpDeg) lines.push(`          decAmpDeg: ${term.decAmpDeg},`);
  if (term.pmAmpDeg) lines.push(`          pmAmpDeg: ${term.pmAmpDeg},`);
  lines.push(`        },`);
  return lines.join("\n");
}

function emitBlock(catalogId, naifId, o) {
  const lines = [
    `    // ${catalogId} — NAIF ${naifId}`,
    `    iauOrientation: {`,
    `      poleRaDeg: ${o.poleRaDeg},`,
  ];
  if (o.poleRaRateDegPerCentury) {
    lines.push(`      poleRaRateDegPerCentury: ${o.poleRaRateDegPerCentury},`);
  }
  lines.push(`      poleDecDeg: ${o.poleDecDeg},`);
  if (o.poleDecRateDegPerCentury) {
    lines.push(
      `      poleDecRateDegPerCentury: ${o.poleDecRateDegPerCentury},`
    );
  }
  lines.push(`      primeMeridianDeg: ${o.primeMeridianDeg},`);
  lines.push(`      spinRateDegPerDay: ${o.spinRateDegPerDay},`);
  if (o.spinAccelDegPerDay2) {
    lines.push(`      spinAccelDegPerDay2: ${o.spinAccelDegPerDay2},`);
  }
  if (o.terms.length) {
    lines.push(`      nutPrec: [`);
    for (const term of o.terms) lines.push(emitTerm(term));
    lines.push(`      ],`);
  }
  lines.push(`    },`);
  return lines.join("\n");
}

const peak = (terms, key) =>
  terms.reduce((max, t) => Math.max(max, Math.abs(t[key] ?? 0)), 0);

async function loadKernel() {
  if (process.env.PCK_FILE) {
    return fs.readFileSync(process.env.PCK_FILE, "utf8");
  }
  const response = await fetch(PCK_URL);
  if (!response.ok) {
    throw new Error(`${PCK_URL} → HTTP ${response.status}`);
  }
  const text = await response.text();
  // A proxy error page would parse to zero assignments and emit an empty
  // catalog, which reads as "these bodies have no solution" rather than as a
  // failed download.
  if (!text.startsWith("KPL/PCK")) {
    throw new Error(`${PCK_URL} did not return a text PCK kernel`);
  }
  return text;
}

/**
 * `BODY<n>_RADII` for every known body, as the `[a, b, c]` triples
 * `subSolarPoint.test.ts` needs to convert a planetocentric latitude into the
 * planetodetic one Horizons reports. Same kernel, same run, so the figure a
 * comparison uses cannot drift from the pole it is comparing.
 */
function emitRadii(assignments, wanted) {
  console.log("// Triaxial radii (km), `BODY<n>_RADII`:");
  for (const [naifId, catalogId] of Object.entries(BODIES)) {
    if (wanted.size && !wanted.has(catalogId)) continue;
    const radii = coefficients(assignments, `BODY${naifId}_RADII`);
    if (radii.length < 3) continue;
    const [a, b, c] = radii;
    // A sphere contributes nothing to the conversion, so it is left out
    // rather than listed as an identity entry.
    if (Math.abs(c / a - 1) < 1e-4 && Math.abs(b / a - 1) < 1e-4) continue;
    console.log(`  ${catalogId}: [${a}, ${b}, ${c}],`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const radiiOnly = args.includes("--radii");
  const wanted = new Set(args.filter((a) => !a.startsWith("--")));
  const kernel = await loadKernel();
  const assignments = parseKernel(kernel);

  console.log(`// Source: ${process.env.PCK_FILE ?? PCK_URL}`);
  console.log(`// ${assignments.size} kernel assignments parsed\n`);

  if (radiiOnly) {
    emitRadii(assignments, wanted);
    return;
  }

  const summary = [];

  for (const [naifId, catalogId] of Object.entries(BODIES)) {
    if (wanted.size && !wanted.has(catalogId)) continue;

    const o = deriveOrientation(assignments, Number(naifId));
    if (!o) {
      summary.push({ catalogId, naifId, missing: true });
      continue;
    }

    console.log(emitBlock(catalogId, naifId, o));
    console.log("");

    summary.push({
      catalogId,
      naifId,
      terms: o.terms.length,
      peakRa: peak(o.terms, "raAmpDeg"),
      peakDec: peak(o.terms, "decAmpDeg"),
      peakPm: peak(o.terms, "pmAmpDeg"),
      spinAccel: o.spinAccelDegPerDay2,
      unmodelled: o.unmodelled,
    });
  }

  console.log("// ====== summary (peak periodic amplitudes, degrees) ======");
  for (const s of summary) {
    if (s.missing) {
      console.log(`// ${s.catalogId} (${s.naifId}): NOT IN KERNEL`);
      continue;
    }
    const dropped =
      s.unmodelled.poleRaAccel || s.unmodelled.poleDecAccel
        ? `  !! UNMODELLED pole T² ra=${s.unmodelled.poleRaAccel} dec=${s.unmodelled.poleDecAccel}`
        : "";
    console.log(
      `// ${s.catalogId.padEnd(10)} ${String(s.naifId).padStart(3)}  terms=${String(s.terms).padStart(2)}` +
        `  peak ra=${s.peakRa.toFixed(4)} dec=${s.peakDec.toFixed(4)} pm=${s.peakPm.toFixed(4)}` +
        `  W''=${s.spinAccel}${dropped}`
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
