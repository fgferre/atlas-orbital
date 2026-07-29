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
        - INERT as of 2026-07-28: `SmartSunLight.tsx:74` puts this light on
          layer 1 (`layers.set`), and the render camera never leaves layer 0.
          three collects lights, and shadow casters, only when
          `object.layers.test(camera.layers)` passes, so this contributes
          neither illumination nor shadow and allocates no shadow map.
        - The intent was per-object light targeting, which three's Layers
          cannot express: the test is against the CAMERA, not the object.
        - All visible lighting comes from the point light above.
      */}
      <SmartSunLight ref={smartSunLightRef} shadowMapSize={shadowMapSize} />
    </>
  );
};
