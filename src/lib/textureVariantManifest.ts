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
  saturn: {
    map: {
      boot: `${TEXTURE_PATH}boot_saturn.jpg`,
    },
    ring: {
      boot: `${TEXTURE_PATH}boot_saturn_ring_alpha.png`,
    },
  },
  uranus: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_uranus.jpg`,
      },
    },
  },
};
