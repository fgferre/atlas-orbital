import * as THREE from "three";
import type { AtmosphereScatteringConfig } from "../../../lib/astrophysics";
import {
  ATMSCATTERING_FRAG_GLSL,
  ATMSCATTERING_VERT_GLSL,
} from "./atmscatteringSnippet";

// Gaia class-level atmosphere defaults, mirrored from
// `/tmp/gaiasky/core/src/gaiasky/scene/record/AtmosphereComponent.java`.
// Used whenever a body's `AtmosphereScatteringConfig` leaves an
// optional field unset. Cited line numbers are source-of-truth for
// future audits.
// Exported (added T5.1 2026-04-23) so the per-frame dynamic-uniform
// lib can reuse the same defaults without duplicating the L27-risky
// constants.
export const GAIA_DEFAULT_E_SUN = 10.0; // AtmosphereComponent.java:55
export const GAIA_DEFAULT_MIE_ASYMMETRY_G = 0.76; // AtmosphereComponent.java:112
export const GAIA_DEFAULT_SAMPLE_COUNT = 23; // AtmosphereComponent.java:56
export const GAIA_DEFAULT_SCALE_DEPTH = 0.25; // AtmosphereComponent.java:120
export const GAIA_DEFAULT_OUTER_RADIUS_RATIO = 1.025; // AtmosphereComponent.java:118
export const GAIA_DEFAULT_ALPHA = 1.0; // AtmosphereComponent.java:130
const FOUR_PI = 4.0 * Math.PI;

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

// Build the atmosphere `ShaderMaterial.uniforms` bundle from a body's
// `AtmosphereScatteringConfig`. Per-frame fields (`v3CameraPos`,
// `v3LightPos`, `v3PlanetPos`, `fCameraHeight`) carry INITIAL placeholder
// values — the caller MUST overwrite them every frame in `useFrame` using
// the inverse model-matrix pattern. See `Planet.tsx` atmosphere block and
// the file header above for why static defaults are non-shippable.
//
// Optional `config` fields fall through to Gaia's class-level defaults
// from `AtmosphereComponent.java` (constants at top of this file). All
// derived values (`fKr4PI`, `fKmESun`, etc.) are recomputed here from
// the primitive fields in the config — matches Gaia's
// `setUpAtmosphericScatteringMaterial()` at
// `AtmosphereComponent.java:107-159`.
//
// Required config trio: `kRayleigh`, `kMie`, `wavelengthsUm`. See
// `AtmosphereScatteringConfig` JSDoc for why these have no Gaia-source
// default.
export const buildAtmosphereUniforms = (config: AtmosphereScatteringConfig) => {
  const eSun = config.eSun ?? GAIA_DEFAULT_E_SUN;
  const mieAsymmetryG = config.mieAsymmetryG ?? GAIA_DEFAULT_MIE_ASYMMETRY_G;
  const sampleCount = config.sampleCount ?? GAIA_DEFAULT_SAMPLE_COUNT;
  const scaleDepth = config.scaleDepth ?? GAIA_DEFAULT_SCALE_DEPTH;
  const outerRadiusRatio =
    config.outerRadiusRatio ?? GAIA_DEFAULT_OUTER_RADIUS_RATIO;
  const alpha = config.alpha ?? GAIA_DEFAULT_ALPHA;

  // Derived scalars, mirroring Gaia `AtmosphereComponent.java:109-122`.
  const fKr4PI = config.kRayleigh * FOUR_PI;
  const fKm4PI = config.kMie * FOUR_PI;
  const fKrESun = config.kRayleigh * eSun;
  const fKmESun = config.kMie * eSun;
  const fInnerRadius = 1.0; // Planet surface in atlas unit-sphere model-space.
  const fOuterRadius = outerRadiusRatio;
  const fScale = 1.0 / (fOuterRadius - fInnerRadius);
  const fScaleOverScaleDepth = fScale / scaleDepth;

  // InvWavelength: 1/λ⁴ per channel (Gaia `AtmosphereComponent.java:126-128`).
  const [wr, wg, wb] = config.wavelengthsUm;
  const invR = 1.0 / Math.pow(wr, 4);
  const invG = 1.0 / Math.pow(wg, 4);
  const invB = 1.0 / Math.pow(wb, 4);

  return {
    // Per-frame dynamic state (overwritten each frame by Planet.tsx):
    v3PlanetPos: { value: new THREE.Vector3(0, 0, 0) },
    v3CameraPos: { value: new THREE.Vector3(0, 0, 2) },
    v3LightPos: { value: new THREE.Vector3(1, 0, 0) },
    fCameraHeight: { value: 2.0 },

    // Static scattering coefficients, derived from the config:
    v3InvWavelength: { value: new THREE.Vector3(invR, invG, invB) },
    fOuterRadius: { value: fOuterRadius },
    fInnerRadius: { value: fInnerRadius },
    fKrESun: { value: fKrESun },
    fKmESun: { value: fKmESun },
    fKr4PI: { value: fKr4PI },
    fKm4PI: { value: fKm4PI },
    fScale: { value: fScale },
    fScaleDepth: { value: scaleDepth },
    fScaleOverScaleDepth: { value: fScaleOverScaleDepth },
    fAlpha: { value: alpha },
    fG: { value: mieAsymmetryG },
    nSamples: { value: sampleCount },
  };
};
