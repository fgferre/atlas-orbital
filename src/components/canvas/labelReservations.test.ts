import { beforeEach, describe, expect, it } from "vitest";

import {
  beginLabelReservations,
  getLabelReservations,
  reserveLabelBox,
  resetLabelReservations,
} from "./labelReservations";

const BOX = { x: 10, y: 20, w: 30, h: 40 };

describe("labelReservations", () => {
  beforeEach(resetLabelReservations);

  it("hands the current frame's boxes to the reader", () => {
    beginLabelReservations(7);
    reserveLabelBox(7, BOX);
    expect(getLabelReservations(7)).toEqual([BOX]);
  });

  it("never serves a previous frame's layout", () => {
    // The contract that matters: if the publisher stops running — grid
    // toggled off, faded out, unmounted — its boxes must vanish rather than
    // linger as phantom obstacles that suppress body labels forever.
    beginLabelReservations(7);
    reserveLabelBox(7, BOX);
    expect(getLabelReservations(8)).toEqual([]);

    beginLabelReservations(8);
    expect(getLabelReservations(8)).toEqual([]);
  });

  it("ignores a reservation for a frame that already moved on", () => {
    beginLabelReservations(8);
    reserveLabelBox(7, BOX);
    expect(getLabelReservations(8)).toEqual([]);
  });

  it("is idempotent within a frame so repeated begins do not clear", () => {
    beginLabelReservations(7);
    reserveLabelBox(7, BOX);
    beginLabelReservations(7);
    expect(getLabelReservations(7)).toEqual([BOX]);
  });
});
