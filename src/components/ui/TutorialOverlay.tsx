import { useStore } from "../../store";
import { motion, AnimatePresence } from "framer-motion";

const TUTORIAL_STEPS = [
  {
    title: "Welcome to Atlas Orbital",
    content:
      "A scientifically accurate 3D journey through our solar system. Explore planets, moons, and stars in high fidelity.",
    target: null, // Center screen
  },
  {
    title: "Navigation",
    content:
      "• Left Click + Drag to Rotate\n• Right Click + Drag to Pan\n• Scroll to Zoom In/Out",
    target: null,
  },
  {
    title: "Interaction",
    content:
      "Click on any planet or moon to focus on it. Hover over objects to see their names and details.",
    target: null,
  },
  {
    title: "Search",
    content:
      "Use the search bar in the top right to quickly find any celestial body by name.",
    target: "top-right",
  },
  {
    title: "Simulation Modes",
    content:
      "Switch between 'Didactic' (enhanced visibility) and 'Realistic' (true-to-scale) modes in the settings.",
    target: "bottom-right",
  },
  {
    title: "Settings & Controls",
    content:
      "Use the bottom bar to control time speed, toggle orbits, labels, and customize your view.",
    target: "bottom-center",
  },
];

export const TutorialOverlay = () => {
  const showTutorial = useStore((state) => state.showTutorial);
  const tutorialStep = useStore((state) => state.tutorialStep);
  const closeTutorial = useStore((state) => state.closeTutorial);
  const setTutorialStep = useStore((state) => state.setTutorialStep);

  if (!showTutorial) return null;

  const currentStep = TUTORIAL_STEPS[tutorialStep];
  const isLastStep = tutorialStep === TUTORIAL_STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      closeTutorial();
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
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          key={tutorialStep}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="tech-panel p-8 max-w-lg w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden"
        >
          {/* Background decoration */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-nasa-accent to-transparent" />

          <div className="flex justify-between items-start mb-6">
            <h2 className="text-2xl font-orbitron font-bold text-white tracking-wider">
              {currentStep.title}
            </h2>
            <button
              onClick={closeTutorial}
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
                    index === tutorialStep ? "bg-nasa-accent" : "bg-white/20"
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
      </motion.div>
    </AnimatePresence>
  );
};
