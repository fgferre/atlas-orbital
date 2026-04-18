# PBR Sources Research — Per-Body Audit

**Scope.** Fills the Normal/Rough gaps left by
[`pbr-local-inventory.md`](pbr-local-inventory.md). Every body with an
empty Normal/Rough cell in the inventory is answered here with a single
conclusion: full PBR / normal-only / geometry-only / deferred. The
rankings that follow in [`pbr-shipping-priority.md`](pbr-shipping-priority.md)
consume these conclusions.

**Honesty constraint.** `tasks/lessons.md:L4` — provenance labels name
what we actually shipped, not the literature we skimmed. Bodies where
research did not confirm a usable source are labelled
**"unresolved — needs manual verification"** rather than fabricated. It is
acceptable, and expected, for large portions of the TNO family to land in
the deferred bucket.

## Source hierarchy (strict, as applied)

1. **Primary mission archive / agency cartographic product** — USGS
   Astrogeology Astropedia ISIS-processed mosaics and DEMs, NASA PDS,
   ESA PSA, NASA Solar System Scope (CC BY 4.0 on the vendor side, used
   as an optional Earth-precedent-style fallback where SSS ships the
   product).
2. **Official derived product** — USGS-authored DEMs, shaded reliefs,
   blended multi-mission mosaics.
3. **CC BY / CC0 published** — ESO public image releases, Solar System
   Scope. Origin 403s: mirror via Wayback (the Earth bake precedent).
4. **Rejected.** Community art, fan remixes, non-commercial-only
   releases, undocumented licences. Björn Jónsson's reconstructions were
   considered but his licence page was not resolved in this window — do
   not bundle.

## Licence ground-truth table

| Source family           | Rights basis                               | Attribution template                                                          |
| ----------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| USGS Astropedia product | U.S. public domain + "please cite authors" | `NASA/<mission team> — <instrument>; processed by USGS Astrogeology`          |
| NASA JPL Photojournal   | U.S. public domain, ack. NASA              | `NASA/JPL-Caltech[/<institution>]`                                            |
| ESA / Mars Express HRSC | **CC BY-SA 3.0 IGO** — share-alike         | `ESA/DLR/FU Berlin — Mars Express HRSC (CC BY-SA 3.0 IGO)`                    |
| ESO (VLT / SPHERE)      | CC BY 4.0                                  | `ESO/<author name> (SPHERE)`                                                  |
| Solar System Scope      | CC BY 4.0                                  | `Solar System Scope (solarsystemscope.com), CC BY 4.0`                        |
| DLR (Dawn FC DTMs)      | U.S. PD via USGS mirror; cite DLR          | `NASA/JPL-Caltech/UCLA/MPS/DLR/IDA — Dawn FC; processed by USGS Astrogeology` |

## Summary table

| Body                                                         | Best surface map                                          | Best DEM / shape                              | Direct specular?                            | Bake outcome today                            | Rights                                 |
| ------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- | --------------------------------------------- | -------------------------------------- |
| Mercury                                                      | MDIS BDR 166 m (USGS)                                     | MESSENGER DEM ~665 m (USGS v2)                | No                                          | full PBR (DEM → normal)                       | USGS PD + cite                         |
| Venus                                                        | Magellan C3-MDIR 2025 m (USGS)                            | Magellan topography 4641 m (USGS)             | Magellan meter-slope product 4641 m (radar) | full PBR (radar caveat)                       | USGS PD + cite                         |
| Mars                                                         | Viking MDIM 2.1 232 m                                     | MOLA MEGDR 463 m; MOLA+HRSC 200 m blend       | No; TES albedo @ ~3 km                      | full PBR (MOLA-only path)                     | USGS PD; HRSC blend = CC BY-SA 3.0 IGO |
| Moon                                                         | LROC WAC 100 m                                            | SLDEM2015 59 m (±60°) + LOLA 118 m polar fill | No                                          | full PBR                                      | USGS PD + cite                         |
| Io                                                           | Galileo/Voyager colour 1 km                               | none global                                   | No                                          | normal-only (weak, albedo-bump)               | USGS PD + cite                         |
| Europa                                                       | Voyager-Galileo SSI 500 m                                 | none global                                   | No                                          | normal-only (marginal)                        | USGS PD + cite                         |
| Ganymede                                                     | Voyager-Galileo SSI 1 km                                  | none global                                   | No                                          | normal-only (marginal)                        | USGS PD + cite                         |
| Callisto                                                     | Voyager-Galileo 1 km                                      | none global                                   | No                                          | normal-only (marginal)                        | USGS PD + cite                         |
| Mimas                                                        | Cassini ISS 216 m (Schenk/JPL Photojournal)               | none global                                   | No                                          | normal-only (marginal)                        | NASA PD + Schenk/LPI cite              |
| Enceladus                                                    | Cassini HPF 110 m (USGS/Schenk)                           | Cassini global DEM 200 m (Schenk)             | No                                          | full PBR                                      | USGS PD + Schenk cite                  |
| Tethys                                                       | Cassini global 293 m                                      | none global                                   | No                                          | normal-only (marginal)                        | USGS PD + cite                         |
| Dione                                                        | Cassini-Voyager 154 m                                     | none global                                   | No                                          | normal-only (marginal)                        | USGS PD + cite                         |
| Rhea                                                         | Cassini-Voyager 417 m                                     | none global                                   | No                                          | normal-only (marginal)                        | USGS PD + cite                         |
| Titan                                                        | Cassini ISS 4005 m (already shipping) / SAR-HiSAR 351 m   | Cassini GTDR (sparse)                         | No (haze-dominated)                         | defer (atmosphere body)                       | USGS PD + cite                         |
| Iapetus                                                      | Cassini-Voyager 803 m                                     | none global                                   | No                                          | normal-only (weak; albedo dichotomy)          | USGS PD + cite                         |
| Phobos                                                       | Viking 5 m / MEX SRC 12 m                                 | HRSC DEM 100 m                                | No                                          | full PBR (best small-body case)               | USGS PD; HRSC CC BY-SA 3.0 IGO         |
| Deimos                                                       | unresolved — no modern global controlled mosaic confirmed | none global                                   | No                                          | defer                                         | NASA PD (Viking-era)                   |
| Triton                                                       | Voyager 2 global colour 600 m (uses synthetic north fill) | none                                          | No                                          | normal-only (mask fill region out)            | USGS PD + cite                         |
| Miranda                                                      | unresolved — USGS hosts control network only              | none                                          | No                                          | defer (hemispheric blind side)                | NASA PD                                |
| Ariel                                                        | unresolved — same                                         | none                                          | No                                          | defer                                         | NASA PD                                |
| Umbriel                                                      | unresolved — control network only                         | none                                          | No                                          | defer                                         | NASA PD                                |
| Titania                                                      | unresolved — same                                         | none                                          | No                                          | defer                                         | NASA PD                                |
| Oberon                                                       | unresolved — same                                         | none                                          | No                                          | defer                                         | NASA PD                                |
| Pluto                                                        | New Horizons LORRI-MVIC 300 m                             | NH LORRI-MVIC DEM 300 m                       | No                                          | full PBR (encounter hemisphere only)          | USGS PD + cite                         |
| Charon                                                       | New Horizons LORRI-MVIC 300 m                             | NH LORRI-MVIC DEM 300 m                       | No                                          | full PBR (same caveat)                        | USGS PD + cite                         |
| Ceres                                                        | Dawn FC HAMO 140 m                                        | Dawn FC2 HAMO DTM 137 m                       | No                                          | full PBR                                      | USGS PD + DLR cite                     |
| Vesta                                                        | Dawn FC HAMO 60 m                                         | Dawn FC HAMO DTM 93 m                         | No                                          | full PBR (blocked by glb-model path — Wave 3) | USGS PD + DLR cite                     |
| Pallas                                                       | VLT/SPHERE (tens of km/px)                                | SPHERE ADAM/KOALA shape                       | No                                          | geometry-only                                 | ESO CC BY 4.0                          |
| Hygiea                                                       | VLT/SPHERE                                                | SPHERE shape (Vernazza 2019)                  | No                                          | geometry-only                                 | ESO CC BY 4.0                          |
| Haumea                                                       | none resolved                                             | shape-only (ellipsoid + ring)                 | —                                           | defer                                         | —                                      |
| Makemake                                                     | none resolved                                             | —                                             | —                                           | defer                                         | —                                      |
| Eris                                                         | none resolved                                             | —                                             | —                                           | defer                                         | —                                      |
| Gonggong / Quaoar / Orcus / Sedna / Salacia / Vanth / Weywot | none resolved                                             | photometric / occultation shapes only         | —                                           | defer                                         | —                                      |
| Jupiter / Saturn / Uranus / Neptune                          | gas giants — out of track                                 | —                                             | —                                           | gas-giant-track                               | —                                      |

---

## Inner planets + Moon

### Mercury

- **Mission(s)**: MESSENGER MDIS (NASA/APL/CIW).
- **Surface map**: MESSENGER MDIS Global Basemap BDR **166 m/px** at 256 ppd (~92,160 × 46,080 px). Related 250 m / 665 m colour mosaics available.
- **DEM**: USGS MESSENGER global DEM (stereo-derived v2, ~665 m/px for the full global grid). Regional higher-res tiles exist.
- **Rights**: USGS PD + cite. URL: https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_global_basemap_bdr_166m ; https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_global_mosaic_250m
- **Attribution**: `NASA/Johns Hopkins APL/Carnegie Institution of Washington — MESSENGER MDIS; processed by USGS Astrogeology`
- **Roughness path**: DEM slope magnitude (gradient of elevation, smoothed). No SSS Mercury specular product exists.
- **Bake outcome**: **full PBR**. Pure USGS PD chain, straight-up DEM→normal.

### Venus

- **Mission(s)**: Magellan (NASA/JPL).
- **Surface map**: Magellan C3-MDIR SAR mosaic **2025 m/px** (ladder extends to 4641 m colorised and 6600 m colour+topo).
- **DEM**: Magellan Global Topography **4641 m/px**.
- **Ancillary (rare win)**: Magellan **meter-scale slope product 4641 m** — directly a roughness proxy. Plus Fresnel reflectivity and microwave emissivity at same scale.
- **URLs**: https://astrogeology.usgs.gov/search/map/venus_magellan_global_c3_mdir_mosaic_2025m ; https://astrogeology.usgs.gov/search/map/venus_magellan_global_topography_4641m ; https://astrogeology.usgs.gov/search/map/venus_magellan_global_meter_scale_slope_4641m
- **Attribution**: `NASA/JPL-Caltech — Magellan; processed by USGS Astrogeology`
- **Roughness path**: Magellan meter-slope → invert → grayscale roughness. This is the only body in the audit where the mission ships a near-direct PBR-roughness analogue.
- **Bake outcome**: **full PBR, with caveat.** PBR is physically consistent with a radar visualisation; Atlas currently renders `8k_venus_surface.jpg` which is an optical-style colourisation. Provenance label must say "Magellan radar-scale PBR" so the visual doesn't claim more than it is.

### Mars

- **Mission(s)**: Viking, MGS MOLA, Mars Express HRSC (ESA).
- **Surface map**: Viking MDIM 2.1 232 m (USGS grayscale + colourised).
- **DEM**: MOLA MEGDR **463 m/px** (pure NASA path). MOLA+MEX-HRSC blended DEM **200 m/px** (stronger topographically but pulls in HRSC CC BY-SA 3.0 IGO).
- **URLs**: https://astrogeology.usgs.gov/search/map/viking_mdim2_1_grayscale_global_mosaic_232m ; https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m ; https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m
- **Attribution**: `NASA/JPL-Caltech/MSSS — Viking; MGS MOLA; [optionally] ESA/DLR/FU Berlin — Mars Express HRSC (CC BY-SA 3.0 IGO); processed by USGS Astrogeology`
- **Roughness path**: MOLA slope or TES thermal-inertia. SSS Mars has colour only — no specular.
- **Bake outcome**: **full PBR**. Recommend MOLA-only (463 m) to keep the licence chain clean; promote to blended 200 m only if the user accepts CC BY-SA 3.0 IGO on the roughness product.

### Moon

- **Mission(s)**: LRO (LROC, LOLA), SELENE/Kaguya.
- **Surface map**: LROC WAC Global Morphology Mosaic **100 m/px** (v3 June 2013, 109,164 × 54,582 px).
- **DEM**: SLDEM2015 **59 m/px** (±60° lat only, LOLA+Kaguya TC merge) + LOLA DEM **118 m/px** for polar fill.
- **URLs**: https://astrogeology.usgs.gov/search/map/moon_lro_lroc_wac_global_morphology_mosaic_100m ; https://astrogeology.usgs.gov/search/map/moon_lro_lola_dem_118m ; https://astrogeology.usgs.gov/search/map/Moon/LRO/LOLA/Lunar_LRO_LOLAKaguya_DEMmerge_60N60S_512ppd ; https://pgda.gsfc.nasa.gov/products/54
- **Attribution**: `NASA/GSFC/Arizona State University (LROC); NASA LOLA team; JAXA/SELENE/Kaguya team; processed by USGS Astrogeology`
- **Roughness path**: SLDEM slope-variance → roughness. SSS does not ship Moon specular.
- **Bake outcome**: **full PBR, best non-Earth candidate.** Expect a ±60° seam where SLDEM stops; polar tiles must come from the 118 m LOLA product.

## Martian moons

### Phobos

- **Mission(s)**: Viking (NASA), Mars Express SRC + HRSC (ESA/DLR).
- **Surface map**: Viking Global Mosaic **5 m/px** (DLR-controlled); MEX SRC global 12 m as secondary.
- **DEM**: HRSC Global DEM **100 m/px**. Shaded relief 100 m also published.
- **URLs**: https://astrogeology.usgs.gov/search/map/phobos_viking_global_mosaic_5m ; https://astrogeology.usgs.gov/search/map/phobos_mars_express_src_global_mosaic_12m ; https://astrogeology.usgs.gov/search/map/phobos_mars_express_hrsc_dem_global_100m
- **Attribution**: `NASA/JPL-Caltech/USGS — Viking; ESA/DLR/FU Berlin — Mars Express HRSC (CC BY-SA 3.0 IGO)`
- **Roughness path**: HRSC DEM slope.
- **Bake outcome**: **full PBR, strongest small-body case.** Licence blocker: the DEM is HRSC CC BY-SA 3.0 IGO. If share-alike is unacceptable for bundled assets, fall back to Viking-only (no DEM → normal from albedo).
- **Gotcha**: non-spherical body. DEM delivered in equirect projection assumes a sphere-equivalent reference — tangent-space normals need care at the limb where the actual surface is far from the reference sphere.

### Deimos

- **Best surface map**: **unresolved.** USGS Astropedia search did not surface a modern controlled global mosaic; `2k_deimos.jpg` in `public/textures/` is a Viking-era legacy whose exact provenance is not confirmed.
- **DEM**: none global.
- **Bake outcome**: **defer.** Do not raise Deimos to PBR parity with Phobos without a verified source.

## Moon + Galilean

### Io

- **Surface map**: Galileo SSI + Voyager colour-merged global mosaic **1 km/px** (USGS).
- **DEM**: none global.
- **URL**: https://astrogeology.usgs.gov/search/map/io_galileo_ssi_voyager_color_merged_global_mosaic_1km
- **Attribution**: `NASA/JPL-Caltech/USGS — Galileo SSI + Voyager`
- **Bake outcome**: **normal-only (weak).** Albedo-derived bump will hallucinate relief on volcanic plains and create photometric seams at the Voyager/Galileo coverage terminators. Recommend procedural roughness scalar.

### Europa

- **Surface map**: Voyager-Galileo SSI **500 m/px** (the source Atlas already carries at 4096×2048).
- **DEM**: none global; only regional Schenk stereo DEMs over flyby footprints.
- **URL**: https://astrogeology.usgs.gov/search/map/Europa/Voyager-Galileo/Europa_Voyager_GalileoSSI_global_mosaic_500m
- **Bake outcome**: **normal-only (marginal).** Europa's chaos terrain is albedo-dominated; DEM data too sparse for a global normal map.

### Ganymede

- **Surface map**: Voyager-Galileo SSI **1 km** grayscale / **1.4 km** colour.
- **DEM**: none global.
- **URL**: https://astrogeology.usgs.gov/search/map/ganymede_voyager_galileo_ssi_global_mosaic_1km
- **Bake outcome**: **normal-only (marginal).**

### Callisto

- **Surface map**: Galileo/Voyager 1 km global (USGS).
- **URL**: https://astrogeology.usgs.gov/search/map/callisto_galileo_voyager_global_mosaic_1km
- **Bake outcome**: **normal-only (marginal).** Heavy cratering makes albedo-bump plausible-looking but unphysical.

## Saturnian

### Mimas

- **Surface map**: Cassini ISS global colour mosaic **216 m/px** (Schenk at LPI; published via NASA JPL Photojournal as PIA17214).
- **DEM**: none published globally.
- **URLs**: https://science.nasa.gov/resource/mimas-global-map-june-2017/ ; https://www.jpl.nasa.gov/images/pia17214-mimas-global-map-june-2017/
- **Attribution**: `NASA/JPL-Caltech/Space Science Institute; mosaic by Paul Schenk, Lunar and Planetary Institute`
- **Bake outcome**: **normal-only (weak).** Herschel crater dominates visually; albedo-bump over-reads it. No USGS Astropedia entry returned for Mimas in the research window.

### Enceladus

- **Surface map**: Cassini ISS Global Mosaic HPF **110 m/px** (USGS/Schenk).
- **DEM**: Cassini global DEM **200 m/px** (Schenk).
- **URLs**: https://astrogeology.usgs.gov/search/map/enceladus_cassini_iss_global_mosaic_hpf_110m ; https://astrogeology.usgs.gov/search/map/enceladus-cassini-global-dem-200m-schenk
- **Attribution**: `NASA/JPL-Caltech/Space Science Institute — Cassini ISS; Schenk (LPI) stereo DEM; processed by USGS Astrogeology`
- **Bake outcome**: **full PBR.** DEM-derived normal captures tiger-stripes; slope-derived roughness plausible. Near-global but not 100%; north-polar stereo overlap is reduced.

### Tethys

- **Surface map**: Cassini global mosaic **293 m/px** (USGS).
- **URL**: https://astrogeology.usgs.gov/search/map/tethys_cassini_global_mosaic_293m
- **Bake outcome**: **normal-only (marginal).** Odysseus rim is photometrically prominent; DEM absent globally.

### Dione

- **Surface map**: Cassini-Voyager **154 m/px** (USGS).
- **URL**: https://astrogeology.usgs.gov/search/map/dione_cassini_voyager_global_mosaic_154m
- **Bake outcome**: **normal-only (marginal).** Trailing-hemisphere wispy terrain is albedo.

### Rhea

- **Surface map**: Cassini-Voyager **417 m/px** (USGS).
- **URL**: https://astrogeology.usgs.gov/search/map/rhea_cassini_voyager_global_mosaic_417m
- **Bake outcome**: **normal-only (marginal).** Voyager polar fill will photometrically seam at high northern latitudes.

### Titan

- **Surface map**: Cassini ISS **4005 m/px** (already active at `titan_cassini_iss_global_mosaic_4km.jpg`); Cassini SAR-HiSAR 351 m/px available but radar.
- **DEM**: Cassini GTDR — sparse/regional.
- **URLs**: https://astrogeology.usgs.gov/search/map/titan_cassini_iss_global_mosaic_4005m ; https://astrogeology.usgs.gov/search/map/titan_cassini_sar_hisar_global_mosaic_351m
- **Bake outcome**: **defer.** Titan's visible appearance is dominated by atmospheric haze; PBR normal/roughness on the surface is the wrong abstraction. Titan belongs to a separate atmospheric-shader track with the gas giants.

### Iapetus

- **Surface map**: Cassini-Voyager **803 m/px** (USGS).
- **URL**: https://astrogeology.usgs.gov/search/map/iapetus_cassini_voyager_global_mosaic_803m
- **Bake outcome**: **normal-only (weak).** Cassini Regio / bright hemisphere is a pure albedo dichotomy. Bumping that is an active lie about the geology.

## Uranian moons

**Class verdict: defer.** Voyager 2 January 1986 was the only close pass,
covering only the southern hemisphere of each. USGS publishes _image
control networks_ (photogrammetric products) — **not albedo mosaics** —
for Miranda, Umbriel, and Oberon. A controlled photomosaic of the
southern hemispheres (USGS 1992 publication) exists but no downloadable
global GeoTIFF was located for any of these bodies in this research
window.

- Surface map: **unresolved — needs manual verification** on each USGS
  product page for Miranda/Ariel/Umbriel/Titania/Oberon.
- DEM: none.
- URLs (control networks only): https://astrogeology.usgs.gov/search/map/umbriel_voyager_image_control_network ;
  https://astrogeology.usgs.gov/search/map/oberon_voyager_image_control_network ;
  https://astrogeology.usgs.gov/search/details/Miranda/ControlNetworks/Miranda_data
- **Fallback consideration:** Björn Jónsson `bjj.mmedia.is` reconstructs
  full-globe maps of these moons but his licence terms were not resolved
  here. **Do not bundle without resolving with the author.**
- **Bake outcome:** defer. Current `4k_*.png` textures in `public/` are
  full-sphere extrapolations from sub-hemisphere data; they should not
  be promoted further without verified data.

## Neptunian

### Triton

- **Surface map**: Voyager 2 Global Color Mosaic **600 m/px** (USGS 2014 reprocessing).
- **URL**: https://astrogeology.usgs.gov/search/map/triton_voyager_2_global_color_mosaic_600m
- **Attribution**: `NASA/JPL-Caltech/USGS — Voyager 2 ISS`
- **Bake outcome**: **normal-only (partial).** The product explicitly synthesises the un-imaged northern ~40% (`GlobalFill` in the filename). A normal bake must **mask out** the synthetic region or it hallucinates relief. Cantaloupe terrain in the imaged south is genuinely bumpable from luminance.

## Pluto system

### Pluto

- **Surface map**: New Horizons LORRI-MVIC **300 m/px** (USGS July 2017).
- **DEM**: New Horizons LORRI-MVIC **300 m/px** global DEM.
- **URLs**: https://astrogeology.usgs.gov/search/map/pluto_new_horizons_lorri_mvic_global_mosaic_300m ; https://astrogeology.usgs.gov/search/map/pluto_new_horizons_lorri_mvic_global_dem_300m
- **Attribution**: `NASA/Johns Hopkins APL/SwRI — New Horizons; processed by USGS Astrogeology`
- **Bake outcome**: **full PBR.** Caveat: 300 m is the best-case encounter-hemisphere resolution; the sub-Charon (anti-encounter) hemisphere was imaged only at much lower resolution. Do not advertise 8k Pluto without visibly down-weighting the far side in marketing text.

### Charon

- **Surface map**: New Horizons LORRI-MVIC **300 m/px**.
- **DEM**: New Horizons LORRI-MVIC **300 m/px**.
- **URLs**: https://astrogeology.usgs.gov/search/map/charon_new_horizons_lorri_mvic_global_mosaic_300m ; https://astrogeology.usgs.gov/search/map/charon_new_horizons_lorri_mvic_global_dem_300m
- **Bake outcome**: **full PBR, same anti-encounter caveat as Pluto.**

## Main-belt dwarfs + asteroids

### Ceres

- **Surface map**: Dawn FC HAMO Global Mosaic **140 m/px** (USGS/DLR).
- **DEM**: Dawn FC2 HAMO Global DTM **137 m/px** (USGS/DLR).
- **URLs**: https://astrogeology.usgs.gov/search/map/ceres_dawn_fc_global_mosaic_140m ; https://astrogeology.usgs.gov/search/map/ceres_dawn_fc2_hamo_global_dtm_137m
- **Attribution**: `NASA/JPL-Caltech/UCLA/MPS/DLR/IDA — Dawn Framing Camera; processed by USGS Astrogeology`
- **Bake outcome**: **full PBR.** Mosaic + DTM co-registered at near-identical scale = clean bake.

### Vesta

- **Surface map**: Dawn FC HAMO Global Mosaic **60 m/px** (USGS/DLR).
- **DEM**: Dawn FC HAMO Global DTM **93 m/px**; LAMO shape models at higher res.
- **URLs**: https://astrogeology.usgs.gov/search/map/vesta_dawn_fc_hamo_global_mosaic_60m ; https://astrogeology.usgs.gov/search/map/vesta_dawn_fc_hamo_global_dtm_93m
- **Bake outcome**: **full PBR — blocked by model-body path.** Vesta ships via `glb-model` in Atlas today (`PlanetModel.tsx:39`). PBR channels are not wired into GLB material assembly — this is Wave 3. Data is ready when the pipeline is.

### Pallas

- **Surface map**: VLT/SPHERE 2017–2019 reconstructions (Marsset 2020). Effective sampling tens of km/px over the sub-Earth hemisphere per epoch; multi-epoch composite is heavily deconvolved.
- **Shape**: ADAM/KOALA shape inversion.
- **Licence**: ESO CC BY 4.0 (`ESO/M. Marsset et al. (SPHERE/ZIMPOL)`).
- **Paper**: https://www.eso.org/public/archives/releases/sciencepapers/eso2114/eso2114a.pdf
- **Bake outcome**: **geometry-only.** Pixel count too low to synthesise a 2k normal without invention. The current obj-model + procedural surface is the correct outcome.

### Hygiea

- **Surface map**: VLT/SPHERE 2017–2019 (Vernazza 2020, Nature Astronomy).
- **Shape**: SPHERE-derived, basin-free, R_eq = 217 ± 7 km.
- **Licence**: ESO CC BY 4.0 (`ESO/P. Vernazza et al. (SPHERE)`).
- **URLs**: https://www.eso.org/public/images/eso1918a/ ; https://www.nature.com/articles/s41550-019-0915-8
- **Bake outcome**: **geometry-only.** The candidate `hygiea_vlt_2017_2018_map.png` is usable as an albedo hint if attribution is wired, but PBR is not plausible.

## TNO family

### Haumea, Makemake, Eris, Gonggong, Quaoar, Orcus, Sedna, Salacia, Vanth, Weywot

- **Surface map**: **none resolved globally** for any. Integrated photometry + occultation shapes only.
- **DEM**: none.
- **Bake outcome**: **defer.** Keep sphere-procedural path. PBR channels would be fiction. Current fictional textures (`4k_haumea_fictional.jpg`, `4k_makemake_fictional.jpg`, `4k_eris_fictional.jpg`) are correctly labelled and should not be "upgraded" to PBR.

## Gas giants (flag only — separate track)

Jupiter, Saturn, Uranus, Neptune. Surfaces are cloud tops: normal and
roughness maps have no physical meaning here. The existing sphere-texture
cloud albedo is the right abstraction; future work is atmospheric shading
(view-angle scattering, limb darkening, banding animation) and belongs
to a separate initiative alongside Titan.

## Items flagged as unresolved

- **Deimos global controlled mosaic** — USGS search did not return a modern entry; `2k_deimos.jpg` provenance is legacy. Manual check of NASA Photojournal required before promoting.
- **Uranian-moon global albedo GeoTIFFs** — only control networks confirmed. Manual verification on each body's Astropedia details page required. USGS 1992 southern-hemisphere photomosaic publication exists but not located as a downloadable GeoTIFF.
- **Björn Jónsson licence terms** (`bjj.mmedia.is`) — must be resolved with the author directly before using any of his reconstructions for the Uranian moons (or any body).
- **Per-product USGS "Use Constraints" strings** — only the `moon_lro_lola_dem_118m` constraint was fetched verbatim ("Please cite authors"). The bake-recipe author must fetch each product page and copy the constraint text rather than assume.

These are the honest gaps. They do not block shipping Wave 1 — they
constrain Waves 2 and 3.
