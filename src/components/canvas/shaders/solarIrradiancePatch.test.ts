import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  SOLAR_IRRADIANCE_UNIFORM,
  applyPlanetDirectLightPatch,
  buildPlanetDirectLightPatch,
} from "./solarIrradiancePatch";

/**
 * Two failure modes here are silent — they compile, render, and look
 * plausible — so they get asserts rather than a code review.
 *
 * 1. `String.replace` with a needle three no longer ships returns the string
 *    unchanged: the patch becomes a no-op with no error anywhere.
 * 2. The wrapper chain is NOT commutative. The regolith wrapper calls
 *    `RE_Direct_Physical` by name, so it must be inner; the irradiance
 *    wrapper calls the `RE_Direct` macro, so it must be outer. Swap them and
 *    the irradiance scale is simply skipped on every airless body.
 */
describe("solar irradiance direct-light patch", () => {
  it("anchors on a chunk three actually ships", () => {
    expect(THREE.ShaderLib.physical.fragmentShader).toContain(
      "#include <lights_physical_pars_fragment>"
    );
    expect(buildPlanetDirectLightPatch({ regolith: false })).toContain(
      "#include <lights_physical_pars_fragment>"
    );
  });

  it("puts the irradiance wrapper outside the regolith wrapper", () => {
    const patch = buildPlanetDirectLightPatch({ regolith: true });

    const regolithDef = patch.indexOf("void RE_Direct_Regolith(");
    const irradianceDef = patch.indexOf("void RE_Direct_SolarIrradiance(");
    expect(regolithDef).toBeGreaterThan(-1);
    expect(irradianceDef).toBeGreaterThan(regolithDef);

    // The outer wrapper delegates through the macro, so it picks up whatever
    // inner patch ran before it without naming that patch's symbol.
    expect(patch).toContain("scaledLight.color *= u_solarIrradiance;");
    expect(patch).toMatch(/RE_Direct\( scaledLight,/);
    // ...and it is the one the light loop ends up calling.
    expect(
      patch.trimEnd().endsWith("#define RE_Direct RE_Direct_SolarIrradiance")
    ).toBe(true);
  });

  it("scales direct light only — ambient and indirect stay untouched", () => {
    // The 0.02 viewing floor is a display guarantee, not incoming sunlight.
    // Wrapping RE_IndirectDiffuse would make it fail exactly on the dark
    // sides it exists for.
    const patch = buildPlanetDirectLightPatch({ regolith: true });
    expect(patch).not.toContain("RE_IndirectDiffuse");
    expect(patch).not.toContain("indirectDiffuse");
  });

  it("registers a neutral uniform and rewrites the shader in place", () => {
    const shader = {
      uniforms: {} as { [name: string]: { value: unknown } },
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    applyPlanetDirectLightPatch(shader, { regolith: false });

    // Neutral at compile time: a material that draws before the first
    // per-frame write is lit exactly as it is today.
    expect(shader.uniforms[SOLAR_IRRADIANCE_UNIFORM]).toEqual({ value: 1 });
    expect(shader.fragmentShader).toContain("void RE_Direct_SolarIrradiance(");
    // Applied once, not nested — a second application would square the
    // irradiance.
    expect(
      shader.fragmentShader.match(/void RE_Direct_SolarIrradiance\(/g)
    ).toHaveLength(1);
  });
});
