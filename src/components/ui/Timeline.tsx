import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";

export const Timeline = () => {
  const { datetime, isPlaying, setIsPlaying, speed, setSpeed } = useStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const requestRef = useRef<number | undefined>(undefined);
  const previousTimeRef = useRef<number | undefined>(undefined);

  const animate = (time: number) => {
    if (previousTimeRef.current !== undefined) {
      const deltaTime = time - previousTimeRef.current;
      if (useStore.getState().isPlaying) {
        useStore
          .getState()
          .setDatetime(
            (prev) =>
              new Date(
                prev.getTime() +
                  ((useStore.getState().speed * deltaTime) / 1000) * 86400000
              )
          );
      }
    }
    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, []);

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center z-30 pointer-events-auto transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)">
      {/* Collapse Toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="mb-2 text-nasa-accent hover:text-white transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-6 w-6 transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`}
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
        className={`glass-panel px-8 py-4 rounded-full flex items-center gap-8 transition-all duration-500 ease-in-out overflow-hidden ${
          isCollapsed ? "w-0 h-0 opacity-0 p-0" : "w-auto h-auto opacity-100"
        }`}
      >
        {/* Decorative HUD Elements */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-nasa-accent/50"></div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-20 h-1 bg-nasa-accent/30"></div>

        {/* Date & Time Display */}
        <div className="flex flex-col items-end min-w-[120px]">
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
            onClick={() => {
              // Logic:
              // If > 1 day/sec, halve it.
              // If 1 day/sec, go to Real Time.
              // If Real Time, go to -1 day/sec (Rewind).
              // If Negative, double magnitude.

              if (speed > 1) setSpeed(speed / 2);
              else if (speed === 1)
                setSpeed(1 / 86400); // Real Time
              else if (speed > 0)
                setSpeed(-1); // From Real Time to Rewind 1 day/sec
              else setSpeed(speed * 2); // Increase rewind speed (e.g. -1 -> -2)
            }}
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
            onClick={() => setIsPlaying(!isPlaying)}
            className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all shadow-[0_0_20px_rgba(0,0,0,0.5)] ${
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
            onClick={() => {
              // If negative or paused, go to Real Time.
              // If Real Time, go to 1 day/sec.
              // If >= 1, double.

              if (speed < 0 || speed === 0)
                setSpeed(1 / 86400); // Start at Real Time
              else if (speed < 1)
                setSpeed(1); // From Real Time to 1 day/sec
              else setSpeed(speed * 2);
            }}
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
        <div className="flex flex-col items-start min-w-[100px]">
          <span className="text-xl font-orbitron text-white tracking-widest tabular-nums">
            {Math.abs(speed) < 0.01 ? "REAL" : Math.abs(speed) + "x"}
          </span>
          <span className="text-[10px] text-nasa-dim uppercase tracking-[0.2em] font-rajdhani">
            {speed === 0
              ? "PAUSED"
              : Math.abs(speed) < 0.01
                ? "TIME"
                : speed > 0
                  ? "FWD RATE"
                  : "REV RATE"}
          </span>
        </div>
      </div>

      {/* Time Display when collapsed */}
      {isCollapsed && (
        <div className="glass-panel px-4 py-2 rounded-full mt-2 animate-fade-in">
          <span className="text-sm font-orbitron text-nasa-accent tracking-widest">
            {datetime.toLocaleDateString().toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
};
