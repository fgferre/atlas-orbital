import { useEffect, useState } from "react";

import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useStore } from "../../store";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { Sidebar } from "./Sidebar";
import { LayersPanel } from "./LayersPanel";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";
import { SearchBar } from "./SearchBar";
import { ViewportFramingTracker } from "./ViewportFramingTracker";
import {
  resolveRightControlPanelExit,
  resolveRightControlPanelRequest,
  type RightControlPanelId,
  type RightControlPanelState,
} from "./controlPanelConfig";

export const Overlay = () => {
  const [panelState, setPanelState] = useState<RightControlPanelState>({
    activePanel: null,
    queuedPanel: null,
  });
  const isMobile = useMediaQuery("(max-width: 767px)");
  const activePanel = panelState.activePanel;
  const setShortcutsModalOpen = useStore((s) => s.setShortcutsModalOpen);

  const requestPanel = (panel: RightControlPanelId | null) => {
    setPanelState((current) => resolveRightControlPanelRequest(current, panel));
  };

  const handlePanelExitComplete = () => {
    setPanelState((current) => resolveRightControlPanelExit(current));
  };

  // Menu structure v3.1 §5.6 global hotkeys. Guards per Codex PR 2
  // review:
  //   1. Skip if the user is typing in an input/textarea/contentEditable
  //      (same pattern as TopBar's H / Alt+←).
  //   2. Skip if any blocking overlay is open (tutorial, credits, gear,
  //      shortcuts) so `/` or `?` don't pop another layer on top.
  //   3. `/` must go through the same panel state machine (`requestPanel`)
  //      as clicking the rail tab, preserving exit animation ordering.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) return;

      const state = useStore.getState();
      const blockingOverlay =
        state.showTutorial ||
        state.showCredits ||
        state.gearOpen ||
        state.shortcutsModalOpen;
      if (blockingOverlay) return;

      const isSearchKey =
        event.key === "/" || (event.ctrlKey && event.key.toLowerCase() === "k");

      if (isSearchKey) {
        event.preventDefault();
        requestPanel("search");
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setShortcutsModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setShortcutsModalOpen]);

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
            : "right-[env(safe-area-inset-right)] top-[calc(env(safe-area-inset-top)+0.75rem)]"
        }`}
      >
        {/* Menu structure v3.1 filing-cabinet model: desktop flex-col uses
            `[&>*+*]:-mt-[0.375rem]` (−6 px) instead of `gap-1.5` so the
            closed tabs visually overlap slightly — matches the user's
            fichário-empilhado reference. Stride across the 4 tabs:
            80 px (tab height) − 6 px overlap = 74 px. */}
        <div
          className={`flex ${
            isMobile
              ? "h-full flex-col items-start justify-center gap-1.5"
              : "flex-col items-end [&>*+*]:-mt-[0.375rem]"
          }`}
        >
          <SearchBar
            activePanel={activePanel}
            setActivePanel={requestPanel}
            onPanelExitComplete={handlePanelExitComplete}
          />
          <LayersPanel
            activePanel={activePanel}
            setActivePanel={requestPanel}
            onPanelExitComplete={handlePanelExitComplete}
          />
        </div>
      </div>

      <KeyboardShortcutsModal />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]"
      ></div>
      <ViewportFramingTracker activePanel={activePanel} />
    </div>
  );
};
