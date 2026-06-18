/**
 * Grid line color for the single square ecliptic floor grid (Workflow
 * #2b redesign, 2026-06-17). The grid is neutral WHITE — two tiers (dim
 * minor cells + brighter 10× section lines) drawn by the drei `<Grid>`
 * material; the single cyan/teal accent is reserved for the measurement
 * layer (the decade scale label + extent disk in `GridDecadeLabel.tsx`).
 *
 * **What was removed.** This module used to port Gaia Sky's three
 * switchable coordinate frames (ecliptic / equatorial / galactic) — the
 * obliquity + ICRS→galactic rotation matrices and per-frame color
 * callouts. The redesign collapses to ONE ecliptic floor (the SSS
 * north-star), so the frames, their matrices, and the per-orientation
 * color swatches are gone.
 *
 * **Re-entry path** (if equatorial / galactic are ever wanted again):
 * follow Celestia's `SkyGrid.orientation` model — keep ONE grid mesh and
 * swap a single orientation quaternion (`getRotationMatrix(alpha, beta,
 * gamma)` per Gaia `Coordinates.java:153-157`: ecliptic = identity,
 * equatorial = `Rz(OBLIQUITY 23.4392808°)`, galactic = the ICRS→galactic
 * Euler rotation `R=32.93192°`, `Q=27.12825°`, `P=192.85948°`) applied as
 * a `<group>` rotation on top of the base XZ-plane tilt — behind an
 * "Advanced" disclosure, not a standing frame switcher. The full matrix
 * math is recoverable from git history (pre-Workflow-#2b
 * `gridOrientation.ts`).
 */
export const GRID_LINE_COLOR = "#ffffff";
