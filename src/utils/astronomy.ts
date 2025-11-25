/**
 * Astronomy Utilities
 * Core physics and coordinate conversion for the Starfield system.
 */

export interface StarData {
  hip?: number;
  tyc?: string;
  ra: number; // Right Ascension in degrees
  dec: number; // Declination in degrees
  parallax?: number; // Parallax in miliarcseconds
  mag: number; // Visual magnitude
  colorIndex?: number; // B-V color index
}

export interface CartesianCoordinate {
  x: number;
  y: number;
  z: number;
  distance: number;
}

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Converts spherical celestial coordinates (RA, Dec, Parallax) to Cartesian (X, Y, Z).
 * @param ra Right Ascension in degrees
 * @param dec Declination in degrees
 * @param parallax Parallax in miliarcseconds (defaults to a small value if 0/undefined)
 * @returns Cartesian coordinates where 1 unit = 1 parsec
 */
export function sphericalToCartesian(
  ra: number,
  dec: number,
  parallax?: number
): CartesianCoordinate {
  // Avoid division by zero; if parallax is missing/0, assume a very far distance (e.g., 10000 parsecs)
  // 1000 mas = 1 parsec. 0.1 mas = 10000 parsecs.
  const p = parallax && parallax > 0.0001 ? parallax : 0.1;
  const distance = 1000 / p;

  // Convert degrees to rads
  // RA is in hours (0-24), Dec is in degrees (-90 to 90)
  const raRad = (ra * 15 * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;

  // Standard conversion
  // x = r * cos(dec) * cos(ra)
  // y = r * cos(dec) * sin(ra)
  // z = r * sin(dec)
  // Note: This coordinate system might need rotation depending on Three.js camera up-vector (usually Y-up).
  // In astronomy, Z is often North Celestial Pole. We'll stick to standard math here.

  const x = distance * Math.cos(decRad) * Math.cos(raRad);
  const y = distance * Math.cos(decRad) * Math.sin(raRad);
  const z = distance * Math.sin(decRad);

  return { x, y, z, distance };
}

/**
 * Calculates relative size based on visual magnitude using Pogson's Ratio.
 * @param magnitude Apparent visual magnitude
 * @returns Normalized size factor (approx 0.1 to 3.0)
 */
export function magnitudeToSize(magnitude: number): number {
  // Clamp magnitude to reasonable visible range for rendering logic
  // Sirius: -1.46, Limit of naked eye: ~6.5
  const maxMag = 12.0; // Dim (Updated for higher star count)
  const minMag = -2.0; // Bright

  const clamped = Math.max(minMag, Math.min(maxMag, magnitude));

  // Invert: lower mag = brighter/larger
  // Linear interpolation for base size
  const normalized = 1 - (clamped - minMag) / (maxMag - minMag);

  // Exponential curve for "glare" effect on bright stars
  // Adjusted for "Space Realism":
  // Faint stars should be tiny points (near 0.5-1.0 size)
  // Bright stars should be distinct but not overwhelming blobs
  return 0.5 + Math.pow(normalized, 4.0) * 12.0;
}

/**
 * Converts B-V Color Index to RGB.
 * Based on blackbody radiation approximation.
 * @param bv B-V Color Index (-0.4 to 2.0)
 */
export function colorIndexToRGB(bv: number): RGBColor {
  // Approximate mapping from B-V to RGB
  // -0.4 (Hot/Blue) -> 2.0 (Cool/Red)

  let t = (bv + 0.4) / (2.0 + 0.4);
  t = Math.max(0, Math.min(1, t));

  let r = 0,
    g = 0,
    b = 0;

  if (t < 0.25) {
    // Blue to White
    // Boost blue saturation
    r = 0.6 + t * 1.6;
    g = 0.6 + t * 1.6;
    b = 1.0;
  } else if (t < 0.5) {
    // White to Yellow
    r = 1.0;
    g = 1.0 - (t - 0.25) * 0.8;
    b = 1.0 - (t - 0.25) * 1.6; // Reduce blue faster for better yellow
  } else {
    // Yellow to Red
    // Boost red/orange saturation
    r = 1.0;
    g = 0.8 - (t - 0.5) * 1.2;
    b = 0.2 - (t - 0.5) * 0.4;
  }

  return { r, g, b };
}

/**
 * Helper to determine if a star should be visible based on LOD.
 */
export function isStarVisible(
  starDist: number,
  starMag: number,
  cameraDist: number,
  fov: number
): boolean {
  // Simple heuristic:
  // If we are zoomed out (cameraDist large), we only see bright stars.
  // If we are zoomed in, we see dimmer stars.

  // This is a placeholder for the actual LOD logic which might happen in the shader or loop.
  return true;
}
