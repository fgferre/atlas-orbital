import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { AstroPhysics } from "../../../lib/astrophysics";
import {
  AU_PER_LY,
  computeViewExtentWorld,
  formatDecadeScaleLabel,
  GRID_DECADE_MAX,
  GRID_DECADE_MIN,
  RING_MANTISSAS,
  resolveGridDecade,
  resolveGridRingSet,
} from "./gridRecScaling";

// ── Framing: the rings are a Sun-centered POLAR distance grid ────────
//
// Each ring for AU value `v` is drawn at world radius `auToWorld(v,
// scaleMode)`. Because the body positioner places a body at world radius
// `auToWorld(distanceAU, scaleMode)`, a planet at D AU sits EXACTLY on the
// ring for D — in BOTH scale modes. That radial-alignment identity is the
// whole point, and these tests assert it directly (the thing the old
// square grid could not provide).

describe("ring radii align with body world radii (the alignment identity)", () => {
  for (const mode of ["realistic", "didactic"] as const) {
    it(`a ring for v AU is drawn at auToWorld(v, "${mode}") — body at v AU lands on it`, () => {
      // Pick a view extent that surfaces the 1-AU decade, then find the
      // 1-AU ring in the set and assert its radius equals where a body at
      // 1 AU is positioned.
      const extent = AstroPhysics.auToWorld(6, mode); // ~few-AU framing
      const { rings } = resolveGridRingSet(extent, mode);
      const oneAuRing = rings.find((r) => Math.abs(r.au - 1) < 1e-9);
      expect(oneAuRing).toBeDefined();
      const bodyRadius = AstroPhysics.auToWorld(1, mode);
      expect(oneAuRing!.radius).toBeCloseTo(bodyRadius, 4);
    });
  }

  it("EVERY emitted ring's radius equals auToWorld(au) for its AU (both modes)", () => {
    for (const mode of ["realistic", "didactic"] as const) {
      for (const extent of [2_000, 20_000, 200_000]) {
        const { rings } = resolveGridRingSet(extent, mode);
        for (const ring of rings) {
          expect(ring.radius).toBeCloseTo(
            AstroPhysics.auToWorld(ring.au, mode),
            4
          );
        }
      }
    }
  });
});

describe("computeViewExtentWorld — view scale, not heliocentric distance", () => {
  const makeCam = (pos: THREE.Vector3, fovDeg = 45) => {
    const cam = new THREE.PerspectiveCamera(fovDeg, 1, 0.1, 1e15);
    cam.position.copy(pos);
    cam.updateMatrixWorld();
    return cam;
  };

  it("extent = 2·camToTarget·tan(fov/2) for a focused (non-Sun) target", () => {
    const target = new THREE.Vector3(1000, 0, 0);
    const cam = makeCam(new THREE.Vector3(1000, 0, 500), 45);
    const extent = computeViewExtentWorld(cam, target);
    const expected = 2 * 500 * Math.tan(THREE.MathUtils.degToRad(45) / 2);
    expect(extent).toBeCloseTo(expected, 6);
  });

  it("REFINES as the learner dollies in on a distant focused body", () => {
    const body = new THREE.Vector3(1_000_000, 0, 0);
    const far = makeCam(new THREE.Vector3(1_000_000, 0, 500_000));
    const near = makeCam(new THREE.Vector3(1_000_000, 0, 2_000));
    // Heliocentric distance ~unchanged (dominated by the 1e6 offset)...
    expect(
      Math.abs(far.position.length() - near.position.length()) /
        far.position.length()
    ).toBeLessThan(0.2);
    // ...but the view extent shrinks sharply as we dolly in.
    const extentFar = computeViewExtentWorld(far, body);
    const extentNear = computeViewExtentWorld(near, body);
    expect(extentNear).toBeLessThan(extentFar);
    // And the realistic decade refines (gets smaller) on zoom-in.
    const decFar = resolveGridRingSet(extentFar, "realistic").decade;
    const decNear = resolveGridRingSet(extentNear, "realistic").decade;
    expect(decNear).toBeLessThan(decFar);
  });

  it("reduces to heliocentric framing when the target is the Sun/origin", () => {
    const cam = makeCam(new THREE.Vector3(0, 0, 4000));
    const atOrigin = computeViewExtentWorld(cam, new THREE.Vector3(0, 0, 0));
    const nullTarget = computeViewExtentWorld(cam, null);
    expect(atOrigin).toBeCloseTo(nullTarget, 6);
    expect(atOrigin).toBeCloseTo(
      2 * 4000 * Math.tan(THREE.MathUtils.degToRad(45) / 2),
      6
    );
  });

  it("uses the live camera FOV (a wider lens shows a wider extent)", () => {
    const target = new THREE.Vector3(0, 0, 0);
    const narrow = computeViewExtentWorld(
      makeCam(new THREE.Vector3(0, 0, 1000), 30),
      target
    );
    const wide = computeViewExtentWorld(
      makeCam(new THREE.Vector3(0, 0, 1000), 60),
      target
    );
    expect(wide).toBeGreaterThan(narrow);
  });
});

describe("resolveGridDecade — view-AU decade selection", () => {
  it("bounds are [-1, 10] (0.1 AU .. 10^10 AU ≈ 158 000 LY, galactic)", () => {
    expect(GRID_DECADE_MIN).toBe(-1);
    expect(GRID_DECADE_MAX).toBe(10);
  });

  it("zooming IN (smaller viewAU) chooses a smaller decade → finer rings", () => {
    const coarse = resolveGridDecade(50_000);
    const fine = resolveGridDecade(50);
    expect(fine).toBeLessThan(coarse);
  });

  it("clamps below the min and above the max", () => {
    expect(resolveGridDecade(0.0001)).toBe(GRID_DECADE_MIN);
    expect(resolveGridDecade(1e12)).toBe(GRID_DECADE_MAX);
  });

  it("returns the min for degenerate input (0, negative, NaN, Infinity)", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveGridDecade(bad)).toBe(GRID_DECADE_MIN);
    }
  });
});

describe("resolveGridRingSet — the concentric ring set", () => {
  it("never returns an empty ring set at any normal zoom (fixes 'only when close')", () => {
    for (const mode of ["didactic", "realistic"] as const) {
      // Sweep from tight planetary framing out to the outer system.
      for (const extent of [500, 5_000, 50_000, 500_000, 5_000_000]) {
        const { rings } = resolveGridRingSet(extent, mode);
        expect(rings.length).toBeGreaterThan(0);
        for (const ring of rings) {
          expect(Number.isFinite(ring.radius)).toBe(true);
          expect(ring.radius).toBeGreaterThan(0);
        }
      }
    }
  });

  it("rings ascend by AU and by radius (sorted, monotone)", () => {
    const { rings } = resolveGridRingSet(20_000, "realistic");
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i].au).toBeGreaterThan(rings[i - 1].au);
      expect(rings[i].radius).toBeGreaterThanOrEqual(rings[i - 1].radius);
    }
  });

  it("every ring AU is a 1-2-5 mantissa × 10^k", () => {
    expect([...RING_MANTISSAS]).toEqual([1, 2, 5]);
    const { rings } = resolveGridRingSet(20_000, "realistic");
    for (const ring of rings) {
      const k = Math.floor(Math.log10(ring.au) + 1e-9);
      const mantissa = ring.au / Math.pow(10, k);
      expect([1, 2, 5].some((m) => Math.abs(m - mantissa) < 1e-6)).toBe(true);
    }
  });

  it("MAJOR rings are the pure power-of-ten ladder (no 2×/5× majors)", () => {
    const { rings } = resolveGridRingSet(20_000, "realistic");
    for (const ring of rings.filter((r) => r.major)) {
      const k = Math.round(Math.log10(ring.au));
      // Major AU must be exactly 10^k (mantissa 1).
      expect(ring.au).toBeCloseTo(Math.pow(10, k), 6);
    }
    // A power of ten is major...
    expect(rings.find((r) => Math.abs(r.au - 10) < 1e-9)?.major).toBe(true);
  });

  it("MINOR (2×/5×) rings appear ONLY within the in-view decade", () => {
    const set = resolveGridRingSet(20_000, "realistic");
    const minors = set.rings.filter((r) => !r.major);
    for (const m of minors) {
      const k = Math.floor(Math.log10(m.au) + 1e-9);
      expect(k).toBe(set.decade); // minor's decade === in-view decade
      const mantissa = m.au / Math.pow(10, k);
      expect([2, 5].some((x) => Math.abs(x - mantissa) < 1e-6)).toBe(true);
    }
  });

  it("LABELED major rings follow a continuous ×10 ladder out to galactic (realistic)", () => {
    // Frame far out so the ladder spans many decades; the major AU values
    // must be consecutive powers of ten with no gaps.
    const { rings } = resolveGridRingSet(
      AstroPhysics.auToWorld(1e6, "realistic"),
      "realistic"
    );
    const majorExps = rings
      .filter((r) => r.major)
      .map((r) => Math.round(Math.log10(r.au)))
      .sort((a, b) => a - b);
    for (let i = 1; i < majorExps.length; i++) {
      expect(majorExps[i] - majorExps[i - 1]).toBe(1); // consecutive decades
    }
    expect(majorExps.length).toBeGreaterThan(3);
  });

  it("realistic far-out rings carry LY-formatted labels at galactic scale", () => {
    // 10^7 AU ≈ 158 LY, 10^10 AU ≈ 158 000 LY — these read in LY, not AU.
    expect(formatDecadeScaleLabel(1e7, true)).toContain("LY");
    expect(formatDecadeScaleLabel(1e10, true)).toContain("LY");
    // And no raw fractional garbage — clean rounded integers (grouped).
    expect(formatDecadeScaleLabel(1e10, true)).toMatch(/^[\d ]+ LY$/);
  });

  it("labelAU is a major ring and labelRadius is auToWorld(labelAU)", () => {
    for (const mode of ["didactic", "realistic"] as const) {
      const set = resolveGridRingSet(20_000, mode);
      const labelRing = set.rings.find(
        (r) => Math.abs(r.au - set.labelAU) < 1e-9
      );
      expect(labelRing?.major).toBe(true);
      expect(set.labelRadius).toBeCloseTo(
        AstroPhysics.auToWorld(set.labelAU, mode),
        4
      );
    }
  });

  it("realistic decade-0 ring is the linear 1-AU world radius (1000)", () => {
    const extent = AstroPhysics.auToWorld(6, "realistic"); // ~few-AU
    const { rings } = resolveGridRingSet(extent, "realistic");
    const oneAu = rings.find((r) => Math.abs(r.au - 1) < 1e-9);
    expect(oneAu?.radius).toBeCloseTo(1000, 6);
  });

  it("didactic 1-AU ring is the COMPRESSED world radius (440), not 1000", () => {
    const extent = AstroPhysics.auToWorld(6, "didactic");
    const { rings } = resolveGridRingSet(extent, "didactic");
    const oneAu = rings.find((r) => Math.abs(r.au - 1) < 1e-9);
    expect(oneAu?.radius).toBeCloseTo(440, 3);
  });
});

describe("resolveGridRingSet — didactic cap honesty", () => {
  it("flags atDidacticCap once the compression saturates", () => {
    const deep = resolveGridRingSet(1e9, "didactic");
    expect(deep.atDidacticCap).toBe(true);
    expect(deep.rings.length).toBeGreaterThan(0);
  });

  it("does NOT flag atDidacticCap below saturation", () => {
    const shallow = resolveGridRingSet(
      AstroPhysics.auToWorld(5, "didactic"),
      "didactic"
    );
    expect(shallow.atDidacticCap).toBe(false);
  });

  it("realistic mode never flags atDidacticCap (no compression cap)", () => {
    expect(resolveGridRingSet(1e9, "realistic").atDidacticCap).toBe(false);
  });

  it("does not stack coincident rings when didactic radii saturate", () => {
    // Past the cap, distinct AU values map to the same world radius; the
    // de-dup guard must drop the coincident ones.
    const { rings } = resolveGridRingSet(1e9, "didactic");
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i].radius - rings[i - 1].radius).toBeGreaterThan(1e-3);
    }
  });
});

describe("resolveGridRingSet — robustness", () => {
  it("never returns a zero / non-finite radius", () => {
    for (const extent of [0, -10, Number.NaN, Number.POSITIVE_INFINITY, 1e15]) {
      for (const mode of ["didactic", "realistic"] as const) {
        const { rings, decadeRadius, labelRadius } = resolveGridRingSet(
          extent,
          mode
        );
        expect(rings.length).toBeGreaterThan(0);
        expect(Number.isFinite(decadeRadius)).toBe(true);
        expect(decadeRadius).toBeGreaterThan(0);
        expect(Number.isFinite(labelRadius)).toBe(true);
        expect(labelRadius).toBeGreaterThan(0);
        for (const ring of rings) {
          expect(Number.isFinite(ring.radius)).toBe(true);
          expect(ring.radius).toBeGreaterThan(0);
        }
      }
    }
  });

  it("a degenerate (zero) view extent falls back to the inner decade", () => {
    for (const mode of ["didactic", "realistic"] as const) {
      const { decade, rings } = resolveGridRingSet(0, mode);
      expect(decade).toBe(GRID_DECADE_MIN);
      expect(rings.length).toBeGreaterThan(0);
    }
  });

  it("memo coalesces two identical-input calls (the shared per-frame result)", () => {
    const a1 = resolveGridRingSet(12_345, "didactic");
    const a2 = resolveGridRingSet(12_345, "didactic");
    expect(a2).toBe(a1); // same reference → cached
    const b = resolveGridRingSet(99_999, "didactic");
    expect(b).not.toBe(a1);
  });
});

describe("formatDecadeScaleLabel — AU/LY formatting + didactic honesty", () => {
  it("formats AU values with grouped thousands (below 1 LY)", () => {
    expect(formatDecadeScaleLabel(1)).toBe("1 AU");
    expect(formatDecadeScaleLabel(10)).toBe("10 AU");
    expect(formatDecadeScaleLabel(1000)).toBe("1 000 AU");
    expect(formatDecadeScaleLabel(50000)).toBe("50 000 AU");
  });

  it("formats sub-AU rings (inner-planet decade) with a fractional digit", () => {
    expect(formatDecadeScaleLabel(0.5)).toBe("0.5 AU");
    expect(formatDecadeScaleLabel(0.2)).toBe("0.2 AU");
  });

  it("auto-switches AU→LY at 1 LY when LY is allowed (realistic regime)", () => {
    expect(formatDecadeScaleLabel(AU_PER_LY)).toBe("1 LY");
    expect(formatDecadeScaleLabel(AU_PER_LY * 10)).toBe("10 LY");
    expect(formatDecadeScaleLabel(AU_PER_LY * 1.58)).toBe("1.6 LY");
  });

  it("SUPPRESSES the LY switch when allowLY=false (didactic regime)", () => {
    expect(formatDecadeScaleLabel(AU_PER_LY, false)).toBe("63 241 AU");
    expect(formatDecadeScaleLabel(AU_PER_LY * 10, false)).toContain("AU");
    expect(formatDecadeScaleLabel(AU_PER_LY * 10, false)).not.toContain("LY");
  });

  it("guards degenerate AU input", () => {
    expect(formatDecadeScaleLabel(0)).toBe("1 AU");
    expect(formatDecadeScaleLabel(Number.NaN)).toBe("1 AU");
    expect(formatDecadeScaleLabel(-5)).toBe("1 AU");
  });
});
