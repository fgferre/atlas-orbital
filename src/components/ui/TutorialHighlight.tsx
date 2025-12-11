import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TutorialHighlightProps {
  target: string | null;
  isActive: boolean;
}

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Visual highlight component that draws attention to UI elements during tutorial.
 * Dynamically queries the DOM for elements with data-tutorial-target attribute
 * and calculates position using getBoundingClientRect().
 */
export const TutorialHighlight = ({
  target,
  isActive,
}: TutorialHighlightProps) => {
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  // Function to find and measure target element
  const updateTargetRect = useCallback(() => {
    if (!target) {
      setTargetRect(null);
      return;
    }

    const element = document.querySelector(
      `[data-tutorial-target="${target}"]`
    );
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    } else {
      setTargetRect(null);
    }
  }, [target]);

  // Update position on mount, target change, and resize
  // Only run when tutorial is active AND has a target
  useEffect(() => {
    // Skip polling when tutorial is inactive or no target
    if (!isActive || !target) {
      setTargetRect(null);
      return;
    }

    updateTargetRect();

    // Update on resize
    const handleResize = () => updateTargetRect();
    window.addEventListener("resize", handleResize);

    // Also update periodically for elements that may animate/move
    const interval = setInterval(updateTargetRect, 500);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearInterval(interval);
    };
  }, [updateTargetRect, isActive, target]);

  const shouldRender = isActive && target && targetRect;
  const padding = 8; // Padding around the highlight

  return (
    <AnimatePresence>
      {shouldRender && (
        <>
          {/* SVG Spotlight/Cutout Overlay - positioned below modal z-index */}
          <motion.svg
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 w-full h-full z-[97] pointer-events-none"
            style={{ mixBlendMode: "normal" }}
          >
            <defs>
              <mask id="spotlight-mask">
                {/* White = visible, Black = cutout */}
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {/* Cutout rect for the target element */}
                <motion.rect
                  initial={{ opacity: 0 }}
                  animate={{
                    x: targetRect.x - padding,
                    y: targetRect.y - padding,
                    width: targetRect.width + padding * 2,
                    height: targetRect.height + padding * 2,
                    opacity: 1,
                  }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  fill="black"
                  rx="4"
                />
              </mask>
            </defs>
            {/* Semi-transparent overlay with cutout */}
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.6)"
              mask="url(#spotlight-mask)"
            />
          </motion.svg>

          {/* Highlight Border around target */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: 1,
              scale: 1,
              x: targetRect.x - padding,
              y: targetRect.y - padding,
            }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-[99] pointer-events-none"
            style={{
              width: targetRect.width + padding * 2,
              height: targetRect.height + padding * 2,
              left: 0,
              top: 0,
            }}
          >
            {/* Glowing border */}
            <div
              className="absolute inset-0 border-2 border-cyan-400 rounded"
              style={{
                boxShadow:
                  "0 0 20px rgba(0, 240, 255, 0.6), inset 0 0 20px rgba(0, 240, 255, 0.1)",
              }}
            />

            {/* Animated corner markers */}
            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-cyan-400" />
            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-cyan-400" />
            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-cyan-400" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-cyan-400" />

            {/* Pulse animation overlay */}
            <motion.div
              animate={{
                opacity: [0.5, 0.2, 0.5],
                scale: [1, 1.02, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-0 border border-cyan-400/50 rounded"
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
