// @vitest-environment jsdom
//
// Regression gate: ensures the `three-stdlib` LineMaterial fragment
// shader string still contains the sentinel `useGaiaSdfLinePatch`
// searches for. If three-stdlib ships a major version that changes
// the shader to something like `gl_FragColor = vec4(diffuseColor.rgb,
// alpha);` or otherwise restructures the output, this test fails
// loudly — flagged by codex as a potential blocker for future
// bumps (false-alarm for the currently pinned three-stdlib@2.36.1,
// but cheap to pin against regression).

import { describe, expect, it } from "vitest";
import { LineMaterial } from "three-stdlib";

const SENTINEL = "gl_FragColor = diffuseColor;";

describe("useGaiaSdfLinePatch contract with three-stdlib LineMaterial", () => {
  it("LineMaterial fragment shader still contains the exact sentinel the hook replaces", () => {
    const mat = new LineMaterial();
    const frag = mat.fragmentShader;
    expect(typeof frag).toBe("string");
    expect(frag.includes(SENTINEL)).toBe(true);
  });

  it("LineMaterial fragment sets `diffuseColor.a` from `alpha` before the sentinel", () => {
    // If three-stdlib switches to `gl_FragColor = vec4(diffuse, alpha);`
    // without the intermediate `diffuseColor` assembly, our patch's
    // `diffuseColor.a *= sdfAlpha` wouldn't flow to the output. Pin
    // the `vec4( diffuse, alpha )` assembly as the contract.
    const mat = new LineMaterial();
    const frag = mat.fragmentShader;
    expect(frag.includes("vec4( diffuse, alpha )")).toBe(true);
    // And the sentinel must appear AFTER the `vec4( diffuse, alpha )`
    // line so `diffuseColor.a` equals the shader's computed alpha at
    // replacement time.
    const diffuseColorIdx = frag.indexOf("vec4( diffuse, alpha )");
    const sentinelIdx = frag.indexOf(SENTINEL);
    expect(diffuseColorIdx).toBeGreaterThan(-1);
    expect(sentinelIdx).toBeGreaterThan(-1);
    expect(sentinelIdx).toBeGreaterThan(diffuseColorIdx);
  });

  it("LineMaterial fragment exposes `vUv` in the non-WORLD_UNITS branch", () => {
    // Our patch references `vUv.y`. If the stdlib switches the branch
    // gate to a different varying name, the patched shader won't
    // compile. Pin `varying vec2 vUv;` as the contract.
    const mat = new LineMaterial();
    const frag = mat.fragmentShader;
    expect(frag.includes("varying vec2 vUv;")).toBe(true);
  });
});
