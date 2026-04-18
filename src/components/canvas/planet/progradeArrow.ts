import * as THREE from "three";

export const PROGRADE_ARROW_BASE_WIDTH = 0.68;
export const PROGRADE_ARROW_BASE_LENGTH = 1.0;
export const PROGRADE_ARROW_BASE_DEPTH = 0.06;

export const PROGRADE_ARROW_SHAPE = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.18, 0.0);
  s.lineTo(-0.18, 0.62);
  s.lineTo(-0.34, 0.62);
  s.lineTo(0.0, 1.0);
  s.lineTo(0.34, 0.62);
  s.lineTo(0.18, 0.62);
  s.lineTo(0.18, 0.0);
  s.lineTo(-0.18, 0.0);
  return s;
})();

export const PROGRADE_ARROW_EXTRUDE_SETTINGS: THREE.ExtrudeGeometryOptions = {
  depth: PROGRADE_ARROW_BASE_DEPTH,
  bevelEnabled: true,
  bevelThickness: 0.012,
  bevelSize: 0.012,
  bevelSegments: 2,
  curveSegments: 6,
  steps: 1,
};
