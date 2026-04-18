import { forwardRef } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import type { Line2 } from "three-stdlib";

interface PlanetOrbitLineProps {
  points: THREE.Vector3[];
  color: string;
  isFocused: boolean;
  orbitSalience: number;
}

export const PlanetOrbitLine = forwardRef<Line2, PlanetOrbitLineProps>(
  function PlanetOrbitLine({ points, color, isFocused, orbitSalience }, ref) {
    return (
      <Line
        ref={ref}
        points={points}
        color={color}
        lineWidth={isFocused ? 2.5 : 1.5} // Emphasize focused orbit
        transparent
        opacity={0.3 * orbitSalience}
        depthTest={true}
        depthWrite={false}
        raycast={() => null}
      />
    );
  }
);
