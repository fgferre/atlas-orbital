import { Sidebar } from "./Sidebar";
import { LayersPanel } from "./LayersPanel";
import { Timeline } from "./Timeline";

export const Overlay = () => {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <Sidebar />
      <LayersPanel />
      <Timeline />

      {/* Header */}
      <div className="absolute top-4 left-4 text-white z-10 pointer-events-none hidden md:block">
        <h1 className="text-2xl font-bold tracking-widest">ATLAS ORBITAL</h1>
        <p className="text-xs text-nasa-accent uppercase">System Online</p>
      </div>
    </div>
  );
};
