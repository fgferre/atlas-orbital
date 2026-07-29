/**
 * The unified fidelity badge — ONE surface disclosing every axis on which
 * what the viewer sees deviates from what is measured.
 *
 * ## Why one badge and not two pills
 *
 * Owner decision, 2026-07-29 (recorded in
 * `tasks/waves/lighting-redesign-2026-07-28.md`): a single expandable badge
 * grouping Scale and Brightness, not a second permanent pill beside the
 * first. Two permanent amber pills is banner blindness — the second one
 * teaches the viewer to stop reading the first, which costs more honesty than
 * it buys. Collapsed, the badge names every deviation in one line; clicking
 * it expands one row per axis with an honest one-sentence description and the
 * control that changes it.
 *
 * ## Colour semantics (inherited from the pre-Onda-2 ScalePill)
 *
 * Amber = this line deviates from the measured truth. Emerald = this line is
 * faithful. The collapsed badge shows the AGGREGATE: amber if any line
 * deviates, emerald only when all of them are faithful. Both defaults are
 * amber today (`scaleMode: "didactic"`, assist `"assisted"`), which is the
 * point — the app ships assisted and says so.
 */

import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import {
  getSunlightAssistPolicy,
  setSunlightAssistPolicy,
  subscribeSunlightAssistPolicy,
  type SunlightAssistPolicy,
} from "../../lib/graphics/solarIrradiance";
import { useStore } from "../../store";

/**
 * Click order for the Brightness line, most faithful first. The same three
 * positions the Display panel exposes as a Select; this is the one-click
 * affordance next to the disclosure, mirroring how the Scale line has always
 * been directly togglable from the badge.
 */
const ASSIST_CYCLE: readonly SunlightAssistPolicy[] = [
  "real",
  "assisted",
  "compensated",
] as const;

/** i18n key fragment per position — named by visible consequence. */
const ASSIST_KEY: Record<SunlightAssistPolicy, string> = {
  real: "brightnessReal",
  assisted: "brightnessAssisted",
  compensated: "brightnessEqualized",
};

export const FidelityBadge = () => {
  const { t } = useTranslation();
  const scaleMode = useStore((state) => state.scaleMode);
  const toggleScaleMode = useStore((state) => state.toggleScaleMode);
  // One source of truth: the render path reads this singleton imperatively
  // from inside `useFrame`, and React subscribes to the same object rather
  // than keeping a mirrored copy in the zustand store that could drift.
  const assistPolicy = useSyncExternalStore(
    subscribeSunlightAssistPolicy,
    getSunlightAssistPolicy,
    getSunlightAssistPolicy
  );
  const [isExpanded, setIsExpanded] = useState(false);

  const isDidactic = scaleMode === "didactic";
  const assistKey = ASSIST_KEY[assistPolicy];
  const isBrightnessFaithful = assistPolicy === "real";
  const anyDeviates = isDidactic || !isBrightnessFaithful;

  const cycleAssist = () => {
    const index = ASSIST_CYCLE.indexOf(assistPolicy);
    setSunlightAssistPolicy(
      ASSIST_CYCLE[(index + 1) % ASSIST_CYCLE.length] ?? "assisted"
    );
  };

  const scaleTitle = isDidactic
    ? t("fidelityBadge.didacticTitle")
    : t("fidelityBadge.realisticTitle");
  const brightnessTitle = t(`fidelityBadge.${assistKey}Title`);

  return (
    <div
      data-testid="fidelity-badge"
      className="pointer-events-auto flex flex-col items-start transition-all duration-300"
    >
      <div
        className={`flex flex-col rounded-2xl border text-xs shadow-lg backdrop-blur-md transition-all duration-300 ${
          anyDeviates
            ? "border-amber-500/40 bg-amber-950/40 text-amber-300"
            : "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
        }`}
      >
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls="fidelity-badge-detail"
          title={t("fidelityBadge.toggleHint")}
          className={`flex items-center gap-2 rounded-2xl px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 ${
            anyDeviates ? "hover:bg-amber-900/40" : "hover:bg-emerald-900/40"
          }`}
        >
          <StatusDot deviates={anyDeviates} testId="fidelity-aggregate-dot" />
          <span className="font-semibold tracking-wide uppercase">
            {scaleTitle}
          </span>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <span className="font-semibold tracking-wide uppercase">
            {brightnessTitle}
          </span>
          <svg
            aria-hidden="true"
            className={`ml-1 h-3.5 w-3.5 opacity-60 transform transition-transform duration-200 ${
              isExpanded ? "rotate-90" : "-rotate-90"
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {isExpanded && (
          <div
            id="fidelity-badge-detail"
            className="flex flex-col gap-1 border-t border-white/10 px-1.5 pb-1.5 pt-1.5"
          >
            <FidelityLine
              axis={t("fidelityBadge.scaleAxis")}
              title={scaleTitle}
              description={
                isDidactic
                  ? t("fidelityBadge.didacticDesc")
                  : t("fidelityBadge.realisticDesc")
              }
              deviates={isDidactic}
              actionHint={t("fidelityBadge.scaleAction")}
              onActivate={toggleScaleMode}
            />
            <FidelityLine
              axis={t("fidelityBadge.brightnessAxis")}
              title={brightnessTitle}
              description={t(`fidelityBadge.${assistKey}Desc`)}
              deviates={!isBrightnessFaithful}
              actionHint={t("fidelityBadge.brightnessAction")}
              onActivate={cycleAssist}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ── Local primitives ───────────────────────────────────────────────────

const StatusDot = ({
  deviates,
  testId,
}: {
  deviates: boolean;
  testId?: string;
}) => (
  <span
    aria-hidden="true"
    data-testid={testId}
    className={`h-2 w-2 shrink-0 rounded-full animate-pulse ${
      deviates
        ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
        : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
    }`}
  />
);

/**
 * One disclosed axis. The whole row is the control that changes it, so the
 * explanation and the switch are never one click apart — the failure mode
 * where a user reads "NOT TO SCALE" and has no idea what to do about it.
 */
const FidelityLine = ({
  axis,
  title,
  description,
  deviates,
  actionHint,
  onActivate,
}: {
  axis: string;
  title: string;
  description: string;
  deviates: boolean;
  actionHint: string;
  onActivate: () => void;
}) => (
  <button
    type="button"
    onClick={onActivate}
    title={actionHint}
    className={`flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 ${
      deviates ? "hover:bg-amber-900/40" : "hover:bg-emerald-900/40"
    }`}
  >
    <span className="mt-1">
      <StatusDot deviates={deviates} />
    </span>
    <span className="min-w-0">
      <span className="block text-[9px] uppercase tracking-[0.18em] opacity-55">
        {axis}
      </span>
      <span className="block font-semibold uppercase tracking-wide">
        {title}
      </span>
      <span className="block max-w-[15rem] text-[11px] font-normal leading-snug opacity-75">
        {description}
      </span>
    </span>
  </button>
);
