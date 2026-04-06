import { Scene } from "./components/canvas/Scene";
import { Overlay } from "./components/ui/Overlay";
import { Loader } from "./components/ui/Loader";
import { TutorialOverlay } from "./components/ui/TutorialOverlay";
import { CreditsModal } from "./components/ui/CreditsModal";
import { AssetStudyApp } from "./components/ui/AssetStudyApp";
import { Suspense } from "react";

function App() {
  const isAssetStudyMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("study") === "asset-review";

  if (isAssetStudyMode) {
    return <AssetStudyApp />;
  }

  return (
    <div className="w-full h-full bg-black relative">
      <Loader />
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      <Overlay />
      <TutorialOverlay />
      <CreditsModal />
    </div>
  );
}

export default App;
