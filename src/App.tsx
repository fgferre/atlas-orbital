import { Scene } from "./components/canvas/Scene";
import { Overlay } from "./components/ui/Overlay";
import { Loader } from "./components/ui/Loader";
import { TutorialOverlay } from "./components/ui/TutorialOverlay";
import { CreditsModal } from "./components/ui/CreditsModal";
import { Suspense } from "react";

function App() {
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
