import { useState } from "react";

import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Sidebar } from "./Sidebar";
import { LayersPanel } from "./LayersPanel";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";
import { SearchBar } from "./SearchBar";
import type { RightControlPanelId } from "./controlPanelConfig";

export const Overlay = () => {
  const [activePanel, setActivePanel] = useState<RightControlPanelId | null>(
    null
  );
  const isMobile = useMediaQuery("(max-width: 767px)");

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="pointer-events-auto">
        <TopBar />
      </div>
      <Sidebar />
      <Timeline />

      <div
        className={`pointer-events-none absolute z-40 ${
          isMobile
            ? "bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] left-[max(0.2rem,env(safe-area-inset-left))] top-[calc(env(safe-area-inset-top)+4.75rem)]"
            : "right-[max(0.2rem,env(safe-area-inset-right))] top-1/2 -translate-y-1/2"
        }`}
      >
        <div
          className={`flex ${
            isMobile
              ? "h-full flex-col items-start justify-center gap-1.5"
              : "flex-col items-end gap-1.5"
          }`}
        >
          <SearchBar
            activePanel={activePanel}
            setActivePanel={setActivePanel}
          />
          <LayersPanel
            activePanel={activePanel}
            setActivePanel={setActivePanel}
          />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]"
      ></div>
    </div>
  );
};
