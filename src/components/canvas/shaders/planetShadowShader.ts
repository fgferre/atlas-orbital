export const planetShadowVertexPatch = `
  #include <begin_vertex>
  vPos = position;
`;

export const planetShadowFragmentPatch = `
  #include <map_fragment>
  
  // Analytical Planet Shadow
  // Ray from fragment (vPos) to Sun (uSunPosition)
  vec3 lightDir = normalize(uSunPosition - vPos);
  
  // Planet is a sphere at (0,0,0) with radius 1.0 (in local space)
  // Ray-Sphere Intersection: |O + tD|^2 = R^2
  // (vPos + t*lightDir)^2 = 1.0^2
  // t^2 + 2*dot(vPos, lightDir)*t + dot(vPos, vPos) - 1.0 = 0
  
  float b = 2.0 * dot(vPos, lightDir);
  float c = dot(vPos, vPos) - 1.0; // Radius is 1.0
  float delta = b*b - 4.0*c;
  
  // If delta > 0, line intersects sphere.
  // We need to check if intersection is in the direction of the sun (t > 0)
  // Since c > 0 (ring is outside planet), roots have same sign.
  // Sum of roots = -b. If b < 0 (pointing towards planet), roots are positive.
  
  bool inShadow = false;
  if (delta >= 0.0 && b < 0.0) {
      inShadow = true;
  }
  
  if (inShadow) {
    // Apply shadow intensity (uShadowIntensity should be injected in Planet.tsx)
    // 1.0 = full shadow (black), 0.0 = no shadow
    diffuseColor.rgb *= (1.0 - uShadowIntensity);
  }
`;

export const planetShadowEmissivePatch = `
  #include <emissivemap_fragment>
  // Hack to kill emissive in shadow
  // We need to re-calculate shadow condition or pass it?
  // Let's just re-calculate, it's cheap.
  
  vec3 lDir = normalize(uSunPosition - vPos);
  float bb = 2.0 * dot(vPos, lDir);
  float cc = dot(vPos, vPos) - 1.0;
  float dd = bb*bb - 4.0*cc;
  
  if (dd >= 0.0 && bb < 0.0) {
    totalEmissiveRadiance *= (1.0 - uShadowIntensity);
  }
`;
