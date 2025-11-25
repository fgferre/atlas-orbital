import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useStore } from "../../store";
import starDataRaw from "../../data/tycho2-processed.json";
import {
  sphericalToCartesian,
  magnitudeToSize,
  colorIndexToRGB,
  type StarData,
} from "../../utils/astronomy";

// Vertex Shader
const vertexShader = `
  attribute float size;
  attribute vec3 color;
  attribute float flickerSpeed;
  attribute float mag;
  
  varying vec3 vColor;
  varying float vFlickerSpeed;
  varying float vMag;
  
  uniform float time;
  uniform float pixelRatio;
  uniform float zoom;

  void main() {
    vColor = color;
    vFlickerSpeed = flickerSpeed;
    vMag = mag;
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    
    gl_PointSize = size * pixelRatio;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment Shader
const fragmentShader = `
  varying vec3 vColor;
  varying float vFlickerSpeed;
  varying float vMag;
  
  uniform float time;
  uniform float zoom;
  
  void main() {
    // LOD Logic: Fade out dim stars when zoomed out
    // zoom 1.0 = normal view. zoom 0.1 = zoomed out.
    // We want to see mag 6 at zoom 1.
    // At zoom 0.0001 (solar system view), we only want bright stars (mag < 2).
    
    // Threshold formula: 
    // As zoom decreases, maxVisibleMag should decrease.
    // Let's say at zoom 1, maxMag = 8.
    // At zoom 1e-5, maxMag = 2.
    
    // Logarithmic relationship
    // float maxMag = 6.0 + log(zoom) * 0.5; 
    // But zoom in Three.js camera isn't exactly distance. 
    // Let's use a simpler heuristic passed via uniform if needed, 
    // or just rely on the fact that 'zoom' uniform comes from camera.zoom
    
    // Actually, for this specific app, the camera moves, zoom might stay 1.
    // We should rely on gl_Position.w or similar if we wanted distance-based, 
    // but the user asked for "zoom level".
    // Assuming 'zoom' uniform reflects the "scale" of observation.
    
    float maxVisibleMag = 6.0 + log(max(zoom, 0.0001)) * 1.0;
    
    // Smooth fade
    float alpha = 1.0;
    if (vMag > maxVisibleMag) {
       float fade = vMag - maxVisibleMag;
       alpha = 1.0 - clamp(fade, 0.0, 1.0);
    }
    
    if (alpha <= 0.0) discard;

    // Circular particle
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    
    if (dist > 0.5) discard;
    
    // Space Realism: Sharp, point-like stars (Diffraction limited)
    // No soft atmospheric glow
    float strength = 1.0 - (dist * 2.0);
    strength = pow(strength, 3.0); // Very sharp falloff
    
    // Boost core brightness
    strength *= 4.0; 
    
    // No Twinkling in space!
    // Stars are steady points of light.
    
    gl_FragColor = vec4(vColor, strength * alpha);
  }
`;

export const Starfield = () => {
  const { scaleMode, showStarfield } = useStore();
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Process data once
  const geometry = useMemo(() => {
    const stars = starDataRaw as StarData[];
    const count = stars.length;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const flickerSpeeds = new Float32Array(count);
    const mags = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const star = stars[i];

      // Convert coordinates
      const { x, y, z } = sphericalToCartesian(
        star.ra,
        star.dec,
        star.parallax
      );

      // Scale up distance for visualization
      // Scale up distance for visualization
      // 1 AU = 1000 units (from astrophysics.ts)
      // 1 parsec = 206265 AU = 206265 * 1000 units = 206,265,000 units
      // We use real scale because Scene has logarithmicDepthBuffer and far=1e12
      const DISTANCE_SCALE = 206265000.0;

      // Map Astronomy Coordinates to Three.js World Coordinates
      // Astronomy: Z is North, X is Vernal Equinox
      // Three.js: Y is Up, Z is Depth, X is Right

      // We map:
      // Astro X -> Three X
      // Astro Z (North) -> Three Y (Up)
      // Astro Y -> Three -Z (Depth)

      positions[i * 3] = x * DISTANCE_SCALE;
      positions[i * 3 + 1] = z * DISTANCE_SCALE; // Z -> Y
      positions[i * 3 + 2] = -y * DISTANCE_SCALE; // Y -> -Z

      // Color
      const rgb = colorIndexToRGB(star.colorIndex || 0.6);
      colors[i * 3] = rgb.r;
      colors[i * 3 + 1] = rgb.g;
      colors[i * 3 + 2] = rgb.b;

      // Size
      // Adjust base size multiplier as needed
      let s = magnitudeToSize(star.mag);
      if (scaleMode === "didactic") s *= 1.5;
      sizes[i] = s;

      // Flicker speed (random)
      flickerSpeeds[i] = 2.0 + Math.random() * 8.0;

      // Magnitude for LOD
      mags[i] = star.mag;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute(
      "flickerSpeed",
      new THREE.BufferAttribute(flickerSpeeds, 1)
    );
    geom.setAttribute("mag", new THREE.BufferAttribute(mags, 1));

    return geom;
  }, [scaleMode]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      // Pass camera zoom to shader for LOD
      materialRef.current.uniforms.zoom.value = state.camera.zoom;
    }
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
      geometry={geometry}
      rotation={[(23.4 * Math.PI) / 180, 0, 0]}
      raycast={() => null}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          time: { value: 0 },
          pixelRatio: { value: window.devicePixelRatio },
          zoom: { value: 1.0 },
        }}
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};
