/**
 * A11yPanel — accessibility controls.
 *
 * Wave α Commit 3 (R2 Wave 1). Ships 4 rows per the implementation-
 * plan §83-98:
 *   - Reduced Motion (active, E) — persists via `accessibility.reducedMotion`.
 *     OS `prefers-reduced-motion` media query seeds the default on first
 *     boot; the toggle overrides. Runtime surfaces that should honor it
 *     (camera auto-rotate, framer-motion transitions > 120 ms) pick it
 *     up wave-by-wave.
 *   - UI Scale (active, H) — sets the root `<html>` font-size via CSS
 *     var so rem-based Tailwind sizes scale together.
 *   - Colorblind Mode (grayed, R1) — the `ColorBlindCorrection`
 *     post-process effect it backs lands in Wave 4.
 *   - High Contrast (grayed, R1) — the theme-token swap it backs also
 *     lands in Wave 4.
 *
 * Grayed rows are present in Wave 1 so the panel scope is stable
 * across future waves (users see the intended surface, no "surprise
 * new controls" feel later). Tooltip explains the state explicitly.
 */

import { useShallow } from "zustand/react/shallow";

import { useStore } from "../../store";
import { Slider } from "./primitives/Slider";

export const A11yPanel = () => {
  const {
    reducedMotion,
    uiScale,
    colorblindMode,
    highContrast,
    setAccessibility,
  } = useStore(
    useShallow((state) => ({
      reducedMotion: state.accessibility.reducedMotion,
      uiScale: state.accessibility.uiScale,
      colorblindMode: state.accessibility.colorblindMode,
      highContrast: state.accessibility.highContrast,
      setAccessibility: state.setAccessibility,
    }))
  );
  // Note: the uiScale side-effect (writing document root font-size)
  // lives on App.tsx (Wave α P1.5 fix). Hoisted there so closing this
  // panel doesn't revert the scale, and first-boot users get their
  // persisted value applied without having to open A11y first.

  return (
    <div className="space-y-3" data-testid="a11y-panel">
      <SectionLabel>Accessibility</SectionLabel>

      <Toggle
        label="Reduced Motion"
        checked={reducedMotion}
        onChange={() => setAccessibility("reducedMotion", !reducedMotion)}
      />

      <Slider
        label="UI Scale"
        value={uiScale}
        min={0.8}
        max={1.5}
        step={0.05}
        format={(v) => `${Math.round(v * 100)} %`}
        onChange={(v) => setAccessibility("uiScale", v)}
        onReset={
          uiScale !== 1 ? () => setAccessibility("uiScale", 1) : undefined
        }
      />

      {/* ── Grayed / R1-dependent rows ───────────────────────────────── */}
      <div
        className="space-y-3 border border-dashed border-white/10 bg-white/0 p-3 opacity-70"
        data-testid="a11y-grayed"
      >
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
          Available in a future update
        </div>

        <div>
          <SubsectionLabel>Colorblind Mode</SubsectionLabel>
          <div
            role="group"
            aria-label="Colorblind mode"
            className="grid grid-cols-2 gap-2"
          >
            {[
              { id: "none" as const, label: "None" },
              { id: "protanopia" as const, label: "Protan" },
              { id: "deuteranopia" as const, label: "Deuter" },
              { id: "tritanopia" as const, label: "Tritan" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                disabled
                aria-pressed={colorblindMode === option.id}
                title="Available in a future update"
                className="cursor-not-allowed border border-white/5 bg-black/10 px-3 py-2 text-[10px] font-orbitron uppercase tracking-[0.16em] text-white/25"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <Toggle
          label="High Contrast"
          checked={highContrast}
          disabled
          title="Available in a future update"
          onChange={() => {
            /* grayed — no-op */
          }}
        />
      </div>
    </div>
  );
};

// ── Local primitives ───────────────────────────────────────────────────

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="border-b border-nasa-accent/25 pb-2 text-[10px] font-orbitron uppercase tracking-[0.22em] text-nasa-accent">
    {children}
  </div>
);

const SubsectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/55">
    {children}
  </div>
);

const Toggle = ({
  label,
  checked,
  onChange,
  disabled = false,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  title?: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    title={title}
    onClick={onChange}
    data-testid={`toggle-${label.toLowerCase().replace(/\s+/g, "-")}`}
    className={`flex w-full items-center justify-between gap-3 border border-white/10 bg-black/20 px-3 py-2.5 text-left transition-[border-color,color,background-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation ${
      disabled
        ? "cursor-not-allowed opacity-60"
        : "hover:border-white/20 hover:bg-black/30"
    }`}
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
