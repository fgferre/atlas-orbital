/**
 * Pure override-resolution math for `useVisualPresetLerp`.
 *
 * The hook remains the only imperative caller that mutates effect /
 * light refs, but the math that turns `(preset, overrides, multiplier)`
 * into the target numbers lives here as a pure function so:
 *
 * 1. The "identity when `overrides = {}`" contract is a pure-function
 *    equality check — stricter than a Playwright pixel-diff (see
 *    `visualPresetOverrides.test.ts`).
 * 2. `useEffectiveGraphics` + DisplayPanel's sliders plug into the
 *    same function without touching the hook.
 * 3. Unit-testable in vitest without R3F / THREE.
 *
 * Composition conventions (graphics-settings-design §5 + §0):
 *   - `*Mul` fields: multiplier over the preset base (default 1).
 *   - `*Delta` fields: additive delta over the preset base (default 0).
 *   - bare fields (e.g. `bloomThreshold`): absolute override
 *     (default = preset value).
 *
 * `bloomIntensity` additionally composes with the quality-profile
 * gate's `bloomIntensityMultiplier` (ultra 1 / high 1 / balanced 0.75
 * / constrained 0). The resolver folds that multiplier into
 * `PRESET_DEFAULTS.bloomIntensityMul` in `src/lib/graphics/resolver.ts`;
 * we pass it into this function so the hook stays byte-identical to
 * `qualityProfile.ts`'s shipped behavior while both paths coexist.
 *
 * The earlier Leva debug branch (debugMode + debugValues) was removed
 * when the Leva panel retired — the DisplayPanel is the single
 * canonical user surface for these knobs, and the artist-calibration
 * constants that remained live in `src/config/artistCalibration.ts`.
 */

import type { VisualPreset } from "../../../config/visualPresets";

/**
 * Display-only minimum ambient applied on top of each preset's own
 * `ambientIntensity` (invariantly 0.0 in every preset today — see
 * `visualPresets.ts`'s Gaia-fidelity baseline note; that value is never
 * edited by this floor). Atlas's only physical light is a single
 * `decay=0` point light, so an unassisted render leaves the dark side
 * of every body true black — unreadable off a phone or projector, and
 * an outlier against the rest of the category. Assisted-by-default was
 * decided by the product owner (handoffiluminacao.md §1.3) on a
 * triple precedent: Atlas already ships `scaleMode: "didactic"` as an
 * undisclosed-by-default convenience, NASA Eyes defaults to its
 * "Shadow" (assisted) light mode, and the entire comparison set below
 * carries a non-zero ambient floor.
 *
 * 0.02 was chosen as the mid-industry value — it matches Stellarium's
 * hard-coded floor exactly:
 *  - NASA Eyes on the Solar System — 0.005 (bundle-read camera
 *    headlight + ambient, "Shadow" mode, which is the app default)
 *  - Stellarium — 0.02, hard-coded on every body; a realism complaint
 *    against it was closed wontfix (github.com/Stellarium/stellarium
 *    issue #669)
 *  - OpenSpace (AMNH; the most physically-oriented of the three) —
 *    0.05 default across the whole globe
 *
 * This is a DISPLAY control, not a content claim — no scale-pill-style
 * disclosure ships with it yet (blocked on an owner decision, see
 * handoffiluminacao.md §5.6); the Credits panel documents it in the
 * meantime.
 */
export const AMBIENT_VIEWING_FLOOR = 0.02;

/**
 * User override record. Every field is optional; `undefined` means
 * "fall through to the preset base".
 */
export interface GraphicsOverrides {
  /** Multiplier applied to `preset.bloomIntensity × qualityMultiplier`. */
  bloomIntensityMul?: number;
  /** Absolute bloom intensity override; used to opt into bloom over Gaia's 0.0 default. */
  bloomIntensity?: number;
  /** Absolute override for bloom threshold (preset value ignored). */
  bloomThreshold?: number;
  /** Multiplier applied to `preset.saturation`. */
  saturationMul?: number;
  /** Additive delta over `preset.contrast`. */
  contrastDelta?: number;
  /** Additive delta over `preset.brightness`. */
  brightnessDelta?: number;
  /**
   * Multiplier applied to `max(preset.ambientIntensity,
   * AMBIENT_VIEWING_FLOOR)` — i.e. to the display ambient floor, not
   * to the (always-0.0) preset base directly. Default 1 → floor active
   * out of the box; 0 → true zero, the unassisted physical render.
   */
  ambientIntensityMul?: number;
  /** Multiplier applied to `preset.sunIntensity`. */
  sunIntensityMul?: number;
}

/** Shape the hook writes into the effect / light / scene refs. */
export interface ResolvedRefTargets {
  bloomIntensity: number;
  bloomThreshold: number;
  saturation: number;
  brightness: number;
  contrast: number;
  ambientIntensity: number;
  sunIntensity: number;
  shadowIntensity: number;
  envMapIntensity: number;
}

/**
 * Compute the values the hook writes to each ref this frame.
 *
 * Identity invariant: with `overrides = {}` and
 * `bloomIntensityMultiplier = 1`, every field equals the corresponding
 * preset field EXCEPT `ambientIntensity`, which composes the display
 * floor (Onda 1.3 — see `AMBIENT_VIEWING_FLOOR`) on top of the preset's
 * invariant 0.0. `visualPresetOverrides.test.ts` pins both the identity
 * fields and the floor composition against explicit numeric
 * expectations.
 *
 * `shadowIntensity` / `envMapIntensity` still pass the preset value
 * straight through — their DisplayPanel multipliers were removed in
 * Onda 1.1 (SmartSunLight is inert; the env cubemap's intensity is
 * force-zeroed by every preset) but `useVisualPresetLerp` still writes
 * both refs every frame, so the fields stay on this contract.
 */
export const resolveLerpRefTargets = (
  preset: VisualPreset,
  overrides: GraphicsOverrides,
  bloomIntensityMultiplier: number
): ResolvedRefTargets => ({
  bloomIntensity:
    overrides.bloomIntensity ??
    preset.bloomIntensity *
      bloomIntensityMultiplier *
      (overrides.bloomIntensityMul ?? 1),
  bloomThreshold: overrides.bloomThreshold ?? preset.bloomThreshold,
  saturation: preset.saturation * (overrides.saturationMul ?? 1),
  brightness: preset.brightness + (overrides.brightnessDelta ?? 0),
  contrast: preset.contrast + (overrides.contrastDelta ?? 0),
  // Floor composes as a max, not an add: it's a guaranteed minimum, not
  // a boost, so it never stacks on top of a preset that someday ships
  // its own non-zero ambient. mul=0 zeroes the whole term (true black
  // survives), mul=1 (default) activates the floor untouched.
  ambientIntensity:
    Math.max(preset.ambientIntensity, AMBIENT_VIEWING_FLOOR) *
    (overrides.ambientIntensityMul ?? 1),
  sunIntensity: preset.sunIntensity * (overrides.sunIntensityMul ?? 1),
  shadowIntensity: preset.shadowIntensity,
  envMapIntensity: preset.envMapIntensity,
});
