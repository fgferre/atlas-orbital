import * as THREE from "three";
import { useMemo } from "react";
import { useStore } from "../../store";
import starData from "../../data/starfield.json";

export const Starfield = () => {
  const { scaleMode, showStarfield } = useStore();

  // Data is imported directly
  const stars = starData;

  // Build geometry for points
  const { geometry, material } = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];

    stars.forEach(
      (star: {
        x: number;
        y: number;
        z: number;
        mag: number;
        color: string;
      }) => {
        positions.push(star.x, star.y, star.z);
        const col = new THREE.Color(star.color);

        // Adjust brightness based on magnitude
        // Lower magnitude = brighter. Sun is -26, Sirius -1.46, dimmest visible ~6.
        // We map mag -1.5 (bright) to intensity 1.0, and mag 6.5 (dim) to intensity 0.1
        const intensity = Math.max(0.1, 1.0 - (star.mag + 1.5) / 8.0);
        col.multiplyScalar(intensity);
        colors.push(col.r, col.g, col.b);

        // Calculate size based on magnitude
        // Brighter stars (lower mag) get larger sizes
        // Base size 1.5, max size ~6 for very bright stars (crisper look)
        let s = Math.max(1.5, (6.5 - star.mag) * 0.8);
        if (scaleMode === "didactic") s *= 1.5;
        sizes.push(s);
      }
    );

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geom.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        pixelRatio: { value: window.devicePixelRatio },
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float pixelRatio;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // Fixed pixel size (no attenuation) for background stars
          gl_PointSize = size * pixelRatio; 
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          // Circular particle
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if(dist > 0.5) discard;
          
          // Soft edge with hot center
          float strength = 1.0 - (dist * 2.0);
          strength = pow(strength, 2.0);

          gl_FragColor = vec4(vColor, strength); 
        }
      `,
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return { geometry: geom, material: mat };
  }, [stars, scaleMode]);

  if (!showStarfield) return null;

  return <points geometry={geometry} material={material} />;
};
