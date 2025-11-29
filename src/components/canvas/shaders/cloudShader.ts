export const cloudVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const cloudFragmentShader = `
  uniform sampler2D map;
  varying vec2 vUv;
  void main() {
    vec4 texColor = texture2D(map, vUv);
    // Use the brightness (red channel) as alpha
    // Clouds are white, background is black.
    gl_FragColor = vec4(1.0, 1.0, 1.0, texColor.r); 
  }
`;
