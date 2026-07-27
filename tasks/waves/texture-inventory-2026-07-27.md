# Texture inventory — why do 28 assets exist that nothing can load?

**Parallel line, opened 2026-07-27.** Runs independently of the
fidelity-honesty wave. Read [`../../AGENTS.md`](../../AGENTS.md) first; this
file is the whole brief.

---

## The question, and why it is not "delete them"

`public/textures/` holds 108 files, 298.6 MB. The progressive loader can
request 76 of them. The remaining ~28, about 27.6 MB, cannot be reached by any
code path.

The tempting task is a deletion sweep. **That is the wrong task and it would
destroy the only category that matters.** An unreachable asset is one of three
things:

1. **Duplicate** — the same imagery already served under another filename.
   Delete.
2. **Superseded** — an older or worse asset that a better one replaced. Delete,
   and record what replaced it so nobody re-downloads it.
3. **A wiring bug** — the asset is the _good_ one, or the intended one, and the
   manifest or the body record never picked it up. Here the app is silently
   serving something worse, or nothing, while the right file sits on disk.
   **Fix the wiring. Do not delete.**

Category 3 is the reason this is an investigation and not a chore. Nothing in
the current suite would notice it: `textureReachability.test.ts` asserts that
everything requestable exists, which is the _other_ direction.

**Rule for this line: no file is deleted before it is classified, in writing,
into one of those three.** A one-line verdict per file is the deliverable, and
the deletions are what falls out of it.

---

## Where the evidence already points

Not conclusions — leads, each needing verification.

**Provenance, which makes this an honesty question and not a housekeeping one.**
Five orphans are DeviantArt scrapes carrying the artist's slug in the filename:
`deimos_texture__2k__by_ducn1567_dgs72ly-pre (1).jpg`, and the same pattern for
`io`, `mimas`, `phobos`, `triton`. Sitting beside them on disk are NASA
mosaics with instrument names — `europa_voyager_galileo_global_mosaic_500m.jpg`,
`titan_cassini_iss_global_mosaic_4km.jpg`, `tethys jpegPIA14931.jpg` (a JPL PIA
id). `4k_eris_fictional.jpg` says "fictional" in its own name.

If the scrapes were retired in favour of measured imagery, that was an
**honesty upgrade** under AGENTS §Product-constitution 2, and these are its
leftovers — worth confirming and recording, because the reasoning is more
valuable than the megabytes. If instead a scrape is _still being served_
somewhere while a NASA mosaic sits unused, that is a fidelity defect and the
highest-value find in this whole line. Check both directions.

**Same-body pairs, i.e. probable duplicates or supersessions.** `rhea_a.jpg`
against `2k_rhea.jpg`; `ganymede.jpg` against `4k_ganymede.jpg`;
`tethys jpegPIA14931.jpg` (6.9 MB, note the **space** in the filename) against
`2k_tethys.jpg`/`8k_tethys.jpg`; `titan_map__2010__by_mapperpro_dg0iw6y.png`
against `2k_titan.jpg` and the Cassini mosaic. Establish which is actually
served and whether the served one is the better one.

**Likely category 3 — check these first.** `2k_saturn_ring_alpha.png` is
orphaned while `8k_saturn_ring_alpha.png` and `boot_saturn_ring_alpha.png` are
reachable. A boot+2k+8k trio is deliberate authoring, so a missing middle tier
reads as a manifest gap, not a leftover: constrained and overview users would
be served boot or 8k where a 2k exists. `2k_venus_atmosphere.jpg` and
`4k_venus_atmosphere.jpg` are both orphaned although `atmosphere` is a declared
`TextureChannel` — check whether Venus's record ever wires it. `8k_jupiter.jpg`
(3.0 MB) is orphaned; confirm what Jupiter's `map` actually resolves to at
ultra/focused, because if it tops out below 8k that is a body that can never
reach full resolution.

**The bare legacy set** — `earth.jpg`, `jupiter.jpg`, `mars.jpg`, `mercury.jpg`,
`moon.jpg`, `neptune.jpg`, `saturn.jpg`, `sun.jpg`, `uranus.jpg`, `venus.jpg`,
plus `skybox.jpg` and `snowflake1.png` — predates the tier system. Almost
certainly category 2, but confirm rather than assume; `earth.jpg` has a JPEG
header a minimal SOF parser could not read, so open it before deciding what it
even is.

**Starfield.** `2k_stars_milky_way.jpg`, `8k_stars.jpg`,
`8k_stars_milky_way.jpg` never pass through `resolveTextureRequest` — the
starfield is its own path (`Starfield.tsx`, the HYG catalog). Decide whether a
Milky Way plate is meant to be wired there at all, or whether the HYG field
superseded it.

---

## Method, and four traps that already produced wrong answers

Every one of these produced a confidently wrong claim in the session that
opened this file. Do not re-derive them.

1. **`preferWebPAsset` rewrites `4k_oberon`, `8k_mercury` and `8k_moon` to
   `.webp` in a real browser**, and `detectWebPSupport()` returns false outside
   one. Those three siblings look orphaned under any Node-side enumeration and
   are not. That is 25 MB of live assets.
2. **Substring matching lies.** `grep -F "mercury.jpg"` also matches
   `8k_mercury.jpg`. Use `grep -rE "(^|[^-_A-Za-z0-9])<base>\.<ext>"`.
3. **`scripts/download-textures.js` names assets the app never renders.** A
   repo-wide grep finds those names and reads them as references; they are
   re-download instructions. Anything deleted must also leave that script, or
   the next run restores it.
4. **Hosted is not downloaded.** These files cost repo size, deploy artifact
   size and GitHub Pages quota (298.6 MB against a ~1 GB recommended site
   ceiling) — **not** user bandwidth. A browser fetches only what is requested.
   Do not justify this work with a bandwidth claim; the honest justifications
   are the category-3 bugs, the provenance question, and the deploy footprint.

The enumeration itself is already written: `src/lib/textureReachability.test.ts`
builds the requestable set from the cross product of body × channel × profile ×
salience, collecting `availablePaths` rather than just `selectedPath` (a
progressive upgrade walks the others). Reuse it; do not rebuild it.

---

## Deliverable

1. A verdict table — one row per orphan: filename, size, category (1/2/3), the
   evidence, and the action.
2. Category-3 fixes applied, each with the check that proves the asset now
   loads at the tier and profile that was missing it.
3. Categories 1 and 2 deleted, with `scripts/download-textures.js` updated in
   the same commit so nothing is re-fetched, and a line saying what supersedes
   what.
4. If any body is found serving a scraped or fictional asset while measured
   imagery exists on disk, that is a **fidelity defect** — fix it and say so
   plainly in the commit; do not fold it into a cleanup message.
5. Extend `textureReachability.test.ts` only if a category-3 fix reveals an
   invariant worth pinning. Do **not** add an orphan allowlist — it would rot
   into a stale list and the four traps above make it unmaintainable.

## Gates

```
npm run test:run
npm run lint
npm run build
npm run test:e2e
```

`test:e2e` is not optional here: the boot pixel gate loads
`boot_earth_daymap.jpg`, and any change to what a body resolves to at boot
moves that baseline. Re-bless it only after a human confirms a correct,
populated render, per standing law 5 in
[`fidelity-honesty-2026-07-26.md`](./fidelity-honesty-2026-07-26.md).

---

# Findings — closed 2026-07-27

Enumeration reused `src/lib/textureReachability.test.ts` verbatim, as
instructed. 109 files on disk, 76 requestable, **33 orphans**.

## A fifth trap, and the finding that came out of it

The brief lists four traps. There is a fifth, and it cuts both ways.

**`availablePaths` is not what the loader fetches.** `usePlanetAssets.ts`
requests `selectedPath` and nothing else — `canonicalPath` and the other
`availablePaths` entries are never turned into a URL. The enumeration counts
76 files as requestable; only **72** can actually be selected. The four in the
gap are not orphans by the brief's definition and are not reachable either:

| File                                                                       | Body    | Why it never loaded |
| -------------------------------------------------------------------------- | ------- | ------------------- |
| `jupiter_vgr1_2025.jpg` (7.6 MB, 7200×3600)                                | jupiter | untiered basename   |
| `uranus_texture_map_8k_by_floridaemojicat_dj4s9vd.jpg` (3.0 MB, 8000×4336) | uranus  | untiered basename   |
| `titan_cassini_iss_global_mosaic_4km.jpg` (1.6 MB, 4040×2020)              | titan   | untiered basename   |
| `europa_voyager_galileo_global_mosaic_500m.jpg` (1.9 MB, 4096×2048)        | europa  | untiered basename   |

`inferCanonicalTier` reads the tier off the **basename**. A name with no
`boot_`/`2k_`/`4k_`/`8k_` prefix returns `null`, so the canonical lands only
under the `canonical` key — and `canonical` appears in no preference order.
When the body also had a manifest `2k` variant, `pickVariant` matched that and
returned before the canonical was considered. **All four bodies were serving a
lesser file than the one their own record declared, at every profile and every
zoom.** Jupiter's declared 7200×3600 map was shadowed by a 2048×1024 one on
ultra, on focus.

This is why `assetStudyMatrix.ts` — which has a field literally called
`runtimeAssetToday` — was wrong on all four rows, and why
`assetManifest.test.ts` asserted "Titan and Europa official mosaics **as active
runtime maps**" about maps that had never rendered.

The other half of the trap: `AssetStudyApp.tsx` loads textures by manifest id
(`getVisualAssetById` → `toPublicAssetUrl`), a route the ladder enumeration
cannot see. `4k_europa_gemini.png`, `titan_map__2010__by_mapperpro_dg0iw6y.png`
and `jupiter_nasa_io_b_3d_resource.jpg` are reachable that way. **Three of the
33 "orphans" are not orphans.**

## The fidelity defect: Io

`2k_io.jpg` is **byte-identical** (md5 `63aff15b…`) to
`io_texture__2k__by_ducn1567_dgs72iv-pre (1).jpg`. The scrape was never
retired — it was renamed into the tier namespace and has been Io's runtime map
ever since, with no `VISUAL_ASSET_MANIFEST` entry and no `visualProvenance`.
Same story for `2k_phobos.jpg` and `2k_deimos.jpg`.

Meanwhile `jupiter_nasa_io_b_3d_resource.jpg` — 1440×720, NASA Science 3D
Resources, NASA media guidelines — sat unused, filed under **`bodyId:
"jupiter"`**. It is an Io map; NASA publishes it on a Jupiter page. So the
Jupiter study row was comparing a Jupiter map against an Io map, and its
verdict ("the candidate is still much softer than the current runtime map")
measured nothing.

Fixed: Io renders the NASA map, the entry is re-filed as `io-map-active`, and
the scrape is deleted. Higher resolution (1440×720 vs 1264×632), documented
licence, and rendered on a sphere it holds more discrete volcanic features —
the scrape's extra local contrast is a saturation/sharpening pass over the same
USGS data, i.e. invented vividness.

## Europa and Titan: the promotion that never happened, and must not happen yet

Both mosaics were recorded on 2026-04-06 as promoted to active. Neither ever
rendered. Rendering each on a sphere (orthographic resample of the equirect —
the same sampling a UV sphere does) shows why they cannot simply be switched on:

- **Europa** — single-channel, and the bottom **68 rows (3.3%)** are solid
  black no-data. On a sphere that is a black hole over the south polar cap.
- **Titan** — single-channel with plainly visible mosaic tile seams, and it
  images the surface _through_ the methane window. Titan seen from space is an
  orange haze ball, which is what the current map shows.

So the honest state is not "wire them in". It is: `textures.map` names what
actually renders, the mosaics become `*-mosaic-reference` (status `candidate`)
with the measured blocker recorded, and both bodies gain a user-facing
`interpretive` `visualProvenance`. No pixel changes; three records stop lying.
Titan's 1264×632 is not a real cap (no surface detail to resolve). **Europa's
is** — it has resolvable lineae — and that is now written down as the reason
to finish the mosaic work.

## Verdict table

Categories: **1** duplicate · **2** superseded · **3** wiring bug ·
**—** not an orphan. Sizes are on-disk bytes.

| File                                                                                                                       |                   Size | Cat | Evidence                                                                                                                                                                                                                                                                            | Action                                                    |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------: | :-: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `2k_saturn_ring_alpha.png`                                                                                                 |                12.1 KB |  3  | Middle rung of a boot/2k/8k trio (1024×62, 2048×125, 8192×500 of the same plate, mean\|Δ\| 2.8/255). Overview served **boot** at every profile.                                                                                                                                     | Wired as `saturn.ring` 2k                                 |
| `8k_jupiter.jpg`                                                                                                           |                 3.0 MB |  3  | 4096×2048 despite the name; same imagery as the served `2k_jupiter.jpg` (mean\|Δ\| 0.50/255).                                                                                                                                                                                       | Wired as `jupiter.map` 4k                                 |
| `8k_saturn.jpg`                                                                                                            |                 1.1 MB |  3  | 4096×2048; same imagery as canonical `2k_saturn.jpg` (0.35/255). Saturn could never exceed 2048×1024. Not in the brief.                                                                                                                                                             | Wired as `saturn.map` 4k                                  |
| `jupiter_vgr1_2025.jpg`                                                                                                    |                 7.6 MB |  3  | Declared canonical, shadowed by the untiered-basename bug.                                                                                                                                                                                                                          | Wired as `jupiter.map` 8k                                 |
| `uranus_texture_map_8k_…jpg`                                                                                               |                 3.0 MB |  3  | Declared canonical, same bug. `2k_uranus.jpg` was marked `rejected` while being the only Uranus map that rendered.                                                                                                                                                                  | Wired as `uranus.map` 8k; `2k_uranus` → `fallback`        |
| `jupiter_nasa_io_b_3d_resource.jpg`                                                                                        |                 648 KB |  3  | An **Io** map filed under `bodyId: "jupiter"`. 1440×720, NASA licence.                                                                                                                                                                                                              | Promoted to Io's `textures.map`; re-filed `io-map-active` |
| `2k_venus_atmosphere.jpg`                                                                                                  |                 230 KB |  3  | Same imagery as `4k_venus_atmosphere.jpg` (0.45/255).                                                                                                                                                                                                                               | **Kept** — see below                                      |
| `titan_cassini_iss_global_mosaic_4km.jpg`                                                                                  |                 1.6 MB |  3  | Declared active, never rendered; monochrome + visible seams.                                                                                                                                                                                                                        | **Kept** as `titan-mosaic-reference`                      |
| `europa_voyager_galileo_global_mosaic_500m.jpg`                                                                            |                 1.9 MB |  3  | Declared active, never rendered; monochrome + 68 px black polar gore.                                                                                                                                                                                                               | **Kept** as `europa-mosaic-reference`                     |
| `4k_europa_gemini.png`                                                                                                     |                 5.9 MB |  —  | Reachable via `AssetStudyApp` (`europa-map-fallback`). Only Europa asset above 1264×632.                                                                                                                                                                                            | Kept; note corrected                                      |
| `titan_map__2010__by_mapperpro…png`                                                                                        |                 7.7 MB |  —  | Reachable via `AssetStudyApp` (`titan-map-fallback`).                                                                                                                                                                                                                               | Kept; note corrected                                      |
| `io_texture__2k__by_ducn1567…jpg`                                                                                          |                 123 KB |  1  | md5-identical to `2k_io.jpg`.                                                                                                                                                                                                                                                       | Deleted                                                   |
| `deimos_texture__2k__by_ducn1567…jpg`                                                                                      |                61.5 KB |  1  | md5-identical to `2k_deimos.jpg`.                                                                                                                                                                                                                                                   | Deleted                                                   |
| `phobos_texture__2k__by_ducn1567…jpg`                                                                                      |                 120 KB |  1  | md5-identical to `2k_phobos.jpg`.                                                                                                                                                                                                                                                   | Deleted                                                   |
| `ganymede.jpg`                                                                                                             |                 368 KB |  1  | md5-identical to canonical `4k_ganymede.jpg`.                                                                                                                                                                                                                                       | Deleted                                                   |
| `2k_earth_daymap.jpg`                                                                                                      |                 463 KB |  1  | Same imagery as the served `2k_earth.jpg` (0.30/255), different encode.                                                                                                                                                                                                             | Deleted                                                   |
| `2k_io.jpg`                                                                                                                |                 123 KB |  2  | The scrape under a tier name; superseded by the NASA Io map.                                                                                                                                                                                                                        | Deleted                                                   |
| `tethys jpegPIA14931.jpg`                                                                                                  |                 7.1 MB |  2  | Grayscale Cassini mosaic, 11520×5760; superseded by canonical `8k_tethys.jpg`, colourised Cassini at 13467×6734.                                                                                                                                                                    | Deleted                                                   |
| `rhea_a.jpg`                                                                                                               |                 224 KB |  2  | 1800×900 washed-out legacy render; superseded by `2k_rhea.jpg` (cratered Cassini map).                                                                                                                                                                                              | Deleted                                                   |
| `ganimede_mask.gif`                                                                                                        |                 5.1 KB |  2  | Polar mask, 1800×900 — same legacy pack as `rhea_a.jpg`. No consumer anywhere.                                                                                                                                                                                                      | Deleted                                                   |
| `mimas_texture__2k__by_ducn1567…jpg`                                                                                       |                 159 KB |  2  | 1264×632; superseded by `2k_mimas.jpg` (2048×1024 colour Cassini) + canonical `4k_mimas.jpg`.                                                                                                                                                                                       | Deleted                                                   |
| `triton_texture__2k__by_ducn1567…jpg`                                                                                      |                75.6 KB |  2  | 1264×632; superseded by `2k_triton.jpg` + canonical `4k_triton.png`.                                                                                                                                                                                                                | Deleted                                                   |
| `4k_eris_fictional.jpg`                                                                                                    |                 3.5 MB |  2  | Superseded by `2k_eris.jpg`, pinned as `eris-map-active` (verified 2026-07-23).                                                                                                                                                                                                     | Deleted + removed from `download-textures.js`             |
| `8k_stars.jpg`                                                                                                             |                 1.8 MB |  2  | No code path samples a background plate.                                                                                                                                                                                                                                            | Deleted + removed from `download-textures.js`             |
| `8k_stars_milky_way.jpg`                                                                                                   |                 1.9 MB |  2  | Same; also identical imagery to the 2k (0.18/255).                                                                                                                                                                                                                                  | Deleted + removed from `download-textures.js`             |
| `2k_stars_milky_way.jpg`                                                                                                   |                 251 KB |  2  | Same. Superseded by the HYG catalog + NASA star data.                                                                                                                                                                                                                               | Deleted                                                   |
| `earth` `jupiter` `mars` `mercury` `moon` `neptune` `saturn` `sun` `uranus` `venus` `.jpg`, `skybox.jpg`, `snowflake1.png` | 786,486 B each, 9.4 MB |  2  | **Not images of anything.** All twelve are 512×512 24-bit **BMPs** with the wrong extension, each a single solid colour matching that body's `color` constant (`saturn.jpg` = `#EBD795`, `neptune.jpg` = `#3333FF`). That is the "JPEG header a minimal SOF parser could not read". | Deleted                                                   |

**27 files, 24.53 MB.** `public/textures/` 109 → 82 files, 298.6 → 275 MB.

## Left undone, deliberately

**The `atmosphere` channel has no consumer.** `2k_venus_atmosphere.jpg` and
`4k_venus_atmosphere.jpg` are both dead, and the brief was right that both are
unreachable — but not for the reason the enumeration suggests. Venus's record
_does_ wire `textures.atmosphere`, and the 4k resolves fine; the string
`"atmosphere"` simply appears nowhere outside the `TextureChannel` union. No
component ever requests the channel.

Both files are kept. The fix is not a manifest line — it is a Venus cloud deck,
and that is a feature with real product consequences: Venus currently renders
the Magellan radar surface as if it were visible, when from space Venus is an
opaque cloud ball. Rendering the cloud layer would hide the surface entirely,
and the existing shell is tuned for Earth's partial cover and Earth's 3%
super-rotation (Venus super-rotates ~60×). That deserves its own line, not a
drive-by in an inventory sweep.

## Gate results

`test:run` 2258/2258 · `lint` clean · `build` clean.

`test:e2e` **cannot be run meaningfully in this container**: it has no GPU, so
`canvasLitFraction` reads 0 and the five render-dependent specs fail. Verified
they fail _identically on unmodified HEAD_ — same five, same assertions — and
the other seven pass on both. No baseline was blessed; the repo tracks only a
`win32` boot snapshot, and the `linux` PNG Playwright wrote here is a blank
canvas and was discarded. **The boot pixel gate still needs a human run on real
hardware.** One change can move it: `saturn.ring` now serves 2k rather than
boot in the overview band.

---

# Source sweep — 2026-07-27, second pass

Follow-up to the inventory: find better maps for the bodies left unpromoted or
without one, artistic included, provided the origin can be named. What could
not be improved is now **labelled a placeholder in the UI**, which was the
agreed fallback.

## Network reality

This container's egress policy denies every planetary-data host —
`astrogeology.usgs.gov`, `planetarymaps.usgs.gov`, `science.nasa.gov`,
`solarsystemscope.com`, `photojournal.jpl.nasa.gov`, Wikimedia — for `curl`
and `WebFetch` alike. GitHub is allowed, which is the only reason this pass
produced anything. Anything below marked _not fetchable here_ is a real
candidate that a session with open egress can act on.

## Sources evaluated

| Source                                                                | Licence                                                                                          | Verdict                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [`nasa/NASA-3D-Resources`](https://github.com/nasa/NASA-3D-Resources) | NASA Open Source Agreement 1.3; README: "free and without copyright"                             | **Used.** Global maps for 27 bodies. Reachable over `raw.githubusercontent.com`.                                                  |
| [USGS Astrogeology](https://astrogeology.usgs.gov/)                   | product-specific; "cite the authors"                                                             | Best measured source, _not fetchable here_                                                                                        |
| [Solar System Scope](https://www.solarsystemscope.com/textures/)      | CC BY 4.0                                                                                        | Already the repo's backbone; catalogue is planets + Moon/Ceres/Haumea/Makemake/Eris only, _not fetchable here_                    |
| [Björn Jónsson](https://bjj.mmedia.is/planetary_maps.html)            | attribution OK, **redistribution refused** — the author asks that copies not be hosted elsewhere | **Rejected on licence.** Highest-quality option; unusable for an app that must ship the file. Recorded so nobody re-litigates it. |

## Promoted

| Body   | From                                                            | To                                     | Why                                                                                                                                                                               |
| ------ | --------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| phobos | `2k_phobos.jpg` 1264×632, undocumented                          | `phobos_nasa_3d_resource.jpg` 1440×720 | Same Viking imagery and Stickney/groove structure, +14% linear res, documented, and no invented tint — the old file carried 21% mean saturation on a spectrally near-neutral body |
| deimos | `2k_deimos.jpg` 1264×632, byte-identical to a DeviantArt upload | `deimos_nasa_3d_resource.jpg` 1440×720 | Same, plus _more_ detail (mean \|∇²\| 5.15 vs 3.76)                                                                                                                               |

## Rejected, with the measurement

Every NASA candidate below is greyscale — `sat = 0.0%`. Promoting them would
repeat the mistake the first pass caught with the USGS mosaics: trading a
body's real colour for provenance. Phobos and Deimos are the exception
precisely because they _are_ grey.

| Body    | NASA candidate | Measurement                                                | Verdict                                                                                                             |
| ------- | -------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| dione   | 1440×720       | greyscale, detail 12.6 vs 37.5                             | reject — loses colour _and_ detail                                                                                  |
| rhea    | 1440×720       | greyscale, luma 190 / detail 9.5 vs 157 / 29.2             | reject — washed out                                                                                                 |
| europa  | 1440×720       | greyscale, but contrast 39.8 vs 25.6 and **no polar gore** | reject as-is; **best colourisation base found** — better than the USGS mosaic, which has the 68 px black south gore |
| titan   | 720×360        | flat orange, sat 97.6%, detail 0.25                        | reject — worse on every axis                                                                                        |
| jupiter | 720×360        | 1/100 the pixel count, detail 3.15 vs 8.72                 | reject                                                                                                              |

## Bodies with no better map anywhere

- **ceres** — no NASA 3D texture. Real upgrade is the DLR/Dawn FC controlled
  mosaic at USGS, not fetchable here. Labelled placeholder.
- **eris** — never resolved into a surface map by any instrument. No measured
  replacement _can_ exist. Labelled a permanent placeholder.
- **gonggong, quaoar, orcus, sedna, salacia, vanth, weywot, pallas** — no map,
  by design. These are unresolved point sources; the procedural surface driven
  by their measured colour indices is more honest than any invented map would
  be, and each already carries structured `visualProvenance`. Left alone
  deliberately — "artistic is fine" does not make a fabricated surface better
  than a disclosed procedural one.

## Placeholder labelling, and the contract behind it

`ceres`, `dione`, `rhea`, `eris` and `jupiter` now carry a user-facing
`visualProvenance` naming them placeholders, plus manifest entries recording
the alternative and why it lost.

The existing provenance test keyed off the **filename** (`/fictional|artist|by_|deviant/`).
That is the signal this whole line proved worthless — a DeviantArt upload
renamed `2k_io.jpg` passes it clean, which is how six bodies came to render one
undocumented 1264×632 set with no caveat shown to anyone. The contract now asks
the manifest instead: **if what we ship has a licence of "not documented in
repo", the body must show the user provenance.** It caught Jupiter immediately
— a 7.6 MB map, unresolved origin, no disclosure anywhere.

## Residual gap, not closed here

21 bodies still render maps with no `VISUAL_ASSET_MANIFEST` entry at all
(mercury, venus, earth, mars, saturn, neptune, moon, ganymede, callisto,
iapetus, tethys, enceladus, mimas, triton, the five Uranian moons, pluto,
charon). Most are Solar System Scope under CC BY 4.0, but the 4k Uranian-moon
PNGs — `4k_oberon.png` alone is 38 MB — have no recorded origin. Because they
have no entry, the new contract cannot see them. Worth its own line.

---

# Source sweep — third pass, non-NASA repos

Asked to look beyond NASA. Egress still allows only GitHub hosts, so this pass
is repo-based. Licence notes are recorded verbatim; the licensing call is the
maintainer's, but one distinction survives any purpose: **CC BY-NC and
attribution terms are satisfied by an open, non-commercial, educational app; a
refusal to allow redistribution is not.** That is the Björn Jónsson case and it
stays rejected.

## Repos evaluated

### [`CelestiaProject/CelestiaContent`](https://github.com/CelestiaProject/CelestiaContent)

REUSE-compliant, per-file SPDX sidecars — the best licence hygiene found
anywhere. 4096×2048 maps for ceres, dione, rhea, europa, tethys, mimas,
enceladus, iapetus; the Uranian moons at 2048–4096 px.

| Asset                                                         | Licence                     | Credited                                                                     |
| ------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| ariel, miranda, oberon, titania, umbriel                      | **CC-BY-SA-4.0**            | ItzImcool (2024-2026), Paul Schenk (2020), NASA/JPL/Ted Stryk                |
| triton                                                        | **CC-BY-3.0**               | Askaniy Anpilogov, NASA/JPL-Caltech/ASI/USGS                                 |
| charon                                                        | **CC-BY-NC-SA-3.0**         | Askaniy Anpilogov                                                            |
| titan                                                         | multi-source                | Martonchik & Orton 1994, Karkoschka 2016, Seignovert 2019, NASA/JPL/ASI/USGS |
| ceres, dione, rhea, europa, tethys, mimas, enceladus, iapetus | no SPDX sidecar in the repo | —                                                                            |

**Rejected — the maps are calibrated for Celestia's renderer, not ours.**
Rendered on a sphere under Atlas's lighting, `ceres.jpg` is a near-uniform dark
disc (mean luma 64, detail 3.3), and dione/rhea/europa come out blown white
(luma 203–208, detail 7.8–17.9 against our 14.5–37.5). This is not a defect in
their work — Celestia applies its own exposure — but they are not drop-in.

Tested the obvious fix on the highest-value target: level-matched Celestia's
Europa to the luma mean and s.d. of the map we ship (gain 2.558, bias −337.5)
and re-rendered. Structure comes back, but the lineae stay visibly softer than
our 1264×632 file — at 4096×2048 the map is smooth, not detailed. **Even
normalised it is not an upgrade.** Recorded so nobody repeats the experiment.

### [`Stellarium/stellarium`](https://github.com/Stellarium/stellarium)

Has every body we wanted, eris and haumea included. **Rejected on resolution:**
every texture in the source tree is 512×256. Stellarium fetches hi-res
separately at runtime, and that host is not reachable here.

## The one real find, and it was a mistake of mine

Restoring **`4k_eris_fictional.jpg`**, which the second commit of this line
deleted as "superseded by 2k*eris.jpg". That was backwards. Downscaled to a
common size the two differ by mean |Δ| **3.2/255** — `2k_eris.jpg` is a
1264×632 downscale \_of the Solar System Scope file*, not a replacement for it.

So Eris was rendering the same picture at a tenth of the pixels, with the
source, the CC BY 4.0 licence and the word "fictional" all stripped off. Eris
now renders the 4096×2048 original: 10× the pixels, documented licence, and the
Sidebar says outright that every surface feature is invented — which for a body
never resolved beyond a point source is the only honest thing to say.

`2k_eris.jpg` is deleted and `scripts/download-textures.js` gets its line back.

## Standing conclusion

Three repos, three passes. For **ceres, dione and rhea** nothing reachable beats
what ships; they stay placeholders and say so. The measured upgrades that do
exist — the DLR/Dawn Ceres mosaic, USGS Cassini colour mosaics — sit behind an
egress policy this container cannot cross, and are named in the manifest so a
session with open network can go straight at them.
