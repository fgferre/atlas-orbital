import { test } from "@playwright/test";

// TODO(onda-7 follow-up): this spec requires either a programmatic store
// hook (`window.__STORE?.getState().setQualityMode`) or a UI path through
// Leva that is reliably selectable. Neither is currently exposed:
//   - `window.__STORE` is not assigned anywhere in `src/`.
//   - Leva's debug panel only mounts after `Ctrl+Shift+D` which opens a
//     non-testid DOM tree, making stable selectors brittle.
// Once onda-8 exposes `setQualityMode` on the store OR tags the Leva
// profile control with a testid, replace the body below with:
//   1. Open Leva via the Project panel toggle (or keyboard shortcut).
//   2. Click the "Ultra" option in the quality control.
//   3. Assert `useStore.getState().qualityMode === "ultra"` via evaluate.
test.skip("toggles the quality profile via UI and reflects it in the store", async () => {
  // Skeleton only — see TODO above.
});
