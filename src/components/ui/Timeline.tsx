import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useStore } from "../../store";

const SEC_PER_DAY = 86400;

const createStep = (valueInSeconds: number, label: string) => ({
  value: valueInSeconds,
  label,
});

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

const NORMAL_SPEED = 1;

export const Timeline = () => {
  const datetime = useStore((state) => state.datetime);
  const isPlaying = useStore((state) => state.isPlaying);
  const setIsPlaying = useStore((state) => state.setIsPlaying);
  const speed = useStore((state) => state.speed);
  const setSpeed = useStore((state) => state.setSpeed);
  const isLiveMode = useStore((state) => state.isLiveMode);
  const setLiveMode = useStore((state) => state.setLiveMode);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isCompact = useMediaQuery("(max-width: 1365px)");

  const [isCollapsed, setIsCollapsed] = useState(true);
  const requestRef = useRef<number | undefined>(undefined);
  const previousTimeRef = useRef<number | undefined>(undefined);

  const currentStepIndex = useMemo(() => {
    const absSpeed = Math.abs(speed);
    if (absSpeed < TIME_STEPS[0].value) {
      return -1;
    }

    let closestIndex = 0;
    let minDiff = Math.abs(absSpeed - TIME_STEPS[0].value);

    for (let index = 1; index < TIME_STEPS.length; index += 1) {
      const diff = Math.abs(absSpeed - TIME_STEPS[index].value);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = index;
      }
    }

    return closestIndex;
  }, [speed]);

  const sliderValue = useMemo(() => {
    if (Math.abs(speed - NORMAL_SPEED) < 1e-10) {
      return 0;
    }

    if (Math.abs(speed + NORMAL_SPEED) < 1e-10) {
      return 0;
    }

    if (currentStepIndex === -1) {
      return 0;
    }

    return speed > 0 ? currentStepIndex + 1 : -(currentStepIndex + 1);
  }, [currentStepIndex, speed]);

  const handleSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLiveMode(false);
    const value = Number.parseInt(event.target.value, 10);

    if (value === 0) {
      setSpeed(NORMAL_SPEED);
      return;
    }

    const index = Math.abs(value) - 1;
    const step = TIME_STEPS[index];
    setSpeed(value > 0 ? step.value : -step.value);
  };

  const handleForward = () => {
    setLiveMode(false);
    if (speed < 0) {
      if (currentStepIndex === 0) {
        setSpeed(NORMAL_SPEED);
      } else if (currentStepIndex > 0) {
        setSpeed(-TIME_STEPS[currentStepIndex - 1].value);
      } else {
        setSpeed(TIME_STEPS[0].value);
      }
      return;
    }

    if (Math.abs(speed - NORMAL_SPEED) < 1e-10 || currentStepIndex === -1) {
      setSpeed(TIME_STEPS[0].value);
    } else if (currentStepIndex < TIME_STEPS.length - 1) {
      setSpeed(TIME_STEPS[currentStepIndex + 1].value);
    }
  };

  const handleRewind = () => {
    setLiveMode(false);
    if (speed > 0) {
      if (currentStepIndex === 0) {
        setSpeed(NORMAL_SPEED);
      } else if (currentStepIndex > 0) {
        setSpeed(TIME_STEPS[currentStepIndex - 1].value);
      } else {
        setSpeed(-TIME_STEPS[0].value);
      }
      return;
    }

    if (Math.abs(speed - NORMAL_SPEED) < 1e-10 || currentStepIndex === -1) {
      setSpeed(-TIME_STEPS[0].value);
    } else if (currentStepIndex < TIME_STEPS.length - 1) {
      setSpeed(-TIME_STEPS[currentStepIndex + 1].value);
    }
  };

  const handleNormalTime = () => {
    setLiveMode(false);
    setSpeed(NORMAL_SPEED);
    setIsPlaying(true);
  };

  const handleLiveMode = () => {
    setLiveMode(true);
    setSpeed(NORMAL_SPEED);
    setIsPlaying(true);
  };

  const togglePlayback = () => {
    setLiveMode(false);
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    const animate = (time: number) => {
      if (previousTimeRef.current !== undefined) {
        const deltaTime = time - previousTimeRef.current;
        if (useStore.getState().isLiveMode) {
          useStore.getState().setDatetime(new Date());
        } else if (useStore.getState().isPlaying) {
          useStore
            .getState()
            .setDatetime(
              (previous) =>
                new Date(
                  previous.getTime() + useStore.getState().speed * deltaTime
                )
            );
        }
      }

      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current !== undefined) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  const currentLabel = useMemo(() => {
    if (Math.abs(speed - NORMAL_SPEED) < 1e-10) {
      return "1 second/second";
    }

    if (speed === 0) {
      return "Paused";
    }

    if (currentStepIndex !== -1) {
      return TIME_STEPS[currentStepIndex].label;
    }

    return "Custom Speed";
  }, [currentStepIndex, speed]);

  const formattedTime = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(datetime),
    [datetime]
  );

  const formattedDate = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
        .format(datetime)
        .toUpperCase(),
    [datetime]
  );

  const rateSummary = useMemo(() => {
    if (isLiveMode) {
      return "Realtime sync";
    }

    if (speed === 0) {
      return "Paused";
    }

    return `${speed < 0 ? "-" : ""}${currentLabel}`;
  }, [currentLabel, isLiveMode, speed]);

  const collapsedWidthClass = isMobile
    ? "w-[min(calc(100vw-1rem),18rem)]"
    : "w-[15.5rem]";
  const expandedWidthClass = isMobile
    ? "w-[calc(100vw-1rem)]"
    : isCompact
      ? "w-[min(calc(100vw-2rem),31rem)]"
      : "w-[min(calc(100vw-2rem),36rem)]";
  const shellWidthClass = isCollapsed
    ? collapsedWidthClass
    : expandedWidthClass;
  const shellPaddingClass = isCollapsed ? "px-2.5 py-2" : "px-3 py-3 sm:px-4";
  const shellTransition = {
    layout: {
      duration: 0.34,
      ease: [0.16, 1, 0.3, 1],
    },
  } as const;

  return (
    <div
      className="pointer-events-auto absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 z-30 -translate-x-1/2"
      data-tutorial-target="timeline"
    >
      <motion.section
        layout
        transition={shellTransition}
        style={{ transformOrigin: "bottom center" }}
        className={`command-shell tech-corners ghost-border flex flex-col overflow-hidden ${shellWidthClass} ${shellPaddingClass}`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
            className={`flex h-9 w-9 shrink-0 items-center justify-center border transition-[border-color,background-color,color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation ${
              isPlaying
                ? "border-nasa-accent bg-nasa-accent/10 text-nasa-accent"
                : "border-nasa-alert bg-nasa-alert/10 text-nasa-alert"
            }`}
          >
            {isPlaying ? (
              <div className="flex gap-1" aria-hidden="true">
                <div className="h-3.5 w-1.5 rounded-sm bg-current"></div>
                <div className="h-3.5 w-1.5 rounded-sm bg-current"></div>
              </div>
            ) : (
              <div
                aria-hidden="true"
                className="ml-0.5 h-0 w-0 border-b-[6px] border-l-[11px] border-t-[6px] border-b-transparent border-l-current border-t-transparent"
              ></div>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="text-[8px] font-orbitron uppercase tracking-[0.18em] text-white/35">
              {isLiveMode ? "Live sync" : "Simulation time"}
            </div>
            <div
              className={`truncate font-orbitron tabular-nums uppercase tracking-[0.14em] text-white transition-[font-size] duration-300 ${
                isCollapsed ? "text-[10px]" : "text-[12px]"
              }`}
            >
              {formattedTime}
            </div>
            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-0.5 text-[9px] font-rajdhani uppercase tracking-[0.18em] text-nasa-dim"
                >
                  {formattedDate}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={handleLiveMode}
            aria-pressed={isLiveMode}
            className={`border px-2 py-2 text-[8px] font-orbitron uppercase tracking-[0.16em] transition-[border-color,color,background-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation ${
              isLiveMode
                ? "border-green-400/50 bg-green-400/10 text-green-300"
                : "border-white/10 text-white/70 hover:border-nasa-accent/40 hover:text-white"
            }`}
          >
            LIVE MODE
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed((current) => !current)}
            aria-expanded={!isCollapsed}
            aria-controls="atlas-timeline-panel"
            aria-label={isCollapsed ? "Expand timeline" : "Collapse timeline"}
            className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 bg-white/[0.03] text-nasa-accent transition-[border-color,color,background-color] hover:border-nasa-accent/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 transition-transform duration-300 ${
                isCollapsed ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>

        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              id="atlas-timeline-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mt-3 space-y-3 border-t border-white/8 pt-3"
            >
              {isMobile ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="w-[10.5rem] shrink-0 border border-white/8 bg-white/[0.04] px-2 py-1 text-center text-[9px] font-orbitron tabular-nums uppercase tracking-[0.16em] text-nasa-accent">
                      {rateSummary}
                    </div>
                    <button
                      type="button"
                      onClick={handleNormalTime}
                      className="border border-nasa-accent/50 px-2.5 py-2 text-[9px] font-orbitron uppercase tracking-[0.16em] text-nasa-accent transition-[border-color,color,background-color] hover:bg-nasa-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
                    >
                      NORMAL RATE
                    </button>
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <TimelineIconButton
                      label="Rewind simulation rate"
                      onClick={handleRewind}
                    >
                      <path d="M11 19l-9-7 9-7v14zM20 19l-9-7 9-7v14z" />
                    </TimelineIconButton>

                    <TimelineIconButton
                      label="Advance simulation rate"
                      onClick={handleForward}
                    >
                      <path d="M13 19l9-7-9-7v14zM4 19l9-7-9-7v14z" />
                    </TimelineIconButton>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[9px] font-rajdhani uppercase tracking-[0.18em] text-white/45">
                      <span>Reverse</span>
                      <span>Normal</span>
                      <span>Forward</span>
                    </div>
                    <input
                      type="range"
                      min={-TIME_STEPS.length}
                      max={TIME_STEPS.length}
                      step={1}
                      value={sliderValue}
                      aria-label="Simulation rate"
                      onChange={handleSliderChange}
                      className="h-1.5 w-full cursor-pointer appearance-none bg-nasa-dim/25 accent-nasa-accent touch-manipulation"
                    />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-[auto_auto_auto_minmax(0,1fr)] items-center gap-2.5">
                  <div className="w-[10.5rem] shrink-0 border border-white/8 bg-white/[0.04] px-2 py-1 text-center text-[9px] font-orbitron tabular-nums uppercase tracking-[0.16em] text-nasa-accent">
                    {rateSummary}
                  </div>

                  <button
                    type="button"
                    onClick={handleNormalTime}
                    className="w-[7.5rem] shrink-0 border border-nasa-accent/50 px-2.5 py-2 text-[9px] font-orbitron uppercase tracking-[0.16em] text-nasa-accent transition-[border-color,color,background-color] hover:bg-nasa-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
                  >
                    NORMAL RATE
                  </button>

                  <div className="flex items-center gap-1.5">
                    <TimelineIconButton
                      label="Rewind simulation rate"
                      onClick={handleRewind}
                      compact
                    >
                      <path d="M11 19l-9-7 9-7v14zM20 19l-9-7 9-7v14z" />
                    </TimelineIconButton>

                    <TimelineIconButton
                      label="Advance simulation rate"
                      onClick={handleForward}
                      compact
                    >
                      <path d="M13 19l9-7-9-7v14zM4 19l9-7-9-7v14z" />
                    </TimelineIconButton>
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between text-[8px] font-rajdhani uppercase tracking-[0.18em] text-white/45">
                      <span>Reverse</span>
                      <span>Normal</span>
                      <span>Forward</span>
                    </div>
                    <input
                      type="range"
                      min={-TIME_STEPS.length}
                      max={TIME_STEPS.length}
                      step={1}
                      value={sliderValue}
                      aria-label="Simulation rate"
                      onChange={handleSliderChange}
                      className="h-1.5 w-full cursor-pointer appearance-none bg-nasa-dim/25 accent-nasa-accent touch-manipulation"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </div>
  );
};

const TimelineIconButton = ({
  label,
  onClick,
  compact = false,
  children,
}: {
  label: string;
  onClick: () => void;
  compact?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className={`flex items-center justify-center rounded border border-white/10 text-nasa-dim transition-colors hover:text-nasa-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation ${
      compact ? "h-9 w-9" : "h-10 w-10"
    }`}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={compact ? "h-4 w-4" : "h-5 w-5"}
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {children}
    </svg>
  </button>
);
