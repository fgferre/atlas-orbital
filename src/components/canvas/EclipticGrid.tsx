import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

export const EclipticGrid = () => {
  const { camera } = useThree();

  const group = useMemo(() => {
    const g = new THREE.Group();

    // 1 AU = 1000 units. Cover ~40 AU.
    const size = 40000;
    const divisions = 40; // 1000 units per cell

    const helper = new THREE.GridHelper(
      size,
      divisions,
      0x00f0ff, // center lines
      0x1b6b75 // main grid
    );
    (helper as any).raycast = () => {};
    helper.position.y = -0.15;
    helper.renderOrder = -100;

    const helperMaterials = Array.isArray(helper.material)
      ? helper.material
      : [helper.material];
    for (const m of helperMaterials) {
      m.transparent = true;
      m.opacity = 0.3;
      m.depthWrite = false;
      m.depthTest = false;
    }

    g.add(helper);

    const axisMaterial = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    const tickMaterial = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    const axisGeomX = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-size / 2, 0, 0),
      new THREE.Vector3(size / 2, 0, 0),
    ]);
    const axisX = new THREE.Line(axisGeomX, axisMaterial);
    (axisX as any).raycast = () => {};
    axisX.renderOrder = -99;
    g.add(axisX);

    const axisGeomZ = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -size / 2),
      new THREE.Vector3(0, 0, size / 2),
    ]);
    const axisZ = new THREE.Line(axisGeomZ, axisMaterial);
    (axisZ as any).raycast = () => {};
    axisZ.renderOrder = -99;
    g.add(axisZ);

    const ticksAU = [1, 2, 5, 10, 20, 30, 40];
    const tickSize = 250;
    const tickPoints: THREE.Vector3[] = [];
    for (const au of ticksAU) {
      const d = au * 1000;

      // X axis ticks (perpendicular in Z)
      tickPoints.push(new THREE.Vector3(d, 0, -tickSize));
      tickPoints.push(new THREE.Vector3(d, 0, tickSize));

      // Z axis ticks (perpendicular in X)
      tickPoints.push(new THREE.Vector3(-tickSize, 0, d));
      tickPoints.push(new THREE.Vector3(tickSize, 0, d));

      // Mirror on negative side (tick only, no labels)
      tickPoints.push(new THREE.Vector3(-d, 0, -tickSize));
      tickPoints.push(new THREE.Vector3(-d, 0, tickSize));
      tickPoints.push(new THREE.Vector3(-tickSize, 0, -d));
      tickPoints.push(new THREE.Vector3(tickSize, 0, -d));
    }

    const tickGeom = new THREE.BufferGeometry().setFromPoints(tickPoints);
    const tickLines = new THREE.LineSegments(tickGeom, tickMaterial);
    (tickLines as any).raycast = () => {};
    tickLines.renderOrder = -98;
    g.add(tickLines);

    // Lightweight axis labels using Sprite + CanvasTexture (avoids bringing in new text libs).
    const makeLabel = (text: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "bold 24px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineWidth = 6;
      ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

      ctx.fillStyle = "rgba(0,240,255,0.95)";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;

      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });

      const sprite = new THREE.Sprite(material);
      (sprite as any).raycast = () => {};
      sprite.renderOrder = -97;
      (sprite.userData as any).aspect = canvas.width / canvas.height;
      return sprite;
    };

    const labels: Array<{ sprite: THREE.Sprite; basePos: THREE.Vector3 }> = [];
    for (const au of ticksAU) {
      const d = au * 1000;
      const labelX = makeLabel(`${au} AU`);
      if (labelX) {
        const pos = new THREE.Vector3(d, 0, 0);
        labelX.position.copy(pos).add(new THREE.Vector3(0, 0, tickSize * 1.2));
        g.add(labelX);
        labels.push({ sprite: labelX, basePos: labelX.position.clone() });
      }

      const labelZ = makeLabel(`${au} AU`);
      if (labelZ) {
        const pos = new THREE.Vector3(0, 0, d);
        labelZ.position.copy(pos).add(new THREE.Vector3(tickSize * 1.2, 0, 0));
        g.add(labelZ);
        labels.push({ sprite: labelZ, basePos: labelZ.position.clone() });
      }
    }

    (g.userData as any).materials = [
      ...helperMaterials,
      axisMaterial,
      tickMaterial,
      ...labels.map((l) => l.sprite.material as THREE.SpriteMaterial),
    ];
    (g.userData as any).labels = labels;

    return g;
  }, []);

  useFrame((state) => {
    const dist = camera.position.length();

    // Fade out when very far (e.g., intro deep-space camera).
    const fadeStart = 10000;
    const fadeEnd = 140000;
    const t = THREE.MathUtils.clamp(
      (dist - fadeStart) / (fadeEnd - fadeStart),
      0,
      1
    );
    const opacity = THREE.MathUtils.lerp(0.32, 0, t);

    const materials = (group.userData as any).materials as THREE.Material[];
    for (const m of materials) {
      (m as any).opacity = opacity;
    }

    // Keep label size roughly constant in screen-space.
    const cam = camera as THREE.PerspectiveCamera;
    const fovVertRad = THREE.MathUtils.degToRad(cam.fov);
    const worldPerPixel =
      (2 * dist * Math.tan(fovVertRad / 2)) / Math.max(1, state.size.height);

    const labels = (group.userData as any).labels as Array<{
      sprite: THREE.Sprite;
      basePos: THREE.Vector3;
    }>;
    for (const { sprite } of labels) {
      const aspect = (sprite.userData as any).aspect ?? 4;
      const heightPx = 14;
      const heightWorld = THREE.MathUtils.clamp(
        heightPx * worldPerPixel,
        40,
        900
      );
      sprite.scale.set(heightWorld * aspect, heightWorld, 1);
    }
  });

  return <primitive object={group} />;
};
