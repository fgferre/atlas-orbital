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

Shipped after the pre-session baseline (commits top-to-bottom, oldest
first):

1. **Earth cloud day/night shader** (`feat(planet)…`, `abb2f6c`) —
   world-space sun uniform so the night side dims correctly.
2. **Real offline analytical ephemeris stack** (`feat(orbital)…`,
   `bbec355`) — VSOP87D, Pluto-Meeus, ELP/MPP02-trunc, satellite +
   asteroid modules. Consolidates Kepler math in `coordUtils.ts`,
   removes dead code, 15 new unit tests, honest provenance throughout.
3. **Multi-epoch Horizons regression** (`test(orbital)…`, `9279424`) —
   generalises `generate-horizons-fixtures.js`, expands regression
   suite to cover multi-epoch drift + validity-window routing.
4. **Fixture-derived satellite / asteroid elements** (`fix(orbital)…`,
   `fe23150`) — new `scripts/derive-elements-from-fixtures.js` inverts
   Horizons (r, v) into osculating elements. Fixes 50–170° satellite
   errors and the 72° Pallas error. Catches UT-vs-TDB epoch mismatch
   (L9).
5. **HYG v4.2 binary pipeline (offline)** (`feat(starfield)…`,
   `e4994c3`) — HYG-A. Spec, downloader, LOD-tier builder, 12 tests.
6. **First Codex review follow-up** (`fix(orbital)…`, `85bafe9`) —
   orbit lines now consume analytical osculating elements; credits +
   registry notes aligned with Horizons-derived reality; task log
   refreshed; Playwright gate clarified in PLAN.md.
7. **HYG runtime migration** (`feat(starfield)…`, `8035770`) — HYG-B.
   New shader with B-V colour, Pogson size, proper motion uniform.
   Store key `tycho2` → `hyg`.
8. **HYG tier selection** (`feat(starfield)…`, `f455f7a`) — HYG-C.
   `qualityProfile` → tier mapping; cache per tier.
9. **HYG hover labels** (`feat(starfield)…`, `188ba31`) — HYG-D.
   200 ms sustain tooltip, cursor feedback, disabled on constrained.
10. **Legacy tycho2 pipeline deleted** (`chore(starfield)…`,
    `d872104`) — HYG-E cleanup.
11. **Analytical epoch shift 2020 → 2025** (`fix(orbital)…`, `a7fe539`)
    — re-derives every satellite/asteroid entry from fresh Horizons
    fixtures at 2025-01-01 so short-period moons stay under Phase-4
    tolerance at present-day simulation dates. 84 new fixtures, 52
    obsolete ones removed, `MULTI_EPOCH_DATES` bumped to 2025 / 2025-07
    / 2026.
12. **Second Codex review follow-up** (`fix(orbital)…`, this pending
    commit) — fixes the hover-picker catalog race that could keep
    tooltips disabled on first load, bumps
    `generate-horizons-fixtures.js` default dates to the 2025 set,
    aligns CreditsModal and task log to the current epoch.

Code quality checkpoints:

- `AGENTS.md` principles applied literally: no dead code after each
  strategy change, no duplicated Kepler solvers, honest provenance,
  no invented file references.
- Two rounds of independent Codex review, both acted on in the
  commit that immediately follows. `tasks/lessons.md` carries the L1-L10
  rule set derived from everything this session caught.
- Browser smoke test (preview mcp) confirmed zero runtime errors,
  hover tooltip working, tier selection auto-resolving, all textures
  loading.

Known remaining limits, surfaced explicitly (AGENTS.md #8):

- Multi-epoch drift for fast-moving satellites is real and bounded,
  not hidden: Io ±80° /yr, Titan / Oberon ±2° /yr. Encoded in
  `MULTI_EPOCH_OVERRIDES` with physical cause.
- `MULTI_EPOCH_BODIES` in `regression.test.ts` still only covers the
  12 original representatives. The 2025-07-01 / 2026-01-01 fixtures
  for the remaining 16 bodies are on disk but not yet held to tight
  multi-epoch tolerance (tracked in "Phase 3 tail").

Verification status: `npm run lint` clean, `npm run test:run` at
287/287 green across 30 test files, `npm run build` ~9 s.
