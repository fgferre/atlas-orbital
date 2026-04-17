# Orbital Engine - Current Status

## Overview

Atlas currently computes runtime positions with a provider-based orbital engine, but the only active physics path in the web app is the Kepler fallback.

## Current Runtime

- `keplerProvider.ts` is the active solver for all bodies in the shipped app.
- `analyticalProvider.ts` is still a stub. It advertises planned models per body, logs a warning, and delegates the calculation to Kepler.
- Sidebar and credits now report the live provider honestly as `Kepler`, while still exposing the planned analytical model as roadmap information.
- Both `realistic` and `didactic` rendering now start from the same physical orbital position and only diverge in visual scaling.
- Visual orbit lines use osculating elements from the orbital engine and are re-keyed by date bucket so they no longer freeze against simulation time.

## Validation

- `scripts/generate-horizons-fixtures.js` fetches parent-centered J2000 ecliptic vectors from NASA JPL Horizons.
- `regression.test.ts` reads real fixtures from disk instead of inline placeholders.
- The representative coverage set is:
  `mercury`, `earth`, `moon`, `mars`, `io`, `titan`, `oberon`, `neptune`, `pluto`, `ceres`, `vesta`, `triton`.
- Current tolerances are intentionally broad and reflect the present Kepler fallback stage. They validate frame consistency and gross geometry, not final scientific precision.

## Gaps Still Open

- Actual analytical implementations are still missing for VSOP2013, TOP2013, ELP2000, MARSSAT, L1, TASS17, GUST86, and EPHASTER.
- Scientific precision should only be tightened after those providers exist and are validated against Horizons beyond coarse Kepler tolerances.

## Example

```ts
const result = orbitalEngine.calculatePosition("mercury", date);
console.log(result.provenance); // "Kepler fallback"
console.log(result.model); // "VSOP2013" (planned model metadata)
console.log(result.isFallback); // true

const provenance = orbitalEngine.getProvenance("mercury", date);
console.log(provenance.model); // "Kepler"
console.log(provenance.plannedModel); // "VSOP2013"
```
