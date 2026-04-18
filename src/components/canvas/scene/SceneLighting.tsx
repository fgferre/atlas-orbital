import { type RefObject } from "react";
import * as THREE from "three";
import { SmartSunLight } from "../SmartSunLight";

interface SceneLightingProps {
  ambientLightRef: RefObject<THREE.AmbientLight | null>;
  sunLightRef: RefObject<THREE.PointLight | null>;
  smartSunLightRef: RefObject<THREE.DirectionalLight | null>;
  shadowMapSize: number;
}

export const SceneLighting = ({
  ambientLightRef,
  sunLightRef,
  smartSunLightRef,
  shadowMapSize,
}: SceneLightingProps) => {
  return (
    <>
      <ambientLight ref={ambientLightRef} />

      {/*
        Central Sun Light (Omnidirectional)
        - Provides lighting for the whole system
        - Does NOT cast shadows (too expensive/low res)
      */}
      <pointLight ref={sunLightRef} position={[0, 0, 0]} decay={0} />

      {/*
        Smart Sun Light (Directional)
        - Casts high-quality shadows for the focused object
      */}
      <SmartSunLight ref={smartSunLightRef} shadowMapSize={shadowMapSize} />
    </>
  );
};
