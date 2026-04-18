import { Loader } from "./components/ui/Loader";
import { Suspense, lazy } from "react";

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
    <div className="w-full h-full bg-black relative">
      <Loader />
      <Suspense fallback={<Loader />}>
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
  );
}

export default App;
