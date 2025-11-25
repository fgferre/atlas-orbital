import fs from "fs";
import path from "path";

const OUTPUT_FILE = path.join(process.cwd(), "src/data/starfield.json");
const STAR_COUNT = 20000;
const RADIUS = 1e9; // Galactic scale

// Spectral types and their approximate colors and probabilities
// Adjusted for VISIBLE sky (favoring brighter O/B/A/F stars over dim M dwarfs)
const SPECTRAL_TYPES = [
  { type: "O", color: "#9bb0ff", prob: 0.01 }, // Rare but very bright
  { type: "B", color: "#aabfff", prob: 0.05 },
  { type: "A", color: "#cad7ff", prob: 0.15 },
  { type: "F", color: "#f8f7ff", prob: 0.2 },
  { type: "G", color: "#fff4ea", prob: 0.2 }, // Sun-like
  { type: "K", color: "#ffd2a1", prob: 0.2 },
  { type: "M", color: "#ffcc6f", prob: 0.19 },
];

// Helper to pick a random spectral type based on probability
function getRandomColor() {
  const r = Math.random();
  let cumulative = 0;
  for (const s of SPECTRAL_TYPES) {
    cumulative += s.prob;
    if (r <= cumulative) return s.color;
  }
  return "#ffcc6f"; // Fallback to M type
}

const stars = [];

for (let i = 0; i < STAR_COUNT; i++) {
  // Random position on sphere
  const theta = 2 * Math.PI * Math.random();
  const phi = Math.acos(2 * Math.random() - 1);

  const x = RADIUS * Math.sin(phi) * Math.cos(theta);
  const y = RADIUS * Math.sin(phi) * Math.sin(theta);
  const z = RADIUS * Math.cos(phi);

  // Magnitude: Power law distribution to favor fainter stars
  // Visual magnitude roughly -1 to 6.5
  // Using a simple exponential distribution for simulation
  const mag = -1.5 + Math.pow(Math.random(), 2) * 8;

  stars.push({
    x,
    y,
    z,
    mag,
    color: getRandomColor(),
  });
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stars, null, 2));
console.log(`Generated ${STAR_COUNT} stars in ${OUTPUT_FILE}`);
