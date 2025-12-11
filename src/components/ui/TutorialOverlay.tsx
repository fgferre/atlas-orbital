import { useEffect } from "react";
import { useStore } from "../../store";
import { motion, AnimatePresence } from "framer-motion";
import { TutorialHighlight } from "./TutorialHighlight";

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
        A scientifically accurate 3D journey through our solar system. Explore
        planets, moons, and stars in high fidelity.
      </p>
    ),
    target: null,
  },
  {
    title: "Navigation",
    content: (
      <ul className="space-y-1">
        <li>• Left Click + Drag to Rotate</li>
        <li>• Right Click + Drag to Pan</li>
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
        Click the magnifying glass icon (top right) to search for any celestial
        body. Results limited to 5 matches.
      </p>
    ),
    target: "search",
  },
  {
    title: "Display Settings",
    content: (
      <>
        <p className="mb-2">
          Click the gear icon (top right) to open Settings:
        </p>
        <ul className="space-y-1">
          <li>• Didactic Mode: Enhanced visibility for learning</li>
          <li>• Realistic Mode: True-to-scale proportions</li>
          <li>• Toggle Icons, Labels, Orbits, Starfield</li>
          <li>• Filter by category (Planets, Moons, Dwarfs, etc.)</li>
        </ul>
      </>
    ),
    target: "settings",
  },
  {
    title: "Time Control",
    content: (
      <>
        <p className="mb-2">
          The Timeline at the bottom controls simulation time:
        </p>
        <ul className="space-y-1">
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
        <li>• Press Ctrl+Shift+D for Debug Mode</li>
        <li>• Press Ctrl+Shift+T to Replay Tutorial</li>
        <li>
          • Switch Starfield Source between Tycho-2 and NASA Eyes catalogs
        </li>
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

  // Effective visibility: show tutorial only when not animating
  const isTutorialVisible = showTutorial && !isIntroAnimating;

  // Keyboard shortcut to reopen tutorial
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
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
            {/* Dimmer Layer - only when no spotlight target (z-98) */}
            {!currentStep.target && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[98] bg-black/60 backdrop-blur-sm pointer-events-auto"
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
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="tech-panel p-8 max-w-lg w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden pointer-events-auto"
              >
                {/* Background decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-nasa-accent to-transparent" />

                <div className="flex justify-between items-start mb-6">
                  <h2 className="text-2xl font-orbitron font-bold text-white tracking-wider">
                    {currentStep.title}
                  </h2>
                  <button
                    onClick={() => closeTutorial("skipped")}
                    className="text-white/50 hover:text-white transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
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
                        className="px-6 py-2 border border-white/20 text-white hover:bg-white/10 transition-colors font-rajdhani uppercase tracking-wider text-sm"
                      >
                        Previous
                      </button>
                    )}
                    <button
                      onClick={handleNext}
                      className="px-8 py-2 bg-nasa-accent text-black font-bold hover:bg-cyan-300 transition-colors font-rajdhani uppercase tracking-wider text-sm"
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
