import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { VISUAL_PRESETS } from "../../config/visualPresets";
import { useStore } from "../../store";

export const EclipticGrid = () => {
  const { camera } = useThree();
  const visualPreset = useStore((state) => state.visualPreset);
  const guideIntensity = VISUAL_PRESETS[visualPreset]?.guideIntensity ?? 1;
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const group = useMemo(() => {
    const g = new THREE.Group();

    // 1 AU = 1000 units. Cover ~40 AU.
    const size = 40000;
    const ticksAU = [1, 2, 5, 10, 20, 30, 40];
    const tickSize = 250;
    const tickDistances = new Float32Array(8);
    for (let i = 0; i < Math.min(8, ticksAU.length); i++) {
      tickDistances[i] = ticksAU[i] * 1000;
    }
    const gridPlaneGeometry = new THREE.PlaneGeometry(size, size, 1, 1);
    const gridMinorColor = new THREE.Color(0x1b6b75).convertSRGBToLinear();
    const gridMajorColor = new THREE.Color(0x00f0ff).convertSRGBToLinear();

    const gridPlaneMaterial = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: {
        uOpacity: { value: 0.0 },
        uMinorColor: { value: gridMinorColor },
        uMajorColor: { value: gridMajorColor },
        uAxisColor: { value: gridMajorColor },
        uMinorSpacing: { value: 250.0 },
        uMajorSpacing: { value: 1000.0 },
        uMinorWidthPx: { value: 1.0 },
        uMajorWidthPx: { value: 1.6 },
        uAxisWidthPx: { value: 2.4 },
        uTickWidthPx: { value: 2.0 },
        uTickSize: { value: tickSize },
        uTickCount: { value: ticksAU.length },
        uTicks: { value: tickDistances },
        uFadeStart: { value: size * 0.33 },
        uFadeEnd: { value: size * 0.5 },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uMinorColor;
        uniform vec3 uMajorColor;
        uniform vec3 uAxisColor;
        uniform float uMinorSpacing;
        uniform float uMajorSpacing;
        uniform float uMinorWidthPx;
        uniform float uMajorWidthPx;
        uniform float uAxisWidthPx;
        uniform float uTickWidthPx;
        uniform float uTickSize;
        uniform int uTickCount;
        uniform float uTicks[8];
        uniform float uFadeStart;
        uniform float uFadeEnd;
        varying vec3 vWorldPos;

        float gridLine(vec2 coord, float spacing, float widthPx) {
          vec2 scaled = coord / spacing;
          vec2 grid = abs(fract(scaled - 0.5) - 0.5) / fwidth(scaled);
          float line = 1.0 - clamp(min(grid.x, grid.y) / widthPx, 0.0, 1.0);
          return line;
        }

        float line1D(float v, float widthPx) {
          float fw = max(1e-6, fwidth(v));
          float a = 1.0 - clamp((abs(v) / fw) / widthPx, 0.0, 1.0);
          return a;
        }

        float segmentMask(float v, float halfLen) {
          float fw = max(1e-6, fwidth(v));
          return 1.0 - smoothstep(halfLen, halfLen + fw * 2.0, abs(v));
        }

        void main() {
          vec2 coord = vWorldPos.xz;
          float dist = length(coord);

          float radial = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
          float minor = gridLine(coord, uMinorSpacing, uMinorWidthPx);
          float major = gridLine(coord, uMajorSpacing, uMajorWidthPx);

          float minorStrength = 0.28;
          float majorStrength = 0.58;

          float axisX = line1D(coord.x, uAxisWidthPx);
          float axisZ = line1D(coord.y, uAxisWidthPx);
          float axis = max(axisX, axisZ);

          float tick = 0.0;
          for (int i = 0; i < 8; i++) {
            if (i >= uTickCount) break;
            float d = uTicks[i];

            // Ticks on X axis: at x=±d, spanning z within ±uTickSize.
            float tickXPos = line1D(coord.x - d, uTickWidthPx) * segmentMask(coord.y, uTickSize);
            float tickXNeg = line1D(coord.x + d, uTickWidthPx) * segmentMask(coord.y, uTickSize);

            // Ticks on Z axis: at z=±d, spanning x within ±uTickSize.
            float tickZPos = line1D(coord.y - d, uTickWidthPx) * segmentMask(coord.x, uTickSize);
            float tickZNeg = line1D(coord.y + d, uTickWidthPx) * segmentMask(coord.x, uTickSize);

            tick = max(tick, max(max(tickXPos, tickXNeg), max(tickZPos, tickZNeg)));
          }

          float axisStrength = 0.95;
          float tickStrength = 0.8;

          vec3 baseColor =
            uMinorColor * (minor * minorStrength) +
            uMajorColor * (major * majorStrength);

          vec3 color =
            baseColor +
            uAxisColor * (axis * axisStrength) +
            uAxisColor * (tick * tickStrength);

          float baseAlpha = (minor * minorStrength + major * majorStrength);
          float alpha = (baseAlpha + axis * axisStrength + tick * tickStrength) * radial * uOpacity;
          if (alpha <= 0.001) discard;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    // three@0.181 types no longer include `extensions.derivatives` on ShaderMaterial params,
    // but the runtime property is still supported.
    (gridPlaneMaterial as any).extensions = { derivatives: true };
    gridPlaneMaterial.toneMapped = false;

    const gridPlane = new THREE.Mesh(gridPlaneGeometry, gridPlaneMaterial);
    (gridPlane as any).raycast = () => {};
    gridPlane.rotation.x = -Math.PI / 2;
    gridPlane.position.y = -0.15;
    gridPlane.renderOrder = -100;
    g.add(gridPlane);

    // Lightweight axis labels using Sprite + CanvasTexture (avoids bringing in new text libs).
    const makeLabel = (text: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "700 46px Orbitron, Rajdhani, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const x = canvas.width / 2;
      const y = canvas.height / 2;

      // Dark shadow for contrast
      ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "rgba(0, 240, 255, 0.8)";
      ctx.fillText(text, x, y);

      // Cyan halo for HUD-like glow
      ctx.shadowColor = "rgba(0, 240, 255, 0.55)";
      ctx.shadowBlur = 22;
      ctx.fillStyle = "rgba(0, 240, 255, 0.35)";
      ctx.fillText(text, x, y);

      // Final crisp pass
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0, 240, 255, 1.0)";
      ctx.fillText(text, x, y);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      (texture as any).colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
      });
      material.toneMapped = false;

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

    (g.userData as any).gridPlaneMaterial = gridPlaneMaterial;
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
    const opacityBase = THREE.MathUtils.lerp(0.32, 0, t) * guideIntensity;

    const gridPlaneMaterial = (group.userData as any).gridPlaneMaterial as
      | THREE.ShaderMaterial
      | undefined;
    if (gridPlaneMaterial?.uniforms?.uOpacity) {
      gridPlaneMaterial.uniforms.uOpacity.value = opacityBase;
    }

    // Keep label size roughly constant in screen-space.
    const cam = camera as THREE.PerspectiveCamera;
    const fovVertRad = THREE.MathUtils.degToRad(cam.fov);

    const labels = (group.userData as any).labels as Array<{
      sprite: THREE.Sprite;
      basePos: THREE.Vector3;
    }>;

    const planeDist = Math.abs(camera.position.y + 0.15);
    const hideForClutter =
      opacityBase < 0.045 || (planeDist < 700 && dist < 3500);

    for (const { sprite } of labels) {
      const aspect = (sprite.userData as any).aspect ?? 4;
      const heightPx = 15;
      const d = camera.position.distanceTo(sprite.getWorldPosition(tmp));
      const worldPerPixel =
        (2 * d * Math.tan(fovVertRad / 2)) / Math.max(1, state.size.height);
      const heightWorld = THREE.MathUtils.clamp(
        heightPx * worldPerPixel,
        35,
        800
      );
      sprite.scale.set(heightWorld * aspect, heightWorld, 1);

      const mat = sprite.material as THREE.SpriteMaterial;
      mat.opacity = opacityBase * 1.1;
      sprite.visible = !hideForClutter;
    }
  });

  return <primitive object={group} />;
};
