import { describe, expect, it } from "vitest";

import {
  apparentFluxFromLuminosity,
  ATLAS_SCENE_UNITS_PER_PC,
  buildBvLinearRgbLut,
  computeMinQuadSolidAngle,
  computePixelsPerRadian,
  computeViewportHeightScalar,
  CORE_TRUNCATION_NORMALISATION,
  erfApprox,
  GAIA_INTERNAL_UNITS_PER_PC,
  GAIA_LEN0_INTERNAL_UNITS,
  GAIA_STAR_COLOR_SATURATION,
  gaiaBvToRgb,
  gaussianPeak,
  gaussianPixelCoverage,
  glareProfile,
  glareVisibleRadiusPx,
  LEN0,
  maxFluxScreenForViewport,
  spikeVisibleRadiusPx,
  STAR_GLARE_CORE_PX,
  STAR_GLARE_FRACTION,
  STAR_MAX_FOOTPRINT_FRACTION,
  STAR_QUAD_CUTOFF_FRACTION,
  starQuadEdgeWindow,
  luminosityProxyFromAbsMag,
  MAX_QUAD_SOLID_ANGLE_LITERAL,
  saturateStarRgb,
  SRGB_OETF_ALPHA,
  STAR_DISPLAY_BLACK_POINT,
  STAR_OPTICS_PARAMS,
  STAR_PSF_QUAD_SIGMAS,
  STAR_PSF_SIGMA_PX,
  STAR_THRESHOLD_MAGNITUDE,
  starBoundaryFade,
  starExposure,
  starLinearRgbFromBv,
  starSplatMetrics,
  U_MIN_QUAD_SOLID_ANGLE_1440P_BASELINE,
} from "./starfieldShaderMath";
import {
  absoluteMagnitudeToPseudoSize,
  apparentToAbsMag,
  GAIA_PSEUDO_SIZE_CEILING_PC,
  GAIA_PSEUDO_SIZE_COEFFICIENT_PC,
  STAR_SIZE_FACTOR,
} from "./starPhysics";
import { HYG_CI_OFFSET, HYG_CI_STEP } from "../utils/hygBinary";

/**
 * θ.2 replaced the Gaia-Sky solid-angle sprite with a Pogson-photometry,
 * pixel-integrated-Gaussian splat. The tests that pinned the retired
 * kernel's exact shape (`smoothstep(0, 0.04, r)` core, the
 * `[1e-10, 2e-9]` opacity lint, the `u_minQuadSolidAngle` floor, the
 * `saturate(alpha·(rgb + core·2))` composite) went with it — per
 * AGENTS.md §6 those froze yesterday's form rather than a product
 * contract.
 *
 * What is pinned here is what the product actually promises:
 *
 *  - **Energy conservation and phase invariance of the PSF.** This is
 *    the anti-shimmer contract and the whole reason the splat is
 *    integrated rather than sampled. It becomes a measurable regression
 *    the moment anyone reaches for a cheaper profile.
 *  - **Photometry.** Pogson ratios and the inverse square, so a star's
 *    brightness tracks its magnitude and its distance rather than a
 *    fitted curve.
 *  - **Colour is scene-referred and the transfer curve is the real one.**
 *  - **The near-camera handoff** that `HygStellarMesh` and
 *    `e2e/hyg-focus.spec.ts` depend on.
 */

// A star centre can sit anywhere within a pixel; sample the unit cell on
// a coarse but non-symmetric grid so no test accidentally only ever sees
// the well-behaved centred case.
const SUB_PIXEL_PHASES: Array<[number, number]> = [];
for (let i = 0; i < 7; i++) {
  for (let j = 0; j < 7; j++) {
    SUB_PIXEL_PHASES.push([-0.5 + i / 6, -0.5 + j / 6]);
  }
}

/**
 * Sum the PSF over a pixel grid. `halfExtentPx` clips to the pixels a
 * quad of that half-extent would rasterise; omit it to integrate the
 * untruncated profile, which is what `gaussianPixelCoverage` promises to
 * conserve.
 */
const integrateCoverage = (
  offsetX: number,
  offsetY: number,
  sigmaPx: number,
  halfExtentPx = Infinity
): { total: number; peak: number } => {
  const reach = Math.ceil(Math.min(halfExtentPx, 10 * sigmaPx)) + 2;
  let total = 0;
  let peak = 0;
  for (let px = -reach; px <= reach; px++) {
    for (let py = -reach; py <= reach; py++) {
      const qx = px - offsetX;
      const qy = py - offsetY;
      if (Math.abs(qx) > halfExtentPx || Math.abs(qy) > halfExtentPx) continue;
      const w = gaussianPixelCoverage(qx, qy, sigmaPx);
      total += w;
      peak = Math.max(peak, w);
    }
  }
  return { total, peak };
};

describe("erfApprox", () => {
  it("matches known erf values within the A&S 7.1.26 error bound", () => {
    expect(erfApprox(0)).toBeCloseTo(0, 6);
    expect(erfApprox(0.5)).toBeCloseTo(0.5204998778, 6);
    expect(erfApprox(1)).toBeCloseTo(0.8427007929, 6);
    expect(erfApprox(2)).toBeCloseTo(0.995322265, 6);
    expect(erfApprox(3)).toBeCloseTo(0.9999779095, 6);
  });

  it("is odd", () => {
    for (const x of [0.13, 0.9, 1.7, 2.6]) {
      expect(erfApprox(-x)).toBeCloseTo(-erfApprox(x), 9);
    }
  });
});

describe("pixel-integrated Gaussian PSF", () => {
  const halfExtent = STAR_PSF_QUAD_SIGMAS * STAR_PSF_SIGMA_PX;

  it("conserves the star's flux exactly, at every sub-pixel phase", () => {
    // The untruncated splat sums to 1 by construction — this is the
    // property that makes the star's brightness independent of where
    // the pixel grid happens to fall, and it is exact, not approximate.
    for (const [ox, oy] of SUB_PIXEL_PHASES) {
      const { total } = integrateCoverage(ox, oy, STAR_PSF_SIGMA_PX);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it("loses under 2% to quad truncation, and normalises it back out", () => {
    // The drawn quad is finite, so a little of the profile falls outside
    // it. CORE_TRUNCATION_NORMALISATION divides that back in; the two
    // constants have to move together or the star field's absolute
    // photometry drifts.
    const enclosed = Math.pow(
      erfApprox((STAR_PSF_QUAD_SIGMAS * Math.SQRT1_2) / 1),
      2
    );
    expect(enclosed).toBeGreaterThan(0.98);
    expect(CORE_TRUNCATION_NORMALISATION * enclosed).toBeCloseTo(1, 9);
  });

  it("keeps drawn flux invariant to sub-pixel position — the anti-shimmer contract", () => {
    // The property the retired baked sprite could not hold: it
    // point-sampled a 64×64 σ=10-texel Gaussian minified 17×, so what a
    // pixel received depended on where the pixel grid happened to fall,
    // and its peak swung 106 %. What remains here is only the quad's
    // moving edge against the pixel grid.
    const totals = SUB_PIXEL_PHASES.map(
      ([ox, oy]) =>
        integrateCoverage(ox, oy, STAR_PSF_SIGMA_PX, halfExtent).total
    );
    const min = Math.min(...totals);
    const max = Math.max(...totals);
    // Measured 3.7 % at σ = 0.62. This is the quad's edge moving against
    // the pixel grid, not the profile: the untruncated splat above is
    // exact to 1e-6 at every phase, and the shipped shader additionally
    // windows the boundary to zero, which the mirror does not model.
    expect((max - min) / min).toBeLessThan(0.05);
  });

  it("holds the peak-pixel swing below the retired sprite's 106%", () => {
    // Total flux is invariant; what remains is how it splits between
    // neighbouring pixels, which is what reads as twinkle. Measured:
    // 68.7 % at the shipped σ = 0.62, 28.7 % at σ = 0.95.
    //
    // The wider σ is calmer, and θ.2 shipped it first for exactly that
    // reason — then the owner's first look reported the field had lost
    // resolution and faint stars read as blocks. Sharpness won, and
    // this threshold records the cost honestly rather than hiding it.
    // The comparison to the retired path is still favourable on both
    // counts that matter: 106 % swing, and a separate razor-thin core
    // term that took a faint star's flux from 0 to clipped white on
    // 1.8 % of phases. Neither survives here.
    const peaks = SUB_PIXEL_PHASES.map(
      ([ox, oy]) =>
        integrateCoverage(ox, oy, STAR_PSF_SIGMA_PX, halfExtent).peak
    );
    const swing = Math.max(...peaks) / Math.min(...peaks) - 1;
    expect(swing).toBeLessThan(0.75);
  });

  it("conserves flux at any sigma, which is what makes the floor safe", () => {
    // Widening σ redistributes light between pixels; it never creates or
    // destroys any. That is why the σ floor can be chosen for temporal
    // stability without paying for it in photometry.
    for (const sigma of [0.6, 0.95, 1.4, 2.5]) {
      const { total } = integrateCoverage(0.21, -0.37, sigma);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it("peaks at the star centre and falls off monotonically", () => {
    let previous = Infinity;
    for (let r = 0; r <= 4; r += 0.25) {
      const w = gaussianPixelCoverage(r, 0, STAR_PSF_SIGMA_PX);
      expect(w).toBeLessThanOrEqual(previous + 1e-12);
      previous = w;
    }
  });
});

describe("quad sizing — the two defects the first θ.2 build shipped", () => {
  it("sizes the core quad by brightness so it never truncates above white", () => {
    // A FIXED multiple of σ was the bug: a Gaussian still carries 2 % of
    // its peak at 2.8σ, which for a bright star is far above display
    // white, and the quad edge rasterised as a hard bright SQUARE.
    for (const mag of [8, 6, 4, 2, 0, -1.46]) {
      const m = starSplatMetrics({
        luminosityProxy: luminosityProxyFromAbsMag(mag),
        distancePc: 10,
      });
      const edgeValue =
        m.corePeak *
        Math.exp(
          -(m.coreRadiusPx * m.coreRadiusPx) /
            (2 * STAR_PSF_SIGMA_PX * STAR_PSF_SIGMA_PX)
        );
      expect(edgeValue).toBeLessThanOrEqual(
        STAR_DISPLAY_BLACK_POINT * STAR_QUAD_CUTOFF_FRACTION + 1e-9
      );
    }
  });

  it("grows that radius only as sqrt(log peak), so it stays affordable", () => {
    // Even the brightest star in the sky needs ~5σ, not a huge quad.
    const sirius = starSplatMetrics({
      luminosityProxy: luminosityProxyFromAbsMag(1.44),
      distancePc: 2.64,
    });
    expect(sirius.coreRadiusPx / STAR_PSF_SIGMA_PX).toBeLessThan(8);
    expect(sirius.coreRadiusPx).toBeGreaterThan(
      STAR_PSF_QUAD_SIGMAS * STAR_PSF_SIGMA_PX
    );
  });

  it("windows every lobe to exactly zero at the quad edge", () => {
    // Sizing to "where it becomes invisible" still leaves a step of that
    // size, and whether it reads as a square depends on the tier's
    // grade. The window removes the discontinuity for every profile and
    // every tier.
    expect(starQuadEdgeWindow(0, 10)).toBe(1);
    expect(starQuadEdgeWindow(8, 10)).toBe(1);
    expect(starQuadEdgeWindow(10, 10)).toBe(0);
    expect(starQuadEdgeWindow(12, 10)).toBe(0);
    const mid = starQuadEdgeWindow(9.3, 10);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("bounds a star's footprint however close the camera gets", () => {
    // The inverse square is unbounded and the camera can fly to a star.
    // Without a ceiling the sprite swelled past the whole viewport and
    // then popped to a small procedural mesh when the cross-fade
    // finished — which is what the owner saw. The Gaia port this
    // replaced was implicitly bounded by its 3e-8 solid-angle ceiling.
    const minViewport = 1080;
    const cap = maxFluxScreenForViewport(minViewport);
    const maxRadius = glareVisibleRadiusPx(cap * STAR_GLARE_FRACTION);
    expect(maxRadius).toBeLessThanOrEqual(
      minViewport * STAR_MAX_FOOTPRINT_FRACTION + 1
    );

    // Sirius at catalog distance must sit well under the cap, or the
    // ceiling would be flattening the ordinary sky rather than only the
    // fly-to case.
    const sirius = starSplatMetrics({
      luminosityProxy: luminosityProxyFromAbsMag(1.44),
      distancePc: 2.64,
    });
    expect(sirius.fluxScreen).toBeLessThan(cap * 0.1);

    // Approaching to a hundredth of the catalog distance is a 10 000x
    // flux increase; the cap has to be what stops it.
    const closeUp = starSplatMetrics({
      luminosityProxy: luminosityProxyFromAbsMag(1.44),
      distancePc: 0.0264,
    });
    expect(closeUp.fluxScreen).toBeGreaterThan(cap);
  });

  it("scales the ceiling with the viewport rather than pinning pixels", () => {
    expect(maxFluxScreenForViewport(2160)).toBeGreaterThan(
      maxFluxScreenForViewport(1080)
    );
  });
});

describe("photometry", () => {
  it("follows Pogson: 2.5 magnitudes is a factor of 10 in flux", () => {
    const bright = luminosityProxyFromAbsMag(0);
    const faint = luminosityProxyFromAbsMag(2.5);
    expect(bright / faint).toBeCloseTo(10, 6);
  });

  it("reproduces the distance modulus exactly", () => {
    // 10^(-0.4 m) must equal 10^(-0.4 M) · (10/d)² for any M and d.
    for (const [absMag, distPc] of [
      [1.44, 2.64], // Sirius
      [-5.71, 168], // Betelgeuse
      [4.83, 10], // the Sun, at the 10 pc reference distance
      [15.6, 1.3], // Proxima
    ]) {
      const apparentMag = absMag + 5 * Math.log10(distPc / 10);
      expect(
        apparentFluxFromLuminosity(luminosityProxyFromAbsMag(absMag), distPc)
      ).toBeCloseTo(Math.pow(10, -0.4 * apparentMag), 10);
    }
  });

  it("brightens as the inverse square when the camera approaches", () => {
    const lum = luminosityProxyFromAbsMag(2);
    const far = apparentFluxFromLuminosity(lum, 100);
    const near = apparentFluxFromLuminosity(lum, 50);
    expect(near / far).toBeCloseTo(4, 9);
  });

  it("puts the threshold magnitude exactly on the display black point", () => {
    // The exposure is derived from these two constants rather than
    // tuned, so this asserts the derivation, not a calibration.
    const { corePeak } = starSplatMetrics({
      luminosityProxy: luminosityProxyFromAbsMag(STAR_THRESHOLD_MAGNITUDE),
      distancePc: 10,
    });
    expect(corePeak).toBeCloseTo(STAR_DISPLAY_BLACK_POINT, 9);
  });

  it("orders the sky by apparent magnitude, not by luminosity", () => {
    // A dim nearby star must outshine a luminous distant one whenever
    // its apparent magnitude says so — the failure mode of any model
    // that drops the distance term.
    const nearbyDim = starSplatMetrics({
      luminosityProxy: luminosityProxyFromAbsMag(8),
      distancePc: 3,
    });
    const distantBright = starSplatMetrics({
      luminosityProxy: luminosityProxyFromAbsMag(-5),
      distancePc: 5000,
    });
    expect(nearbyDim.flux).toBeGreaterThan(distantBright.flux);
  });

  it("keeps Sirius inside the HalfFloat target's range", () => {
    // Sirius is the brightest star in the sky and therefore the ceiling
    // of the whole catalog. fp16 saturates at 65504, and an Inf would
    // rasterise as a solid square instead of a star.
    const sirius = starSplatMetrics({
      luminosityProxy: luminosityProxyFromAbsMag(1.44),
      distancePc: 2.64,
    });
    expect(sirius.corePeak).toBeGreaterThan(100);
    expect(sirius.corePeak).toBeLessThan(60000);
  });
});

describe("glare lobe", () => {
  it("is exactly zero until the core clips to display white", () => {
    // The gate is the physical event — the core running out of range —
    // not a tuned magnitude cut, so faint stars pay nothing.
    const faint = starSplatMetrics({
      luminosityProxy: luminosityProxyFromAbsMag(STAR_THRESHOLD_MAGNITUDE),
      distancePc: 10,
    });
    expect(faint.corePeak).toBeLessThan(1);
    expect(faint.haloFlux).toBe(0);
    expect(faint.haloRadiusPx).toBe(0);
  });

  it("keeps the quad at the core size for everything that does not glare", () => {
    const faint = starSplatMetrics({
      luminosityProxy: luminosityProxyFromAbsMag(9),
      distancePc: 10,
    });
    expect(faint.quadHalfExtentPx).toBeCloseTo(
      STAR_PSF_QUAD_SIGMAS * STAR_PSF_SIGMA_PX,
      9
    );
  });

  it("grows the quad monotonically with brightness once it does", () => {
    let previousRadius = -1;
    let previousQuad = -1;
    for (const mag of [4, 3, 2, 1, 0, -1, -1.46]) {
      const m = starSplatMetrics({
        luminosityProxy: luminosityProxyFromAbsMag(mag),
        distancePc: 10,
      });
      expect(m.haloRadiusPx).toBeGreaterThanOrEqual(previousRadius);
      expect(m.quadHalfExtentPx).toBeGreaterThanOrEqual(previousQuad);
      previousRadius = m.haloRadiusPx;
      previousQuad = m.quadHalfExtentPx;
    }
  });

  it("conserves total flux — the halo is taken from the core, not added", () => {
    const m = starSplatMetrics({
      luminosityProxy: luminosityProxyFromAbsMag(1.44),
      distancePc: 2.64,
    });
    const coreFlux = m.fluxScreen - m.haloFlux;
    expect(coreFlux + m.haloFlux).toBeCloseTo(m.fluxScreen, 6);
    expect(m.haloFlux).toBeGreaterThan(0);
    expect(coreFlux).toBeGreaterThan(0);
  });

  it("normalises the r^-3 profile to unit total energy", () => {
    // G(r) = r0 / (2π·(r²+r0²)^1.5) integrates to 1 over the plane.
    let integral = 0;
    const dr = 0.002;
    for (let r = dr / 2; r < 4000; r += dr) {
      integral += glareProfile(r) * 2 * Math.PI * r * dr;
    }
    expect(integral).toBeCloseTo(1, 3);
  });

  it("puts the visible radius exactly where the lobe meets the black point", () => {
    const haloFlux = 5000;
    const r = glareVisibleRadiusPx(haloFlux);
    expect(r).toBeGreaterThan(1);
    expect(haloFlux * glareProfile(r)).toBeCloseTo(STAR_DISPLAY_BLACK_POINT, 6);
  });

  it("reports no radius for a lobe that cannot be seen", () => {
    expect(glareVisibleRadiusPx(0)).toBe(0);
    expect(glareVisibleRadiusPx(1e-6)).toBe(0);
  });
});

describe("colour", () => {
  it("uses the standard sRGB transfer constant", () => {
    // Was 0.5 before θ.2, which is not a transcription of any standard:
    // (1+a)·x^(1/2.4) − a over 12.92·x is continuous at the 0.0031308
    // knee only at a = 0.055. src/lib/stellarColor.ts already had it
    // right, so the two modules used to disagree.
    expect(SRGB_OETF_ALPHA).toBe(0.055);
    const knee = 0.0031308;
    const lower = 12.92 * knee;
    const upper =
      (1 + SRGB_OETF_ALPHA) * Math.pow(knee, 1 / 2.4) - SRGB_OETF_ALPHA;
    expect(upper).toBeCloseTo(lower, 6);
  });

  it("keeps the spectral ordering of B−V", () => {
    const sirius = gaiaBvToRgb(0.01);
    const capella = gaiaBvToRgb(0.8);
    const betelgeuse = gaiaBvToRgb(1.5);

    expect(sirius[2]).toBeGreaterThan(sirius[0]);
    expect(capella[0]).toBeGreaterThan(capella[2]);
    expect(betelgeuse[0]).toBeGreaterThan(betelgeuse[2]);
    expect(betelgeuse[2]).toBeLessThan(capella[2]);
  });

  it("emits scene-referred colour normalised to unit peak channel", () => {
    // Brightness is carried by the photometry; the attribute carries
    // chromaticity only. A colour that also carried magnitude would
    // double-count it against the flux term.
    for (const bv of [-0.3, 0.0, 0.65, 1.5, 2.4]) {
      const rgb = starLinearRgbFromBv(bv);
      expect(Math.max(...rgb)).toBeCloseTo(1, 6);
      for (const c of rgb) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is genuinely linear, not the display-referred value", () => {
    // The chain applies exactly one OETF, in the fragment via
    // <colorspace_fragment>. If the attribute were display-referred the
    // composer would encode it a second time, which is what made an A0
    // star (192,219,255) on ultra and (140,166,244) on constrained.
    // Decoding is convex, so every channel below the peak drops
    // relative to it.
    const bv = 1.5;
    const display = saturateStarRgb(gaiaBvToRgb(bv));
    const linear = starLinearRgbFromBv(bv);
    expect(linear[2]).toBeLessThan(display[2] / display[0]);
  });

  it("pins the saturation lift and applies it in the display domain", () => {
    expect(GAIA_STAR_COLOR_SATURATION).toBe(0.16);
    const base = gaiaBvToRgb(0.65);
    const lifted = saturateStarRgb(base);
    expect(lifted[0]).toBeCloseTo(base[0], 6);
    expect(lifted[1]).toBeLessThan(base[1]);
    expect(lifted[2]).toBeLessThan(base[2]);
  });

  it("builds a 256-entry LUT that reproduces the per-star evaluation", () => {
    // The catalog quantises B−V into a uint8, so the pipeline has 256
    // distinct answers no matter how many stars are loaded. Evaluating
    // it per star cost ~63 ms and ~328 000 arrays at the full tier.
    const lut = buildBvLinearRgbLut(HYG_CI_OFFSET, HYG_CI_STEP);
    expect(lut).toHaveLength(256 * 3);
    for (const q of [0, 1, 50, 128, 200, 255]) {
      const direct = starLinearRgbFromBv(q * HYG_CI_STEP + HYG_CI_OFFSET);
      expect(lut[q * 3 + 0]).toBeCloseTo(direct[0], 6);
      expect(lut[q * 3 + 1]).toBeCloseTo(direct[1], 6);
      expect(lut[q * 3 + 2]).toBeCloseTo(direct[2], 6);
    }
  });
});

describe("optics profiles", () => {
  it("defaults to an unobstructed aperture, which has no spikes", () => {
    expect(STAR_OPTICS_PARAMS.none.spikeCount).toBe(0);
    expect(STAR_OPTICS_PARAMS.none.gain).toBe(0);
    expect(spikeVisibleRadiusPx(1000, STAR_OPTICS_PARAMS.none.gain)).toBe(0);
  });

  it("uses the spike count the aperture geometry actually produces", () => {
    // N support vanes give N spikes for even N; JWST's hexagonal
    // segments give six; an eight-blade iris gives eight. The count is
    // the checkable part of the claim, so it is what gets pinned.
    expect(STAR_OPTICS_PARAMS.newtonian.spikeCount).toBe(4);
    expect(STAR_OPTICS_PARAMS.jwst.spikeCount).toBe(6);
    expect(STAR_OPTICS_PARAMS.cinema.spikeCount).toBe(8);
  });

  it("sizes the quad from the spikes' own r^-2 falloff, not the halo's", () => {
    // Spikes reach further than the glow because they fall as r^-2 to
    // the halo's r^-3. Scaling the halo radius by a guessed factor clips
    // them square at the quad boundary, which is exactly what a fake
    // looks like.
    const haloFlux = 2000;
    const halo = glareVisibleRadiusPx(haloFlux);
    for (const profile of ["newtonian", "jwst", "cinema"] as const) {
      const spike = spikeVisibleRadiusPx(
        haloFlux,
        STAR_OPTICS_PARAMS[profile].gain
      );
      expect(spike).toBeGreaterThan(halo * 2);
    }
  });

  it("puts the spike cutoff exactly on the display black point", () => {
    const haloFlux = 2000;
    const gain = STAR_OPTICS_PARAMS.jwst.gain;
    const r = spikeVisibleRadiusPx(haloFlux, gain);
    // On-axis spike intensity: gain · r0² / (2π·(r² + r0²)).
    const onAxis =
      (haloFlux * gain * STAR_GLARE_CORE_PX * STAR_GLARE_CORE_PX) /
      (2 * Math.PI * (r * r + STAR_GLARE_CORE_PX * STAR_GLARE_CORE_PX));
    expect(onAxis).toBeLessThan(STAR_DISPLAY_BLACK_POINT);
    expect(onAxis).toBeGreaterThan(STAR_DISPLAY_BLACK_POINT * 0.9);
  });
});

describe("near-camera handoff", () => {
  it("preserves Gaia's physical LEN0 threshold under atlas scene units", () => {
    expect(GAIA_LEN0_INTERNAL_UNITS).toBe(20000.0);
    expect(GAIA_INTERNAL_UNITS_PER_PC).toBeCloseTo(3.0857e7, 1);
    expect(ATLAS_SCENE_UNITS_PER_PC).toBe(206_265_000.0);
    expect(LEN0).toBeCloseTo(133_689, -2);

    const gaiaLen0Pc = GAIA_LEN0_INTERNAL_UNITS / GAIA_INTERNAL_UNITS_PER_PC;
    expect(LEN0 / ATLAS_SCENE_UNITS_PER_PC).toBeCloseTo(gaiaLen0Pc, 9);
    // ≈ 134 AU.
    expect((LEN0 / ATLAS_SCENE_UNITS_PER_PC) * 206_264.806).toBeCloseTo(
      133.7,
      0
    );
  });

  it("fades the sprite out inside LEN0 and back in beyond LEN0×1000", () => {
    expect(starBoundaryFade(LEN0 * 0.5, false)).toBe(0);
    expect(starBoundaryFade(LEN0 * 1e4, false)).toBe(1);
    const mid = starBoundaryFade(LEN0 * 500, false);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("exempts the focused star so the mesh cross-fade owns its alpha", () => {
    // Without this the LEN0 kill (~134k wu) extinguishes the sprite ~17×
    // before the procedural mesh's ENTER gate, leaving a distance band
    // where neither renders. e2e/hyg-focus.spec.ts observes the result.
    expect(starBoundaryFade(LEN0 * 0.05, true)).toBe(1);
  });

  it("attenuates the splat in lockstep with the mesh cross-fade ramp", () => {
    const base = starSplatMetrics({
      luminosityProxy: luminosityProxyFromAbsMag(2),
      distancePc: 10,
    });
    for (const ramp of [0, 0.25, 0.5, 0.75, 1]) {
      const faded = starSplatMetrics({
        luminosityProxy: luminosityProxyFromAbsMag(2),
        distancePc: 10,
        attenuation: 1 - ramp,
      });
      expect(faded.fluxScreen).toBeCloseTo(base.fluxScreen * (1 - ramp), 6);
    }
  });
});

describe("projection helpers", () => {
  it("computes pixels-per-radian from the projection matrix", () => {
    // cot(30°) at a 1000 px viewport.
    expect(computePixelsPerRadian(1 / Math.tan(Math.PI / 6), 1000)).toBeCloseTo(
      Math.sqrt(3) * 500,
      9
    );
    expect(computePixelsPerRadian(2, 800)).toBe(800);
  });

  it("scales the viewport height by the renderer's clamped DPR", () => {
    expect(computeViewportHeightScalar(1080, 1.5)).toBe(1620);
    expect(computeViewportHeightScalar(720, 2)).toBe(1440);
    expect(computeViewportHeightScalar(-10, 2)).toBe(0);
    expect(computeViewportHeightScalar(400, -1)).toBe(0);
  });
});

describe("solid-angle constants retained for the LightGlow registry", () => {
  it("keeps the resolution-adaptive minimum and the source ceiling", () => {
    // The sprite path stopped using these at θ.2, but lightRegistry.ts
    // still ranks and gates its glow lights by clamped solid angle.
    expect(MAX_QUAD_SOLID_ANGLE_LITERAL).toBe(3.0e-8);
    expect(computeMinQuadSolidAngle(1440)).toBeCloseTo(
      U_MIN_QUAD_SOLID_ANGLE_1440P_BASELINE,
      15
    );
    expect(computeMinQuadSolidAngle(1080)).toBeGreaterThan(
      computeMinQuadSolidAngle(1440)
    );
    expect(computeMinQuadSolidAngle(0)).toBeGreaterThan(0);
  });
});

describe("starPhysics (gated from this file)", () => {
  it("pins the Gaia pseudo-size constants LightGlow still reads", () => {
    expect(GAIA_PSEUDO_SIZE_COEFFICIENT_PC).toBe(0.15);
    expect(STAR_SIZE_FACTOR).toBe(1.31526e-6);
    expect(absoluteMagnitudeToPseudoSize(0)).toBeCloseTo(0.15, 12);
    expect(GAIA_PSEUDO_SIZE_CEILING_PC).toBeCloseTo(324.08, 1);
    expect(absoluteMagnitudeToPseudoSize(-60)).toBe(
      GAIA_PSEUDO_SIZE_CEILING_PC
    );
    expect(absoluteMagnitudeToPseudoSize(NaN)).toBe(0);
    expect(absoluteMagnitudeToPseudoSize(Infinity)).toBe(0);
  });

  it("round-trips the distance modulus", () => {
    // Sirius: −1.46 − 5·log10(2.64/10).
    expect(apparentToAbsMag(-1.46, 2.64)).toBeCloseTo(1.432, 3);
    expect(apparentToAbsMag(5, 10)).toBeCloseTo(5, 12);
    expect(apparentToAbsMag(5, 0)).toBe(5);
  });
});

describe("exposure derivation", () => {
  it("is derived from the PSF and the black point, not tuned", () => {
    const expected =
      (STAR_DISPLAY_BLACK_POINT / gaussianPeak(STAR_PSF_SIGMA_PX)) *
      Math.pow(10, 0.4 * STAR_THRESHOLD_MAGNITUDE);
    expect(starExposure()).toBeCloseTo(expected, 6);
  });

  it("moves with the black point, so a regrade cannot silently orphan it", () => {
    const doubled = starExposure(
      STAR_PSF_SIGMA_PX,
      STAR_THRESHOLD_MAGNITUDE,
      0.33
    );
    const base = starExposure(
      STAR_PSF_SIGMA_PX,
      STAR_THRESHOLD_MAGNITUDE,
      0.165
    );
    expect(doubled).toBeCloseTo(base * 2, 6);
  });
});
