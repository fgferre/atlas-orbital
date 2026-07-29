import { useEffect, useRef } from "react";
import { useStore } from "../../store";
import { motion, AnimatePresence } from "framer-motion";
import { STARFIELD_SOURCE_LABELS } from "../../lib/starfield";
import { TutorialHighlight } from "./TutorialHighlight";
import { useDialogFocus } from "../../hooks/useDialogFocus";

import type { ReactNode } from "react";

interface TutorialStep {
  title: string;
  content: ReactNode;
  target: string | null;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "Welcome to Atlas Orbital",
    content: (
      <p>
        A data-informed 3D journey through our solar system. Explore planets,
        moons, and stars in high fidelity.
      </p>
    ),
    target: null,
  },
  {
    title: "Navigation",
    content: (
      <ul className="space-y-1">
        <li>• Left Click + Drag to Rotate</li>
        <li>• Right Click or Middle Click + Drag to Move the View</li>
        <li>• Scroll to Zoom In/Out</li>
      </ul>
    ),
    target: null,
  },
  {
    title: "Interaction",
    content: (
      <p>
        Click on any planet or moon to focus on it. Hover over objects to see
        their names.
      </p>
    ),
    target: null,
  },
  {
    title: "Info Panel",
    content: (
      <>
        <p className="mb-2">
          When you select an object, the Info Panel appears on the left with:
        </p>
        <ul className="space-y-1">
          <li>• Real-time telemetry (speed, distance)</li>
          <li>• Physical data with Earth comparisons</li>
          <li>• Exploration milestones &amp; fun facts</li>
        </ul>
      </>
    ),
    target: "info-panel",
  },
  {
    title: "Search",
    content: (
      <p>
        Pull the Search drawer from the edge tabs to find bodies by English or
        Portuguese name, type, or classification.
      </p>
    ),
    target: "search",
  },
  {
    title: "Control Stack",
    content: (
      <>
        <p className="mb-2">
          Use the edge drawer tabs to keep every major tool one click away:
        </p>
        <ul className="space-y-1">
          <li>
            • View — bodies, guides, starfield ({STARFIELD_SOURCE_LABELS.hyg}),
            and scale mode
          </li>
          <li>• Display — graphics quality and per-feature tuning</li>
          <li>• Access — motion and UI scale</li>
        </ul>
        <p className="mt-2">
          Session tools sit behind the gear button instead of the rail: Replay
          Tutorial and Keyboard Shortcuts under Help, Mission Report under
          About, and the Developer toggle.
        </p>
      </>
    ),
    target: "settings",
  },
  {
    title: "Time Control",
    content: (
      <>
        <p className="mb-2">
          The floating time cluster controls simulation time:
        </p>
        <ul className="space-y-1">
          <li>
            • Keep it collapsed for a cleaner viewport or expand the sheet
          </li>
          <li>• Play/Pause the simulation</li>
          <li>• Rewind/Forward through time</li>
          <li>• LIVE MODE syncs with real-world time</li>
          <li>• Speed ranges from 3 sec/s to 3 years/s</li>
        </ul>
      </>
    ),
    target: "timeline",
  },
  {
    title: "Pro Tips",
    content: (
      <ul className="space-y-1">
        <li>• Press Ctrl+Shift+T to Replay Tutorial</li>
        <li>• Hover a star to read its catalog entry; click to fly to it</li>
      </ul>
    ),
    target: null,
  },
];

export const TutorialOverlay = () => {
  const showTutorial = useStore((state) => state.showTutorial);
  const isIntroAnimating = useStore((state) => state.isIntroAnimating);
  const tutorialStep = useStore((state) => state.tutorialStep);
  const closeTutorial = useStore((state) => state.closeTutorial);
  const completeTutorial = useStore((state) => state.completeTutorial);
  const reopenTutorial = useStore((state) => state.reopenTutorial);
  const setTutorialStep = useStore((state) => state.setTutorialStep);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Effective visibility: show tutorial only when not animating
  const isTutorialVisible = showTutorial && !isIntroAnimating;

  useDialogFocus({
    isOpen: isTutorialVisible,
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    onClose: () => closeTutorial("skipped"),
  });

  // Keyboard shortcut to reopen tutorial
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
        // Same anti-stacking guard `Overlay` applies to `?`: reopening the
        // tutorial over an already-open modal would arm a second
        // document-level focus trap on top of the first.
        const s = useStore.getState();
        if (s.showCredits || s.gearOpen || s.shortcutsModalOpen) return;
        e.preventDefault();
        reopenTutorial();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reopenTutorial]);

  const currentStep = TUTORIAL_STEPS[tutorialStep];
  const isLastStep = tutorialStep === TUTORIAL_STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      completeTutorial(); // Use completeTutorial to also deselect Sun
    } else {
      setTutorialStep(tutorialStep + 1);
    }
  };

  const handlePrev = () => {
    if (tutorialStep > 0) {
      setTutorialStep(tutorialStep - 1);
    }
  };

  return (
    <>
      <TutorialHighlight
        target={isTutorialVisible ? currentStep.target : null}
        isActive={isTutorialVisible}
      />

      <AnimatePresence>
        {isTutorialVisible && (
          <>
            {/* Dimmer Layer - only when no spotlight target (z-98).
                Was `bg-black/60 backdrop-blur-sm`, which put the first-run
                experience behind a blur: eight modal steps describing a
                solar system the reader could not see. The whole promise of
                the app is on the other side of this layer. Dropped to a
                plain 35 % scrim — enough separation for the card to read,
                light enough that the scene stays legible while the copy
                talks about it. */}
            {!currentStep.target && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[98] bg-black/35 pointer-events-auto"
              />
            )}
            {/* Click blocker for when spotlight is active */}
            {currentStep.target && (
              <div className="fixed inset-0 z-[98] pointer-events-auto" />
            )}

            {/* Modal Layer - z-100 */}
            <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
              <motion.div
                key={tutorialStep}
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="atlas-tutorial-title"
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="tech-panel pointer-events-auto relative w-full max-w-lg overflow-hidden p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] focus:outline-none"
                tabIndex={-1}
              >
                {/* Background decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-nasa-accent to-transparent" />

                <div className="flex justify-between items-start mb-6">
                  <h2
                    id="atlas-tutorial-title"
                    className="text-2xl font-orbitron font-bold text-white tracking-wider"
                  >
                    {currentStep.title}
                  </h2>
                  <button
                    ref={closeButtonRef}
                    onClick={() => closeTutorial("skipped")}
                    aria-label="Skip tutorial"
                    className="text-white/50 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="text-gray-300 font-rajdhani text-lg leading-relaxed mb-8 whitespace-pre-line">
                  {currentStep.content}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {TUTORIAL_STEPS.map((_, index) => (
                      <div
                        key={index}
                        className={`w-2 h-2 transition-colors ${
                          index === tutorialStep
                            ? "bg-nasa-accent"
                            : "bg-white/20"
                        }`}
                      />
                    ))}
                  </div>

                  <div className="flex gap-4">
                    {tutorialStep > 0 && (
                      <button
                        onClick={handlePrev}
                        className="px-6 py-2 border border-white/20 text-white hover:bg-white/10 transition-colors font-rajdhani uppercase tracking-wider text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent"
                      >
                        Previous
                      </button>
                    )}
                    <button
                      onClick={handleNext}
                      className="px-8 py-2 bg-nasa-accent text-black font-bold hover:bg-cyan-300 transition-colors font-rajdhani uppercase tracking-wider text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent"
                    >
                      {isLastStep ? "Start Journey" : "Next"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
