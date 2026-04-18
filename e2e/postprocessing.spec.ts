import { test } from "@playwright/test";

// TODO(onda-7 follow-up): this spec needs a deterministic way to force
// the "constrained" quality profile before the scene mounts AND a DOM or
// telemetry surface that reports whether post-processing passes are
// active. Neither exists yet:
//   - There is no `?qualityMode=constrained` URL parameter wired in
//     `src/store.ts` or `src/App.tsx`.
//   - No `data-postprocessing="…"` attribute is emitted by the scene
//     root, so the spec has nothing reliable to assert against.
// Once onda-8 adds either a URL override or a store-exposed global,
// replace the body below with:
//   1. Navigate to `/?qualityMode=constrained` (or call
//      `window.__STORE.getState().setQualityMode("saver")`).
//   2. Wait for the scene to re-render.
//   3. Assert the post-processing indicator is absent.
test.skip("constrained quality profile disables post-processing passes", async () => {
  // Skeleton only — see TODO above.
});
