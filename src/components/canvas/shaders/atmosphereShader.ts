import * as THREE from "three";
import {
  ATMSCATTERING_FRAG_GLSL,
  ATMSCATTERING_VERT_GLSL,
} from "./atmscatteringSnippet";

// θ.5b+c — Rayleigh + Mie atmospheric scattering port + per-frame wiring,
// combined ship of T3.1.
//
// 1:1 port of Gaia Sky's atmosphere shaders (commit 450c344ca):
//   - `/tmp/gaiasky/assets/shader/atm.vertex.glsl` (70 LOC)
//   - `/tmp/gaiasky/assets/shader/atm.fragment.glsl` (40 LOC)
// Consumes the θ.5a snippet (`atmscatteringSnippet.ts`, landed in
// `c2f05a6`) which mirrors `lib/atmscattering.{frag,vert}.glsl`.
//
// Replaces the pre-θ rim-glow Fresnel
// `pow(max(0.0, 0.6 - dot(normal, viewDir)), 4.0)` with a never-written
// `viewVector` uniform. The sky integrator (Nishita 1993) multi-samples
// along the view ray with Rayleigh + Mie phase functions.
//
// IMPORTANT: Per-frame uniform writes (`v3CameraPos`, `v3LightPos`,
// `fCameraHeight`) are NOT optional — they MUST be driven by the caller
// every frame for Earth's actual camera/sun state in planet-local space.
// The first θ.5b ship (`56d0e38`, reverted `422d794`) tried static
// defaults and produced saturated output that flickered against the
// cloud layer via transparent-sort flips — see lesson L26. This export
// therefore provides `buildEarthAtmosphereUniforms()` as a factory for
// the INITIAL state only; `Planet.tsx`'s useFrame is responsible for
// rewriting the dynamic fields each frame. The ring-shadow block at
// `Planet.tsx` (search for `// Update Planet Material (Ring Shadow on Planet)`)
// mirrors the same inverse-matrixWorld pattern used here for the
// atmosphere block (search for `// Update Atmosphere Shader uniforms`).
//
// =============================================================================
// Documented divergences from Gaia source (DIFF GATE per lesson L22)
// =============================================================================
//
// A) GLSL1 + `#define out varying` shim (NOT GLSL3):
//    Gaia ships `#version 330 core`. Atlas stays on Three.js's default
//    GLSL1 dialect (every other atlas shader uses it) and preprocessor-
//    shims the snippet's only `in`/`out` usage: `#define out varying`
//    before pasting `ATMSCATTERING_VERT_GLSL` (which contains
//    `out vec3 v_position;`) and a manual `varying vec3 v_position;`
//    declaration in the frag wrapper (since the frag snippet uses
//    `v_position` only as a function param). The snippet itself stays
//    BYTE-IDENTICAL with θ.5a — shim lives outside the imported constant.
//    Rationale: `ShaderMaterial` with `glslVersion: GLSL3` tangles with
//    Three's implicit fragment-output injection (caught and reverted in
//    the first θ.5b attempt). GLSL1 has no such ambiguity.
//
// B) Attribute / built-in-matrix names:
//    Gaia uses `a_position`, `u_worldTrans`, `u_projViewTrans`.
//    Three.js auto-provides `attribute vec3 position;` + `modelMatrix`,
//    `viewMatrix`, `projectionMatrix`, `modelViewMatrix`.
//    `#define a_position position` aliases Gaia's attribute name so the
//    θ.5a snippet stays byte-identical.
//    Matrix product `projectionMatrix * modelViewMatrix * vec4(position, 1.0)`
//    in atlas equals `u_projViewTrans * u_worldTrans * vec4(a_position, 1.0)`
//    in Gaia — same chain of transforms, different names.
//
// C) Skipped Gaia branches (out of θ.5b+c scope):
//    - `relativisticEffects` / `gravitationalWaves` (atlas has no such
//      pipelines).
//    - `eclipsingBodyFlag` (T3.3 scope, not T3.1).
//    - `ssrFlag` / `layerBuffer` MRT (atlas has no SSR).
//    - Manual `gl_FragDepth` write + `logdepthbuff.glsl` include —
//      Three.WebGLRenderer's `logarithmicDepthBuffer` flag at
//      `Scene.tsx:261` handles depth automatically.
//
// D) `luma.glsl` inlined verbatim (no `#include` in WebGL).
//
// E) `#define atmosphericScattering` gate-select at shader head — compiles
//    the sky integrator, leaves `computeAtmosphericScatteringGround` as
//    a no-op stub (atlas plumbs ground-shading through MeshStandardMaterial,
//    not this shader).
//
// F) Fragment output: atlas writes to GLSL1's built-in `gl_FragColor`
//    instead of Gaia's `layout (location = 0) out vec4 fragColor;`. Same
//    RGBA slot-0 write.
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

// Earth-default uniform bundle. Per-frame fields (`v3CameraPos`,
// `v3LightPos`, `v3PlanetPos`, `fCameraHeight`) carry INITIAL placeholder
// values — the caller MUST overwrite them every frame in `useFrame` using
// the inverse model-matrix pattern. See `Planet.tsx` atmosphere block and
// the file header above for why static defaults are non-shippable.
//
// Scattering coefficients track Nishita (1993) values used by Gaia's
// Earth preset:
//   - `v3InvWavelength`: 1/λ⁴ at λ=(650, 570, 475) nm → (5.602, 9.473, 19.644)
//   - `fKr = 0.0025`, `fKm = 0.0015`, `fESun = 20.0`
//     → `fKrESun = 0.05`, `fKmESun = 0.03`, `fKr4PI ≈ 0.0314`, `fKm4PI ≈ 0.0188`
//   - `fScaleDepth = 0.25` (scale-height / atmosphere-height ratio)
//   - `fG = -0.85` (Mie asymmetry, backward-scattering Earth haze)
//
// `fOuterRadius = 1.025` matches the atmosphere mesh scale at
// `Planet.tsx:320`. `fInnerRadius = 1.0` = planet surface in atlas
// model-space (unit sphere under the `rotationRef` group). `fScale = 40`
// = `1/(fOuterRadius - fInnerRadius)`, `fScaleOverScaleDepth = 160` =
// `fScale / fScaleDepth`.
//
// `nSamples = 5` is the baseline integrator sample count (Gaia uses 10-64;
// atlas starts at 5 for perf and uplifts in θ.5d if needed).
export const buildEarthAtmosphereUniforms = () => ({
  // Per-frame dynamic state (overwritten each frame by Planet.tsx):
  v3PlanetPos: { value: new THREE.Vector3(0, 0, 0) },
  v3CameraPos: { value: new THREE.Vector3(0, 0, 2) },
  v3LightPos: { value: new THREE.Vector3(1, 0, 0) },
  fCameraHeight: { value: 2.0 },

  // Static Earth scattering coefficients (Nishita 1993):
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
