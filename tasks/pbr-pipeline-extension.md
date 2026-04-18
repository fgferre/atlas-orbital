# PBR Pipeline Extension — Bake Parameterization + Model-Body Scoping

**Purpose.** Describes how the single-body Earth bake
(`scripts/bake-earth-pbr.js`) generalises across the Wave 1 + Wave 2 +
Wave 3 bodies in [`pbr-shipping-priority.md`](pbr-shipping-priority.md).
No code in this document — it is the architectural plan that
per-body implementation sessions execute against.

## Reference pipeline — `scripts/bake-earth-pbr.js` walkthrough

| Line ref                            | Responsibility                                                                                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/bake-earth-pbr.js:45-54`   | `WAYBACK_URLS` table: origin TIFFs on `solarsystemscope.com` are 403-blocked for scripted UAs, so pinned Wayback snapshots serve as source.                                                                          |
| `scripts/bake-earth-pbr.js:56-96`   | `ensureCachedTiff()`: fetch, validate ≥ `MIN_TIFF_BYTES`, verify TIFF magic bytes (LE 49 49 2A 00 or BE 4D 4D 00 2A), persist to `.cache/`.                                                                          |
| `scripts/bake-earth-pbr.js:98-106`  | `bakeNormal()`: sharp → JPG q92 `chromaSubsampling:"4:4:4"` mozjpeg. Preserves chroma per channel because tangent-space X/Y/Z sit in R/G/B.                                                                          |
| `scripts/bake-earth-pbr.js:108-125` | `bakeRoughness()`: sharp → `.grayscale()` → `.negate({alpha:false})` → JPG q85 grayscale. Inversion flips SSS specular (water bright = shiny) into MeshStandardMaterial roughness semantics (0 = mirror, 1 = matte). |
| `scripts/bake-earth-pbr.js:135-156` | Job list: 2k + 8k for normal, 2k + 8k for roughness. No 4k, no boot.                                                                                                                                                 |

Shape of the generalised pipeline: **parameterise the jobs table, keep
the rest.** Cache, validation, sharp encoder calls, and Wayback fallback
logic stay put. Per-body data lives in a config.

## Per-body config proposal

A single `scripts/pbr-bake-recipes.ts` module (TypeScript for type
safety — the current bake is ESM JS but the project builds TS cleanly)
exporting an array of recipes. One body per entry.

### Recipe shape (authoritative keys)

```
interface PbrBakeRecipe {
  bodyId: string;                         // matches celestialBodies.ts
  attribution: string;                    // exact CreditsModal string
  rightsBasis: "usgs-pd-cite" | "nasa-pd" | "cc-by-4" | "cc-by-sa-3-igo";
  normal?: {
    source: { origin: string; wayback?: string; minBytes?: number };
    kind: "tiff-normal" | "dem-to-normal";  // pick-one
    demParams?: {
      // only when kind === "dem-to-normal"
      verticalScaleMeters: number;          // DEM LSB → meters
      smoothingRadiusPx: number;            // Sobel-pre-smoothing kernel
    };
    tiers: ("2k" | "4k" | "8k")[];         // which JPG tiers to emit
    jpegQuality: number;                    // default 92
  };
  roughness?: {
    source: { origin: string; wayback?: string };
    kind: "specular-invert" | "dem-slope-variance" | "procedural-scalar";
    invert: boolean;                        // SSS specular → roughness = invert:true
    tiers: ("2k" | "4k" | "8k")[];
    jpegQuality: number;                    // default 85
  };
  outputs: { dir: string; fileBase: string }; // e.g. fileBase = "mars"
  manifestEntries: {
    normalPath2k?: string;
    normalPath8k?: string;
    roughnessPath2k?: string;
    roughnessPath8k?: string;
  };
}
```

Three execution modes cover every Wave-1+2 body:

1. **SSS-style specular-invert** (Venus). Direct TIFF, invert, done —
   literally the Earth path with a different URL.
2. **DEM-to-normal + DEM-slope-roughness** (Moon, Mars, Mercury, Ceres,
   Enceladus, Pluto, Charon, Phobos). The DEM is the primary source;
   normal comes from a Sobel gradient on the DEM; roughness comes from
   local slope variance (window-based). Needs the derivation helper
   below.
3. **Mixed** — mosaic provides albedo context only; DEM drives both
   PBR channels (most Wave-2 bodies fall here in practice).

### Example recipes (shape only, not final URLs)

```
// Wave 1: Mars — MOLA-only to keep licence clean
{
  bodyId: "mars",
  attribution: "NASA/JPL-Caltech/MSSS — Viking; MGS MOLA; processed by USGS Astrogeology",
  rightsBasis: "usgs-pd-cite",
  normal: {
    source: { origin: "<astrogeology URL for mars_mgs_mola_dem_463m>" },
    kind: "dem-to-normal",
    demParams: { verticalScaleMeters: 1, smoothingRadiusPx: 2 },
    tiers: ["2k", "8k"],
    jpegQuality: 92,
  },
  roughness: {
    source: { origin: "<same DEM URL — reused>" },
    kind: "dem-slope-variance",
    invert: false,
    tiers: ["2k", "8k"],
    jpegQuality: 85,
  },
  outputs: { dir: "public/textures", fileBase: "mars" },
  manifestEntries: {
    normalPath2k: "2k_mars_normal_map.jpg",
    normalPath8k: "8k_mars_normal_map.jpg",
    roughnessPath2k: "2k_mars_roughness_map.jpg",
    roughnessPath8k: "8k_mars_roughness_map.jpg",
  },
}
```

### Why TS, not YAML

Compile-time validation of tier enums, of rights-basis discriminants,
and of bodyId matches keeps the recipe list honest against
`celestialBodies.ts`. YAML would drift. The file is also small — ten
bodies × ~30 lines each ≈ 300 lines total — so YAML's concision gain is
minor.

## Roughness-from-topography derivation path

**The new code the pipeline needs beyond a URL-swap:** a single
`scripts/lib/dem-derive.ts` module that turns a DEM TIFF (grayscale,
16-bit usually) into:

1. **Tangent-space normal map.** Algorithm: Sobel gradient of DEM,
   scaled by `verticalScaleMeters` / `pixelSizeMeters(latitude)`, then
   reconstruct normal vector as
   `normalize(vec3(-dzdx, -dzdy, 1.0))`, pack into RGB with
   `(n.xyz * 0.5 + 0.5) * 255`. Optional Gaussian pre-smoothing to
   suppress DEM quantisation noise (the `smoothingRadiusPx` recipe
   param).
2. **Slope-variance roughness map.** Algorithm: compute slope magnitude
   = `sqrt(dzdx² + dzdy²)`, then apply a sliding-window variance over
   a fixed kernel (default 5×5), normalise to `[0, 1]`, write as
   grayscale. High-variance regions (crater rims, rift zones) → rougher
   material response.

Both are doable in sharp: `sharp` exposes raw pixel access via
`raw().toBuffer({ resolveWithObject: true })`, and the math is a small
loop. No new runtime deps. Reference implementations worth skimming
before writing:

- **USGS ISIS `slope`** application (authoritative for slope-from-DEM
  semantics; ships with the ISIS toolkit; not suitable to bundle but
  its maths is the target).
- **`three-bmfont-text`** / **`normalmap-to-displacement`** on npm
  (short TS libraries that show the Sobel math cleanly; both MIT; read
  for the algorithm, don't import). The derivation is simple enough
  that rolling it in-tree is correct, and keeps the scripts folder
  dependency-free beyond `sharp`.

Cosine-latitude correction of pixel size is **required** for bodies in
equirectangular projection (every body in this plan). A 1° slice at the
equator covers ~111 km; at ±60° it covers ~55 km. Normal-map strength
must scale by `1 / cos(lat)` or poles get smeared steep ridges.

## Runtime wiring — what changes vs. Earth

Earth's runtime contract is:

1. `celestialBodies.ts:190-196` sets `textures.normal` + `textures.roughness` to the canonical 8k paths.
2. `textureVariantManifest.ts:12-26` registers the 2k variants.
3. `usePlanetAssets.ts:99-121` resolves both channels via
   `resolveTextureRequest`.
4. `usePlanetMaterials.ts:217-223` applies them to
   `MeshStandardMaterial` when the albedo is loaded.

**Per-body PBR ship requires three code edits, nothing else:**

- **`celestialBodies.ts`** — add `normal` + `roughness` to `body.textures`
  pointing at the highest tier (matches the Earth pattern; the resolver
  infers canonical tier from filename prefix).
- **`textureVariantManifest.ts`** — add a per-body entry listing 2k and
  8k variants on both channels. Without this, the `high` profile will
  fall back to the 8k canonical (wasteful) on a 4k-preferring client.
  _Gap the Earth manifest currently has: `normal.variants` only lists
  2k (`textureVariantManifest.ts:19`), so even Earth at `high` profile
  jumps to 8k. Fix this as part of the Wave-1 rollout rather than
  carrying the gap forward._
- **`assetManifest.ts`** — add `VisualAssetManifestEntry` rows for each
  baked file so the credits surface and the asset-study matrix can
  enumerate them.

`usePlanetAssets.ts` and `usePlanetMaterials.ts` need **no changes** to
ship Waves 1 + 2. They already loop across every body for
`normal` + `roughness` channels.

## Model-body track (Wave 3) — scoping only

**Problem.** `PlanetModel.tsx:129-141` (OBJModel) and `:50-64` (GLBModel)
assemble `MeshStandardMaterial` with `map`, `roughness`, `metalness`.
Neither reads `textures.normal` or `textures.roughness`. A Vesta PBR
bake would sit on disk and never reach the GPU.

**What needs to happen (scoping, not designing):**

1. **`mapRequest` pattern must extend to `normal` + `roughness`
   channels inside `PlanetModel`.** Today `PlanetModel.tsx:177-187`
   resolves only `map`. The same `resolveTextureRequest` calls that
   `usePlanetAssets` makes need to live here too, with the same
   `shouldLoadSecondary` gating (PBR channels only matter at close
   range).
2. **Textures must be loaded with `THREE.NoColorSpace`** — matches the
   sphere-body path (`usePlanetAssets.ts:145`, `:152`). sRGB decoding
   would corrupt tangent-space normals and mis-scale roughness.
3. **Material assembly in `OBJModel`** — add `normalMap` + `roughnessMap`
   to the `MeshStandardMaterialParameters` at
   `PlanetModel.tsx:129-141`.
4. **Material assembly in `GLBModel`** — harder. GLBs ship their own
   materials inside the scene graph; `cloneGlbSceneForRuntime`
   (`assetProcessing.ts`) currently only tweaks `roughness` +
   `metalness` scalars. The model-body PBR session must decide:
   a) **override the GLB material** with a fresh
   `MeshStandardMaterial` built from the recipe — loses any artist
   material authored on the GLB, but gives us control;
   b) **patch the GLB material** in place with `normalMap` +
   `roughnessMap` — preserves the GLB but requires care around
   UV channel assumptions (GLBs may use UV1; the PBR bake is UV0).
   Recommendation: option (a) for Vesta because the Dawn texture is
   richer than anything the GLB ships internally — but flag this to
   the user before shipping.
5. **UV channel check.** PBR bakes are equirectangular (UV0). The Atlas
   GLBs are known to use UV0 for their embedded albedo
   (`vesta_dawn_embedded.png` is sampled that way today). Verify before
   assuming.
6. **Non-spherical geometry + equirect normals.** Model bodies are
   irregular. A tangent-space normal map baked in equirectangular
   projection against a sphere-equivalent DEM will mis-read on limb
   meshes. Vesta is close enough to spherical that this is a low-risk
   visual artefact, but the scoping session must decide the acceptance
   bar.

**Effort estimate:** 1 design session + 1 Vesta implementation session
= 2 sessions, ~200 LOC across `PlanetModel.tsx`, `assetProcessing.ts`,
and their tests. No changes to `usePlanetAssets` / `usePlanetMaterials`.

## CI integration

**Bakes are not part of CI.** Same policy as the Earth bake — too slow,
large downloads, and the Wayback dependency. Outputs ship as committed
tracked assets under `public/textures/`.

**Versioning strategy:**

- Git-LFS is a hard sell at 35 MB incremental across Waves 1+2 because
  the project today carries the existing albedo maps (often 5–15 MB
  each) **without** LFS. New normal/roughness assets are smaller than
  the existing albedo maps they pair with, so LFS is not required.
- Commit the bake outputs directly. Tag the commit that ships Wave 1
  `pbr-wave-1` so a future rebake (e.g. if SSS revises Earth data)
  can diff cleanly.
- Rebake invocation stays manual: `node scripts/bake-earth-pbr.js`
  today, `node scripts/bake-pbr.js <bodyId?>` after parameterisation.
  Default (no arg) rebakes every recipe that's missing output.

**Never in CI:** the fetch step. It burns Wayback budget and introduces
flaky network dependencies into the test lane. Bakes run when a human
ships new assets.

## Aggregate bundle projection (Waves 1+2 fully shipped)

Earth precedent: normal ≈ 2.56 MB + roughness ≈ 0.85 MB = 3.41 MB at
ultra; 74 KB + 133 KB = 207 KB at 2k. Scaling to 9 sphere-PBR bodies
(Wave 1 = 4, Wave 2 = 5):

| Profile     | Incremental per body (n+r)                       | Across 9 bodies               |
| ----------- | ------------------------------------------------ | ----------------------------- |
| constrained | 0 (boot tier only)                               | **0 MB**                      |
| balanced    | ~200 KB (2k tier)                                | **~1.8 MB**                   |
| high        | ~1.1 MB (4k tier, projected — no 4k baked today) | **~10 MB** _if 4k tier added_ |
| ultra       | ~3.4 MB (8k tier)                                | **~31 MB**                    |

**Note on 4k.** The Earth bake emits 2k + 8k only. If any profile
routinely serves 4k today it falls back to 8k canonical (per
`textureVariants.ts:145`). The "high" profile's 4k preference is
effectively academic for PBR channels unless a future bake adds 4k
outputs — which would roughly double the commit footprint per body for
little perceptual gain over 2k. **Recommendation: do not add 4k PBR
bakes in Waves 1–3.** Revisit after shipping if `high`-profile users
report poor PBR quality.

## Future optimisations (scoped, not prescribed)

- **WebP PBR variants.** `src/lib/textureVariants.ts:54-58` already
  ships a `WEBP_AVAILABLE_BASENAMES` optimisation for three albedo
  assets. Extending it to normal + roughness would cut ~40% of
  bundle-size at ultra on WebP-capable clients. Scope: one session to
  extend `scripts/optimize-textures.js` + manifest maintenance. Out
  of scope for Waves 1–3 (lessons L4 — don't claim a channel is WebP
  until the bake actually emits WebP).
- **AVIF PBR variants.** Same idea, further size reduction (~60%), but
  AVIF encoding at 8k is multi-minute per asset. Defer behind WebP.
- **Compressed tangent-space (RG-only Y-reconstructed normals).** Earth
  pipeline ships `XYZ` normals at q92 4:4:4 because RGB chroma
  preserves tangent X/Y/Z. A more aggressive bake could strip Z and
  reconstruct it in-shader (`sqrt(1 - x² - y²)`), dropping to a
  two-channel PNG or a `.rg` KTX2. Saves ~30% size. Requires a shader
  patch in `usePlanetMaterials.ts` — not a pure bake change. Defer.

These three optimisations are candidates for a future "ondas 10"
bundle-size pass, not for the PBR rollout itself.
