/**
 * Pure-TS port of Gaia Sky's recursive-grid **projection-lines**
 * math (MPL-2.0) — the L-shaped polyline that connects the camera's
 * projection onto the grid plane to the currently-focused body,
 * drawn when `origin=REFSYS` + camera has a focus + the user has
 * projection lines enabled.
 *
 * Source citations under `/tmp/gaiasky/core/src/gaiasky/`:
 *  - `scene/system/update/GridRecUpdater.java:83-102` — the render
 *    gating + the two-segment pipeline.
 *  - `scene/system/update/GridRecUpdater.java:171-178` — `getCFPos`:
 *    transforms camera + focus positions into the grid's local
 *    frame via the grid's transform matrix inverse; returns `cPos`
 *    and `fPos` where `fPos = focus_local - cPos` (vector from
 *    camera to focus in local frame).
 *  - `scene/system/update/GridRecUpdater.java:180-189` — `getZXLine`:
 *    endpoints for the horizontal segment in the grid-local XZ
 *    direction at a constant `-cPos.y` altitude. Final `a.mul(inv)`
 *    + `b.mul(inv)` step returns the points BACK to world space
 *    (the "back to equatorial" comment in source) so the renderer
 *    can place them as world-space lines.
 *  - `scene/system/update/GridRecUpdater.java:191-200` — `getYLine`:
 *    endpoints for the vertical segment from the horizontal
 *    segment's end-point up/down to the focus's actual y-altitude.
 *
 * Gating lives at `GridRecUpdater.java:84` + `config.yaml:381`
 * (`projectionLines: true` default); this module owns only the
 * endpoint math. The atlas mount will gate on the equivalent
 * `gridProjectionLines` store flag.
 *
 * Atlas adaptation notes:
 *   - Gaia's `cPos` / `fPos` are typed as `Vector3D` (libGDX
 *     double-precision); atlas uses `THREE.Vector3` (float32).
 *     The projection lines live in render-space units (same scale
 *     as the rest of the scene), so float32 is plenty for their
 *     ~10k-unit extent.
 *   - Gaia's transform matrix is the grid's `localTransform` (see
 *     `updateLocalTransform` at line 106). For the ecliptic-mode
 *     atlas grid (`GridRecursive.tsx` mounts at world origin,
 *     `rotation-x = -π/2`), the grid's world matrix is a rotation
 *     around X. We accept the rotation matrix as a parameter
 *     instead of reaching into the mesh reference so the math
 *     layer stays pure.
 */

import * as THREE from "three";

/** Scratch vectors reused across `computeProjectionSegments` calls
 *  so the hot-path allocates nothing. Not thread-safe — R3F
 *  serialises frame callbacks so a single scratch set is enough.
 */
const SCRATCH_INV = new THREE.Matrix4();
const SCRATCH_C_LOCAL = new THREE.Vector3();
const SCRATCH_F_LOCAL = new THREE.Vector3();
const SCRATCH_F_RAW_LOCAL = new THREE.Vector3();

export interface GridProjectionSegments {
  /** Horizontal segment endpoints in WORLD space (`GridRecUpdater.java:180-189`
   *  `getZXLine`, with the final `.mul(inv)` step back to equatorial). */
  readonly zxA: THREE.Vector3;
  readonly zxB: THREE.Vector3;
  /** Vertical segment endpoints in WORLD space (`GridRecUpdater.java:191-200`
   *  `getYLine`, with the final `.mul(inv)` step back to equatorial). */
  readonly yA: THREE.Vector3;
  readonly yB: THREE.Vector3;
}

/**
 * Port of `GridRecUpdater.getCFPos(cPos, fPos, camera, focus, tr)`
 * (source lines 171-178). Writes the camera position (in local
 * frame) into `cPos` and the focus-relative-to-camera vector (in
 * local frame) into `fPos`.
 *
 * Gaia's line 177 is `v3b.put(fPos).sub(cPos)` — copy focus into
 * fPos, THEN subtract cPos. Atlas mirrors that exactly: `fPos =
 * focus_local - cPos`.
 */
export const computeCFPos = (
  cameraPosWorld: THREE.Vector3,
  focusPosWorld: THREE.Vector3,
  gridWorldMatrix: THREE.Matrix4,
  outCPosLocal: THREE.Vector3,
  outFPosLocal: THREE.Vector3
): void => {
  // `tr.matrix` in Gaia is the grid's forward transform. `trf` is
  // its inverse (line 173: `trf = inv != null ? mat4.set(inv).inv()
  // : mat4.idt()`). We pre-compute the inverse once per call.
  SCRATCH_INV.copy(gridWorldMatrix).invert();

  // Line 174: `camera.getPos().put(cPos).mul(trf)` — camera pos
  // transformed into grid-local.
  outCPosLocal.copy(cameraPosWorld).applyMatrix4(SCRATCH_INV);

  // Line 175-177: focus predicted position transformed into
  // grid-local, then `fPos = focus_local - cPos`.
  SCRATCH_F_RAW_LOCAL.copy(focusPosWorld).applyMatrix4(SCRATCH_INV);
  outFPosLocal.copy(SCRATCH_F_RAW_LOCAL).sub(outCPosLocal);
};

/**
 * Port of `GridRecUpdater.getZXLine(a, b, cPos, fPos, tr)` (source
 * lines 180-189). Builds the horizontal segment endpoints in
 * grid-local then applies `tr.matrix` (forward matrix, the "back to
 * equatorial" step at lines 186-187) to return world coordinates.
 */
export const computeZXLineEndpoints = (
  cPosLocal: THREE.Vector3,
  fPosLocal: THREE.Vector3,
  gridWorldMatrix: THREE.Matrix4,
  outA: THREE.Vector3,
  outB: THREE.Vector3
): void => {
  // Line 182: a.set(-cPos.x, -cPos.y, -cPos.z)
  outA.set(-cPosLocal.x, -cPosLocal.y, -cPosLocal.z);
  // Line 183: b.set(fPos.x, -cPos.y, fPos.z)
  outB.set(fPosLocal.x, -cPosLocal.y, fPosLocal.z);
  // Lines 184-188: if (inv != null) { a.mul(inv); b.mul(inv); } —
  // Gaia's `inv` is `tr.matrix` (the forward matrix), applied here
  // to take the grid-local coords back to world. The variable
  // naming in source is confusing (the same field is called `inv`
  // but plays the role of "forward transform back to equatorial"
  // at this step); the comment on line 185 "Back to equatorial"
  // confirms the direction.
  outA.applyMatrix4(gridWorldMatrix);
  outB.applyMatrix4(gridWorldMatrix);
};

/**
 * Port of `GridRecUpdater.getYLine(a, b, cPos, fPos, tr)` (source
 * lines 191-200). Vertical segment from the ZX-line's end-point up
 * to the focus's actual y-altitude. Same `inv` back-to-world step.
 */
export const computeYLineEndpoints = (
  cPosLocal: THREE.Vector3,
  fPosLocal: THREE.Vector3,
  gridWorldMatrix: THREE.Matrix4,
  outA: THREE.Vector3,
  outB: THREE.Vector3
): void => {
  // Line 193: a.set(fPos.x, -cPos.y, fPos.z) — matches ZX-line's
  // endpoint b, so the two segments meet continuously.
  outA.set(fPosLocal.x, -cPosLocal.y, fPosLocal.z);
  // Line 194: b.set(fPos.x, fPos.y, fPos.z) — slide y up from
  // -cPos.y to fPos.y while keeping x/z fixed.
  outB.set(fPosLocal.x, fPosLocal.y, fPosLocal.z);
  // Back to world.
  outA.applyMatrix4(gridWorldMatrix);
  outB.applyMatrix4(gridWorldMatrix);
};

/**
 * End-to-end driver — given the camera + focus world positions and
 * the grid's world matrix, writes all four endpoints of the
 * L-polyline into `out`. Mirrors `GridRecUpdater.java:85-98` (the
 * inline block inside `processEntity`).
 *
 * Callers wrap this per frame when `gridProjectionLines` is on and
 * there's an active focus. Returns nothing; writes into the four
 * output vectors the caller owns (so the hot-path can reuse them
 * across frames).
 */
export const computeProjectionSegments = (
  cameraPosWorld: THREE.Vector3,
  focusPosWorld: THREE.Vector3,
  gridWorldMatrix: THREE.Matrix4,
  out: GridProjectionSegments
): void => {
  computeCFPos(
    cameraPosWorld,
    focusPosWorld,
    gridWorldMatrix,
    SCRATCH_C_LOCAL,
    SCRATCH_F_LOCAL
  );
  computeZXLineEndpoints(
    SCRATCH_C_LOCAL,
    SCRATCH_F_LOCAL,
    gridWorldMatrix,
    out.zxA,
    out.zxB
  );
  computeYLineEndpoints(
    SCRATCH_C_LOCAL,
    SCRATCH_F_LOCAL,
    gridWorldMatrix,
    out.yA,
    out.yB
  );
};

/**
 * Allocate a fresh set of output vectors for a caller that wants to
 * own a per-component scratch cache (the typical R3F pattern — a
 * component's `useMemo` creates one set on mount and reuses it every
 * `useFrame`).
 */
export const createGridProjectionSegments = (): GridProjectionSegments => ({
  zxA: new THREE.Vector3(),
  zxB: new THREE.Vector3(),
  yA: new THREE.Vector3(),
  yB: new THREE.Vector3(),
});
