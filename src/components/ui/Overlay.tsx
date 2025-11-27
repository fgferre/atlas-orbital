import { Sidebar } from "./Sidebar";
import { LayersPanel } from "./LayersPanel";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";
import { SearchBar } from "./SearchBar"; // Added import for SearchBar

export const Overlay = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="pointer-events-auto">
        <TopBar />
      </div>
      <Sidebar />
      {/* Removed old LayersPanel usage here */}
      <Timeline />

      {/* Right Controls Stack */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-40 pointer-events-none">
        <LayersPanel />
        <SearchBar />
      </div>

      {/* Global Vignette for immersion */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)] pointer-events-none z-0"></div>
    </div>
  );
};
