import * as THREE from "three";
import { describe, expect, it } from "vitest";

/**
 * General guard for the silent-no-op class W7 found: `String.replace`
 * with a needle that no longer exists in three's own shader source
 * returns the string UNCHANGED — no error, no console line — so a chunk
 * rename upstream (`output_fragment` → `opaque_fragment` in r152) turns a
 * shader patch into permanent dead code with nothing to catch it.
 * `regolithPhotometry.test.ts` had the single-needle form of this assert;
 * this is the general form the wave file asked for — every
 * `#include <chunk>` needle the `onBeforeCompile` patch family
 * (`usePlanetMaterials.ts` + the shader patch modules it composes)
 * targets via `.replace(...)`, walked against the actual three@0.181.2
 * source. Excludes the procedural sun shaders' literal
 * `#include <logdepthbuf_*>` directives — those are resolved by three's
 * own GLSL preprocessor at compile time (a real, loud compile error if
 * the chunk is missing), not by a JS string search that can silently
 * find nothing.
 */
describe("every #include<> needle the onBeforeCompile patch family replaces exists in three@0.181.2", () => {
  const vertexNeedles = ["begin_vertex"];
  const fragmentNeedles = [
    "opaque_fragment",
    "color_fragment",
    "map_fragment",
    "emissivemap_fragment",
    "lights_physical_pars_fragment",
    "lights_fragment_begin",
  ];

  // `MeshStandardMaterial` compiles from `ShaderLib.standard`, whose
  // shader source is textually identical to `ShaderLib.physical`'s
  // (verified: same string, different uniform set) — `physical` is the
  // reference the rest of this patch family's tests already use.
  it.each(vertexNeedles)(
    "%s exists in ShaderLib.physical.vertexShader",
    (needle) => {
      expect(THREE.ShaderLib.physical.vertexShader).toContain(
        `#include <${needle}>`
      );
    }
  );

  it.each(fragmentNeedles)(
    "%s exists in ShaderLib.physical.fragmentShader",
    (needle) => {
      expect(THREE.ShaderLib.physical.fragmentShader).toContain(
        `#include <${needle}>`
      );
    }
  );

  it("output_fragment (the pre-r152 name this repo's eclipse patch used to target) no longer exists", () => {
    expect(THREE.ShaderLib.physical.fragmentShader).not.toContain(
      "#include <output_fragment>"
    );
  });
});
