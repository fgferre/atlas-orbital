/**
 * Lommel-Seeliger diffuse photometry for airless regolith surfaces.
 *
 * **The law.** A Lambert sphere lit from the viewer's direction is bright at
 * the sub-solar point and falls off toward the limb as cos(incidence). Airless
 * regolith does not: the Moon at full phase reads as a nearly flat disc with a
 * hard edge, and that flatness is one of the few photometric facts a learner
 * can check against a photograph. The reason is single-scattering in a
 * particulate, shadowing medium — a semi-infinite layer of grains returns
 *
 *     I / F  ∝  μ₀ / (μ₀ + μ)
 *
 * rather than Lambert's μ₀, where μ₀ = cos(incidence) and μ = cos(emission).
 * This is the Lommel-Seeliger law, the single-scattering limit of the Hapke
 * model, and it is the standard first-order description of lunar-like
 * (low-albedo, airless, porous) surfaces. Full Hapke adds a
 * particle-phase function, an opposition surge and macroscopic roughness —
 * deliberately out of scope; those need per-body measured parameters, and
 * without them a Hapke implementation would be an invention wearing a
 * physical name.
 *
 * **Per-light wrapper, not a post-sum multiply.** Three.js calls `RE_Direct`
 * once per direct light — see `lights_fragment_begin.glsl.js` in
 * `node_modules/three`, which loops over point/spot/directional lights and
 * invokes `RE_Direct(directLight, geometryPosition, geometryNormal,
 * geometryViewDir, geometryClearcoatNormal, material, reflectedLight)`
 * inside each loop body. `RE_Direct` is itself a macro
 * (`#define RE_Direct RE_Direct_Physical`, set at the end of
 * `lights_physical_pars_fragment.glsl.js`), so this patch redefines that
 * macro to point at a wrapper: `RE_Direct_Regolith` snapshots
 * `reflectedLight.directDiffuse`, calls the original `RE_Direct_Physical`
 * for this light, then rescales only the delta THAT CALL just added by the
 * Lommel-Seeliger factor computed from THIS light's own
 * `directLight.direction` and `geometryViewDir`. Every other light's
 * already-accumulated diffuse, and this light's own specular/clearcoat/sheen
 * contributions (`RE_Direct_Physical` also writes those), pass through
 * unscaled — exactly the same fields the old post-sum multiply left
 * untouched.
 *
 * This replaces an earlier version of this patch that multiplied the
 * POST-SUM `reflectedLight.directDiffuse` once, using geometry derived from
 * an assumed single sun at the world origin (`viewMatrix[3].xyz`). That form
 * was correct only because today's scene has exactly one direct light; a
 * second direct light (planetshine, tracked as Onda 2 work) would have been
 * scaled by geometry belonging to a DIFFERENT light, amplifying it by up to
 * ~13.3x near its own terminator. The per-light wrapper has no such
 * coupling: each light supplies its own incidence direction via
 * `directLight.direction`, which three.js already computes correctly for
 * both point and directional lights (`getPointLightInfo` /
 * `getDirectionalLightInfo` in `lights_pars_begin.glsl.js`) — no
 * sun-at-origin assumption survives, so moving the Sun (or adding a second
 * light) can no longer silently break the photometry.
 *
 * **Single-light identity.** With today's one `pointLight` at the world
 * origin (`SceneLighting.tsx`), `directLight.direction` is exactly
 * `normalize(pointLight.position - geometryPosition)` in view space, which
 * is the same vector the old code derived from `viewMatrix[3].xyz -
 * geometryPosition` (the view-space position of the world origin is, by
 * definition, the translation column of the view matrix). `directDiffuse`
 * starts at `vec3(0)` before the scene's only light call, so
 * `delta == reflectedLight.directDiffuse` there and the wrapper's
 * `before + delta * factor` reduces to exactly the old `sum *= factor`.
 * Output is bit-for-bit identical for the single-light case — see
 * `regolithPhotometry.test.ts` for the pinned shape and `e2e/boot.spec.ts`'s
 * pixel baseline for the runtime check.
 *
 * **The 4/3 is derived, not tuned — and Atlas', not published.** Three's
 * `directDiffuse` delta already carries the μ₀ factor for this light, so
 * converting Lambert to Lommel-Seeliger means multiplying that delta by
 * C / (μ₀ + μ). C is fixed by demanding the change be flux-neutral, so it
 * redistributes brightness across the disc without touching the body's
 * total apparent output:
 *
 *   - At zero phase (viewing along the light direction) μ = μ₀ everywhere on
 *     the visible disc, so the LS product collapses to the constant C/2 —
 *     that is precisely the flat full-Moon disc.
 *   - The projected-area-weighted mean of Lambert's μ₀ over a hemisphere at
 *     zero phase is 2/3 (∫μ₀ dA_proj / ∫dA_proj with dA_proj = μ dA).
 *   - Flux neutrality is therefore C/2 = 2/3, i.e. **C = 4/3**.
 *
 * So 4/3 is an Atlas normalisation choice, not a coefficient from any paper.
 * Only the brightness *distribution* changes; the disc-integrated brightness
 * at full phase is unchanged, which is why this patch does not disturb the
 * exposure floor W3 has just settled.
 *
 * **Independent check** (standing law 3): `regolithPhotometry.test.ts` does not
 * read 4/3 from this file to verify it. It integrates both radiance profiles
 * over the visible disc by quadrature and *solves* for the ratio, then asserts
 * the GLSL literal matches what the integral produced. A value tuned by eye
 * fails it.
 *
 * **Selection criterion: no optically significant atmosphere.** The law
 * describes light returning from bare grains. Earth, Venus, Mars, Titan and
 * the four giants keep Lambert — their discs are scattering media, not
 * regolith, and Earth's branch in `usePlanetMaterials` is byte-unchanged by
 * this wave. Selection is opt-in per record via `airlessRegolith`, so a body
 * only gets the law once someone has confirmed it has no atmosphere to
 * speak of.
 *
 * **Zero new uniforms.** `directLight.direction` is a value three.js already
 * computes per light from scene state (light position/direction transformed
 * to view space) — no CPU-supplied vector is needed, and unlike the previous
 * form there is no assumption baked in about where any light sits.
 *
 * **Known limitation, recorded rather than skipped.** Bodies with a `model`
 * field — haumea, vesta, pallas, hygiea — render through `PlanetModel.tsx`,
 * which builds its own materials with no `onBeforeCompile` and never calls
 * `usePlanetMaterials`. All four are airless rock or ice and therefore meet
 * this file's own selection criterion while being structurally unable to
 * receive the patch. They do take `metalness` as a prop, so W3's part-A
 * exposure change does reach them; this shader patch does not. The asymmetry
 * is real and is not papered over.
 */

/**
 * Replaces `#include <lights_physical_pars_fragment>`; emits the include
 * (which defines `RE_Direct_Physical` and the `RE_Direct` macro), then
 * redefines `RE_Direct` to a wrapper that corrects each light's own direct
 * diffuse lobe immediately after that light's call, rather than correcting
 * the sum after every light has been processed.
 *
 * Indirect (ambient / env) diffuse is deliberately left Lambert: it carries no
 * single incidence direction, so μ₀ is undefined for it.
 */
export const REGOLITH_PHOTOMETRY_LIGHTS_PATCH = /* glsl */ `
#include <lights_physical_pars_fragment>

// Lommel-Seeliger single-scattering diffuse for airless regolith, applied
// per RE_Direct call so each light's diffuse contribution is corrected by
// its OWN incidence geometry — bounded to <= 4/3 by construction no matter
// how many direct lights end up calling RE_Direct.
void RE_Direct_Regolith( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

  vec3 lsDiffuseBefore = reflectedLight.directDiffuse;

  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

  // The call above just added this light's Lambert-mu0 delta to
  // directDiffuse. Converting that delta to mu0 / (mu0 + mu) is dividing it
  // by (mu0 + mu) and re-applying the flux-preserving 4/3 derived in this
  // file's header. Only the delta THIS call added is touched — any diffuse
  // already accumulated from an earlier light, and this call's own
  // directSpecular / clearcoat / sheen writes, pass through untouched.
  float lsMu0 = saturate( dot( geometryNormal, directLight.direction ) );
  float lsMu = saturate( dot( geometryNormal, geometryViewDir ) );
  vec3 lsDiffuseDelta = reflectedLight.directDiffuse - lsDiffuseBefore;
  reflectedLight.directDiffuse = lsDiffuseBefore + lsDiffuseDelta * ( 1.3333333 / max( lsMu0 + lsMu, 1e-4 ) );

}
#undef RE_Direct
#define RE_Direct RE_Direct_Regolith
`;
