# PBR Shipping Priority — Ranked Plan

**Purpose.** The deliverable. Consumes
[`pbr-local-inventory.md`](pbr-local-inventory.md) and
[`pbr-sources-research.md`](pbr-sources-research.md) and produces a
ranked shipping plan: which bodies, in which order, on which pipeline
track. Downstream per-body implementation sessions execute directly
against this matrix.

## Scoring formula

One formula, applied uniformly to every body:

```
shippingScore = 0.35·UX + 0.35·SourceQuality
              + 0.20·(10 − Effort) + 0.10·(10 − BundleCost)
```

All inputs on a 0–10 scale.

| Weight | Axis          | Lower better? | Rationale                                                    |
| ------ | ------------- | ------------- | ------------------------------------------------------------ |
| 0.35   | UX visibility | higher better | A body the user never zooms to is not worth a 3 MB bake.     |
| 0.35   | SourceQuality | higher better | If the data is fiction, PBR amplifies the fiction.           |
| 0.20   | Effort        | **lower**     | Cost to adapt the Earth pipeline; model-bodies blow this up. |
| 0.10   | BundleCost    | **lower**     | Incremental MB across profiles. Small next to the UX signal. |

**Why these weights.** UX and SourceQuality are co-dominant and together
drive 70% of the score — they represent "do users care" and "are we
telling the truth". Effort is secondary (20%) because the pipeline is a
one-time cost per body; users who install the build pay bundle cost
every session (10%) but the PBR channels at ultra sit at ~3 MB/body,
small next to the albedo maps already shipping. The formula
deliberately refuses to let Effort veto a high-UX body with strong
data; Vesta ends up behind Wave 1 but not rejected, and the pipeline
work to unblock it is tracked as Wave 3.

**Alternative weights considered.** Equal weighting (0.25 × 4) would
elevate low-UX bodies with strong data (Enceladus above Venus). Weighting
UX at 0.5 would sideline Ceres even though its Dawn data is as clean as
anything in the catalogue. The chosen weights reflect the team's
operating principle: we ship PBR where both the user sees the body AND
the mission record supports it.

**Inputs are judgment calls.** UX visibility is estimated from the
Atlas catalogue role (major planet vs. TNO) and focus-camera patterns —
not measured. SourceQuality comes directly from
[`pbr-sources-research.md`](pbr-sources-research.md) summary column.
Effort is a three-tier ladder (2 = sphere + direct bake, 4–5 = sphere +
derivation work, 8 = model-body) — see _Effort rubric_ below.

## Effort rubric

| Effort | Scenario                                                                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2      | Sphere-texture body + mission ships both albedo mosaic AND DEM (or direct specular). Bake script is a near-copy of `bake-earth-pbr.js` with different URLs and an inversion-flag tweak. |
| 4      | Sphere-texture body + DEM-only (no specular). Requires new DEM-gradient helper plus slope-variance → roughness path. Re-used once written.                                              |
| 5      | Sphere-texture body + no DEM. Normal-only from luminance-bump heuristic. Art-heavy rather than science-heavy; easy to over-bump.                                                        |
| 8      | Model-body (GLB or OBJ). Requires `PlanetModel.tsx` material-assembly changes before first bake — scoped separately.                                                                    |

## BundleCost rubric

Earth precedent at 2k+8k JPG: normal ≈ 2.6 MB + roughness ≈ 0.85 MB =
**3.5 MB per body at ultra**. At balanced (2k only) the same pair is
≈ 200 KB. The score:

| BundleCost | Scenario                                                      |
| ---------- | ------------------------------------------------------------- |
| 2          | normal-only bake (no roughness) ≈ 1.7 MB ultra / 75 KB 2k     |
| 3          | full PBR (normal + roughness) ≈ 3.5 MB ultra / 200 KB 2k      |
| 5          | model-body PBR: same bytes + additional material-assembly LOC |
| 0          | defer / geometry-only / gas-giant — no bundle delta           |

## Matrix

Scores computed from the rubric above; math shown per row.

| Body      | Family          | Render path today | UX  | SrcQ | Effort | BC  | shippingScore | Outcome                                                   |
| --------- | --------------- | ----------------- | --- | ---- | ------ | --- | ------------- | --------------------------------------------------------- |
| moon      | Earth-moon      | sphere-texture    | 9   | 10   | 2      | 3   | **8.95**      | full PBR (Wave 1)                                         |
| mars      | inner           | sphere-texture    | 9   | 9    | 2      | 3   | **8.60**      | full PBR (Wave 1)                                         |
| mercury   | inner           | sphere-texture    | 7   | 8    | 2      | 3   | **7.55**      | full PBR (Wave 1)                                         |
| venus     | inner           | sphere-texture    | 7   | 8    | 2      | 3   | **7.55**      | full PBR (Wave 1)                                         |
| enceladus | saturnian       | sphere-texture    | 6   | 8    | 2      | 3   | **7.20**      | full PBR (Wave 2)                                         |
| ceres     | main-belt dwarf | sphere-texture    | 5   | 9    | 2      | 3   | **7.20**      | full PBR (Wave 2)                                         |
| pluto     | Pluto system    | sphere-texture    | 7   | 7    | 2      | 3   | **7.20**      | full PBR (Wave 2; far-side caveat)                        |
| phobos    | martian         | sphere-texture    | 5   | 9    | 3      | 2   | **7.10**      | full PBR (Wave 2; Viking-only variant if CC BY-SA blocks) |
| charon    | Pluto system    | sphere-texture    | 5   | 7    | 2      | 3   | **6.50**      | full PBR (Wave 2)                                         |
| vesta     | main-belt dwarf | glb-model         | 5   | 9    | 8      | 5   | **5.80**      | full PBR (Wave 3 — model-body)                            |
| io        | galilean        | sphere-texture    | 7   | 3    | 5      | 2   | **5.30**      | normal-only (deferred — weak data)                        |
| europa    | galilean        | sphere-texture    | 7   | 3    | 5      | 2   | **5.30**      | normal-only (deferred)                                    |
| ganymede  | galilean        | sphere-texture    | 6   | 3    | 5      | 2   | **5.00**      | normal-only (deferred)                                    |
| callisto  | galilean        | sphere-texture    | 5   | 3    | 5      | 2   | **4.65**      | normal-only (deferred)                                    |
| mimas     | saturnian       | sphere-texture    | 4   | 2    | 5      | 2   | **3.90**      | defer                                                     |
| iapetus   | saturnian       | sphere-texture    | 4   | 2    | 5      | 2   | **3.90**      | defer (albedo-dichotomy; bump lies)                       |
| tethys    | saturnian       | sphere-texture    | 4   | 3    | 5      | 2   | **4.25**      | defer                                                     |
| dione     | saturnian       | sphere-texture    | 4   | 3    | 5      | 2   | **4.25**      | defer                                                     |
| rhea      | saturnian       | sphere-texture    | 4   | 3    | 5      | 2   | **4.25**      | defer                                                     |
| triton    | neptunian       | sphere-texture    | 4   | 3    | 5      | 2   | **4.25**      | defer (synthetic fill region)                             |
| titan     | saturnian       | sphere-texture    | 7   | 0    | —      | 0   | **—**         | separate track (atmospheric shader)                       |
| miranda   | uranian         | sphere-texture    | 3   | 0    | —      | 0   | **1.05**      | defer (Voyager southern-hemisphere only)                  |
| ariel     | uranian         | sphere-texture    | 3   | 0    | —      | 0   | **1.05**      | defer                                                     |
| umbriel   | uranian         | sphere-texture    | 3   | 0    | —      | 0   | **1.05**      | defer                                                     |
| titania   | uranian         | sphere-texture    | 3   | 0    | —      | 0   | **1.05**      | defer                                                     |
| oberon    | uranian         | sphere-texture    | 3   | 0    | —      | 0   | **1.05**      | defer                                                     |
| deimos    | martian         | sphere-texture    | 3   | 0    | —      | 0   | **1.05**      | defer (Viking-era; no modern global)                      |
| pallas    | main-belt       | obj-model         | 3   | 2    | 8      | 0   | **2.15**      | geometry-only (already OK)                                |
| hygiea    | main-belt       | obj-model         | 3   | 2    | 8      | 0   | **2.15**      | geometry-only (already OK)                                |
| haumea    | TNO             | glb-model         | 4   | 0    | 8      | 0   | **1.40**      | defer (fictional texture flagged)                         |
| makemake  | TNO             | sphere-texture    | 4   | 0    | —      | 0   | **1.40**      | defer (fictional)                                         |
| eris      | TNO             | sphere-texture    | 4   | 0    | —      | 0   | **1.40**      | defer (fictional)                                         |
| gonggong  | TNO             | sphere-procedural | 2   | 0    | —      | 0   | **0.70**      | defer                                                     |
| quaoar    | TNO             | sphere-procedural | 2   | 0    | —      | 0   | **0.70**      | defer                                                     |
| orcus     | TNO             | sphere-procedural | 2   | 0    | —      | 0   | **0.70**      | defer                                                     |
| sedna     | TNO             | sphere-procedural | 2   | 0    | —      | 0   | **0.70**      | defer                                                     |
| salacia   | TNO             | sphere-procedural | 2   | 0    | —      | 0   | **0.70**      | defer                                                     |
| vanth     | TNO moon        | sphere-procedural | 1   | 0    | —      | 0   | **0.35**      | defer                                                     |
| weywot    | TNO moon        | sphere-procedural | 1   | 0    | —      | 0   | **0.35**      | defer                                                     |
| jupiter   | gas giant       | sphere-texture    | 9   | —    | —      | —   | —             | gas-giant-track (separate)                                |
| saturn    | gas giant       | sphere-texture    | 9   | —    | —      | —   | —             | gas-giant-track (separate)                                |
| uranus    | gas giant       | sphere-texture    | 7   | —    | —      | —   | —             | gas-giant-track (separate)                                |
| neptune   | gas giant       | sphere-texture    | 7   | —    | —      | —   | —             | gas-giant-track (separate)                                |

_Math shown for the top ten rows:_ Moon 0.35·9 + 0.35·10 + 0.2·8 + 0.1·7
= 3.15 + 3.50 + 1.60 + 0.70 = **8.95**. Mars 3.15 + 3.15 + 1.60 + 0.70
= **8.60**. Mercury/Venus identical at 2.45 + 2.80 + 1.60 + 0.70 =
**7.55**. Enceladus/Ceres/Pluto all land at 7.20 via different
compositions (Enceladus 2.10 + 2.80 + 1.60 + 0.70; Ceres 1.75 + 3.15 +
1.60 + 0.70; Pluto 2.45 + 2.45 + 1.60 + 0.70). Phobos 1.75 + 3.15 +
1.40 + 0.80 = **7.10** — effort 3 reflects the non-spherical tangent-
space care; BundleCost 2 reflects the small body producing smaller maps.
Charon 1.75 + 2.45 + 1.60 + 0.70 = **6.50**. Vesta 1.75 + 3.15 + 0.40 +
0.50 = **5.80** — effort 8 and BundleCost 5 both reflect the blocked
model-body path.

## Wave composition

### Wave 1 — sphere-PBR quick wins (shippingScore ≥ 7, inner-system)

**Moon, Mars, Mercury, Venus.**

- All four are sphere-texture bodies already using `MeshStandardMaterial`.
- All four have mission-grade albedo mosaics and global DEMs under a
  pure USGS PD chain (Mars blend optional; MOLA-only keeps the licence
  clean).
- Per-body work is nearly a copy of `bake-earth-pbr.js`: swap URLs, swap
  inversion flag (specular present only for Venus via Magellan slope;
  the other three derive roughness from DEM gradient — see
  `pbr-pipeline-extension.md`).
- Session count: **4 × 1 session = 4 sessions.** Each session: fetch
  sources, run the per-body bake recipe, wire variants into
  `TEXTURE_VARIANT_MANIFEST`, update `body.textures` canonical paths,
  extend the assetManifest credit entries, update `CreditsModal`.
- Aggregate LOC across Wave 1: ~40 LOC per body (script parameters +
  manifest rows + test), total ≈ 160 LOC.
- Bundle-size contribution (ultra, all four shipped): **+14 MB**
  (4 × 3.5 MB). At balanced: **+0.8 MB**. At constrained: **+0 MB**
  (boot tier untouched; normal/roughness not in constrained
  preference).

### Wave 2 — sphere-PBR depth (shippingScore 6.5–7.2)

**Enceladus, Ceres, Pluto, Charon, Phobos.**

- First body forces the **DEM-gradient helper** into the pipeline
  (most of these bodies have DEM but no direct specular).
- Phobos pulls in the HRSC CC BY-SA 3.0 IGO licence question — ship a
  Viking-only variant if the user rejects share-alike on bundled
  assets.
- Pluto and Charon publish DEM + mosaic at **encounter-hemisphere**
  300 m; provenance label must not advertise uniform resolution.
- Session count: ~**1 session** to land the DEM-gradient helper + one
  body (Enceladus, easiest matched pair), then ~**1 session per body**
  for the other four. Total ≈ **6 sessions**.
- Aggregate LOC: DEM-gradient helper (~80 LOC + tests) +
  ~40 LOC/body × 5 ≈ **280 LOC**.
- Bundle contribution (ultra): **+17.5 MB** (5 × 3.5 MB). Balanced:
  +1.0 MB.

### Wave 3 — model-body architecture

**Vesta** (data ready; Haumea / Pallas / Hygiea stay geometry-only —
their source data does not justify the model-body PBR plumbing).

- Vesta's Dawn HAMO mosaic 60 m + DTM 93 m are clean USGS PD +
  DLR-cited products. The only blocker is `PlanetModel.tsx`: it builds
  `MeshStandardMaterialParameters` with `map`, `roughness`, `metalness`
  and never wires `normalMap` or `roughnessMap` (`PlanetModel.tsx:129`).
- Adding PBR support to `PlanetModel` needs a design pass first (scoped
  in `pbr-pipeline-extension.md`).
- Session count: ~**1 session for architecture** + 1 for Vesta bake
  - assetManifest = **2 sessions**. If Atlas later acquires better
    small-body data, the same architecture unblocks them for free.
- Aggregate LOC: ~**200 LOC** for material-assembly changes across
  `GLBModel` + `OBJModel` + their tests; ~40 LOC for Vesta bake.
- Bundle contribution (ultra): **+3.5 MB**. Balanced: +0.2 MB.

### Deferred bucket — no shipping action

**Normal-only weak (Io, Europa, Ganymede, Callisto, Mimas, Iapetus,
Tethys, Dione, Rhea, Triton).** Data exists but DEM is absent globally;
normal-from-luminance is high-effort for low-truth gain. Keep watching
USGS Astropedia for new releases; revisit annually.

**Uranian moons, Deimos.** Unresolved source problem, not an engineering
problem. When a verified global mosaic surfaces (or the Björn Jónsson
licence is clarified with the author), promote individually.

**Pallas, Hygiea.** Already at the best outcome (geometry-only obj-model

- procedural surface per the asset-study matrix).

**Haumea, Makemake, Eris, Gonggong, Quaoar, Orcus, Sedna, Salacia,
Vanth, Weywot.** No resolved global surface. Current sphere-procedural
/ fictional-labelled path is correct. Do not retrofit PBR onto fiction.

**Titan.** Atmospheric body, not surface body. Belongs in the gas-giant
track.

### Gas-giant track (separate initiative)

Jupiter, Saturn, Uranus, Neptune — and Titan honorary. Surfaces are
clouds: `normalMap` and `roughnessMap` have no physical meaning. Future
work is **atmospheric shading** (view-angle scattering, limb darkening,
animated banding), not PBR channels. This track is flagged but not
scoped here. Do not let gas-giant ambitions leak into the PBR plan.

## Aggregate totals (Waves 1+2+3 shipped)

| Metric                                   | Value                            |
| ---------------------------------------- | -------------------------------- |
| Bodies promoted to full PBR              | 10 (4 Wave 1 + 5 Wave 2 + Vesta) |
| Incremental sessions                     | ~12                              |
| Incremental LOC                          | ~640                             |
| Incremental bundle (ultra profile)       | ~35 MB across 10 bodies          |
| Incremental bundle (balanced profile)    | ~2 MB                            |
| Incremental bundle (constrained profile) | 0 MB — boot tier is albedo-only  |

## Exit criteria per wave

- **Wave 1 done when**: Moon, Mars, Mercury, Venus render with
  `textureNormal` + `textureRoughness` loaded at ultra; `CreditsModal`
  shows the exact attribution strings from `pbr-sources-research.md`;
  `VISUAL_ASSET_MANIFEST` carries `texture`/`normal` + `texture`/`rough`
  entries per body; tests prove the manifest selects the correct tier
  across all four profiles.
- **Wave 2 done when**: Enceladus, Ceres, Pluto, Charon, Phobos meet
  the same bar. Phobos ships the Viking-only variant by default; the
  HRSC-DEM-derived variant is gated behind a user decision on CC BY-SA
  3.0 IGO. DEM-gradient helper has its own test suite.
- **Wave 3 done when**: `PlanetModel.tsx` `GLBModel` + `OBJModel`
  consume `normal` + `roughness` channels from the manifest the same
  way sphere bodies do; Vesta renders with Dawn DTM-derived normals;
  the other three model bodies remain geometry-only but now have a path
  forward if data quality improves.
