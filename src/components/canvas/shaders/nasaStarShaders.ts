/**
 * NASA Eyes Star Shaders - EXACT Implementation
 *
 * Direct copy from NASA Eyes app.js line 15008
 * Only change: luminosity constant adjusted for our distance scale
 *
 * @module nasaStarShaders
 */

/**
 * Vertex shader - NASA Eyes EXACT
 */
export const nasaStarVertexShader = `
  #define PI 3.1415926538

  attribute vec4 starColor;
  varying vec4 fColor;
  uniform float particleSize;

  // NASA's flux formula (luminosity adjusted for our scale)
  float absoluteMagnitudeToFlux(float absoluteMagnitude, float distance) {
    float luminosityInWatts = 1.35e18 * pow(10.0, absoluteMagnitude / -2.5);
    return luminosityInWatts / (4.0 * PI * distance * distance);
  }

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    fColor = starColor;

    // Get the flux and brightness of the star at the camera's point.
    float absMag = starColor.a;
    float distance = length(viewPosition);

    float flux = absoluteMagnitudeToFlux(absMag, distance);
    float brightness = 2.0 * log(1.0 + flux * 1e4);

    // Adjust the color and size so that it is visually pleasing. (NASA EXACT)
    fColor.a = clamp(brightness * particleSize, 0.05, 1.0);
    gl_PointSize = clamp(brightness * 4.0 * particleSize, 5.0, 50.0);

    // If it is too close, fade the star. (NASA EXACT - app.js line 15008)
    // NASA: (distance - 1.0e12) / 9.0e12 in km
    // Ours: calibrated for our scale (km * KM_TO_PARSEC * DISTANCE_SCALE)
    float nearFade = clamp((distance - 6.684e6) / 6.016e7, 0.0, 1.0);
    fColor.a = mix(0.0, fColor.a, nearFade);
  }
`;

/**
 * Fragment shader - NASA Eyes EXACT
 */
export const nasaStarFragmentShader = `
  precision highp float;

  varying vec4 fColor;

  void main(void) {
    float distanceFromEdge = clamp(1.0 - 2.0 * length(gl_PointCoord - vec2(0.5, 0.5)), 0.0, 1.0);
    float a = pow(distanceFromEdge, 5.0);
    gl_FragColor.rgb = fColor.rgb;
    gl_FragColor.a = fColor.a * a;
  }
`;
