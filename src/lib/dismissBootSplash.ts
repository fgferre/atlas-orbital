/**
 * Dismiss the static `#app-boot-splash` element declared in `index.html`.
 *
 * The splash is injected by the host HTML so users see something before
 * React + the chunk graph finish booting. It is removed by the
 * application once a branch of the app has signalled that it owns the
 * viewport. The runtime `Loader` component does this for the main
 * Scene branch via an effect; the asset-study branch (`?study=asset-review`)
 * skips `Loader` entirely and therefore used to leave the splash
 * covering the viewport indefinitely. Both call sites now share this
 * helper so a future branch that bypasses `Loader` cannot accidentally
 * reintroduce the regression.
 *
 * The two-step dismiss (set `data-state="handoff"` → wait 360 ms →
 * `remove()`) is preserved verbatim from the previous inline
 * implementation so the CSS transition declared in `index.html`
 * (`#app-boot-splash[data-state="handoff"]`) still animates the
 * handoff.
 *
 * Returns a cancel function suitable for a React `useEffect` cleanup,
 * so if the component unmounts before the 360 ms animation finishes
 * we do not queue a no-op `remove()` on a detached node.
 */
const BOOT_SPLASH_ID = "app-boot-splash";
const HANDOFF_DURATION_MS = 360;

export const dismissBootSplash = (): (() => void) | undefined => {
  if (typeof document === "undefined") return undefined;
  const bootSplash = document.getElementById(BOOT_SPLASH_ID);
  if (!bootSplash) return undefined;

  bootSplash.setAttribute("data-state", "handoff");
  const timer = window.setTimeout(() => {
    bootSplash.remove();
  }, HANDOFF_DURATION_MS);

  return () => window.clearTimeout(timer);
};
