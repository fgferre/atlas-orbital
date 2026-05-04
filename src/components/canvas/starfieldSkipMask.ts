/**
 * T6.0 — per-instance visibility-skip attribute helper for the
 * Starfield instanced billboard mesh. T6.3 will mutate
 * `arr[K] = 1` + `attribute.needsUpdate = true` when a procedural
 * stellar mesh spawns for star K, so the sprite quad nulls (zero
 * alpha + zero solidAngle in the vertex shader) and the mesh
 * renders without stacking (`feedback_no_effect_stacking.md`).
 *
 * Float32 to match the existing `a_size` / `starColor` instanced
 * upload path; uint8 would save 3 bytes per star but cost a separate
 * code-path through `InstancedBufferAttribute` typing for negligible
 * memory win at 109 k entries (~430 KB total).
 */

export function buildSkipMaskAttribute(count: number): Float32Array {
  return new Float32Array(count);
}
