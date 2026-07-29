import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { LABEL_MODE_LABELS, LABEL_MODES } from "../../lib/labelMode";
import { STARFIELD_SOURCE_LABELS } from "../../lib/starfield";
import { useStore } from "../../store";
import { RailTabContent } from "./RightControlRail";
import {
  getRightControlDesktopHandleOffsetStyle,
  getRightControlDesktopWrapperOffsetStyle,
  getRightControlPanelDomId,
  OVERLAY_FILTER_OPTIONS,
  RIGHT_CONTROL_DESKTOP_PANEL_EXIT_X,
  RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_CLASS,
  RIGHT_CONTROL_DESKTOP_TAB_OVERLAP_CLASS,
  RIGHT_CONTROL_DESKTOP_TAB_SHADOW_CLASS,
  RIGHT_CONTROL_DESKTOP_TAB_SHAPE_CLASS,
  RIGHT_CONTROL_DESKTOP_TAB_WIDTH_CLASS,
  RIGHT_CONTROL_MOBILE_TAB_HEIGHT_CLASS,
  RIGHT_CONTROL_MOBILE_TAB_WIDTH_CLASS,
  RIGHT_CONTROL_TRIGGER_SELECTOR,
  RIGHT_CONTROL_BUTTONS,
  SCENE_SCALE_OPTIONS,
  type RightControlPanelId,
} from "./controlPanelConfig";
import { DisplayPanel } from "./DisplayPanel";
import { A11yPanel } from "./A11yPanel";
import { Accordion } from "./primitives/Accordion";

interface LayersPanelProps {
  activePanel: RightControlPanelId | null;
  setActivePanel: (panel: RightControlPanelId | null) => void;
  onPanelExitComplete?: () => void;
}

const PANEL_COPY = {
  view: {
    title: "View",
    meta: "bodies, guides, world",
  },
  display: {
    title: "Display",
    meta: "graphics & quality",
  },
  a11y: {
    title: "Accessibility",
    meta: "motion & scale",
  },
} as const;

// Menu structure v3.1 §5.5 — one-time transition hint. Persists via
// localStorage under a versioned key so future hints (v2, v3, …) can
// ship without colliding with prior dismissals, and without touching
// the Zustand store (zero migration scope).

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
    activePanel === "view" ||
    activePanel === "display" ||
    activePanel === "a11y"
      ? activePanel
      : null;

  const showLabels = useStore((state) => state.showLabels);
  const toggleLabels = useStore((state) => state.toggleLabels);
  const labelMode = useStore((state) => state.labelMode);
  const setLabelMode = useStore((state) => state.setLabelMode);
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
  const showStarfield = useStore((state) => state.showStarfield);
  const toggleShowStarfield = useStore((state) => state.toggleShowStarfield);
  const activeStarfieldProviderState = useStore(
    (state) => state.starfieldProviderStates[state.starfieldSource]
  );
  const visibility = useStore((state) => state.visibility);
  const toggleVisibility = useStore((state) => state.toggleVisibility);
  const activeStarfieldLabel = STARFIELD_SOURCE_LABELS.hyg;

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
    : "absolute right-0 top-0 z-50 flex items-start";

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
  // Menu structure v3.1 filing-cabinet model: all 4 "papers" share a
  // common top anchor at the viewport's top-safe edge. Stride between
  // adjacent tabs is 78 px = 86 px tab height − 8 px overlap (matches
  // the shared negative-top-margin overlap applied in Overlay and in
  // this component's rail). LayersPanel sits one stride below SearchBar
  // in the Overlay stack, so the open-panel wrapper climbs back up by
  // one stride to reach the shared top anchor. Handle Y uses
  // `openPanelIndex + 1` to account for Search being stack-index 0
  // (handled by SearchBar itself).
  const openPanelWrapperStyle = !isMobile
    ? getRightControlDesktopWrapperOffsetStyle()
    : undefined;
  const openPanelHandleOffset =
    !isMobile && openPanelIndex >= 0
      ? getRightControlDesktopHandleOffsetStyle(openPanelIndex + 1)
      : undefined;
  const mobileClosedTabClassName = `command-shell ghost-border relative z-[60] flex ${RIGHT_CONTROL_MOBILE_TAB_HEIGHT_CLASS} ${RIGHT_CONTROL_MOBILE_TAB_WIDTH_CLASS} -translate-x-[0.5rem] items-center justify-center overflow-hidden rounded-r-[0.95rem] px-1 py-1.5 text-[10px] font-orbitron uppercase tracking-[0.16em] text-nasa-accent transition-[transform,border-color,color,background-color,box-shadow] hover:-translate-x-[0.2rem] hover:border-nasa-accent/35 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation`;
  const mobileActiveTabClassName = `command-shell ghost-border relative z-[60] flex ${RIGHT_CONTROL_MOBILE_TAB_HEIGHT_CLASS} ${RIGHT_CONTROL_MOBILE_TAB_WIDTH_CLASS} items-center justify-center overflow-hidden rounded-r-[0.95rem] px-1 py-1.5 text-[10px] font-orbitron uppercase tracking-[0.16em] text-white shadow-[0_0_18px_rgba(0,240,255,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation`;
  // Menu structure v3.1 filing-cabinet shape: tabs use a clip-path
  // polygon that slants the top and bottom edges by 8 px. Matching the
  // overlap to that slant gives a slightly steeper, more legible file-tab
  // silhouette while keeping the stack interlocked.
  const desktopClosedTabClassName = `command-shell ghost-border relative z-[60] flex ${RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_CLASS} ${RIGHT_CONTROL_DESKTOP_TAB_WIDTH_CLASS} translate-x-[0.5rem] items-center justify-center overflow-hidden ${RIGHT_CONTROL_DESKTOP_TAB_SHAPE_CLASS} ${RIGHT_CONTROL_DESKTOP_TAB_SHADOW_CLASS} px-1 py-1.5 text-[10px] font-orbitron uppercase tracking-[0.16em] text-nasa-accent transition-[transform,border-color,color,background-color,box-shadow] hover:translate-x-[0.2rem] hover:border-nasa-accent/35 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation`;
  // Active handle: stronger visual weight (faint nasa-accent fill,
  // stronger border, subtle glow) + same angled shape as closed tabs.
  const desktopOpenTabClassName = `command-shell ghost-border relative z-[1] -mr-px flex ${RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_CLASS} ${RIGHT_CONTROL_DESKTOP_TAB_WIDTH_CLASS} shrink-0 items-center justify-center overflow-hidden ${RIGHT_CONTROL_DESKTOP_TAB_SHAPE_CLASS} ${RIGHT_CONTROL_DESKTOP_TAB_SHADOW_CLASS} border-nasa-accent/40 bg-nasa-accent/[0.08] px-1 py-1.5 text-[10px] font-orbitron uppercase tracking-[0.16em] text-white shadow-[0_0_14px_rgba(0,240,255,0.14)] transition-[color,border-color,background-color,box-shadow] hover:border-nasa-accent/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation`;
  const desktopPanelShellClassName =
    "command-shell ghost-border tech-corners panel-scan flex items-stretch overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.45)]";
  // Phase-2: pr-10 on desktop keeps panel content clear of the
  // closed-tabs column overlaying the panel's right edge. Closed tabs
  // are 40 px wide with an 8 px translate-x shift, so their left edge
  // sits 32 px from the panel's right edge; pr-10 (40 px) leaves an
  // 8 px breathing buffer on top of that.
  const panelBodyClassName = isMobile
    ? "flex h-full max-h-[inherit] flex-col overflow-hidden"
    : "flex max-h-[min(78vh,42rem)] w-[min(24rem,calc(100vw-5.25rem))] flex-col overflow-hidden p-4 pr-8";

  const panelSections =
    openPanel === "view" ? (
      <div className="space-y-3">
        <Accordion label="World" defaultOpen={!isMobile}>
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
        </Accordion>

        <Accordion label="Bodies" defaultOpen={!isMobile}>
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
        </Accordion>

        <Accordion label="Guides" defaultOpen={!isMobile}>
          <div className="space-y-3">
            <Toggle label="Icons" checked={showIcons} onChange={toggleIcons} />
            <Toggle
              label="Labels"
              checked={showLabels}
              onChange={toggleLabels}
            />
            {showLabels && (
              <div className="space-y-2 border border-white/5 bg-black/20 p-3">
                <SubsectionLabel>Label Renderer</SubsectionLabel>
                <div
                  role="group"
                  aria-label="Label renderer"
                  className="grid grid-cols-2 gap-2"
                >
                  {LABEL_MODES.map((mode) => (
                    <ChoiceButton
                      key={mode}
                      label={LABEL_MODE_LABELS[mode]}
                      isActive={labelMode === mode}
                      onClick={() => setLabelMode(mode)}
                    />
                  ))}
                </div>
              </div>
            )}
            <Toggle
              label="Orbits"
              checked={showOrbits}
              onChange={toggleOrbits}
            />
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
              label="Grid"
              checked={showEclipticGrid}
              onChange={toggleEclipticGrid}
            />
            <Toggle
              label="Prograde Vector"
              checked={showProgradeVector}
              onChange={toggleProgradeVector}
            />
          </div>
        </Accordion>

        <Accordion label="Backdrop" defaultOpen={!isMobile}>
          <div className="space-y-3">
            <Toggle
              label="Starfield"
              checked={showStarfield}
              onChange={toggleShowStarfield}
            />
            <div className="space-y-3 border border-white/5 bg-black/20 p-3">
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
                  : `Background stars hidden. Re-enable Starfield to draw the ${STARFIELD_SOURCE_LABELS.hyg} catalog.`}
              </div>
            </div>
          </div>
        </Accordion>
      </div>
    ) : openPanel === "display" ? (
      <DisplayPanel />
    ) : openPanel === "a11y" ? (
      <A11yPanel />
    ) : null;

  const panelContent =
    openPanel && openPanelCopy ? (
      <div
        id={getRightControlPanelDomId(openPanel)}
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

        <div className="custom-scrollbar scroll-fade-bottom min-h-0 space-y-6 overflow-y-auto overscroll-contain pr-1">
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
      {/* Rail flex-col with 8 px overlap between adjacent tabs via the
          shared overlap utility (matches Overlay's SearchBar ↔ LayersPanel
          overlap). Descending z-index per tab (Search 63 > View 62 >
          Display 61 > Access 60) so upper tabs stack on top of lower
          tabs in the overlap zones — gives the fichário-empilhado look. */}
      <div
        className={`flex flex-col items-stretch ${RIGHT_CONTROL_DESKTOP_TAB_OVERLAP_CLASS}`}
      >
        {controlButtons.map((button, index) => {
          const isOpen = activePanel === button.id;
          // index here is within `controlButtons` (View=0, Display=1,
          // Access=2). Search lives in SearchBar at stack-index 0, so
          // LayersPanel's buttons occupy stack-indices 1-3 → z=62-60.
          const zIndex = 62 - index;

          if (!isMobile && isOpen) {
            return (
              <div
                key={button.id}
                aria-hidden="true"
                className={`${RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_CLASS} ${RIGHT_CONTROL_DESKTOP_TAB_WIDTH_CLASS}`}
                style={{ zIndex }}
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
              style={{ zIndex }}
            >
              <RailTabContent panelId={button.id} label={button.label} />
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
            style={openPanelWrapperStyle}
            initial={{
              opacity: 0,
              x: isMobile ? -56 : RIGHT_CONTROL_DESKTOP_PANEL_EXIT_X,
              scale: 0.98,
            }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{
              opacity: 0,
              x: isMobile ? -56 : RIGHT_CONTROL_DESKTOP_PANEL_EXIT_X,
              scale: 0.98,
            }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            {isMobile ? (
              <div className="tech-panel tech-corners panel-scan flex h-full max-h-[inherit] flex-col overflow-hidden p-4 shadow-[0_0_30px_rgba(0,0,0,0.45)]">
                {panelContent}
              </div>
            ) : (
              <div className="relative flex items-start">
                {openPanelButton && (
                  <button
                    type="button"
                    data-right-control-trigger={openPanelButton.id}
                    onClick={() => setActivePanel(null)}
                    aria-label={`Close ${openPanelCopy.title.toLowerCase()} panel`}
                    aria-expanded={true}
                    aria-controls={`atlas-${openPanel}-panel`}
                    className={desktopOpenTabClassName}
                    style={openPanelHandleOffset}
                  >
                    <RailTabContent
                      panelId={openPanelButton.id}
                      label={openPanelButton.label}
                    />
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
