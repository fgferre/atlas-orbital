import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useQualityProfile } from "../../hooks/useQualityProfile";
import { STARFIELD_SOURCE_LABELS } from "../../lib/starfield";
import { useStore } from "../../store";
import {
  OVERLAY_FILTER_OPTIONS,
  RIGHT_CONTROL_TRIGGER_SELECTOR,
  RIGHT_CONTROL_BUTTONS,
  SCENE_SCALE_OPTIONS,
  SCENE_SOURCE_OPTIONS,
  SCENE_SUN_RENDER_OPTIONS,
  type RightControlPanelId,
} from "./controlPanelConfig";
import { DisplayPanel } from "./DisplayPanel";
import { A11yPanel } from "./A11yPanel";

interface LayersPanelProps {
  activePanel: RightControlPanelId | null;
  setActivePanel: (panel: RightControlPanelId | null) => void;
  onPanelExitComplete?: () => void;
}

const PANEL_COPY = {
  scene: {
    title: "Scene",
    meta: "render controls",
  },
  overlay: {
    title: "Overlay",
    meta: "scientific guides",
  },
  display: {
    title: "Display",
    meta: "graphics & quality",
  },
  a11y: {
    title: "Accessibility",
    meta: "motion & scale",
  },
  project: {
    title: "Project",
    meta: "ops & help",
  },
} as const;

export const LayersPanel = ({
  activePanel,
  setActivePanel,
  onPanelExitComplete,
}: LayersPanelProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const openPanel =
    activePanel === "scene" ||
    activePanel === "overlay" ||
    activePanel === "display" ||
    activePanel === "a11y" ||
    activePanel === "project"
      ? activePanel
      : null;

  const showLabels = useStore((state) => state.showLabels);
  const toggleLabels = useStore((state) => state.toggleLabels);
  const showIcons = useStore((state) => state.showIcons);
  const toggleIcons = useStore((state) => state.toggleIcons);
  const showOrbits = useStore((state) => state.showOrbits);
  const toggleOrbits = useStore((state) => state.toggleOrbits);
  const declutterOrbits = useStore((state) => state.declutterOrbits);
  const toggleDeclutterOrbits = useStore(
    (state) => state.toggleDeclutterOrbits
  );
  const showEclipticGrid = useStore((state) => state.showEclipticGrid);
  const toggleEclipticGrid = useStore((state) => state.toggleEclipticGrid);
  const showProgradeVector = useStore((state) => state.showProgradeVector);
  const toggleProgradeVector = useStore((state) => state.toggleProgradeVector);
  const scaleMode = useStore((state) => state.scaleMode);
  const toggleScaleMode = useStore((state) => state.toggleScaleMode);
  // Wave α UX follow-up: the Scene panel no longer carries its own
  // Quality control group — the Display panel is canonical. We only
  // read `graphicsAutoMode` (to label Auto vs manual) + the derived
  // `qualityProfile.name` (to surface the current tier). The setters
  // and raw preset/autoMode flags are dropped from this surface.
  const qualityMode = useStore((state) => state.qualityMode);
  const graphicsAutoMode = useStore((state) => state.graphicsAutoMode);
  const sunRenderMode = useStore((state) => state.sunRenderMode);
  const setSunRenderMode = useStore((state) => state.setSunRenderMode);
  const showStarfield = useStore((state) => state.showStarfield);
  const toggleShowStarfield = useStore((state) => state.toggleShowStarfield);
  const starfieldSource = useStore((state) => state.starfieldSource);
  const setStarfieldSource = useStore((state) => state.setStarfieldSource);
  const activeStarfieldProviderState = useStore(
    (state) => state.starfieldProviderStates[state.starfieldSource]
  );
  const visibility = useStore((state) => state.visibility);
  const toggleVisibility = useStore((state) => state.toggleVisibility);
  const debugMode = useStore((state) => state.debugMode);
  const toggleDebugMode = useStore((state) => state.toggleDebugMode);
  const reopenTutorial = useStore((state) => state.reopenTutorial);
  const toggleCredits = useStore((state) => state.toggleCredits);
  const qualityProfile = useQualityProfile(qualityMode);
  const activeStarfieldLabel = STARFIELD_SOURCE_LABELS[starfieldSource];

  const starfieldStatusMessage = useMemo(() => {
    if (activeStarfieldProviderState.status === "loading") {
      return `Loading ${activeStarfieldLabel} catalog…`;
    }

    if (activeStarfieldProviderState.status === "error") {
      return (
        activeStarfieldProviderState.error ??
        `${activeStarfieldLabel} failed to load.`
      );
    }

    return `Active source: ${activeStarfieldLabel}`;
  }, [activeStarfieldLabel, activeStarfieldProviderState]);

  useDialogFocus({
    isOpen: Boolean(openPanel) && isMobile,
    containerRef: panelRef,
    initialFocusRef: closeButtonRef,
    onClose: () => setActivePanel(null),
  });

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(RIGHT_CONTROL_TRIGGER_SELECTOR)
      ) {
        return;
      }

      if (
        openPanel &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setActivePanel(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openPanel, setActivePanel]);

  const panelClassName = isMobile
    ? "fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] left-[2.8rem] right-3 top-[calc(env(safe-area-inset-top)+4.75rem)] z-50"
    : "absolute right-0 z-50 flex -translate-y-1/2 items-center";

  const openPanelCopy = openPanel ? PANEL_COPY[openPanel] : null;
  const controlButtons = RIGHT_CONTROL_BUTTONS.filter(
    (button) => button.id !== "search"
  );
  const openPanelButton =
    openPanel && openPanelCopy
      ? (controlButtons.find((button) => button.id === openPanel) ?? null)
      : null;
  const openPanelIndex =
    openPanel && openPanelCopy
      ? controlButtons.findIndex((button) => button.id === openPanel)
      : -1;
  const openPanelOffsetStyle =
    !isMobile && openPanelIndex >= 0
      ? {
          top: `${openPanelIndex * 88 + 40}px`,
        }
      : undefined;
  const mobileClosedTabClassName =
    "command-shell ghost-border relative z-[60] flex h-[4.5rem] w-10 -translate-x-[0.5rem] items-center justify-center gap-1.5 overflow-hidden rounded-r-[0.95rem] px-1.5 py-2 text-[10px] font-orbitron uppercase tracking-[0.16em] text-nasa-accent transition-[transform,border-color,color,background-color,box-shadow] hover:-translate-x-[0.2rem] hover:border-nasa-accent/35 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation";
  const mobileActiveTabClassName =
    "command-shell ghost-border relative z-[60] flex h-[4.5rem] w-10 items-center justify-center gap-1.5 overflow-hidden rounded-r-[0.95rem] px-1.5 py-2 text-[10px] font-orbitron uppercase tracking-[0.16em] text-white shadow-[0_0_18px_rgba(0,240,255,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation";
  const desktopClosedTabClassName =
    "command-shell ghost-border relative z-[60] flex h-[5rem] w-10 translate-x-[0.5rem] items-center justify-center gap-1.5 overflow-hidden rounded-l-[0.95rem] px-1.5 py-2 text-[10px] font-orbitron uppercase tracking-[0.16em] text-nasa-accent transition-[transform,border-color,color,background-color,box-shadow] hover:translate-x-[0.2rem] hover:border-nasa-accent/35 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation";
  const desktopOpenTabClassName =
    "command-shell ghost-border relative z-[1] -mr-px flex h-[5rem] w-10 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-l-[0.95rem] px-1.5 py-2 text-[10px] font-orbitron uppercase tracking-[0.16em] text-nasa-accent transition-[color,border-color,background-color,box-shadow] hover:border-nasa-accent/35 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation";
  const desktopPanelShellClassName =
    "command-shell ghost-border tech-corners panel-scan flex items-stretch overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.45)]";
  const panelBodyClassName = isMobile
    ? "flex h-full max-h-[inherit] flex-col overflow-hidden"
    : "flex max-h-[min(78vh,42rem)] w-[min(24rem,calc(100vw-5.75rem))] flex-col overflow-hidden p-4";

  const panelSections =
    openPanel === "scene" ? (
      <div className="space-y-3">
        <SectionLabel>Scene</SectionLabel>
        <Toggle
          label="Starfield"
          checked={showStarfield}
          onChange={toggleShowStarfield}
        />

        <div className="space-y-3 border border-white/5 bg-black/20 p-3">
          <div>
            <SubsectionLabel>Starfield Source</SubsectionLabel>
            <div
              role="group"
              aria-label="Starfield source"
              className="grid grid-cols-2 gap-2"
            >
              {SCENE_SOURCE_OPTIONS.map((option) => (
                <ChoiceButton
                  key={option.id}
                  label={option.label}
                  isActive={starfieldSource === option.id}
                  onClick={() => setStarfieldSource(option.id)}
                />
              ))}
            </div>
          </div>

          <div
            aria-live="polite"
            className={`text-[11px] leading-relaxed ${
              activeStarfieldProviderState.status === "error"
                ? "text-amber-300"
                : "text-white/55"
            }`}
          >
            {showStarfield
              ? starfieldStatusMessage
              : `Background stars hidden. Re-enable Starfield to compare ${STARFIELD_SOURCE_LABELS.hyg} and ${STARFIELD_SOURCE_LABELS.nasa}.`}
          </div>
        </div>

        <div>
          <SubsectionLabel>Scale Mode</SubsectionLabel>
          <div
            role="group"
            aria-label="Scale mode"
            className="grid grid-cols-2 gap-2"
          >
            {SCENE_SCALE_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.id}
                label={option.label}
                isActive={scaleMode === option.id}
                onClick={() => scaleMode !== option.id && toggleScaleMode()}
              />
            ))}
          </div>
          <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-white/55">
            <div>{`Didactic: Compressed distances and exaggerated sizes for whole-system reading.`}</div>
            <div>{`Realistic: Physical scale to preserve spatial emptiness.`}</div>
          </div>
        </div>

        <div>
          <SubsectionLabel>Quality</SubsectionLabel>
          {/* Wave α UX fix: the Scene panel no longer carries a Quality
              control group. The Display panel is the canonical
              surface for graphics tier + all per-feature tuning, and
              keeping a parallel dropdown here was a source of
              confusion (duplicate state, market non-standard).
              Subsection kept as a pointer so users with muscle
              memory find their way. Current tier is surfaced inline
              so they can verify Sun Render's "Auto" target. */}
          <div className="border border-white/5 bg-black/20 px-3 py-2.5 text-[11px] leading-relaxed text-white/55">
            Graphics quality + tuning live in the{" "}
            <span className="text-nasa-accent">Display</span> panel.
            {graphicsAutoMode ? (
              <div className="mt-1 text-white/70">
                Currently running on{" "}
                <span className="text-white">{qualityProfile.name}</span>{" "}
                (auto-detect).
              </div>
            ) : (
              <div className="mt-1 text-white/70">
                Currently running on{" "}
                <span className="text-white">{qualityProfile.name}</span>.
              </div>
            )}
          </div>
        </div>

        <div>
          <SubsectionLabel>Sun Render</SubsectionLabel>
          <div
            role="group"
            aria-label="Sun render mode"
            className="grid grid-cols-2 gap-2"
          >
            {SCENE_SUN_RENDER_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.id}
                label={option.label}
                isActive={sunRenderMode === option.id}
                onClick={() => setSunRenderMode(option.id)}
                isWide={option.id === "auto"}
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] text-white/55">
            {sunRenderMode === "auto"
              ? `Auto resolves to ${qualityProfile.name === "ultra" ? "Procedural" : "Texture"} for the current quality profile.`
              : sunRenderMode === "procedural"
                ? "Procedural enables the multi-pass solar surface, corona, rays, and flares pipeline."
                : "Texture keeps the existing lightweight sun material."}
          </div>
        </div>
      </div>
    ) : openPanel === "overlay" ? (
      <>
        <div className="space-y-3">
          <SectionLabel>Categories</SectionLabel>
          <div
            role="group"
            aria-label="Body visibility filters"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {OVERLAY_FILTER_OPTIONS.map((option) => (
              <CategoryToggle
                key={option.id}
                label={option.label}
                checked={visibility[option.id]}
                onChange={() => toggleVisibility(option.id)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <SectionLabel>Guides & Overlays</SectionLabel>
          <Toggle label="Icons" checked={showIcons} onChange={toggleIcons} />
          <Toggle label="Labels" checked={showLabels} onChange={toggleLabels} />
          <Toggle label="Orbits" checked={showOrbits} onChange={toggleOrbits} />
          {showOrbits && (
            <div className="border-l border-white/10 pl-3">
              <Toggle
                label="Context Orbits"
                checked={declutterOrbits}
                onChange={toggleDeclutterOrbits}
              />
            </div>
          )}
          <Toggle
            label="Ecliptic Grid"
            checked={showEclipticGrid}
            onChange={toggleEclipticGrid}
          />
          <Toggle
            label="Prograde Vector"
            checked={showProgradeVector}
            onChange={toggleProgradeVector}
          />
        </div>
      </>
    ) : openPanel === "display" ? (
      <DisplayPanel />
    ) : openPanel === "a11y" ? (
      <A11yPanel />
    ) : openPanel === "project" ? (
      <div className="space-y-3">
        <SectionLabel>Project</SectionLabel>
        <button
          type="button"
          onClick={reopenTutorial}
          className="w-full border border-white/10 px-3 py-3 text-left text-[11px] font-orbitron uppercase tracking-[0.16em] text-white transition-[border-color,color,background-color] hover:border-nasa-accent hover:text-nasa-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
        >
          Replay Tutorial
        </button>
        <div className="-mt-1 text-[11px] text-white/45">
          Shortcut: Ctrl + Shift + T
        </div>
        <button
          type="button"
          onClick={toggleCredits}
          className="flex w-full items-center justify-center gap-2 border border-white/10 px-3 py-3 text-[11px] font-orbitron uppercase tracking-[0.16em] text-white transition-[border-color,color,background-color] hover:border-nasa-accent hover:text-nasa-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
        >
          <span>Mission Report</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
        <Toggle
          label="Debug Menu"
          checked={debugMode}
          onChange={toggleDebugMode}
        />
        <div className="-mt-1 text-right text-[11px] text-white/45">
          Shortcut: Ctrl + Shift + D
        </div>
        <div className="text-center text-[11px] text-white/45">
          v0.1.0 | Atlas Orbital
        </div>
      </div>
    ) : null;

  const panelContent =
    openPanel && openPanelCopy ? (
      <div
        id={`atlas-${openPanel}-panel`}
        ref={panelRef}
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile ? true : undefined}
        aria-labelledby={`atlas-${openPanel}-title`}
        tabIndex={-1}
        className={panelBodyClassName}
      >
        <div className="mb-4 flex items-center justify-between gap-4 border-b border-white/8 pb-3">
          <div className="min-w-0">
            <div
              id={`atlas-${openPanel}-title`}
              className="text-sm font-orbitron uppercase tracking-[0.18em] text-nasa-accent"
            >
              {openPanelCopy.title}
            </div>
            <div className="mt-1 text-[10px] font-rajdhani uppercase tracking-[0.2em] text-white/45">
              {openPanelCopy.meta}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setActivePanel(null)}
            aria-label={`Close ${openPanelCopy.title.toLowerCase()} panel`}
            className="rounded border border-white/10 px-2 py-1 text-[10px] font-orbitron uppercase tracking-[0.16em] text-white/70 transition-colors hover:border-nasa-accent hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
          >
            Close
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 space-y-6 overflow-y-auto overscroll-contain pr-1">
          {panelSections}
        </div>
      </div>
    ) : null;

  return (
    <div
      ref={containerRef}
      data-ui-framing="settings-rail"
      className="relative pointer-events-auto"
      data-tutorial-target="settings"
    >
      <div className="flex flex-col items-stretch gap-2">
        {controlButtons.map((button) => {
          const isOpen = activePanel === button.id;

          if (!isMobile && isOpen) {
            return (
              <div
                key={button.id}
                aria-hidden="true"
                className="h-[5rem] w-10"
              ></div>
            );
          }

          return (
            <button
              key={button.id}
              type="button"
              data-right-control-trigger={button.id}
              onClick={() => setActivePanel(isOpen ? null : button.id)}
              aria-expanded={isOpen}
              aria-controls={isOpen ? `atlas-${button.id}-panel` : undefined}
              className={
                isMobile
                  ? isOpen
                    ? mobileActiveTabClassName
                    : mobileClosedTabClassName
                  : desktopClosedTabClassName
              }
            >
              <RailButtonIcon panelId={button.id} />
              <span className="drawer-tab-label text-[7px] tracking-[0.22em] text-white">
                {button.label}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence
        initial={false}
        onExitComplete={() => {
          if (!openPanel) {
            onPanelExitComplete?.();
          }
        }}
      >
        {openPanel && openPanelCopy && (
          <motion.div
            key={openPanel}
            className={panelClassName}
            style={openPanelOffsetStyle}
            initial={{
              opacity: 0,
              x: isMobile ? -56 : "calc(100% - 2.5rem)",
              scale: 0.98,
            }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{
              opacity: 0,
              x: isMobile ? -56 : "calc(100% - 2.5rem)",
              scale: 0.98,
            }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            {isMobile ? (
              <div className="tech-panel tech-corners panel-scan flex h-full max-h-[inherit] flex-col overflow-hidden p-4 shadow-[0_0_30px_rgba(0,0,0,0.45)]">
                {panelContent}
              </div>
            ) : (
              <div className="relative flex items-center">
                {openPanelButton && (
                  <button
                    type="button"
                    data-right-control-trigger={openPanelButton.id}
                    onClick={() => setActivePanel(null)}
                    aria-label={`Close ${openPanelCopy.title.toLowerCase()} panel`}
                    aria-expanded={true}
                    aria-controls={`atlas-${openPanel}-panel`}
                    className={desktopOpenTabClassName}
                  >
                    <RailButtonIcon panelId={openPanelButton.id} />
                    <span className="drawer-tab-label text-[7px] tracking-[0.22em] text-white">
                      {openPanelButton.label}
                    </span>
                  </button>
                )}
                <div className={desktopPanelShellClassName}>{panelContent}</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const RailButtonIcon = ({
  panelId,
}: {
  panelId: Exclude<RightControlPanelId, "search">;
}) => {
  if (panelId === "scene") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 14.25A2.25 2.25 0 1 0 12 9.75a2.25 2.25 0 0 0 0 4.5Z"
        />
      </svg>
    );
  }

  if (panelId === "overlay") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 4.5 4.5 8.25 12 12l7.5-3.75L12 4.5Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 12 12 15.75 19.5 12"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 15.75 12 19.5l7.5-3.75"
        />
      </svg>
    );
  }

  if (panelId === "display") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="h-4 w-4"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="12" rx="1.5" />
        <path d="M8 20h8" strokeLinecap="round" />
        <path d="M12 16v4" strokeLinecap="round" />
      </svg>
    );
  }

  if (panelId === "a11y") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="h-4 w-4"
        aria-hidden="true"
      >
        <circle cx="12" cy="5" r="1.75" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 9h14M9 9v5l-1.5 6M15 9v5l1.5 6M9.5 14h5"
        />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 4.5h9m-9 5.25h9m-9 5.25h5.25"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 4.5h.75v.75H4.5Zm0 5.25h.75v.75H4.5Zm0 5.25h.75v.75H4.5Z"
      />
    </svg>
  );
};

const SectionLabel = ({ children }: { children: string }) => (
  <div className="border-b border-nasa-accent/25 pb-2 text-[10px] font-orbitron uppercase tracking-[0.22em] text-nasa-accent">
    {children}
  </div>
);

const SubsectionLabel = ({ children }: { children: string }) => (
  <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/55">
    {children}
  </div>
);

const ChoiceButton = ({
  label,
  isActive,
  onClick,
  isWide = false,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  isWide?: boolean;
}) => (
  <button
    type="button"
    aria-pressed={isActive}
    onClick={onClick}
    className={`border px-3 py-2 text-[10px] font-orbitron uppercase tracking-[0.16em] transition-[border-color,color,background-color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation ${
      isActive
        ? "border-nasa-accent bg-nasa-accent/10 text-white shadow-[0_0_12px_rgba(0,240,255,0.18)]"
        : "border-white/10 bg-black/35 text-white/60 hover:border-white/25 hover:text-white"
    } ${isWide ? "col-span-2" : ""}`}
  >
    {label}
  </button>
);

const Toggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className="flex w-full items-center justify-between gap-3 border border-white/10 bg-black/20 px-3 py-2.5 text-left transition-[border-color,color,background-color] hover:border-white/20 hover:bg-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
  >
    <div className="min-w-0 text-sm text-white">{label}</div>
    <div className="flex shrink-0 items-center gap-3">
      <span className="text-[10px] font-orbitron uppercase tracking-[0.16em] text-white/55">
        {checked ? "On" : "Off"}
      </span>
      <span
        aria-hidden="true"
        className={`relative block h-6 w-11 border transition-[background-color,border-color] ${
          checked
            ? "border-nasa-accent/60 bg-nasa-accent/20"
            : "border-white/15 bg-white/5"
        }`}
      >
        <span
          className={`absolute top-1 h-3.5 w-3.5 rounded-full transition-transform ${
            checked
              ? "translate-x-[1.35rem] bg-nasa-accent"
              : "translate-x-1 bg-white/45"
          }`}
        />
      </span>
    </div>
  </button>
);

const CategoryToggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <button
    type="button"
    aria-pressed={checked}
    onClick={onChange}
    className={`border px-2 py-2 text-[10px] font-orbitron uppercase tracking-[0.16em] transition-[border-color,color,background-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation ${
      checked
        ? "border-nasa-accent bg-nasa-accent/10 text-white"
        : "border-white/10 bg-black/20 text-white/55 hover:border-white/25 hover:text-white"
    }`}
  >
    {label}
  </button>
);
