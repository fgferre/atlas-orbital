import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../../store";

export const ScalePill = () => {
  const { t } = useTranslation();
  const scaleMode = useStore((state) => state.scaleMode);
  const toggleScaleMode = useStore((state) => state.toggleScaleMode);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isDidactic = scaleMode === "didactic";

  return (
    <div
      data-testid="scale-pill"
      className="pointer-events-auto flex items-center transition-all duration-300"
    >
      <div
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-lg backdrop-blur-md transition-all duration-300 ${
          isDidactic
            ? "border-amber-500/40 bg-amber-950/40 text-amber-300 hover:border-amber-400 hover:bg-amber-900/50"
            : "border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-900/50"
        }`}
      >
        <button
          type="button"
          onClick={toggleScaleMode}
          title={t("scalePill.toggleHint")}
          className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded-full"
        >
          <span
            className={`h-2 w-2 rounded-full animate-pulse ${
              isDidactic
                ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
            }`}
          />
          <span className="font-semibold tracking-wide uppercase">
            {isDidactic
              ? t("scalePill.didacticTitle")
              : t("scalePill.realisticTitle")}
          </span>
          {!isCollapsed && (
            <span className="hidden sm:inline opacity-75 font-normal border-l border-white/10 pl-2">
              {isDidactic
                ? t("scalePill.didacticDesc")
                : t("scalePill.realisticDesc")}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? t("scalePill.expand") : t("scalePill.collapse")}
          className="ml-1 opacity-60 hover:opacity-100 transition-opacity p-0.5"
        >
          <svg
            className={`w-3.5 h-3.5 transform transition-transform duration-200 ${
              isCollapsed ? "rotate-180" : ""
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
      </div>
    </div>
  );
};
