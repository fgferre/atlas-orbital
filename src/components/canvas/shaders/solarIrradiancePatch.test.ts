import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  SOLAR_IRRADIANCE_UNIFORM,
  applyPlanetDirectLightCacheKey,
  applyPlanetDirectLightPatch,
  buildPlanetDirectLightPatch,
} from "./solarIrradiancePatch";
import { findUndeclaredUniforms } from "./shaderUniformAudit";

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

  it("gives the two direct-light chains different program cache keys", () => {
    // The regression this pins is invisible without it. Every planet-material
    // branch routes through ONE hoisted `patchDirectLights` closure, so the
    // regolith flag lives in a captured variable and never appears in
    // `onBeforeCompile.toString()` — which is three's DEFAULT program cache
    // key (`Material.customProgramCacheKey`). Two materials that agree on
    // every other program parameter then hash identically and three serves
    // the second one the first one's compiled program: either the airless
    // bodies silently lose Lommel-Seeliger or the lambert ones silently gain
    // it, decided by render order, reported by nothing.
    const sharedOnBeforeCompile = () => {};

    const regolith = {
      onBeforeCompile: sharedOnBeforeCompile,
      customProgramCacheKey: () => "",
    };
    const lambert = {
      onBeforeCompile: sharedOnBeforeCompile,
      customProgramCacheKey: () => "",
    };

    // Precondition: this is what three would have keyed on, and it collides.
    expect(regolith.onBeforeCompile.toString()).toBe(
      lambert.onBeforeCompile.toString()
    );

    applyPlanetDirectLightCacheKey(regolith, { regolith: true });
    applyPlanetDirectLightCacheKey(lambert, { regolith: false });

    expect(regolith.customProgramCacheKey()).not.toBe(
      lambert.customProgramCacheKey()
    );
    // Composed as `default ⊕ variant`, never the bare variant: the per-branch
    // callbacks (Earth day/night, ring shadow) rely on their own source text
    // to stay distinct from each other, and replacing the key outright would
    // collapse THOSE together.
    expect(regolith.customProgramCacheKey()).toContain(
      sharedOnBeforeCompile.toString()
    );
  });

  /**
   * Same "chunk PRESENCE is not compilability" gap `planetshinePatch.ts`
   * fell into (commit 26cb756, fixed by declaring `u_shineDir` /
   * `u_shineRadiance` at this file's own `lights_physical_pars_fragment`
   * anchor) — this file already declares `u_solarIrradiance` in the SAME
   * text it references it in, so this is a defensive pin against a future
   * regression, not a fix for a live bug.
   */
  it("declares every u_-prefixed identifier it references", () => {
    for (const regolith of [true, false]) {
      expect(
        findUndeclaredUniforms(buildPlanetDirectLightPatch({ regolith })),
        `regolith=${regolith}`
      ).toEqual([]);
    }
  });
});
