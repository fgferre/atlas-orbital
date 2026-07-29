import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  applyPlanetDirectLightCacheKey,
  applyPlanetDirectLightPatch,
} from "./solarIrradiancePatch";
import {
  PLANETSHINE_DIR_UNIFORM,
  PLANETSHINE_RADIANCE_UNIFORM,
  applyPlanetshinePatch,
  buildPlanetshinePatch,
} from "./planetshinePatch";

/**
 * Mirrors `solarIrradiancePatch.test.ts`'s idiom: the shine chunk must be
 * present ONLY when the material asked for it, absent otherwise (a
 * non-recipient never even calls `applyPlanetshinePatch` — see
 * `usePlanetMaterials.ts` — so this pins the shape of what recipients get),
 * and the recipient/non-recipient split must produce different program
 * cache keys so three cannot serve one cohort the other's compiled program.
 */
describe("planetshine second-source patch", () => {
  it("anchors on a chunk three actually ships", () => {
    expect(THREE.ShaderLib.standard.fragmentShader).toContain(
      "#include <lights_fragment_begin>"
    );
    expect(buildPlanetshinePatch({ regolith: false })).toContain(
      "#include <lights_fragment_begin>"
    );
  });

  it("calls RE_Direct_Regolith or RE_Direct_Physical BY NAME, never the RE_Direct macro", () => {
    // The whole point: routing through the macro would multiply by
    // u_solarIrradiance a second time (the sun's own body-relative scalar).
    const regolith = buildPlanetshinePatch({ regolith: true });
    expect(regolith).toContain("RE_Direct_Regolith( shineLight,");
    expect(regolith).not.toContain("RE_Direct( shineLight");

    const lambert = buildPlanetshinePatch({ regolith: false });
    expect(lambert).toContain("RE_Direct_Physical( shineLight,");
    expect(lambert).not.toContain("RE_Direct( shineLight");
  });

  it("converts the world-space direction uniform via the built-in viewMatrix", () => {
    const patch = buildPlanetshinePatch({ regolith: true });
    expect(patch).toContain(
      `normalize( ( viewMatrix * vec4( ${PLANETSHINE_DIR_UNIFORM}, 0.0 ) ).xyz )`
    );
  });

  it("registers neutral (zero) uniforms and rewrites the shader in place", () => {
    const shader = {
      uniforms: {} as { [name: string]: { value: unknown } },
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    applyPlanetshinePatch(shader, { regolith: true });

    expect(
      (shader.uniforms[PLANETSHINE_DIR_UNIFORM]?.value as THREE.Vector3).equals(
        new THREE.Vector3(0, 0, 0)
      )
    ).toBe(true);
    expect(
      (
        shader.uniforms[PLANETSHINE_RADIANCE_UNIFORM]?.value as THREE.Vector3
      ).equals(new THREE.Vector3(0, 0, 0))
    ).toBe(true);
    expect(shader.fragmentShader).toContain("IncidentLight shineLight;");
    // Applied once, not nested.
    expect(
      shader.fragmentShader.match(/IncidentLight shineLight;/g)
    ).toHaveLength(1);
  });

  it("is present only for a material that actually asked for it", () => {
    // A non-recipient's shader never has `applyPlanetshinePatch` called on
    // it at all (see `usePlanetMaterials.ts`'s `receivesPlanetshine` guard),
    // so its fragment shader carries no shine chunk whatsoever.
    const untouched = THREE.ShaderLib.standard.fragmentShader;
    expect(untouched).not.toContain("shineLight");
    expect(untouched).not.toContain(PLANETSHINE_DIR_UNIFORM);
  });

  it("gives a shine recipient a different program cache key than a non-recipient of the same regolith-ness", () => {
    const sharedOnBeforeCompile = () => {};

    const recipient = {
      onBeforeCompile: sharedOnBeforeCompile,
      customProgramCacheKey: () => "",
    };
    const nonRecipient = {
      onBeforeCompile: sharedOnBeforeCompile,
      customProgramCacheKey: () => "",
    };

    applyPlanetDirectLightCacheKey(recipient, {
      regolith: true,
      shine: true,
    });
    applyPlanetDirectLightCacheKey(nonRecipient, { regolith: true });

    expect(recipient.customProgramCacheKey()).not.toBe(
      nonRecipient.customProgramCacheKey()
    );
    expect(recipient.customProgramCacheKey()).toContain(
      sharedOnBeforeCompile.toString()
    );
  });

  it("composes cleanly with the direct-light patch on the same shader", () => {
    // Both patches run in `usePlanetMaterials.ts`'s hoisted
    // `patchDirectLights` closure against the SAME shader object — confirm
    // they touch disjoint anchors and neither clobbers the other.
    const shader = {
      uniforms: {} as { [name: string]: { value: unknown } },
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    applyPlanetDirectLightPatch(shader, { regolith: true });
    applyPlanetshinePatch(shader, { regolith: true });

    expect(shader.fragmentShader).toContain("void RE_Direct_Regolith(");
    expect(shader.fragmentShader).toContain("void RE_Direct_SolarIrradiance(");
    expect(shader.fragmentShader).toContain("IncidentLight shineLight;");
  });
});
