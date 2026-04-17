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

- [ ] Add 2020-07-01 and 2021-01-01 fixtures for the 12 satellites and
      Pallas so they get multi-epoch coverage on par with the original 12.
- [ ] Consider 2025-01-01 fixtures as "primary" epoch so short-period
      moons (Io, Phobos, Mimas) stay within Phase-4 tolerance at
      present-day simulation dates.

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
- [ ] Decide whether `deriveElementsFromFixture` should become a real
      reproducible script under `scripts/` (inverts Horizons state vectors
      to the tabulated osculating elements used by Io / Titan / Oberon).
      Right now the derivation is only narrated in a comment.

## Review — 2026-04-17 session

Shipped:

1. `src/lib/orbital/analytical/` — real analytical stack (VSOP87D,
   Meeus Pluto, ELP/MPP02-trunc, JPL SSD mean elements reduced to J2000
   ecliptic, osculating asteroids).
2. `src/lib/orbital/analyticalProvider.ts` — no longer a stub; dispatches
   per body.
3. `src/lib/orbital/analytical/coordUtils.ts` — single source of truth for
   Kepler solver and perifocal → ecliptic rotation. `keplerProvider.ts`
   now delegates to it (DRY).
4. `src/lib/orbital/analytical/astronomiaShim.ts` — typed shim for the
   untyped `astronomia` npm package (documented workaround for
   `moduleResolution: "bundler"` ignoring ambient `declare module`).
5. Honest provenance strings throughout (no more "GUST86-derived" claims
   when GUST86 did not run).
6. Dead code pruned: `planetEquatorToEclipticMatrix`, `asJDE`,
   `OBLIQUITY_J2000_RAD` (all orphaned after the offline-rotation
   strategy change).
7. New unit tests: `coordUtils.test.ts` (15 cases).
8. Docs aligned: `PLAN.md`, `src/lib/orbital/README.md`,
   `src/lib/orbital/index.ts`, `src/lib/orbital/types.ts`, `time.ts`,
   `src/components/ui/CreditsModal.tsx`.

Known remaining risks, surfaced explicitly (see AGENTS.md #8):

- Fixtures are single-epoch. Long-term drift of truncated theories is not
  validated yet.
- Of the 15 `*MeanElements` satellites, only Io / Titan / Oberon are
  held to Phase-4 tight tolerance. The other 12 pass frame /
  registry tests only.
- Pallas has no fixture on disk; its elements come from published J2000
  SBDB values and are expected to drift slightly faster than the
  fixture-derived asteroids.

Verification status: `npm run lint` clean, `npm run test:run` at
225/225 green (includes the 15 new coordUtils cases),
`npm run build` 9.6 s.
