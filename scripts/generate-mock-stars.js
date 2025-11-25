import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, "../src/data/tycho2-processed.json");
const NUM_STARS = 40000;

console.log(`Generating ${NUM_STARS} mock stars with Galactic distribution...`);

// Galactic North Pole (J2000)
const alphaG = 192.85948 * (Math.PI / 180);
const deltaG = 27.12825 * (Math.PI / 180);
const lOmega = 32.93192 * (Math.PI / 180); // Galactic longitude of ascending node

function galacticToEquatorial(l, b) {
  const lRad = l * (Math.PI / 180);
  const bRad = b * (Math.PI / 180);

  // Spherical trigonometry for conversion
  // sin(delta) = sin(deltaG)sin(b) + cos(deltaG)cos(b)cos(l - lOmega)
  const sinDelta =
    Math.sin(deltaG) * Math.sin(bRad) +
    Math.cos(deltaG) * Math.cos(bRad) * Math.cos(lRad - lOmega);
  const delta = Math.asin(sinDelta);

  // sin(alpha - alphaG) = cos(b)sin(l - lOmega) / cos(delta)
  // cos(alpha - alphaG) = (cos(deltaG)sin(b) - sin(deltaG)cos(b)cos(l - lOmega)) / cos(delta)
  const y = Math.cos(bRad) * Math.sin(lRad - lOmega);
  const x =
    Math.cos(deltaG) * Math.sin(bRad) -
    Math.sin(deltaG) * Math.cos(bRad) * Math.cos(lRad - lOmega);

  let alpha = Math.atan2(y, x) + alphaG;

  // Normalize to 0-360
  const alphaDeg = ((alpha * 180) / Math.PI + 360) % 360;
  const deltaDeg = (delta * 180) / Math.PI;

  return { ra: alphaDeg, dec: deltaDeg };
}

const stars = [];

for (let i = 0; i < NUM_STARS; i++) {
  let l, b;

  // 80% Disk, 20% Halo
  if (Math.random() < 0.8) {
    // Galactic Disk
    // l: 0-360 uniform
    l = Math.random() * 360;
    // b: concentrated near 0 (Gaussian-ish)
    // Standard deviation ~10 degrees
    const u = Math.random() * 2 - 1;
    const v = Math.random() * 2 - 1;
    const w = u * u + v * v;
    // Box-Muller transform for normal distribution (approx)
    const normal =
      Math.sqrt(-2.0 * Math.log(Math.random())) *
      Math.cos(2.0 * Math.PI * Math.random());
    b = normal * 5; // 5 degrees spread
  } else {
    // Halo (Isotropic)
    l = Math.random() * 360;
    b = Math.asin(2 * Math.random() - 1) * (180 / Math.PI);
  }

  const { ra, dec } = galacticToEquatorial(l, b);

  // Magnitude distribution (Power law)
  // Mag range: -1.5 to 12.0 (Deep sky)
  const r = Math.random();
  // Heavily weighted towards dim stars
  const mag = -1.5 + 13.5 * Math.pow(r, 0.5);

  // Color Index (B-V)
  let colorIndex;

  // 10% chance of being a Red Giant (Bright + Red)
  // Bright: mag < 3
  if (mag < 3 && Math.random() < 0.1) {
    // Red Giant: B-V ~ 1.0 to 1.8
    colorIndex = 1.0 + Math.random() * 0.8;
  } else {
    // Main Sequence correlation
    // Bright (low mag) -> Blue (low B-V)
    // Dim (high mag) -> Red (high B-V)
    // -0.3 (Blue) to 1.8 (Red)
    // Map mag -1.5...12 to -0.3...1.8
    const normalizedMag = (mag + 1.5) / 13.5;
    colorIndex = -0.3 + normalizedMag * 2.1 + (Math.random() - 0.5) * 0.4;
  }

  colorIndex = Math.max(-0.4, Math.min(2.0, colorIndex));

  // Parallax / Distance
  // Dist (pc) = 10^( (mag - AbsMag + 5) / 5 )
  // Main sequence AbsMag roughly correlates with B-V (HR Diagram)
  // Blue stars are bright (AbsMag low), Red dwarfs are dim (AbsMag high).
  // This gives us a physically consistent distance!

  // Approx AbsMag based on Color Index (very rough HR diagram fit)
  // B-V -0.3 -> AbsMag -5
  // B-V 1.5 -> AbsMag 10
  const absMag = -5 + (colorIndex + 0.4) * 8;

  // Calculate distance modulus
  // mag - absMag = 5 * log10(dist) - 5
  // (mag - absMag + 5) / 5 = log10(dist)
  let dist = Math.pow(10, (mag - absMag + 5) / 5);

  // Add some noise to distance (scatter)
  dist *= 0.8 + Math.random() * 0.4;

  // Ensure min distance is realistic (Proxima is ~1.3pc)
  dist = Math.max(1.3, dist);

  const parallax = 1000 / dist; // mas

  stars.push({
    ra: Number(ra.toFixed(4)),
    dec: Number(dec.toFixed(4)),
    parallax: Number(parallax.toFixed(2)),
    mag: Number(mag.toFixed(2)),
    colorIndex: Number(colorIndex.toFixed(2)),
  });
}

// Add a few famous stars manually to ensure they exist
const famousStars = [
  { ra: 101.28, dec: -16.71, parallax: 379.21, mag: -1.46, colorIndex: 0.0 }, // Sirius
  { ra: 279.23, dec: 38.78, parallax: 128.93, mag: 0.03, colorIndex: 0.0 }, // Vega
  { ra: 88.79, dec: 7.4, parallax: 5.0, mag: 0.42, colorIndex: 1.85 }, // Betelgeuse
  { ra: 213.91, dec: 19.18, parallax: 88.85, mag: -0.05, colorIndex: 1.23 }, // Arcturus
  { ra: 78.63, dec: -8.2, parallax: 3.89, mag: 0.13, colorIndex: -0.03 }, // Rigel
];

stars.push(...famousStars);

const dir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stars));
console.log(`Saved ${stars.length} stars to ${OUTPUT_FILE}`);
