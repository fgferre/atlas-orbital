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
 * materials that in most cases already carry an `onBeforeCompile`. At the
 * shipped default the uniform is exactly `1.0`, so the multiply is an
 * IEEE-754 identity and the rendered output is bit-identical to HEAD — the
 * no-op contract `e2e/boot.spec.ts` verifies at the pixel level.
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

/**
 * Install the direct-light chain on a shader inside `onBeforeCompile`.
 *
 * Call this exactly once per material — a second call would replace the
 * include a second time and nest the wrapper inside itself, squaring the
 * irradiance. Every planet-material branch in `usePlanetMaterials` routes
 * through here so the anchor string and the uniform registration have one
 * definition each.
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
