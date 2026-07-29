import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  RING_TRANSMISSION_FRACTION,
  applyRingDirectLightCacheKey,
  applyRingDirectLightPatch,
  buildRingDirectLightPatch,
} from "./ringLightingPatch";
import { SOLAR_IRRADIANCE_UNIFORM } from "./solarIrradiancePatch";
import { findUndeclaredUniforms } from "./shaderUniformAudit";

/**
 * Mirrors `solarIrradiancePatch.test.ts`'s idiom for the ring material
 * (W5-B): the ring used to carry a constant `emissiveIntensity` that never
 * responded to the brightness policy or the auto-exposure anchor — at
 * Saturn-real (anchor ~89) it lifted 89× while the planet's own surface
 * stayed at reference (`saturn-real-after.png`, lighting-redesign wave,
 * Onda 2.4's owed item 2). This patch replaces it with the SAME
 * `u_solarIrradiance` uniform the planet surfaces read.
 */
describe("ring direct-light patch", () => {
  it("anchors on a chunk three actually ships", () => {
    expect(THREE.ShaderLib.standard.fragmentShader).toContain(
      "#include <lights_physical_pars_fragment>"
    );
    expect(buildRingDirectLightPatch()).toContain(
      "#include <lights_physical_pars_fragment>"
    );
  });

  it("reuses the planet materials' own uniform name, not a parallel one", () => {
    // The whole point: Planet.tsx's existing per-frame writer looks the
    // uniform up BY NAME on `material.userData.shader`. A second name here
    // would need a second writer and a second law.
    expect(buildRingDirectLightPatch()).toContain(
      `uniform float ${SOLAR_IRRADIANCE_UNIFORM};`
    );
  });

  it("scales the lit face by the irradiance uniform and dims the unlit face by a fixed transmission fraction", () => {
    const patch = buildRingDirectLightPatch();
    expect(patch).toContain(`ringLight.color *= ${SOLAR_IRRADIANCE_UNIFORM};`);
    expect(patch).toContain("if ( ringNdotL < 0.0 ) {");
    expect(patch).toContain(
      `ringLight.color *= ${RING_TRANSMISSION_FRACTION.toFixed(3)};`
    );
    // The transmission fraction dims, never brightens, the far face.
    expect(RING_TRANSMISSION_FRACTION).toBeGreaterThan(0);
    expect(RING_TRANSMISSION_FRACTION).toBeLessThan(1);
  });

  it("mirrors the light direction on the unlit face so the Lambertian term underneath still fires", () => {
    // Without this, RE_Direct_Physical's own NdotL clamp zeroes the
    // "transmitted" contribution right back out — the whole point of the
    // flip is to feed it a direction the clamp will not reject.
    const patch = buildRingDirectLightPatch();
    expect(patch).toContain("ringLight.direction = -directLight.direction;");
  });

  it("delegates through the RE_Direct macro, not a hard-coded symbol", () => {
    // So it composes with whatever `lights_physical_pars_fragment` defines
    // as the entry point, same as `solarIrradiancePatch.ts`'s wrapper.
    const patch = buildRingDirectLightPatch();
    expect(patch).toMatch(/RE_Direct\( ringLight,/);
    expect(patch.trimEnd().endsWith("#define RE_Direct RE_Direct_Ring")).toBe(
      true
    );
  });

  it("registers a neutral uniform and rewrites the shader in place, applied once", () => {
    const shader = {
      uniforms: {} as { [name: string]: { value: unknown } },
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    applyRingDirectLightPatch(shader);

    expect(shader.uniforms[SOLAR_IRRADIANCE_UNIFORM]).toEqual({ value: 1 });
    expect(shader.fragmentShader).toContain("void RE_Direct_Ring(");
    expect(shader.fragmentShader.match(/void RE_Direct_Ring\(/g)).toHaveLength(
      1
    );
  });

  it("declares every u_-prefixed identifier it references (26cb756-class regression)", () => {
    expect(findUndeclaredUniforms(buildRingDirectLightPatch())).toEqual([]);
  });

  it("gives ring materials for two differently-flattened bodies different program cache keys", () => {
    // The regression this pins: the ring's onBeforeCompile already
    // closure-captures `flattening` (via buildPlanetShadowFragmentPatch) as
    // a value that never appears in onBeforeCompile.toString() — three's
    // default cache key. Two ring materials that agreed on every other
    // program parameter would hash identically and three would serve the
    // second one the first one's compiled program (66ab30f class bug).
    const sharedOnBeforeCompile = () => {};

    const saturn = {
      onBeforeCompile: sharedOnBeforeCompile,
      customProgramCacheKey: () => "",
    };
    const otherRingedBody = {
      onBeforeCompile: sharedOnBeforeCompile,
      customProgramCacheKey: () => "",
    };

    expect(saturn.onBeforeCompile.toString()).toBe(
      otherRingedBody.onBeforeCompile.toString()
    );

    applyRingDirectLightCacheKey(saturn, 0.097962);
    applyRingDirectLightCacheKey(otherRingedBody, 0.05);

    expect(saturn.customProgramCacheKey()).not.toBe(
      otherRingedBody.customProgramCacheKey()
    );
    expect(saturn.customProgramCacheKey()).toContain(
      sharedOnBeforeCompile.toString()
    );
  });
});
