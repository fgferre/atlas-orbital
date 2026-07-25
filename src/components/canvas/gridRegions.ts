/**
 * Named regions of the solar system, drawn on the ecliptic plane alongside
 * the numeric AU ladder.
 *
 * **Why.** The grid answered "how far" only as notation. Nobody has an
 * intuition for "100 AU"; everybody has one for "this is where Voyager
 * crossed out of the Sun's bubble". The number stays — it is the honest,
 * checkable quantity — but it now rides a name a learner can attach it to.
 *
 * **Honesty.** These are not sharp edges. The belts are population
 * densities and the heliopause moves with solar activity, so each entry
 * carries the approximation in its own label rather than implying a
 * boundary the data does not support. Values are the conventional figures:
 *
 *  - Earth's orbit — 1 AU by definition of the unit.
 *  - Asteroid belt — main belt, roughly 2.2–3.2 AU; labelled at 2.7.
 *  - Kuiper belt — classical belt inner edge near Neptune's 30 AU
 *    resonance out to ~50 AU; labelled at 40.
 *  - Heliopause — Voyager 1 crossed at 121 AU in Aug 2012 and Voyager 2 at
 *    119 AU in Nov 2018 (NASA/JPL). Labelled at 120.
 *
 * Ordered outward. `au` feeds `AstroPhysics.auToWorld(au, scaleMode)` so a
 * region sits at the same radius the planets do in BOTH scale modes — in
 * didactic mode the compression applies to regions and bodies alike, and
 * the pairing never drifts.
 */
export interface GridRegion {
  /** Heliocentric distance in AU where the label is placed. */
  au: number;
  /** Short name. Kept terse — this competes for space with the AU ladder. */
  label: string;
}

export const GRID_REGIONS: readonly GridRegion[] = [
  { au: 1, label: "Earth's orbit" },
  { au: 2.7, label: "Asteroid belt" },
  { au: 40, label: "Kuiper belt" },
  { au: 120, label: "Heliopause" },
] as const;

/**
 * Regions worth drawing for a given view extent: near enough to be
 * distinguishable from the Sun, far enough not to be off screen. The window
 * is generous because a region label is cheap and a learner zooming out
 * wants the next name to appear before the previous one leaves.
 *
 * `viewExtentAU` is the on-screen extent in AU (the same quantity the ring
 * ladder selects its decade from), so this stays in one space.
 */
export const selectVisibleRegions = (
  viewExtentAU: number
): readonly GridRegion[] => {
  if (!Number.isFinite(viewExtentAU) || viewExtentAU <= 0) return [];
  const outer = viewExtentAU;
  const inner = viewExtentAU / 400;
  return GRID_REGIONS.filter((r) => r.au <= outer && r.au >= inner);
};
