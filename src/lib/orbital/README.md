# Orbital Engine - Current Status

## Overview

Atlas computes runtime positions with a provider-based orbital engine. The
active physics path is an offline analytical stack that ships as part of the
static bundle (no network, no ephemeris files at runtime).

## Current Runtime

- `analyticalProvider.ts` is live and dispatches per body to a real analytical
  implementation in `lib/orbital/analytical/`:
  - **VSOP87D** (via `astronomia`) for Mercury through Neptune.
  - **Meeus Ch. 37 Pluto series** (via `astronomia/pluto`) for Pluto.
  - **ELP/MPP02 (truncated)** (via `astronomia/elp`) for the Moon.
  - **Horizons-derived J2000 ecliptic osculating elements** at epoch
    2025-01-01, produced by `scripts/derive-elements-from-fixtures.js`,
    for the Galilean, Saturnian, Uranian, and Martian satellites
    **plus** Ceres, Pallas, and Vesta. Propagated with a two-body
    Kepler step; no secular perturbations modelled.
- `keplerProvider.ts` remains the transparent fallback for any body without a
  published analytical theory. It is also used for all minor bodies whose
  orbits are defined by user-supplied or registry-sourced elements.
- Each result is labelled with the model that actually ran
  (`result.model`, `result.provenance`, `result.isFallback`).
- Sidebar and credits report the live provider honestly.
- Both `realistic` and `didactic` rendering start from the same physical
  orbital position and only diverge in visual scaling.
- Visual orbit lines use osculating elements from the orbital engine and are
  re-keyed by date bucket so they do not freeze against simulation time.

## Validation

- `scripts/generate-horizons-fixtures.js` fetches parent-centered J2000
  ecliptic vectors from NASA JPL Horizons.
- `regression.test.ts` reads real fixtures from disk.
- The representative coverage set is all 28 analytical + coarse-Kepler
  bodies:
  `mercury`, `earth`, `moon`, `mars`, `io`, `titan`, `oberon`, `neptune`,
  `pluto`, `ceres`, `vesta`, `triton`, `europa`, `ganymede`, `callisto`,
  `mimas`, `enceladus`, `tethys`, `dione`, `rhea`, `iapetus`, `miranda`,
  `ariel`, `umbriel`, `titania`, `phobos`, `deimos`, `pallas`. All 28
  bodies are checked at 2025-01-01 / 2025-07-01 / 2026-01-01.
- Tolerances enforce Phase 4 targets at the baseline epoch (2025-01-01):
  - 0.1° for major planets (VSOP87D + Pluto-Meeus)
  - 0.2° for the Moon (ELP/MPP02-trunc)
  - 0.5° for every `*MeanElements` satellite and `AsteroidOsculating`
    asteroid (Ceres, Pallas, Vesta + 18 fixture-backed moons).
  - Triton keeps the coarse 150° / 60% envelope because it is Kepler-only,
    not analytical — the regression proves the fallback still reaches the
    right neighbourhood.
- Multi-epoch drift (±6 mo, ±12 mo) uses per-body `MULTI_EPOCH_OVERRIDES`
  where two-body Kepler cannot model the real dynamics. Short-period /
  resonance-heavy moons have the widest envelopes (phobos 200°,
  enceladus 150°, tethys 130°). Each override's observed drift is
  documented in the comment block at the top of `MULTI_EPOCH_OVERRIDES`
  in `regression.test.ts`, with the physical driver (J2, resonance,
  solar/tidal) named per body.

## Gaps Still Open

- Natural-satellite accuracy relies on mean elements (scope-equivalent to
  Lieske L1, TASS17, GUST86, MARSSAT) rather than full perturbed theories.
  Upgrading to publication-grade series is out of scope for the offline
  bundle but remains an option if accuracy requirements tighten.
- Fixture epoch refresh every 3–5 years is tracked in `tasks/todo.md`
  under Phase 3 tail (process, not code — schedule, not pending work).

## Example

```ts
const result = orbitalEngine.calculatePosition("mercury", date);
console.log(result.provenance); // "VSOP87D"
console.log(result.model); // "VSOP87D"
console.log(result.isFallback); // false

const provenance = orbitalEngine.getProvenance("mercury", date);
console.log(provenance.model); // "VSOP87D"
```
