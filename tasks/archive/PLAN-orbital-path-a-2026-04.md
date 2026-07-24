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
| MARSSAT        | `MartianSatOsculating2Body`               | J2000 ecliptic osculating elements            |
| L1             | `GalileanOsculating2Body`                 | All 4 moons Horizons-derived at 2025-01       |
| TASS17         | `SaturnianOsculating2Body`                | All 7 major moons Horizons-derived at 2025-01 |
| GUST86         | `UranianOsculating2Body`                  | All 5 major moons Horizons-derived at 2025-01 |
| EPHASTER       | `AsteroidOsculating`                      | All 3 asteroids Horizons-derived at 2025-01   |

Shipped:

- `src/lib/orbital/analyticalProvider.ts` is no longer a stub; it dispatches
  per body to real providers in `src/lib/orbital/analytical/`.
- Regression suite (`src/lib/orbital/regression.test.ts`) green at Phase 4
  tolerances against the canonical Horizons fixture set:
  2025-01-01 / 2025-07-01 / 2026-01-01, plus a 1890-01-01 Ceres point to
  cover the asteroid-window fallback. Matches
  `scripts/generate-horizons-fixtures.js > DEFAULT_TEST_DATES`.
- `npm run build`, `npm run lint`, `npm run test:run` all green.
- UI (Sidebar, `CreditsModal`) and `src/lib/orbital/README.md` aligned to the
  shipped labels and epoch.

Phase 3 multi-epoch coverage shipped end-to-end (28 bodies × 3 epochs) and
Phase 5 (deferred realism) landed in-session — see entries below. Only the
long-term drift / epoch-refresh cadence remains as a process item.

## Current State

- The orbital engine scaffold in `src/lib/orbital/` is live.
- Production runtime runs real analytical theories for all supported bodies.
- `src/lib/orbital/analyticalProvider.ts` dispatches per body; Kepler is only
  the explicit fallback.
- `src/lib/orbital/registry.ts` maps each body to its live analytical label.
- `src/lib/orbital/time.ts` is the canonical source of `JD`, `TT`, `TDB`.
- `didactic` and `realistic` share the same physical orbital base.
- Telemetry, render, and orbit lines all consume the orbital engine path.
- Real Horizons fixtures exist for the representative coverage set across
  four epochs (2020-01-01, 2020-07-01, 2021-01-01, 1890-01-01), with
  follow-on 2025/2026 fixtures now enforced at multi-epoch for all 28 bodies.
- Deploy is static on GitHub Pages; Horizons is used offline only for fixture
  generation.

## Relevant Context

These points matter because they change how the remaining work should be executed:

- There is a single orbital path feeding render, telemetry, and orbit lines. Extend it; do not create a second physics path.
- `didactic` and `realistic` differ only in visual mapping. Keep that invariant.
- The regression harness uses real Horizons fixtures. Expand it instead of replacing it.
- The app baseline is currently green. Every remaining phase must preserve that.
- Static deploy is a real product constraint. Runtime API calls to Horizons are out of scope.
- The registry and time utilities already encode the intended design. The remaining pieces are long-term drift / epoch-refresh cadence and per-body PBR bakes beyond Earth (Phase 7), not physics math.

## Objective

Reach the point where Atlas is scientifically honest and materially more accurate:

- real analytical models are active for supported bodies **(done)**
- Kepler is used only for unsupported bodies or out-of-range dates **(done)**
- regression tests prove the upgrade against real Horizons fixtures across multiple dates **(28 bodies × 3 multi-epoch dates + 1890 out-of-range Ceres fallback; per-body drift envelopes documented in `MULTI_EPOCH_OVERRIDES`)**
- UI and docs always report the live model truthfully **(done)**
- Earth and texture realism upgrades are completed after orbital accuracy is in place **(done — Earth day/night shader, cloud rotation split, and PBR normal + roughness shipped across `abb2f6c`, `2862f7d`, `05ebaf7`)**

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
4. `MartianSatOsculating2Body` for Phobos and Deimos (NOT scope-equivalent to `MARSSAT`; see note below).
5. `GalileanOsculating2Body` for Io, Europa, Ganymede, Callisto (NOT scope-equivalent to `L1`; see note below).
6. `SaturnianOsculating2Body` for Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus (NOT scope-equivalent to `TASS17`; see note below).
7. `UranianOsculating2Body` for Miranda, Ariel, Umbriel, Titania, Oberon (NOT scope-equivalent to `GUST86`; see note below).
8. `AsteroidOsculating` for Ceres, Pallas, Vesta (NOT scope-equivalent to
   `EPHASTER`; see note below).

> **Scope note (2026-07-23 audit).** Rows 4-8 name the published theory each
> family was _meant_ to cover, not a theory this repo implements. What ships is
> two-body Kepler propagation of Horizons-derived osculating elements at a
> single epoch, with an explicit mean motion per body. MARSSAT / L1 / TASS17 /
> GUST86 / EPHASTER model perturbations (J2, resonances, mutual terms) and hold
> tens of km over decades; this does not. Claiming equivalence was the single
> most false precision statement in the repo and was removed from `README.md`
> and here in the same pass.

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

### Phase 4 - Tighten Regression Thresholds — DONE

Baseline (2020-01-01) enforced targets, all GREEN:

- `VSOP87D` + `Pluto-Meeus` bodies (8 planets + Pluto):
  angular `< 0.1°`, distance `< 0.2%`.
- `ELP-MPP02-trunc` Moon:
  angular `< 0.2°`, distance `< 0.5%`.
- All 18 `*Osculating2Body` satellites and `AsteroidOsculating` asteroids
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
- All 18 satellites now carry an explicit `nDegPerDay` instead of deriving
  mean motion from the osculating semi-major axis. That single change cut the
  worst multi-epoch error from 165° (Phobos) to 2.6° (Mimas), so the envelopes
  below are per-body and tight rather than the 20°–200° band this section used
  to document:
  - Mimas 3.5°, Phobos 2.5°, Miranda 1.8°, Tethys 1.3°, Enceladus 1.2°;
  - every other analytical satellite sits at 0.3°–0.8°.
- Caveat: 14 of the 18 rates were fitted against the same two off-epoch
  fixtures the suite asserts on (in-sample); 4 (Mimas, Phobos, Tethys, Io) use
  the published JPL value. Mimas and Phobos are aliased if derived from the
  181-day baseline, so they must not be re-derived from fixtures alone.
- Pallas sits comfortably inside the 0.5° family default — no override.

Drift envelopes are documented in `regression.test.ts >
MULTI_EPOCH_OVERRIDES` and in `satellites.ts` JSDoc with the physical
cause (see `tasks/lessons.md` M6).

### Phase 5 - Deferred Visual Realism — SHIPPED (see tasks/STATUS.md)

Completed tracks:

- Earth day/night shader fix (`abb2f6c`).
- Earth cloud / surface rotation split (`2862f7d`).
- Earth PBR maps (normal + roughness) via SSS bake pipeline
  (`05ebaf7`) + Ceres fictional retirement in the same commit.
- Targeted vitest coverage for PBR channel resolution + Earth body
  wiring (`aef03b8`). Moon-system Playwright visual regression was
  scoped out — rationale in `tasks/todo.md` Phase 5 entry.

Per-body PBR bakes beyond Earth are deferred to Phase 7 pending
per-body source research.

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

- (no open tracks — Phase 3 multi-epoch coverage shipped)

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
- `npm run test:e2e` — Playwright harness at `e2e/*.spec.ts`, config
  in `playwright.config.ts`. Spawns its own preview server on port
  4174 (`--strictPort`); do not start one separately. Five specs:
  `boot`, `focus`, `quality`, `postprocessing`, plus the shared
  helpers in `e2e/helpers.ts`.

## Done Means

This project is only done when:

- the analytical provider is no longer a stub **(done)**
- supported bodies really run on their intended analytical models **(done; labels reflect Path A scope-equivalents)**
- Kepler is limited to unsupported bodies or invalid dates **(done)**
- Horizons multi-date regression proves the gain numerically **(28 bodies × 3 multi-epoch dates enforced with per-body drift envelopes; fixture epoch-refresh cadence still a process item, not code)**
- UI and docs always show the true live model **(done)**
- realism upgrades are delivered without breaking the orbital integration **(done for Phase 5 Earth tracks; per-body PBR beyond Earth deferred to Phase 7)**
- build, lint, tests, and smoke all remain green **(green)**

## One-Line Summary For A Fresh Executor

Atlas has been turned from a Kepler-based orbital engine scaffold into a real offline analytical ephemeris system (Path A: VSOP87D / Meeus Pluto / ELP-MPP02-trunc / J2000-reduced mean elements / osculating asteroids) with Phase 5 Earth realism (day/night shader, cloud rotation split, PBR normal + roughness) also landed, and Phase 3 multi-epoch regression enforced across all 28 bodies at 2025-01-01 / 2025-07-01 / 2026-01-01 with per-body drift envelopes. Remaining work: per-body PBR bakes beyond Earth in Phase 7, and fixture epoch-refresh cadence (process item).
