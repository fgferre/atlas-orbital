// Port of Gaia Sky's atmospheric-scattering include files,
// commit 450c344ca (2026-04-22 clone at `/tmp/gaiasky/`).
// 1:1 apart from a single deliberate correctness divergence — see
// "Known divergences from Gaia" below.
//
// Source files:
//   - `/tmp/gaiasky/assets/shader/lib/atmscattering.frag.glsl` (223 LOC)
//   - `/tmp/gaiasky/assets/shader/lib/atmscattering.vert.glsl` (18 LOC)
//
// These exports are BUILDING BLOCKS for θ.5b (atlas `atmosphereShader.ts`
// rewrite). Nothing imports them yet — θ.5a only lands the snippet + TS
// math mirrors. This file is deliberately consumer-less until θ.5b wires
// the main atmosphere shader.
//
// Contract with the consumer shader (mirroring Gaia's `atm.fragment.glsl`
// at `/tmp/gaiasky/assets/shader/atm.fragment.glsl:20-23`):
//   - Caller must `#include <luma.glsl>` (or inline the `luma()` function)
//     BEFORE pasting `ATMSCATTERING_FRAG_GLSL` — the sky integrator uses
//     `luma(...)` at Gaia line 212 for alpha-compositing.
//   - Caller must `#define` one of `atmosphereGround` or
//     `atmosphericScattering` to select which integrator compiles in.
//     Both defined is legal (Gaia's ground shader path).
//   - Caller supplies all `uniform` declarations from Gaia lines 7-25 via
//     the material's uniform map. Names are kept verbatim from Gaia
//     (`fKr4PI`, `v3InvWavelength`, etc.) so the 1:1 diff remains
//     mechanical; the atlas-side wrapper in θ.5b is responsible for
//     translating to atlas conventions.
//
// Known divergences from Gaia (documented per lesson L22 DIFF GATE):
//   - **Atlas correctness divergence, one character** (W3 / F-05, 2026-07-26):
//     the sky integrator's alpha term reads `luma(tonedAtmosphere.rgb)` where
//     Gaia writes `luma(tonedAtmosphere.rbg)`. The swizzle pays Rec.709's
//     green weight (0.7152) to the blue channel and blue's weight (0.0722) to
//     green, so for the blue-dominant colour a Rayleigh atmosphere actually
//     produces, the luminance driving `tonedAtmosphere.a` runs ~59% high —
//     the limb renders opaque where it should fade out, and a faint limb that
//     should be invisible draws. This is **not** an upstream sync and is not
//     waiting on one: AGENTS.md's constitution makes Gaia an optional
//     technical reference, not a merge gate, so a defect that survives in the
//     reference is still a defect here. Every other constant and expression
//     in this file remains byte-identical, which is why the divergence is
//     recorded as one line rather than a fork.
//   - **Formatting**: Whitespace and line breaks preserved exactly.
//   - **No `#ifndef GLSL_LIB_ATMSCAT` header guard** here because the
//     template literal is concatenated, not `#include`d — duplicate-
//     definition protection becomes the caller's job (use each snippet
//     string exactly once per shader program).
//
// Intentionally NOT extracted to TypeScript helpers (they live only as
// GLSL inside the snippet, not in `atmosphereMath.ts`):
//   - `computeAtmosphericScatteringGround(v_position)` — ground integrator,
//     Gaia lines 65-125. Vec3 loop; runtime is the shader, no TS mirror.
//   - `computeAtmosphericScattering(v_position)` — sky integrator,
//     Gaia lines 136-216. Same reason.
// The SMALL scalar helpers (`rayleighPhase`, `miePhase`, `scale`,
// `getNearIntersection`, `getFarIntersection`) ARE mirrored in
// `atmosphereMath.ts` with pinned test values — that is the unit-test
// surface for this port.

export const ATMSCATTERING_VERT_GLSL = `
#if defined(atmosphereGround) || defined(atmosphericScattering)
// OUTPUTS
out vec3 v_position;

void prepareAtmosphericScattering() {
    v_position = a_position;
}

#else
void prepareAtmosphericScattering() {}
#endif // atmosphereGround || atmosphericScattering
`;

export const ATMSCATTERING_FRAG_GLSL = `
#if defined(atmosphereGround) || defined(atmosphericScattering)
#define exposureGround 0.5
#define exposureSky 0.25
uniform vec3 v3PlanetPos; /* The position of the planet */
uniform vec3 v3CameraPos; /* The camera's current position*/
uniform vec3 v3LightPos; /* The direction vector to the light source*/
uniform vec3 v3InvWavelength; /* 1 / pow(wavelength, 4) for the red, green, and blue channels*/

uniform float fCameraHeight;
uniform float fOuterRadius; /* The outer (atmosphere) radius*/
uniform float fInnerRadius; /* The inner (planetary) radius*/
uniform float fKrESun; /* Kr * ESun*/
uniform float fKmESun; /* Km * ESun*/
uniform float fKr4PI; /* Kr * 4 * PI*/
uniform float fKm4PI; /* Km * 4 * PI*/
uniform float fScale; /* 1 / (fOuterRadius - fInnerRadius)*/
uniform float fScaleDepth; /* The scale depth (i.e. the altitude at which the atmosphere's average density is found)*/
uniform float fScaleOverScaleDepth; /* fScale / fScaleDepth*/
uniform float fAlpha; /* Atmosphere effect opacity */
uniform float fG; /* Mie asymmetry factor */

uniform int nSamples;

// INPUTS
float rayleighPhase(float fCos2) {
    // Calculate the angle between view direction and light direction
    // This gives us the phase function for reddening at sunset
    // Rayleigh phase function: 3/16π * (1 + cos²θ)
    return 0.75 + 0.75 * fCos2;
}

float miePhase(float fCos, float fCos2) {
    // Mie phase function (Henyey-Greenstein)
    float g2 = fG * fG;
    return 1.5 * ((1.0 - g2) / (2.0 + g2)) * (1.0 + fCos2) / pow (1.0 + g2 - 2.0 * fG * fCos, 1.5);
}
float scale(float fCos) {
    float x = 1.0 - fCos;
    return fScaleDepth * exp (-0.00287 + x * (0.459 + x * (3.83 + x * (-6.80 + x * 5.25))));
}
// Returns the far intersection point of a line and a sphere
float getNearIntersection(vec3 pos, vec3 ray, float distance2, float radius2) {
    float B = 2.0 * dot (pos, ray);
    float C = distance2 - radius2;
    float fDet = max (0.0, B * B - 4.0 * C);
    return 0.5 * (-B - sqrt(fDet));
}
// Returns the far intersection point of a line and a sphere
float getFarIntersection(vec3 pos, vec3 ray, float distance2, float radius2) {
    float B = 2.0 * dot(pos, ray);
    float C = distance2 - radius2;
    float fDet = max(0.0, B*B - 4.0 * C);
    return 0.5 * (-B + sqrt(fDet));
}

#endif// atmosphereGround || atmosphericScattering

//
// GROUND SHADER
//
#ifdef atmosphereGround
vec3 computeAtmosphericScatteringGround(vec3 v_position) {
    float fCameraHeight2 = fCameraHeight * fCameraHeight;
    float fOuterRadius2 = fOuterRadius * fOuterRadius;

    vec3 v3Pos = v_position * fInnerRadius;
    vec3 v3Ray = v3Pos - v3CameraPos;
    float fFar = length(v3Ray);
    v3Ray /= fFar;

    // Calculate starting position
    float fNear = getNearIntersection(v3CameraPos, v3Ray, fCameraHeight2, fOuterRadius2);
    vec3 v3Start = v3CameraPos + v3Ray * fNear;
    fFar -= fNear;
    float fStartDepth = exp((fInnerRadius - fOuterRadius) / fScaleDepth);
    float fCameraAngle = dot(-v3Ray, v_position) / length(v_position);
    float fLightAngle = dot(v3LightPos, v_position) / length(v_position);
    float fCameraScale = scale(fCameraAngle);
    float fLightScale = scale(fLightAngle);
    float fCameraOffset = fStartDepth * fCameraScale;
    float fTemp = (fLightScale + fCameraScale);

    // Initialize scattering loop vairables
    float fSampleLength = fFar / float(nSamples);
    float fScaledLength = fSampleLength * fScale;
    vec3 v3SampleRay = v3Ray * fSampleLength;
    vec3 v3SamplePoint = v3Start + v3SampleRay * 0.5;

    // Loop through the rays
    vec3 v3FrontColor = vec3(0.0);
    vec3 v3Attenuate;
    for (int i = 0; i < nSamples; i++) {
        float fHeight = length(v3SamplePoint);
        float fDepth = exp(fScaleOverScaleDepth * (fInnerRadius - fHeight));
        float fScatter = fDepth * fTemp - fCameraOffset;

        v3Attenuate = exp(-fScatter * (v3InvWavelength * fKr4PI + fKm4PI));
        v3FrontColor += v3Attenuate * (fDepth * fScaledLength);
        v3SamplePoint += v3SampleRay;
    }

    float inner = fInnerRadius + (fOuterRadius - fInnerRadius) * 0.5;
    float heightNormalized = clamp(((fCameraHeight - inner) / (fOuterRadius - inner)), 0.0, 1.0);
    float fadeFactor = smoothstep(0.5, 1.0, heightNormalized);

    vec3 direction = v3CameraPos - v3Pos;
    float fCos = dot(-v3LightPos, normalize(direction));
    float fCos2 = fCos * fCos;

    // Rayleigh phase
    float fRayleighPhase = rayleighPhase(fCos2);
    vec3 rayleighColor = fRayleighPhase * v3FrontColor * (v3InvWavelength * fKrESun);

    // Mie phase
    float fMiePhase = miePhase(fCos, fCos2);
    vec3 mieColor = fMiePhase * v3FrontColor * fKmESun;

    // Tone mapping
    vec3 tonedAtmosphere = vec3(1.0) - exp((rayleighColor + mieColor) * -exposureGround);

    return tonedAtmosphere * fAlpha * fadeFactor;
}
#else
vec3 computeAtmosphericScatteringGround(vec3 v_position){
    return vec3(0.0);
}
#endif// atmosphereGround

//
// SKY SHADER
//
#ifdef atmosphericScattering
vec4 computeAtmosphericScattering(vec3 v_position) {
    float fCameraHeight2 = fCameraHeight * fCameraHeight;
    float fOuterRadius2 = fOuterRadius * fOuterRadius;
    /* Get the ray from the camera to the vertex, and its length (which is the far point of the ray passing through the atmosphere)*/
    vec3 v3Pos = v_position * fOuterRadius;
    vec3 v3Ray = v3Pos - v3CameraPos;
    float fFar = length (v3Ray);
    v3Ray /= fFar;

    // Calculate the closest intersection of the ray with the outer atmosphere (which is the near point of the ray passing through the atmosphere)
    float fNear = getNearIntersection (v3CameraPos, v3Ray, fCameraHeight2, fOuterRadius2);

    // Calculate the ray's starting position, then calculate its scattering offset
    vec3 v3Start;
    float fStartAngle;
    float fStartDepth;

    if (fCameraHeight < fOuterRadius) {
        // Inside atmosphere
        v3Start = v3CameraPos;
        float fHeight = length (v3Start);
        fStartAngle = dot (v3Ray, v3Start) / fHeight;
        fStartDepth = exp(fScaleOverScaleDepth * (fInnerRadius - fCameraHeight));
    } else {
        // Outside atmosphere
        v3Start = v3CameraPos + v3Ray * fNear;
        fFar -= fNear;
        fStartAngle = dot (v3Ray, v3Start) / fOuterRadius;
        fStartDepth = exp(-1.0 / fScaleDepth);
    }

    float fStartOffset = fStartDepth * scale(fStartAngle);

    /* Initialize the scattering loop variables*/
    float fSampleLength = fFar / float(nSamples);
    float fScaledLength = fSampleLength * fScale;
    vec3 v3SampleRay = v3Ray * fSampleLength;
    vec3 v3SamplePoint = v3Start + v3SampleRay * 0.5;

    // Now loop through the sample rays
    vec3 v3FrontColor = vec3 (0.0);
    for (int i = 0; i < nSamples; i++) {
        float fHeight = length(v3SamplePoint);
        float fDepth = exp(fScaleOverScaleDepth * (fInnerRadius - fHeight));
        float fLightAngle = dot(v3LightPos, v3SamplePoint) / fHeight;
        float fCameraAngle = dot(v3Ray, v3SamplePoint) / fHeight;
        float fScatter = (fStartOffset + fDepth * (scale(fLightAngle) - scale(fCameraAngle)));
        vec3 v3Attenuate = exp(-fScatter * (v3InvWavelength * fKr4PI + fKm4PI));

        v3FrontColor += v3Attenuate * (fDepth * fScaledLength);
        v3SamplePoint += v3SampleRay;
    }
    // Height normalized to control the opacity
    // Normalized in [1,0], for [ground,space]
    float inner = fInnerRadius + (fOuterRadius - fInnerRadius) * 0.5;
    float heightNormalized = 1.0 - clamp(((fCameraHeight - inner) / (fOuterRadius - inner)), 0.0, 1.0);
    float fadeFactor = smoothstep(0.5, 1.0, 1.0 - heightNormalized);

    // Rayleigh and Mie phases
    // Direction from the vertex to the camera
    vec3 direction = v3CameraPos - v3Pos;
    float fCos = dot(-v3LightPos, normalize(direction));
    float fCos2 = fCos * fCos;

    // Rayleigh phase
    float fRayleighPhase = rayleighPhase(fCos2);
    vec3 rayleighColor = fRayleighPhase * v3FrontColor * (v3InvWavelength * fKrESun);

    // Mie phase
    float fMiePhase = miePhase(fCos, fCos2);
    vec3 mieColor = fMiePhase * v3FrontColor * fKmESun;

    // Tone mapping
    vec4 tonedAtmosphere;
    tonedAtmosphere.rgb = vec3(1.0) - exp((rayleighColor + mieColor) * -exposureSky);

    float lma = luma(tonedAtmosphere.rgb);
    float scl = smoothstep(0.05, 0.2, lma);
    tonedAtmosphere.a = (heightNormalized * (1.0 - fadeFactor) + lma * fadeFactor) * scl * fAlpha;
    return tonedAtmosphere;
}
#else
vec4 computeAtmosphericScattering(vec3 v_position){
    return vec4(0.0);
}
#endif// atmosphericScattering
`;
