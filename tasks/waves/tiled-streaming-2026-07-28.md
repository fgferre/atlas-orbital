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
