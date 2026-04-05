# Atlas Orbital

A 3D solar system visualization built with React, Three.js, and TypeScript.

## NASA Eyes Star Data

Download star data from NASA Eyes CDN:

```bash
npm run download:nasa-stars
```

Files are saved to `public/data/nasa-stars/`.

### Usage

```typescript
import { parseNASAStarFile } from "./utils/nasaStarParser";

const stars = await parseNASAStarFile("/data/nasa-stars/stars.0.bin");
```

## Testing

```bash
npm test              # Watch mode
npm run test:run      # Run once (CI)
npm run test:coverage # With coverage
```

## Development

```bash
npm install
npm run dev
```

## Local Run Actions

To test the app locally with a stable URL:

```bash
npm run dev:test
```

Open:

```text
http://127.0.0.1:4173/atlas-orbital/
```

To validate the production build locally:

```bash
npm run build
npm run preview:test
```

Open:

```text
http://127.0.0.1:4174/atlas-orbital/
```
