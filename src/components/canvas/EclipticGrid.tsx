import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { VISUAL_PRESETS } from "../../config/visualPresets";
import { useStore } from "../../store";

type GridShaderMaterial = THREE.ShaderMaterial & {
  uniforms: THREE.ShaderMaterial["uniforms"] & {
    uOpacity: { value: number };
  };
};

interface GridLabel {
  sprite: THREE.Sprite;
  aspect: number;
}

interface GridObjects {
  group: THREE.Group;
  material: GridShaderMaterial;
  labels: GridLabel[];
}

const noopRaycast: THREE.Object3D["raycast"] = () => null;

const createGridObjects = (): GridObjects => {
  const group = new THREE.Group();

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

          float tickXPos = line1D(coord.x - d, uTickWidthPx) * segmentMask(coord.y, uTickSize);
          float tickXNeg = line1D(coord.x + d, uTickWidthPx) * segmentMask(coord.y, uTickSize);
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

        float baseAlpha = minor * minorStrength + major * majorStrength;
        float alpha = (baseAlpha + axis * axisStrength + tick * tickStrength) * radial * uOpacity;
        if (alpha <= 0.001) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  }) as GridShaderMaterial;

  Object.defineProperty(gridPlaneMaterial.extensions, "derivatives", {
    value: true,
    configurable: true,
    enumerable: true,
    writable: true,
  });
  gridPlaneMaterial.toneMapped = false;

  const gridPlane = new THREE.Mesh(gridPlaneGeometry, gridPlaneMaterial);
  gridPlane.raycast = noopRaycast;
  gridPlane.rotation.x = -Math.PI / 2;
  gridPlane.position.y = -0.15;
  gridPlane.renderOrder = -100;
  group.add(gridPlane);

  const makeLabel = (text: string): GridLabel | null => {
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

    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(0, 240, 255, 0.8)";
    ctx.fillText(text, x, y);

    ctx.shadowColor = "rgba(0, 240, 255, 0.55)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "rgba(0, 240, 255, 0.35)";
    ctx.fillText(text, x, y);

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0, 240, 255, 1.0)";
    ctx.fillText(text, x, y);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
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
    sprite.raycast = noopRaycast;
    sprite.renderOrder = -97;
    return {
      sprite,
      aspect: canvas.width / canvas.height,
    };
  };

  const labels: GridLabel[] = [];
  for (const au of ticksAU) {
    const d = au * 1000;

    const labelX = makeLabel(`${au} AU`);
    if (labelX) {
      labelX.sprite.position
        .copy(new THREE.Vector3(d, 0, 0))
        .add(new THREE.Vector3(0, 0, tickSize * 1.2));
      group.add(labelX.sprite);
      labels.push(labelX);
    }

    const labelZ = makeLabel(`${au} AU`);
    if (labelZ) {
      labelZ.sprite.position
        .copy(new THREE.Vector3(0, 0, d))
        .add(new THREE.Vector3(tickSize * 1.2, 0, 0));
      group.add(labelZ.sprite);
      labels.push(labelZ);
    }
  }

  return {
    group,
    material: gridPlaneMaterial,
    labels,
  };
};

export const EclipticGrid = () => {
  const { camera } = useThree();
  const visualPreset = useStore((state) => state.visualPreset);
  const guideIntensity = VISUAL_PRESETS[visualPreset]?.guideIntensity ?? 1;
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const gridObjects = useMemo(() => createGridObjects(), []);
  const materialRef = useRef<GridShaderMaterial>(gridObjects.material);
  const labelsRef = useRef<GridLabel[]>(gridObjects.labels);

  useFrame((state) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const dist = camera.position.length();

    const fadeStart = 10000;
    const fadeEnd = 140000;
    const t = THREE.MathUtils.clamp(
      (dist - fadeStart) / (fadeEnd - fadeStart),
      0,
      1
    );
    const opacityBase = THREE.MathUtils.lerp(0.32, 0, t) * guideIntensity;
    materialRef.current.uniforms.uOpacity.value = opacityBase;

    const fovVertRad = THREE.MathUtils.degToRad(camera.fov);
    const planeDist = Math.abs(camera.position.y + 0.15);
    const hideForClutter =
      opacityBase < 0.045 || (planeDist < 700 && dist < 3500);

    for (const { sprite, aspect } of labelsRef.current) {
      const heightPx = 15;
      const distanceToLabel = camera.position.distanceTo(
        sprite.getWorldPosition(tmp)
      );
      const worldPerPixel =
        (2 * distanceToLabel * Math.tan(fovVertRad / 2)) /
        Math.max(1, state.size.height);
      const heightWorld = THREE.MathUtils.clamp(
        heightPx * worldPerPixel,
        35,
        800
      );

      sprite.scale.set(heightWorld * aspect, heightWorld, 1);
      (sprite.material as THREE.SpriteMaterial).opacity = opacityBase * 1.1;
      sprite.visible = !hideForClutter;
    }
  });

  return <primitive object={gridObjects.group} />;
};
