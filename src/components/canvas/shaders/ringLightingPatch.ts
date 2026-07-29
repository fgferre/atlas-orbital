/**
 * Ring direct-light patch — Saturn's rings respond to the same fused
 * sunlight scalar the planet surfaces do, instead of carrying a constant
 * self-lit emissive (W5-B; closes the lighting-redesign wave's Onda 2.4
 * owed item 2 — "ring emissive detaches under a high anchor").
 *
 * ## What this replaces
 *
 * The ring material used to be lit ENTIRELY through `emissive` +
 * `emissiveMap` at a fixed `ringEmissive` intensity — a constant that never
 * responded to the active brightness policy, Saturn's real heliocentric
 * distance, or the auto-exposure anchor. At Saturn-real (anchor ~89) that
 * constant lifted 89× while the planet's own surface stayed at reference
 * display brightness (`saturn-real-after.png`, lighting-redesign wave,
 * Onda 2.4). Deleted in the same commit as this patch — see
 * `usePlanetMaterials.ts`'s `ringMaterial`.
 *
 * ## The uniform
 *
 * Reuses `SOLAR_IRRADIANCE_UNIFORM` (`u_solarIrradiance`) verbatim — the
 * SAME uniform name `solarIrradiancePatch.ts` declares on planet materials
 * — so `Planet.tsx`'s existing per-frame writer (which looks the uniform up
 * by name on `material.userData.shader`) only needs a second material in
 * its loop, not a second law. Rings share the planet's own heliocentric
 * distance, so the identical scalar value is correct for both.
 *
 * ## The lit/unlit distinction
 *
 * A ring is a flat, double-sided disc. Three's standard PBR already flips
 * the fragment normal per face (`faceDirection` in
 * `normal_fragment_maps.glsl.js`), so a plain `RE_Direct` wrapper would
 * light the sun-facing side correctly and leave the far side to
 * `max(NdotL, 0) == 0` — pure black. Real rings are optically thin: some
 * sunlight passes through the particle field and reaches the unlit face,
 * dimmed rather than absent. Approximated here as a single artist fraction
 * ({@link RING_TRANSMISSION_FRACTION}), NOT a per-ring optical-depth model
 * — the A/B/C rings and the Cassini division have very different real
 * transmission, and modelling that is the deeper W9 ("the rings transmit")
 * wave, not this one. The unlit face mirrors the light direction across the
 * surface so the ordinary Lambertian term underneath (which would otherwise
 * clamp a negative NdotL to zero) still fires, at reduced strength.
 *
 * Zero new uniforms beyond the shared irradiance one (standing law 2): the
 * transmission fraction is a fixed artist constant, inlined as a GLSL
 * literal at material-compile time, same precedent as
 * `CLOUD_SHADOW_LUMA_CUTOFF` in `usePlanetMaterials.ts`.
 */

import { SOLAR_IRRADIANCE_UNIFORM } from "./solarIrradiancePatch";

/**
 * Fraction of direct sunlight treated as transmitted through the ring plane
 * to reach its unlit face. An artist approximation, not a measured optical
 * depth — real ring transmission ranges from near-opaque (the A ring core)
 * to near-transparent (the Cassini division), which no single constant can
 * honor. Picked low enough that the unlit face still reads visibly darker
 * than the lit face at every brightness policy.
 */
export const RING_TRANSMISSION_FRACTION = 0.35;

/** Minimal structural view of the object three hands `onBeforeCompile`. */
interface PatchableShader {
  uniforms: { [name: string]: { value: unknown } };
  fragmentShader: string;
}

/**
 * The wrapper itself. Emitted immediately after three's own
 * `lights_physical_pars_fragment` chunk, so `RE_Direct(...)` below expands
 * to `RE_Direct_Physical` (that chunk's own trailing `#define`) and the
 * following `#define` makes this wrapper the entry point for
 * `lights_fragment_begin`'s light loop.
 */
const RING_DIRECT_LIGHT_WRAPPER = /* glsl */ `
uniform float ${SOLAR_IRRADIANCE_UNIFORM};

// Sunlit rings (W5-B). ringNdotL >= 0 is the face the Sun illuminates
// directly; ringNdotL < 0 is the far face, which receives a dim,
// transmitted fraction of the same light rather than nothing. Mirroring
// the light direction lets the standard Lambertian term underneath (which
// clamps a negative NdotL to zero) still see a positive one for the
// transmitted case.
void RE_Direct_Ring( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

  float ringNdotL = dot( geometryNormal, directLight.direction );
  IncidentLight ringLight = directLight;
  ringLight.color *= ${SOLAR_IRRADIANCE_UNIFORM};

  if ( ringNdotL < 0.0 ) {
    ringLight.direction = -directLight.direction;
    ringLight.color *= ${RING_TRANSMISSION_FRACTION.toFixed(3)};
  }

  RE_Direct( ringLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

}
#undef RE_Direct
#define RE_Direct RE_Direct_Ring
`;

/**
 * Full replacement for `#include <lights_physical_pars_fragment>` on the
 * ring material.
 */
export const buildRingDirectLightPatch = (): string =>
  `#include <lights_physical_pars_fragment>
${RING_DIRECT_LIGHT_WRAPPER}`;

/**
 * Install the ring direct-light chain on a shader inside `onBeforeCompile`.
 *
 * Call exactly once per material/shader, same rule as
 * {@link import("./solarIrradiancePatch").applyPlanetDirectLightPatch} and
 * for the same reason: a second call would re-find the literal
 * `#include <lights_physical_pars_fragment>` token and inject a SECOND
 * `RE_Direct_Ring` definition — a GLSL compile error, not a silently
 * doubled multiply. Only one call site exists (`usePlanetMaterials.ts`'s
 * `ringMaterial`).
 *
 * The uniform starts at `1.0` (neutral) so the ring renders lit exactly as
 * a plain sunlit surface would before `Planet.tsx`'s first per-frame write.
 */
export const applyRingDirectLightPatch = (shader: PatchableShader): void => {
  shader.uniforms[SOLAR_IRRADIANCE_UNIFORM] = { value: 1 };
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_physical_pars_fragment>",
    buildRingDirectLightPatch()
  );
};

/** Minimal structural view of the material fields the cache key touches. */
interface CacheKeyedMaterial {
  onBeforeCompile: (...args: never[]) => void;
  customProgramCacheKey: () => string;
}

/**
 * Discriminator for the ring material's program cache key — the same
 * 66ab30f discipline `applyPlanetDirectLightCacheKey` applies to planet
 * materials.
 *
 * `mat.onBeforeCompile.toString()` is three's default cache key (the
 * closure's SOURCE TEXT, not what it emits), and the ring's
 * `onBeforeCompile` already captures `flattening` as a closure variable —
 * via `buildPlanetShadowFragmentPatch(flattening)` in
 * `usePlanetMaterials.ts` — rather than embedding the value in the source
 * text itself. Two ring materials for differently-flattened bodies would
 * therefore hash to the same key and three would hand the second one the
 * first one's compiled program. Not currently reachable (the catalog
 * carries exactly one `ringSystem`, so at most one ring material exists at
 * a time), but this patch adds a second closure-captured value of the same
 * shape (`SOLAR_IRRADIANCE_UNIFORM`'s value is a per-frame uniform, not a
 * cache-key concern — the concern is `flattening`), so the discipline is
 * applied now rather than left for whoever ships the next ringed body.
 *
 * Composed as `default ⊕ variant`, never `variant` alone, so materials that
 * differ in every OTHER way (Earth day/night, the eclipse branch) keep
 * relying on their own distinct source text.
 */
export const applyRingDirectLightCacheKey = (
  material: CacheKeyedMaterial,
  flattening: number
): void => {
  material.customProgramCacheKey = () =>
    `${material.onBeforeCompile.toString()}|ring-flattening:${flattening}`;
};
