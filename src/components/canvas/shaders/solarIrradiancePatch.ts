/**
 * Per-body solar irradiance as a single direct-light uniform (Onda 2.1).
 *
 * ## What it does
 *
 * Wraps `RE_Direct` — the macro three.js calls once per direct light
 * (`lights_fragment_begin.glsl.js`) — with a function that scales the
 * light's **irradiance** by `u_solarIrradiance` before the BRDF runs. The
 * uniform carries the fused `irradiance × assistGain` scalar computed on the
 * CPU by `src/lib/graphics/solarIrradiance.ts`; see that file for the law,
 * the provisional anchor, and why the two factors are fused into one number.
 *
 * ## Why the irradiance and not the result
 *
 * Scaling `directLight.color` (the incoming radiance) rather than
 * `reflectedLight.direct*` (the outgoing result) is what makes this compose
 * with the regolith photometry patch, and with any future one:
 *
 *  - It reaches diffuse, specular, clearcoat and sheen with a single
 *    multiply, because they are all linear in the incident radiance. Scaling
 *    only `directDiffuse` afterwards would leave a specular lobe lit for
 *    1 AU on a body at 30 AU.
 *  - It lands **before** the Lommel-Seeliger factor, which is what the
 *    regolith wrapper applies to its own diffuse delta. LS is a geometric
 *    redistribution (a function of μ₀ and μ only, flux-neutral by
 *    construction); moving "how much light arrived" across it is exactly the
 *    ordering that keeps the two concerns independent.
 *  - It cannot touch ambient. `RE_IndirectDiffuse` is a different macro and
 *    is deliberately not wrapped: the 0.02 viewing floor is a display
 *    guarantee, not incoming sunlight (`visualPresetOverrides.ts`).
 *
 * ## Chaining, not replacing
 *
 * The wrapper body calls `RE_Direct(...)`, not a hard-coded function name.
 * At that point in the shader the macro still points at whatever the
 * previous patch left it pointing at — `RE_Direct_Physical` on a plain body,
 * `RE_Direct_Regolith` on an airless one — so the chain composes by
 * construction and this file never has to know the regolith wrapper's
 * internal symbol. The `#undef`/`#define` pair AFTER the function is what
 * puts this wrapper outermost. Order matters and is not commutative: the
 * regolith wrapper calls `RE_Direct_Physical` by name, so it must be the
 * inner one — which is why {@link buildPlanetDirectLightPatch} emits the
 * whole chain as one replacement instead of two independent `String.replace`
 * calls that could land in either order.
 *
 * ## Cost
 *
 * One `float` uniform and one multiply per direct light per fragment, on
 * materials that in most cases already carry an `onBeforeCompile`.
 *
 * The uniform is registered at `1.0` so a material that draws before
 * `Planet.tsx`'s first per-frame write is lit neutrally. It no longer STAYS
 * there: Onda 2.2 moved the default policy to `"assisted"`, so the shipped
 * value is `E^0.35` per body. (Onda 2.1 shipped this file under
 * `"compensated"`, whose gain is exactly `1/E` — that was what made the
 * introduction of this patch a bit-identical no-op at the time.)
 */

import { REGOLITH_PHOTOMETRY_LIGHTS_PATCH } from "./regolithPhotometryPatch";

/**
 * Uniform name carrying the fused `irradiance × assistGain` scalar. Exported
 * so the per-frame writer in `Planet.tsx` and this GLSL cannot drift apart.
 */
export const SOLAR_IRRADIANCE_UNIFORM = "u_solarIrradiance";

/**
 * The wrapper itself. Emitted AFTER the include (and after any inner
 * `RE_Direct` patch), so the `RE_Direct(...)` call below expands to the
 * current innermost implementation and the trailing `#define` makes this one
 * the entry point for `lights_fragment_begin`'s light loops.
 */
const SOLAR_IRRADIANCE_WRAPPER = /* glsl */ `
uniform float ${SOLAR_IRRADIANCE_UNIFORM};

// Inverse-square solar irradiance from ephemeris AU, fused with the didactic
// assist gain on the CPU. Scales the INCOMING radiance of each direct light,
// so every lobe of the BRDF below (and any inner RE_Direct wrapper) sees a
// correctly-attenuated sun. Indirect/ambient is a separate macro and stays
// unscaled on purpose.
void RE_Direct_SolarIrradiance( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

  IncidentLight scaledLight = directLight;
  scaledLight.color *= ${SOLAR_IRRADIANCE_UNIFORM};

  RE_Direct( scaledLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

}
#undef RE_Direct
#define RE_Direct RE_Direct_SolarIrradiance
`;

/**
 * The full replacement for `#include <lights_physical_pars_fragment>` on a
 * planet material: three's own chunk, then the regolith wrapper if the body
 * opts into it, then the irradiance wrapper outermost.
 */
export const buildPlanetDirectLightPatch = ({
  regolith,
}: {
  regolith: boolean;
}): string =>
  `${
    regolith
      ? REGOLITH_PHOTOMETRY_LIGHTS_PATCH
      : "#include <lights_physical_pars_fragment>"
  }
${SOLAR_IRRADIANCE_WRAPPER}`;

/** Minimal structural view of the object three hands `onBeforeCompile`. */
interface PatchableShader {
  uniforms: { [name: string]: { value: unknown } };
  fragmentShader: string;
}

/** Minimal structural view of the material fields the cache key touches. */
interface CacheKeyedMaterial {
  onBeforeCompile: (...args: never[]) => void;
  customProgramCacheKey: () => string;
}

/**
 * Discriminator appended to a planet material's program cache key, naming
 * every choice in {@link buildPlanetDirectLightPatch} that changes the
 * generated GLSL. Extend this string — do not add a second mechanism — if a
 * future option makes the emitted chain vary again.
 */
const resolveDirectLightVariant = ({
  regolith,
  eclipse = "none",
}: {
  regolith: boolean;
  /**
   * W7 — the eclipse output patch is a second within-branch GLSL variant
   * read from a captured variable (`body.eclipsingBodyId`), invisible to
   * the closure's source text exactly like the regolith flag. Without this
   * discriminator the Moon (refraction floor) and the five regolith moons
   * (neutral shading) hash to one program key and three serves one cohort
   * the other's compiled shader, decided by render order.
   */
  eclipse?: "none" | "neutral" | "refraction";
}): string =>
  `${regolith ? "planet-regolith" : "planet-lambert"}|eclipse-${eclipse}`;

/**
 * Make three's program cache see the two direct-light chains as different
 * programs. **Required wherever {@link applyPlanetDirectLightPatch} is used.**
 *
 * ## The bug this prevents
 *
 * `THREE.Material.customProgramCacheKey()` defaults to
 * `this.onBeforeCompile.toString()` (three r181,
 * `src/materials/Material.js`) — the SOURCE TEXT of the callback, not what it
 * does. Onda 2.1 routed every planet-material branch through one hoisted
 * `patchDirectLights` closure, which is exactly right for keeping the chain
 * order in one place and exactly wrong for that cache key: the closure's text
 * is byte-identical whether `body.airlessRegolith` is true or false, because
 * the flag is read from a captured variable rather than written into the
 * source. Two materials that agree on every other program parameter
 * therefore hash to the same key, and three hands the second one the FIRST
 * one's compiled program.
 *
 * Consequence, before this fix: whichever cohort compiled first won. Either
 * the airless bodies (mercury, moon, io, europa, ganymede, callisto,
 * enceladus) silently lost their Lommel-Seeliger photometry, or venus / mars
 * / the giants / titan / the sphere-path TNOs silently gained it — decided by
 * render order, reported by nothing, with no error and no visual that reads
 * as "broken" rather than "a bit off".
 *
 * The key is composed as `default ⊕ variant`, never `variant` alone: the
 * per-branch callbacks (Earth day/night, the ring shadow solve, the eclipse
 * branch) generate genuinely different GLSL and rely on their own source text
 * to stay distinct. Replacing the key with a bare variant string would
 * collapse THOSE into each other — a worse bug than the one being fixed.
 *
 * Reads `onBeforeCompile` lazily, so it may be called before the callback is
 * assigned.
 */
export const applyPlanetDirectLightCacheKey = (
  material: CacheKeyedMaterial,
  options: { regolith: boolean; eclipse?: "none" | "neutral" | "refraction" }
): void => {
  const variant = resolveDirectLightVariant(options);
  material.customProgramCacheKey = () =>
    `${material.onBeforeCompile.toString()}|${variant}`;
};

/**
 * Install the direct-light chain on a shader inside `onBeforeCompile`.
 *
 * Call this exactly once per material — a second call on the same `shader`
 * would re-find the literal `#include <lights_physical_pars_fragment>`
 * token (still present verbatim in the once-patched string, since
 * {@link buildPlanetDirectLightPatch}'s non-regolith branch re-emits that
 * exact token ahead of the wrapper) and inject a SECOND
 * `RE_Direct_SolarIrradiance` function definition. GLSL does not allow two
 * function definitions with the same name, so the result is a shader
 * compile error, not a silently-doubled multiply — there is no live path
 * to a "squared irradiance" runtime. Not currently reachable: only one call
 * site exists (`usePlanetMaterials.ts`), and three.js hands `onBeforeCompile`
 * a fresh unpatched template on every recompile rather than reusing the
 * previous run's mutated string. Every planet-material branch in
 * `usePlanetMaterials` routes through here so the anchor string and the
 * uniform registration have one definition each.
 *
 * The uniform starts at `1.0` (neutral) so a material that renders before
 * `Planet.tsx`'s first `useFrame` write is lit exactly as it is today.
 */
export const applyPlanetDirectLightPatch = (
  shader: PatchableShader,
  options: { regolith: boolean }
): void => {
  shader.uniforms[SOLAR_IRRADIANCE_UNIFORM] = { value: 1 };
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_physical_pars_fragment>",
    buildPlanetDirectLightPatch(options)
  );
};
