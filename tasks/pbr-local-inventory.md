# PBR Local Inventory — Per-Body Starting State

**Purpose.** Seed-first audit of what every body in the catalog currently
uses at runtime. This table is the ground truth that the sources-research
document fills gaps against — downstream work must not re-derive these
fields from scratch.

**Sources for this audit (local, read at session start):**

- `src/data/celestialBodies.ts` — catalog (body → `textures` + `model`).
- `src/data/assetManifest.ts` — tracked visual assets (status, license).
- `src/data/assetStudyMatrix.ts` — prior promotion studies for Pallas,
  Hygiea, etc.
- `src/lib/textureVariantManifest.ts` — per-body `boot/2k/4k/8k` variants.
- `src/components/canvas/PlanetModel.tsx` — model-body render path
  (GLBModel / OBJModel, `MeshStandardMaterial` assembly, no PBR channels).
- `src/components/canvas/planet/usePlanetAssets.ts` — sphere-body PBR wiring
  (`normalRequest` / `roughnessRequest` through `resolveTextureRequest`).
- `src/components/canvas/planet/usePlanetMaterials.ts` — material assembly
  (Earth day/night shader, ring shadow shader, `normalMap` + `roughnessMap`
  application at lines 217–223).
- `scripts/bake-earth-pbr.js` — reference pipeline (TIFF → JPG 2k/8k,
  specular inverted to roughness).
- `public/textures/` — actual assets on disk.

## Tier + profile recap (authoritative)

`TextureTier = "boot" | "2k" | "4k" | "8k"` and `TextureQualityProfile =
"constrained" | "balanced" | "high" | "ultra"`
(`src/lib/textureVariants.ts:18`, `:12`). Preference order per profile:

| Profile     | Preference order    |
| ----------- | ------------------- |
| ultra       | 8k → 4k → 2k        |
| high        | 4k → 2k → 8k        |
| balanced    | 2k → 4k → 8k → boot |
| constrained | boot → 2k → 4k → 8k |

When no variant matches, the resolver falls back to the canonical
`body.textures[channel]` path and infers the tier from the filename prefix
(`inferCanonicalTier`, `src/lib/textureVariants.ts:145`).

## Render-path taxonomy (as used in this document)

| Path              | Definition                                                                                                             | Code anchor                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| sphere-texture    | Rendered as a `SphereGeometry` with `MeshStandardMaterial` whose `map` comes from `body.textures.map`.                 | `usePlanetAssets.ts:49`, `usePlanetMaterials.ts:177`        |
| sphere-procedural | Same as sphere-texture but `body.textures` absent → `createProceduralSurfaceTexture(body)` paints a generated surface. | `usePlanetAssets.ts:178`                                    |
| obj-model         | Rendered via `OBJLoader` + per-mesh `MeshStandardMaterial` in `OBJModel`. Optional surface `map` only.                 | `PlanetModel.tsx:80`, texture wired at `PlanetModel.tsx:99` |
| glb-model         | Rendered via `useGLTF`; material inherits from the GLB; only `roughness` + `metalness` scalars can be overridden.      | `PlanetModel.tsx:39`                                        |
| gas-giant         | Flag for Jupiter/Saturn/Uranus/Neptune — rendered as sphere-texture today but PBR `normal` + `roughness` don't make    | catalog `type: "planet"` + `atmosphere` field               |
|                   | physical sense on a cloud surface. Separate initiative.                                                                |                                                             |

Earth is the only body in `TEXTURE_VARIANT_MANIFEST` that ships `normal` +
`roughness` channels today (`textureVariantManifest.ts:16–25`). The
manifest advertises `2k_earth_normal_map.jpg` + `2k_earth_roughness_map.jpg`;
the canonical `body.textures` points at `8k_earth_normal_map.jpg` +
`8k_earth_roughness_map.jpg`, so on `ultra`/`high` the resolver selects the
8k canonical via inferred tier.

## Per-body inventory

Columns:

- **Render path** — one of the taxonomy rows above.
- **Map today** — active `body.textures.map` filename (or "procedural" if
  none).
- **Normal/Rough today** — variants currently wired in (only Earth).
- **Variant manifest rows** — channels present in
  `TEXTURE_VARIANT_MANIFEST[bodyId]`.
- **Visual provenance** — `visualProvenance.fidelity` when present
  (`celestialBodies.ts:1448` onward). Absent entries read as unlabelled.
- **`assetManifest.ts` rows** — curated visual-asset entries linked to the
  body.

### Inner planets + Sun

| Body    | Render path    | Map today                 | Normal/Rough today                                                                       | Variant manifest                        | Visual provenance | `assetManifest.ts` rows |
| ------- | -------------- | ------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- | ----------------- | ----------------------- |
| sun     | sphere-texture | `8k_sun.jpg`              | —                                                                                        | `map.boot`                              | —                 | —                       |
| mercury | sphere-texture | `8k_mercury.jpg` (+ WebP) | —                                                                                        | —                                       | —                 | —                       |
| venus   | sphere-texture | `8k_venus_surface.jpg`    | —                                                                                        | —                                       | —                 | —                       |
| earth   | sphere-texture | `8k_earth_daymap.jpg`     | `8k_earth_normal_map.jpg` / `8k_earth_roughness_map.jpg` (canonical) + `2k_*` (manifest) | `map.boot`, `normal.2k`, `roughness.2k` | —                 | —                       |
| mars    | sphere-texture | `8k_mars.jpg`             | —                                                                                        | —                                       | —                 | —                       |

### Gas giants (separate track)

| Body    | Render path    | Map today                                                     | Normal/Rough today | Variant manifest        | Visual provenance | `assetManifest.ts` rows                                |
| ------- | -------------- | ------------------------------------------------------------- | ------------------ | ----------------------- | ----------------- | ------------------------------------------------------ |
| jupiter | sphere-texture | `jupiter_vgr1_2025.jpg` (7200×3600)                           | —                  | —                       | —                 | `jupiter-map-active`, `jupiter-map-candidate`          |
| saturn  | sphere-texture | `2k_saturn.jpg` (+ ring `8k_saturn_ring_alpha.png`)           | —                  | `map.boot`, `ring.boot` | —                 | —                                                      |
| uranus  | sphere-texture | `uranus_texture_map_8k_by_floridaemojicat_...jpg` (8000×4336) | —                  | `map.2k`                | —                 | `uranus-map-active`, `uranus-map-candidate` (rejected) |
| neptune | sphere-texture | `2k_neptune.jpg`                                              | —                  | —                       | —                 | —                                                      |

### Martian moons

| Body   | Render path    | Map today       | Normal/Rough today | Variant manifest | Visual provenance | `assetManifest.ts` rows |
| ------ | -------------- | --------------- | ------------------ | ---------------- | ----------------- | ----------------------- |
| phobos | sphere-texture | `2k_phobos.jpg` | —                  | —                | —                 | —                       |
| deimos | sphere-texture | `2k_deimos.jpg` | —                  | —                | —                 | —                       |

### Moon + Galilean

| Body     | Render path    | Map today                                                   | Normal/Rough today | Variant manifest | Visual provenance | `assetManifest.ts` rows                    |
| -------- | -------------- | ----------------------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------------------------------------ |
| moon     | sphere-texture | `8k_moon.jpg` (+ WebP)                                      | —                  | —                | —                 | —                                          |
| io       | sphere-texture | `2k_io.jpg`                                                 | —                  | —                | —                 | —                                          |
| europa   | sphere-texture | `europa_voyager_galileo_global_mosaic_500m.jpg` (4096×2048) | —                  | —                | —                 | `europa-map-active`, `europa-map-fallback` |
| ganymede | sphere-texture | `4k_ganymede.jpg`                                           | —                  | —                | —                 | —                                          |
| callisto | sphere-texture | `4k_callisto.jpg`                                           | —                  | —                | —                 | —                                          |

### Saturnian system

| Body      | Render path    | Map today                                             | Normal/Rough today | Variant manifest | Visual provenance | `assetManifest.ts` rows                  |
| --------- | -------------- | ----------------------------------------------------- | ------------------ | ---------------- | ----------------- | ---------------------------------------- |
| mimas     | sphere-texture | `4k_mimas.jpg`                                        | —                  | —                | —                 | —                                        |
| enceladus | sphere-texture | `4k_enceladus.jpg`                                    | —                  | —                | —                 | —                                        |
| tethys    | sphere-texture | `2k_tethys.jpg`                                       | —                  | —                | —                 | —                                        |
| dione     | sphere-texture | `2k_dione.jpg`                                        | —                  | —                | —                 | —                                        |
| rhea      | sphere-texture | `2k_rhea.jpg`                                         | —                  | —                | —                 | —                                        |
| titan     | sphere-texture | `titan_cassini_iss_global_mosaic_4km.jpg` (4040×2020) | —                  | —                | —                 | `titan-map-active`, `titan-map-fallback` |
| iapetus   | sphere-texture | `4k_iapetus.jpg`                                      | —                  | —                | —                 | —                                        |

### Uranian moons

| Body    | Render path    | Map today                | Normal/Rough today | Variant manifest | Visual provenance | `assetManifest.ts` rows |
| ------- | -------------- | ------------------------ | ------------------ | ---------------- | ----------------- | ----------------------- |
| miranda | sphere-texture | `4k_miranda.png`         | —                  | —                | —                 | —                       |
| ariel   | sphere-texture | `4k_ariel.png`           | —                  | —                | —                 | —                       |
| umbriel | sphere-texture | `4k_umbriel.png`         | —                  | —                | —                 | —                       |
| titania | sphere-texture | `4k_titania.png`         | —                  | —                | —                 | —                       |
| oberon  | sphere-texture | `4k_oberon.png` (+ WebP) | —                  | —                | —                 | —                       |

### Neptunian + Pluto system

| Body   | Render path    | Map today       | Normal/Rough today | Variant manifest | Visual provenance | `assetManifest.ts` rows |
| ------ | -------------- | --------------- | ------------------ | ---------------- | ----------------- | ----------------------- |
| triton | sphere-texture | `4k_triton.png` | —                  | —                | —                 | —                       |
| pluto  | sphere-texture | `8k_pluto.jpg`  | —                  | —                | —                 | —                       |
| charon | sphere-texture | `4k_charon.png` | —                  | —                | —                 | —                       |

### Main-belt dwarfs + asteroids (mixed paths)

| Body   | Render path    | Map today                                          | Normal/Rough today | Variant manifest | Visual provenance | `assetManifest.ts` rows                                                |
| ------ | -------------- | -------------------------------------------------- | ------------------ | ---------------- | ----------------- | ---------------------------------------------------------------------- |
| ceres  | sphere-texture | `2k_ceres.jpg`                                     | —                  | —                | —                 | —                                                                      |
| vesta  | glb-model      | `vesta_dawn_embedded.png` (fallback)               | — (GLB-internal)   | —                | —                 | `vesta-model-active`, `vesta-map-fallback`                             |
| pallas | obj-model      | procedural (no map)                                | — (OBJ path)       | —                | —                 | `pallas-model-active`, `pallas-model-fallback`                         |
| hygiea | obj-model      | `hygiea_vlt_2017_2018_map.png` candidate (blocked) | — (OBJ path)       | —                | —                 | `hygiea-model-active`, `hygiea-model-fallback`, `hygiea-map-candidate` |

### TNO / dwarf-planet family

| Body     | Render path       | Map today                            | Normal/Rough today | Variant manifest | Visual provenance                                          | `assetManifest.ts` rows                      |
| -------- | ----------------- | ------------------------------------ | ------------------ | ---------------- | ---------------------------------------------------------- | -------------------------------------------- |
| haumea   | glb-model         | `4k_haumea_fictional.jpg` (fallback) | — (GLB-internal)   | —                | — (fictional texture flagged)                              | `haumea-model-active`, `haumea-map-fallback` |
| makemake | sphere-texture    | `4k_makemake_fictional.jpg`          | —                  | —                | — (filename marks fictional)                               | —                                            |
| eris     | sphere-texture    | `2k_eris.jpg`                        | —                  | —                | — (fictional variant `4k_eris_fictional.jpg` in `public/`) | —                                            |
| gonggong | sphere-procedural | —                                    | —                  | —                | `fidelity: "interpretive"`                                 | —                                            |
| quaoar   | sphere-procedural | —                                    | —                  | —                | `fidelity: "observational-model"` (shape-only)             | —                                            |
| orcus    | sphere-procedural | —                                    | —                  | —                | `fidelity: "interpretive"`                                 | —                                            |
| sedna    | sphere-procedural | —                                    | —                  | —                | `fidelity: "interpretive"`                                 | —                                            |
| salacia  | sphere-procedural | —                                    | —                  | —                | `fidelity: "interpretive"`                                 | —                                            |
| vanth    | sphere-procedural | —                                    | —                  | —                | —                                                          | —                                            |
| weywot   | sphere-procedural | —                                    | —                  | —                | —                                                          | —                                            |

## Gaps the source-research document must close

For every body above with an empty Normal/Rough cell (i.e. every body except
earth), the per-body research must answer:

1. Is there a resolved global elevation/DEM or specular product from a
   mission archive? (Primary source — NASA SSS, USGS Astrogeology, LROC,
   MOLA, MDIS, Cassini ISS, Voyager, New Horizons, Dawn.)
2. If not, is there a published DEM derivative (shaded relief, slope map)
   that could be reprojected into a tangent-space normal map?
3. Is a direct roughness product available, or must it be derived from the
   DEM (slope variance, crater density) or from spectral reflectance?
4. Does the licence allow bundling plus the attribution required by the
   Earth bake precedent?

Bodies with no plausible Normal/Rough path — particularly most TNOs and
the currently-procedural small bodies — are valid "geometry-only" or
"deferred" outcomes for the shipping plan. They do not need fiction-grade
normal bakes.

## Pipeline adaptation facts (unchanged by research)

- `bake-earth-pbr.js` emits JPG at 2k and 8k only. No 4k. No boot tier.
- Bake output is JPG q92 mozjpeg 4:4:4 for normals (tangent-space fidelity
  requires chroma preserved) and JPG q85 grayscale mozjpeg for roughness
  (single-channel, `negate` flips specular → roughness).
- Variant wiring requires three edits per body per channel:
  1. Add the file(s) to `public/textures/`.
  2. Point `celestialBodies.ts` `body.textures.normal` / `.roughness` at
     the highest-tier path (the canonical fallback).
  3. Declare variants in `TEXTURE_VARIANT_MANIFEST` so
     `resolveTextureRequest` can pick per-profile tiers.
- `usePlanetAssets.ts` already resolves `normal` + `roughness` channels for
  every sphere body — no runtime wiring change needed on sphere-texture.
- `usePlanetMaterials.ts` applies `normalMap` + `roughnessMap` when the
  albedo `textureMap` is loaded (see `usePlanetAssets.ts:172–177`: PBR
  maps only take effect alongside an active albedo). This matches the
  Earth case and means bodies that still render procedurally get zero PBR
  benefit.
- Model-body render path does NOT consume `normal`/`roughness` from the
  catalog. `PlanetModel.tsx:129–141` builds `MeshStandardMaterialParameters`
  with only `map`, `roughness`, `metalness`. Adding PBR to Vesta, Haumea,
  Pallas, Hygiea requires material assembly changes in PlanetModel —
  that's Wave 3 work, scoped in `pbr-pipeline-extension.md`.
