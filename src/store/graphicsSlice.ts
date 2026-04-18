/**
 * Graphics + accessibility slice contracts (Wave α Commit 3 / R2 Wave 1).
 *
 * Keeps the shapes that `src/store.ts` inlines into the main `AppState`
 * in one testable place. State defaults, setter semantics (flip-to-
 * Custom on any override, reset-to-preset clears overrides), and the
 * persist migration's v0→v1 mapping all reference these types.
 *
 * Why a separate file: `src/store.ts` is already dense with bridges
 * (simulationClock, persist config, HMR). Landing the Wave 1 contract
 * here makes the slice contents greppable on their own, lets unit
 * tests import shapes without dragging the Zustand module-level side
 * effects (see `src/store.persistMigration.test.ts` for the precedent),
 * and gives Wave 6's compat-shim cleanup a single file to retire.
 */

import type {
  GraphicsOverrides,
  GraphicsPresetName,
} from "../lib/graphics/resolver";

export type { GraphicsOverrides, GraphicsPresetName };

export type GraphicsBasePreset = Exclude<GraphicsPresetName, "custom">;

/** Colorblind correction modes — R1-dependent, grayed in Wave 1. */
export type ColorblindMode =
  | "none"
  | "protanopia"
  | "deuteranopia"
  | "tritanopia";

/** Accessibility state — sibling of GraphicsState on the root store. */
export interface AccessibilityState {
  /**
   * True when the user (or `prefers-reduced-motion`) has asked for
   * reduced motion. Wave 1 exposes the toggle in `A11yPanel`; the
   * effect on camera auto-rotate / framer-motion transitions lands
   * wave-by-wave as motion surfaces are touched.
   */
  reducedMotion: boolean;
  /**
   * UI scale factor, 0.8–1.5 (80–150 %). Applied to the root HTML
   * element's `font-size` via CSS var; all Tailwind rem-based sizes
   * scale together.
   */
  uiScale: number;
  /** R1-dependent (deferred to Wave 4); grayed in Wave 1. */
  colorblindMode: ColorblindMode;
  /** R1-dependent (deferred to Wave 4); grayed in Wave 1. */
  highContrast: boolean;
}

/** Graphics slice — render settings + override layer. */
export interface GraphicsState {
  /** User-selected preset; `custom` when any override is set. */
  graphicsPreset: GraphicsPresetName;
  /** When true, device signals pick the tier and the dropdown is inert. */
  graphicsAutoMode: boolean;
  /** Per-field overrides. Empty record = preset base. */
  graphicsOverrides: GraphicsOverrides;
  /**
   * The preset that was active when the user first mutated an
   * override. Lets "Reset to <base>" stay meaningful once
   * `graphicsPreset` flips to `custom`. Persisted for this reason.
   */
  customBase: GraphicsBasePreset;
}

/** Default graphics slice for a first-boot user (auto-detect, no overrides). */
export const DEFAULT_GRAPHICS_STATE: GraphicsState = {
  graphicsPreset: "high",
  graphicsAutoMode: true,
  graphicsOverrides: {},
  customBase: "high",
};

/**
 * Default accessibility state. `reducedMotion` reads the OS media query
 * when available; otherwise defaults to `false`. UI scale defaults to
 * 1.0 (no scaling).
 */
export const getDefaultAccessibilityState = (): AccessibilityState => ({
  reducedMotion:
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  uiScale: 1,
  colorblindMode: "none",
  highContrast: false,
});

/**
 * Resolve the preset label the UI should display. When any override is
 * non-empty and the persisted preset is not already "custom", the UI
 * flips to `custom` and the Reset button surfaces.
 *
 * This is a derived selector rather than a setter rule so the flip
 * behavior stays easy to unit-test without Zustand in the loop.
 */
export const deriveDisplayedPreset = (
  graphicsPreset: GraphicsPresetName,
  graphicsOverrides: GraphicsOverrides
): GraphicsPresetName => {
  if (graphicsPreset === "custom") return "custom";
  const hasAnyOverride = Object.values(graphicsOverrides).some(
    (v) => v !== undefined
  );
  return hasAnyOverride ? "custom" : graphicsPreset;
};
