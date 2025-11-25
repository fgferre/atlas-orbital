import { Sidebar } from "./Sidebar";
import { LayersPanel } from "./LayersPanel";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";

export const Overlay = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <TopBar />
      <Sidebar />
      <LayersPanel />
      <Timeline />

      {/* Global Vignette for immersion */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)] pointer-events-none z-0"></div>
    </div>
  );
};
