/**
 * M3 — per-instance cross-fade attribute helper for the Starfield
 * instanced billboard mesh.
 *
 * Replaces T6.0's binary `a_skipMask` (0/1) with a continuous
 * `a_fadeAlpha` (Float32 [0..1]). Sprite shader multiplies its
 * alpha by `(1.0 - a_fadeAlpha)` so the focused star fades OUT
 * smoothly as `HygStellarMesh`'s `uVisibility` ramps from 0→1 in
 * parallel. Sum invariant: `(focused-sprite alpha + mesh
 * visibility) ≈ 1` throughout the cross-fade.
 *
 * Default value is 0 — every star renders as today (no fade).
 * `HygStellarMesh` writes a continuous ramp [0..1] for the
 * focused star K only; all other entries stay at 0.
 *
 * Float32 to match the existing `a_size` / `starColor` instanced
 * upload path; Uint8 normalized would save 3 bytes per star but
 * cost a separate code-path through `InstancedBufferAttribute`
 * typing for negligible memory win at 109 k entries (~430 KB
 * total).
 */

export function buildFadeAlphaAttribute(count: number): Float32Array {
  return new Float32Array(count);
}
