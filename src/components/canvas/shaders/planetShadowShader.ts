/**
 * Analytical planet-shadow-on-ring patches.
 *
 * **W5 stage B — the occluder is an ellipsoid, and its polar axis is Z.**
 *
 * `vPos` is the RING geometry's local position. The ring is a `RingGeometry`
 * in its own XY plane, rotated `[-π/2, 0, 0]` by the mesh, so **ring-local +Z
 * maps to the rotation frame's +Y** — the spin axis. `uSunPosition` for this
 * material is built in the same ring-local frame. An implementer who copies the
 * `.y` treatment used elsewhere in this wave warps the shadow along an
 * **in-plane** axis instead of the pole: it compiles, it renders, and it passes
 * every gate with a plausible wrong shadow. That is why the squash below is on
 * `.z` and why this paragraph exists.
 *
 * The planet's equatorial radius is exactly 1.0 in this space, because the group
 * above scales uniformly by the largest semi-axis. Its polar radius is
 * `(1 − f)`: the volume-preserving figure has `Rp/Re = (1 − f)` by construction
 * (see `resolveBodyFigureRatio`). So the occluder is the ellipsoid
 * `x² + y² + (z/k)² = 1` with `k = 1 − f`.
 *
 * **Second trap: the stretched ray direction breaks the quadratic's `a = 1`
 * assumption.** The intersection is solved by scaling space so the ellipsoid
 * becomes a unit sphere, which divides `z` by `k` for BOTH the origin and the
 * direction — and the scaled direction is no longer unit length. The previous
 * sphere-only code assumed `a = 1` because `lightDir` was normalised; the
 * ellipsoid form must carry `a = dot(d', d')` through the discriminant, or the
 * shadow's edge lands in the wrong place by up to the flattening itself.
 *
 * The `b < 0` "toward the planet" test survives: `c > 0` because the ring is
 * outside the planet and `a > 0` always, so the roots share a sign and their
 * sum `-b/a` is positive exactly when `b < 0`.
 *
 * **One builder, one call site.** The solve used to be duplicated verbatim in
 * a map_fragment patch AND an emissivemap_fragment patch (the latter darkened
 * the ring's then-constant `emissiveIntensity` when the planet's shadow fell
 * across it). W5-B deleted the ring's constant emissive entirely — rings are
 * now lit through the standard direct-light path (`ringLightingPatch.ts`), so
 * darkening `diffuseColor.rgb` here is the only shadow application the ring
 * needs; the emissive twin would be a no-op against the zero baseline emissive
 * every `MeshStandardMaterial` starts with. Deleted alongside it rather than
 * left as dead code.
 */

/**
 * Ring-local polar squash factor `k = 1 − f`, formatted for GLSL. Interpolated
 * as a literal rather than bound as a uniform: it is a per-body constant known
 * at material-compile time, and `onBeforeCompile` already builds this GLSL per
 * material. Zero new uniforms (standing law 2), same precedent as
 * `CLOUD_SHADOW_LUMA_CUTOFF` in `usePlanetMaterials.ts`.
 */
const polarScaleLiteral = (flattening: number): string => {
  const k = 1 - (Number.isFinite(flattening) ? flattening : 0);
  return (k > 0 ? k : 1).toFixed(6);
};

export const planetShadowVertexPatch = `
  #include <begin_vertex>
  vPos = position;
`;

export const buildPlanetShadowFragmentPatch = (flattening: number): string => {
  const k = polarScaleLiteral(flattening);
  return /* glsl */ `
  #include <map_fragment>
  // Ray from this ring fragment toward the Sun, in ring-local space.
  vec3 diffS = uSunPosition - vPos;
  float distSqS = dot(diffS, diffS);
  vec3 dirS = distSqS > 0.000001
    ? diffS * inversesqrt(distSqS)
    : vec3(0.0, 1.0, 0.0);

  // Scale space so the oblate planet becomes a unit sphere. Ring-local Z is
  // the POLE (the mesh rotates this plane by -PI/2 about X), so the squash is
  // on .z — not .y.
  vec3 oS = vec3(vPos.x, vPos.y, vPos.z / ${k});
  vec3 dS = vec3(dirS.x, dirS.y, dirS.z / ${k});

  // d is NOT unit length after the scale, so 'a' must be carried.
  float aS = dot(dS, dS);
  float bS = 2.0 * dot(oS, dS);
  float cS = dot(oS, oS) - 1.0;
  float deltaS = bS * bS - 4.0 * aS * cS;

  // c > 0 (ring is outside the planet) and a > 0, so the roots share a sign;
  // their sum -b/a is positive exactly when b < 0, i.e. pointing at the planet.
  bool hitS = deltaS >= 0.0 && bS < 0.0;

  if (hitS) {
    // 1.0 = full shadow (black), 0.0 = no shadow.
    diffuseColor.rgb *= (1.0 - uShadowIntensity);
  }
`;
};
