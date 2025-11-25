import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "public/textures");

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// Minimal BMP Header Generator (24-bit RGB)
function createBMP(width: number, height: number, colorHex: string): Buffer {
  const r = parseInt(colorHex.slice(1, 3), 16);
  const g = parseInt(colorHex.slice(3, 5), 16);
  const b = parseInt(colorHex.slice(5, 7), 16);

  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;

  const buffer = Buffer.alloc(fileSize);

  // BMP Header
  buffer.write("BM");
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(54, 10); // Offset to pixel array

  // DIB Header
  buffer.writeUInt32LE(40, 14); // Header size
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26); // Planes
  buffer.writeUInt16LE(24, 28); // Bits per pixel
  buffer.writeUInt32LE(0, 30); // Compression (BI_RGB)
  buffer.writeUInt32LE(pixelArraySize, 34);

  // Pixel Data (Bottom-up, BGR)
  let offset = 54;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buffer[offset + x * 3] = b;
      buffer[offset + x * 3 + 1] = g;
      buffer[offset + x * 3 + 2] = r;
    }
    offset += rowSize;
  }

  return buffer;
}

const TEXTURES = [
  { name: "sun.jpg", color: "#FFFFAA" },
  { name: "mercury.jpg", color: "#A5A5A5" },
  { name: "venus.jpg", color: "#E3BB76" },
  { name: "earth.jpg", color: "#4facfe" },
  { name: "moon.jpg", color: "#CCCCCC" },
  { name: "mars.jpg", color: "#DD4422" },
  { name: "jupiter.jpg", color: "#D9A066" },
  { name: "saturn.jpg", color: "#EBD795" },
  { name: "uranus.jpg", color: "#99FFFF" },
  { name: "neptune.jpg", color: "#3333FF" },
  { name: "skybox.jpg", color: "#050510" }, // Dark blue-black for skybox
  { name: "snowflake1.png", color: "#FFFFFF" }, // For sun sprite
];

console.log("Generating placeholder textures...");

TEXTURES.forEach((tex) => {
  // We save as .jpg/.png extension but content is BMP (browsers usually handle this or we can rename)
  // Actually, to be safe, let's just write valid BMP content but keep the extension the app expects,
  // or better, change the app to expect .bmp or just rely on browser sniffing.
  // Ideally we should output .bmp, but the app expects .jpg.
  // Most browsers will sniff the header 'BM' and render it correctly even with .jpg extension.
  const buffer = createBMP(512, 512, tex.color);
  fs.writeFileSync(path.join(OUT_DIR, tex.name), buffer);
  console.log(`Created ${tex.name}`);
});

console.log("Done.");
