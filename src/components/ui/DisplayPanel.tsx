/**
 * DisplayPanel — user-facing graphics controls.
 *
 * Wave α Commit 3 (R2 Wave 1). Ships the E- and H-class rows from
 * graphics-settings-design.md §3:
 *   - Rendering: Preset, Auto-detect, Resolution Scale, Antialias
 *     (read-only), Shadow Map Size, Env Map Resolution.
 *   - Post-Processing: Bloom (enabled), Bloom Intensity, Bloom
 *     Threshold, Tone Mapping, Contrast, Brightness, Saturation.
 *   - Atmosphere & Sun: Ambient, Sun Brightness, Shadow Light, Env
 *     Reflections, Sun Render.
 *
 * Deferred from Wave 1 per Finding 7 + scope:
 *   - Exposure slider: the AgX `<ToneMapping>` effect from
 *     `@react-three/postprocessing` has no user-exposed exposure prop
 *     and `gl.toneMappingExposure` is a no-op under R1 #1A's
 *     `NoToneMapping` renderer. Implementing a real compositor
 *     exposure path is Wave η.6 scope; shipping the slider now would
 *     ship a dead control. Amendment note lives in
 *     tasks/graphics-settings-design.md §3.
 *   - Camera Effects + Textures & LoD sections: hidden until the R1
 *     effects and LoD system land (Waves γ / η / R3).
 *
 * Hot-path hygiene (L19): shallow-selects only the slice fields it
 * needs. Does NOT subscribe to `displayedDatetime`, overlay items, or
 * any per-frame store surface.
 */

import { useShallow } from "zustand/react/shallow";

import { useStore } from "../../store";
import {
  useActiveGraphicsPreset,
  useEffectiveGraphics,
} from "../../hooks/useEffectiveGraphics";
import { deriveDisplayedPreset } from "../../store/graphicsSlice";
import type {
  GraphicsPresetName,
  ToneMappingName,
} from "../../lib/graphics/resolver";
import { Slider } from "./primitives/Slider";

const PRESET_OPTIONS: Array<{
  id: Exclude<GraphicsPresetName, "custom">;
  label: string;
}> = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "ultra", label: "Ultra" },
];

const TONE_MAPPING_OPTIONS: Array<{ id: ToneMappingName; label: string }> = [
  // Finding 7 amend: AgX is the default under R1 #1A's HDR pipeline.
  // Linear is dropped (would break the HDR contract). Wiring through
  // `<ToneMapping mode={...}>` is Wave γ+ scope — Wave 1 persists the
  // user's choice but the composer always runs AgX until then.
  { id: "agx", label: "AgX" },
  { id: "aces", label: "ACES" },
  { id: "reinhard", label: "Reinhard" },
  { id: "cineon", label: "Cineon" },
];

const SHADOW_OPTIONS = [1024, 2048, 4096] as const;
const ENV_RES_OPTIONS = [64, 128, 256] as const;

export const DisplayPanel = () => {
  const {
    graphicsPreset,
    graphicsAutoMode,
    graphicsOverrides,
    customBase,
    sunRenderMode,
    setGraphicsPreset,
    setGraphicsAutoMode,
    setGraphicsOverride,
    resetGraphicsOverrides,
    setSunRenderMode,
  } = useStore(
    useShallow((state) => ({
      graphicsPreset: state.graphicsPreset,
      graphicsAutoMode: state.graphicsAutoMode,
      graphicsOverrides: state.graphicsOverrides,
      customBase: state.customBase,
      sunRenderMode: state.sunRenderMode,
      setGraphicsPreset: state.setGraphicsPreset,
      setGraphicsAutoMode: state.setGraphicsAutoMode,
      setGraphicsOverride: state.setGraphicsOverride,
      resetGraphicsOverrides: state.resetGraphicsOverrides,
      setSunRenderMode: state.setSunRenderMode,
    }))
  );

  const effective = useEffectiveGraphics();
  const activePreset = useActiveGraphicsPreset();
  const displayedPreset = deriveDisplayedPreset(
    graphicsPreset,
    graphicsOverrides
  );

  const isCustom = displayedPreset === "custom";
  // Wave α UX fix: clicking a preset button is the "reset to X"
  // shortcut, so the buttons stay enabled even in Custom mode AND
  // when Auto-detect is on. Clicking:
  //   - in Auto mode → turn Auto off + switch to that preset
  //   - in Custom mode → clear overrides + switch to that preset
  //   - otherwise → plain preset switch
  // Matches AAA convention (CP2077 / Starfield): preset list is
  // always the one-click escape hatch.
  const handlePresetClick = (preset: Exclude<GraphicsPresetName, "custom">) => {
    if (graphicsAutoMode) setGraphicsAutoMode(false);
    setGraphicsPreset(preset);
  };

  return (
    <div className="space-y-6" data-testid="display-panel">
      {/* ── Rendering ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionLabel>Rendering</SectionLabel>

        <Toggle
          label="Auto-detect quality"
          checked={graphicsAutoMode}
          onChange={() => setGraphicsAutoMode(!graphicsAutoMode)}
        />

        <div>
          <SubsectionLabel>
            Preset
            {isCustom && (
              <span
                data-testid="custom-badge"
                className="ml-2 border border-nasa-accent/40 bg-nasa-accent/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-nasa-accent"
              >
                Custom
              </span>
            )}
          </SubsectionLabel>
          <div
            role="group"
            aria-label="Graphics preset"
            className="grid grid-cols-2 gap-2"
          >
            {PRESET_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.id}
                label={option.label}
                // Highlight the active preset even in Custom mode —
                // it's the base the user came from (customBase) and
                // clicking it again resets. That's easier to reason
                // about than a row of equally-grayed buttons.
                isActive={activePreset === option.id}
                onClick={() => handlePresetClick(option.id)}
              />
            ))}
          </div>
          {isCustom && (
            <button
              type="button"
              onClick={resetGraphicsOverrides}
              data-testid="reset-overrides"
              className="mt-2 border border-white/10 px-3 py-1.5 text-[10px] font-orbitron uppercase tracking-[0.16em] text-white/70 transition-colors hover:border-nasa-accent hover:text-nasa-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent"
            >
              Reset to {customBase}
            </button>
          )}
          {graphicsAutoMode && (
            <div className="mt-2 text-[10px] text-white/45">
              Auto resolved to {activePreset}
            </div>
          )}
        </div>

        <Slider
          label="Resolution Scale"
          value={effective.resolutionScale}
          min={1}
          max={2}
          step={0.25}
          onChange={(v) => setGraphicsOverride("resolutionScale", v)}
          onReset={
            graphicsOverrides.resolutionScale !== undefined
              ? () => setGraphicsOverride("resolutionScale", undefined)
              : undefined
          }
        />

        <div>
          <SubsectionLabel>Antialias</SubsectionLabel>
          <div className="flex items-center justify-between gap-2 border border-white/5 bg-black/20 px-3 py-2 text-[11px] text-white/55">
            <span>{effective.antialias ? "On" : "Off"}</span>
            <span className="text-[9px] uppercase tracking-wider text-white/35">
              takes effect on reload
            </span>
          </div>
        </div>

        <Select
          label="Shadow Map Size"
          value={effective.shadowMapSize}
          options={SHADOW_OPTIONS.map((v) => ({ id: v, label: `${v}` }))}
          onChange={(v) => setGraphicsOverride("shadowMapSize", v)}
          onReset={
            graphicsOverrides.shadowMapSize !== undefined
              ? () => setGraphicsOverride("shadowMapSize", undefined)
              : undefined
          }
        />

        <Select
          label="Env Map Resolution"
          value={effective.environmentResolution}
          options={ENV_RES_OPTIONS.map((v) => ({ id: v, label: `${v}` }))}
          onChange={(v) => setGraphicsOverride("environmentResolution", v)}
          onReset={
            graphicsOverrides.environmentResolution !== undefined
              ? () => setGraphicsOverride("environmentResolution", undefined)
              : undefined
          }
        />
      </section>

      {/* ── Post-Processing ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionLabel>Post-Processing</SectionLabel>

        <Toggle
          label="Bloom"
          checked={effective.bloomEnabled}
          onChange={() =>
            setGraphicsOverride("bloomEnabled", !effective.bloomEnabled)
          }
        />

        <Slider
          label="Bloom Intensity ×"
          value={graphicsOverrides.bloomIntensityMul ?? 1}
          min={0}
          max={2}
          step={0.05}
          disabled={!effective.bloomEnabled}
          onChange={(v) => setGraphicsOverride("bloomIntensityMul", v)}
          onReset={
            graphicsOverrides.bloomIntensityMul !== undefined
              ? () => setGraphicsOverride("bloomIntensityMul", undefined)
              : undefined
          }
          hint="Multiplier over the preset and visual-context base."
        />

        <Slider
          label="Bloom Threshold"
          value={effective.bloomThreshold ?? 1.0}
          min={0}
          max={1.5}
          step={0.02}
          disabled={!effective.bloomEnabled}
          onChange={(v) => setGraphicsOverride("bloomThreshold", v)}
          onReset={
            graphicsOverrides.bloomThreshold !== undefined
              ? () => setGraphicsOverride("bloomThreshold", undefined)
              : undefined
          }
          hint="R1 #2 default 1.0 — lower lets more surfaces glow."
        />

        {/* Tone Mapping dropdown intentionally disabled in Wave α.
            The store persists the user's choice in
            `graphicsOverrides.toneMapping`, but the composer in
            `PostProcessingPipeline.tsx` stays pinned to AgX until
            Wave γ wires `<ToneMapping mode={effective.toneMapping}>`
            through. Showing the dropdown as active would let users
            click options that produce zero visible change — hiding it
            behind a disabled state with an explicit tooltip keeps the
            panel honest. */}
        <Select
          label="Tone Mapping"
          value="agx"
          options={TONE_MAPPING_OPTIONS}
          onChange={() => {
            /* disabled — see comment above */
          }}
          disabled
          disabledHint="AgX is the active operator. Dropdown activates in a future update."
        />

        <Slider
          label="Contrast Δ"
          value={graphicsOverrides.contrastDelta ?? 0}
          min={-0.5}
          max={0.5}
          step={0.05}
          onChange={(v) => setGraphicsOverride("contrastDelta", v)}
          onReset={
            graphicsOverrides.contrastDelta !== undefined
              ? () => setGraphicsOverride("contrastDelta", undefined)
              : undefined
          }
        />

        <Slider
          label="Brightness Δ"
          value={graphicsOverrides.brightnessDelta ?? 0}
          min={-0.5}
          max={0.5}
          step={0.05}
          onChange={(v) => setGraphicsOverride("brightnessDelta", v)}
          onReset={
            graphicsOverrides.brightnessDelta !== undefined
              ? () => setGraphicsOverride("brightnessDelta", undefined)
              : undefined
          }
        />

        <Slider
          label="Saturation ×"
          value={graphicsOverrides.saturationMul ?? 1}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => setGraphicsOverride("saturationMul", v)}
          onReset={
            graphicsOverrides.saturationMul !== undefined
              ? () => setGraphicsOverride("saturationMul", undefined)
              : undefined
          }
        />
      </section>

      {/* ── Atmosphere & Sun ────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionLabel>Atmosphere &amp; Sun</SectionLabel>

        <Slider
          label="Ambient Light ×"
          value={graphicsOverrides.ambientIntensityMul ?? 1}
          min={0}
          max={5}
          step={0.1}
          onChange={(v) => setGraphicsOverride("ambientIntensityMul", v)}
          onReset={
            graphicsOverrides.ambientIntensityMul !== undefined
              ? () => setGraphicsOverride("ambientIntensityMul", undefined)
              : undefined
          }
        />

        <Slider
          label="Sun Brightness ×"
          value={graphicsOverrides.sunIntensityMul ?? 1}
          min={0}
          max={5}
          step={0.1}
          onChange={(v) => setGraphicsOverride("sunIntensityMul", v)}
          onReset={
            graphicsOverrides.sunIntensityMul !== undefined
              ? () => setGraphicsOverride("sunIntensityMul", undefined)
              : undefined
          }
        />

        <Slider
          label="Shadow Light ×"
          value={graphicsOverrides.shadowIntensityMul ?? 1}
          min={0}
          max={5}
          step={0.1}
          onChange={(v) => setGraphicsOverride("shadowIntensityMul", v)}
          onReset={
            graphicsOverrides.shadowIntensityMul !== undefined
              ? () => setGraphicsOverride("shadowIntensityMul", undefined)
              : undefined
          }
        />

        <Slider
          label="Env Reflections ×"
          value={graphicsOverrides.envMapIntensityMul ?? 1}
          min={0}
          max={5}
          step={0.1}
          onChange={(v) => setGraphicsOverride("envMapIntensityMul", v)}
          onReset={
            graphicsOverrides.envMapIntensityMul !== undefined
              ? () => setGraphicsOverride("envMapIntensityMul", undefined)
              : undefined
          }
        />

        <div>
          <SubsectionLabel>Sun Render</SubsectionLabel>
          <div
            role="group"
            aria-label="Sun render mode"
            className="grid grid-cols-2 gap-2"
          >
            {[
              { id: "auto" as const, label: "Auto" },
              { id: "procedural" as const, label: "Procedural" },
              { id: "texture" as const, label: "Texture" },
            ].map((option) => (
              <ChoiceButton
                key={option.id}
                label={option.label}
                isActive={sunRenderMode === option.id}
                onClick={() => setSunRenderMode(option.id)}
                isWide={option.id === "auto"}
              />
            ))}
          </div>
        </div>
      </section>
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
  <div className="mb-2 flex items-center text-[10px] uppercase tracking-[0.2em] text-white/55">
    {children}
  </div>
);

const ChoiceButton = ({
  label,
  isActive,
  onClick,
  disabled = false,
  isWide = false,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  isWide?: boolean;
}) => (
  <button
    type="button"
    aria-pressed={isActive}
    disabled={disabled}
    onClick={onClick}
    className={`border px-3 py-2 text-[10px] font-orbitron uppercase tracking-[0.16em] transition-[border-color,color,background-color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation ${
      disabled
        ? "cursor-not-allowed border-white/5 bg-black/10 text-white/25"
        : isActive
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
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={onChange}
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

interface SelectProps<T extends string | number> {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (next: T) => void;
  onReset?: () => void;
  /** When true, every option button is disabled + grayed. */
  disabled?: boolean;
  /** Tooltip + caption below the group when the Select is disabled. */
  disabledHint?: string;
}

const Select = <T extends string | number>({
  label,
  value,
  options,
  onChange,
  onReset,
  disabled = false,
  disabledHint,
}: SelectProps<T>) => (
  <div>
    <SubsectionLabel>
      {label}
      {!disabled && onReset && (
        <button
          type="button"
          onClick={onReset}
          aria-label={`Reset ${label}`}
          className="ml-auto rounded border border-white/10 px-1 text-[10px] leading-none text-white/55 transition-colors hover:border-nasa-accent/40 hover:text-nasa-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-nasa-accent"
        >
          ⟲
        </button>
      )}
    </SubsectionLabel>
    <div
      role="group"
      aria-label={label}
      className={`grid gap-2 ${options.length > 3 ? "grid-cols-2" : "grid-cols-3"}`}
    >
      {options.map((option) => (
        <ChoiceButton
          key={option.id}
          label={option.label}
          isActive={value === option.id}
          disabled={disabled}
          onClick={() => {
            if (!disabled) onChange(option.id);
          }}
        />
      ))}
    </div>
    {disabled && disabledHint && (
      <div className="mt-1 text-[10px] leading-snug text-white/45">
        {disabledHint}
      </div>
    )}
  </div>
);
