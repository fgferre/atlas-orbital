# Tiled texture streaming — bring the slippy-map model to the globe

**Opened 2026-07-28**, out of the VRAM audit in
[`texture-inventory-2026-07-27.md`](./texture-inventory-2026-07-27.md).
Read [`../../AGENTS.md`](../../AGENTS.md) first.

## The ask, and why the current loader can never satisfy it

> "high-res textures should load as we approach, and only the parts being
> looked at, like Google Maps — it never blows memory, runs light in a browser,
> and detail grows as you get close"

The current loader cannot do this, and not because of a bug. It is
**whole-image tier swapping**: one monolithic equirectangular image per body per
channel, swapped wholesale between `boot`/`2k`/`4k`/`8k`. There is no tiling, no
partial residency, no mip streaming. The smallest thing it can load is the
entire globe at one resolution.

That is why cost is set by the _file_ and not by the _view_: Earth focused at
ultra is 5 x 8192x4096 = **853.3 MB** whether it fills a 4K viewport or covers
200 pixels. No eviction policy can fix that, because the bytes belong to
something on screen.

## What "Google Maps for a globe" actually is

A slippy map is a quadtree pyramid: level `z` holds `2^z` tiles across, each a
fixed pixel size, and the renderer loads only the tiles the viewport covers at
the level where one texel lands on about one screen pixel. For a sphere that is
Cesium's model, not literally Google's — the tiles wrap an equirectangular
surface instead of a Mercator plane:

```
level 0 = 2x1 tiles      -> 512x256   effective
level 3 = 16x8 tiles     -> 4096x2048
level 4 = 32x16 tiles    -> 8192x4096
level 6 = 128x64 tiles   -> 32768x16384   (far past anything we ship today)
```

**The property worth having:** zooming in raises the level but shrinks the
visible surface by the same factor. They cancel. Resident bytes approach a
constant set by the viewport, not by how close you get — so "more detail as you
approach" costs nothing extra, and there is no zoom level that blows up.

`src/lib/texturePyramid.ts` implements this sizing model and
`texturePyramid.test.ts` pins the behaviour. Both are pure and GPU-free on
purpose: the memory argument has to survive arithmetic before anyone rewrites a
renderer, and CI has no GPU to check it any other way.

Measured by those tests, on a 4K viewport:

| View                                  |               Today |                  Tiled |
| ------------------------------------- | ------------------: | ---------------------: |
| Earth filling the viewport (r=2048px) |            853.3 MB |           **104.5 MB** |
| Approach r=256 -> 4096px (L1 -> L5)   | grows with the tier |    flat, peak < 120 MB |
| A body 24 px wide                     |        10.7 MB (2k) |            < 2 MB (L0) |
| Whole-globe base, levels 0-2          |                 n/a | 14 MB, always resident |

## Design decisions already made, with the reason

**1. Tile the albedo map. Cap the rest.**
Tiling all five of Earth's channels costs ~285 MB and multiplies the streaming
bookkeeping by five for no visible gain — night lights, clouds, normal and
roughness are low-frequency next to surface albedo. They stay as one 2k texture
each. This is also what keeps the existing material stack (eclipse shader, ring
shadow, cloud terminator, `NoColorSpace` PBR sampling) reading a single sampler
per channel instead of an atlas.

**2. One draw call, via an atlas + indirection — not one mesh per tile.**
The naive quadtree gives every patch its own mesh and material, which multiplies
draw calls and forks the shader stack that `usePlanetMaterials.ts` has spent
several waves getting right. Instead: keep one sphere, bind one physical atlas
texture plus a small indirection table, and have the fragment shader translate
UV to atlas slot. The material chain stays almost untouched. This is the single
most important choice here — it is what makes the change tractable.

**3. Keep levels 0-2 resident for the whole globe.**
42 tiles, ~14 MB. Without it a tile miss is a hole in the planet; with it a miss
is merely blurry, which is exactly what a slippy map does.

**4. Only bodies you can actually approach get a pyramid.**
Earth, Moon, Mars, Mercury, Venus, Jupiter, Saturn, and the large moons. A TNO
that is never more than a few pixels does not need one, and generating pyramids
for all 82 textures would bloat the deploy artifact for nothing.

## Honest costs and risks

- **Asset pipeline.** Pyramids must be generated offline (`sharp` can do it) and
  the tile count explodes: Earth to L5 is 2730 tiles for one channel. Thousands
  of small files deploy badly to GitHub Pages. The answer is to pack tiles into
  a handful of binary blobs served with HTTP range requests — the PMTiles /
  cloud-optimised-GeoTIFF pattern — not to commit 2730 PNGs.
- **Shader work is the real risk.** Atlas indirection in the fragment shader has
  to coexist with eclipse, ring shadow and the cloud terminator, and get mip
  selection and tile-edge bleeding right. Budget more time here than for the
  streaming logic.
- **Cracks and seams.** Adjacent tiles at different levels need edge padding
  (1-2 texel gutters) or the seams show. Standard, but it must be in the tiler
  from day one — retrofitting gutters means regenerating everything.
- **No GPU in CI.** Nothing in this repo's automated gates can catch a visual
  regression here; Playwright runs headless on SwiftShader. Every stage needs a
  human render check.

## Sequencing — and what should NOT wait for this

Tiling is the right destination. It is **not** the fastest route out of the
current crash, and pretending otherwise would delay the fix. Do these first,
they are hours not weeks, and the tiled path needs them anyway:

1. **Admission control in `deferredTextureCache.ts`.** The budget is an eviction
   target checked after decode, and entries with `refCount > 0` can never be
   evicted — so it cannot bound live VRAM at all. Nothing consults the budget
   before starting a fetch. A pyramid still needs this.
2. **Resize the pathological files.** `4k_enceladus.jpg` is 15960x7980 —
   647.8 MB from one file whose name says 4k. Three textures exceed 8192 px on
   the long side, above the `MAX_TEXTURE_SIZE` of many GPUs, so they fail upload
   rather than merely cost memory.
3. **Give tier detection a GPU signal.** It currently uses none, so every
   desktop lands on ultra or high regardless of hardware — which is precisely
   why desktop breaks and mobile does not.

Then the tiled work, in stages that each stand alone:

- **S1** Offline tiler script producing a gutter-padded pyramid + a manifest,
  for one body (Earth), packed into range-servable blobs.
- **S2** Atlas + indirection sampling on one body behind a flag, whole-globe
  base levels only, no streaming yet. Human render check.
- **S3** View-dependent tile selection driving the atlas, using
  `selectTileLevel` / `estimateResidentTiles` from `texturePyramid.ts`.
- **S4** Roll out to the approachable bodies; retire their monolithic 4k/8k
  files; measure the deploy artifact before and after.

## Gates

```
npm run test:run
npm run lint
npm run build
npm run test:e2e     # cannot catch VRAM here — human render check required
```

---

## What the reference engines actually do — 2026-07-28

Checked before committing to the design above, because "like Google Maps" is a
shape, not a spec.

### The lesson hiding in the Google observation

Google Earth's globe streams a quadtree of **imagery** tiles (plus terrain) with
screen-space-error LOD. What it does _not_ stream is the day/night terminator,
the clouds or the lighting — those are a separate low-resolution layer plus
analytic per-pixel shading. That is the whole reason its memory stays flat while
the imagery is effectively unlimited: **only one channel is ever streamed.**

Which independently confirms the "tile the map, cap the rest" call above, and
also explains the other half of the observation — no atmosphere effects. Google
does not do atmospheric scattering; Atlas does, via
`shaders/atmosphereShader.ts`. So Atlas is already ahead of the reference on
that axis and should not copy it wholesale.

### The engines worth stealing from

| Engine                                                                                       | Scheme                                                                                                                      | Why it matters here                                                                                                                  |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [CesiumJS](https://cesium.com/learn/cesiumjs/ref-doc/GeographicTilingScheme.html)            | equirect quadtree, level 0 = 2x1, LOD by screen-space error in `QuadtreePrimitive`, skirts for cracks                       | Closest analogue: WebGL, browser, open source, production-proven. Validates the level scheme in `texturePyramid.ts` — same 2x1 root. |
| [Gaia Sky SVT](https://gaia.ari.uni-heidelberg.de/gaiasky/docs/master/Virtual-textures.html) | sparse virtual texture, quadtree streamed into a buffer texture, needed tiles found by a **tile-detection fragment shader** | This repo's own north star already solved it. Applies VT to diffuse, specular, normal _and_ height.                                  |
| Celestia                                                                                     | its own tiled virtual-texture format, equirect                                                                              | Precedent that equirect tiling is enough for planetary maps.                                                                         |
| Space Engine, Outerra                                                                        | cube-sphere quadtree                                                                                                        | The alternative projection — see below.                                                                                              |

### Two corrections to the design above

**1. Tile detection should be a feedback pass, not only an analytic estimate.**
Gaia Sky renders a small pass whose fragment shader writes which tile and level
each pixel wants, reads it back, and streams exactly that set. It is exact:
no over-fetch, and it handles grazing angles, partial occlusion and the horizon
for free. `estimateResidentTiles` assumes the whole visible disc wants uniform
detail, so at oblique angles it over-fetches.

They are complementary, not competing, and both should exist:

- **feedback pass** decides what to actually stream at runtime;
- **`texturePyramid.ts`** stays the budget planner — it is what lets the memory
  bound be proven in CI on a box with no GPU, which no feedback pass can do.

**2. Equirect stands, but the poles need merging.**
Equirect tiling has a real defect: the top tile row covers almost no surface
while carrying a full tile of texels, so texel density explodes toward the
poles. Cube-sphere (Space Engine, Outerra) has no singularity and uniform
density — but every source map in this repo is equirect, and a cube-sphere needs
offline reprojection _and_ a different mesh than the `sphereGeometry(1, 64, 64)`
in `Planet.tsx`.

Cesium and Gaia Sky both ship equirect quadtrees in production, so the pragmatic
call stands. Mitigate with **polar row merging** — halve the column count per
row above roughly 60 degrees latitude, the standard fix. Revisit cube-sphere
only if close polar approaches become a product goal.

### One place the reference disagrees with me

Gaia Sky tiles the **normal** and **height** channels too, not just diffuse. The
"cap the rest" decision is defensible for clouds, night lights and roughness —
genuinely low-frequency — but Earth's normal map is the arguable case, since
that is the channel carrying surface relief you would actually want at close
range. Treat it as open: revisit if surface relief ever becomes a goal, and note
that Gaia Sky is a desktop app with a VRAM budget Atlas does not have.

### What does not transfer

- **Hosting.** Cesium and Google stream from tile servers behind a CDN. Atlas
  ships static files to GitHub Pages, which is why the packing decision above
  (blobs + HTTP range requests) is load-bearing rather than an optimisation.
- **Working set.** Google has one body at extreme zoom. Atlas has ~44 bodies,
  almost all a few pixels wide, with one focused. That is an _advantage_: the
  high-LOD working set is naturally one body deep, so the atlas can be small.

---

## Measured baseline — the numbers a new session must not re-derive

All measured 2026-07-28 with `sharp` against the real files and the real
`resolveTextureRequest`, then put through an adversarial refutation pass that
corrected several of them. Re-deriving these costs hours; they are exact.

### Where the VRAM actually goes at ultra on a 4K desktop

| Consumer                                              |       MiB | Note                                                                                                                         |
| ----------------------------------------------------- | --------: | ---------------------------------------------------------------------------------------------------------------------------- |
| Composer MSAA (2 full-res HalfFloat RTs @ 8x)         |     1,645 | **fixed 2026-07-28** — was the pmndrs default, never a decision. Now tier-driven: ultra 4, high 2, else 0. Scales with DPR². |
| Context `antialias: true` under an active composer    |  ~265-300 | **fixed 2026-07-28** — the composer resolves through a fullscreen quad, so this could not change a pixel.                    |
| Shadow map 4096² (RGBA8 + unsampled DEPTH24)          |       128 | **open.** Same size at ultra AND high. 2048 would be 32 MiB.                                                                 |
| drei `<Environment>` (incl. retained PMREM ping-pong) |     15.25 | `frames={1}`, so the ping-pong is retained for nothing.                                                                      |
| ProceduralSun3D (ultra only)                          |     13.61 | perlin cubemap + ray/flare geometry.                                                                                         |
| HYG starfield buffer                                  |      5.01 | 109,400 stars. Tier scaling works; not a problem.                                                                            |
| **Non-texture floor before the fix**                  | **1,808** | `high` paid nearly the same, ~1,790.                                                                                         |

Bloom adds 105.47 MiB the instant the slider leaves 0 — not in the boot floor
because every preset ships `bloomIntensity: 0`.

### Textures: filenames lie, in both directions

The cache estimates bytes from the filename token (`inferTextureEdge`) and
assumes a **square** texture. Every planetary map is 2:1. Over all 82 files it
accounts 8,114 MB for a true 5,121 MB, with per-file error from **-97% to
+1538%**.

| File                         | Name says | Really is  |    Real VRAM |
| ---------------------------- | --------- | ---------- | -----------: |
| `4k_enceladus.jpg`           | 4k        | 15960x7980 | **647.8 MB** |
| `8k_tethys.jpg`              | 8k        | 13467x6734 |     461.3 MB |
| `4k_iapetus.jpg`             | 4k        | 11741x5871 |     350.6 MB |
| `uranus_texture_map_8k_…jpg` | untiered  | 8000x4336  |     176.4 MB |
| `4k_oberon.png`              | 4k        | 8192x4096  |     170.7 MB |
| `jupiter_vgr1_2025.jpg`      | untiered  | 7200x3600  |     131.8 MB |

**Three exceed 8192 px on the long side** (15960, 13467, 11741) — above the
`MAX_TEXTURE_SIZE` of many GPUs, so they fail upload rather than merely cost
memory. On a 16384-max GPU Enceladus really does allocate 647.8 MB; on an
8192-max one three.js clamps it to 170.7 MB. The failure is hardware-dependent,
which is exactly why it reproduces on some desktops and not others.

**Per-body focus cost at ultra** (budget 512 MB): earth **853.3** (5 x 8192x4096
channels), enceladus **647.8**, tethys 461.3, iapetus 350.6. Two bodies exceed
the entire budget on their own, and while focused none of it is evictable.

**Overview total is identical across all four profiles** — 440.6 MB — because
`OVERVIEW_PREFERENCE_ORDER` in `textureVariants.ts` ignores the profile.
`constrained` allocates what `ultra` does, against a 32 MB budget. This is the
adaptive-reach pillar failing, and it is untouched.

### The three cheap fixes that come before tiling

1. **Admission control.** `deferredTextureCache.ts` has none: `pumpLoadQueue`
   gates only on `activeLoadCount < 4` and never reads `textureBudgetBytes`;
   `evictToBudget` counts only `status === "ready"`, so up to 4 concurrent
   decodes are invisible; and `selectEvictionVictims` skips `refCount > 0`, so
   the budget cannot bound live VRAM at all — it only controls how long
   _unreferenced_ textures linger. Verified empirically: 32 MiB budget,
   8 acquires, `activeLoadCount` 4, `readyBytes` 0.
   Also: `pinCount` is inert — every pin acquire also bumps `refCount`, so the
   four pin-conditional branches never change an outcome.
2. **Resize the pathological files** (table above).
3. **Give tier detection a GPU signal.** `qualityProfile.ts` uses none, so every
   desktop scores 3-4 → ultra/high and every phone scores -5..1 →
   constrained/balanced. Desktop is handed the largest assets by a score that
   cannot see the GPU. (DPR _is_ clamped — dprMax 2/1.75/1.5/1 — so that is not
   the cause.)

### What the gates cannot catch

Playwright runs headless Chromium with **no GPU flags**, so it renders on
SwiftShader — software GL backed by system RAM, with no VRAM ceiling to
exhaust. No e2e test in this repo can catch a VRAM blowup. Every stage of this
work needs a human render check on real hardware. The boot pixel gate is also
weaker than it looks: its 1% tolerance (9216 px) exceeds the entire bright
content of the baseline (8679 px above 64/255), and the only committed baseline
is `win32` while CI runs linux, so with `retries=2` it self-baselines green.
