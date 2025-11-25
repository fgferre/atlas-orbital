import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEXTURE_DIR = path.join(__dirname, "../public/textures");

// Solar System Scope Textures (High Res)
const TEXTURES = [
  {
    name: "8k_sun.jpg",
    url: "https://www.solarsystemscope.com/textures/download/8k_sun.jpg",
  },
  {
    name: "8k_mercury.jpg",
    url: "https://www.solarsystemscope.com/textures/download/8k_mercury.jpg",
  },
  {
    name: "8k_venus_surface.jpg",
    url: "https://www.solarsystemscope.com/textures/download/8k_venus_surface.jpg",
  },
  {
    name: "4k_venus_atmosphere.jpg",
    url: "https://www.solarsystemscope.com/textures/download/4k_venus_atmosphere.jpg",
  },
  {
    name: "8k_earth_daymap.jpg",
    url: "https://www.solarsystemscope.com/textures/download/8k_earth_daymap.jpg",
  },
  {
    name: "8k_earth_nightmap.jpg",
    url: "https://www.solarsystemscope.com/textures/download/8k_earth_nightmap.jpg",
  },
  {
    name: "8k_earth_clouds.jpg",
    url: "https://www.solarsystemscope.com/textures/download/8k_earth_clouds.jpg",
  },
  {
    name: "8k_moon.jpg",
    url: "https://www.solarsystemscope.com/textures/download/8k_moon.jpg",
  },
  {
    name: "8k_mars.jpg",
    url: "https://www.solarsystemscope.com/textures/download/8k_mars.jpg",
  },
  {
    name: "8k_jupiter.jpg",
    url: "https://www.solarsystemscope.com/textures/download/8k_jupiter.jpg",
  },
  {
    name: "8k_saturn.jpg",
    url: "https://www.solarsystemscope.com/textures/download/8k_saturn.jpg",
  },
  {
    name: "8k_saturn_ring_alpha.png",
    url: "https://www.solarsystemscope.com/textures/download/8k_saturn_ring_alpha.png",
  },
  {
    name: "2k_uranus.jpg",
    url: "https://www.solarsystemscope.com/textures/download/2k_uranus.jpg",
  },
  {
    name: "2k_neptune.jpg",
    url: "https://www.solarsystemscope.com/textures/download/2k_neptune.jpg",
  },
  {
    name: "8k_stars.jpg",
    url: "https://www.solarsystemscope.com/textures/download/8k_stars.jpg",
  },
  {
    name: "8k_stars_milky_way.jpg",
    url: "https://www.solarsystemscope.com/textures/download/8k_stars_milky_way.jpg",
  },
  {
    name: "4k_ceres_fictional.jpg",
    url: "https://www.solarsystemscope.com/textures/download/4k_ceres_fictional.jpg",
  },
  {
    name: "4k_haumea_fictional.jpg",
    url: "https://www.solarsystemscope.com/textures/download/4k_haumea_fictional.jpg",
  },
  {
    name: "4k_makemake_fictional.jpg",
    url: "https://www.solarsystemscope.com/textures/download/4k_makemake_fictional.jpg",
  },
  {
    name: "4k_eris_fictional.jpg",
    url: "https://www.solarsystemscope.com/textures/download/4k_eris_fictional.jpg",
  },
  // Pluto (New Horizons) - Keeping the Wikimedia one as it's better than fictional
  {
    name: "2k_pluto.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Pluto_in_True_Color_-_High-Res.jpg/2048px-Pluto_in_True_Color_-_High-Res.jpg",
  },
];

if (!fs.existsSync(TEXTURE_DIR)) {
  fs.mkdirSync(TEXTURE_DIR, { recursive: true });
}

console.log(`Downloading ${TEXTURES.length} textures to ${TEXTURE_DIR}...`);

async function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(TEXTURE_DIR, filename);
    const file = fs.createWriteStream(filePath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(`Failed to download ${url}: ${response.statusCode}`)
          );
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          console.log(`Downloaded: ${filename}`);
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => {}); // Delete partial file
        reject(err);
      });
  });
}

async function downloadAll() {
  for (const tex of TEXTURES) {
    try {
      await downloadFile(tex.url, tex.name);
    } catch (err) {
      console.error(`Error downloading ${tex.name}:`, err.message);
    }
  }
  console.log("All downloads complete.");
}

downloadAll();
