import * as THREE from "three";
import {
  ATMSCATTERING_FRAG_GLSL,
  ATMSCATTERING_VERT_GLSL,
} from "./atmscatteringSnippet";

// θ.5b — Rayleigh + Mie atmospheric scattering port, sub-onda of T3.1.
//
// 1:1 port of Gaia Sky's atmosphere shaders:
//   - `/tmp/gaiasky/assets/shader/atm.vertex.glsl` (70 LOC)
//   - `/tmp/gaiasky/assets/shader/atm.fragment.glsl` (40 LOC)
// (commit 450c344ca — snippet landed in θ.5a at `c2f05a6`.)
//
// Replaces the pre-θ.5b rim-glow Fresnel
// (`pow(max(0.0, 0.6 - dot(normal, viewDir)), 4.0)` with a static
// `viewVector` uniform that was never written per frame). The port
// produces a full Nishita-style multi-scatter sky with Rayleigh + Mie
// phase functions evaluated per fragment.
//
// This ship wires the shader with STATIC default uniforms (θ.5c wires
// per-frame camera/light/planet state; θ.5d adds per-body parameter
// config). Expected θ.5b visual: Earth's atmosphere is now Rayleigh-
// scattered with a fixed sun direction, sensible but "frozen" — not
// tracking the real Sun yet.
//
// =============================================================================
// Documented divergences from Gaia source (DIFF GATE per lesson L22)
// =============================================================================
//
// A) GLSL version + `in`/`out` shim:
//    Gaia `atm.fragment.glsl:1` ships `#version 330 core` (desktop GL 3.3)
//    and uses `in`/`out` for stage-to-stage varyings. Atlas stays on
//    Three.js's default GLSL1 dialect (WebGL1/2-compatible, matches the
//    convention of every other atlas shader) and preprocessor-shims the
//    snippet's only `in`/`out` usage: `#define out varying` before pasting
//    `ATMSCATTERING_VERT_GLSL` (which contains `out vec3 v_position;`) and
//    a manual `varying vec3 v_position;` declaration in the frag wrapper
//    (since the frag snippet uses `v_position` only as a function param).
//    The snippet itself stays BYTE-IDENTICAL with θ.5a — shim lives
//    outside the snippet. Empirically required (caught at first runtime
//    smoke): GLSL3 mode in `ShaderMaterial` tangles with Three's implicit
//    fragment output and the `fragColor` → `pc_fragColor` dance produced
//    unavoidable "multiple fragment outputs" errors for this material.
//
// B) Attribute / built-in-matrix names:
//    Gaia uses `a_position`, `u_worldTrans`, `u_projViewTrans`.
//    Three.js auto-provides `attribute vec3 position;` and matrix uniforms
//    `modelMatrix`, `viewMatrix`, `projectionMatrix`, `modelViewMatrix`.
//    `#define a_position position` aliases Gaia's attribute name so the
//    θ.5a snippet stays byte-identical (the snippet references
//    `a_position` inside `prepareAtmosphericScattering`).
//    Matrix product `projectionMatrix * modelViewMatrix * vec4(position, 1.0)`
//    in atlas equals `u_projViewTrans * u_worldTrans * vec4(a_position, 1.0)`
//    in Gaia — same chain of transforms, different names.
//
// C) Skipped Gaia branches (scope — out of θ.5b):
//    - `#ifdef relativisticEffects` (`atm.vertex.glsl:17-19,42-44`): atlas
//      has no relativistic effects pipeline.
//    - `#ifdef gravitationalWaves` (`atm.vertex.glsl:25-27,46-48`): same.
//    - `#ifdef eclipsingBodyFlag` (`atm.vertex.glsl:29-36,50-64` and
//      `atm.fragment.glsl:9-11,28-30`): eclipse geometry is T3.3 scope.
//    - `#ifdef ssrFlag` (`atm.fragment.glsl:16-18,36-38`): atlas has no
//      SSR pipeline.
//    - `layerBuffer` output (`atm.fragment.glsl:14,32`): atlas has no MRT
//      rendering path for atmosphere.
//    - Logarithmic-depth `gl_FragDepth` write (`atm.fragment.glsl:34`):
//      atlas uses Three.WebGLRenderer's built-in `logarithmicDepthBuffer`
//      (Scene.tsx:261), which writes depth automatically — no manual
//      `gl_FragDepth` required.
//
// D) `luma.glsl` inlined:
//    Gaia `atm.fragment.glsl:20` does `#include <shader/lib/luma.glsl>`.
//    WebGL has no `#include`; atlas inlines the 2-line function (`luma()`
//    from `/tmp/gaiasky/assets/shader/lib/luma.glsl` — byte-identical).
//
// E) Snippet define-gate:
//    Gaia's atmosphere shader is compiled in "sky" mode by the outer
//    material system (libgdx's ShaderProgram picks `atmosphericScattering`).
//    Atlas makes this explicit with `#define atmosphericScattering` at
//    the shader head so the snippet's `#ifdef` gates expose the sky
//    integrator (`computeAtmosphericScattering`) and leave the ground
//    integrator as a no-op stub. `atmosphereGround` is not defined —
//    atlas plumbs ground-shading through MeshStandardMaterial, not this
//    shader, so the ground integrator is unused here. Future per-planet
//    ground-lighting integration is out of scope for T3.1.
//
// F) Fragment output:
//    Gaia `atm.fragment.glsl:13` declares
//    `layout (location = 0) out vec4 fragColor;` and writes to it.
//    Atlas uses GLSL1's built-in `gl_FragColor` instead (the GLSL3
//    path tangled with Three's implicit output — see (A)). Identical
//    effect: single RGBA write at fragment slot 0.
//
// All numeric constants, phase functions, and integrator bodies are
// byte-identical to Gaia via the θ.5a `ATMSCATTERING_*_GLSL` imports.

// Inlined from `/tmp/gaiasky/assets/shader/lib/luma.glsl` (5 LOC;
// commit 450c344ca). Gaia's sky integrator uses `luma(vec3)` at
// `atmscattering.frag.glsl:212` for alpha compositing.
const LUMA_GLSL = `
float luma(vec3 color){
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}
`;

export const atmosphereVertexShader = `
#define atmosphericScattering
#define a_position position
#define out varying

${ATMSCATTERING_VERT_GLSL}

void main(void) {
    prepareAtmosphericScattering();
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const atmosphereFragmentShader = `
#define atmosphericScattering

varying vec3 v_position;

${LUMA_GLSL}

${ATMSCATTERING_FRAG_GLSL}

void main(void) {
    vec4 atmosphereColor = computeAtmosphericScattering(v_position);
    gl_FragColor = atmosphereColor;
}
`;

// Earth-default uniform bundle for θ.5b. Caller (`usePlanetMaterials.ts`)
// passes the result into a `THREE.ShaderMaterial`.
//
// Per-frame uniforms (`v3PlanetPos`, `v3CameraPos`, `v3LightPos`,
// `fCameraHeight`) are STATIC in θ.5b — they carry sensible starting
// values so the shader compiles and renders a non-black atmosphere.
// θ.5c wires these to real camera/sun state per-frame; θ.5d loads the
// scattering coefficients per body (currently hard-wired to Earth's).
//
// Scattering defaults track the Nishita (1993) "Display of the Earth
// Taking into Account Atmospheric Scattering" paper values used by
// Gaia Sky's atmosphere preset for Earth:
//   - `v3InvWavelength`: 1/λ⁴ at λ=(650, 570, 475) nm → (5.602, 9.473, 19.644)
//   - `fKr = 0.0025`, `fKm = 0.0015`, `fESun = 20.0`
//     → `fKrESun = 0.05`, `fKmESun = 0.03`, `fKr4PI ≈ 0.0314`, `fKm4PI ≈ 0.0188`
//   - `fScaleDepth = 0.25` (scale-height / atmosphere-height ratio)
//   - `fG = -0.85` (Mie asymmetry, backward-scattering Earth haze)
//
// `fOuterRadius = 1.025` matches the atlas atmosphere mesh scale
// (`Planet.tsx:320` renders the shell at 1.025x). `fInnerRadius = 1.0`
// is the planet surface in atlas model-space. `fScale = 40` =
// `1/(fOuterRadius - fInnerRadius)` and `fScaleOverScaleDepth = 160` =
// `fScale / fScaleDepth`.
//
// `nSamples = 5` is below Gaia's default (~10-64); chosen for atlas
// perf budget. The Nishita integrator converges fast; visual difference
// between 5 and 32 samples is small at Earth's scale-depth. θ.5d will
// tune if needed.
export const buildEarthAtmosphereUniforms = () => ({
  // Per-frame state (static defaults for θ.5b; θ.5c wires real values)
  v3PlanetPos: { value: new THREE.Vector3(0, 0, 0) },
  v3CameraPos: { value: new THREE.Vector3(0, 0, 3) },
  v3LightPos: { value: new THREE.Vector3(1, 0, 0).normalize() },
  fCameraHeight: { value: 3.0 },

  // Scattering coefficients (Earth defaults, Nishita 1993)
  v3InvWavelength: { value: new THREE.Vector3(5.602, 9.473, 19.644) },
  fOuterRadius: { value: 1.025 },
  fInnerRadius: { value: 1.0 },
  fKrESun: { value: 0.05 },
  fKmESun: { value: 0.03 },
  fKr4PI: { value: 0.031415927 },
  fKm4PI: { value: 0.018849556 },
  fScale: { value: 40.0 },
  fScaleDepth: { value: 0.25 },
  fScaleOverScaleDepth: { value: 160.0 },
  fAlpha: { value: 1.0 },
  fG: { value: -0.85 },
  nSamples: { value: 5 },
});
