import { useRef, useMemo, useEffect } from "react";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { AstroPhysics } from "../../../lib/astrophysics";
import { useStore } from "../../../store";

function createRadialGradientTexture(size: number) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const center = size / 2;
  const gradient = ctx.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center
  );
  gradient.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  gradient.addColorStop(0.12, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(0.32, "rgba(255, 255, 255, 0.25)");
  gradient.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createStarburstTexture(size: number, rays: number) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const center = size / 2;
  const radius = size * 0.48;

  ctx.clearRect(0, 0, size, size);
  ctx.translate(center, center);

  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const w = i % 2 === 0 ? 5 : 2.5;
    const inner = radius * 0.2;
    const outer = radius;

    const grad = ctx.createLinearGradient(
      Math.cos(a) * inner,
      Math.sin(a) * inner,
      Math.cos(a) * outer,
      Math.sin(a) * outer
    );
    grad.addColorStop(0.0, "rgba(255,255,255,0.0)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.35)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.15)");
    grad.addColorStop(1.0, "rgba(255,255,255,0.0)");

    ctx.strokeStyle = grad;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export const SunScreenFlare = ({
  targetRef,
  radiusKm,
  color,
}: {
  targetRef: { current: THREE.Object3D | null };
  radiusKm: number;
  color: string;
}) => {
  const scene = useThree((s) => s.scene);
  const scaleMode = useStore((state) => state.scaleMode);

  const rootRef = useRef<THREE.Group>(null);

  const coreMatRef = useRef<THREE.SpriteMaterial>(null);
  const haloMatRef = useRef<THREE.SpriteMaterial>(null);
  const raysMatRef = useRef<THREE.SpriteMaterial>(null);

  const tmpWorld = useMemo(() => new THREE.Vector3(), []);
  const tmpNdc = useMemo(() => new THREE.Vector3(), []);
  const tmpTint = useMemo(() => new THREE.Color(), []);
  const tmpTintCore = useMemo(() => new THREE.Color(), []);
  const tmpTintHalo = useMemo(() => new THREE.Color(), []);
  const warmColor = useMemo(() => new THREE.Color("#FFD88A"), []);

  const textures = useMemo(() => {
    const radial = createRadialGradientTexture(512);
    const rays = createStarburstTexture(512, 14);
    if (!radial || !rays) return null;
    return { radial, rays };
  }, []);

  useEffect(() => {
    return () => {
      textures?.radial.dispose();
      textures?.rays.dispose();
    };
  }, [textures]);

  useFrame((state) => {
    if (!textures) return;
    if (!rootRef.current) return;
    if (!targetRef.current) return;

    if (!(state.camera instanceof THREE.PerspectiveCamera)) return;
    const cam = state.camera;

    targetRef.current.getWorldPosition(tmpWorld);

    tmpNdc.copy(tmpWorld).project(cam);
    const onScreen =
      tmpNdc.z > -1 &&
      tmpNdc.z < 1 &&
      tmpNdc.x > -1.05 &&
      tmpNdc.x < 1.05 &&
      tmpNdc.y > -1.05 &&
      tmpNdc.y < 1.05;

    const distToCamera = cam.position.distanceTo(tmpWorld);
    const fovVertRad = THREE.MathUtils.degToRad(cam.fov);
    const worldPerPixelAtSun =
      (2 * distToCamera * Math.tan(fovVertRad / 2)) /
      Math.max(1, state.size.height);

    const radiusWorld = AstroPhysics.resolveSemanticBodyRadius({
      body: {
        id: "sun-screen-flare",
        type: "star",
        name: { en: "Sun Screen Flare", pt: "Sun Screen Flare" },
        radiusKm,
        color,
        orbit: { a: 0, e: 0, i: 0, O: 0, w: 0, M0: 0, n: 0 },
        rotationPeriodHours: 0,
        axialTilt: 0,
        info: "",
      },
      scaleMode,
    });

    const radiusPx = radiusWorld / Math.max(1e-9, worldPerPixelAtSun);

    // Fade in when the Sun is only a handful of pixels.
    const appearAtPx = 12;
    const fullAtPx = 3;
    const t = THREE.MathUtils.clamp(
      (appearAtPx - radiusPx) / (appearAtPx - fullAtPx),
      0,
      1
    );
    const strength = t * t * (3 - 2 * t);

    const visible = onScreen && strength > 0.001;
    rootRef.current.visible = visible;
    if (!visible) return;

    rootRef.current.position.copy(tmpWorld);

    tmpTint.set(color).lerp(warmColor, 0.55);
    tmpTintCore.copy(tmpTint).multiplyScalar(8.0);
    tmpTintHalo.copy(tmpTint).multiplyScalar(2.6);

    const corePx = 8;
    const haloPx = 44;
    const raysPx = 64;

    const coreWorld = corePx * worldPerPixelAtSun;
    const haloWorld = haloPx * worldPerPixelAtSun;
    const raysWorld = raysPx * worldPerPixelAtSun;

    const coreMat = coreMatRef.current;
    const haloMat = haloMatRef.current;
    const raysMat = raysMatRef.current;

    if (coreMat) {
      coreMat.color.copy(tmpTintCore);
      coreMat.opacity = strength * 0.9;
    }
    if (haloMat) {
      haloMat.color.copy(tmpTintHalo);
      haloMat.opacity = strength * 0.58;
    }
    if (raysMat) {
      raysMat.color.copy(tmpTintHalo);
      raysMat.opacity = strength * 0.12;
      raysMat.rotation = state.clock.getElapsedTime() * 0.04;
    }

    const coreSprite = rootRef.current.children[0] as THREE.Sprite | undefined;
    const haloSprite = rootRef.current.children[1] as THREE.Sprite | undefined;
    const raysSprite = rootRef.current.children[2] as THREE.Sprite | undefined;
    coreSprite?.scale.set(coreWorld, coreWorld, 1);
    haloSprite?.scale.set(haloWorld, haloWorld, 1);
    raysSprite?.scale.set(raysWorld, raysWorld, 1);
  });

  if (!textures) return null;

  return createPortal(
    <group ref={rootRef} frustumCulled={false} renderOrder={5000}>
      <sprite raycast={() => null} frustumCulled={false} renderOrder={5001}>
        <spriteMaterial
          ref={coreMatRef}
          map={textures.radial}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite raycast={() => null} frustumCulled={false} renderOrder={5002}>
        <spriteMaterial
          ref={haloMatRef}
          map={textures.radial}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite raycast={() => null} frustumCulled={false} renderOrder={5003}>
        <spriteMaterial
          ref={raysMatRef}
          map={textures.rays}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>,
    scene
  );
};
