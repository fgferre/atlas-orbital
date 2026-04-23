import { forwardRef, useRef } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import type { Line2, LineSegments2 } from "three-stdlib";

import { useGaiaSdfLinePatch } from "./useGaiaSdfLinePatch";

interface PlanetOrbitLineProps {
  points: THREE.Vector3[];
  color: string;
  isFocused: boolean;
  orbitSalience: number;
}

type LineLike = Line2 | LineSegments2;

export const PlanetOrbitLine = forwardRef<Line2, PlanetOrbitLineProps>(
  function PlanetOrbitLine({ points, color, isFocused, orbitSalience }, ref) {
    // Local ref mirrors the forwarded ref so the Gaia SDF line patch
    // can access the material after drei mounts the Line2. T4.6 port
    // of `/tmp/gaiasky/assets/shader/line.quad.cpu.fragment.glsl`.
    // drei's Line can emit Line2 or LineSegments2 depending on props;
    // the SDF hook handles both via a union type.
    const localRef = useRef<LineLike | null>(null);
    useGaiaSdfLinePatch(localRef);

    return (
      <Line
        ref={(instance: LineLike | null) => {
          localRef.current = instance;
          if (typeof ref === "function") {
            ref(instance as Line2);
          } else if (ref) {
            ref.current = instance as Line2;
          }
        }}
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
