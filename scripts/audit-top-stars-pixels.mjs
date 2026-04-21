#!/usr/bin/env node
/**
 * θ.1b top-star pixel-size audit.
 *
 * Reads the HYG v4.2 low-tier binary + names sidecar, traces the
 * Top-15 brightest (by apparent magnitude) stars through the EXACT
 * Starfield.tsx pseudo-size pipeline, and dumps a markdown table:
 *
 *   | Rank | Name | apparentMag | distPc | absMag | pseudoSizePc |
 *   | a_size (scene) | raw SA (rad) | clampedSA | pixels | Clamped? |
 *
 * Purpose: sanity-check the θ.1b render against the user's visual
 * observations ("Capella looks bigger than Sirius?"). The runtime
 * now renders Gaia-style instanced quads, so these predicted pixel
 * widths are not subject to WebGL's ALIASED_POINT_SIZE_RANGE cap.
 *
 * Usage: `node scripts/audit-top-stars-pixels.mjs`
 * Output: prints to stdout + writes tasks/audit-top-stars-pixels.md
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ───────────────────────── HYG binary parser (mirror of utils/hygBinary.ts)
const HYG_HEADER_BYTES = 16;
const HYG_BYTES_PER_STAR = 18;
const HYG_MAG_OFFSET = -5;
const HYG_MAG_STEP = 0.1;
const HYG_CI_OFFSET = -0.5;
const HYG_CI_STEP = 0.01;

function parseHyg(buf) {
  const view = new DataView(buf);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "HYG1") throw new Error(`bad magic: ${magic}`);
  const count = view.getUint32(8, true);
  const stars = [];
  for (let i = 0; i < count; i++) {
    const off = HYG_HEADER_BYTES + i * HYG_BYTES_PER_STAR;
    const x = view.getFloat32(off + 0, true);
    const y = view.getFloat32(off + 4, true);
    const z = view.getFloat32(off + 8, true);
    const magQ = view.getUint8(off + 12);
    const ciQ = view.getUint8(off + 13);
    const mag = magQ * HYG_MAG_STEP + HYG_MAG_OFFSET;
    const ci = ciQ * HYG_CI_STEP + HYG_CI_OFFSET;
    stars.push({ index: i, x, y, z, mag, ci });
  }
  return stars;
}

// ───────────────────────── Starfield math (mirror of starPhysics.ts + starfieldShaderMath.ts)
const GAIA_PSEUDO_SIZE_COEFFICIENT_PC = 0.15;
const STAR_SIZE_FACTOR = 1.31526e-6;
const GAIA_PSEUDO_SIZE_CEILING_PC = 1e10 / (3.0857e16 * 1e-9); // ≈324.08 pc

const apparentToAbsMag = (mag, distPc) => {
  if (distPc <= 0) return mag;
  return mag - 5 * Math.log10(distPc / 10);
};

const absoluteMagnitudeToPseudoSize = (absMag) => {
  if (!Number.isFinite(absMag)) return 0;
  const pseudoL = Math.pow(10, -0.4 * absMag);
  const sizePc = Math.sqrt(pseudoL) * GAIA_PSEUDO_SIZE_COEFFICIENT_PC;
  return Math.min(sizePc, GAIA_PSEUDO_SIZE_CEILING_PC);
};

const DISTANCE_SCALE = 206_265_000.0;

// solid-angle math (Gaia Sky lint_smoothstep + clamp)
const U_SOLID_ANGLE_MAP = [1e-10, 2e-9];
const U_OPACITY_LIMITS = [0.0, 1.0];
const U_MIN_QUAD_SOLID_ANGLE_1440P = 1.8e-9;
const MAX_QUAD_SOLID_ANGLE_LITERAL = 3.0e-8;

const computeMinQuadSolidAngle = (backBufferHeight) =>
  (U_MIN_QUAD_SOLID_ANGLE_1440P * 1440) / Math.max(backBufferHeight, 1);

const lintSs = (x, x0, x1, y0, y1) => {
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  const t = (x - x0) / (x1 - x0);
  const s = t * t * (3 - 2 * t); // smoothstep
  return y0 + (y1 - y0) * s;
};

const degrees12 = (r) => (r * 180.0e12) / Math.PI;
const radians12 = (d) => (d * Math.PI) / 180.0e12;

function starfieldSolidAngleMetrics({ size, dist, brightnessPower = 1.0, minQuadSolidAngle }) {
  const rawSolidAngle = size / Math.max(dist, 1e-20);
  const opacity = lintSs(
    rawSolidAngle,
    U_SOLID_ANGLE_MAP[0],
    U_SOLID_ANGLE_MAP[1],
    U_OPACITY_LIMITS[0],
    U_OPACITY_LIMITS[1]
  );
  const powered = radians12(Math.pow(degrees12(rawSolidAngle), brightnessPower));
  const clampedSolidAngle = Math.max(
    minQuadSolidAngle,
    Math.min(powered, MAX_QUAD_SOLID_ANGLE_LITERAL)
  );
  return { rawSolidAngle, opacity, clampedSolidAngle };
}

// Viewport canonical: 1080 × 1.5 DPR = 1620 backbuffer height; 60° fov.
const VIEWPORT_HEIGHT = 1080 * 1.5;
const PROJ_11 = 1 / Math.tan(Math.PI / 6);
const PIXELS_PER_RADIAN = (PROJ_11 * VIEWPORT_HEIGHT) / 2;
const U_SIZE_FACTOR = 1.2e6;
const MIN_QUAD = computeMinQuadSolidAngle(VIEWPORT_HEIGHT);

function pipelinePixels(apparentMag, distPc) {
  const absMag = apparentToAbsMag(apparentMag, distPc);
  const pseudoPc = absoluteMagnitudeToPseudoSize(absMag);
  const aSize = pseudoPc * DISTANCE_SCALE * STAR_SIZE_FACTOR;
  const distScene = distPc * DISTANCE_SCALE;
  const m = starfieldSolidAngleMetrics({
    size: aSize,
    dist: distScene,
    minQuadSolidAngle: MIN_QUAD,
  });
  const pixels = m.clampedSolidAngle * U_SIZE_FACTOR * PIXELS_PER_RADIAN;
  const hitClamp = m.clampedSolidAngle === MAX_QUAD_SOLID_ANGLE_LITERAL;
  return {
    absMag,
    pseudoPc,
    aSize,
    rawSolidAngle: m.rawSolidAngle,
    clampedSolidAngle: m.clampedSolidAngle,
    opacity: m.opacity,
    pixels,
    hitClamp,
  };
}

// ───────────────────────── Main
const root = resolve(new URL(".", import.meta.url).pathname, "..");
// On Windows, `new URL` paths start with /C:/ which resolve won't handle well.
// Use process.cwd() instead.
const ROOT = process.cwd();

const binPath = resolve(ROOT, "public/data/hyg-stars/hyg-v1-low.bin");
const namesPath = resolve(ROOT, "public/data/hyg-stars/hyg-v1.names.json");

const bin = readFileSync(binPath);
const stars = parseHyg(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));

const names = JSON.parse(readFileSync(namesPath, "utf8"));
const nameByIndex = new Map(names.entries.map((e) => [e.index, e]));

// Stars are already stored in ascending-mag order, so top-15 = slice(0,15).
const top = stars.slice(0, 15);

const rows = top.map((s, rank) => {
  const name = nameByIndex.get(s.index);
  const distPc = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
  const p = pipelinePixels(s.mag, distPc);
  return {
    rank: rank + 1,
    name: name?.proper ?? `(idx ${s.index})`,
    hip: name?.hip,
    con: name?.con,
    apparentMag: s.mag,
    bv: s.ci,
    distPc,
    absMag: p.absMag,
    pseudoPc: p.pseudoPc,
    rawSolidAngle: p.rawSolidAngle,
    clampedSolidAngle: p.clampedSolidAngle,
    opacity: p.opacity,
    pixels: p.pixels,
    hitClamp: p.hitClamp,
  };
});

const pad = (s, w) => String(s).padEnd(w);
const num = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const sci = (v, d = 3) => (Number.isFinite(v) ? v.toExponential(d) : "—");

// Sort by pixels desc to see what the user actually sees on screen.
const byPixels = [...rows].sort((a, b) => b.pixels - a.pixels);

let md = "# θ.1b top-star pixel-size audit\n\n";
md += `Canonical view: 1080 × 1.5 DPR viewport (backbuffer ${VIEWPORT_HEIGHT}px), 60° FOV.\n`;
md += `Pipeline: HYG apparent-mag → abs-mag (distance modulus) → pseudo-size (0.15·√10^(-0.4·absMag) pc) → ×DISTANCE_SCALE (${DISTANCE_SCALE}) → ×STAR_SIZE_FACTOR (${STAR_SIZE_FACTOR}) → solidAngle = a_size / dist → clamp [minQuad=${sci(MIN_QUAD)}, 3e-8] → billboard width = clampedSA × dist × u_sizeFactor (${U_SIZE_FACTOR}) → projected pixels = clampedSA × u_sizeFactor × pixelsPerRad (${num(PIXELS_PER_RADIAN, 1)}).\n\n`;

md += "## Top 15 by HYG apparent magnitude (rank 1 = brightest)\n\n";
md += "| Rank | Name | HIP | Con | apparentMag | B-V | dist (pc) | absMag | pseudoSize (pc) | raw SA (rad) | clamped SA (rad) | opacity | pixels | Clamped? |\n";
md += "|---:|:---|---:|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|\n";
for (const r of rows) {
  md += `| ${r.rank} | ${r.name} | ${r.hip ?? "—"} | ${r.con ?? "—"} | ${num(r.apparentMag, 2)} | ${num(r.bv, 2)} | ${num(r.distPc, 2)} | ${num(r.absMag, 2)} | ${num(r.pseudoPc, 4)} | ${sci(r.rawSolidAngle)} | ${sci(r.clampedSolidAngle)} | ${num(r.opacity, 3)} | ${num(r.pixels, 1)} | ${r.hitClamp ? "✓" : ""} |\n`;
}

md += "\n## Same 15 re-sorted by FINAL pixel size (largest first)\n\n";
md += "| Rank (by px) | Name | apparentMag | distPc | absMag | pseudoSize (pc) | raw SA (rad) | pixels | Clamped? |\n";
md += "|---:|:---|---:|---:|---:|---:|---:|---:|:---:|\n";
for (const [i, r] of byPixels.entries()) {
  md += `| ${i + 1} | ${r.name} | ${num(r.apparentMag, 2)} | ${num(r.distPc, 2)} | ${num(r.absMag, 2)} | ${num(r.pseudoPc, 4)} | ${sci(r.rawSolidAngle)} | ${num(r.pixels, 1)} | ${r.hitClamp ? "✓" : ""} |\n`;
}

md += "\n## Diagnostics\n\n";
const clampedCount = rows.filter((r) => r.hitClamp).length;
md += `- Of the top-15 brightest (apparent mag), **${clampedCount} saturate the 3e-8 solidAngle clamp**. Any stars that share this ceiling have identical billboard width; differences then come from color / bloom / selective-HDR gain.\n`;
const notClamped = rows.filter((r) => !r.hitClamp);
if (notClamped.length > 0) {
  md += `- ${notClamped.length} are below the clamp ceiling and render at sub-ceiling pixel sizes:\n`;
  for (const r of notClamped) {
    md += `  - ${r.name}: ${num(r.pixels, 1)} px (raw SA ${sci(r.rawSolidAngle, 2)} vs ceiling 3.00e-8)\n`;
  }
}

const outPath = resolve(ROOT, "tasks/audit-top-stars-pixels.md");
writeFileSync(outPath, md);
console.log(md);
console.log(`\n→ wrote ${outPath}`);
