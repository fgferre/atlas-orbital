import * as THREE from "three";

/**
 * PrivilegedPosition - Calculates optimal camera observation positions
 * Based on NASA Eyes on the Solar System architecture
 *
 * Key concepts:
 * - Rembrandt lighting (30° offset from sun vector)
 * - Aspect ratio-aware distance
 * - Bounding sphere including rings
 */
export class PrivilegedPosition {
  // Rembrandt lighting offset (30 degrees)
  private static readonly PHASE_OFFSET = THREE.MathUtils.degToRad(30);

  // Default up vector (ecliptic north)
  private static readonly ECLIPTIC_UP = new THREE.Vector3(0, 1, 0);

  /**
   * Calculate the privileged observation position for a celestial body
   */
  static calculate(
    targetWorldPos: THREE.Vector3,
    targetRadius: number,
    camera: THREE.PerspectiveCamera,
    sunPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
    targetUpVector?: THREE.Vector3
  ): {
    position: THREE.Vector3;
    target: THREE.Vector3;
    up: THREE.Vector3;
    distance: number;
  } {
    // 1. Calculate optimal distance considering aspect ratio
    const distance = this.calculateIdealDistance(targetRadius, camera);

    // 2. Calculate camera direction based on sun position (Rembrandt lighting)
    const cameraDir = this.calculateSolarAlignedDirection(
      targetWorldPos,
      sunPosition,
      targetUpVector
    );

    // 3. Calculate final camera position
    const position = targetWorldPos
      .clone()
      .add(cameraDir.multiplyScalar(distance));

    // 4. Calculate up vector
    const up = targetUpVector?.clone().normalize() || this.ECLIPTIC_UP.clone();

    return {
      position,
      target: targetWorldPos.clone(),
      up,
      distance,
    };
  }

  /**
   * Calculate ideal distance considering both vertical and horizontal FOV
   */
  static calculateIdealDistance(
    radius: number,
    camera: THREE.PerspectiveCamera,
    margin: number = 1.2
  ): number {
    const fovVertRad = THREE.MathUtils.degToRad(camera.fov);
    const distVertical = radius / Math.sin(fovVertRad / 2);

    // Check horizontal FOV for ultrawide screens
    const fovHorizRad = 2 * Math.atan(Math.tan(fovVertRad / 2) * camera.aspect);
    const distHorizontal = radius / Math.sin(fovHorizRad / 2);

    // Use larger to ensure object fits in both dimensions
    return Math.max(distVertical, distHorizontal) * margin;
  }

  /**
   * Calculate camera direction aligned with sun for optimal lighting
   * Uses Rembrandt lighting (30° offset from sun vector)
   * Camera is positioned to see the ILLUMINATED side of the object
   */
  static calculateSolarAlignedDirection(
    targetPos: THREE.Vector3,
    sunPos: THREE.Vector3,
    targetUpVector?: THREE.Vector3
  ): THREE.Vector3 {
    // Special case: if target IS the Sun, use arbitrary direction
    if (targetPos.distanceTo(sunPos) < 0.001) {
      return new THREE.Vector3(0, 0.3, 1).normalize(); // Slight elevation
    }

    // Vector from sun to target (direction of sunlight hitting the object)
    const sunToTarget = targetPos.clone().sub(sunPos).normalize();

    // Camera should be on the OPPOSITE side to see illuminated face
    // (between Sun and target, looking at the lit side)
    const cameraDir = sunToTarget.clone().negate();

    // Use target's up vector as rotation axis, or default to ecliptic
    const rotationAxis =
      targetUpVector?.clone().normalize() || this.ECLIPTIC_UP.clone();

    // Apply Rembrandt offset (30°) to see illuminated face with some shadow
    // This creates the classic "Rembrandt triangle" lighting effect
    cameraDir.applyAxisAngle(rotationAxis, this.PHASE_OFFSET);

    return cameraDir;
  }

  /**
   * Check if camera position is occluded by another body
   * Only checks against solid sphere meshes (planets), not orbit lines
   */
  static checkOcclusion(
    cameraPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    scene: THREE.Scene,
    excludeNames: string[] = []
  ): { isOccluded: boolean; occluder?: THREE.Object3D } {
    try {
      const direction = targetPos.clone().sub(cameraPos).normalize();
      const distance = cameraPos.distanceTo(targetPos);

      const raycaster = new THREE.Raycaster(cameraPos, direction, 0, distance);

      // Get only solid meshes (planets, moons) - exclude lines, sprites, etc.
      const meshes: THREE.Mesh[] = [];
      scene.traverse((obj) => {
        // Only include actual Mesh objects with geometry (not lines, sprites, etc.)
        if (
          obj instanceof THREE.Mesh &&
          obj.geometry &&
          !excludeNames.includes(obj.name) &&
          // Exclude objects without proper geometry for raycasting
          !(
            obj.geometry instanceof THREE.BufferGeometry &&
            obj.geometry.attributes.position === undefined
          )
        ) {
          meshes.push(obj);
        }
      });

      // Only proceed if we have meshes to check
      if (meshes.length === 0) {
        return { isOccluded: false };
      }

      const intersects = raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        return {
          isOccluded: true,
          occluder: intersects[0].object,
        };
      }

      return { isOccluded: false };
    } catch {
      // If raycasting fails for any reason (e.g., Line2 objects), assume not occluded
      return { isOccluded: false };
    }
  }

  /**
   * Find an unoccluded camera position by rotating around the target
   */
  static findUnoccludedPosition(
    targetPos: THREE.Vector3,
    initialCameraPos: THREE.Vector3,
    scene: THREE.Scene,
    targetName: string,
    maxAttempts: number = 12
  ): THREE.Vector3 {
    const distance = initialCameraPos.distanceTo(targetPos);
    const toCamera = initialCameraPos.clone().sub(targetPos).normalize();

    for (let i = 0; i < maxAttempts; i++) {
      // Rotate by 30° increments
      const angle = (i * Math.PI) / 6;
      const rotatedDir = toCamera
        .clone()
        .applyAxisAngle(this.ECLIPTIC_UP, angle);
      const testPos = targetPos
        .clone()
        .add(rotatedDir.multiplyScalar(distance));

      const { isOccluded } = this.checkOcclusion(testPos, targetPos, scene, [
        targetName,
      ]);

      if (!isOccluded) {
        return testPos;
      }
    }

    // If all positions are occluded, return original
    return initialCameraPos;
  }

  /**
   * Calculate dynamic up vector that interpolates between body north and ecliptic north
   * Close to planet: use planet's pole (north = "up")
   * Far from planet: use ecliptic north (solar system "up")
   */
  static calculateDynamicUp(
    distance: number,
    radius: number,
    bodyUpVector?: THREE.Vector3
  ): THREE.Vector3 {
    const upBody =
      bodyUpVector?.clone().normalize() || this.ECLIPTIC_UP.clone();

    // If body up is same as ecliptic, no interpolation needed
    if (upBody.equals(this.ECLIPTIC_UP)) {
      return this.ECLIPTIC_UP.clone();
    }

    // Interpolation based on distance/radius ratio (logarithmic)
    // Close (< 5 radii): t = 0 (use body north)
    // Far (> 50 radii): t = 1 (use ecliptic north)
    const ratio = distance / radius;
    const t = THREE.MathUtils.clamp(
      (Math.log10(ratio) - Math.log10(5)) / (Math.log10(50) - Math.log10(5)),
      0,
      1
    );

    return new THREE.Vector3()
      .lerpVectors(upBody, this.ECLIPTIC_UP, t)
      .normalize();
  }
}
