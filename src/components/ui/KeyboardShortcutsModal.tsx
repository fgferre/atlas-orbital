import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useStore } from "../../store";

interface ShortcutRow {
  keys: string;
  action: string;
}

const SHORTCUTS: ShortcutRow[] = [
  // Menu structure v3.1 §5.6 + Codex PR 3 review: surface both
  // bindings the handler accepts — Ctrl+K is the AAA-standard
  // command-palette accelerator that power users reach for first.
  { keys: "/ or Ctrl + K", action: "Focus Search" },
  { keys: "H", action: "Focus home (Sun)" },
  { keys: "Alt + ←", action: "Focus back" },
  { keys: "Ctrl + Shift + T", action: "Replay tutorial" },
  { keys: "?", action: "Open this reference" },
];

/**
 * KeyboardShortcutsModal — lightweight modal listing the global
 * hotkeys. Triggered by the `?` hotkey (handled in Overlay) or from
 * Gear > Help > Keyboard Shortcuts.
 *
 * Menu structure v3.1 §5.6.
 */
export const KeyboardShortcutsModal = () => {
  const open = useStore((s) => s.shortcutsModalOpen);
  const setOpen = useStore((s) => s.setShortcutsModalOpen);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useDialogFocus({
    isOpen: open,
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    onClose: () => setOpen(false),
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[98] bg-black/60 backdrop-blur-sm pointer-events-auto"
            onPointerDown={() => setOpen(false)}
          />
          <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="atlas-shortcuts-title"
              data-testid="keyboard-shortcuts-modal"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="tech-panel pointer-events-auto relative w-full max-w-md p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] focus:outline-none"
              tabIndex={-1}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2
                    id="atlas-shortcuts-title"
                    className="text-lg font-orbitron uppercase tracking-[0.18em] text-white"
                  >
                    Keyboard Shortcuts
                  </h2>
                  <div className="mt-1 text-[10px] font-rajdhani uppercase tracking-[0.2em] text-white/45">
                    press ? any time
                  </div>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close keyboard shortcuts"
                  className="rounded border border-white/10 px-2 py-1 text-[10px] font-orbitron uppercase tracking-[0.16em] text-white/70 transition-colors hover:border-nasa-accent hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent"
                >
                  Close
                </button>
              </div>
              <ul className="space-y-2">
                {SHORTCUTS.map((row) => (
                  <li
                    key={row.keys}
                    className="flex items-center justify-between gap-3 border border-white/5 bg-black/20 px-3 py-2"
                  >
                    <span className="text-sm text-white">{row.action}</span>
                    <kbd className="border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-orbitron uppercase tracking-[0.16em] text-nasa-accent">
                      {row.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
