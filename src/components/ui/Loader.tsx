import { useProgress } from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store";
import { useEffect, useState } from "react";

// Helper for random stars
const StarField = () => {
  // Generate static stars once
  const [stars] = useState(() =>
    Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.1,
      animDuration: Math.random() * 3 + 2,
    }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute bg-white rounded-full animate-pulse"
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            animationDuration: `${star.animDuration}s`,
          }}
        />
      ))}
    </div>
  );
};

// HUD Corner Brackets
const CornerBrackets = () => (
  <>
    {/* Top Left */}
    <div className="absolute top-8 left-8 w-16 h-16 border-t-2 border-l-2 border-cyan-500/30 rounded-tl-lg" />
    {/* Top Right */}
    <div className="absolute top-8 right-8 w-16 h-16 border-t-2 border-r-2 border-cyan-500/30 rounded-tr-lg" />
    {/* Bottom Left */}
    <div className="absolute bottom-8 left-8 w-16 h-16 border-b-2 border-l-2 border-cyan-500/30 rounded-bl-lg" />
    {/* Bottom Right */}
    <div className="absolute bottom-8 right-8 w-16 h-16 border-b-2 border-r-2 border-cyan-500/30 rounded-br-lg" />
  </>
);

// Technical Text Readouts
const TechReadout = () => (
  <div className="absolute inset-0 pointer-events-none font-mono text-[10px] text-cyan-500/40 tracking-widest select-none">
    {/* Top Left Data */}
    <div className="absolute top-12 left-12 flex flex-col gap-1">
      <span>SYS.INIT.SEQUENCE</span>
      <span>VER.2.4.0-ALPHA</span>
      <span>MEM_ALLOC: OK</span>
    </div>

    {/* Top Right Data */}
    <div className="absolute top-12 right-12 flex flex-col gap-1 text-right">
      <span>ORBITAL.MECHANICS</span>
      <span>PHYSICS_ENGINE: ACTIVE</span>
      <span>RENDER_CORE: V7</span>
    </div>

    {/* Bottom Left Data */}
    <div className="absolute bottom-12 left-12 flex flex-col gap-1">
      <span>COORDS: 45.22.11</span>
      <span>SECTOR: 7G-ALPHA</span>
    </div>

    {/* Bottom Right Data */}
    <div className="absolute bottom-12 right-12 flex flex-col gap-1 text-right">
      <span>EST.LATENCY: 12ms</span>
      <span>CONNECTION: SECURE</span>
    </div>
  </div>
);

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
          {/* 1. Deep Space Starfield */}
          <StarField />

          {/* 2. HUD Elements */}
          <CornerBrackets />
          <TechReadout />

          {/* 3. Subtle Grid Overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

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

            {/* Stylized Solar System Loader */}
            <div className="relative w-48 h-48 mb-12 flex items-center justify-center">
              {/* Sun */}
              <div className="absolute w-10 h-10 bg-gradient-to-br from-yellow-300 to-orange-500 rounded-full shadow-[0_0_40px_rgba(255,165,0,0.6)] animate-pulse z-10" />

              {/* Orbit 1: Mercury (Fast, Small, Gray) */}
              <div className="absolute w-16 h-16 border border-white/5 rounded-full animate-[spin_3s_linear_infinite]">
                <div className="absolute top-1/2 -right-1 w-1.5 h-1.5 bg-gray-300 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.8)]" />
              </div>

              {/* Orbit 2: Earth (Medium, Blue) */}
              <div className="absolute w-24 h-24 border border-white/10 rounded-full animate-[spin_5s_linear_infinite]">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2.5 h-2.5 bg-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              </div>

              {/* Orbit 3: Mars (Slow, Red) */}
              <div className="absolute w-32 h-32 border border-white/5 rounded-full animate-[spin_7s_linear_infinite]">
                <div className="absolute bottom-1/2 -left-1.5 w-2 h-2 bg-red-400 rounded-full shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
              </div>

              {/* Orbit 4: Jupiter (Very Slow, Large, Orange) */}
              <div className="absolute w-44 h-44 border border-white/5 rounded-full animate-[spin_12s_linear_infinite]">
                <div className="absolute bottom-0 right-1/4 w-4 h-4 bg-orange-300 rounded-full shadow-[0_0_10px_rgba(253,186,116,0.8)]" />
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
