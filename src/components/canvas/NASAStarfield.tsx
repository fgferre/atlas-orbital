/**
 * NASA Starfield Component
 *
 * Implementation inspired by NASA Eyes on the Solar System.
 * Renders stars using the parsed NASA Eyes catalog and matching shader conventions.
 *
 * Key Features:
 * - Stable world-space rendering: the starfield remains fixed in scene space
 * - Viewport-adaptive sizing: particleSize scales with viewport for consistent look
 * - absMag packed in color.a for efficiency
 * - Physics-based brightness via nasaStarShaders.ts
 *
 * @see {@link ./shaders/nasaStarShaders.ts} for shader physics
 * @see {@link ../../utils/nasaStarParser.ts} for data format
 */

import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  getCachedNASAStarCatalog,
  loadNASAStarCatalog,
  type NASAStar,
} from "../../lib/starfield";
import {
  nasaStarVertexShader,
  nasaStarFragmentShader,
} from "./shaders/nasaStarShaders";
import { useStarfieldCatalog } from "./useStarfieldCatalog";

interface NASAStarfieldProps {
  /** Base particle size multiplier (default: 1.0) */
  particleSize?: number;
}

export const NASAStarfield = ({ particleSize = 1.0 }: NASAStarfieldProps) => {
  const { size } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const stars = useStarfieldCatalog<NASAStar[]>({
    source: "nasa",
    loadCatalog: loadNASAStarCatalog,
    getCachedCatalog: getCachedNASAStarCatalog,
  });

  // Build geometry from loaded stars
  // NASA packs absMag into color.a (4-component color attribute)
  const geometry = useMemo(() => {
    if (!stars || stars.length === 0) return null;

    const count = stars.length;
    const positions = new Float32Array(count * 3);
    // NASA uses 4-component color: RGB + absMag in alpha
    const starColors = new Float32Array(count * 4);

    // NASA positions are in km! (confirmed by testing Canopus: 95.87 parsecs)
    // The legacy HYG dataset is stored in parsecs
    // 1 parsec = 3.086e13 km
    const KM_TO_PARSEC = 1 / 3.086e13;

    // After converting to parsecs, apply the same scale as the legacy HYG dataset
    // 1 parsec = 206,265,000 units
    const DISTANCE_SCALE = 206265000.0;

    // Combined: km → parsec → our units
    const KM_TO_UNITS = KM_TO_PARSEC * DISTANCE_SCALE;

    for (let i = 0; i < count; i++) {
      const star = stars[i];

      // Position: convert km → parsecs → scaled units (matches the legacy HYG dataset)
      positions[i * 3] = star.position.x * KM_TO_UNITS;
      positions[i * 3 + 1] = star.position.y * KM_TO_UNITS;
      positions[i * 3 + 2] = star.position.z * KM_TO_UNITS;

      // Color (RGB normalized 0-1) + absMag in alpha channel
      starColors[i * 4] = star.color.r;
      starColors[i * 4 + 1] = star.color.g;
      starColors[i * 4 + 2] = star.color.b;
      starColors[i * 4 + 3] = star.absMag; // NASA's approach: pack absMag here
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    // NASA shader expects 'starColor' attribute (vec4)
    geom.setAttribute("starColor", new THREE.BufferAttribute(starColors, 4));

    return geom;
  }, [stars]);

  // Update uniforms each frame
  useFrame(() => {
    if (!materialRef.current) return;

    // NO camera-following - allows zoom out to see starfield from outside
    // (like the original NASA Eyes app screenshots show)

    // =========================================================================
    // VIEWPORT-ADAPTIVE SIZING (NASA's prepareForRender)
    // particleSize scales with viewport size for consistent appearance
    // Formula: sqrt(max(width, height) * devicePixelRatio) / 60
    // =========================================================================
    const viewportScale =
      Math.sqrt(Math.max(size.width, size.height) * window.devicePixelRatio) /
      60;

    materialRef.current.uniforms.particleSize.value =
      particleSize * viewportScale;
  });

  if (!geometry) {
    return null;
  }

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      raycast={() => null}
      renderOrder={-2}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={nasaStarVertexShader}
        fragmentShader={nasaStarFragmentShader}
        uniforms={{
          particleSize: { value: particleSize },
        }}
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};
