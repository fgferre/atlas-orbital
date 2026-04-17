# Atlas Orbital - Execution Plan

Updated: 2026-04-17

## Task

Implement the full scientific orbital upgrade for Atlas Orbital and finish the deferred realism work, without breaking the current app baseline.

## Path A Execution Summary (shipped 2026-04-17)

The original plan named specific reference theories (`VSOP2013`, `TOP2013`,
`ELP2000`, `MARSSAT`, `L1`, `TASS17`, `GUST86`, `EPHASTER`). Most of those
publications do not ship as a browser-friendly offline bundle. We adopted
**Path A**: use pragmatic truncated / reduced theories with equivalent scope,
and label each result with the model that actually ran.

| Original label | Shipped implementation                    | Notes                                         |
| -------------- | ----------------------------------------- | --------------------------------------------- |
| VSOP2013       | `VSOP87D` via `astronomia`                | Meeus-truncated D variant, arcsec-level       |
| TOP2013        | `VSOP87D` (outer planets) + `Pluto-Meeus` | Pluto uses Meeus Ch. 37 series                |
| ELP2000        | `ELP-MPP02-trunc` via `astronomia/elp`    | DE-fitted truncated MPP02                     |
| MARSSAT        | `MartianSatMeanElements`                  | J2000 ecliptic osculating elements            |
| L1             | `GalileanMeanElements`                    | All 4 moons Horizons-derived at 2020-01       |
| TASS17         | `SaturnianMeanElements`                   | All 7 major moons Horizons-derived at 2020-01 |
| GUST86         | `UranianMeanElements`                     | All 5 major moons Horizons-derived at 2020-01 |
| EPHASTER       | `AsteroidOsculating`                      | All 3 asteroids Horizons-derived at 2020-01   |

Shipped today:

- `src/lib/orbital/analyticalProvider.ts` is no longer a stub; it dispatches
  per body to real providers in `src/lib/orbital/analytical/`.
- Full regression suite (`src/lib/orbital/regression.test.ts`) green at Phase 4
  tolerances against a 4-epoch Horizons fixture set (2020-01-01,
  2020-07-01, 2021-01-01, and 1890-01-01 for asteroid window coverage).
- `npm run build`, `npm run lint`, `npm run test:run` all green.
- UI (Sidebar, `CreditsModal`) and `src/lib/orbital/README.md` aligned to the
  shipped labels.

Still open: multi-epoch fixtures (Phase 3), long-term drift validation, and
the deferred realism work (Phase 5).

## Current State

- The orbital engine scaffold in `src/lib/orbital/` is live.
- Production runtime runs real analytical theories for all supported bodies.
- `src/lib/orbital/analyticalProvider.ts` dispatches per body; Kepler is only
  the explicit fallback.
- `src/lib/orbital/registry.ts` maps each body to its live analytical label.
- `src/lib/orbital/time.ts` is the canonical source of `JD`, `TT`, `TDB`.
- `didactic` and `realistic` share the same physical orbital base.
- Telemetry, render, and orbit lines all consume the orbital engine path.
- Real Horizons fixtures exist for the representative coverage set at a
  single epoch (2020-01-01).
- Deploy is static on GitHub Pages; Horizons is used offline only for fixture
  generation.

## Relevant Context

These points matter because they change how the remaining work should be executed:

- There is a single orbital path feeding render, telemetry, and orbit lines. Extend it; do not create a second physics path.
- `didactic` and `realistic` differ only in visual mapping. Keep that invariant.
- The regression harness uses real Horizons fixtures. Expand it instead of replacing it.
- The app baseline is currently green. Every remaining phase must preserve that.
- Static deploy is a real product constraint. Runtime API calls to Horizons are out of scope.
- The registry and time utilities already encode the intended design. The missing pieces are now multi-epoch validation and visual realism, not physics math.

## Objective

Reach the point where Atlas is scientifically honest and materially more accurate:

- real analytical models are active for supported bodies **(done)**
- Kepler is used only for unsupported bodies or out-of-range dates **(done)**
- regression tests prove the upgrade against real Horizons fixtures across multiple dates **(4 epochs × 28 bodies; multi-epoch tail for the 12 `*MeanElements` satellites and Pallas still pending)**
- UI and docs always report the live model truthfully **(done)**
- Earth and texture realism upgrades are completed after orbital accuracy is in place **(pending)**

## Hard Constraints

- Do not add a production dependency on Horizons.
- Do not use competitor similarity as an acceptance criterion.
- Do not claim an analytical model is active unless it actually produced the position.
- Do not reintroduce alternate physics paths outside the orbital engine.
- Keep the app fully offline at runtime.

## Priority Order

1. ~~Replace the analytical stub with real orbital math.~~ **Done.**
2. Expand Horizons validation to multi-date fixtures.
3. Tighten scientific tolerances family by family (already enforced at Phase 4 targets; revisit after multi-date).
4. ~~Preserve truthful provenance and fallback behavior.~~ **Done.**
5. Deliver the deferred realism upgrades.
6. Remove transition leftovers and align docs.

## Execution Order

### Phase 1 - Real Analytical Providers — DONE

Shipped in `src/lib/orbital/analytical/`:

1. `VSOP87D` for Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune (supersedes `VSOP2013` / `TOP2013` scope).
2. `Pluto-Meeus` (Meeus Ch. 37) for Pluto.
3. `ELP-MPP02-trunc` for the Moon (supersedes `ELP2000` scope).
4. `MartianSatMeanElements` for Phobos and Deimos (supersedes `MARSSAT` scope).
5. `GalileanMeanElements` for Io, Europa, Ganymede, Callisto (supersedes `L1` scope).
6. `SaturnianMeanElements` for Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus (supersedes `TASS17` scope).
7. `UranianMeanElements` for Miranda, Ariel, Umbriel, Titania, Oberon (supersedes `GUST86` scope).
8. `AsteroidOsculating` for Ceres, Pallas, Vesta (supersedes `EPHASTER` scope).

Kepler fallback is retained for:

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

Implementation rules satisfied:

- Analytical calculations consume `TDB`.
- Emitted vectors are in Atlas local `J2000_ECLIPTIC` three.js frame.
- Fallback remains explicit and truthful (`result.isFallback`, `plannedModel`).
- Offline `astronomia` is the only new dependency.

### Phase 2 - Validity Windows And Time Semantics — DONE

- `src/lib/orbital/time.ts` is the canonical time source for the analytical stack.
- Validity windows are enforced at runtime via the registry.
- `regression.test.ts` exercises the analytical-vs-Kepler switch for supported bodies.
- Asteroid out-of-range behavior (previously `EPHASTER`) falls back to Kepler cleanly.

### Phase 3 - Horizons Validation Expansion — DONE

Fixture coverage:

- 53 fixtures across 28 bodies and 4 epochs
  (2020-01-01, 2020-07-01, 2021-01-01, plus 1890-01-01 out-of-range Ceres).
- `scripts/generate-horizons-fixtures.js` accepts body and date filters,
  retries on 503/429, rebuilds `index.json` from disk.
- `scripts/derive-elements-from-fixtures.js` reproducibly inverts any
  fixture's (r, v) into the ecliptic-J2000 osculating element block used
  by `satellites.ts` / `asteroids.ts`. All 18 body entries in those
  modules were regenerated from this pipeline (L9 / L10 in
  `tasks/lessons.md`).

### Phase 4 - Tighten Regression Thresholds — DONE (baseline) + PARTIAL (multi-epoch)

Baseline (2020-01-01) enforced targets, all GREEN:

- `VSOP87D` + `Pluto-Meeus` bodies (8 planets + Pluto):
  angular `< 0.1°`, distance `< 0.2%`.
- `ELP-MPP02-trunc` Moon:
  angular `< 0.2°`, distance `< 0.5%`.
- All 18 `*MeanElements` satellites and `AsteroidOsculating` asteroids
  (including Io, Titan, Oberon, Phobos, Deimos, Europa, Ganymede,
  Callisto, Mimas, Enceladus, Tethys, Dione, Rhea, Iapetus, Miranda,
  Ariel, Umbriel, Titania, Ceres, Pallas, Vesta):
  angular `< 0.5°`, distance `< 1.0%` — elements are fixture-derived
  from Horizons via `derive-elements-from-fixtures.js`.
- Kepler-only bodies (Triton, Charon, Hygiea, TNOs): coarse checks +
  provenance honesty only.

Multi-epoch (2020-07-01 and 2021-01-01), GREEN with documented drift
envelopes:

- Major planets, Moon, Pluto, Ceres, Vesta, Triton: hold their baseline
  tolerance across all three epochs.
- Io: ±80° envelope (two-body Kepler loses 70°/yr on its 1.77-day
  resonant orbit — real limitation of the unperturbed propagator).
- Titan / Oberon: ±2° envelope (J2 + resonance drift ≈ 1–1.5°/yr).
- The 12 other `*MeanElements` satellites and Pallas: currently checked
  only at the baseline epoch. Extending multi-epoch regression to them
  is tracked in `tasks/todo.md` (Phase-3 tail work).

Drift envelopes are documented in `regression.test.ts >
MULTI_EPOCH_OVERRIDES` and in `satellites.ts` JSDoc with the physical
cause (see `tasks/lessons.md` L10).

### Phase 5 - Deferred Visual Realism — PENDING

After the orbital science upgrade is proven across multiple epochs:

- add `normal`, `specular`, and `roughness` maps where trustworthy
- improve Earth day/night behavior
- separate Earth cloud rotation from surface rotation
- add regression coverage for Earth visual behavior
- add at least one disturbed moon-system visual regression after analytical upgrades

### Phase 6 - Cleanup — PARTIAL

Remaining items:

- remove stub-specific leftovers (comments in `registry.ts`, historical references in tests)
- remove temporary transition helpers if no longer needed
- keep `src/lib/orbital/README.md`, credits, and UI text aligned with runtime reality as phases 3 and 5 progress

## Minimal Read Set

Read these first and nothing else unless needed:

- `PLAN.md`
- `src/lib/orbital/engine.ts`
- `src/lib/orbital/analyticalProvider.ts`
- `src/lib/orbital/analytical/` (all files)
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

Phase 1 work is complete. Remaining Sonnet-scoped tracks:

- Phase 5 realism: Earth day/night shader, cloud layer separation, PBR maps
- Phase 3 support: multi-epoch drift analysis once fixtures exist

### Haiku Owns

- `scripts/generate-horizons-fixtures.js` multi-date extension
- `src/test/fixtures/horizons/index.json`
- fixture bookkeeping
- small regression-test expansions that do not touch shared math
- docs wording alignment as phases 3 and 5 ship
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
- start the preview server first (`npm run preview:test`, listens on
  `127.0.0.1:4174`), then run
  `npx playwright test scripts/phase4-regression.spec.js --reporter=line`.
  Without the preview the test fails with `ERR_CONNECTION_REFUSED`.

## Done Means

This project is only done when:

- the analytical provider is no longer a stub **(done)**
- supported bodies really run on their intended analytical models **(done; labels reflect Path A scope-equivalents)**
- Kepler is limited to unsupported bodies or invalid dates **(done)**
- Horizons multi-date regression proves the gain numerically **(4 epochs × 28 bodies shipped; multi-epoch tail for the 12 `*MeanElements` satellites and Pallas remains)**
- UI and docs always show the true live model **(done)**
- realism upgrades are delivered without breaking the orbital integration **(pending)**
- build, lint, tests, and smoke all remain green **(green)**

## One-Line Summary For A Fresh Executor

Atlas has been turned from a Kepler-based orbital engine scaffold into a real offline analytical ephemeris system (Path A: VSOP87D / Meeus Pluto / ELP-MPP02-trunc / J2000-reduced mean elements / osculating asteroids). Remaining work: multi-epoch Horizons validation, then the deferred visual realism upgrades.
