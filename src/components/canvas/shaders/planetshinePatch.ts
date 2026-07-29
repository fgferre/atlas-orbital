/**
 * Planetshine / earthshine as a second incident-light UNIFORM (Onda 2.3).
 * Zero new three.js scene lights — handoff §6 checklist item 2 forbids one:
 * a real light would change `NUM_POINT_LIGHTS` for every patched material
 * family and force a recompile, a hitch of hundreds of ms. This is CPU data
 * consumed inside the existing patch chain instead.
 *
 * ## Where it lands, and how double-scaling is avoided
 *
 * `solarIrradiancePatch.ts` wraps `RE_Direct` so the ONE real light (the
 * Sun) gets multiplied by `u_solarIrradiance`, and the macro is left
 * pointing at `RE_Direct_SolarIrradiance` for the rest of the shader. This
 * file does NOT add a second light to that loop (there is no scene light to
 * loop over) and does NOT call the `RE_Direct` macro for its manual
 * IncidentLight — calling the macro would route the shine through
 * `RE_Direct_SolarIrradiance` and multiply it a SECOND time by
 * `u_solarIrradiance`, which is the SUN's body-relative scalar and has
 * nothing to do with the shine source. `u_shineRadiance` is already the
 * CPU's final answer (see `src/lib/graphics/planetshine.ts`), so it must
 * arrive exactly once.
 *
 * Instead, the injected block calls `RE_Direct_Regolith` or
 * `RE_Direct_Physical` BY NAME — whichever one `solarIrradiancePatch.ts`'s
 * chain built for this material (both are always defined; regolith bodies
 * get `RE_Direct_Regolith` on top of `RE_Direct_Physical`, everyone else
 * gets only the latter). Calling it directly still runs the per-light
 * Lommel-Seeliger correction (or plain Lambert on a non-regolith recipient)
 * using THIS light's own incidence geometry — the entire reason the
 * regolith patch was rewritten per-light in the first place (c145b01): a
 * second direct light must never be corrected using a DIFFERENT light's
 * geometry.
 *
 * The injection point is `#include <lights_fragment_begin>` (inside the
 * fragment shader's `main()`, right after three's own point/spot/
 * directional light loops finish) — NOT `lights_physical_pars_fragment`,
 * which is where `solarIrradiancePatch.ts` / `regolithPhotometryPatch.ts`
 * land. Those two live at global scope (function/macro DEFINITIONS); this
 * one has to run AFTER `geometryPosition` / `geometryNormal` /
 * `geometryViewDir` / `geometryClearcoatNormal` / `reflectedLight` exist,
 * which `lights_fragment_begin` itself declares. Splitting the anchor is
 * why this is a separate module rather than a branch inside
 * `solarIrradiancePatch.ts`.
 *
 * ## Direction convention
 *
 * `u_shineDir` is a WORLD-space unit vector pointing FROM the recipient
 * TOWARD the shine source (mirrors `IncidentLight.direction`'s own
 * convention, and the `uSunPositionWorld` convention already used
 * elsewhere in `usePlanetMaterials.ts` — the Sun is always at world
 * origin). `geometryNormal` / `geometryViewDir` / a real light's own
 * `directLight.direction` are all in VIEW space by the time
 * `lights_fragment_begin` runs (three transforms light positions to view
 * space when it builds the lights UBO), so the injected block converts via
 * the built-in `viewMatrix` uniform three always provides — the same
 * uniform the pre-c145b01 regolith patch read for its old sun-at-origin
 * shortcut (`viewMatrix[3].xyz`), confirming it is available at this point
 * in every material this codebase patches.
 *
 * ## Cache-key discipline (66ab30f)
 *
 * `applyPlanetshinePatch` only ever runs on the 3 recipient bodies (see
 * `usePlanetMaterials.ts`), so the emitted GLSL already differs from a
 * non-recipient's by construction. `solarIrradiancePatch.ts`'s
 * `applyPlanetDirectLightCacheKey` still needs a `shine` flag on its own
 * discriminator (see that file) so three's `customProgramCacheKey` — which
 * defaults to source TEXT, not behaviour — cannot hash a shine recipient
 * and a non-recipient of the same regolith-ness to the same program.
 */

import * as THREE from "three";

/** WORLD-space unit direction FROM the recipient TOWARD the shine source. */
export const PLANETSHINE_DIR_UNIFORM = "u_shineDir";

/**
 * The CPU's final, already-fused radiance (`R × parent irradiance ×
 * assistGain`, broadcast to a neutral grey vec3 — no spectral tint is
 * cited in the sources this wave uses, so none is invented). See
 * `src/lib/graphics/planetshine.ts`.
 */
export const PLANETSHINE_RADIANCE_UNIFORM = "u_shineRadiance";

/**
 * The manual IncidentLight + direct RE_Direct_* call, appended after three's
 * own light loop. Emitted only for the 3 recipient bodies — see
 * `usePlanetMaterials.ts`.
 */
export const buildPlanetshinePatch = ({
  regolith,
}: {
  regolith: boolean;
}): string => `
#include <lights_fragment_begin>

// Onda 2.3 — planetshine / earthshine second-source uniform. See this
// file's header for why this calls RE_Direct_${
  regolith ? "Regolith" : "Physical"
} BY NAME instead of the RE_Direct macro (avoids a second
// u_solarIrradiance multiply) and why the direction needs a view-space
// conversion here.
{
  IncidentLight shineLight;
  shineLight.direction = normalize( ( viewMatrix * vec4( ${PLANETSHINE_DIR_UNIFORM}, 0.0 ) ).xyz );
  shineLight.color = ${PLANETSHINE_RADIANCE_UNIFORM};
  shineLight.visible = true;
  RE_Direct_${
    regolith ? "Regolith" : "Physical"
  }( shineLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
}
`;

/** Minimal structural view of the object three hands `onBeforeCompile`. */
interface PatchableShader {
  uniforms: { [name: string]: { value: unknown } };
  fragmentShader: string;
}

/**
 * Install the shine uniforms + injection on a shader inside
 * `onBeforeCompile`. Call this AFTER `applyPlanetDirectLightPatch` (order
 * does not actually matter — the two touch disjoint anchors — but this
 * keeps the "irradiance chain first, second-source addition after" reading
 * order `usePlanetMaterials.ts` documents). Call once per material, same
 * non-reentrancy argument as `applyPlanetDirectLightPatch`: three hands
 * `onBeforeCompile` a fresh unpatched template on every recompile, and only
 * one call site exists.
 *
 * Uniforms start neutral (zero direction, zero radiance) so a material that
 * draws before `Planet.tsx`'s first per-frame write contributes nothing —
 * the same "starts inert, per-frame write makes it live" contract
 * `u_solarIrradiance` uses.
 */
export const applyPlanetshinePatch = (
  shader: PatchableShader,
  options: { regolith: boolean }
): void => {
  shader.uniforms[PLANETSHINE_DIR_UNIFORM] = { value: new THREE.Vector3() };
  shader.uniforms[PLANETSHINE_RADIANCE_UNIFORM] = {
    value: new THREE.Vector3(),
  };
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_fragment_begin>",
    buildPlanetshinePatch(options)
  );
};
