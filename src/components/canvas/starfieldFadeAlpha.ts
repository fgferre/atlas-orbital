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

/**
 * T6.4 post-audit P1 follow-up — `a_focusMask` instance attribute.
 *
 * Identifies the focused star regardless of cross-fade ramp state.
 * `a_fadeAlpha` only goes > 0 once `HygStellarMesh.shouldStellarMeshBeActive`
 * crosses the ENTER threshold (~7.7k wu camera distance for typical
 * HYG sizes), but the legacy `dist < u_LEN0` kill (~134k wu)
 * extinguishes the sprite long before that. Without a focus signal
 * separate from the ramp value, the sprite is dead while the mesh
 * hasn't started ramping — neither renders for ~17× distance band.
 *
 * `a_focusMask` is set to 1 the moment the user picks a HYG star
 * (HygStellarMesh effect fires before the gate is even evaluated)
 * so the vertex shader can bypass the LEN0 kill for that one slot
 * across the entire focus lifetime, not just during the ramp.
 *
 * Float32 to match the rest of the instanced upload path, even
 * though only 0/1 values are written. A bool-bit packing would
 * shrink the upload but cost a code-path divergence for marginal
 * memory win at 109 k entries (~430 KB).
 */
export function buildFocusMaskAttribute(count: number): Float32Array {
  return new Float32Array(count);
}
