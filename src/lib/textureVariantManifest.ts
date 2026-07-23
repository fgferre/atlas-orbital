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
  europa: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_europa.jpg`,
      },
    },
  },
  titan: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_titan.jpg`,
      },
    },
  },
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
  haumea: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_haumea.jpg`,
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
  gonggong: {
    map: {
      variants: {
        "2k": `${TEXTURE_PATH}2k_gonggong.jpg`,
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
