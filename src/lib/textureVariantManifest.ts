import type { TextureVariantManifest } from "./textureVariants";

const BASE_URL = import.meta.env.BASE_URL || "/";
const TEXTURE_PATH = `${BASE_URL}textures/`;

export const TEXTURE_VARIANT_MANIFEST: TextureVariantManifest = {
  sun: {
    map: {
      boot: `${TEXTURE_PATH}boot_sun.jpg`,
      variants: {
        "2k": `${TEXTURE_PATH}2k_sun.jpg`,
      },
    },
  },
  mercury: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_mercury.jpg`,
      },
    },
  },
  venus: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_venus_surface.jpg`,
      },
    },
  },
  earth: {
    map: {
      boot: `${TEXTURE_PATH}boot_earth_daymap.jpg`,
      variants: {
        "2k": `${TEXTURE_PATH}2k_earth.jpg`,
      },
    },
    clouds: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_earth_clouds.jpg`,
      },
    },
    night: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_earth_nightmap.jpg`,
      },
    },
    normal: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_earth_normal_map.jpg`,
      },
    },
    roughness: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_earth_roughness_map.jpg`,
      },
    },
  },
  moon: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_moon.jpg`,
      },
    },
  },
  mars: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_mars.jpg`,
      },
    },
  },
  jupiter: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_jupiter.jpg`,
        // 4096x2048 despite the `8k_` filename (Solar System Scope ships the
        // name, not the size). Placed by measured pixel count, not by prefix.
        "4k": `${TEXTURE_PATH}8k_jupiter.jpg`,
        // Jupiter's canonical. `inferCanonicalTier` cannot read a tier out of
        // an untiered basename, so without this line the ladder topped out at
        // 2k and the 7200x3600 map the body record declares never loaded.
        "8k": `${TEXTURE_PATH}jupiter_vgr1_2025.jpg`,
      },
    },
  },
  saturn: {
    map: {
      boot: `${TEXTURE_PATH}boot_saturn.jpg`,
      variants: {
        // Canonical is `2k_saturn.jpg`, so focus/ultra could never exceed
        // 2048x1024 while the same imagery sat on disk at 4096x2048
        // (`8k_saturn.jpg` is 4k by pixel count, whatever its name says).
        "4k": `${TEXTURE_PATH}8k_saturn.jpg`,
      },
    },
    ring: {
      boot: `${TEXTURE_PATH}boot_saturn_ring_alpha.png`,
      variants: {
        // Middle rung of a deliberate boot/2k/8k trio (1024x62, 2048x125,
        // 8192x500 of the same plate) that the manifest never listed.
        "2k": `${TEXTURE_PATH}2k_saturn_ring_alpha.png`,
      },
    },
  },
  uranus: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_uranus.jpg`,
        // Uranus's canonical, untiered basename — same shadowing as Jupiter.
        "8k": `${TEXTURE_PATH}uranus_texture_map_8k_by_floridaemojicat_dj4s9vd.jpg`,
      },
    },
  },
  // Eris's canonical is a 4096x2048 plate — 42.7 MB decoded, which is 133% of
  // the entire 32 MB constrained texture budget, and the overview band had no
  // lighter rung to fall back to. Restoring the canonical without this line
  // made Eris 10.5x heavier at *every* profile and salience.
  eris: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_eris_fictional.jpg`,
      },
    },
  },
  // Same defect, pre-existing: Haumea's only rung was the 4096x2048 plate.
  haumea: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_haumea_fictional.jpg`,
      },
    },
  },
  // Europa and Titan are deliberately absent: their canonical basenames now
  // carry a `2k_` prefix, so `inferCanonicalTier` places them on the ladder by
  // itself. Re-listing them here would be the same fact in two places.
  iapetus: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_iapetus.jpg`,
      },
    },
  },
  tethys: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_tethys.jpg`,
      },
    },
  },
  enceladus: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_enceladus.jpg`,
      },
    },
  },
  mimas: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_mimas.jpg`,
      },
    },
  },
  triton: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_triton.jpg`,
      },
    },
  },
  titania: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_titania.jpg`,
      },
    },
  },
  oberon: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_oberon.jpg`,
      },
    },
  },
  umbriel: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_umbriel.jpg`,
      },
    },
  },
  ariel: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_ariel.jpg`,
      },
    },
  },
  pluto: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_pluto.jpg`,
      },
    },
  },
  makemake: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_makemake.jpg`,
      },
    },
  },
  charon: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_charon.jpg`,
      },
    },
  },
};
