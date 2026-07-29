import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY,
  ECLIPSE_FRAGMENT_OUTPUT_PATCH,
  ECLIPSE_FRAGMENT_UNIFORMS,
  ECLIPSE_VERTEX_WORLD_VARYINGS_ASSIGN,
  ECLIPSE_VERTEX_WORLD_VARYINGS_DECL,
  buildEclipseFragmentHelpers,
} from "./eclipseShaderPatch";
import {
  ECLIPSE_LUNAR_REFRACTION_TINT,
  ECLIPSE_LUNAR_UMBRA_FLOOR,
} from "./eclipseMath";
import { findUndeclaredUniforms } from "./shaderUniformAudit";

/**
 * W7 rewrite of the eclipse shader patch — real cone radii from
 * `../../../lib/eclipseGeometry.ts` instead of fixed eclipser-radius
 * ratios, and the umbral floor/tint baked per material (0 for an airless
 * eclipser, the Danjon refraction values for one with an atmosphere)
 * rather than read from a uniform. See `eclipseShaderPatch.ts`'s header
 * for the full rationale.
 */
describe("eclipse shader patch — W7", () => {
  const compose = (lunarRefraction: boolean, fragmentShader: string) =>
    `
    ${ECLIPSE_FRAGMENT_UNIFORMS}
    ${buildEclipseFragmentHelpers({ lunarRefraction })}
    ${fragmentShader}
    `.replace(
      "#include <opaque_fragment>",
      `${ECLIPSE_FRAGMENT_OUTPUT_PATCH}\n#include <opaque_fragment>`
    );

  it("anchors on a chunk three@0.181.2 actually ships (opaque_fragment, not the pre-r152 output_fragment)", () => {
    expect(THREE.ShaderLib.physical.fragmentShader).toContain(
      "#include <opaque_fragment>"
    );
    expect(THREE.ShaderLib.physical.fragmentShader).not.toContain(
      "#include <output_fragment>"
    );
    const composed = compose(false, THREE.ShaderLib.physical.fragmentShader);
    expect(composed).toContain("gs_computeEclipseShading(");
  });

  it("vertex-varyings declaration/assignment pair still targets begin_vertex", () => {
    expect(THREE.ShaderLib.physical.vertexShader).toContain(
      "#include <begin_vertex>"
    );
    expect(ECLIPSE_VERTEX_WORLD_VARYINGS_DECL).toContain(
      "varying vec3 vWorldPos;"
    );
    expect(ECLIPSE_VERTEX_WORLD_VARYINGS_ASSIGN).toContain("vWorldPos =");
  });

  it("declares u_eclipsingUmbraRadius / u_eclipsingPenumbraRadius / u_eclipsingMinShadow — the net +2 new uniforms standing law 2 sanctions", () => {
    expect(ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY).toContain(
      "uniform float u_eclipsingUmbraRadius;"
    );
    expect(ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY).toContain(
      "uniform float u_eclipsingPenumbraRadius;"
    );
    expect(ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY).toContain(
      "uniform float u_eclipsingMinShadow;"
    );
    // The uniform this wave retires — must not survive anywhere in the patch family.
    expect(ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY).not.toContain(
      "uEclipsingBodyRadius"
    );
  });

  /**
   * Same regression class `planetshinePatch.test.ts` pins (26cb756): an
   * identifier referenced in the injected GLSL with no matching `uniform`
   * declaration anywhere in the composed text compiles to
   * `'name' : undeclared identifier` under any real GLSL compiler, and no
   * other gate here runs an actual GPU compiler. Must run against the
   * FULLY COMPOSED shader (uniforms block + helpers + output patch, same
   * order `usePlanetMaterials.ts` uses), for BOTH `lunarRefraction`
   * variants — the baked floor/tint literal differs between them but
   * neither variant may leave an undeclared identifier.
   */
  it("declares every u_-prefixed identifier it references, for both lunarRefraction variants", () => {
    for (const lunarRefraction of [true, false]) {
      const composed = compose(
        lunarRefraction,
        THREE.ShaderLib.physical.fragmentShader
      );
      expect(
        findUndeclaredUniforms(composed),
        `lunarRefraction=${lunarRefraction}`
      ).toEqual([]);
    }
  });

  it("bakes the Danjon floor/tint literal only when lunarRefraction is true", () => {
    const lunar = buildEclipseFragmentHelpers({ lunarRefraction: true });
    expect(lunar).toContain(String(ECLIPSE_LUNAR_UMBRA_FLOOR));
    expect(lunar).toContain(
      `vec3(${ECLIPSE_LUNAR_REFRACTION_TINT[0]}, ${ECLIPSE_LUNAR_REFRACTION_TINT[1]}, ${ECLIPSE_LUNAR_REFRACTION_TINT[2]})`
    );

    const solar = buildEclipseFragmentHelpers({ lunarRefraction: false });
    expect(solar).not.toContain(String(ECLIPSE_LUNAR_UMBRA_FLOOR));
    expect(solar).toContain("vec3(0.0)");
  });

  it("ramps continuously from the core floor to fully lit across the whole penumbra, with no separate diffraction-band branch", () => {
    // W7 deleted the pre-existing diffraction "pulse" — a second local
    // maximum mid-penumbra had no physical grounding for an airless
    // eclipser (third-round arbitration). Confirm the shape: one mix()
    // driven by dist/penumbraRadius, nothing else touching `shdw`.
    const helpers = buildEclipseFragmentHelpers({ lunarRefraction: false });
    expect(helpers).toContain("shdw = mix(coreFloor, 1.0, t);");
    expect(helpers).not.toContain("diffractionIntensity");
    expect(helpers).not.toContain("DIFFRACTION0");
  });

  it("only evaluates the cone when the near-side gate passes and the penumbra radius is positive", () => {
    const helpers = buildEclipseFragmentHelpers({ lunarRefraction: false });
    expect(helpers).toMatch(/if \(dot_NM > -0\.15 && penumbraRadius > 0\.0\)/);
  });
});
