import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { useStore } from "../../store";
import starDataRaw from "../../data/tycho2-processed.json";
import {
  sphericalToCartesian,
  magnitudeToSize,
  colorIndexToRGB,
  type StarData,
} from "../../utils/astronomy";

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
  const { scaleMode, showStarfield } = useStore();
  const { gl, size } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);

  // Process data once
  const geometry = useMemo(() => {
    const stars = starDataRaw as StarData[];
    const count = stars.length;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const mags = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const star = stars[i];

      // Convert coordinates
      const { x, y, z } = sphericalToCartesian(
        star.ra,
        star.dec,
        star.parallax
      );

      // Scale distance for visualization
      const DISTANCE_SCALE = 206265000.0; // 1 parsec in our units

      positions[i * 3] = x * DISTANCE_SCALE;
      positions[i * 3 + 1] = z * DISTANCE_SCALE; // Z -> Y (Astronomy Z North -> Three.js Y Up)
      positions[i * 3 + 2] = -y * DISTANCE_SCALE; // Y -> -Z

      // Color
      const rgb = colorIndexToRGB(star.colorIndex || 0.6);
      colors[i * 3] = rgb.r;
      colors[i * 3 + 1] = rgb.g;
      colors[i * 3 + 2] = rgb.b;

      // Size (still used for fallback)
      let s = magnitudeToSize(star.mag);
      if (scaleMode === "didactic") s *= 1.5;
      sizes[i] = s;

      // Magnitude for physics calculations
      mags[i] = star.mag;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute("mag", new THREE.BufferAttribute(mags, 1));

    return geom;
  }, [scaleMode]);

  useFrame(() => {
    if (!materialRef.current) return;

    // Viewport-adaptive sizing
    const viewportScale =
      Math.sqrt(Math.max(size.width, size.height) * window.devicePixelRatio) /
      60;

    materialRef.current.uniforms.particleSize.value = viewportScale;
  });

  if (!showStarfield) return null;

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
