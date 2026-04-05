import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { useStore } from "../../store";
import { getCachedTycho2Catalog, loadTycho2Catalog } from "../../lib/starfield";
import {
  sphericalToCartesian,
  magnitudeToSize,
  colorIndexToRGB,
} from "../../utils/astronomy";
import {
  TYCHO2_VALUES_PER_STAR,
  type Tycho2CatalogData,
} from "../../utils/tycho2Binary";
import { useStarfieldCatalog } from "./useStarfieldCatalog";

// Vertex Shader - Simple magnitude-based (like NASA)
const vertexShader = `
  attribute vec3 color;
  attribute float mag;

  varying vec4 fColor;

  uniform float pixelRatio;
  uniform float particleSize;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    // Simple magnitude-based brightness
    // Tycho-2 mag range: roughly -1.5 (Sirius) to +12 (faint)
    // Map to 0-1: brighter = lower mag
    float brightness = (8.0 - mag) / 12.0;
    brightness = clamp(brightness, 0.1, 1.0);
    
    // Pass color with brightness as alpha
    fColor = vec4(color, brightness);
    
    // Point size based on brightness
    float baseSize = mix(3.0, 40.0, brightness);
    gl_PointSize = baseSize * particleSize * pixelRatio;
  }
`;

// Fragment Shader - NASA-style soft glow
const fragmentShader = `
  precision highp float;
  
  varying vec4 fColor;

  void main() {
    // NASA's exact glow formula
    float distanceFromEdge = clamp(1.0 - 2.0 * length(gl_PointCoord - vec2(0.5, 0.5)), 0.0, 1.0);
    float a = pow(distanceFromEdge, 5.0);
    
    gl_FragColor.rgb = fColor.rgb;
    gl_FragColor.a = fColor.a * a;
  }
`;

export const Starfield = () => {
  const scaleMode = useStore((state) => state.scaleMode);
  const { gl, size } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const catalog = useStarfieldCatalog<Tycho2CatalogData>({
    source: "tycho2",
    loadCatalog: loadTycho2Catalog,
    getCachedCatalog: getCachedTycho2Catalog,
    errorMessage: "Failed to load Tycho-2 catalog",
  });

  // Process data once
  const geometry = useMemo(() => {
    if (!catalog) {
      return null;
    }

    const { count, data } = catalog;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const mags = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const offset = i * TYCHO2_VALUES_PER_STAR;
      const ra = data[offset];
      const dec = data[offset + 1];
      const parallax = data[offset + 2];
      const mag = data[offset + 3];
      const colorIndex = data[offset + 4];

      // Convert coordinates
      const { x, y, z } = sphericalToCartesian(ra, dec, parallax);

      // Scale distance for visualization
      const DISTANCE_SCALE = 206265000.0; // 1 parsec in our units

      positions[i * 3] = x * DISTANCE_SCALE;
      positions[i * 3 + 1] = z * DISTANCE_SCALE; // Z -> Y (Astronomy Z North -> Three.js Y Up)
      positions[i * 3 + 2] = -y * DISTANCE_SCALE; // Y -> -Z

      // Color
      const rgb = colorIndexToRGB(colorIndex || 0.6);
      colors[i * 3] = rgb.r;
      colors[i * 3 + 1] = rgb.g;
      colors[i * 3 + 2] = rgb.b;

      // Size (still used for fallback)
      let s = magnitudeToSize(mag);
      if (scaleMode === "didactic") s *= 1.5;
      sizes[i] = s;

      // Magnitude for physics calculations
      mags[i] = mag;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute("mag", new THREE.BufferAttribute(mags, 1));

    return geom;
  }, [catalog, scaleMode]);

  useFrame(() => {
    if (!materialRef.current) return;

    // Viewport-adaptive sizing
    const viewportScale =
      Math.sqrt(Math.max(size.width, size.height) * window.devicePixelRatio) /
      60;

    materialRef.current.uniforms.particleSize.value = viewportScale;
  });

  // Axial Tilt (Obliquity of the Ecliptic)
  // The star data is in Equatorial coordinates (aligned with Earth's equator).
  // The solar system is in Ecliptic coordinates (aligned with Earth's orbit).
  // We need to tilt the starfield by ~23.4 degrees to align them.
  // We also need to map Equatorial Z (North) to Three.js Y (Up).
  // But since we mapped x->x, y->y, z->z in geometry, Z is currently "Depth" in Three.js (if Y is up).

  // Let's fix the geometry mapping first:
  // Astronomy Z (North) -> Three.js Y (Up)
  // Astronomy X (Vernal Equinox) -> Three.js X
  // Astronomy Y -> Three -Z (Right Hand Rule)

  if (!geometry) {
    return null;
  }

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      rotation={[(23.4 * Math.PI) / 180, 0, 0]}
      raycast={() => null}
      renderOrder={-2}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          pixelRatio: { value: gl.getPixelRatio() },
          particleSize: { value: 1.0 },
        }}
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};
