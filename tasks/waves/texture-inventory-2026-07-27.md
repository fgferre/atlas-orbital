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
