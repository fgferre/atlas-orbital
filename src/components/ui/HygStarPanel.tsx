import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

// Side-effect import so the i18n singleton is initialized before
// `useTranslation` resolves keys here. Production already imports
// `./i18n` from `main.tsx`; this duplicate import is idempotent
// (the module's `i18n.isInitialized` guard short-circuits) and
// keeps the panel self-contained for unit tests that mount it
// without the full app bootstrap chain.
import "../../i18n";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useQualityProfile } from "../../hooks/useQualityProfile";
import { parseHygFocusId } from "../../lib/focus/hygFocusResolver";
import {
  getCachedHygCatalog,
  hygTierForQuality,
  loadHygCatalog,
  type HygCatalogData,
} from "../../lib/starfield";
import { buildHygStarInfo } from "../../lib/starfield/hygStarInfo";
import {
  fetchSummary,
  type WikipediaSummary,
} from "../../lib/wikipedia/wikipediaClient";
import { useStore } from "../../store";
import { useStarfieldCatalog } from "../canvas/useStarfieldCatalog";

const PARSEC_IN_LIGHT_YEARS = 3.26156;

interface WikiState {
  status: "idle" | "loading" | "ready" | "empty" | "error";
  summary?: WikipediaSummary;
  errorMessage?: string;
}

const WIKI_INITIAL: WikiState = { status: "idle" };

export const HygStarPanel = () => {
  const { t, i18n } = useTranslation();
  const selectedId = useStore((state) => state.selectedId);
  const setSelectedId = useStore((state) => state.setSelectedId);
  const wikipediaEnabled = useStore(
    (state) => state.wikipediaIntegrationEnabled
  );
  const qualityMode = useStore((state) => state.qualityMode);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const starIndex = selectedId ? parseHygFocusId(selectedId) : null;

  // Subscribe to the same tier-bound HYG catalog SearchBar +
  // CameraController + HygStellarMesh use; the hook caches per-tier
  // so multiple consumers don't refetch.
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

  const starInfo = useMemo(
    () =>
      hygCatalog && starIndex !== null
        ? buildHygStarInfo(hygCatalog, starIndex)
        : null,
    [hygCatalog, starIndex]
  );

  const wikipediaQuery = starInfo?.wikipediaQuery ?? null;
  const [wikiState, setWikiState] = useState<WikiState>(WIKI_INITIAL);
  const [retryNonce, setRetryNonce] = useState(0);

  // This effect synchronizes Wikipedia fetch state for an external
  // system (network). The set-state calls in the body / `.then` /
  // `.catch` are the canonical "fetch on mount + AbortController"
  // pattern; the rare per-line eslint-disable below mirrors the
  // precedent set in `useStarfieldCatalog.ts` for the same shape
  // of external-data sync that the new lint rule is overzealous on.
  useEffect(() => {
    if (!wikipediaEnabled || !wikipediaQuery) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset
      setWikiState(WIKI_INITIAL);
      return;
    }
    setWikiState({ status: "loading" });
    const controller = new AbortController();
    fetchSummary(wikipediaQuery, {
      lang: i18n.language,
      signal: controller.signal,
    })
      .then((summary) => {
        if (controller.signal.aborted) return;
        if (summary) {
          setWikiState({ status: "ready", summary });
        } else {
          setWikiState({ status: "empty" });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (
          err instanceof Error &&
          (err.name === "AbortError" || err.name === "TimeoutError")
        ) {
          // Treat user-driven aborts as "no result"; let timeouts
          // surface as errors so the user can retry.
          if (err.name === "AbortError") return;
        }
        setWikiState({
          status: "error",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      });
    return () => controller.abort();
  }, [wikipediaEnabled, wikipediaQuery, i18n.language, retryNonce]);

  const handleRetry = useCallback(() => {
    setRetryNonce((n) => n + 1);
  }, []);
  const handleClose = useCallback(() => {
    setSelectedId(null);
  }, [setSelectedId]);

  if (starIndex === null || !starInfo) return null;

  const distanceLy = starInfo.distancePc * PARSEC_IN_LIGHT_YEARS;

  const panelClassName = isMobile
    ? "fixed left-3 right-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] h-[min(58dvh,34rem)] w-auto translate-y-0 opacity-100 pointer-events-auto"
    : "absolute left-4 top-20 w-[min(22rem,calc(100vw-2rem))] xl:w-[min(24rem,calc(100vw-2rem))] translate-x-0 opacity-100 pointer-events-auto";

  return (
    <div
      data-ui-framing="hyg-star-panel"
      data-tutorial-target="info-panel"
      className={`${
        isMobile
          ? "command-shell panel-scan tech-corners ghost-border"
          : "glass-panel"
      } z-30 flex flex-col overflow-hidden transition-[opacity,transform] duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${panelClassName}`}
      style={
        isMobile
          ? undefined
          : {
              maxHeight: "calc(100vh - 120px)",
              clipPath:
                "polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%)",
            }
      }
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-nasa-accent to-transparent opacity-50"></div>

      <button
        onClick={handleClose}
        aria-label={t("hygStarPanel.closeLabel")}
        className="absolute right-3 top-3 z-10 rounded border border-white/10 p-1.5 text-nasa-dim transition-colors hover:text-nasa-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 border-b border-white/10 p-5 pb-4">
          <div className="min-w-0">
            <div className="mb-1 text-[10px] font-rajdhani font-bold uppercase tracking-[0.2em] text-nasa-accent">
              {t("hygStarPanel.title")}
            </div>
            <h1 className="mb-1 text-2xl font-orbitron uppercase tracking-wide text-white truncate">
              {starInfo.primaryName}
            </h1>
            {starInfo.designation && (
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/55 truncate">
                {starInfo.designation}
              </div>
            )}
          </div>
        </div>

        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 pt-4">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
            {starInfo.spect && (
              <StatRow
                label={t("hygStarPanel.fields.spectralClass")}
                value={starInfo.spect}
              />
            )}
            {Number.isFinite(starInfo.tEffK) && (
              <StatRow
                label={t("hygStarPanel.fields.temperature")}
                value={`${Math.round(starInfo.tEffK).toLocaleString(i18n.language)} ${t(
                  "hygStarPanel.units.kelvin"
                )}`}
              />
            )}
            {Number.isFinite(starInfo.radiusSolar) &&
              starInfo.radiusSolar > 0 && (
                <StatRow
                  label={t("hygStarPanel.fields.radius")}
                  value={`${formatSolar(starInfo.radiusSolar)} ${t(
                    "hygStarPanel.units.solarRadii"
                  )}`}
                />
              )}
            {Number.isFinite(starInfo.massSolar) && (
              <StatRow
                label={t("hygStarPanel.fields.mass")}
                value={`${formatSolar(starInfo.massSolar)} ${t(
                  "hygStarPanel.units.solarMasses"
                )}`}
              />
            )}
            {starInfo.distancePc > 0 && (
              <StatRow
                label={t("hygStarPanel.fields.distance")}
                value={`${starInfo.distancePc.toFixed(2)} ${t(
                  "hygStarPanel.units.parsec"
                )} · ${distanceLy.toFixed(2)} ${t(
                  "hygStarPanel.units.lightYear"
                )}`}
              />
            )}
            {Number.isFinite(starInfo.mag) && (
              <StatRow
                label={t("hygStarPanel.fields.apparentMagnitude")}
                value={starInfo.mag.toFixed(2)}
              />
            )}
            {Number.isFinite(starInfo.absmag) && (
              <StatRow
                label={t("hygStarPanel.fields.absoluteMagnitude")}
                value={starInfo.absmag.toFixed(2)}
              />
            )}
            {starInfo.constellation && (
              <StatRow
                label={t("hygStarPanel.fields.constellation")}
                value={starInfo.constellation}
              />
            )}
          </dl>

          {wikipediaEnabled && wikipediaQuery && (
            <WikipediaSection
              state={wikiState}
              onRetry={handleRetry}
              translate={t}
            />
          )}
        </div>
      </div>
    </div>
  );
};

interface StatRowProps {
  label: string;
  value: string;
}

const StatRow = ({ label, value }: StatRowProps) => (
  <>
    <dt className="font-rajdhani uppercase tracking-[0.18em] text-white/45">
      {label}
    </dt>
    <dd className="text-right text-white/85 truncate">{value}</dd>
  </>
);

function formatSolar(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

interface WikipediaSectionProps {
  state: WikiState;
  onRetry: () => void;
  translate: (key: string) => string;
}

const WikipediaSection = ({
  state,
  onRetry,
  translate,
}: WikipediaSectionProps) => {
  return (
    <section
      aria-label={translate("hygStarPanel.wikipedia.heading")}
      className="space-y-2 border-t border-white/10 pt-4"
    >
      <h2 className="text-[10px] font-orbitron uppercase tracking-[0.22em] text-nasa-accent">
        {translate("hygStarPanel.wikipedia.heading")}
      </h2>

      {state.status === "loading" && (
        <div
          aria-live="polite"
          className="space-y-2"
          data-testid="wiki-loading"
        >
          <div className="h-3 w-3/4 rounded bg-white/10 animate-pulse" />
          <div className="h-3 w-full rounded bg-white/10 animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-white/10 animate-pulse" />
          <span className="sr-only">
            {translate("hygStarPanel.wikipedia.loading")}
          </span>
        </div>
      )}

      {state.status === "ready" && state.summary && (
        <div className="space-y-3" data-testid="wiki-ready">
          {state.summary.thumbnailUrl && (
            <img
              src={state.summary.thumbnailUrl}
              alt=""
              loading="lazy"
              className="max-h-[240px] max-w-[240px] rounded border border-white/10"
            />
          )}
          <p className="text-[12px] leading-relaxed text-white/80 line-clamp-6">
            {truncateExtract(state.summary.extract, 250)}
          </p>
          <a
            href={state.summary.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-[10px] font-orbitron uppercase tracking-[0.18em] text-nasa-accent hover:text-white transition-colors"
          >
            {translate("hygStarPanel.wikipedia.readMore")} →
          </a>
        </div>
      )}

      {state.status === "empty" && (
        <p
          aria-live="polite"
          className="text-[11px] text-white/45 italic"
          data-testid="wiki-empty"
        >
          {translate("hygStarPanel.wikipedia.empty")}
        </p>
      )}

      {state.status === "error" && (
        <div className="space-y-2" aria-live="polite" data-testid="wiki-error">
          <p className="text-[11px] text-white/55">
            {translate("hygStarPanel.wikipedia.error")}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded border border-white/15 px-2 py-1 text-[10px] font-orbitron uppercase tracking-[0.18em] text-white/70 transition-colors hover:border-nasa-accent hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent"
          >
            {translate("hygStarPanel.wikipedia.retry")}
          </button>
        </div>
      )}
    </section>
  );
};

function truncateExtract(extract: string, maxChars: number): string {
  if (extract.length <= maxChars) return extract;
  // Don't break mid-word; rewind to the last space inside the
  // budget so the ellipsis lands on a clean boundary.
  const slice = extract.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxChars - 30 ? lastSpace : maxChars;
  return `${extract.slice(0, cut).trimEnd()}…`;
}
