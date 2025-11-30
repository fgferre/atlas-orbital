export const ringShadowVertexPatch = `
  #include <begin_vertex>
  vPos = position;
  vLocalNormal = normal;
`;

export const ringShadowFragmentPatch = `
  #include <map_fragment>

  // Analytical Ring Shadow
  // Ray from fragment (vPos) to Sun (uSunPosition)
  vec3 diff = uSunPosition - vPos;
  float distSq = dot(diff, diff);
  vec3 lightDir = distSq > 0.000001 ? diff * inversesqrt(distSq) : vec3(0.0, 1.0, 0.0);

  // Check if surface faces the sun (Day side)
  // We only cast shadows on the lit side.
  vec3 normal = vLocalNormal;
  float normalSq = dot(normal, normal);
  vec3 safeNormal = normalSq > 0.000001 ? normal * inversesqrt(normalSq) : vec3(0.0, 1.0, 0.0);
  
  float sunDot = dot(safeNormal, lightDir);

  // Smoothly fade out the shadow effect as we approach the terminator (day/night line)
  // This prevents hard artifacts at the shadow edge near the dark side.
  float terminatorFade = smoothstep(0.0, 0.2, sunDot);

  if (terminatorFade > 0.0 && abs(lightDir.y) > 0.000001) {
    // Intersect with Ring Plane (y=0)
    // t = -origin.y / dir.y
    float t = -vPos.y / lightDir.y;

    // If t > 0, the ray hits the plane *towards* the sun (shadow caster)
    if (t > 0.0) {
      vec3 hitPos = vPos + lightDir * t;
      float radius = length(hitPos.xz);

      if (radius > uInnerRadius && radius < uOuterRadius) {
        float u = (radius - uInnerRadius) / (uOuterRadius - uInnerRadius);
        vec4 ringColor = texture2D(tRing, vec2(u, 0.5));

        // Darken based on ring opacity and terminator fade
        // 0.9 factor for max shadow density
        diffuseColor.rgb *= (1.0 - ringColor.a * 0.9 * terminatorFade);
      }
    }
  }
`;
