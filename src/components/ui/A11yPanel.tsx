/**
 * A11yPanel — accessibility controls.
 *
 * Ships the two controls that actually do something:
 *   - Reduced Motion — persists via `accessibility.reducedMotion`. OS
 *     `prefers-reduced-motion` seeds the default on first boot; the toggle
 *     overrides. Runtime surfaces honor it wave-by-wave.
 *   - UI Scale — sets the root `<html>` font-size via CSS var so rem-based
 *     Tailwind sizes scale together.
 *
 * Colorblind Mode and High Contrast used to ship here as disabled rows
 * under an "Available in a future update" heading, so the panel would not
 * gain "surprise new controls" later. That trade is wrong in an
 * accessibility panel specifically: a user who needs high contrast opens
 * this panel and finds the promise broken at the exact moment of need.
 * Same discipline as the "not to scale" pill — do not claim what we do not
 * do. The rows are gone from the UI; `accessibility.colorblindMode` and
 * `accessibility.highContrast` remain in the store and stay persisted, so
 * wiring them later is a UI-only change with no migration.
 */

import { useShallow } from "zustand/react/shallow";

import { useStore } from "../../store";
import { Slider } from "./primitives/Slider";

export const A11yPanel = () => {
  const { reducedMotion, uiScale, setAccessibility } = useStore(
    useShallow((state) => ({
      reducedMotion: state.accessibility.reducedMotion,
      uiScale: state.accessibility.uiScale,
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
    </div>
  );
};

// ── Local primitives ───────────────────────────────────────────────────

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="border-b border-nasa-accent/25 pb-2 text-[10px] font-orbitron uppercase tracking-[0.22em] text-nasa-accent">
    {children}
  </div>
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
    data-testid={`toggle-${label.toLowerCase().replace(/\s+/g, "-")}`}
    className={`flex w-full items-center justify-between gap-3 border border-white/10 bg-black/20 px-3 py-2.5 text-left transition-[border-color,color,background-color] hover:border-white/20 hover:bg-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation`}
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
