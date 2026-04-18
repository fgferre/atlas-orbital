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
import { useFrame } from "@react-three/fiber";
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
import { useStarfieldParticleSize } from "./useStarfieldParticleSize";
import { useStore } from "../../store";
import { useQualityProfile } from "../../hooks/useQualityProfile";

interface NASAStarfieldProps {
  /** Base particle size multiplier (default: 1.0) */
  particleSize?: number;
}

export const NASAStarfield = ({ particleSize = 1.0 }: NASAStarfieldProps) => {
  const pointsRef = useRef<THREE.Points>(null);
  const qualityMode = useStore((state) => state.qualityMode);
  const qualityProfile = useQualityProfile(qualityMode);
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

  // Build the ShaderMaterial once. See Starfield.tsx + tasks/lessons.md
  // L15: passing `<shaderMaterial uniforms={{...}}>` as a JSX child
  // rebuilds the uniforms object on every render; R3F reconciliation
  // then replaces the map the compiled WebGLProgram was bound to and
  // per-frame mutations land on an orphan object the GPU no longer
  // reads. Keeping the material reference stable and mutating uniforms
  // through it is the intended path.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: nasaStarVertexShader,
        fragmentShader: nasaStarFragmentShader,
        uniforms: {
          particleSize: { value: particleSize },
          // R1 #1B seed: 1.0 = identity. Overwritten every frame below
          // from the current tier's `qualityProfile.vfxHdrGain`.
          vfxHdrGain: { value: 1.0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    // particleSize is a prop default (1.0) — the useFrame below owns the
    // authoritative value each frame. No dep needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const getViewportScale = useStarfieldParticleSize();

  // NO camera-following — allows zoom out to see starfield from outside
  // (like the original NASA Eyes app screenshots show). `getViewportScale`
  // is invoked per-frame so a DPR change driven by `<Canvas dpr>` lands
  // immediately without waiting for an unrelated rerender.
  //
  // `vfxHdrGain` is mutated through the memoised material's uniforms
  // map (L15 literal — the JSX-child `<shaderMaterial uniforms={...}>`
  // pattern silently drops per-frame writes because R3F replaces the
  // map the compiled WebGLProgram was bound to).
  useFrame(() => {
    material.uniforms.particleSize.value = particleSize * getViewportScale();
    material.uniforms.vfxHdrGain.value = qualityProfile.vfxHdrGain;
  });

  if (!geometry) {
    return null;
  }

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      raycast={() => null}
      renderOrder={-2}
    />
  );
};
