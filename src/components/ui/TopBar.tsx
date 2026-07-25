import { useEffect, type ReactNode } from "react";

import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useStore } from "../../store";
import { ContextLine } from "./ContextLine";
import { GearPopover } from "./GearPopover";

export const TopBar = () => {
  const focusHome = useStore((state) => state.focusHome);
  const focusBack = useStore((state) => state.focusBack);
  const canFocusBack = useStore((state) => state.focusHistory.length > 0);
  const gearOpen = useStore((state) => state.gearOpen);
  const setGearOpen = useStore((state) => state.setGearOpen);
  const isMobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) return;

      // Menu structure v3.1 §5.6 + Codex PR 3 review: navigation
      // hotkeys honor the same blocking-overlay guard as the global
      // /, ? handlers in Overlay. Firing focus/back behind a modal
      // leaves the user in a different camera state when the overlay
      // closes — coherent guard across all global hotkeys avoids that.
      const state = useStore.getState();
      const blockingOverlay =
        state.showTutorial ||
        state.showCredits ||
        state.gearOpen ||
        state.shortcutsModalOpen;
      if (blockingOverlay) return;

      if (e.key.toLowerCase() === "h") {
        e.preventDefault();
        focusHome();
      }

      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        focusBack();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusBack, focusHome]);

  return (
    <div
      data-ui-framing="top-bar"
      className="pointer-events-none absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-30"
    >
      <div className="command-shell tech-corners ghost-border pointer-events-auto flex items-center gap-2 px-2.5 py-2 sm:px-3">
        {/* Menu structure v3.1 §4.1 mobile layout: brand collapses to
            the glyph only at narrow widths so the cluster leaves room
            for Back + Home + Menu without two-line wrapping. */}
        <div
          className={`flex items-center border border-white/8 bg-black/15 ${
            isMobile
              ? "p-1.5"
              : "min-w-[9rem] gap-2 px-2.5 py-2 sm:min-w-[10rem]"
          }`}
          aria-label={isMobile ? "Atlas Orbital" : undefined}
        >
          <div className="flex h-6 w-6 items-center justify-center border border-nasa-accent/35 bg-nasa-accent/10 shadow-[0_0_12px_rgba(0,240,255,0.12)]">
            <div className="h-1.5 w-1.5 bg-nasa-accent shadow-[0_0_8px_rgba(0,240,255,0.45)]"></div>
          </div>
          {!isMobile && (
            <div className="min-w-0">
              <h1 className="text-[10px] font-bold tracking-[0.2em] text-white sm:text-[11px]">
                <span className="font-orbitron">ATLAS </span>
                <span className="font-orbitron text-nasa-accent">ORBITAL</span>
              </h1>
              <ContextLine />
            </div>
          )}
        </div>

        <div className="flex items-stretch gap-1.5">
          <TopBarButton
            label="Back"
            title="Back (Alt + ←)"
            ariaLabel="Return to the previous focused body"
            disabled={!canFocusBack}
            onClick={focusBack}
          >
            <path d="M10 19l-7-7 7-7v4h10a1 1 0 011 1v4a1 1 0 01-1 1H10v4z" />
          </TopBarButton>
          <TopBarButton
            label="Home"
            title="Home (H)"
            ariaLabel="Focus the Sun and reset the sidebar selection"
            onClick={focusHome}
          >
            <path d="M12 3l9 8h-3v10H6V11H3l9-8z" />
          </TopBarButton>
        </div>

        {/* Gear button + popover: relative wrapper anchors the popover
            via `absolute` positioning on desktop. Mobile popover uses
            `fixed` so it slides down as a sheet regardless of anchor. */}
        <div className="relative flex items-stretch">
          <TopBarButton
            label="Menu"
            title="Settings menu"
            ariaLabel={gearOpen ? "Close settings menu" : "Open settings menu"}
            onClick={() => setGearOpen(!gearOpen)}
            dataAttributes={{ "data-gear-trigger": "true" }}
            ariaExpanded={gearOpen}
          >
            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </TopBarButton>
          <GearPopover />
        </div>
      </div>
    </div>
  );
};

const TopBarButton = ({
  label,
  title,
  ariaLabel,
  disabled = false,
  onClick,
  children,
  dataAttributes,
  ariaExpanded,
}: {
  label: string;
  title: string;
  ariaLabel: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  dataAttributes?: Record<string, string>;
  ariaExpanded?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={ariaLabel}
    aria-expanded={ariaExpanded}
    {...(dataAttributes ?? {})}
    className="flex min-w-[3.6rem] flex-col items-center justify-center gap-1 border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[8px] font-orbitron uppercase tracking-[0.16em] text-nasa-accent transition-[border-color,color,background-color,box-shadow] hover:border-nasa-accent/40 hover:bg-nasa-accent/8 hover:text-white hover:shadow-[0_0_12px_rgba(0,240,255,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:text-nasa-accent touch-manipulation sm:min-w-[4rem]"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {children}
    </svg>
    <span>{label}</span>
  </button>
);
