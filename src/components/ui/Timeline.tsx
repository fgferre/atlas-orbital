import { useEffect, useRef, useState, useMemo } from "react";
import { useStore } from "../../store";

// Constants for time conversion
const SEC_PER_DAY = 86400;

// Helper to create step object
const createStep = (valueInSeconds: number, label: string) => ({
  value: valueInSeconds,
  label,
});

// Defined time steps
const TIME_STEPS = [
  createStep(3, "3 seconds/second"),
  createStep(5, "5 seconds/second"),
  createStep(6, "6 seconds/second"),
  createStep(8, "8 seconds/second"),
  createStep(10, "10 seconds/second"),
  createStep(20, "20 seconds/second"),
  createStep(30, "30 seconds/second"),
  createStep(40, "40 seconds/second"),
  createStep(50, "50 seconds/second"),
  createStep(60, "1 minute/second"),
  createStep(3 * 60, "3 minutes/second"),
  createStep(5 * 60, "5 minutes/second"),
  createStep(6 * 60, "6 minutes/second"),
  createStep(8 * 60, "8 minutes/second"),
  createStep(10 * 60, "10 minutes/second"),
  createStep(20 * 60, "20 minutes/second"),
  createStep(30 * 60, "30 minutes/second"),
  createStep(40 * 60, "40 minutes/second"),
  createStep(50 * 60, "50 minutes/second"),
  createStep(3600, "1 hour/second"),
  createStep(3 * 3600, "3 hours/second"),
  createStep(5 * 3600, "5 hours/second"),
  createStep(6 * 3600, "6 hours/second"),
  createStep(8 * 3600, "8 hours/second"),
  createStep(10 * 3600, "10 hours/second"),
  createStep(13 * 3600, "13 hours/second"),
  createStep(16 * 3600, "16 hours/second"),
  createStep(18 * 3600, "18 hours/second"),
  createStep(21 * 3600, "21 hours/second"),
  createStep(SEC_PER_DAY, "1 day/second"),
  createStep(2 * SEC_PER_DAY, "2 days/second"),
  createStep(3 * SEC_PER_DAY, "3 days/second"),
  createStep(5 * SEC_PER_DAY, "5 days/second"),
  createStep(6 * SEC_PER_DAY, "6 days/second"),
  createStep(7 * SEC_PER_DAY, "1 week/second"),
  createStep(3 * 7 * SEC_PER_DAY, "3 weeks/second"),
  createStep(30 * SEC_PER_DAY, "1 month/second"),
  createStep(2 * 30 * SEC_PER_DAY, "2 months/second"),
  createStep(4 * 30 * SEC_PER_DAY, "4 months/second"),
  createStep(6 * 30 * SEC_PER_DAY, "6 months/second"),
  createStep(8 * 30 * SEC_PER_DAY, "8 months/second"),
  createStep(10 * 30 * SEC_PER_DAY, "10 months/second"),
  createStep(365 * SEC_PER_DAY, "1 year/second"),
  createStep(2 * 365 * SEC_PER_DAY, "2 years/second"),
  createStep(3 * 365 * SEC_PER_DAY, "3 years/second"),
];

const NORMAL_SPEED = 1; // 1 second per second

export const Timeline = () => {
  const datetime = useStore((state) => state.datetime);
  const isPlaying = useStore((state) => state.isPlaying);
  const setIsPlaying = useStore((state) => state.setIsPlaying);
  const speed = useStore((state) => state.speed);
  const setSpeed = useStore((state) => state.setSpeed);
  const isLiveMode = useStore((state) => state.isLiveMode);
  const setLiveMode = useStore((state) => state.setLiveMode);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const requestRef = useRef<number | undefined>(undefined);
  const previousTimeRef = useRef<number | undefined>(undefined);

  // Calculate current step index based on speed
  const currentStepIndex = useMemo(() => {
    const absSpeed = Math.abs(speed);
    if (absSpeed < TIME_STEPS[0].value) return -1; // Less than min step (e.g. normal speed)

    // Find the closest step
    let closestIndex = 0;
    let minDiff = Math.abs(absSpeed - TIME_STEPS[0].value);

    for (let i = 1; i < TIME_STEPS.length; i++) {
      const diff = Math.abs(absSpeed - TIME_STEPS[i].value);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    return closestIndex;
  }, [speed]);

  // Derived state for slider
  // We map:
  // 0 -> Normal Speed (1 sec/sec)
  // 1 to N -> Forward steps
  // -1 to -N -> Backward steps
  const sliderValue = useMemo(() => {
    if (Math.abs(speed - NORMAL_SPEED) < 1e-10) return 0; // Normal speed
    if (Math.abs(speed + NORMAL_SPEED) < 1e-10) return 0; // Negative normal speed (treat as 0 for simplicity or handle separately?)
    // Actually user wants back/fwd. Let's say 0 is normal.
    // Positive steps: 1 to 45
    // Negative steps: -1 to -45

    if (currentStepIndex === -1) return 0; // Fallback for normal-ish speeds

    return speed > 0 ? currentStepIndex + 1 : -(currentStepIndex + 1);
  }, [speed, currentStepIndex]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLiveMode(false);
    const val = parseInt(e.target.value);
    if (val === 0) {
      setSpeed(NORMAL_SPEED);
    } else {
      const index = Math.abs(val) - 1;
      const step = TIME_STEPS[index];
      setSpeed(val > 0 ? step.value : -step.value);
    }
  };

  const handleForward = () => {
    setLiveMode(false);
    if (speed < 0) {
      // If going backward, reduce speed magnitude or go to normal
      if (currentStepIndex === 0) {
        setSpeed(NORMAL_SPEED);
      } else if (currentStepIndex > 0) {
        // Reduce backward speed
        const newIndex = currentStepIndex - 1;
        setSpeed(-TIME_STEPS[newIndex].value);
      } else {
        // Was at normal or weird speed, go to first step forward
        setSpeed(TIME_STEPS[0].value);
      }
    } else {
      // Going forward
      if (Math.abs(speed - NORMAL_SPEED) < 1e-10 || currentStepIndex === -1) {
        setSpeed(TIME_STEPS[0].value);
      } else if (currentStepIndex < TIME_STEPS.length - 1) {
        setSpeed(TIME_STEPS[currentStepIndex + 1].value);
      }
    }
  };

  const handleRewind = () => {
    setLiveMode(false);
    if (speed > 0) {
      // If going forward, reduce speed or go to normal
      if (currentStepIndex === 0) {
        setSpeed(NORMAL_SPEED); // Or maybe negative normal? Let's stick to positive normal as "stop/reset" point
      } else if (currentStepIndex > 0) {
        const newIndex = currentStepIndex - 1;
        setSpeed(TIME_STEPS[newIndex].value);
      } else {
        // Was at normal, go to first step backward
        setSpeed(-TIME_STEPS[0].value);
      }
    } else {
      // Going backward
      if (Math.abs(speed - NORMAL_SPEED) < 1e-10 || currentStepIndex === -1) {
        // Check if it was normal speed
        setSpeed(-TIME_STEPS[0].value);
      } else if (currentStepIndex < TIME_STEPS.length - 1) {
        setSpeed(-TIME_STEPS[currentStepIndex + 1].value);
      }
    }
  };

  const handleNormalTime = () => {
    setLiveMode(false);
    setSpeed(NORMAL_SPEED);
    setIsPlaying(true);
  };

  const animate = (time: number) => {
    if (previousTimeRef.current !== undefined) {
      const deltaTime = time - previousTimeRef.current;
      if (useStore.getState().isLiveMode) {
        useStore.getState().setDatetime(new Date());
      } else if (useStore.getState().isPlaying) {
        useStore
          .getState()
          .setDatetime(
            (prev) =>
              new Date(prev.getTime() + useStore.getState().speed * deltaTime)
          );
      }
    }
    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current !== undefined) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  const currentLabel = useMemo(() => {
    if (Math.abs(speed - NORMAL_SPEED) < 1e-10) return "1 second/second";
    if (speed === 0) return "PAUSED";
    if (currentStepIndex !== -1) {
      return TIME_STEPS[currentStepIndex].label;
    }
    return "Custom Speed";
  }, [speed, currentStepIndex]);

  const handleLiveMode = () => {
    setLiveMode(true);
    setSpeed(NORMAL_SPEED);
    setIsPlaying(true);
  };

  return (
    <div
      className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center z-30 pointer-events-auto tech-transition"
      data-tutorial-target="timeline"
    >
      {/* Collapse Toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="mb-2 text-nasa-accent hover:text-white transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-6 w-6 transition-transform duration-500 ${isCollapsed ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <div
        className={`tech-panel px-8 py-4 flex flex-col items-center gap-4 tech-transition overflow-hidden ${
          isCollapsed ? "w-0 h-0 opacity-0 p-0" : "w-auto h-auto opacity-100"
        }`}
      >
        {/* Decorative HUD Elements */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-nasa-accent/50"></div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-20 h-1 bg-nasa-accent/30"></div>

        <div className="flex items-center gap-8 w-full justify-between">
          {/* Date & Time Display */}
          <div className="flex flex-col items-end w-48">
            <span className="text-xl font-orbitron text-white tracking-widest tabular-nums">
              {datetime.toLocaleTimeString(undefined, { hour12: false })}
            </span>
            <span className="text-[10px] text-nasa-dim uppercase tracking-[0.2em] font-rajdhani">
              {datetime
                .toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
                .toUpperCase()}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            {/* Rewind */}
            <button
              onClick={handleRewind}
              className="text-nasa-dim hover:text-nasa-accent transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M11 19l-9-7 9-7v14zM20 19l-9-7 9-7v14z" />
              </svg>
            </button>

            {/* Play/Pause */}
            <button
              onClick={() => {
                setLiveMode(false);
                setIsPlaying(!isPlaying);
              }}
              className={`w-14 h-14 border-2 flex items-center justify-center transition-all shadow-[0_0_20px_rgba(0,0,0,0.5)] ${
                isPlaying
                  ? "border-nasa-accent bg-nasa-accent/10 shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                  : "border-nasa-alert bg-nasa-alert/10 shadow-[0_0_15px_rgba(255,157,0,0.3)]"
              }`}
            >
              {isPlaying ? (
                <div className="flex gap-1">
                  <div className="w-1.5 h-5 bg-nasa-accent rounded-sm"></div>
                  <div className="w-1.5 h-5 bg-nasa-accent rounded-sm"></div>
                </div>
              ) : (
                <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-nasa-alert border-b-[8px] border-b-transparent ml-1"></div>
              )}
            </button>

            {/* Forward */}
            <button
              onClick={handleForward}
              className="text-nasa-dim hover:text-nasa-accent transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M13 19l9-7-9-7v14zM4 19l9-7-9-7v14z" />
              </svg>
            </button>
          </div>

          {/* Speed Display */}
          <div className="flex flex-col items-start w-48">
            <div className="flex items-center gap-2">
              <span className="text-sm font-orbitron text-white tracking-widest tabular-nums">
                {speed < 0 ? "-" : ""}
                {currentLabel}
              </span>
            </div>
            <span className="text-[10px] text-nasa-dim uppercase tracking-[0.2em] font-rajdhani">
              RATE
            </span>
          </div>
        </div>

        {/* Slider and Normal Button */}
        <div className="flex items-center gap-4 w-full px-4">
          <div className="flex gap-2">
            <button
              onClick={handleLiveMode}
              className={`text-[10px] font-orbitron border px-2 py-1 transition-colors whitespace-nowrap flex items-center gap-2 ${
                isLiveMode
                  ? "text-green-400 border-green-400/50 bg-green-400/10"
                  : "text-nasa-accent border-nasa-accent/50 hover:bg-nasa-accent/20"
              }`}
            >
              {isLiveMode && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
              )}
              LIVE MODE
            </button>
            <button
              onClick={handleNormalTime}
              className="text-[10px] font-orbitron text-nasa-accent border border-nasa-accent/50 px-2 py-1 hover:bg-nasa-accent/20 transition-colors whitespace-nowrap"
            >
              NORMAL RATE
            </button>
          </div>
          <input
            type="range"
            min={-TIME_STEPS.length}
            max={TIME_STEPS.length}
            step={1}
            value={sliderValue}
            onChange={handleSliderChange}
            className="w-full h-1 bg-nasa-dim/30 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-nasa-accent [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,240,255,0.8)]"
          />
        </div>
      </div>

      {/* Time Display when collapsed */}
      {isCollapsed && (
        <div className="tech-panel px-4 py-2 mt-2 animate-fade-in">
          <span className="text-sm font-orbitron text-nasa-accent tracking-widest">
            {datetime.toLocaleDateString().toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
};
