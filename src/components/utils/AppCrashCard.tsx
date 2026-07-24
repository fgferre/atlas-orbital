import type { ReactNode } from "react";

interface AppCrashCardProps {
  error: Error;
  reset: () => void;
  /**
   * `true` (top-level boundary in `main.tsx`): opaque full-screen
   * takeover — the whole render tree failed, nothing behind is usable.
   * `false` (UI-subtree boundary in `App.tsx`): a centered card over a
   * transparent backdrop so the 3D scene stays visible and interactive
   * while only the UI chrome is down.
   */
  fullScreen?: boolean;
  title?: string;
  description?: string;
  retryLabel?: string;
  showReload?: boolean;
}

/**
 * Fallback UI for the app-shell ErrorBoundaries (top-level in `main.tsx`,
 * UI-subtree in `App.tsx`). Before this, `ErrorBoundary` was wired ONLY
 * per-planet (`Planet.tsx`), so a render error in the `Overlay` / lazy UI
 * subtrees or the `Scene` component shell produced a blank page with no
 * recovery. This card keeps failure honest: it names the error and offers a
 * cheap retry (re-render the subtree) plus a hard reload.
 *
 * Coverage caveat: these are DOM-tree boundaries. Errors thrown INSIDE the
 * R3F `<Canvas>` children render in react-three-fiber's reconciler and are
 * NOT caught here — they need an in-canvas boundary (see `Scene.tsx`).
 *
 * Deliberately self-contained — no i18n / store / framer-motion — so it still
 * renders when one of those is the thing that crashed. English-only for the
 * same reason (the i18n layer may be the failure point).
 */
export function AppCrashCard({
  error,
  reset,
  fullScreen = false,
  title = "Something went wrong",
  description,
  retryLabel = "Try again",
  showReload = true,
}: AppCrashCardProps): ReactNode {
  return (
    <div
      role="alert"
      className={
        fullScreen
          ? "fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-6"
          : "pointer-events-none fixed inset-x-0 top-6 z-[9999] flex justify-center px-6"
      }
    >
      <div className="pointer-events-auto w-full max-w-md rounded-xl border border-nasa-accent/30 bg-[#0a0e17]/95 p-6 text-center shadow-2xl backdrop-blur">
        <h2 className="text-lg font-light tracking-wide text-white">{title}</h2>
        <p className="mt-2 text-sm text-white/60">
          {description ??
            (fullScreen
              ? "The app hit an unexpected error and couldn't continue."
              : "Part of the interface crashed. The 3D view is still running.")}
        </p>
        {error?.message ? (
          <p className="mt-3 break-words rounded border border-white/10 bg-black/40 px-3 py-2 text-left font-mono text-xs text-white/40">
            {error.message}
          </p>
        ) : null}
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-nasa-accent/40 px-4 py-2 text-sm text-nasa-accent transition hover:bg-nasa-accent/10"
          >
            {retryLabel}
          </button>
          {showReload && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-nasa-accent/90 px-4 py-2 text-sm font-medium text-black transition hover:bg-nasa-accent"
            >
              Reload
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
