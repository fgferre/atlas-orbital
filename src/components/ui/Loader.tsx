import { useProgress } from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store";
import { useEffect, useState } from "react";

export const Loader = () => {
  const { progress, active } = useProgress();
  const isSceneReady = useStore((state) => state.isSceneReady);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Only hide when assets are loaded AND scene has rendered frames
    if (!active && isSceneReady && progress === 100) {
      // Small buffer to ensure smooth transition
      const timer = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(timer);
    }
  }, [active, isSceneReady, progress]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1, ease: "easeInOut" } }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-white overflow-hidden"
          style={{
            background:
              "radial-gradient(circle at center, #1a1a2e 0%, #000000 100%)",
          }}
        >
          {/* Background Stars Effect (CSS based) */}
          <div className="absolute inset-0 opacity-50">
            <div
              className="absolute top-1/4 left-1/4 w-1 h-1 bg-white rounded-full animate-pulse"
              style={{ animationDuration: "3s" }}
            />
            <div
              className="absolute top-3/4 left-1/3 w-1 h-1 bg-blue-300 rounded-full animate-pulse"
              style={{ animationDuration: "4s" }}
            />
            <div
              className="absolute top-1/2 left-3/4 w-1 h-1 bg-cyan-300 rounded-full animate-pulse"
              style={{ animationDuration: "2s" }}
            />
            {/* Add more subtle stars as needed or use a background image */}
          </div>

          {/* Main Content Container */}
          <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-4xl px-4">
            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="text-4xl md:text-6xl font-light tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 mb-12 text-center font-sans"
            >
              ATLAS ORBITAL
            </motion.h1>

            {/* Orbital Loader Animation */}
            <div className="relative w-32 h-32 md:w-48 md:h-48 mb-12">
              {/* Inner Core */}
              <div className="absolute inset-0 m-auto w-4 h-4 bg-cyan-400 rounded-full shadow-[0_0_20px_rgba(34,211,238,0.8)] animate-pulse" />

              {/* Ring 1 */}
              <div
                className="absolute inset-0 border border-cyan-500/30 rounded-full"
                style={{
                  animation: "spin 4s linear infinite",
                  borderTopColor: "transparent",
                  borderLeftColor: "transparent",
                }}
              />
              {/* Ring 2 (Counter-rotating) */}
              <div
                className="absolute inset-2 border border-blue-500/30 rounded-full"
                style={{
                  animation: "spin-reverse 6s linear infinite",
                  borderBottomColor: "transparent",
                  borderRightColor: "transparent",
                }}
              />
              {/* Ring 3 */}
              <div
                className="absolute inset-6 border border-white/10 rounded-full"
                style={{
                  animation: "spin 8s linear infinite",
                }}
              />

              {/* Orbiting Planet */}
              <div className="absolute inset-0 animate-[spin_3s_linear_infinite]">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_white]" />
              </div>
            </div>

            {/* Progress Section */}
            <div className="w-full max-w-md space-y-2">
              <div className="flex justify-between text-xs uppercase tracking-widest text-cyan-400/80">
                <span>Initializing Simulation</span>
                <span>{progress.toFixed(0)}%</span>
              </div>

              {/* Progress Bar Container */}
              <div className="w-full h-[2px] bg-white/10 relative overflow-hidden">
                {/* Progress Bar Fill */}
                <motion.div
                  className="absolute top-0 left-0 h-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.1, ease: "easeOut" }}
                />
              </div>

              <div className="text-center mt-4">
                <span className="text-[10px] text-white/30 tracking-widest">
                  LOADING ASSETS
                </span>
              </div>
            </div>
          </div>

          {/* Global Styles for Animations */}
          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            @keyframes spin-reverse {
              from { transform: rotate(360deg); }
              to { transform: rotate(0deg); }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
