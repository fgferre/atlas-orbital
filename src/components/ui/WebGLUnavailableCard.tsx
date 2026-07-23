import type { ReactNode } from "react";

/**
 * Terminal fallback for "this browser/GPU cannot create a WebGL context".
 *
 * Rendered by `Scene.tsx` *instead of* `<Canvas>` when
 * `detectWebGLSupport()` fails, so the user gets an explanation and a
 * next step rather than a loader frozen at 8 %.
 *
 * `AppCrashCard` is deliberately NOT reused here: this is not a crash
 * with a retry path — there is nothing to re-render, the message is
 * instructional, and it needs an outbound link. `AppCrashCard` still
 * covers the generic failure/retry case (including the boot watchdog).
 *
 * Self-contained (no i18n / store / motion) for the same reason as
 * `AppCrashCard`: it must render when the rest of the app is degraded.
 * Meaning is carried by text, not colour alone.
 */
export function WebGLUnavailableCard(): ReactNode {
  return (
    <div
      role="alert"
      aria-labelledby="webgl-unavailable-title"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black p-6 text-white"
    >
      <div className="w-full max-w-md rounded-xl border border-nasa-accent/30 bg-[#0a0e17]/95 p-6 text-center shadow-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">
          Unsupported browser
        </p>
        <h2
          id="webgl-unavailable-title"
          className="mt-2 text-lg font-light tracking-wide text-white"
        >
          WebGL is not available
        </h2>
        <p className="mt-3 text-sm text-white/70">
          This 3D orbital view needs WebGL, and your browser or graphics
          hardware did not provide it. The scene cannot start.
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-left text-sm text-white/60">
          <li>Enable hardware acceleration in your browser settings.</li>
          <li>Update your browser and your graphics drivers.</li>
          <li>Try a different browser or a device with a GPU.</li>
        </ul>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <a
            href="https://get.webgl.org"
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-md bg-nasa-accent/90 px-4 py-2 text-sm font-medium text-black underline-offset-2 transition hover:bg-nasa-accent hover:underline"
          >
            Check WebGL support
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-nasa-accent/40 px-4 py-2 text-sm text-nasa-accent transition hover:bg-nasa-accent/10"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
