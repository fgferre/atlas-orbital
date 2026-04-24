import { useProgress } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  canExitLoader,
  getNextLoaderDisplayProgress,
} from "../../lib/loaderProgress";
import { resolveLoaderSnapshot } from "../../lib/loaderStages";
import { STARFIELD_SOURCE_LABELS } from "../../lib/starfield";
import { useStore } from "../../store";
import { dismissBootSplash } from "../../lib/dismissBootSplash";

const formatElapsedTime = (elapsedMs: number) =>
  `${(elapsedMs / 1000).toFixed(elapsedMs < 10_000 ? 1 : 0)}s`;

const formatStageBadge = (stageId: string) =>
  stageId.replace(/-/g, " ").toUpperCase();

const StarField = () => {
  const [stars] = useState(() =>
    Array.from({ length: 56 }, (_, index) => ({
      id: index,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.45 + 0.12,
      duration: Math.random() * 3 + 2,
      delay: Math.random() * 2,
    }))
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            animation: `loaderTwinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
};

const CornerBrackets = () => (
  <>
    <div className="absolute top-8 left-8 h-16 w-16 rounded-tl-lg border-l-2 border-t-2 border-cyan-500/30" />
    <div className="absolute top-8 right-8 h-16 w-16 rounded-tr-lg border-r-2 border-t-2 border-cyan-500/30" />
    <div className="absolute bottom-8 left-8 h-16 w-16 rounded-bl-lg border-b-2 border-l-2 border-cyan-500/30" />
    <div className="absolute bottom-8 right-8 h-16 w-16 rounded-br-lg border-b-2 border-r-2 border-cyan-500/30" />
  </>
);

interface TechReadoutProps {
  stageLabel: string;
  sceneStatus: string;
  catalogStatus: string;
  rendererStatus: string;
  elapsedLabel: string;
}

const TechReadout = ({
  stageLabel,
  sceneStatus,
  catalogStatus,
  rendererStatus,
  elapsedLabel,
}: TechReadoutProps) => (
  <div className="pointer-events-none absolute inset-0 select-none font-mono text-[10px] tracking-widest text-cyan-500/40">
    <div className="absolute top-12 left-12 flex flex-col gap-1">
      <span>SYS.INIT.SEQUENCE</span>
      <span>BOOT_STAGE: {stageLabel}</span>
      <span>SCENE_LINK: {sceneStatus}</span>
    </div>

    <div className="absolute top-12 right-12 flex flex-col gap-1 text-right">
      <span>ORBITAL.MECHANICS</span>
      <span>STAR_CATALOG: {catalogStatus}</span>
      <span>RENDER_CORE: {rendererStatus}</span>
    </div>

    <div className="absolute bottom-12 left-12 flex flex-col gap-1">
      <span>COORDS: 45.22.11</span>
      <span>BOOT_TIMER: {elapsedLabel}</span>
    </div>

    <div className="absolute bottom-12 right-12 flex flex-col gap-1 text-right">
      <span>EST.LATENCY: 12ms</span>
      <span>CONNECTION: SECURE</span>
    </div>
  </div>
);

export const Loader = () => {
  const { progress, active } = useProgress();
  const isSceneReady = useStore((state) => state.isSceneReady);
  const isLoaderHidden = useStore((state) => state.isLoaderHidden);
  const setLoaderHidden = useStore((state) => state.setLoaderHidden);
  const showStarfield = useStore((state) => state.showStarfield);
  const starfieldSource = useStore((state) => state.starfieldSource);
  const starfieldStatus = useStore(
    (state) => state.starfieldProviderStates[state.starfieldSource]?.status
  );
  const [visible, setVisible] = useState(() => !isLoaderHidden);
  const snapshot = useMemo(
    () =>
      resolveLoaderSnapshot({
        progress,
        active,
        isSceneReady,
        showStarfield,
        starfieldSource,
        starfieldStatus,
      }),
    [
      active,
      isSceneReady,
      progress,
      showStarfield,
      starfieldSource,
      starfieldStatus,
    ]
  );
  const [displayProgress, setDisplayProgress] = useState(
    () => snapshot.progressValue
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const exitStartedRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);

  const catalogStatus = showStarfield
    ? `${STARFIELD_SOURCE_LABELS[starfieldSource]} ${starfieldStatus ?? "idle"}`
    : "disabled";
  const isFinalizingHandoff =
    snapshot.currentStageId === "ready" && displayProgress < 99.5;
  const progressTitle = isFinalizingHandoff
    ? "Finalizing scene handoff"
    : snapshot.title;
  const progressDetail = isFinalizingHandoff
    ? "Confirming the first interactive frames and synchronizing final overlays."
    : snapshot.detail;
  const progressTarget =
    snapshot.currentStageId === "ready" ? 100 : snapshot.progressValue;
  const rendererStatus = isSceneReady
    ? "online"
    : snapshot.currentStageId === "render"
      ? "warming"
      : "waiting";
  const sceneStatus = isSceneReady ? "ONLINE" : active ? "SYNCING" : "STANDBY";

  useEffect(() => dismissBootSplash(), []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const timer = window.setInterval(() => {
      setDisplayProgress((previousValue) => {
        return getNextLoaderDisplayProgress(
          previousValue,
          progressTarget,
          snapshot.currentStageId
        );
      });
    }, 16);

    return () => window.clearInterval(timer);
  }, [progressTarget, snapshot.currentStageId, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    startTimeRef.current = performance.now();

    const timer = window.setInterval(() => {
      if (startTimeRef.current == null) {
        return;
      }

      setElapsedMs(performance.now() - startTimeRef.current);
    }, 200);

    return () => window.clearInterval(timer);
  }, [visible]);

  useEffect(() => {
    if (
      !visible ||
      exitStartedRef.current ||
      !canExitLoader(isSceneReady, displayProgress)
    ) {
      return;
    }

    const canHideSoon = progress >= 95 || (!active && progress > 0);
    const delayMs = canHideSoon ? 450 : 900;
    const timer = window.setTimeout(() => {
      exitStartedRef.current = true;
      setVisible(false);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [active, displayProgress, isSceneReady, progress, visible]);

  return (
    <AnimatePresence onExitComplete={() => setLoaderHidden(true)}>
      {visible && (
        <motion.div
          data-testid="atlas-loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1, ease: "easeInOut" } }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-black text-white"
          style={{
            background:
              "radial-gradient(circle at center, #1a1a2e 0%, #000000 100%)",
          }}
        >
          <StarField />
          <CornerBrackets />
          <TechReadout
            stageLabel={formatStageBadge(snapshot.currentStageId)}
            sceneStatus={sceneStatus}
            catalogStatus={catalogStatus.toUpperCase()}
            rendererStatus={rendererStatus.toUpperCase()}
            elapsedLabel={formatElapsedTime(elapsedMs)}
          />

          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
              backgroundSize: "40px 40px",
              animation: "loaderGridDrift 28s linear infinite",
            }}
          />

          <div className="relative z-10 flex w-full max-w-4xl flex-col items-center justify-center px-4">
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="mb-12 bg-gradient-to-b from-white to-white/50 bg-clip-text text-center font-sans text-4xl font-light tracking-[0.2em] text-transparent md:text-6xl"
            >
              ATLAS ORBITAL
            </motion.h1>

            <div className="relative mb-12 flex h-48 w-48 items-center justify-center">
              <div className="absolute h-10 w-10 rounded-full bg-gradient-to-br from-yellow-300 to-orange-500 shadow-[0_0_40px_rgba(255,165,0,0.6)] animate-pulse z-10" />
              <div className="absolute h-20 w-20 rounded-full bg-cyan-400/6 blur-xl" />

              <div className="absolute h-16 w-16 rounded-full border border-white/5 animate-[spin_3s_linear_infinite]">
                <div className="absolute top-1/2 -right-1 h-1.5 w-1.5 rounded-full bg-gray-300 shadow-[0_0_5px_rgba(255,255,255,0.8)]" />
              </div>

              <div className="absolute h-24 w-24 rounded-full border border-white/10 animate-[spin_5s_linear_infinite]">
                <div className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              </div>

              <div className="absolute h-32 w-32 rounded-full border border-white/5 animate-[spin_7s_linear_infinite]">
                <div className="absolute bottom-1/2 -left-1.5 h-2 w-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
              </div>

              <div className="absolute h-44 w-44 rounded-full border border-white/5 animate-[spin_12s_linear_infinite]">
                <div className="absolute bottom-0 right-1/4 h-4 w-4 rounded-full bg-orange-300 shadow-[0_0_10px_rgba(253,186,116,0.8)]" />
              </div>

              <div
                className="absolute h-36 w-36 rounded-full border border-cyan-400/12"
                style={{
                  animation: "loaderPulseRing 2.8s ease-in-out infinite",
                }}
              />
            </div>

            <div className="w-full max-w-md space-y-3">
              <div className="flex items-center justify-between text-xs uppercase tracking-widest text-cyan-400/80">
                <span>{progressTitle}</span>
                <span>{displayProgress.toFixed(0)}%</span>
              </div>

              <div className="relative h-[2px] w-full overflow-hidden bg-white/10">
                <motion.div
                  className="absolute left-0 top-0 h-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                  initial={{ width: "0%" }}
                  animate={{ width: `${displayProgress}%` }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                />
                <div
                  className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/70 to-transparent"
                  style={{ animation: "loaderSweep 1.8s ease-in-out infinite" }}
                />
              </div>

              <p className="px-2 text-center text-[11px] leading-relaxed tracking-[0.12em] text-white/42">
                {progressDetail}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {snapshot.stages.map((stage) => {
                  const isActive = stage.state === "active";
                  const isComplete = stage.state === "complete";

                  return (
                    <div
                      key={stage.id}
                      className={`rounded-full border px-3 py-1 text-[9px] uppercase tracking-[0.24em] transition-colors ${
                        isActive
                          ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                          : isComplete
                            ? "border-cyan-400/18 bg-white/[0.03] text-white/60"
                            : "border-white/8 bg-transparent text-white/30"
                      }`}
                    >
                      {stage.label}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <style>{`
            @keyframes loaderTwinkle {
              0%, 100% { opacity: 0.12; transform: scale(0.95); }
              50% { opacity: 0.78; transform: scale(1.15); }
            }

            @keyframes loaderGridDrift {
              0% { transform: translate3d(0, 0, 0); }
              100% { transform: translate3d(40px, 40px, 0); }
            }

            @keyframes loaderSweep {
              0% { transform: translateX(-180%); }
              100% { transform: translateX(420%); }
            }

            @keyframes loaderPulseRing {
              0%, 100% {
                opacity: 0.15;
                transform: scale(0.96);
              }
              50% {
                opacity: 0.35;
                transform: scale(1.02);
              }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
