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
