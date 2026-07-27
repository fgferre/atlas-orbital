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
    id: "makemake-map-active",
    bodyId: "makemake",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/4k_makemake_fictional.jpg",
    format: "jpg",
    diskSizeBytes: 3631372,
    resolution: "4096x2048",
    sourceLabel: "Solar System Scope fictional Makemake texture",
    sourceUrl: "https://www.solarsystemscope.com/textures/",
    license: "CC BY 4.0",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-07-23",
    notes:
      "Runtime map, but explicitly fictional at the source. Surface detail is invented; only the reddish methane-ice tone is observationally grounded. Body carries a matching interpretive visualProvenance.",
  },
  // --- Placeholders, declared as such (2026-07-27) ---------------------------
  // These four still render files from the same undocumented 1264x632 set that
  // supplied the io/phobos/deimos DeviantArt uploads. The 2026-07-27 source
  // sweep found no replacement that is better on every axis, so they stay —
  // but they stay *labelled*. Each carries the best documented alternative
  // found, and why it was not promoted. See
  // `tasks/waves/texture-inventory-2026-07-27.md`.
  {
    id: "ceres-map-active",
    bodyId: "ceres",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/2k_ceres.jpg",
    format: "jpg",
    diskSizeBytes: 139724,
    resolution: "1264x632",
    sourceLabel: "Repo-local Ceres map, placeholder (source unresolved)",
    sourceUrl: null,
    license: "not documented in repo",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-07-27",
    notes:
      "PLACEHOLDER. Structure follows Dawn Framing Camera imagery; the colour balance is not measured. No NASA 3D Resources texture exists for Ceres. The documented upgrade is the DLR/Dawn FC controlled global mosaic at USGS Astrogeology (ceres_dawn_fc_global_mosaic_140m), which this session could not fetch — the network policy denies astrogeology.usgs.gov.",
  },
  {
    id: "dione-map-active",
    bodyId: "dione",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/2k_dione.jpg",
    format: "jpg",
    diskSizeBytes: 170574,
    resolution: "1264x632",
    sourceLabel: "Repo-local Dione map, placeholder (source unresolved)",
    sourceUrl: null,
    license: "not documented in repo",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-07-27",
    notes:
      "PLACEHOLDER. Colour-graded over Cassini structure; the wispy-terrain detail is real, the colour is not measured. NASA 3D Resources ships a Dione map at 1440x720 but it is pure greyscale (0.0% saturation) and carries less detail than this file (mean |laplacian| 12.6 vs 37.5), so promoting it would trade colour for nothing.",
  },
  {
    id: "rhea-map-active",
    bodyId: "rhea",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/2k_rhea.jpg",
    format: "jpg",
    diskSizeBytes: 154325,
    resolution: "1264x632",
    sourceLabel: "Repo-local Rhea map, placeholder (source unresolved)",
    sourceUrl: null,
    license: "not documented in repo",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-07-27",
    notes:
      "PLACEHOLDER. Same set as the Dione file. NASA 3D Resources ships a Rhea map at 1440x720, but it is greyscale and visibly flatter — mean luma 190 with |laplacian| 9.5 against this file's 157 / 29.2, i.e. washed out. Not promoted.",
  },
  {
    id: "eris-map-active",
    bodyId: "eris",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/2k_eris.jpg",
    format: "jpg",
    diskSizeBytes: 128219,
    resolution: "1264x632",
    sourceLabel:
      "Repo-local Eris map, placeholder (artist rendering, source unresolved)",
    sourceUrl: null,
    license: "not documented in repo",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-07-27",
    notes:
      "PLACEHOLDER, and permanently so. Eris has never been resolved into a surface map by any instrument, so no measured replacement can exist; the 2026-07-27 sweep confirmed neither NASA 3D Resources nor USGS has one. Same undocumented 1264x632 set as the ceres/dione/rhea files. Any future swap is a choice between artist renderings.",
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
    verifiedAt: "2026-07-27",
    notes:
      "Jupiter's runtime map at ultra/focus. Higher pixel count than the documented Solar System Scope alternative, but source/license still need tightening. Declared active since 2026-04-06 yet unreachable until 2026-07-27: its untiered basename kept it off the tier ladder, so every profile served 2k_jupiter.jpg (2048x1024) instead.",
  },
  {
    id: "phobos-map-active",
    bodyId: "phobos",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/phobos_nasa_3d_resource.jpg",
    format: "jpg",
    diskSizeBytes: 601584,
    resolution: "1440x720",
    sourceLabel: "NASA 3D Resources - Mars: Phobos global map (Viking)",
    sourceUrl:
      "https://github.com/nasa/NASA-3D-Resources/tree/master/Images%20and%20Textures/Mars%20-%20Phobos",
    license:
      "NASA images and media usage guidelines; the source repo states its assets are free and without copyright",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-07-27",
    notes:
      "Replaces 2k_phobos.jpg, a 1264x632 file from the same undocumented 1264x632 set as the io/deimos DeviantArt uploads. Same underlying Viking imagery and the same Stickney/groove structure, but +14% linear resolution, a documented source, and no colour cast: the previous file carried 21% mean saturation on a body that is spectrally near-neutral, so its warmth was invented.",
  },
  {
    id: "deimos-map-active",
    bodyId: "deimos",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/deimos_nasa_3d_resource.jpg",
    format: "jpg",
    diskSizeBytes: 480429,
    resolution: "1440x720",
    sourceLabel: "NASA 3D Resources - Mars: Deimos global map (Viking)",
    sourceUrl:
      "https://github.com/nasa/NASA-3D-Resources/tree/master/Images%20and%20Textures/Mars%20-%20Deimos",
    license:
      "NASA images and media usage guidelines; the source repo states its assets are free and without copyright",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-07-27",
    notes:
      "Replaces 2k_deimos.jpg, which was byte-identical to a DeviantArt upload. Higher resolution, more surface detail (mean |laplacian| 5.15 vs 3.76 at matched size), documented source, and no invented 18% colour cast on a near-neutral body.",
  },
  {
    id: "io-map-active",
    bodyId: "io",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/jupiter_nasa_io_b_3d_resource.jpg",
    format: "jpg",
    diskSizeBytes: 648170,
    resolution: "1440x720",
    sourceLabel: "NASA Science 3D Resources - Jupiter: Io (B) global map",
    sourceUrl: "https://science.nasa.gov/3d-resources/jupiter-io-b/",
    license: "NASA images and media usage guidelines",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-07-27",
    notes:
      "Io's runtime map. Filed under bodyId 'jupiter' until 2026-07-27 because the NASA resource is published on a Jupiter page - but the image is Io, not Jupiter, so the Jupiter study row was comparing a Jupiter map against an Io map and its 'too soft' verdict measured nothing. Promoted here over the previous runtime map, a repo-local file byte-identical to a DeviantArt upload (io_texture__2k__by_ducn1567) with no recorded source or licence, 1264x632 and visibly saturation-boosted.",
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
    verifiedAt: "2026-07-27",
    notes:
      "Uranus's runtime map at ultra/focus, with strong nominal resolution but weak documented provenance. Declared active since 2026-04-06 yet unreachable until 2026-07-27: its untiered basename kept it off the tier ladder, so every profile served 2k_uranus.jpg - the file this manifest had marked 'rejected'.",
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
    status: "fallback",
    verifiedAt: "2026-07-27",
    notes:
      "Was marked 'rejected - kept only for history' while in fact being the only Uranus map that ever rendered: the 8k community map above sat off the tier ladder behind its untiered basename. Now genuinely the lower rung - it serves the overview band and every profile below ultra, with the 8k promoted on focus.",
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
      "Study baseline for Titan, reachable through AssetStudyApp rather than the planet ladder. The 2026-04-06 note claimed it was displaced when 'the Cassini/USGS mosaic was promoted'; that promotion never reached the runtime, and what actually displaced it was 2k_titan.jpg.",
  },
  {
    id: "titan-mosaic-reference",
    bodyId: "titan",
    assetRole: "reference",
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
    status: "candidate",
    verifiedAt: "2026-07-27",
    notes:
      "Recorded as the active runtime map from 2026-04-06 to 2026-07-27, but it never rendered: the ladder always resolved Titan to 2k_titan.jpg. Rendered on a sphere it is monochrome with plainly visible mosaic tile seams, and it images the surface through the methane window rather than the haze you actually see. Kept as the measured reference; promoting it needs colourisation and seam work first.",
  },
  {
    id: "titan-map-active",
    bodyId: "titan",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/2k_titan.jpg",
    format: "jpg",
    diskSizeBytes: 31473,
    resolution: "1264x632",
    sourceLabel: "Repo-local Titan haze map (source unresolved)",
    sourceUrl: null,
    license: "not documented in repo",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-07-27",
    notes:
      "What the ladder has actually served at every profile and salience. Documented here because it was rendering undeclared. Low pixel count is not the limiter it looks like - Titan presents a smooth haze disc with no surface detail to resolve. Body carries a matching interpretive visualProvenance.",
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
      "Study baseline for Europa, reachable through AssetStudyApp rather than the planet ladder. The 2026-04-06 note claimed it was displaced when 'the official Voyager/Galileo mosaic was promoted'; that promotion never reached the runtime, and what actually displaced it was 2k_europa.jpg. Retained rather than deleted: at 2912x1440 it is the only Europa asset above the 1264x632 the runtime is capped at.",
  },
  {
    id: "europa-mosaic-reference",
    bodyId: "europa",
    assetRole: "reference",
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
    status: "candidate",
    verifiedAt: "2026-07-27",
    notes:
      "Recorded as the active runtime map from 2026-04-06 to 2026-07-27, but it never rendered: the ladder always resolved Europa to 2k_europa.jpg. It is single-channel and its bottom 68 rows (3.3% of height) are solid black no-data, which on a UV sphere is a black hole over the south polar cap. Kept as the measured reference; promoting it needs the polar gore filled and a colour pass.",
  },
  {
    id: "europa-map-active",
    bodyId: "europa",
    assetRole: "texture",
    channel: "map",
    filePath: "public/textures/2k_europa.jpg",
    format: "jpg",
    diskSizeBytes: 115353,
    resolution: "1264x632",
    sourceLabel: "Repo-local Europa map (source unresolved)",
    sourceUrl: null,
    license: "not documented in repo",
    attributionRequired: true,
    status: "active",
    verifiedAt: "2026-07-27",
    notes:
      "What the ladder has actually served at every profile and salience. Documented here because it was rendering undeclared. Unlike Titan, the low pixel count IS a real cap: Europa has resolvable lineae, and 1264x632 is the ceiling until the USGS mosaic above is made renderable. Body carries a matching interpretive visualProvenance.",
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
