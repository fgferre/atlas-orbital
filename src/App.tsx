import { Loader } from "./components/ui/Loader";
import { Suspense, lazy, useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { useStore } from "./store";

const Scene = lazy(() =>
  import("./components/canvas/Scene").then((module) => ({
    default: module.Scene,
  }))
);

const Overlay = lazy(() =>
  import("./components/ui/Overlay").then((module) => ({
    default: module.Overlay,
  }))
);

const TutorialOverlay = lazy(() =>
  import("./components/ui/TutorialOverlay").then((module) => ({
    default: module.TutorialOverlay,
  }))
);

const CreditsModal = lazy(() =>
  import("./components/ui/CreditsModal").then((module) => ({
    default: module.CreditsModal,
  }))
);

const StarHoverTooltip = lazy(() =>
  import("./components/ui/StarHoverTooltip").then((module) => ({
    default: module.StarHoverTooltip,
  }))
);

const AssetStudyApp = lazy(() =>
  import("./components/ui/AssetStudyApp").then((module) => ({
    default: module.AssetStudyApp,
  }))
);

function App() {
  // Wave α P1.5 fix: apply accessibility.uiScale to the document root
  // from the App lifetime, not per-panel. Previously the effect lived
  // on A11yPanel; its cleanup restored the prior font-size when the
  // panel unmounted, so closing the rail drawer silently reverted the
  // user's scale choice (even though the slice state stayed persisted).
  // Global subscription here means the scale applies on boot (persisted
  // value rehydrates before App mounts) and stays applied regardless
  // of whether any specific panel is open.
  const uiScale = useStore((state) => state.accessibility.uiScale);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty(
      "font-size",
      `${uiScale * 100}%`
    );
  }, [uiScale]);

  // Codex 2nd-round P2a fix: make `accessibility.reducedMotion` an
  // actual runtime behavior switch, not just a stored boolean.
  //
  // - `MotionConfig` below propagates `reducedMotion` to every
  //   `<motion.*>` / `AnimatePresence` descendant (Framer honors it
  //   for JS-driven transitions, which the OS media query alone
  //   cannot reach). `"always"` = app respects the toggle; `"user"`
  //   = fall back to the OS `prefers-reduced-motion` match.
  // - `document.documentElement.dataset.reducedMotion` makes the
  //   same state visible to CSS so the rule block in `index.css`
  //   can short-circuit transitions even when the OS media query
  //   isn't set.
  const reducedMotion = useStore((state) => state.accessibility.reducedMotion);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.reducedMotion = reducedMotion
      ? "true"
      : "false";
  }, [reducedMotion]);

  const isAssetStudyMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("study") === "asset-review";

  if (isAssetStudyMode) {
    return (
      // fallback={null} — asset-study route is a full-page takeover; the Loader
      // component isn't mounted here, so a spinner would flash over a blank page.
      <Suspense fallback={null}>
        <AssetStudyApp />
      </Suspense>
    );
  }

  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      <div className="w-full h-full bg-black relative">
        <Loader />
        {/* fallback={null} — <Loader /> above is already the singleton boot
          overlay that owns splash handoff + progress timers. Mounting a
          second Loader here while the Scene chunk resolves would
          duplicate those effects on the boot hot path. */}
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
        <Suspense fallback={null}>
          {/* fallback={null} — Overlay is the full chrome (top bar, controls);
            a skeleton would flash more than the real UI appearing. */}
          <Overlay />
        </Suspense>
        <Suspense
          fallback={
            <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
              <div className="h-6 w-6 rounded-full border-2 border-nasa-accent/30 border-t-nasa-accent animate-spin" />
            </div>
          }
        >
          <TutorialOverlay />
        </Suspense>
        <Suspense
          fallback={
            <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
              <div className="h-6 w-6 rounded-full border-2 border-nasa-accent/30 border-t-nasa-accent animate-spin" />
            </div>
          }
        >
          <CreditsModal />
        </Suspense>
        <Suspense fallback={null}>
          {/* fallback={null} — tooltip is hidden until hover; a skeleton would
            flash in empty space before any hover even happens. */}
          <StarHoverTooltip />
        </Suspense>
      </div>
    </MotionConfig>
  );
}

export default App;
