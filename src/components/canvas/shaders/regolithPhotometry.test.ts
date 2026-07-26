import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { REGOLITH_PHOTOMETRY_LIGHTS_PATCH } from "./regolithPhotometryPatch";

/**
 * Standing law 3 — the 4/3 in `regolithPhotometryPatch.ts` needs an
 * independent check that does not pass through the constant itself. The check
 * is quadrature: integrate both BRDFs over the visible disc at zero phase and
 * solve for the normalisation that makes them carry the same flux. If someone
 * "tunes" the shader literal for looks, this fails.
 */
describe("Lommel-Seeliger normalisation", () => {
  /**
   * Projected-area-weighted flux of a radiance profile over the visible
   * hemisphere of a unit sphere at zero phase (light and viewer coincident).
   *
   * Ring at polar angle theta from the sub-observer point: area
   * 2*pi*sin(theta)*dtheta, foreshortened by cos(theta), and mu == mu0 ==
   * cos(theta) because the two directions coincide.
   */
  const fluxAtZeroPhase = (radiance: (mu: number) => number): number => {
    const steps = 200_000;
    const dTheta = Math.PI / 2 / steps;
    let flux = 0;
    for (let i = 0; i < steps; i++) {
      const theta = (i + 0.5) * dTheta;
      const mu = Math.cos(theta);
      flux += radiance(mu) * mu * 2 * Math.PI * Math.sin(theta) * dTheta;
    }
    return flux;
  };

  it("derives 4/3 from flux neutrality against Lambert, not from taste", () => {
    const lambertFlux = fluxAtZeroPhase((mu) => mu);
    // Unnormalised Lommel-Seeliger: mu0 / (mu0 + mu), which is 1/2 everywhere
    // on the disc at zero phase — the flat full-Moon disc.
    const rawLsFlux = fluxAtZeroPhase((mu) => mu / (mu + mu));

    const normalisation = lambertFlux / rawLsFlux;
    expect(normalisation).toBeCloseTo(4 / 3, 5);
  });

  it("ships that derived value, and no other, in the GLSL", () => {
    const literal = REGOLITH_PHOTOMETRY_LIGHTS_PATCH.match(
      /reflectedLight\.directDiffuse \*= ([0-9.]+) \//
    );
    expect(literal).not.toBeNull();
    expect(Number(literal?.[1])).toBeCloseTo(4 / 3, 6);
  });

  it("redistributes brightness without changing full-phase flux", () => {
    const lambertFlux = fluxAtZeroPhase((mu) => mu);
    const lsFlux = fluxAtZeroPhase((mu) => (4 / 3) * (mu / (mu + mu)));
    expect(lsFlux / lambertFlux).toBeCloseTo(1, 5);

    // ...and the distribution really does change: Lambert falls off toward
    // the limb, Lommel-Seeliger is flat at zero phase.
    expect((4 / 3) * (0.1 / 0.2)).toBeCloseTo((4 / 3) * (0.9 / 1.8), 12);
  });

  it("anchors on a chunk three actually ships", () => {
    // The bug this guards against is silent: String.replace with a needle
    // that no longer exists returns the string unchanged, so a renamed
    // three chunk turns a shader patch into a no-op with no error anywhere.
    expect(THREE.ShaderLib.physical.fragmentShader).toContain(
      "#include <lights_fragment_begin>"
    );
    expect(REGOLITH_PHOTOMETRY_LIGHTS_PATCH).toContain(
      "#include <lights_fragment_begin>"
    );
  });
});
