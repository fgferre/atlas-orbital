# Atlas Orbital — Active Todo

Updated: 2026-04-17

This file is the single running todo list for the orbital-realism initiative.
It complements the long-form plan in `PLAN.md` (strategy) and
`tasks/lessons.md` (accumulated mistakes and corrections).

## Active

### Phase 3 — Horizons validation expansion (done)

- [x] `scripts/generate-horizons-fixtures.js` generalized (multi-body,
      multi-date, retry, preserves cross-run fixtures).
- [x] 53 fixtures across 28 bodies and 4 epochs — baseline 2020-01-01,
      mid-year 2020-07-01, one-year 2021-01-01, out-of-range 1890-01-01.
- [x] `scripts/derive-elements-from-fixtures.js` inverts fixture (r, v)
      into osculating elements. All 18 `*MeanElements` + asteroid entries
      now come from this pipeline, at epoch tagged in TDB scale so the
      engine lands at `dt=0` (see lessons L9).
- [x] Phase-4 tolerances enforced: 0.1°/0.2°/0.5° per family at baseline;
      per-body drift envelopes for multi-epoch (see lessons L10).

### Phase 3 tail (follow-on, lower priority)

- [x] Shift the analytical element epoch from 2020-01-01 to 2025-01-01
      so short-period moons (Io, Phobos, Mimas) stay within Phase-4
      tolerance at present-day simulation dates. Multi-epoch regression
      dates moved to 2025-01-01 / 2025-07-01 / 2026-01-01 to match.
      Obsolete 2020-_ / 2021-_ fixtures removed.
- [ ] Expand `MULTI_EPOCH_BODIES` in `regression.test.ts` from the
      current 12 representatives to all 28 analytical bodies, with
      per-body drift envelopes in `MULTI_EPOCH_OVERRIDES` sized by
      observed behaviour. The 2025-07-01 and 2026-01-01 fixtures for
      all 28 bodies are already on disk.
- [ ] Schedule an epoch refresh cadence (every 3–5 years) so drift never
      exceeds 1° at present-day simulation dates.

### HYG Starfield — in-place replacement of the legacy tycho2 preset

Plan approved by the user: not a third preset, but a clean rebuild of the
preset whose UI label already says "HYG v4.2" (the legacy "tycho2" binary
is actually a magnitude-filtered HYG export with five of the 37 fields
kept). Claims validated against <https://codeberg.org/astronexus/hyg>
(119,614 stars, `ci`, `proper`, `pmra`/`pmdec`, x/y/z, ~14 MB CSV.gz,
CC BY-SA 4.0 — all confirmed, see session transcript). Path: upgrade the
pipeline in place so there is still exactly two presets (NASA + HYG) at
the end, with the HYG preset carrying the rich fields.

Sub-phases:

- [x] **HYG-A** — new offline pipeline:
      `scripts/download-hyg.js` caches the CSV.gz;
      `scripts/build-hyg-binary.js` emits four LOD-tier binaries
      (`hyg-v1-{low,medium,high,full}.bin{,.gz}`) + `hyg-v1.names.json`
      under `public/data/hyg-stars/`. Binary spec lives in
      `src/utils/hygBinary.ts` (parser + encoder), 12 round-trip tests.
      Does not touch runtime yet.
- [ ] **HYG-B** — runtime parser migration + Starfield renderer upgrade
      (B-V colour LUT, Pogson magnitude→size curve, proper motion uniform
      driven by simulation time). Store key migrated `"tycho2"` → `"hyg"`.
- [ ] **HYG-C** — tier selection wired to `qualityProfile` so the right
      tier file loads based on device capability. Cache per tier.
- [ ] **HYG-D** — hover labels (200 ms sustain, sidecar look-up,
      disabled on `constrained` tier).
- [ ] **HYG-E** — cleanup: delete `src/data/tycho2-processed.*`,
      `scripts/process-hyg.js`, `scripts/generate-tycho2-binary.js`,
      `scripts/hyg_v42.csv`. Rename the source type / store key to `hyg`,
      update `STARFIELD_SOURCE_METADATA` and `CreditsModal` with the
      real CC BY-SA 4.0 attribution.

Design decisions locked for HYG (approved by user, 2026-04-17):

- Float32 for x / y / z — simpler than manual Float16 decode, gzip absorbs
  most of the redundancy, zero CPU cost on weak devices.
- Names sidecar shipped as `hyg-v1.names.json`, loaded on demand when the
  hover-label feature activates — free cost for users who never hover.
- Hover UX: cursor feedback instant, tooltip on 200 ms sustain, disabled
  entirely on `constrained` tier.
- Proper motion on by default (shader cost invisible even for 109k stars).
- LOD via separate tier files rather than single-file + offsets — simpler
  caching, independent versioning, one `.bin.gz` fetch per tier.

### Phase 5 — Deferred visual realism (pending)

- [ ] Earth day/night shader fix (day-map too lit on the night side).
- [ ] Separate Earth cloud rotation from surface rotation.
- [ ] PBR maps (normal / specular / roughness) where trustworthy sources
      exist.
- [ ] At least one disturbed moon-system visual regression post-analytical.

### Phase 6 — Cleanup tail (pending)

- [ ] Audit remaining scope-comments in tests (`regression.test.ts` lines
      referring to "scope of EPHASTER" etc.) — decide whether to keep as
      historical context or rewrite.
- [ ] Clarify the Playwright acceptance gate in `PLAN.md` — the current
      command fails with `ERR_CONNECTION_REFUSED` unless `npm run
  preview:test` is running first. Either document the two-step flow
      or add a wrapper npm script that starts and tears down the preview.

## Review — 2026-04-17 session

Shipped in chronological order (5 commits after the pre-session baseline):

1. **Earth cloud day/night shader** — world-space sun uniform
   (`feat(planet): …`, commit `abb2f6c`). Earth cloud layer now dims on
   the night side regardless of camera orientation.
2. **Real offline analytical ephemeris stack** — `feat(orbital): …`,
   commit `bbec355`. Replaces the stub analyticalProvider with real
   dispatch into `src/lib/orbital/analytical/`: VSOP87D (8 planets),
   Pluto-Meeus, ELP/MPP02-trunc Moon, satellite + asteroid modules.
   Consolidates Kepler math in `coordUtils.ts` (DRY), removes dead
   code, adds 15 unit tests, aligns docs/credits.
3. **Multi-epoch Horizons regression** — `test(orbital): …`, commit
   `9279424`. Generalises `generate-horizons-fixtures.js` (multi-body /
   multi-date / retry), adds 41 fixtures across 4 epochs (baseline,
   mid-year, one-year, out-of-range), expands `regression.test.ts` to 74
   tests covering multi-epoch drift + validity-window routing.
4. **Fixture-derived satellite / asteroid elements** — `fix(orbital):
…`, commit `fe23150`. New `scripts/derive-elements-from-fixtures.js`
   inverts Horizons (r, v) into ecliptic-J2000 osculating elements via
   the standard RV→COE algorithm. All 18 `*MeanElements` + asteroid
   entries regenerated from this pipeline. Fixes the 50–170° phase
   errors on the 12 previously-tabular moons and the 72° Pallas error.
   Tolerances tightened to 0.5°/1 % at epoch; multi-epoch drift
   documented per body. Also discovers and fixes the UT-vs-TDB epoch
   mismatch that was costing Phobos ~1° at the supposed epoch (L9).
5. **HYG v4.2 binary pipeline (offline)** — `feat(starfield): …`,
   commit `e4994c3`. New format, downloader and LOD-tier builder under
   `public/data/hyg-stars/`. Does not touch runtime yet; HYG-B onwards
   will migrate the renderer.

Code quality checkpoints:

- `AGENTS.md` principles applied literally (no dead code, no duplicated
  Kepler solvers, honest provenance, no invented file references).
- Independent review (Codex): three findings — orbit lines using stale
  Kepler elements for upgraded moons (P2), credits misstating the
  satellite solver (P2), task log drifting from reality (P3). All three
  acted on in the Codex-follow-up commit.

Known remaining limits, surfaced explicitly (see AGENTS.md #8):

- Multi-epoch drift for fast-moving satellites is real and bounded, not
  hidden: Io ±80° /year, Titan / Oberon ±2° /year. Encoded in
  `regression.test.ts > MULTI_EPOCH_OVERRIDES` with physical cause.
- Of the 17 fixture-derived `*MeanElements` satellites + asteroids,
  only the original 12 representative bodies + Ceres / Vesta have
  fixtures at all three multi-epoch dates. The remaining 15 bodies +
  Pallas are held tight only at the 2020-01-01 baseline. Listed under
  "Phase 3 tail".

Verification status: `npm run lint` clean, `npm run test:run` at
291/291 green (30 test files, includes `hygBinary` round-trip),
`npm run build` ~13 s.
