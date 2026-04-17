# Atlas Orbital — Active Todo

Updated: 2026-04-17

This file is the single running todo list for the orbital-realism initiative.
It complements the long-form plan in `PLAN.md` (strategy) and
`tasks/lessons.md` (accumulated mistakes and corrections).

## Active

### Phase 3 — Horizons validation expansion (pending)

- [ ] Extend `scripts/generate-horizons-fixtures.js` to sweep multiple epochs:
      2020-01-01 (baseline, shipped), 2020-07-01 (mid-year), 2021-01-01
      (one-year drift), and one date outside the asteroid 1900–2050 window.
- [ ] Add Horizons fixtures for the 12 `*MeanElements` satellites and Pallas
      so the tight 0.5° Phase-4 regression covers the full family, not only
      Io / Titan / Oberon.
- [ ] Keep `src/test/fixtures/horizons/index.json` current.
- [ ] After fixtures land, tighten `src/lib/orbital/regression.test.ts` so
      every body in its representative set is checked against Horizons at
      every fixture epoch.

### HYG Starfield — third starfield preset (pending, gated)

**Gate (do not skip):** before writing any code, validate the following
claims about the HYG v4.2 database against the official sources at
<https://www.astronexus.com/hyg> and
<https://codeberg.org/astronexus/hyg>. If any claim is wrong, stop and
report back to the user:

- Star count: ~119,000–120,000
- Has B-V colour index (`ci` field)
- Has proper names for ~300+ bright stars
- Has proper motion (`pmra`, `pmdec`)
- Has pre-computed cartesian x / y / z
- Raw CSV.gz size ≈ 14 MB
- License CC BY-SA 4.0

Implementation requirements (once gate passes):

- [ ] Third starfield preset alongside NASA and Tycho-2.
- [ ] Offline binary conversion: `npm run download:hyg` downloads CSV,
      processes, emits compact binary under `public/data/hyg-stars/`
      (match the existing NASA binary pipeline).
- [ ] LOD system identical to NASA / Tycho-2: Low / Medium / High based on
      apparent magnitude, same lazy-load + cache.
- [ ] **Must not regress performance on any device tier.** Audit against
      the existing `qualityProfile` breakpoints before shipping.
- [ ] HYG-only features, on by default for this preset: - Real B-V colours - Per-magnitude variable point size - Proper motion over time (only if cheap; cut if it costs fps) - Optional bright-star label on hover (only if UX fits cleanly —
      design note required before implementation)
- [ ] 100 % backward compatible with NASA + Tycho-2 presets, or improve
      all three. Never regress the existing presets.

Reuse-first pass (AGENTS.md #11): before coding, read the current
starfield pipeline end-to-end (`src/lib/starfield.ts`,
`src/utils/nasaStarParser.ts`, `src/utils/tycho2Binary.ts`, canvas
renderer, `qualityProfile.ts`) and produce a "what gets reused vs what
has to be generalized vs what is new" map.

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
