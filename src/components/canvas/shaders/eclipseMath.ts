/**
 * Constant registry for the eclipse shader patch — W7.
 *
 * This file is NOT a mirror of the shader. It held a "pure-TypeScript
 * mirror" of Gaia Sky's `eclipses.glsl` for three waves, during which the
 * GLSL it mirrored never ran once: all three injection sites replaced
 * `#include <output_fragment>`, a chunk three renamed to `opaque_fragment`
 * in r152, so the patch silently injected nothing (found in W3, fixed in
 * W7, guarded by `shaderNeedles.test.ts`). The mirror functions
 * (`computeEclipseShading`, `eclipseBlend`, `distSegmentPoint`,
 * `getDiffractionSpectrum`) died with the W7 rewrite — the physics they
 * mirrored (a fixed-ratio cone tuned to the eclipsing body's radius) was
 * replaced by the real umbra/penumbra geometry in
 * `src/lib/eclipseGeometry.ts`, which carries its own tests.
 *
 * What remains is the set of literals `eclipseShaderPatch.ts` interpolates
 * into GLSL. Keeping them here as named exports keeps math-JS ↔ GLSL parity
 * a compile-time guarantee: removing a still-interpolated constant is a
 * TypeScript error, which is the proof the W7 deletion pass did not strand
 * the shader.
 *
 * Every quantity in this path is in three.js **world units**
 * (1 wu = AU / 1000), not km — the driver's similarity transform hands the
 * shader a configuration already mapped into render space.
 */

/**
 * Terminator fade window: `smoothstep(-0.1, 0.2, dot(N, L))`. Fades the
 * eclipse shadow out across the receiver's own terminator so the shadow
 * edge never cuts a hard line into the night side. Inherited from the
 * Gaia-era patch (`eclipses.glsl:47`); retained because it is a screen-side
 * anti-artefact ramp, not cone physics.
 */
export const ECLIPSE_EDGE_FADE_LO = -0.1;

/** Upper edge of the terminator fade window. See `ECLIPSE_EDGE_FADE_LO`. */
export const ECLIPSE_EDGE_FADE_HI = 0.2;

/**
 * Near-side gate: fragments whose normal faces away from the eclipsing
 * body (`dot(N, toEclipser) <= -0.15`) skip the shadow entirely. Those
 * fragments are on the receiver's far side, which for any real eclipse
 * geometry is also its night side — the gate saves the segment-distance
 * work where the result could not be seen. Inherited from
 * `eclipses.glsl:49`.
 */
export const ECLIPSE_NEAR_SIDE_DOT_THRESHOLD = -0.15;

/**
 * Colour of sunlight refracted through Earth's limb atmosphere into the
 * umbra — the term that makes a total lunar eclipse copper instead of
 * black. Linear RGB, unnormalised; inherits the hot end of the Gaia-era
 * diffraction spectrum (`eclipses.glsl:26`), repurposed here as the one
 * place an orange-red term has measured physics behind it (Rayleigh
 * scattering removes the blue on the double pass through the limb).
 *
 * The tint the old patch applied to SOLAR receivers is deleted, not moved:
 * seen from space, penumbral shading is neutral, and that orange band was
 * an uncited artistic inheritance.
 */
export const ECLIPSE_LUNAR_REFRACTION_COLOR: readonly [number, number, number] =
  [0.88, 0.42, 0.063];

/**
 * Umbral floor intensity relative to direct sunlight, applied with the
 * colour above in the eclipse-only shader branch when the eclipser is
 * Earth. A typical Danjon L2–L3 totality sits near 10⁻³–10⁻⁴ of the
 * uneclipsed disc; this ships the geometric middle.
 *
 * **Honesty note (this is the disclosure, per the catalog's blood-moon
 * comment):** the existence and colour family of the refracted term are
 * measured physics; the brightness on any given night is not predictable —
 * it depends on volcanic aerosol load and limb cloudiness (Danjon L0–L4
 * spans two orders of magnitude). Independent check that does not pass
 * through this constant: Earth's umbra at lunar distance is ~2.6 R_moon
 * (`eclipseGeometry.test.ts`), so without this floor totality renders
 * `shdw = 0` across the whole disc — black — which contradicts every
 * photographed total lunar eclipse.
 */
export const ECLIPSE_LUNAR_REFRACTION_FLOOR = 4e-4;
