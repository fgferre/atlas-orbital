export const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const atmosphereFragmentShader = `
  uniform vec3 color;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vec3 normal = normalize(vNormal);
    float viewDistSq = dot(vViewPosition, vViewPosition);
    vec3 viewDir = viewDistSq > 0.000001 ? vViewPosition * inversesqrt(viewDistSq) : vec3(0.0, 0.0, 1.0);
    
    float intensity = pow(max(0.0, 0.6 - dot(normal, viewDir)), 4.0);
    gl_FragColor = vec4(color, intensity);
  }
`;
