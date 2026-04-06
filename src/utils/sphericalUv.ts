import * as THREE from "three";

export function ensureSphericalUvProjection(
  geometry: THREE.BufferGeometry
): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  if (!(position instanceof THREE.BufferAttribute) || position.itemSize < 3) {
    return geometry;
  }

  const existingUv = geometry.getAttribute("uv");
  if (
    !(existingUv instanceof THREE.BufferAttribute) ||
    existingUv.count !== position.count
  ) {
    const bounds = new THREE.Box3().setFromBufferAttribute(position);
    const center = bounds.getCenter(new THREE.Vector3());
    const point = new THREE.Vector3();
    const uvs = new Float32Array(position.count * 2);

    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index).sub(center);

      if (point.lengthSq() === 0) {
        uvs[index * 2] = 0.5;
        uvs[index * 2 + 1] = 0.5;
        continue;
      }

      point.normalize();

      let u = 0.5 + Math.atan2(point.z, point.x) / (Math.PI * 2);
      if (u < 0) u += 1;
      if (u > 1) u -= 1;

      const v =
        0.5 - Math.asin(THREE.MathUtils.clamp(point.y, -1, 1)) / Math.PI;

      uvs[index * 2] = u;
      uvs[index * 2 + 1] = v;
    }

    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  }

  const normal = geometry.getAttribute("normal");
  if (
    !(normal instanceof THREE.BufferAttribute) ||
    normal.count !== position.count
  ) {
    geometry.computeVertexNormals();
  }

  return geometry;
}
