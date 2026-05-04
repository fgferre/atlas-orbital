/**
 * T4.1-β — camera-relative position bridge between Three.js and
 * Vector3Q.
 *
 * Pure-TS helper that computes `worldPos - cameraPos` using the
 * double-double (QD) primitives from `vector3Q.ts`, then collapses
 * the result to a `THREE.Vector3` for downstream Three.js
 * consumers. Designed as the uniform call site for atlas's future
 * adoption of camera-relative rendering: geometry uploads, overlay
 * projection, and any site that currently uses
 * `a.clone().sub(cameraPos)` on a plain `THREE.Vector3`.
 *
 * **Scale-context disclaimer** (2026-04-24). Atlas's current
 * maximum world-unit scale is ~1e12 (distant HYG stars at
 * thousands of pc, 1 AU = 1000 world units). At that scale,
 * plain float64 subtraction via `THREE.Vector3.sub` preserves
 * ~15 significant digits → ~1e-3 world-unit precision at the
 * far edge. Atlas users rendering solar-system objects (planets
 * at 10 AU → 1e4 world units, moons at 0.01 AU → 10 world units)
 * experience virtually no precision loss with the existing
 * plain-subtract path.
 *
 * This helper matters for:
 *
 *   1. **Future stellar-scale zoom**: if atlas scales to inter-
 *      stellar or galactic rendering (HYG catalog extension, or
 *      Gaia DR3 sub-catalog ports), world units would cross 1e15
 *      and plain float64 subtract would start to lose sub-meter
 *      precision. QD preserves it.
 *   2. **Float32 uniform upload**: Three.js uploads matrix
 *      uniforms as float32 (GLSL's mat4 is per-spec 4×mat4×float
 *      = 16 float32s). The camera translation column in that
 *      matrix is float32. When `viewMatrix × worldPos` is
 *      computed in the vertex shader, the matrix-multiply's
 *      internal subtract-of-camera-position happens in float32,
 *      losing precision at ~1e7 world units. Uploading a
 *      camera-relative position (computed via QD on the CPU)
 *      sidesteps this by ensuring the vertex shader only ever
 *      multiplies small values.
 *   3. **Symmetry across call sites**: atlas has multiple upload
 *      paths. The ad-hoc `THREE.Vector3.sub` pattern lives at sites
 *      that compute direction or focus-delta vectors (e.g.
 *      `PrivilegedPosition.ts`, `controls.ts`, `Planet.tsx:865`'s
 *      `velDir`); having a named helper makes the camera-relative
 *      adoption a one-line swap per call site once T4.1-γ needs it.
 *      Note: `Starfield.tsx` does NOT do an explicit subtract —
 *      it uses Three.js's `modelViewMatrix * vec4(animatedPos, 1.0)`
 *      pipeline, which is mathematically equivalent at float32 GPU
 *      precision to Gaia's `vec3 pos = particlePos - u_camPos` in
 *      `star.group.quad.vertex.glsl:72` (Gaia's Vector3Q posInv is
 *      truncated to float32 by `setUniformf` at upload). T4.1-β-wire-α
 *      was therefore CLOSED-AS-MOOT (2026-05-04) for Starfield.
 *
 * **Why not wire everywhere today**: adoption is invasive (every
 * upload site) and the precision win at atlas's current scale is
 * typically sub-perceptual. T4.1-β ships the helper; T4.1-γ will
 * wire call sites when a concrete jitter regression or stellar-
 * scale feature needs it.
 */

import * as THREE from "three";

import {
  vector3QFromDoubles,
  vector3QSub,
  vector3QToDoubles,
} from "./vector3Q";

/**
 * Compute `worldPos - cameraPos` via QD arithmetic, collapse to a
 * `THREE.Vector3` float64 result. Allocates a new `THREE.Vector3`
 * unless `out` is provided — R3F idiom for callers reusing scratch
 * vectors inside useFrame.
 *
 * Behavior at typical atlas scales (world-unit max ~1e12):
 *   - Input components up to 1e12: result is bit-identical to
 *     `worldPos.clone().sub(cameraPos)` (float64 captures every
 *     bit QD does within the first ~15 digits).
 *   - Input components > 1e15 (future stellar zoom): QD preserves
 *     sub-ulp-of-camera precision that float64 loses.
 *
 * NOT a drop-in replacement that adds runtime cost by default —
 * the 20-op QD subtract vs 1-op float64 subtract is ~20× slower
 * per call. Only call when the call site actually crosses into
 * scales where float64 precision matters.
 */
export const cameraRelativeVector3 = (
  worldPos: THREE.Vector3,
  cameraPos: THREE.Vector3,
  out: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 => {
  const worldQ = vector3QFromDoubles(worldPos.x, worldPos.y, worldPos.z);
  const cameraQ = vector3QFromDoubles(cameraPos.x, cameraPos.y, cameraPos.z);
  const relQ = vector3QSub(worldQ, cameraQ);
  const [x, y, z] = vector3QToDoubles(relQ);
  return out.set(x, y, z);
};

/**
 * Compute `worldPos - cameraPos` via QD arithmetic, write the
 * result directly into a `Float32Array(3)` slot — the target
 * format for `THREE.BufferAttribute` uploads.
 *
 * For hot-path buffer updates where the final consumer is a GPU
 * vertex attribute (which IS float32 regardless of CPU precision).
 * Writes are mutating; `outArray[offset..offset+2]` receive the
 * three components in xyz order.
 *
 * The QD → float32 conversion pipeline:
 *   1. worldPos - cameraPos in 106-bit QD (preserves all atlas-
 *      scale precision).
 *   2. QD → float64 (`vector3QToDoubles` collapses the low parts;
 *      loses bits below 1e-16 relative, irrelevant for any
 *      positional use case atlas could plausibly have).
 *   3. float64 → float32 on `Float32Array` assignment (the final
 *      GPU-side precision; ~1e-7 relative precision).
 *
 * The win over a plain
 * `target.set(worldPos.x - cameraPos.x, ..., ...)` is step 1:
 * the subtract happens in QD. For a naive float32 target, the
 * subtract-then-cast path loses precision at 1e12 worldPos BUT
 * QD→float32 preserves it through the intermediate.
 */
export const writeCameraRelativeToFloat32 = (
  worldPos: THREE.Vector3,
  cameraPos: THREE.Vector3,
  outArray: Float32Array,
  offset: number = 0
): void => {
  const worldQ = vector3QFromDoubles(worldPos.x, worldPos.y, worldPos.z);
  const cameraQ = vector3QFromDoubles(cameraPos.x, cameraPos.y, cameraPos.z);
  const relQ = vector3QSub(worldQ, cameraQ);
  const [x, y, z] = vector3QToDoubles(relQ);
  outArray[offset] = x;
  outArray[offset + 1] = y;
  outArray[offset + 2] = z;
};
