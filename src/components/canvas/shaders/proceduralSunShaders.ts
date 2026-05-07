export const proceduralSunPerlinVertexShader = `
  varying vec3 vWorld;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const proceduralSunPerlinFragmentShader = `
  precision highp float;

  varying vec3 vWorld;
  uniform float uTime;
  uniform float uSpatialFrequency;
  uniform float uTemporalFrequency;
  uniform float uH;
  uniform float uContrast;
  uniform float uFlatten;

  #ifndef OCTAVES
  #define OCTAVES 5
  #endif

  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  float mod289(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }

  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  float permute(float x) { return mod289(((x * 34.0) + 1.0) * x); }

  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float taylorInvSqrt(float r) { return 1.79284291400159 - 0.85373472095314 * r; }

  vec4 grad4(float j, vec4 ip) {
    const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
    vec4 p;
    vec4 s;

    p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
    p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
    s = vec4(lessThan(p, vec4(0.0)));
    p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;

    return p;
  }

  #define F4 0.309016994374947451

  float snoise(vec4 v) {
    const vec4 C = vec4(
      0.138196601125011,
      0.276393202250021,
      0.414589803375032,
      -0.447213595499958
    );

    vec4 i = floor(v + dot(v, vec4(F4)));
    vec4 x0 = v - i + dot(i, C.xxxx);

    vec4 i0;
    vec3 isX = step(x0.yzw, x0.xxx);
    vec3 isYZ = step(x0.zww, x0.yyz);

    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;

    vec4 i3 = clamp(i0, 0.0, 1.0);
    vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
    vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);

    vec4 x1 = x0 - i1 + C.xxxx;
    vec4 x2 = x0 - i2 + C.yyyy;
    vec4 x3 = x0 - i3 + C.zzzz;
    vec4 x4 = x0 + C.wwww;

    i = mod289(i);
    float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
    vec4 j1 = permute(
      permute(
        permute(
          permute(i.w + vec4(i1.w, i2.w, i3.w, 1.0)) +
            i.z +
            vec4(i1.z, i2.z, i3.z, 1.0)
        ) +
          i.y +
          vec4(i1.y, i2.y, i3.y, 1.0)
      ) +
        i.x +
        vec4(i1.x, i2.x, i3.x, 1.0)
    );

    vec4 ip = vec4(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);

    vec4 p0 = grad4(j0, ip);
    vec4 p1 = grad4(j1.x, ip);
    vec4 p2 = grad4(j1.y, ip);
    vec4 p3 = grad4(j1.z, ip);
    vec4 p4 = grad4(j1.w, ip);

    vec4 norm = taylorInvSqrt(
      vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3))
    );
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    p4 *= taylorInvSqrt(dot(p4, p4));

    vec3 m0 = max(0.6 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
    vec2 m1 = max(0.6 - vec2(dot(x3, x3), dot(x4, x4)), 0.0);
    m0 = m0 * m0;
    m1 = m1 * m1;

    return 49.0 * (
      dot(m0 * m0, vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2))) +
        dot(m1 * m1, vec2(dot(p3, x3), dot(p4, x4)))
    );
  }

  vec2 fbm(vec4 p) {
    float a = 1.0;
    float f = 1.0;
    vec2 sum = vec2(0.0);

    for (int i = 0; i < OCTAVES; i++) {
      sum.x += snoise(p * f) * a;
      p.w += 100.0;
      sum.y += snoise(p * f) * a;
      a *= uH;
      f *= 2.0;
    }

    return sum;
  }

  void main() {
    vec3 world = normalize(vWorld);
    world += 12.45;

    vec4 p = vec4(world * uSpatialFrequency, uTime * uTemporalFrequency);
    vec2 f = fbm(p) * uContrast + 0.5;

    vec4 p2 = vec4(world * 2.0, uTime * uTemporalFrequency);
    float modulate = max(snoise(p2), 0.0);
    float x = mix(f.x, f.x * modulate, uFlatten);

    gl_FragColor = vec4(x, f.y, f.y, x);
  }
`;

export const proceduralSunSphereVertexShader = `
  bool isPerspectiveMatrix( mat4 m ) { return m[2][3] == -1.0; }
  #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    varying float vFragDepth;
    varying float vIsPerspective;
  #endif
  // T6.4-M1 precision fix: vViewPos is camera-relative (view-space)
  // because modelViewMatrix is built CPU-side as
  // viewMatrix*modelMatrix in float64 (Three.js Matrix4.multiplyMatrices),
  // so the translation column = (modelPos - cameraPos) is computed
  // precisely before float32 GPU upload. Replaces the prior
  // viewMatrix*(modelMatrix*pos) GPU cascade which catastrophically
  // cancelled at parsec-scale HYG positions.
  varying vec3 vViewPos;
  varying vec3 vNormalView;
  varying vec3 vNormalWorld;
  varying vec3 vLayer0;
  varying vec3 vLayer1;
  varying vec3 vLayer2;

  uniform float uTime;

  mat2 rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }

  void setLayers(vec3 p) {
    float t = uTime;
    vec3 p1 = p;
    p1.yz = rot(t) * p1.yz;
    vLayer0 = p1;

    p1 = p;
    p1.zx = rot(t + 2.094) * p1.zx;
    vLayer1 = p1;

    p1 = p;
    p1.xy = rot(t - 4.188) * p1.xy;
    vLayer2 = p1;
  }

  void main() {
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = viewPos.xyz;
    vNormalView = normalize(normalMatrix * normal);
    // vNormalWorld stays world-space; w=0 zeroes the modelMatrix
    // translation column so direction is precision-safe.
    vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    setLayers(normalize(normal));
    gl_Position = projectionMatrix * viewPos;
    #include <logdepthbuf_vertex>
  }
`;

export const proceduralSunSphereFragmentShader = `
  #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    uniform float logDepthBufFC;
    varying float vFragDepth;
    varying float vIsPerspective;
  #endif
  precision highp float;

  uniform float uVisibility;
  uniform float uDirection;
  uniform vec3 uLightView;
  uniform samplerCube uPerlinCube;
  uniform float uFresnelPower;
  uniform float uFresnelInfluence;
  uniform float uBase;
  uniform float uBrightnessOffset;
  uniform float uBrightness;
  // T6.4-M4-fix: per-material tintBase + class-relative bias replace
  // the M4 mix-to-white path. The pre-M4 atlas curve was effectively
  // (b, b² · uTintBase, b⁴ · uTintBase³) — its multi-channel exponent
  // shape is the source of the Sun's signature granulation contrast.
  // uTintBase = 0.2 for sphere (was hardcoded uTint=0.2 pre-M4),
  // 0.4 for glow (was 0.4 pre-M4). Different per material because
  // surface and corona had distinct visual roles.
  uniform float uTintBase;
  // uClassColor carries the linear-RGB blackbody color for this
  // star (CPU-side from blackbodyRgbFromTemperature(tEff)). The
  // shader applies it as a CLASS-RELATIVE BIAS — divide by the
  // solar reference, raise to gamma, clamp — so the Sun (where
  // uClassColor matches the solar reference) renders byte-identical
  // to the pre-M4 baseline by construction. See
  // src/lib/stellarSurfaceTransfer.ts for the math + tests.
  uniform vec3 uClassColor;
  uniform vec3 uSolarClassColor;
  uniform float uClassBiasGamma;
  uniform float uClassBiasFloor;
  uniform float uClassBiasCeiling;
  // T6.4-M5 post-audit (Plan B activated): hot stars (tEff > ~7500 K)
  // can't go blue-white through the legacy × bias path because the
  // b^4 × tintBase^3 damping in blue collapses regardless of bias.
  // uPlanBWeight is the [0..1] blend weight from planBWeight(tEff)
  // (CPU-side, once per focus change). 0 = pure legacy×bias (Sun +
  // cool stars), 1 = pure blackbody-linear (Sirius, Vega, Rigel).
  uniform float uPlanBWeight;

  // T6.4-M1: view-space camera-relative position (see vertex header).
  varying vec3 vViewPos;
  varying vec3 vNormalView;
  varying vec3 vNormalWorld;
  varying vec3 vLayer0;
  varying vec3 vLayer1;
  varying vec3 vLayer2;


  float getAlpha(vec3 n) {
    float nDotL = dot(n, uLightView) * uDirection;
    return smoothstep(1.0, 1.5, nDotL + uVisibility * 2.5);
  }

  vec3 classRelativeBias() {
    // Mirror of classRelativeBias() in stellarSurfaceTransfer.ts.
    // For the Sun, uClassColor == uSolarClassColor → ratio = (1,1,1),
    // bias = (1,1,1), legacy curve renders byte-identical pre-M4.
    vec3 ratio = uClassColor / max(uSolarClassColor, vec3(1e-6));
    vec3 raw = pow(max(ratio, vec3(1e-6)), vec3(uClassBiasGamma));
    return clamp(raw, vec3(uClassBiasFloor), vec3(uClassBiasCeiling));
  }

  vec3 brightnessToColor(float b) {
    // Plan A: pre-M4 atlas legacy curve × class-relative bias.
    //   R = b × uBrightness
    //   G = b² × uTintBase × uBrightness
    //   B = b⁴ × uTintBase³ × uBrightness
    // Multi-channel exponents give the granulation contrast that
    // reads as visible surface detail (b² and b⁴ damping make
    // noise-pattern variance translate into chroma swings, not just
    // luminance). The class-relative bias modulates the curve per
    // spectral class without disturbing the Sun-default.
    float t1 = uTintBase;
    float t3 = t1 * t1 * t1;
    vec3 curve = vec3(b, b * b * t1, b * b * b * b * t3) * uBrightness;
    vec3 planA = curve * classRelativeBias();

    // Plan B: blackbody-linear curve (no per-channel exponent),
    // blended in for hot stars where the legacy b⁴ damping
    // structurally prevents blue dominance. uPlanBWeight = 0 for
    // Sun + cool stars (full Plan A); → 1 for Sirius/Vega/Rigel.
    if (uPlanBWeight <= 0.0) return planA;
    vec3 planB = uClassColor * b * uBrightness;
    return mix(planA, planB, uPlanBWeight);
  }

  float ocean() {
    float s = 0.0;
    s += textureCube(uPerlinCube, vLayer0).r;
    s += textureCube(uPerlinCube, vLayer1).r;
    s += textureCube(uPerlinCube, vLayer2).r;
    return s * 0.3333333;
  }

  void main() {
    #include <logdepthbuf_fragment>
    // In view space, the camera is at the origin, so vViewPos already
    // points from camera to fragment in view-space coordinates — the
    // normalize is the unit view-direction. The prior
    // (viewMatrix * (vWorld - cameraPosition)) computed the same
    // quantity but in world space first, where parsec-scale magnitudes
    // collapsed in float32.
    vec3 Vview = normalize(vViewPos);
    float nDotV = dot(vNormalView, -Vview);
    float fresnel = pow(1.0 - nDotV, uFresnelPower) * uFresnelInfluence;

    float brightness = ocean() * uBase + uBrightnessOffset + fresnel;
    // Wave α P1.4 fix: the upper clamp at 1.0 crushed the sun core to
    // LDR under the R1 #1A HDR pipeline — core pixels never exceeded
    // the selective-bloom threshold (1.0), bloom pickup died, and
    // combined with Commit 2's mis-ordered grading the visible sun
    // went nearly black. Keep the zero floor (brightnessToColor can
    // dip slightly negative near the ocean minimum) but let HDR
    // values pass through so the active postprocess path decides the
    // final on-screen luminance.
    vec3 col = max(brightnessToColor(brightness), vec3(0.0));
    float alpha = getAlpha(normalize(vNormalWorld));

    gl_FragColor = vec4(col, alpha);
  }
`;

export const proceduralSunGlowVertexShader = `
  bool isPerspectiveMatrix( mat4 m ) { return m[2][3] == -1.0; }
  #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    varying float vFragDepth;
    varying float vIsPerspective;
  #endif
  attribute vec3 aPos;

  // T6.4-M2 view-space billboard. Coordinate-space contract:
  // geometry is computed entirely in view space (camera at origin;
  // modelMatrix-pos - camera-pos collapses CPU-side in float64
  // through Three.js modelViewMatrix; small float32 view-space
  // values reach the GPU). The lighting dot-product stays in
  // WORLD space (option 2 of the wave plan): the vertex computes
  // a world-space outward radial direction (vNormalWorld) by
  // multiplying the view-space outward by mat3(viewMatrix) FROM
  // THE RIGHT, which is identical to transpose(mat3(viewMatrix))
  // applied from the left (camera rotation is orthonormal so
  // transpose = inverse). The right-multiply form is used because
  // GLSL ES 1.00 (the WebGL1 baseline still active in atlas's
  // ShaderMaterial path) lacks the transpose() builtin (Codex
  // T6.4-M2 P1 catch). The fragment dots vNormalWorld against
  // world-space uLightView. Replaces the prior world-space
  // billboard math which suffered float32 catastrophic
  // cancellation in center - cameraPosition at parsec-scale HYG
  // positions, and the getAlpha(normalize(vWorld)) hack which
  // only resembled an outward radial for the Sun-at-origin.
  varying float vRadial;
  varying vec3 vViewPos;
  varying vec3 vNormalWorld;

  uniform float uRadius;

  void main() {
    vRadial = aPos.z;
    vec3 centerView = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 toCenterView = normalize(centerView);
    vec3 upView = vec3(0.0, 1.0, 0.0);
    vec3 sideView = normalize(cross(toCenterView, upView));
    // T6.4-M2 Codex P1 fix: scale pView by the model's uniform
    // worldScale so the glow billboard tracks the sphere radius
    // (the procedural-sun group is uniformly scaled by
    // sunVisualRadiusWorld / SPHERE_RADIUS in ProceduralSun3D).
    // The pre-M2 form applied modelMatrix to a world-frame p,
    // which implicitly scaled it; the M2 view-space form computes
    // p in unscaled view units, so we now multiply explicitly.
    // Same worldScale derivation rays/flares use.
    float worldScale = length(vec3(modelMatrix[0][0], modelMatrix[1][0], modelMatrix[2][0]));
    vec3 pView = (aPos.x * sideView + aPos.y * upView) * worldScale;
    pView *= 1.0 + aPos.z * uRadius;
    vec3 finalView = centerView + pView;
    vViewPos = finalView;

    vec3 outwardView = length(pView) > 0.0 ? normalize(pView) : upView;
    // Right-multiply by mat3(viewMatrix) is identical to
    // transpose(mat3(viewMatrix)) from the left, but transpose() is
    // GLSL ES 3.00+. Atlas runs on GLSL ES 1.00.
    vNormalWorld = normalize(outwardView * mat3(viewMatrix));

    gl_Position = projectionMatrix * vec4(finalView, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

export const proceduralSunGlowFragmentShader = `
  #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    uniform float logDepthBufFC;
    varying float vFragDepth;
    varying float vIsPerspective;
  #endif
  precision highp float;

  uniform float uVisibility;
  uniform float uDirection;
  uniform vec3 uLightView;
  uniform float uBrightness;
  uniform float uFalloffColor;
  // T6.4-M4-fix: same legacy curve × class-relative bias as the
  // sphere fragment, but with uTintBase=0.4 (vs sphere's 0.2)
  // because pre-M4 the corona had a more diffuse / neutral
  // character. Sphere and glow share uClassColor + bias knobs
  // (one spectral identity), differ only in tintBase.
  uniform float uTintBase;
  uniform vec3 uClassColor;
  uniform vec3 uSolarClassColor;
  uniform float uClassBiasGamma;
  uniform float uClassBiasFloor;
  uniform float uClassBiasCeiling;
  uniform float uPlanBWeight;

  // T6.4-M2 coordinate-space contract (mirrors vertex header):
  // vNormalWorld is the per-fragment outward radial direction in
  // WORLD frame; uLightView is the world-space light direction.
  // The dot-product dot(vNormalWorld, uLightView) therefore stays
  // in a single frame as required by option 2 of the wave plan.
  // vViewPos is the camera-relative position varying, kept in
  // case future glow effects (e.g. distance-aware falloff) need it.
  varying float vRadial;
  varying vec3 vViewPos;
  varying vec3 vNormalWorld;


  float getAlpha(vec3 n) {
    float nDotL = dot(n, uLightView) * uDirection;
    return smoothstep(1.0, 1.5, nDotL + uVisibility * 2.5);
  }

  vec3 classRelativeBias() {
    vec3 ratio = uClassColor / max(uSolarClassColor, vec3(1e-6));
    vec3 raw = pow(max(ratio, vec3(1e-6)), vec3(uClassBiasGamma));
    return clamp(raw, vec3(uClassBiasFloor), vec3(uClassBiasCeiling));
  }

  vec3 brightnessToColor(float b) {
    // Mirror of the sphere fragment's curve + Plan B blend, with
    // glow's tintBase=0.4. Same uPlanBWeight uniform shared with
    // sphere so corona color stays in lockstep with surface across
    // the full temperature range.
    float t1 = uTintBase;
    float t3 = t1 * t1 * t1;
    vec3 curve = vec3(b, b * b * t1, b * b * b * b * t3) * uBrightness;
    vec3 planA = curve * classRelativeBias();
    if (uPlanBWeight <= 0.0) return planA;
    vec3 planB = uClassColor * b * uBrightness;
    return mix(planA, planB, uPlanBWeight);
  }

  void main() {
    #include <logdepthbuf_fragment>
    float alpha = 1.0 - vRadial;
    alpha *= alpha;
    float brightness = 1.0 + alpha * uFalloffColor;
    alpha *= getAlpha(normalize(vNormalWorld));
    gl_FragColor = vec4(brightnessToColor(brightness) * alpha, alpha);
  }
`;

export const proceduralSunRaysVertexShader = `
  bool isPerspectiveMatrix( mat4 m ) { return m[2][3] == -1.0; }
  #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    varying float vFragDepth;
    varying float vIsPerspective;
  #endif
  attribute vec3 aPos;
  attribute vec3 aPos0;
  attribute vec4 aWireRandom;

  varying float vUVY;
  varying float vOpacity;
  varying vec3 vColor;
  varying vec3 vNormal;

  uniform float uHueSpread;
  uniform float uHue;
  uniform float uLength;
  uniform float uWidth;
  uniform float uTime;
  uniform float uNoiseFrequency;
  uniform float uNoiseAmplitude;
  uniform float uOpacity;

  #define m4 mat4( \
    0.00, 0.80, 0.60, -0.4, \
   -0.80, 0.36, -0.48, -0.5, \
   -0.60, -0.48, 0.64,  0.2, \
    0.40, 0.30, 0.20,  0.4  \
  )

  vec4 twistedSineNoise(vec4 q, float falloff) {
    float a = 1.0;
    float f = 1.0;
    vec4 sum = vec4(0.0);

    for (int i = 0; i < 4; i++) {
      q = m4 * q;
      vec4 s = sin(q.ywxz * f) * a;
      q += s;
      sum += s;
      a *= falloff;
      f /= falloff;
    }

    return sum;
  }

  vec3 getPos(float phase, float animPhase) {
    float size = aWireRandom.z + 0.2;
    float d = phase * uLength * size;
    vec3 p = aPos0 + aPos0 * d;
    p += twistedSineNoise(vec4(p * uNoiseFrequency, uTime), 0.707).xyz * (d * uNoiseAmplitude);
    return p;
  }

  vec3 spectrum(float d) {
    return smoothstep(0.25, 0.0, abs(d + vec3(-0.375, -0.5, -0.625)));
  }

  void main() {
    // T6.4-M2 coordinate-space contract: geometry computed in view
    // space (modelViewMatrix is built CPU-side as
    // viewMatrix*modelMatrix in float64; translation column =
    // (objectPos - cameraPos) collapses precisely before float32
    // GPU upload). Replaces the prior p0w - cameraPosition
    // subtraction which catastrophically cancelled at parsec-scale
    // HYG positions. The lighting normal (vNormal) stays in WORLD
    // frame (option 2 of the wave plan) by right-multiplying the
    // view-space outward by mat3(viewMatrix) (identical to
    // transpose(mat3(viewMatrix)) from the left, but GLSL ES 1.00
    // compatible — see glow-vertex header for full rationale).
    vec3 centerView = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vUVY = aPos.z;
    float animPhase = fract(uTime * 0.3 * (aWireRandom.y * 0.5) + aWireRandom.x);

    vec3 p = getPos(aPos.x, animPhase);
    vec3 p1 = getPos(aPos.x + 0.01, animPhase);

    vec3 p0v = (modelViewMatrix * vec4(p, 1.0)).xyz;
    vec3 p1v = (modelViewMatrix * vec4(p1, 1.0)).xyz;

    vec3 dirView = normalize(p1v - p0v);
    vec3 vView = normalize(p0v);
    vec3 sideView = normalize(cross(vView, dirView));

    if (length(sideView) < 1e-6) {
      vec3 up = abs(dirView.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      sideView = normalize(cross(up, dirView));
    }

    float worldScale = length(vec3(modelMatrix[0][0], modelMatrix[1][0], modelMatrix[2][0]));
    float width = uWidth * aPos.z * (1.0 - aPos.x) * worldScale;
    vec3 finalView = p0v + sideView * width;

    vec3 outwardView = finalView - centerView;
    vNormal = length(outwardView) > 0.0
      ? normalize(outwardView * mat3(viewMatrix))
      : vec3(0.0, 1.0, 0.0);
    vOpacity = uOpacity * (0.5 + aWireRandom.w);
    vColor = spectrum(aWireRandom.w * uHueSpread + uHue);

    gl_Position = projectionMatrix * vec4(finalView, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

export const proceduralSunRaysFragmentShader = `
  #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    uniform float logDepthBufFC;
    varying float vFragDepth;
    varying float vIsPerspective;
  #endif
  precision highp float;

  uniform float uVisibility;
  uniform float uDirection;
  uniform vec3 uLightView;
  uniform float uAlphaBlended;

  varying float vUVY;
  varying float vOpacity;
  varying vec3 vColor;
  varying vec3 vNormal;


  float getAlpha(vec3 n) {
    float nDotL = dot(n, uLightView) * uDirection;
    return smoothstep(1.0, 1.5, nDotL + uVisibility * 2.5);
  }

  void main() {
    #include <logdepthbuf_fragment>
    float alpha = 1.0 - smoothstep(0.0, 1.0, abs(vUVY));
    alpha *= alpha;
    alpha *= vOpacity;
    alpha *= getAlpha(vNormal);
    gl_FragColor = vec4(vColor * alpha, alpha);
  }
`;

export const proceduralSunFlaresVertexShader = `
  bool isPerspectiveMatrix( mat4 m ) { return m[2][3] == -1.0; }
  #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    varying float vFragDepth;
    varying float vIsPerspective;
  #endif
  precision highp float;


  attribute vec3 aPos;
  attribute vec3 aPos0;
  attribute vec3 aPos1;
  attribute vec4 aWireRandom;

  varying float vUVY;
  varying float vOpacity;
  varying vec3 vColor;
  varying vec3 vNormal;

  uniform float uWidth;
  uniform float uAmp;
  uniform float uTime;
  uniform float uNoiseFrequency;
  uniform float uNoiseAmplitude;
  uniform float uOpacity;
  uniform float uHueSpread;
  uniform float uHue;

  #define m4 mat4( \
    0.00, 0.80, 0.60, -0.4, \
   -0.80, 0.36, -0.48, -0.5, \
   -0.60, -0.48, 0.64,  0.2, \
    0.40, 0.30, 0.20,  0.4  \
  )

  vec4 twistedSineNoise(vec4 q, float falloff) {
    float a = 1.0;
    float f = 1.0;
    vec4 sum = vec4(0.0);

    for (int i = 0; i < 4; i++) {
      q = m4 * q;
      vec4 s = sin(q.ywxz * f) * a;
      q += s;
      sum += s;
      a *= falloff;
      f /= falloff;
    }

    return sum;
  }

  vec3 getPosOBJ(float phase, float animPhase) {
    float size = distance(aPos0, aPos1);
    vec3 n = normalize((aPos0 + aPos1) * 0.5);
    vec3 p = mix(aPos0, aPos1, phase);

    float amp = sin(phase * 3.14159265) * size * uAmp;
    amp *= animPhase;
    p += n * amp;
    p += twistedSineNoise(vec4(p * uNoiseFrequency, uTime), 0.707).xyz * (amp * uNoiseAmplitude);

    return p;
  }

  #define hue(v) (0.6 + 0.6 * cos(6.3 * (v) + vec3(0.0, 23.0, 21.0)))

  void main() {
    // T6.4-M2 — same coordinate-space contract as glow / rays: view-
    // space geometry via modelViewMatrix (precision-safe collapse of
    // objectPos - cameraPos at parsec scale), world-space lighting
    // normal via outward * mat3(viewMatrix) on the view-space outward
    // radial (option 2 of the wave plan; right-multiply form is GLSL
    // ES 1.00 compatible — see glow-vertex header).
    vec3 centerView = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vUVY = aPos.z;

    float animPhase = fract(uTime * 0.3 * (aWireRandom.y * 0.5) + aWireRandom.x);
    vec3 pOBJ = getPosOBJ(aPos.x, animPhase);
    vec3 p1OBJ = getPosOBJ(aPos.x + 0.01, animPhase);

    vec3 pV = (modelViewMatrix * vec4(pOBJ, 1.0)).xyz;
    vec3 p1V = (modelViewMatrix * vec4(p1OBJ, 1.0)).xyz;

    vec3 dirView = normalize(p1V - pV);
    vec3 vView = normalize(pV);
    vec3 sideView = normalize(cross(vView, dirView));

    float worldScale = length(vec3(modelMatrix[0][0], modelMatrix[1][0], modelMatrix[2][0]));
    float radius = length(aPos0);
    float width = uWidth * aPos.z * (1.0 + animPhase) * radius * worldScale;
    vec3 finalView = pV + sideView * width;

    vec3 outwardView = finalView - centerView;
    vNormal = length(outwardView) > 0.0
      ? normalize(outwardView * mat3(viewMatrix))
      : vec3(0.0, 1.0, 0.0);

    // length is frame-invariant — view-space and world-space radial
    // distances match identically, so the original opacity falloff
    // is byte-equivalent here.
    float lenW = length(outwardView);
    vOpacity = smoothstep(radius, radius * 1.03, lenW);
    vOpacity *= (1.0 - animPhase);
    vOpacity *= uOpacity;

    vColor = hue(aWireRandom.w * uHueSpread + uHue);
    gl_Position = projectionMatrix * vec4(finalView, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

export const proceduralSunFlaresFragmentShader = `
  #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    uniform float logDepthBufFC;
    varying float vFragDepth;
    varying float vIsPerspective;
  #endif
  precision highp float;

  uniform float uVisibility;
  uniform float uDirection;
  uniform vec3 uLightView;
  uniform float uAlphaBlended;

  varying float vUVY;
  varying float vOpacity;
  varying vec3 vColor;
  varying vec3 vNormal;


  float getAlpha(vec3 n) {
    float nDotL = dot(n, uLightView) * uDirection;
    return smoothstep(1.0, 1.5, nDotL + uVisibility * 2.5);
  }

  void main() {
    #include <logdepthbuf_fragment>
    float alpha = smoothstep(1.0, 0.0, abs(vUVY));
    alpha *= alpha;
    alpha *= vOpacity;
    alpha *= getAlpha(vNormal);

    gl_FragColor = vec4(vColor * alpha, alpha * uAlphaBlended);
  }
`;
