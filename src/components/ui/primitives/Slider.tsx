import { useId } from "react";

/**
 * Compact numeric slider used by the Display + A11y panels.
 *
 * Wave α Commit 3 (R2 Wave 1) primitive. Pairs a native `<input
 * type="range">` with a numeric readout and an optional reset button
 * (rendered only when `onReset` is passed — DisplayPanel shows it per-
 * row when the row carries an override off the preset default).
 *
 * Not imported outside the graphics / accessibility panels so far —
 * narrow surface by design. Wave N may promote to a broader primitive
 * if other surfaces pick up numeric sliders.
 */
export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  /** If provided, renders a ⟲ reset button right of the readout. */
  onReset?: () => void;
  /** Formatter for the numeric readout; default = value.toFixed(2). */
  format?: (value: number) => string;
  /** Visually disable the control but keep it in the tab order. */
  disabled?: boolean;
  /** Optional helper / caveat line under the slider. */
  hint?: string;
}

const defaultFormat = (value: number) => value.toFixed(2);

export const Slider = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onReset,
  format = defaultFormat,
  disabled = false,
  hint,
}: SliderProps) => {
  const inputId = useId();
  return (
    <div
      className={`space-y-1 ${disabled ? "opacity-60" : ""}`}
      data-disabled={disabled ? "true" : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="text-[11px] uppercase tracking-[0.14em] text-white/65"
        >
          {label}
        </label>
        <div className="flex items-center gap-1 text-[11px] tabular-nums text-white/85">
          <span>{format(value)}</span>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={disabled}
              aria-label={`Reset ${label}`}
              className="rounded border border-white/10 px-1 text-[10px] leading-none text-white/55 transition-colors hover:border-nasa-accent/40 hover:text-nasa-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-nasa-accent"
            >
              ⟲
            </button>
          )}
        </div>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="w-full accent-nasa-accent"
      />
      {hint && (
        <div className="text-[10px] leading-snug text-white/45">{hint}</div>
      )}
    </div>
  );
};
