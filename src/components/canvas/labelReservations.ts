/**
 * Frame-scoped screen-space reservations shared between the label systems.
 *
 * **Why this exists.** Atlas draws labels from two independent places that
 * project into the same pixels and could not see each other:
 *
 *   - `GridDecadeLabel` — the AU ring labels lying on the ecliptic, with its
 *     own `DECLUTTER_MIN_NDC_GAP` pass.
 *   - `OverlayPositionTracker` — body labels + icons, with its own priority,
 *     hysteresis and bounding-box collision pass.
 *
 * Each was internally consistent and the pair was not, so captures showed
 * "1 AU" struck through "MOON" and, in another framing, through "EARTH".
 * No amount of tuning inside either pass fixes that; the two have to
 * arbitrate against one shared occupancy set.
 *
 * **How.** The grid labels publish their screen boxes each frame; the body
 * tracker seeds its `placedLabels` list from them, so a body label treats an
 * AU label exactly like another body's label. Ordering is guaranteed by
 * `useFrame` priority: `GridDecadeLabel` runs at the default 0,
 * `OverlayPositionTracker` at 10, so the reservations for frame N are always
 * complete before they are read.
 *
 * The generation counter makes staleness impossible to get wrong: if the
 * grid stops publishing (toggled off, faded out, component unmounted) its
 * boxes disappear on the next frame rather than lingering as phantom
 * obstacles. Readers pass the frame they are arbitrating for.
 */

export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

let reservations: LabelBox[] = [];
let generation = -1;

/**
 * Begin publishing for `frame`. Clears anything held from an earlier frame.
 * Safe to call repeatedly within the same frame — only the first call for a
 * given frame resets.
 */
export const beginLabelReservations = (frame: number): void => {
  if (generation === frame) return;
  generation = frame;
  reservations = [];
};

/** Reserve a screen-space box for `frame`. Ignored if the frame moved on. */
export const reserveLabelBox = (frame: number, box: LabelBox): void => {
  if (generation !== frame) return;
  reservations.push(box);
};

/**
 * Boxes reserved for `frame`. Returns empty for any other frame, so a reader
 * can never consume last frame's layout.
 */
export const getLabelReservations = (frame: number): readonly LabelBox[] =>
  generation === frame ? reservations : EMPTY;

const EMPTY: readonly LabelBox[] = [];

/** Test seam — drops all state. */
export const resetLabelReservations = (): void => {
  reservations = [];
  generation = -1;
};
