export type VisualAssetRole = "model" | "texture" | "reference";

export type VisualAssetChannel = "geometry" | "map";

export type VisualAssetStatus =
  | "active"
  | "candidate"
  | "fallback"
  | "rejected";

export interface VisualAssetManifestEntry {
  id: string;
  bodyId: string;
  assetRole: VisualAssetRole;
  channel: VisualAssetChannel;
  filePath: string;
  format: string;
  diskSizeBytes: number;
  resolution: string | null;
  sourceLabel: string;
  sourceUrl: string | null;
  license: string;
  attributionRequired: boolean;
  status: VisualAssetStatus;
  verifiedAt: string;
  notes?: string;
}

const PUBLIC_PREFIX = "public/";

export const VISUAL_ASSET_MANIFEST: VisualAssetManifestEntry[] = [
  {
    id: "vesta-model-active",
    bodyId: "vesta",
    assetRole: "model",
    channel: "geometry",
    filePath: "public/models/Vesta_1_100.glb",
    format: "glb",
    diskSizeBytes: 5073448,
    resolution: null,
    sourceLabel: "NASA Science Vesta 3D model",
    sourceUrl: "https://science.nasa.gov/resource/vesta-3d-model/",
    license: "NASA images and media usage guidelines",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-04-06",
    notes:
      "Primary runtime asset. The GLB carries the high-fidelity geometry path used in-scene.",
  },
  {
    id: "vesta-map-fallback",
    bodyId: "vesta",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/vesta_dawn_embedded.png",
    format: "png",
    diskSizeBytes: 2203419,
    resolution: "2048x1024",
    sourceLabel: "NASA Science / Dawn / USGS Vesta mosaic",
    sourceUrl: "https://science.nasa.gov/resource/vesta-3d-model/",
    license:
      "source documented in repo; derivative packaging should be verified before standalone reuse",
    attributionRequired: true,
    status: "fallback",
    verifiedAt: "2026-04-06",
    notes:
      "Retained for sphere fallback and study context. The normal runtime path is the GLB model above.",
  },
  {
    id: "pallas-model-fallback",
    bodyId: "pallas",
    assetRole: "model",
    channel: "geometry",
    filePath: "public/models/Pallas_Torppa.obj",
    format: "obj",
    diskSizeBytes: 64283,
    resolution: null,
    sourceLabel: "Observatoire de la Cote d'Azur shape export",
    sourceUrl: "https://observations.lam.fr/astero/3Dshape/2_Pallas_mpcd.obj",
    license: "not documented in repo",
    attributionRequired: true,
    status: "fallback",
    verifiedAt: "2026-04-06",
    notes:
      "Legacy observation-based model kept as fallback and provenance trail during the DAMIT transition.",
  },
  {
    id: "pallas-model-active",
    bodyId: "pallas",
    assetRole: "model",
    channel: "geometry",
    filePath: "public/models/Pallas_DAMIT_101.obj",
    format: "obj",
    diskSizeBytes: 88822,
    resolution: null,
    sourceLabel: "DAMIT model 101 for (2) Pallas",
    sourceUrl: "https://damit.cuni.cz/projects/damit/asteroid_models/view/101",
    license: "CC BY 4.0",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-04-06",
    notes:
      "Official observation-derived shape model promoted for runtime geometry in this phase.",
  },
  {
    id: "hygiea-model-fallback",
    bodyId: "hygiea",
    assetRole: "model",
    channel: "geometry",
    filePath: "public/models/Hygiea_Vernazza.obj",
    format: "obj",
    diskSizeBytes: 94142,
    resolution: null,
    sourceLabel: "Observatoire de la Cote d'Azur shape export",
    sourceUrl: "https://observations.lam.fr/astero/3Dshape/10_Hygiea_mpcd.obj",
    license: "not documented in repo",
    attributionRequired: true,
    status: "fallback",
    verifiedAt: "2026-04-06",
    notes:
      "Legacy observation-based model kept for fallback and provenance while the DAMIT upgrade is integrated.",
  },
  {
    id: "hygiea-model-active",
    bodyId: "hygiea",
    assetRole: "model",
    channel: "geometry",
    filePath: "public/models/Hygiea_DAMIT_4392.obj",
    format: "obj",
    diskSizeBytes: 139282,
    resolution: null,
    sourceLabel: "DAMIT model 4392 for (10) Hygiea",
    sourceUrl: "https://damit.cuni.cz/projects/damit/asteroid_models/view/4392",
    license: "CC BY 4.0",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-04-06",
    notes:
      "Official observation-derived shape model promoted for runtime geometry in this phase.",
  },
  {
    id: "hygiea-map-candidate",
    bodyId: "hygiea",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/hygiea_vlt_2017_2018_map.png",
    format: "png",
    diskSizeBytes: 163832,
    resolution: "1024x512",
    sourceLabel: "ESO VLT / Wikimedia Commons Hygiea reference map",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Hygiea_VLT_2017-2018_map.png",
    license: "CC BY 4.0",
    attributionRequired: true,
    status: "candidate",
    verifiedAt: "2026-04-06",
    notes:
      "Documented candidate map kept out of the diffuse path until the side-by-side study shows a clear win over the current procedural surface.",
  },
  {
    id: "haumea-model-active",
    bodyId: "haumea",
    assetRole: "model",
    channel: "geometry",
    filePath: "public/models/Haumea_1_1000.glb",
    format: "glb",
    diskSizeBytes: 11335060,
    resolution: null,
    sourceLabel: "NASA Science Haumea 3D model",
    sourceUrl: "https://science.nasa.gov/resource/haumea-3d-model/",
    license: "NASA images and media usage guidelines",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-04-06",
    notes:
      "Primary runtime geometry. The explicit JPG map remains a fallback/reference path, not the active render path.",
  },
  {
    id: "haumea-map-fallback",
    bodyId: "haumea",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/4k_haumea_fictional.jpg",
    format: "jpg",
    diskSizeBytes: 2731510,
    resolution: "4096x2048",
    sourceLabel: "Solar System Scope fictional Haumea texture",
    sourceUrl: "https://www.solarsystemscope.com/textures/",
    license: "CC BY 4.0",
    attributionRequired: true,
    status: "fallback",
    verifiedAt: "2026-04-06",
    notes:
      "Retained as a documented fallback/reference texture, but not promoted as a measured surface.",
  },
  {
    id: "jupiter-map-active",
    bodyId: "jupiter",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/jupiter_vgr1_2025.jpg",
    format: "jpg",
    diskSizeBytes: 7970155,
    resolution: "7200x3600",
    sourceLabel:
      "Repo-local Jupiter map (Voyager-inspired, exact provenance unresolved)",
    sourceUrl: null,
    license: "not documented in repo",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-04-06",
    notes:
      "Current runtime map. Higher pixel count than the documented Solar System Scope alternative, but source/license still need tightening.",
  },
  {
    id: "jupiter-map-candidate",
    bodyId: "jupiter",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/jupiter_nasa_io_b_3d_resource.jpg",
    format: "jpg",
    diskSizeBytes: 648170,
    resolution: "1440x720",
    sourceLabel: "NASA Science 3D Resources - Jupiter - Io (B)",
    sourceUrl: "https://science.nasa.gov/3d-resources/jupiter-io-b/",
    license: "NASA images and media usage guidelines",
    attributionRequired: true,
    status: "candidate",
    verifiedAt: "2026-04-06",
    notes:
      "Best official Jupiter texture found in the source sweep. Provenance is excellent, but the candidate is still much softer than the current runtime map.",
  },
  {
    id: "uranus-map-active",
    bodyId: "uranus",
    assetRole: "texture",
    channel: "map",
    filePath:
      "public/textures/uranus_texture_map_8k_by_floridaemojicat_dj4s9vd.jpg",
    format: "jpg",
    diskSizeBytes: 3139503,
    resolution: "8000x4336",
    sourceLabel:
      "Repo-local Uranus map (community origin suggested by filename)",
    sourceUrl: null,
    license: "not documented in repo",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-04-06",
    notes:
      "Current runtime map with strong nominal resolution but weak documented provenance.",
  },
  {
    id: "uranus-map-candidate",
    bodyId: "uranus",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/2k_uranus.jpg",
    format: "jpg",
    diskSizeBytes: 77751,
    resolution: "2048x1024",
    sourceLabel: "Solar System Scope Uranus texture",
    sourceUrl: "https://www.solarsystemscope.com/textures/",
    license: "CC BY 4.0",
    attributionRequired: true,
    status: "rejected",
    verifiedAt: "2026-04-06",
    notes:
      "Local alternative kept only for history. The external sweep did not surface an approved replacement strong enough to justify changing Uranus now.",
  },
  {
    id: "titan-map-fallback",
    bodyId: "titan",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/titan_map__2010__by_mapperpro_dg0iw6y.png",
    format: "png",
    diskSizeBytes: 7658163,
    resolution: "4096x2048",
    sourceLabel:
      "Repo-local Titan map (community origin suggested by filename)",
    sourceUrl: null,
    license: "not documented in repo",
    attributionRequired: true,
    status: "fallback",
    verifiedAt: "2026-04-06",
    notes:
      "Former runtime map kept as fallback and study baseline after the Cassini/USGS mosaic was promoted.",
  },
  {
    id: "titan-map-active",
    bodyId: "titan",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/titan_cassini_iss_global_mosaic_4km.jpg",
    format: "jpg",
    diskSizeBytes: 1647709,
    resolution: "4040x2020",
    sourceLabel: "USGS Astrogeology / Cassini ISS Team Titan global mosaic",
    sourceUrl:
      "https://astrogeology.usgs.gov/search/map/titan_cassini_iss_global_mosaic_4005m",
    license: "USGS Astrogeology product; use constraints say to cite authors",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-04-06",
    notes:
      "Official Cassini ISS global mosaic promoted after the external sweep and comparative review.",
  },
  {
    id: "europa-map-fallback",
    bodyId: "europa",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/4k_europa_gemini.png",
    format: "png",
    diskSizeBytes: 5864501,
    resolution: "2912x1440",
    sourceLabel:
      "Repo-local Europa map (Gemini-labelled, exact source unresolved)",
    sourceUrl: null,
    license: "not documented in repo",
    attributionRequired: true,
    status: "fallback",
    verifiedAt: "2026-04-06",
    notes:
      "Former runtime map kept as fallback and study baseline after the official Voyager/Galileo mosaic was promoted.",
  },
  {
    id: "europa-map-active",
    bodyId: "europa",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/europa_voyager_galileo_global_mosaic_500m.jpg",
    format: "jpg",
    diskSizeBytes: 2012607,
    resolution: "4096x2048",
    sourceLabel: "USGS Astrogeology Europa Voyager/Galileo global mosaic",
    sourceUrl:
      "https://astrogeology.usgs.gov/search/map/europa_voyager_galileo_ssi_global_mosaic_500m",
    license: "USGS Astrogeology product; use constraints say to cite authors",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-04-06",
    notes:
      "Official Voyager/Galileo global mosaic promoted after the external sweep and comparative review.",
  },
];

export const getVisualAssetById = (id: string) => {
  return VISUAL_ASSET_MANIFEST.find((entry) => entry.id === id) ?? null;
};

export const getVisualAssetsForBody = (bodyId: string) => {
  return VISUAL_ASSET_MANIFEST.filter((entry) => entry.bodyId === bodyId);
};

export const toPublicAssetUrl = (filePath: string) => {
  const relativePath = filePath.startsWith(PUBLIC_PREFIX)
    ? filePath.slice(PUBLIC_PREFIX.length)
    : filePath;
  const baseUrl = import.meta.env.BASE_URL || "/";

  return `${baseUrl}${relativePath}`.replace(/([^:]\/)\/+/g, "$1");
};

export const toRepoAssetPath = (assetPath: string) => {
  const withoutQuery = assetPath.split("?")[0];
  const normalized = withoutQuery.replace(/^https?:\/\/[^/]+/, "");
  const match = normalized.match(/(?:^|\/)(textures|models|data)\/(.+)$/);

  if (!match) {
    return null;
  }

  return `public/${match[1]}/${match[2]}`;
};

export const getVisualAssetByBodyPath = (
  bodyId: string,
  assetPath: string,
  assetRole: VisualAssetRole
) => {
  const repoPath = toRepoAssetPath(assetPath);
  if (!repoPath) return null;

  return (
    VISUAL_ASSET_MANIFEST.find(
      (entry) =>
        entry.bodyId === bodyId &&
        entry.assetRole === assetRole &&
        entry.filePath === repoPath
    ) ?? null
  );
};
