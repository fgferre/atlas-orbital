import * as THREE from "three";

// Atlas places the Sun at world-space (0,0,0). The ring-shadow fragment
// shader (usePlanetMaterials.ts:289-362) does a ray/plane intersect in
// OBJECT space — it uses `vPos = position`, which is untouched by any
// model transform. So `uSunPosition` must be supplied in that same
// object-space frame; leaving it at world (0,0,0) only happens to work
// when the planet's model matrix is identity. Saturn's 26.73° axial
// tilt and orbital translation both break that assumption. This helper
// produces the correct object-space sun vector per-frame.
export function sunInObjectSpace(
  meshMatrixWorld: THREE.Matrix4,
  out: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 {
  const inv = new THREE.Matrix4().copy(meshMatrixWorld).invert();
  return out.set(0, 0, 0).applyMatrix4(inv);
}

export interface RingPlaneHit {
  t: number;
  radius: number;
  hits: boolean;
}

// JS mirror of the GLSL ray/plane intersection at
// usePlanetMaterials.ts:339-358. Both `origin` and `sunLocal` must be
// in the same frame (planet object-space). Returns parameter t along
// the ray, radius on the y=0 plane, and whether the hit lands in the
// ring annulus. Exists solely to pin shader behavior in tests — the
// GLSL copy is the live path.
export function intersectRingPlane(
  origin: THREE.Vector3,
  sunLocal: THREE.Vector3,
  innerRadius: number,
  outerRadius: number
): RingPlaneHit {
  const dir = new THREE.Vector3().subVectors(sunLocal, origin).normalize();
  if (Math.abs(dir.y) < 1e-6) {
    return { t: Number.NaN, radius: Number.NaN, hits: false };
  }
  const t = -origin.y / dir.y;
  if (t <= 0) return { t, radius: Number.NaN, hits: false };
  const hitX = origin.x + t * dir.x;
  const hitZ = origin.z + t * dir.z;
  const radius = Math.hypot(hitX, hitZ);
  return { t, radius, hits: radius > innerRadius && radius < outerRadius };
}
