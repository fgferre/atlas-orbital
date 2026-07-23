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
  bodies are checked at 2025-01-01 / 2025-07-01 / 2026-01-01; the 18
  analytical satellites are additionally checked on the negative side at
  2024-01-01 / 2024-07-01 for a two-sided, out-of-sample ±1 yr envelope.
- Tolerances enforce Phase 4 targets **at the baseline epoch (2025-01-01)
  only** — that is the instant the element blocks were inverted from, so it
  is the best case, not a general accuracy claim:
  - 0.1° for major planets (VSOP87D + Pluto-Meeus)
  - 0.2° for the Moon (ELP/MPP02-trunc)
  - 0.5° for every `*Osculating2Body` satellite and `AsteroidOsculating`
    asteroid (Ceres, Pallas, Vesta + 18 fixture-backed moons) **at the base
    epoch**. Away from the epoch the error is larger — see the multi-epoch
    numbers below.
  - Triton keeps the coarse 150° / 60% envelope because it is Kepler-only,
    not analytical — the regression proves the fallback still reaches the
    right neighbourhood.
- Multi-epoch drift uses per-body `MULTI_EPOCH_OVERRIDES` where two-body
  Kepler cannot model the real dynamics. The ±1 yr envelope is now measured
  on **both sides** of the 2025-01-01 epoch — Horizons fixtures at
  2024-01-01 / 2024-07-01 (negative side) and 2025-07-01 / 2026-01-01
  (positive side), so it is no longer extrapolated across the epoch. Worst
  observed angular residuals over epoch ±1 yr are **Mimas 5.2°, Phobos 3.6°,
  Europa 1.6°, Miranda 1.3°, Tethys 1.2°**; everything else is under ~0.9°.
  The short-period resonant moons (Mimas, Phobos) are the intrinsic worst
  case: plain two-body Kepler simply cannot hold a full year for them. Each
  override's observed drift is documented in the comment block at the top of
  `MULTI_EPOCH_OVERRIDES` in `regression.test.ts`, with the physical driver
  (J2, resonance, solar/tidal) named per body.
- **Provenance / in-sample caveat**: 4 of the 18 satellite mean motions are
  **published** (Phobos, Mimas, Tethys, Io — JPL SSD Planetary Satellite
  Mean Orbital Parameters); the other **14 were fitted** in-sample against
  the 2025-07-01 / 2026-01-01 fixtures. For those 14 the two 2024 fixtures
  are a genuine **out-of-sample** cross-check; for the 4 published bodies
  none of the four epochs is a fit target. The fitted figures are a
  goodness-of-fit floor plus one out-of-sample check, not fully independent
  validated accuracy, and must not be quoted as such.

## Validity Windows

`registry.ts` gates each model with a `validityRange`; outside it
`engine.ts` routes the body to the coarse Kepler fallback and the sidebar
shows the range.

| Model                                   | Window               | Basis                                                                                                                                |
| --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| VSOP87D / Pluto-Meeus / ELP-MPP02-trunc | per published theory | source theory                                                                                                                        |
| `*Osculating2Body` satellites           | 2020–2030            | epoch ±5 yr; ±1 yr measured both sides (worst 5.2°, Mimas), the edges are extrapolated                                               |
| `AsteroidOsculating`                    | 2000–2050            | epoch ±25 yr; the single out-of-sample check (`ceres-1890-01-01`, −135 yr) shows 7.4°, which extrapolates to ~1° at the window edges |

## Gaps Still Open

- Natural-satellite positions are **not** a perturbation theory. They are a
  single osculating element set per moon, frozen at 2025-01-01, advanced by
  a plain two-body Kepler step with a calibrated mean motion. Published
  theories such as Lieske E5/L1, TASS17, GUST86 and MARSSAT model J2,
  resonances and mutual perturbations and hold tens of kilometres over
  decades; this implementation degrades to degrees within a few years and
  is not comparable to them in scope or accuracy. Upgrading to a real
  series is out of scope for the offline bundle but remains an option if
  accuracy requirements tighten.
- Element _orientation_ (i, Ω, ω) is frozen at epoch, so nodal and apsidal
  precession are entirely unmodelled.
- Fixture epoch refresh every 3–5 years is process, not pending code. Track
  it from `tasks/STATUS.md` when it comes due.

## Example

```ts
const result = orbitalEngine.calculatePosition("mercury", date);
console.log(result.provenance); // "VSOP87D"
console.log(result.model); // "VSOP87D"
console.log(result.isFallback); // false

const provenance = orbitalEngine.getProvenance("mercury", date);
console.log(provenance.model); // "VSOP87D"
```
