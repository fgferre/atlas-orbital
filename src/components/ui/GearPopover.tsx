import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useStore } from "../../store";

export const GEAR_TRIGGER_SELECTOR = "[data-gear-trigger]";

/**
 * GearPopover — lightweight dropdown (desktop) or sheet (mobile)
 * anchored to the TopBar `[⚙]` button. Carries meta affordances that
 * are session-infrequent: Help, About, Developer.
 *
 * Menu structure v3.1 §4.7 contract:
 * - Not a full-screen modal. Mission Report launches the existing
 *   `CreditsModal` as its own focus-trap modal; doing that requires
 *   closing the popover FIRST so we never have modal-inside-popover
 *   focus stacking (Codex PR 2 review).
 * - Click outside the popover (and outside the gear trigger) dismisses.
 * - Mobile: sheet slides from top, capped at ~60 % viewport height.
 */
export const GearPopover = () => {
  const gearOpen = useStore((s) => s.gearOpen);
  const setGearOpen = useStore((s) => s.setGearOpen);
  const setShortcutsModalOpen = useStore((s) => s.setShortcutsModalOpen);
  const reopenTutorial = useStore((s) => s.reopenTutorial);
  const toggleCredits = useStore((s) => s.toggleCredits);
  const debugMode = useStore((s) => s.debugMode);
  const toggleDebugMode = useStore((s) => s.toggleDebugMode);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");

  useDialogFocus({
    isOpen: gearOpen && isMobile,
    containerRef,
    initialFocusRef: closeButtonRef,
    onClose: () => setGearOpen(false),
  });

  useEffect(() => {
    if (!gearOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(GEAR_TRIGGER_SELECTOR)
      ) {
        return;
      }
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setGearOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [gearOpen, setGearOpen]);

  const handleReplayTutorial = () => {
    setGearOpen(false);
    reopenTutorial();
  };

  const handleOpenShortcuts = () => {
    setGearOpen(false);
    setShortcutsModalOpen(true);
  };

  const handleMissionReport = () => {
    // Close first; CreditsModal opens as its own focus-trap.
    setGearOpen(false);
    toggleCredits();
  };

  const shellClassName = isMobile
    ? "fixed left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(env(safe-area-inset-top)+4.5rem)] z-[55] max-h-[60vh] overflow-y-auto"
    : "absolute top-[calc(100%+0.5rem)] right-0 z-[55] w-[min(18rem,calc(100vw-1.5rem))] max-h-[min(70vh,28rem)] overflow-y-auto";

  return (
    <AnimatePresence initial={false}>
      {gearOpen && (
        <motion.div
          ref={containerRef}
          // Menu structure v3.1 §4.7 + Codex PR 3 review: `role="dialog"`
          // on both breakpoints. `role="menu"` would contract for
          // menuitem children + arrow-key roving focus, which we don't
          // implement — a11y would be told "menu" but get dialog-like
          // tab navigation. `aria-modal` flips true only on the mobile
          // sheet where the popover covers its origin.
          role="dialog"
          aria-modal={isMobile ? true : undefined}
          aria-label="Settings menu"
          data-testid="gear-popover"
          className={shellClassName}
          initial={{ opacity: 0, y: isMobile ? -16 : -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: isMobile ? -16 : -8, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="command-shell ghost-border tech-corners panel-scan flex flex-col gap-3 p-4 shadow-[0_0_30px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
              <div className="min-w-0">
                <div className="text-sm font-orbitron uppercase tracking-[0.18em] text-nasa-accent">
                  Settings
                </div>
                <div className="mt-1 text-[10px] font-rajdhani uppercase tracking-[0.2em] text-white/45">
                  help · about · developer
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setGearOpen(false)}
                aria-label="Close settings menu"
                className="rounded border border-white/10 px-2 py-1 text-[10px] font-orbitron uppercase tracking-[0.16em] text-white/70 transition-colors hover:border-nasa-accent hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent"
              >
                Close
              </button>
            </div>

            <GearSection label="Help">
              <GearButton onClick={handleReplayTutorial}>
                <span>Replay Tutorial</span>
                <span className="text-[9px] text-white/45 normal-case tracking-normal">
                  Ctrl+Shift+T
                </span>
              </GearButton>
              <GearButton onClick={handleOpenShortcuts}>
                <span>Keyboard Shortcuts</span>
                <span className="text-[9px] text-white/45 normal-case tracking-normal">
                  ?
                </span>
              </GearButton>
            </GearSection>

            <GearSection label="About">
              <GearButton onClick={handleMissionReport}>
                Mission Report
              </GearButton>
              <div className="px-1 text-[10px] text-white/45">
                v0.1.0 — Atlas Orbital
              </div>
            </GearSection>

            <GearSection label="Developer">
              <button
                type="button"
                role="switch"
                aria-checked={debugMode}
                onClick={toggleDebugMode}
                className="flex w-full items-center justify-between gap-3 border border-white/10 bg-black/20 px-3 py-2.5 text-left transition-[border-color,color,background-color] hover:border-white/20 hover:bg-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
              >
                <span className="text-sm text-white">Debug Logging</span>
                <span className="text-[10px] font-orbitron uppercase tracking-[0.16em] text-white/55">
                  {debugMode ? "On" : "Off"}
                </span>
              </button>
              <div className="px-1 text-[10px] text-white/45">
                Orbital engine + overlay counters — console only.
              </div>
            </GearSection>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const GearSection = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <section className="space-y-2">
    <div className="border-b border-nasa-accent/20 pb-1 text-[10px] font-orbitron uppercase tracking-[0.22em] text-nasa-accent">
      {label}
    </div>
    {children}
  </section>
);

const GearButton = ({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center justify-between gap-3 border border-white/10 px-3 py-2.5 text-left text-[11px] font-orbitron uppercase tracking-[0.16em] text-white transition-[border-color,color,background-color] hover:border-nasa-accent hover:text-nasa-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
  >
    {children}
  </button>
);
