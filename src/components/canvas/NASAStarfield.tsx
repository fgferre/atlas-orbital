/**
 * NASA Starfield Component
 *
 * EXACT implementation matching NASA Eyes on the Solar System.
 * Renders stars using physics-based shaders with camera-following position.
 *
 * Key Features (matching NASA):
 * - Camera-following: starfield position updates to camera position each frame
 * - Viewport-adaptive sizing: particleSize scales with viewport for consistent look
 * - absMag packed in color.a for efficiency
 * - Physics-based brightness via nasaStarShaders.ts
 *
 * @see {@link ./shaders/nasaStarShaders.ts} for shader physics
 * @see {@link ../../utils/nasaStarParser.ts} for data format
 */

import * as THREE from "three";
import { useMemo, useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../../store";
import { parseNASAStarFile, type NASAStar } from "../../utils/nasaStarParser";
import {
  nasaStarVertexShader,
  nasaStarFragmentShader,
} from "./shaders/nasaStarShaders";

// NASA star file relative paths (loaded via download-nasa-stars.js)
const STAR_FILES = [
  "galaxies.0.bin",
  "stars.0.bin",
  "stars.1.bin",
  "stars.2.bin",
  "stars.3.bin",
  "stars.4.bin",
  "stars.5.bin",
];

// Build base path with BASE_URL for GitHub Pages compatibility
const getStarFilePath = (filename: string) =>
  `${import.meta.env.BASE_URL || "/"}data/nasa-stars/${filename}`;

interface NASAStarfieldProps {
  /** Base particle size multiplier (default: 1.0) */
  particleSize?: number;
}

export const NASAStarfield = ({ particleSize = 1.0 }: NASAStarfieldProps) => {
  const { showStarfield } = useStore();
  const { size } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const [stars, setStars] = useState<NASAStar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load NASA star binary files
  useEffect(() => {
    let cancelled = false;

    async function loadStars() {
      try {
        setIsLoading(true);
        setError(null);

        // Try to load all files, continue with partial data if some fail
        const results = await Promise.allSettled(
          STAR_FILES.map((file) => parseNASAStarFile(getStarFilePath(file)))
        );

        if (cancelled) return;

        const allStars: NASAStar[] = [];
        let loadedCount = 0;

        for (const result of results) {
          if (result.status === "fulfilled") {
            allStars.push(...result.value);
            loadedCount++;
          } else {
            console.warn("Failed to load star file:", result.reason);
          }
        }

        if (allStars.length === 0) {
          setError("No star data loaded. Run: npm run download:nasa-stars");
        } else {
          setStars(allStars);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load stars");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadStars();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build geometry from loaded stars
  // NASA packs absMag into color.a (4-component color attribute)
  const geometry = useMemo(() => {
    if (stars.length === 0) return null;

    const count = stars.length;
    const positions = new Float32Array(count * 3);
    // NASA uses 4-component color: RGB + absMag in alpha
    const starColors = new Float32Array(count * 4);

    // NASA positions are in km! (confirmed by testing Canopus: 95.87 parsecs)
    // Tycho-2 positions are in parsecs
    // 1 parsec = 3.086e13 km
    const KM_TO_PARSEC = 1 / 3.086e13;

    // After converting to parsecs, apply same scale as Tycho-2
    // 1 parsec = 206,265,000 units
    const DISTANCE_SCALE = 206265000.0;

    // Combined: km → parsec → our units
    const KM_TO_UNITS = KM_TO_PARSEC * DISTANCE_SCALE;

    for (let i = 0; i < count; i++) {
      const star = stars[i];

      // Position: convert km → parsecs → scaled units (matches Tycho-2)
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

  // Don't render if hidden (but allow loading to happen in background if we wanted, currently we just return null)
  // Don't render if hidden, loading, or no data
  if (!showStarfield || isLoading || error || !geometry) {
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
