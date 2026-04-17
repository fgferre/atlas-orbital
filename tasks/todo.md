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

### HYG Starfield — in-place replacement of the legacy tycho2 preset (done)

All five sub-phases shipped:

- [x] **HYG-A** — offline pipeline (`scripts/download-hyg.js`,
      `scripts/build-hyg-binary.js`, `src/utils/hygBinary.ts`, 12 tests).
- [x] **HYG-B** — runtime migration. New shader with B-V colour, Pogson
      magnitude → size, proper motion uniform driven by simulation time.
      Store key migrated `"tycho2"` → `"hyg"`.
- [x] **HYG-C** — tier selection wired to `qualityProfile`. Constrained
      devices fetch 8 KB; ultra fetches 1.7 MB. Cache per tier so
      switching quality modes is free after first visit.
- [x] **HYG-D** — hover labels. 200 ms sustain, cursor feedback
      immediate, sidecar loaded on demand, disabled on constrained tier.
      IAU name + Bayer / Flamsteed + constellation + distance in ly.
- [x] **HYG-E** — legacy cleanup. Deleted `src/data/tycho2-processed.*`,
      `scripts/process-hyg.js`, `scripts/generate-tycho2-binary.js`,
      raw CSV. Updated credits and runtime metadata.

### Phase 5 — Deferred visual realism

- [x] Earth day/night shader fix — shipped in `abb2f6c`
      (world-space sun uniform; night-side clouds dim correctly).
- [ ] Separate Earth cloud rotation from surface rotation. Currently
      cloud mesh lives inside the surface `rotationRef`; needs its own
      rotation ref with a ~3 % faster rate (atmospheric super-rotation).
      Medium surface, low risk. ~1h.
- [ ] PBR maps (normal / specular / roughness) where trustworthy
      sources exist. Needs per-body source research (USGS Astrogeology
      for rocky worlds, Solar System Scope for gas giants, etc.) and
      careful integration since existing material may or may not pipe
      these inputs through. Several hours.
- [ ] At least one disturbed moon-system visual regression after the
      analytical upgrades. Requires Playwright snapshot baseline +
      scripted camera, harder to run on headless CI. Several hours.

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
