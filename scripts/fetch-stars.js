import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const OUTPUT_FILE = path.join(__dirname, "../src/data/tycho2-processed.json");
// HYG Database v3 (Hipparcos, Yale Bright Star, Gliese)
// ~30MB CSV file. Contains ~120k stars.
const DATA_URL =
  "https://raw.githubusercontent.com/astronexus/HYG-Database/master/hygdata_v3.csv";
const MAX_MAGNITUDE = 8.0; // Should yield ~40k stars

console.log(`Fetching star data from ${DATA_URL}...`);

https
  .get(DATA_URL, (res) => {
    if (res.statusCode !== 200) {
      console.error(`Failed to fetch data: Status Code ${res.statusCode}`);
      return;
    }

    let data = "";
    let downloadedBytes = 0;

    res.on("data", (chunk) => {
      data += chunk;
      downloadedBytes += chunk.length;
      if (downloadedBytes % (1024 * 1024) === 0) {
        process.stdout.write(".");
      }
    });

    res.on("end", () => {
      console.log("\nDownload complete. Parsing CSV...");

      const lines = data.split("\n");
      const stars = [];

      // Header: id,hip,hd,hr,gl,bf,proper,ra,dec,dist,pmra,pmdec,rv,mag,absmag,spect,ci,...
      // We need to find indices for: ra, dec, dist, mag, ci

      if (lines.length === 0) {
        console.error("Empty data received");
        return;
      }

      const header = lines[0].split(",");
      const colMap = {};
      header.forEach((col, idx) => {
        colMap[col.trim()] = idx;
      });

      const idxRA = colMap["ra"];
      const idxDec = colMap["dec"];
      const idxDist = colMap["dist"]; // Distance in parsecs
      const idxMag = colMap["mag"];
      const idxCI = colMap["ci"]; // Color Index (B-V)

      console.log("Column mapping:", { idxRA, idxDec, idxDist, idxMag, idxCI });

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // CSV parsing (assuming no commas in fields for these numeric columns)
        const parts = line.split(",");

        const mag = parseFloat(parts[idxMag]);

        // Filter by magnitude
        if (isNaN(mag) || mag > MAX_MAGNITUDE) continue;

        const ra = parseFloat(parts[idxRA]); // Hours
        const dec = parseFloat(parts[idxDec]); // Degrees
        const dist = parseFloat(parts[idxDist]); // Parsecs
        const ci = parseFloat(parts[idxCI]);

        if (isNaN(ra) || isNaN(dec)) continue;

        // Convert RA from hours to degrees (1h = 15deg)
        const raDeg = ra * 15;

        // Calculate parallax from distance if needed, or just store distance
        // Parallax (mas) = 1000 / dist (pc)
        const parallax = dist > 0 ? 1000 / dist : 0.1;

        const star = {
          ra: Number(raDeg.toFixed(4)),
          dec: Number(dec.toFixed(4)),
          parallax: Number(parallax.toFixed(2)),
          mag: Number(mag.toFixed(2)),
          colorIndex: !isNaN(ci) ? Number(ci.toFixed(2)) : 0.6, // Default to sun-like
        };

        stars.push(star);
      }

      console.log(`Parsed ${stars.length} stars (Mag <= ${MAX_MAGNITUDE}).`);

      const dir = path.dirname(OUTPUT_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stars));
      console.log(`Saved to ${OUTPUT_FILE}`);
    });
  })
  .on("error", (err) => {
    console.error("Error fetching data:", err.message);
  });
