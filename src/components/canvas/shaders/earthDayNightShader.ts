export const earthDayNightVertexPatch = `
  #include <begin_vertex>
  vPos = position;
  vObjectNormal = normal;
  vUv = uv;
`;

export const earthDayNightFragmentPatch = `
  uniform sampler2D tDay;
  uniform sampler2D tNight;
  uniform vec3 uSunPosition;
  varying vec3 vPos;
  varying vec3 vObjectNormal;
  varying vec2 vUv;

  void main() {
    // Calculate light direction
    vec3 lightDir = normalize(uSunPosition - vPos);
    
    // Calculate intensity based on dot product of normal and light direction
    // We use vObjectNormal which is in local space, assuming uSunPosition is also transformed to local space
    float intensity = dot(normalize(vObjectNormal), lightDir);
    
    // Smooth transition between day and night
    // 0.0 is the terminator. We want a bit of a gradient.
    float mixFactor = smoothstep(-0.1, 0.1, intensity);
    
    // Sample textures
    vec4 dayColor = texture2D(tDay, vUv);
    vec4 nightColor = texture2D(tNight, vUv);
    
    // Mix colors
    // When mixFactor is 1 (Day), we show dayColor
    // When mixFactor is 0 (Night), we show nightColor
    // Note: Night lights should be additive or just replace? 
    // Usually night lights are visible where it's dark.
    
    // Simple mix:
    // vec4 finalColor = mix(nightColor, dayColor, mixFactor);
    
    // Better mix: Night lights are added to the dark side, but day texture is multiplied by light
    // Actually, MeshStandardMaterial handles the lighting (diffuse) for the day side.
    // We just want to ADD the night lights to the emissive channel or modify the diffuse color.
    
    // Approach A: Replace the map color entirely
    // This overrides the standard lighting calculation for the base color, but standard lighting will still apply shadow/light attenuation.
    // If we use this in <map_fragment>, 'diffuseColor' is the output.
    
    // If we set diffuseColor to dayColor, standard lighting will darken it on the night side.
    // So we just need to ADD the night lights to the emissive part?
    // Or we can manually mix here.
    
    // Let's try modifying the diffuseColor to be the day map, 
    // and then we need to handle the night lights.
    // If we rely on standard lighting, the night side will be black.
    // So night lights must be EMISSIVE.
    
    vec4 texelColor = dayColor;
    diffuseColor *= texelColor;
    
    // We can output the night intensity to a varying or just use it here if we can write to emissive.
    // But <map_fragment> is early in the pipeline.
    // <emissivemap_fragment> is where emissive is handled.
  }
`;

// We need a separate patch for emissive to make the night lights glow
export const earthDayNightEmissivePatch = `
  uniform sampler2D tNight;
  uniform vec3 uSunPosition;
  varying vec3 vPos;
  varying vec3 vObjectNormal;
  varying vec2 vUv;

  void main() {
    vec3 lightDir = normalize(uSunPosition - vPos);
    float intensity = dot(normalize(vObjectNormal), lightDir);
    
    // Night lights appear where intensity is low
    // We want night lights to be full strength at intensity < -0.1
    // and fade out to 0 at intensity > 0.1
    float nightFactor = 1.0 - smoothstep(-0.2, 0.2, intensity);
    
    vec4 nightColor = texture2D(tNight, vUv);
    
    // Apply night lights to total emissive radiance
    // 'totalEmissiveRadiance' is the variable used in Three.js shader chunk
    totalEmissiveRadiance += nightColor.rgb * nightFactor * 2.0; // Boost intensity a bit
  }
`;
