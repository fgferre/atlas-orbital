import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

import { BODIES_BY_ID, SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useQualityProfile } from "../../hooks/useQualityProfile";
import { searchBodies, type BodySearchResult } from "../../lib/bodySearch";
import { formatHygFocusId } from "../../lib/focus/hygFocusResolver";
import {
  getCachedHygCatalog,
  hygTierForQuality,
  loadHygCatalog,
  type HygCatalogData,
} from "../../lib/starfield";
import {
  searchHygCatalog,
  type HygSearchResult,
} from "../../lib/starfield/hygNameIndex";
import { useStore } from "../../store";
import { useStarfieldCatalog } from "../canvas/useStarfieldCatalog";
import { RailTabContent } from "./RightControlRail";
import {
  getRightControlPanelDomId,
  RIGHT_CONTROL_DESKTOP_PANEL_EXIT_X,
  RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_CLASS,
  RIGHT_CONTROL_DESKTOP_TAB_SHADOW_CLASS,
  RIGHT_CONTROL_DESKTOP_TAB_SHAPE_CLASS,
  RIGHT_CONTROL_DESKTOP_TAB_WIDTH_CLASS,
  RIGHT_CONTROL_MOBILE_TAB_HEIGHT_CLASS,
  RIGHT_CONTROL_MOBILE_TAB_WIDTH_CLASS,
  RIGHT_CONTROL_TRIGGER_SELECTOR,
  SEARCH_QUICK_TARGETS,
  type RightControlPanelId,
} from "./controlPanelConfig";

const getOptionId = (listboxId: string, optionKey: string) =>
  `${listboxId}-option-${optionKey}`;

/**
 * M6-C: HYG matches show up to 5 suggestions per the wave-file spec.
 * Curated body matches stay at the existing 6/8 (mobile/desktop)
 * cap so the combined listbox doesn't exceed 13 items at the
 * desktop maximum — long lists hurt keyboard-nav ergonomics.
 */
const HYG_RESULTS_LIMIT = 5;

type SearchHit =
  | { kind: "body"; key: string; result: BodySearchResult }
  | { kind: "hyg"; key: string; result: HygSearchResult };

/**
 * Format the display strings for a HYG match. Primary line is the
 * proper name when present, falling back to "α CMa" / "HD 48915" /
 * "HIP 32349" / Gliese designation per match-field. Secondary line
 * always carries spect class + distance ("A1V · 2.64 pc") when the
 * catalog has those fields.
 */
function formatHygDisplay(hit: HygSearchResult): {
  primary: string;
  secondary: string;
} {
  let primary: string;
  if (hit.properName) {
    primary = hit.properName;
  } else if (hit.bayerGreek && hit.constellation) {
    primary = `${hit.bayerGreek} ${hit.constellation}`;
  } else if (hit.matchedField === "hd" && hit.hd) {
    primary = `HD ${hit.hd}`;
  } else if (hit.matchedField === "hip" && hit.hip) {
    primary = `HIP ${hit.hip}`;
  } else if (hit.gliese) {
    primary = hit.gliese;
  } else {
    primary = `Star #${hit.starIndex}`;
  }

  const segments: string[] = [];
  if (hit.spect) segments.push(hit.spect);
  if (hit.distancePc !== null && Number.isFinite(hit.distancePc)) {
    segments.push(`${hit.distancePc.toFixed(2)} pc`);
  }
  return { primary, secondary: segments.join(" · ") };
}

interface SearchBarProps {
  activePanel: RightControlPanelId | null;
  setActivePanel: (panel: RightControlPanelId | null) => void;
  onPanelExitComplete?: () => void;
}

export const SearchBar = ({
  activePanel,
  setActivePanel,
  onPanelExitComplete,
}: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isOpen = activePanel === "search";

  const selectId = useStore((state) => state.selectId);
  const qualityMode = useStore((state) => state.qualityMode);
  const deferredQuery = useDeferredValue(query);
  const bodyResults = useMemo(
    () => searchBodies(deferredQuery, SOLAR_SYSTEM_BODIES, isMobile ? 6 : 8),
    [deferredQuery, isMobile]
  );

  // M6-C: subscribe to the same tier-bound HYG catalog Starfield +
  // CameraController use, so search results from the catalog can be
  // dispatched as `hyg:K` focus IDs through the existing focus path.
  const qualityProfile = useQualityProfile(qualityMode);
  const hygTier = hygTierForQuality(qualityProfile.name);
  const loadHygForTier = useCallback(() => loadHygCatalog(hygTier), [hygTier]);
  const getCachedHygForTier = useCallback(
    () => getCachedHygCatalog(hygTier),
    [hygTier]
  );
  const hygCatalog = useStarfieldCatalog<HygCatalogData>({
    source: "hyg",
    loadCatalog: loadHygForTier,
    getCachedCatalog: getCachedHygForTier,
  });
  const hygResults = useMemo(() => {
    if (!hygCatalog) return [] as HygSearchResult[];
    return searchHygCatalog(deferredQuery, hygCatalog, HYG_RESULTS_LIMIT);
  }, [deferredQuery, hygCatalog]);

  // Flat unified result list — keyboard nav indexes a single array
  // even though the listbox renders a "Curated bodies" + "HYG stars"
  // section divider so the user can tell them apart visually.
  const results = useMemo<SearchHit[]>(() => {
    const hits: SearchHit[] = [];
    for (const result of bodyResults) {
      hits.push({ kind: "body", key: `body:${result.body.id}`, result });
    }
    for (const result of hygResults) {
      hits.push({
        kind: "hyg",
        key: `hyg:${result.starIndex}`,
        result,
      });
    }
    return hits;
  }, [bodyResults, hygResults]);

  const quickTargets = useMemo(
    () =>
      SEARCH_QUICK_TARGETS.flatMap(({ id, label }) => {
        const body = BODIES_BY_ID.get(id);

        return body ? [{ id, label }] : [];
      }),
    []
  );

  const closeSearch = useCallback(
    (restoreFocus = false) => {
      setActivePanel(null);
      setQuery("");
      setActiveIndex(-1);

      if (restoreFocus) {
        window.requestAnimationFrame(() => buttonRef.current?.focus());
      }
    },
    [setActivePanel]
  );

  const openSearch = useCallback(() => {
    setActivePanel("search");
  }, [setActivePanel]);

  const handleSelect = useCallback(
    (id: string) => {
      selectId(id);
      closeSearch();
    },
    [closeSearch, selectId]
  );

  /**
   * Unified hit-select that branches by result kind. Curated bodies
   * dispatch their string `body.id` (existing path); HYG matches
   * format the index as a `hyg:K` focus ID via the same
   * `formatHygFocusId` the camera path already understands.
   */
  const handleHitSelect = useCallback(
    (hit: SearchHit) => {
      if (hit.kind === "body") {
        handleSelect(hit.result.body.id);
        return;
      }
      handleSelect(formatHygFocusId(hit.result.starIndex));
    },
    [handleSelect]
  );

  useDialogFocus({
    isOpen: isOpen && isMobile,
    containerRef: panelRef,
    initialFocusRef: inputRef,
    onClose: () => closeSearch(true),
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
        isOpen &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        closeSearch();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [closeSearch, isOpen]);

  useEffect(() => {
    if (isOpen) {
      window.requestAnimationFrame(() =>
        inputRef.current?.focus({ preventScroll: true })
      );
      return;
    }

    const resetFrame = window.requestAnimationFrame(() => {
      setQuery("");
      setActiveIndex(-1);
    });

    return () => window.cancelAnimationFrame(resetFrame);
  }, [isOpen]);

  const resolvedActiveIndex =
    activeIndex >= 0 && activeIndex < results.length
      ? activeIndex
      : results.length > 0
        ? 0
        : -1;
  const activeDescendant =
    resolvedActiveIndex >= 0 && results[resolvedActiveIndex]
      ? getOptionId(listboxId, results[resolvedActiveIndex].key)
      : undefined;
  const hasQuery = deferredQuery.trim().length > 0;

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((current) =>
        current >= results.length - 1 ? 0 : current + 1
      );
      return;
    }

    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? results.length - 1 : current - 1
      );
      return;
    }

    if (
      event.key === "Enter" &&
      resolvedActiveIndex >= 0 &&
      results[resolvedActiveIndex]
    ) {
      event.preventDefault();
      handleHitSelect(results[resolvedActiveIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();

      if (query) {
        setQuery("");
        return;
      }

      closeSearch(true);
    }
  };

  const panelClassName = isMobile
    ? "fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] left-[max(0.2rem,env(safe-area-inset-left))] right-3 top-[calc(env(safe-area-inset-top)+4.75rem)] z-50"
    : "absolute right-0 top-0 z-50";

  // Menu structure v3.1: desktop closed tab uses the same angled
  // clip-path as LayersPanel so Search and View's adjacent edges tile
  // together in the 6 px overlap zone. Mobile path is unchanged
  // (horizontal sheet model, no rail overlap).
  const closedTabClassName = `command-shell ghost-border relative z-[60] flex items-center justify-center overflow-hidden px-1 py-1.5 text-[10px] font-orbitron uppercase tracking-[0.16em] transition-[transform,border-color,color,background-color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation ${
    isMobile
      ? `${RIGHT_CONTROL_MOBILE_TAB_HEIGHT_CLASS} ${RIGHT_CONTROL_MOBILE_TAB_WIDTH_CLASS} -translate-x-[0.5rem] rounded-r-[0.95rem] text-nasa-accent hover:-translate-x-[0.2rem] hover:border-nasa-accent/35 hover:text-white`
      : `${RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_CLASS} ${RIGHT_CONTROL_DESKTOP_TAB_WIDTH_CLASS} translate-x-[0.5rem] ${RIGHT_CONTROL_DESKTOP_TAB_SHAPE_CLASS} ${RIGHT_CONTROL_DESKTOP_TAB_SHADOW_CLASS} text-nasa-accent hover:translate-x-[0.2rem] hover:border-nasa-accent/35 hover:text-white`
  }`;

  const mobileOpenHandleClassName = `command-shell ghost-border relative z-[1] -ml-px flex ${RIGHT_CONTROL_MOBILE_TAB_HEIGHT_CLASS} ${RIGHT_CONTROL_MOBILE_TAB_WIDTH_CLASS} shrink-0 self-center items-center justify-center rounded-r-[0.95rem] px-1 py-1.5 text-[10px] font-orbitron uppercase tracking-[0.16em] text-nasa-accent transition-[color,border-color,background-color,box-shadow] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation`;
  const desktopOpenTabClassName = `command-shell ghost-border relative z-[1] -mr-px flex ${RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_CLASS} ${RIGHT_CONTROL_DESKTOP_TAB_WIDTH_CLASS} shrink-0 items-center justify-center overflow-hidden ${RIGHT_CONTROL_DESKTOP_TAB_SHAPE_CLASS} ${RIGHT_CONTROL_DESKTOP_TAB_SHADOW_CLASS} border-nasa-accent/40 bg-nasa-accent/[0.08] px-1 py-1.5 text-[10px] font-orbitron uppercase tracking-[0.16em] text-white shadow-[0_0_14px_rgba(0,240,255,0.14)] transition-[color,border-color,background-color,box-shadow] hover:border-nasa-accent/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation`;
  const desktopPanelShellClassName =
    "command-shell ghost-border tech-corners panel-scan flex items-stretch overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.45)]";
  const triggerSlotClassName = isMobile
    ? `${RIGHT_CONTROL_MOBILE_TAB_HEIGHT_CLASS} ${RIGHT_CONTROL_MOBILE_TAB_WIDTH_CLASS}`
    : `${RIGHT_CONTROL_DESKTOP_TAB_HEIGHT_CLASS} ${RIGHT_CONTROL_DESKTOP_TAB_WIDTH_CLASS}`;

  // Phase-2: pr-12 on desktop keeps Search content clear of the closed
  // tabs (View/Display/Access) overlaying the panel's right edge.
  const panelBodyClassName = isMobile
    ? "flex h-full min-w-0 flex-1 flex-col overflow-hidden p-3 sm:p-4"
    : "flex max-h-[min(78vh,42rem)] w-[min(24rem,calc(100vw-5.25rem))] min-w-0 flex-col overflow-hidden p-3 pr-8 sm:p-4 sm:pr-10";

  const panelContent = (
    <div
      id={getRightControlPanelDomId("search")}
      ref={panelRef}
      role={isMobile ? "dialog" : undefined}
      aria-modal={isMobile ? true : undefined}
      aria-labelledby="atlas-search-title"
      tabIndex={-1}
      className={panelBodyClassName}
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="min-w-0">
          <div
            id="atlas-search-title"
            className="text-sm font-orbitron uppercase tracking-[0.18em] text-nasa-accent"
          >
            Search
          </div>
          <div className="mt-1 text-[10px] font-rajdhani uppercase tracking-[0.2em] text-white/45">
            PT / EN registry
          </div>
        </div>
        <button
          type="button"
          onClick={() => closeSearch(true)}
          aria-label="Close search panel"
          className="rounded border border-white/10 px-2 py-1 text-[10px] font-orbitron uppercase tracking-[0.16em] text-white/70 transition-colors hover:border-nasa-accent hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
        >
          Close
        </button>
      </div>

      <label htmlFor="atlas-body-search" className="sr-only">
        Search celestial bodies
      </label>
      <input
        id="atlas-body-search"
        ref={inputRef}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-activedescendant={activeDescendant}
        autoComplete="off"
        spellCheck={false}
        inputMode="search"
        name="atlas_body_search"
        placeholder="Search bodies, classes, or TNOs…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleInputKeyDown}
        className="h-12 w-full border border-white/10 bg-black/40 px-4 text-sm uppercase tracking-[0.16em] text-white transition-[border-color,box-shadow] placeholder:text-white/35 focus:border-nasa-accent focus:outline-none focus-visible:shadow-[0_0_0_1px_rgba(0,240,255,0.5)]"
      />

      <div
        className="mt-3 min-h-0 flex-1"
        id={listboxId}
        role={hasQuery ? "listbox" : undefined}
      >
        {!hasQuery ? (
          <div className="space-y-3">
            <p className="text-[10px] font-orbitron uppercase tracking-[0.16em] text-white/55">
              Quick Jumps
            </p>
            <div className="flex flex-wrap gap-2">
              {quickTargets.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelect(id)}
                  className="border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-orbitron uppercase tracking-[0.16em] text-white transition-[border-color,color,background-color] hover:border-nasa-accent hover:text-nasa-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : results.length > 0 ? (
          <div className="custom-scrollbar scroll-fade-bottom max-h-[min(20rem,45vh)] space-y-1 overflow-y-auto overscroll-contain pr-1">
            {results.map((hit, index) => {
              const isActive = index === resolvedActiveIndex;
              const optionId = getOptionId(listboxId, hit.key);
              // Section divider rendered above the first HYG hit so
              // users see "Stars (HYG)" between curated and HYG groups.
              // The header is `aria-hidden` since keyboard nav already
              // skips it (it's not a listbox option).
              const previous = index > 0 ? results[index - 1] : null;
              const showSectionHeader =
                hit.kind === "hyg" && (!previous || previous.kind !== "hyg");

              const baseClassName = `flex w-full items-start justify-between gap-3 border px-3 py-3 text-left transition-[border-color,color,background-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation ${
                isActive
                  ? "border-nasa-accent/60 bg-nasa-accent/10 text-white"
                  : "border-white/5 bg-white/[0.03] text-white/80 hover:border-white/20 hover:bg-white/[0.07]"
              }`;

              if (hit.kind === "body") {
                const classificationLabel =
                  hit.result.body.classification ??
                  hit.result.body.type.toUpperCase();
                return (
                  <button
                    key={hit.key}
                    id={optionId}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleHitSelect(hit)}
                    className={baseClassName}
                  >
                    <div className="min-w-0">
                      <div className="font-orbitron text-[11px] uppercase tracking-[0.16em]">
                        {hit.result.body.name.en}
                      </div>
                      <div className="mt-1 text-[11px] text-white/55">
                        {hit.result.body.name.pt}
                      </div>
                    </div>
                    <span className="shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-nasa-accent">
                      {classificationLabel}
                    </span>
                  </button>
                );
              }

              const display = formatHygDisplay(hit.result);
              return (
                <div key={hit.key}>
                  {showSectionHeader && (
                    <div
                      aria-hidden="true"
                      className="px-1 pb-1 pt-3 text-[9px] font-orbitron uppercase tracking-[0.18em] text-white/35"
                    >
                      Stars (HYG)
                    </div>
                  )}
                  <button
                    id={optionId}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleHitSelect(hit)}
                    className={baseClassName}
                  >
                    <div className="min-w-0">
                      <div className="font-orbitron text-[11px] uppercase tracking-[0.16em]">
                        {display.primary}
                      </div>
                      {display.secondary && (
                        <div className="mt-1 text-[11px] text-white/55">
                          {display.secondary}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-nasa-accent">
                      HYG
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            aria-live="polite"
            className="border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-center text-sm text-white/55"
          >
            No match for “{query}”. Try a Portuguese name, a type like TNO, a
            classification such as Gas Giant, or a star designation like
            “Sirius” / “α CMa” / “HD 48915”.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      data-ui-framing="search-rail"
      className="relative pointer-events-auto"
      data-tutorial-target="search"
    >
      {isOpen ? (
        <div
          aria-hidden="true"
          className={triggerSlotClassName}
          // Menu structure v3.1 §Phase-2: Search is stack-index 0, so its
          // z-index sits above View/Display/Access (62/61/60) for the
          // cascading-stack illusion in overlap zones.
          style={{ zIndex: 63 }}
        ></div>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          data-right-control-trigger="search"
          aria-label="Open search panel"
          aria-expanded={false}
          aria-controls={getRightControlPanelDomId("search")}
          onClick={openSearch}
          className={closedTabClassName}
          style={{ zIndex: 63 }}
        >
          <RailTabContent panelId="search" label="Search" />
        </button>
      )}

      <AnimatePresence
        initial={false}
        onExitComplete={() => {
          if (!isOpen) {
            onPanelExitComplete?.();
          }
        }}
      >
        {isOpen && (
          <motion.div
            className={panelClassName}
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
              <div className="command-shell ghost-border tech-corners panel-scan flex h-full items-stretch overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.45)]">
                {panelContent}
                <button
                  ref={buttonRef}
                  type="button"
                  data-right-control-trigger="search"
                  aria-label="Close search panel"
                  aria-expanded={true}
                  aria-controls={getRightControlPanelDomId("search")}
                  onClick={() => closeSearch(true)}
                  className={mobileOpenHandleClassName}
                >
                  <RailTabContent panelId="search" label="Search" />
                </button>
              </div>
            ) : (
              // Menu structure v3.1 filing-cabinet model: top-align handle
              // and panel body so the "tab" sits at the very top of the
              // Search paper (stagger index 0 in the full rail stack).
              <div className="relative flex items-start">
                <button
                  ref={buttonRef}
                  type="button"
                  data-right-control-trigger="search"
                  aria-label="Close search panel"
                  aria-expanded={true}
                  aria-controls={getRightControlPanelDomId("search")}
                  onClick={() => closeSearch(true)}
                  className={desktopOpenTabClassName}
                >
                  <RailTabContent panelId="search" label="Search" />
                </button>
                <div className={desktopPanelShellClassName}>{panelContent}</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
