import { forwardRef } from "react";
import * as THREE from "three";
import {
  PROGRADE_ARROW_SHAPE,
  PROGRADE_ARROW_EXTRUDE_SETTINGS,
} from "./progradeArrow";

interface PlanetMotionOverlaysProps {
  progradeColors: {
    main: THREE.Color;
    halo: THREE.Color;
  };
}

export const PlanetMotionOverlays = forwardRef<
  THREE.Group,
  PlanetMotionOverlaysProps
>(function PlanetMotionOverlays({ progradeColors }, ref) {
  return (
    <group ref={ref} renderOrder={2000}>
      <mesh raycast={() => null}>
        <extrudeGeometry
          args={[PROGRADE_ARROW_SHAPE, PROGRADE_ARROW_EXTRUDE_SETTINGS]}
        />
        <meshBasicMaterial
          color={progradeColors.main}
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={true}
        />
      </mesh>
      <mesh scale={[1.12, 1.03, 1.55]} raycast={() => null}>
        <extrudeGeometry
          args={[PROGRADE_ARROW_SHAPE, PROGRADE_ARROW_EXTRUDE_SETTINGS]}
        />
        <meshBasicMaterial
          color={progradeColors.halo}
          transparent
          opacity={0.24}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={true}
        />
      </mesh>
    </group>
  );
});
