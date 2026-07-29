import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { REGOLITH_PHOTOMETRY_LIGHTS_PATCH } from "./regolithPhotometryPatch";
import { findUndeclaredUniforms } from "./shaderUniformAudit";

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
      /lsDiffuseDelta \* \( ([0-9.]+) \//
    );
    expect(literal).not.toBeNull();
    expect(Number(literal?.[1])).toBeCloseTo(4 / 3, 6);
  });

  it("wraps RE_Direct per light instead of multiplying the post-sum diffuse", () => {
    // Onda 1.2 — the old form multiplied the SUM of all direct lights'
    // diffuse by geometry derived from one assumed sun; that line must be
    // gone entirely, not just deprioritised.
    expect(REGOLITH_PHOTOMETRY_LIGHTS_PATCH).not.toMatch(
      /reflectedLight\.directDiffuse \*=/
    );

    // The replacement wraps RE_Direct: define a per-light function, call
    // the original RE_Direct_Physical to get this light's own delta, then
    // rescale only that delta by this light's own incidence geometry
    // (never the running sum) before redirecting the RE_Direct macro at
    // the wrapper.
    expect(REGOLITH_PHOTOMETRY_LIGHTS_PATCH).toContain(
      "void RE_Direct_Regolith("
    );
    expect(REGOLITH_PHOTOMETRY_LIGHTS_PATCH).toContain(
      "RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );"
    );
    expect(REGOLITH_PHOTOMETRY_LIGHTS_PATCH).toMatch(
      /vec3 lsDiffuseDelta = reflectedLight\.directDiffuse - lsDiffuseBefore;/
    );
    expect(REGOLITH_PHOTOMETRY_LIGHTS_PATCH).toContain(
      "saturate( dot( geometryNormal, directLight.direction ) )"
    );
    expect(REGOLITH_PHOTOMETRY_LIGHTS_PATCH).toContain("#undef RE_Direct");
    expect(REGOLITH_PHOTOMETRY_LIGHTS_PATCH).toContain(
      "#define RE_Direct RE_Direct_Regolith"
    );

    // The sun-at-origin hack this wrapper replaces (a CPU-free but
    // single-light-only assumption) must not survive the rewrite — each
    // light now supplies its own direction via `directLight.direction`.
    expect(REGOLITH_PHOTOMETRY_LIGHTS_PATCH).not.toContain("viewMatrix[3]");
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
    // Onda 1.2 moved the anchor to `lights_physical_pars_fragment` — the
    // wrapper has to land before `lights_fragment_begin`'s light loop
    // calls the (now redefined) RE_Direct macro, not after it.
    expect(THREE.ShaderLib.physical.fragmentShader).toContain(
      "#include <lights_physical_pars_fragment>"
    );
    expect(REGOLITH_PHOTOMETRY_LIGHTS_PATCH).toContain(
      "#include <lights_physical_pars_fragment>"
    );
  });

  // Same patch-family static assert `planetshinePatch.test.ts` /
  // `solarIrradiancePatch.test.ts` use — this patch carries zero custom
  // uniforms today, so this is trivially satisfied; it exists so a future
  // uniform added here gets the same "declared, not just present"
  // guarantee for free, with no new setup.
  it("declares every u_-prefixed identifier it references", () => {
    expect(findUndeclaredUniforms(REGOLITH_PHOTOMETRY_LIGHTS_PATCH)).toEqual(
      []
    );
  });
});
