# Atlas Orbital

A 3D solar system visualization built with React 19, Three.js, and TypeScript. Orbital positions come from analytical theories per family (VSOP87D, Pluto-Meeus, ELP/MPP02-trunc, Kepler osculating-elements), all validated against JPL Horizons fixtures. The star field uses the HYG v4.2 catalog in adaptive tiers; an optional NASA Eyes reference renderer is bundled for visual comparison.

## Development

```bash
npm install
npm run dev
```

## Orbital mechanics

The orbital engine and its regression suite live in `src/lib/orbital/`:

- `engine.ts` — provider dispatch + per-body position cache.
- `registry.ts` — body → analytical model mapping.
- `analytical/` — VSOP87D, Pluto-Meeus, ELP/MPP02-trunc, Kepler providers.
- `regression.test.ts` — 74 tolerance-gated tests against JPL Horizons fixtures at multiple epochs (see `src/test/fixtures/horizons/`).

Regenerate fixtures or derive mean elements:

```bash
node scripts/generate-horizons-fixtures.js
node scripts/derive-elements-from-fixtures.js
```

## Star catalogs

HYG v4.2 is the default star source. Tiered binaries live in `public/data/hyg-stars/`; the tier is picked automatically from the device quality profile.

```bash
npm run download:hyg    # Fetches the raw CSV into scripts/.cache/
npm run build:hyg       # Emits hyg-v1-{low,medium,high,full}.bin.gz
```

The legacy NASA Eyes star CDN is also supported for side-by-side comparison:

```bash
npm run download:nasa-stars
```

## Testing

```bash
npm test              # Vitest watch
npm run test:run      # Single run (CI mode)
npm run test:coverage # Coverage report
```

## Local preview actions

Stable URL for local development:

```bash
npm run dev:test
```

Open `http://127.0.0.1:4173/atlas-orbital/`.

Validate the production build locally:

```bash
npm run build
npm run preview:test
```

Open `http://127.0.0.1:4174/atlas-orbital/`.
