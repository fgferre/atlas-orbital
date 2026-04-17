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
      <Suspense fallback={null}>
        <AssetStudyApp />
      </Suspense>
    );
  }

  return (
    <div className="w-full h-full bg-black relative">
      <Loader />
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      <Suspense fallback={null}>
        <Overlay />
      </Suspense>
      <Suspense fallback={null}>
        <TutorialOverlay />
      </Suspense>
      <Suspense fallback={null}>
        <CreditsModal />
      </Suspense>
      <Suspense fallback={null}>
        <StarHoverTooltip />
      </Suspense>
    </div>
  );
}

export default App;
