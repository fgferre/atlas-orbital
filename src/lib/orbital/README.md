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
  - **JPL SSD mean elements** reduced to J2000 ecliptic osculating elements
    for the Galilean, Saturnian, Uranian, and Martian satellites.
  - **Osculating Keplerian elements** (epoch 2020-01-01 where tested against
    Horizons, J2000 otherwise) for Ceres, Pallas, and Vesta.
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
- The representative coverage set is:
  `mercury`, `earth`, `moon`, `mars`, `io`, `titan`, `oberon`, `neptune`,
  `pluto`, `ceres`, `vesta`, `triton`.
- Tolerances enforce Phase 4 targets at the tested epoch:
  - 0.1° for major planets (VSOP87D + Pluto-Meeus)
  - 0.2° for the Moon (ELP/MPP02-trunc)
  - 0.5° for the three fixture-backed satellites (Io, Titan, Oberon) and
    for Ceres / Vesta
  - the remaining `*MeanElements` satellites and Pallas currently pass
    registry / frame consistency tests only; tight angular coverage is
    tracked in `PLAN.md` Phase 3.

## Gaps Still Open

- Fixtures currently cover a single epoch (2020-01-01). Extending coverage to
  a multi-decade fixture sweep is tracked in `PLAN.md` and is the next step
  for validating long-term drift of the truncated theories.
- Natural-satellite accuracy relies on mean elements (scope-equivalent to
  Lieske L1, TASS17, GUST86, MARSSAT) rather than full perturbed theories.
  Upgrading to publication-grade series is out of scope for the offline
  bundle but remains an option if accuracy requirements tighten.

## Example

```ts
const result = orbitalEngine.calculatePosition("mercury", date);
console.log(result.provenance); // "VSOP87D"
console.log(result.model); // "VSOP87D"
console.log(result.isFallback); // false

const provenance = orbitalEngine.getProvenance("mercury", date);
console.log(provenance.model); // "VSOP87D"
```
