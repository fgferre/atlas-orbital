# Atlas Orbital - Execution Plan

Updated: 2026-04-17

## Task

Implement the full scientific orbital upgrade for Atlas Orbital and finish the deferred realism work, without breaking the current app baseline.

## Current State

- The app already has an orbital engine scaffold in `src/lib/orbital/`.
- Production runtime still uses `Kepler` for all bodies.
- `src/lib/orbital/analyticalProvider.ts` is still a stub that falls back to Kepler.
- `src/lib/orbital/registry.ts` already maps each body to its intended analytical theory.
- `src/lib/orbital/time.ts` already provides `JD`, `TT`, `TDB`, and related conversions.
- `didactic` and `realistic` already share the same physical orbital base.
- Telemetry, render, and orbit lines already consume the orbital engine path.
- Real Horizons fixtures already exist, but only as a representative baseline set and with broad tolerances.
- Deploy is static on GitHub Pages, so Horizons must remain offline-only for fixture generation and validation.

## Relevant Context

These points matter because they change how the work should be executed:

- There is already a single orbital path feeding render, telemetry, and orbit lines. Extend that path; do not create a second physics path.
- `didactic` and `realistic` already differ only in visual mapping. Keep that invariant.
- The current regression harness already uses real Horizons fixtures. Expand it instead of replacing it.
- The app baseline is currently green. Every phase must preserve that.
- Static deploy is a real product constraint, not a temporary inconvenience. Runtime API calls to Horizons are out of scope.
- The registry and time utilities already encode the intended design. The missing part is the real analytical math, not another architecture rewrite.

## Objective

Reach the point where Atlas is scientifically honest and materially more accurate:

- real analytical models are active for supported bodies
- Kepler is used only for unsupported bodies or out-of-range dates
- regression tests prove the upgrade against real Horizons fixtures across multiple dates
- UI and docs always report the live model truthfully
- Earth and texture realism upgrades are completed after orbital accuracy is in place

In practical terms, the work is:

- activate real analytical models for supported bodies
- prove them numerically against Horizons across multiple dates
- keep fallback and provenance exact
- then finish the deferred realism upgrades

## Hard Constraints

- Do not add a production dependency on Horizons.
- Do not use competitor similarity as an acceptance criterion.
- Do not claim an analytical model is active unless it actually produced the position.
- Do not reintroduce alternate physics paths outside the orbital engine.
- Keep the app fully offline at runtime.

## Priority Order

1. Replace the analytical stub with real orbital math.
2. Expand Horizons validation to multi-date fixtures.
3. Tighten scientific tolerances family by family.
4. Preserve truthful provenance and fallback behavior.
5. Deliver the deferred realism upgrades.
6. Remove transition leftovers and align docs.

## Execution Order

### Phase 1 - Real Analytical Providers

Implement real analytical calculations in this order:

1. `VSOP2013` for Mercury, Venus, Earth, Mars
2. `TOP2013` for Jupiter, Saturn, Uranus, Neptune, Pluto
3. `ELP2000` for the Moon
4. `MARSSAT` for Phobos and Deimos
5. `L1` for Io, Europa, Ganymede, Callisto
6. `TASS17` for Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus
7. `GUST86` for Miranda, Ariel, Umbriel, Titania, Oberon
8. `EPHASTER` for Ceres, Pallas, Vesta

Keep Kepler fallback only for unsupported bodies:

- Triton
- Charon
- Hygiea
- Haumea
- Makemake
- Eris
- Gonggong
- Quaoar
- Orcus
- Sedna
- Salacia
- Vanth
- Weywot

Implementation rules:

- analytical calculations must consume `TDB`
- emitted vectors must match Atlas local `J2000_ECLIPTIC` expectations
- fallback must remain explicit and truthful
- `ephem.js` or an equivalent offline implementation is allowed only if it actually supplies the required theories and stays offline in the browser

### Phase 2 - Validity Windows And Time Semantics

- make `src/lib/orbital/time.ts` the canonical time source for analytical implementations
- enforce validity windows at runtime
- prove by tests that supported bodies can switch between analytical and Kepler depending on date
- especially validate `EPHASTER` out-of-range behavior

### Phase 3 - Horizons Validation Expansion

Expand fixture generation in `scripts/generate-horizons-fixtures.js`:

- support multi-date generation
- generate fixtures for at least:
  - baseline date
  - mid-year date
  - one-year-later date
  - one out-of-range date for bounded models
- keep fixtures parent-centered and `J2000_ECLIPTIC`
- keep `src/test/fixtures/horizons/index.json` current

### Phase 4 - Tighten Regression Thresholds

Do this only after analytical families are real.

Recommended final targets:

- `VSOP2013` and `TOP2013` bodies:
  angular error `< 0.1 deg`, distance error ratio `< 0.2%`
- `ELP2000` Moon:
  angular error `< 0.2 deg`, distance error ratio `< 0.5%`
- `MARSSAT`, `L1`, `TASS17`, `GUST86` bodies:
  angular error `< 0.5 deg`, distance error ratio `< 1.0%`
- `EPHASTER` bodies in-range:
  angular error `< 0.5 deg`, distance error ratio `< 1.0%`
- Kepler-only bodies:
  keep coarse checks, but provenance must be exact

### Phase 5 - Deferred Visual Realism

After the orbital science upgrade is proven:

- add `normal`, `specular`, and `roughness` maps where trustworthy
- improve Earth day/night behavior
- separate Earth cloud rotation from surface rotation
- add regression coverage for Earth visual behavior
- add at least one disturbed moon-system visual regression after analytical upgrades

### Phase 6 - Cleanup

- remove stub-specific leftovers
- remove temporary transition helpers if no longer needed
- align `src/lib/orbital/README.md`, credits, and UI text with runtime reality

## Minimal Read Set

Read these first and nothing else unless needed:

- `PLAN.md`
- `src/lib/orbital/engine.ts`
- `src/lib/orbital/analyticalProvider.ts`
- `src/lib/orbital/keplerProvider.ts`
- `src/lib/orbital/registry.ts`
- `src/lib/orbital/time.ts`
- `src/lib/orbital/integration.ts`
- `src/lib/orbital/regression.test.ts`
- `src/components/ui/Sidebar.tsx`
- `src/components/ui/CreditsModal.tsx`
- `scripts/generate-horizons-fixtures.js`

## Team Model

Use Opus 4.7 as coordinator and integrator.
Use Sonnet for bounded implementation work.
Use Haiku for low-complexity tasks, fixture maintenance, and docs/test support.

### Opus 4.7 Owns

- architecture decisions
- provider façade and shared contracts
- integration
- merge conflict resolution
- final threshold decisions
- final review

Files Opus should keep under its control:

- `src/lib/orbital/engine.ts`
- `src/lib/orbital/analyticalProvider.ts`
- `src/lib/orbital/integration.ts`
- `src/components/ui/Sidebar.tsx`
- `src/components/ui/CreditsModal.tsx`
- `src/lib/orbital/README.md`
- `PLAN.md`

### Sonnet Owns

Parallel bounded work with disjoint scopes:

- Worker A:
  `VSOP2013`, `TOP2013`, planet regressions
- Worker B:
  `ELP2000`, `MARSSAT`, Moon and Mars-satellite regressions
- Worker C:
  `L1`, `TASS17`, `GUST86`, giant-satellite regressions
- Worker D:
  `EPHASTER`, validity-window behavior, asteroid regressions

If needed, Opus should first split family logic into disjoint helper modules under `src/lib/orbital/analytical/`.

### Haiku Owns

- `scripts/generate-horizons-fixtures.js`
- `src/test/fixtures/horizons/index.json`
- fixture bookkeeping
- small regression-test expansions that do not touch shared math
- docs wording alignment after provider activation
- cleanup of dead comments/imports after integration

## Acceptance Gates

After each provider family:

- run targeted tests for that family
- run `src/lib/orbital/regression.test.ts`
- run `npm run lint`

After each wave:

- `npm run build`
- `npm run lint`
- `npm run test:run`

Before final completion:

- `npm run build`
- `npm run lint`
- `npm run test:run`
- `npx playwright test scripts/phase4-regression.spec.js --reporter=line`

## Done Means

This project is only done when:

- the analytical provider is no longer a stub
- supported bodies really run on their intended analytical models
- Kepler is limited to unsupported bodies or invalid dates
- Horizons multi-date regression proves the gain numerically
- UI and docs always show the true live model
- realism upgrades are delivered without breaking the orbital integration
- build, lint, tests, and smoke all remain green

## One-Line Summary For A Fresh Executor

The task is to turn Atlas from a Kepler-based orbital engine scaffold into a real offline analytical ephemeris system, prove it against Horizons, keep provenance truthful, and only then finish the deferred realism upgrades.
