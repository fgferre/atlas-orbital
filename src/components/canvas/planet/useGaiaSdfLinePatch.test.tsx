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

import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineMaterial } from "three-stdlib";

import { useGaiaSdfLinePatch } from "./useGaiaSdfLinePatch";

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

describe("T5.4 — useGaiaSdfLinePatch HMR / StrictMode re-entry correctness", () => {
  /**
   * Minimal mock of the Line2/LineSegments2 shape the hook uses.
   * The hook only reads `line.material`; `material.onBeforeCompile`
   * is the surface it mutates + `material.needsUpdate` is the
   * re-compile flag.
   */
  const makeFakeLine = () => {
    const mat = new LineMaterial();
    // Return a minimal Line2-shaped object whose `material` ref
    // points at the mat. Cast through `unknown` because we only
    // implement the fields the hook touches.
    return { mat, line: { material: mat } as unknown };
  };

  /**
   * Hook-hosting test component. Accepts an external ref object so
   * the test can point it at the fake Line2 before render.
   */
  const HookHost = ({
    ref,
  }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref: React.MutableRefObject<any | null>;
  }) => {
    useGaiaSdfLinePatch(ref);
    return null;
  };

  /**
   * Drive the patched onBeforeCompile with a fake shader object and
   * return the number of times the SDF sentinel appears in the
   * resulting `fragmentShader`. A correct patch injects the block
   * exactly ONCE even after multiple mount/HMR cycles.
   */
  const countSdfBlocks = (mat: LineMaterial): number => {
    const fakeShader = {
      fragmentShader: mat.fragmentShader,
      vertexShader: mat.vertexShader,
      uniforms: mat.uniforms,
      defines: {},
    };
    const handler = mat.onBeforeCompile;
    if (typeof handler === "function") {
      // `renderer` arg unused by our patch; pass empty object cast.
      handler.call(
        mat,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fakeShader as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any
      );
    }
    const matches = fakeShader.fragmentShader.match(
      /Gaia Sky line\.quad\.cpu\.fragment\.glsl:20-33 port/g
    );
    return matches ? matches.length : 0;
  };

  it("first install injects exactly one SDF block", () => {
    const { mat, line } = makeFakeLine();
    const refObj = { current: line };
    render(<HookHost ref={refObj} />);
    expect(countSdfBlocks(mat)).toBe(1);
  });

  it("second mount (StrictMode double-invoke simulation) keeps exactly one SDF block — no stacking", () => {
    const { mat, line } = makeFakeLine();
    const refObj = { current: line };
    // First mount
    const { unmount: unmount1 } = render(<HookHost ref={refObj} />);
    expect(countSdfBlocks(mat)).toBe(1);
    // Simulate unmount+remount (StrictMode / HMR cycle)
    unmount1();
    render(<HookHost ref={refObj} />);
    // Bug pre-T5.4: would return 2 here (the patch wrapped itself).
    expect(countSdfBlocks(mat)).toBe(1);
  });

  it("many remount cycles never stack blocks (regression: ten-round HMR loop)", () => {
    const { mat, line } = makeFakeLine();
    const refObj = { current: line };
    const unmounts: Array<() => void> = [];
    for (let i = 0; i < 10; i++) {
      const { unmount } = render(<HookHost ref={refObj} />);
      unmounts.push(unmount);
      // Unmount before next mount to simulate a hot-replace cycle.
      if (i < 9) {
        unmount();
      }
    }
    // After 10 mounts + 9 unmounts, exactly one patch is live on
    // the material, and the shader-injection still happens once.
    expect(countSdfBlocks(mat)).toBe(1);
    // Final unmount for cleanliness — exercises the cleanup one
    // last time (restore should be a no-op because material's
    // onBeforeCompile matches the current patch).
    unmounts[unmounts.length - 1]();
  });

  it("cleanup restores LineMaterial's built-in onBeforeCompile after unmount", () => {
    const { mat, line } = makeFakeLine();
    // Capture LineMaterial's OWN onBeforeCompile before the hook
    // touches it — this is the ground truth for "restored".
    const builtInHandler = mat.onBeforeCompile;
    expect(typeof builtInHandler).toBe("function");

    const refObj = { current: line };
    const { unmount } = render(<HookHost ref={refObj} />);
    // Patch replaced the handler
    expect(mat.onBeforeCompile).not.toBe(builtInHandler);

    // Unmount: cleanup fires, built-in is restored
    unmount();
    expect(mat.onBeforeCompile).toBe(builtInHandler);
  });

  it("cleanup bumps material.version so Three.js recompiles without the patch", () => {
    // `Material.needsUpdate = true` is a write-only setter that
    // increments `.version`. Assert the side-effect via the version
    // counter: expect at least one increment between pre-install
    // baseline and post-cleanup.
    const { mat, line } = makeFakeLine();
    const versionAtMountStart = mat.version;
    const refObj = { current: line };
    const { unmount } = render(<HookHost ref={refObj} />);
    const versionAfterInstall = mat.version;
    expect(versionAfterInstall).toBeGreaterThan(versionAtMountStart);
    unmount();
    expect(mat.version).toBeGreaterThan(versionAfterInstall);
  });

  it("null lineRef is a safe no-op (no throw, no material side-effects)", () => {
    // Edge case: mount with null ref. Useful for components that
    // conditionally mount the Line (`lineRef.current` starts null).
    const refObj: { current: unknown | null } = { current: null };
    expect(() => {
      render(<HookHost ref={refObj} />);
    }).not.toThrow();
  });

  it("`act` smoke — the hook does not log warnings during lifecycle", () => {
    // If `onBeforeCompile` or cleanup threw, React's test renderer
    // surfaces it as a console.error. Assert no console noise.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { mat, line } = makeFakeLine();
      void mat; // silence unused-binding lint
      const refObj = { current: line };
      act(() => {
        render(<HookHost ref={refObj} />);
      });
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
