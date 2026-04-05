import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_PATH = path.join(__dirname, "../src/data/tycho2-processed.json");
const OUTPUT_BIN_PATH = path.join(
  __dirname,
  "../src/data/tycho2-processed.bin"
);
const OUTPUT_GZIP_PATH = path.join(
  __dirname,
  "../src/data/tycho2-processed.bin.gz"
);

const HEADER_BYTES = 12;
const VALUES_PER_STAR = 5;
const VERSION = 1;

const rawJson = fs.readFileSync(SOURCE_PATH, "utf8");
const catalog = JSON.parse(rawJson);
const buffer = Buffer.allocUnsafe(
  HEADER_BYTES +
    catalog.length * VALUES_PER_STAR * Float32Array.BYTES_PER_ELEMENT
);

buffer.write("TYC2", 0, "ascii");
buffer.writeUInt32LE(VERSION, 4);
buffer.writeUInt32LE(catalog.length, 8);

let offset = HEADER_BYTES;
for (const star of catalog) {
  buffer.writeFloatLE(star.ra ?? 0, offset);
  offset += 4;
  buffer.writeFloatLE(star.dec ?? 0, offset);
  offset += 4;
  buffer.writeFloatLE(star.parallax ?? 0, offset);
  offset += 4;
  buffer.writeFloatLE(star.mag ?? 0, offset);
  offset += 4;
  buffer.writeFloatLE(star.colorIndex ?? 0, offset);
  offset += 4;
}

const gzipBuffer = zlib.gzipSync(buffer, { level: 9 });

fs.writeFileSync(OUTPUT_BIN_PATH, buffer);
fs.writeFileSync(OUTPUT_GZIP_PATH, gzipBuffer);

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

console.log(`Source JSON: ${formatSize(Buffer.byteLength(rawJson))}`);
console.log(`Binary asset: ${formatSize(buffer.byteLength)}`);
console.log(`Gzip asset: ${formatSize(gzipBuffer.byteLength)}`);
console.log(`Stars encoded: ${catalog.length}`);
