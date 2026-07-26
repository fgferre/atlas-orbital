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
 * **The 4/3 is derived, not tuned — and Atlas', not published.** Three's
 * `directDiffuse` already carries the μ₀ factor, so converting Lambert to
 * Lommel-Seeliger means multiplying by C / (μ₀ + μ). C is fixed by demanding
 * the change be flux-neutral, so it redistributes brightness across the disc
 * without touching the body's total apparent output:
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
 * **Zero new uniforms** (standing law 2). The Sun sits at the world origin, so
 * `viewMatrix[3].xyz` *is* the Sun in view space and the incidence direction
 * needs no CPU-supplied vector. The patch anchors after
 * `lights_fragment_begin`, which is the first point at which
 * `geometryPosition`, `geometryNormal` and `geometryViewDir` exist.
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
 * Replaces `#include <lights_fragment_begin>`; emit the include, then correct
 * the direct diffuse lobe that it just accumulated.
 *
 * Indirect (ambient / env) diffuse is deliberately left Lambert: it carries no
 * single incidence direction, so μ₀ is undefined for it.
 */
export const REGOLITH_PHOTOMETRY_LIGHTS_PATCH = /* glsl */ `
#include <lights_fragment_begin>

// Lommel-Seeliger single-scattering diffuse for airless regolith.
// Sun is at the world origin, so its view-space position is the translation
// column of the view matrix — no uniform needed.
{
  vec3 lsSunView = viewMatrix[3].xyz;
  vec3 lsIncident = normalize(lsSunView - geometryPosition);
  float lsMu0 = max(dot(geometryNormal, lsIncident), 0.0);
  float lsMu = max(dot(geometryNormal, geometryViewDir), 0.0);
  // directDiffuse already carries Lambert's mu0, so the conversion to
  // mu0 / (mu0 + mu) is a division by the sum. 4/3 is the flux-preserving
  // normalisation derived in this file's header, not a tuned constant.
  reflectedLight.directDiffuse *= 1.3333333 / max(lsMu0 + lsMu, 1e-4);
}
`;
