/**
 * DisplayPanel — user-facing graphics controls.
 *
 * Wave α Commit 3 (R2 Wave 1). Ships the E- and H-class rows from
 * graphics-settings-design.md §3:
 *   - Rendering: Preset, Auto-detect, Resolution Scale, Antialias
 *     (read-only).
 *   - Post-Processing: Bloom (enabled), Bloom Intensity, Bloom
 *     Threshold, Tone Mapping, Contrast, Brightness, Saturation.
 *   - Atmosphere & Sun: Ambient Floor, Sun Brightness, Sun Render.
 *
 * lighting-redesign Onda 1.1 (2026-07-28) removed four controls that
 * measurably did nothing: Shadow Map Size + Env Map Resolution fed an
 * inert `SmartSunLight` (layer-1 light the render camera never sees —
 * `SceneLighting.tsx`) and a cubemap whose `envMapIntensity` every
 * preset force-zeroes (`visualPresets.ts`); Shadow Light × and Env
 * Reflections × were their live-value siblings. Ambient Light × was
 * kept and repurposed as "Ambient Floor ×" — see Onda 1.3's
 * `AMBIENT_VIEWING_FLOOR` in `visualPresetOverrides.ts`. Full trail in
 * `tasks/waves/lighting-redesign-2026-07-28.md`.
 *
 * Deferred from Wave 1 per Finding 7 + scope:
 *   - Exposure slider: `@react-three/postprocessing` tone mapping has
 *     no user-exposed exposure prop and `gl.toneMappingExposure` is a
 *     no-op under the renderer-level `NoToneMapping` contract noted in
 *     Scene.tsx:508. Sub-pull 1c shipped the plumbing
 *     (`src/lib/graphics/exposureRegistry.ts` + the
 *     `ExposureBridge` that pushes the registry scalar into
 *     `gl.toneMappingExposure` per frame), so the path now exists.
 *     The slider itself stays deferred until 1d (the value is
 *     currently driven by eye-adaptation or a future photometric-EV
 *     readout, not directly by a UI control); shipping the slider now
 *     without 1d would expose the registry as a manual stop dial,
 *     which is a different control than the planned canonical
 *     exposure UI. Amendment note lives in
 *     tasks/graphics-settings-design.md §3.
 *   - Camera Effects + Textures & LoD sections: hidden until the R1
 *     effects and LoD system land (Waves γ / η / R3).
 *
 * Hot-path hygiene (L19): shallow-selects only the slice fields it
 * needs. Does NOT subscribe to `displayedDatetime`, overlay items, or
 * any per-frame store surface.
 */

import { useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";

import { VISUAL_PRESETS } from "../../config/visualPresets";
import { useStore } from "../../store";
import {
  DEFAULT_SUNLIGHT_ASSIST_POLICY,
  getSunlightAssistPolicy,
  setSunlightAssistPolicy,
  subscribeSunlightAssistPolicy,
  type SunlightAssistPolicy,
} from "../../lib/graphics/solarIrradiance";
import {
  useActiveGraphicsPreset,
  useEffectiveGraphics,
} from "../../hooks/useEffectiveGraphics";
import { deriveDisplayedPreset } from "../../store/graphicsSlice";
import type {
  GraphicsPresetName,
  ToneMappingName,
} from "../../lib/graphics/resolver";
import type { StarOpticsProfile } from "../../lib/starfieldShaderMath";
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
  { id: "none", label: "None" },
  { id: "agx", label: "AgX" },
  { id: "aces", label: "ACES" },
  { id: "reinhard", label: "Reinhard" },
  { id: "cineon", label: "Cineon" },
];

/**
 * Simulated aperture for the star field's diffraction spikes.
 *
 * Labelled by the optics that produce them rather than by a look name,
 * because the spike COUNT is real geometry — N support vanes give N
 * spikes for even N, and JWST's hexagonal segments give six — while a
 * star itself has none. Default is the unaided eye, so nothing is added
 * to the sky unless the user asks for it and can see what they asked
 * for. The Credits panel names the active profile.
 */
/**
 * How much of each body's real solar irradiance the viewer is shown.
 *
 * Labelled by visible consequence, never by provenance: no position may be
 * called "Scientific" while `SceneLighting.tsx`'s `pointLight` still carries
 * `decay = 0` (`handoffiluminacao.md` §6 item 3) — that would claim a rigour
 * the scene light does not have. Unlike everything else in this panel these
 * are **content** positions, not display ones, so the fidelity badge in the
 * top-left names the active one and colours itself amber for the two that
 * deviate. See `src/lib/graphics/solarIrradiance.ts`.
 */
const SUNLIGHT_ASSIST_OPTIONS: Array<{
  id: SunlightAssistPolicy;
  label: string;
}> = [
  { id: "real", label: "True" },
  { id: "assisted", label: "Assisted" },
  { id: "compensated", label: "Equalized" },
];

const STAR_OPTICS_OPTIONS: Array<{ id: StarOpticsProfile; label: string }> = [
  { id: "none", label: "Unaided eye" },
  { id: "newtonian", label: "Reflector (4-vane)" },
  { id: "jwst", label: "Segmented (6-spike)" },
  { id: "cinema", label: "Camera iris (8-blade)" },
];

export const DisplayPanel = () => {
  const {
    graphicsPreset,
    graphicsAutoMode,
    graphicsOverrides,
    customBase,
    sunRenderMode,
    visualPreset,
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
      visualPreset: state.visualPreset,
      setGraphicsPreset: state.setGraphicsPreset,
      setGraphicsAutoMode: state.setGraphicsAutoMode,
      setGraphicsOverride: state.setGraphicsOverride,
      resetGraphicsOverrides: state.resetGraphicsOverrides,
      setSunRenderMode: state.setSunRenderMode,
    }))
  );

  // Not a store field: the render path reads this singleton imperatively from
  // inside `useFrame`, so React subscribes to the same object instead of
  // keeping a second copy that could drift. Same subscription the fidelity
  // badge uses, so the two surfaces can never disagree.
  const sunlightAssist = useSyncExternalStore(
    subscribeSunlightAssistPolicy,
    getSunlightAssistPolicy,
    getSunlightAssistPolicy
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

        {/* LightGlow (theta.3) — cone-spiral halo on the brightest
            catalog stars, on top of the starfield's own analytical
            theta.2 halo. Default true (unaudited — a real-GPU FPS A/B
            couldn't be completed; see resolver.ts's lightGlowEnabled
            JSDoc). Exposed so the owner can A/B it on their own
            hardware. */}
        <Toggle
          label="Light Glow"
          checked={effective.lightGlowEnabled}
          onChange={() =>
            setGraphicsOverride("lightGlowEnabled", !effective.lightGlowEnabled)
          }
        />

        {/* The fallback is the ACTUALLY-APPLIED value, not 0. `effective
            .bloomIntensity` is the absolute override alone, so it is
            `undefined` until the user drags this slider — and rendering that
            as 0 made the control lie in the one direction a control must
            never lie: it read "off" while bloom was running at the preset's
            0.15–0.35, so the first drag UP (to 0.05) made the scene DARKER.
            `resolveLerpRefTargets` composes the real value as
            `overrides.bloomIntensity ?? preset.bloomIntensity ×
            bloomIntensityMultiplier`, and `effective.bloomIntensityMul` is
            that multiplier — so this expression is the same number the
            renderer uses, read from the same two inputs. */}
        <Slider
          label="Bloom Intensity"
          value={
            effective.bloomIntensity ??
            VISUAL_PRESETS[visualPreset].bloomIntensity *
              effective.bloomIntensityMul
          }
          min={0}
          max={2}
          step={0.05}
          disabled={!effective.bloomEnabled}
          onChange={(v) => setGraphicsOverride("bloomIntensity", v)}
          onReset={
            graphicsOverrides.bloomIntensity !== undefined
              ? () => setGraphicsOverride("bloomIntensity", undefined)
              : undefined
          }
          hint="Selective HDR bloom — only genuinely-bright pixels glow."
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

        <Select
          label="Tone Mapping"
          value={effective.toneMapping}
          options={TONE_MAPPING_OPTIONS}
          onChange={(next) => setGraphicsOverride("toneMapping", next)}
          onReset={
            graphicsOverrides.toneMapping !== undefined
              ? () => setGraphicsOverride("toneMapping", undefined)
              : undefined
          }
        />

        <Select
          label="Star Optics"
          value={effective.starOptics}
          options={STAR_OPTICS_OPTIONS}
          onChange={(next) => setGraphicsOverride("starOptics", next)}
          onReset={
            graphicsOverrides.starOptics !== undefined
              ? () => setGraphicsOverride("starOptics", undefined)
              : undefined
          }
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

        {/* Onda 2.2 — the content-assist control. Unlike its neighbours this
            one changes what the render CLAIMS, not how it is displayed, so
            it is disclosed by the fidelity badge (top-left) rather than
            being a silent per-device preference. */}
        <Select
          label="Sunlight"
          value={sunlightAssist}
          options={SUNLIGHT_ASSIST_OPTIONS}
          onChange={setSunlightAssistPolicy}
          onReset={
            sunlightAssist !== DEFAULT_SUNLIGHT_ASSIST_POLICY
              ? () => setSunlightAssistPolicy(DEFAULT_SUNLIGHT_ASSIST_POLICY)
              : undefined
          }
          hint="How much of each world's real solar irradiance you see. True = uncorrected inverse-square (Mercury ~10×, Neptune ~1/900). Assisted (default) keeps the real ordering on a compressed range. Equalized lights every world as if it were at Earth's distance."
        />

        {/* Onda 1.3 — repurposed from the pre-lighting-redesign "Ambient
            Light ×" control. Scales a display-only ambient viewing
            floor (default 0.02, mid-industry — see
            AMBIENT_VIEWING_FLOOR's JSDoc in visualPresetOverrides.ts
            for the NASA Eyes / Stellarium / OpenSpace citations), not
            the always-0.0 preset ambient itself. 0 = true unassisted
            black; 1 (default) = the floor active out of the box. */}
        <Slider
          label="Ambient Floor ×"
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
          hint="Minimum dark-side brightness so shadowed terrain isn't pure black. 0 = physically-accurate darkness."
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
          label="Lens Flare ×"
          value={graphicsOverrides.lensFlareIntensityMul ?? 1}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => setGraphicsOverride("lensFlareIntensityMul", v)}
          onReset={
            graphicsOverrides.lensFlareIntensityMul !== undefined
              ? () => setGraphicsOverride("lensFlareIntensityMul", undefined)
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
  /**
   * Always-visible caption below the group, same role as `Slider`'s `hint`.
   * Used where the option labels alone cannot carry the disclosure.
   */
  hint?: string;
}

const Select = <T extends string | number>({
  label,
  value,
  options,
  onChange,
  onReset,
  disabled = false,
  disabledHint,
  hint,
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
    {!disabled && hint && (
      <div className="mt-1 text-[10px] leading-snug text-white/45">{hint}</div>
    )}
  </div>
);
