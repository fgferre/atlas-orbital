import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { ResolvedQualityName } from "../../lib/qualityProfile";
// import { resolveSunRenderRange } from "../../lib/sunRenderRange"; // see DISABLED note below
import {
  proceduralSunFlaresFragmentShader,
  proceduralSunFlaresVertexShader,
  proceduralSunGlowFragmentShader,
  proceduralSunGlowVertexShader,
  proceduralSunPerlinFragmentShader,
  proceduralSunPerlinVertexShader,
  proceduralSunRaysFragmentShader,
  proceduralSunRaysVertexShader,
  proceduralSunSphereFragmentShader,
  proceduralSunSphereVertexShader,
} from "./shaders/proceduralSunShaders";

type SunFXProfile = {
  cubeResolution: number;
  sphereSegments: number;
  raysLineCount: number;
  raysLineLength: number;
  flaresLineCount: number;
  flaresLineLength: number;
  cubeUpdateInterval: number;
  lowRes: boolean;
};

const SPHERE_RADIUS = 1.5;
const SURFACE_RADIUS = 1.49;
const GLOW_RING_RADIUS = SURFACE_RADIUS;

const SUN_FX_PROFILES: Record<ResolvedQualityName, SunFXProfile> = {
  ultra: {
    cubeResolution: 512,
    sphereSegments: 64,
    raysLineCount: 4095,
    raysLineLength: 8,
    flaresLineCount: 2047,
    flaresLineLength: 16,
    cubeUpdateInterval: 1,
    lowRes: false,
  },
  high: {
    cubeResolution: 512,
    sphereSegments: 64,
    raysLineCount: 4095,
    raysLineLength: 8,
    flaresLineCount: 2047,
    flaresLineLength: 16,
    cubeUpdateInterval: 1,
    lowRes: false,
  },
  balanced: {
    cubeResolution: 192,
    sphereSegments: 56,
    raysLineCount: 1024,
    raysLineLength: 4,
    flaresLineCount: 640,
    flaresLineLength: 10,
    cubeUpdateInterval: 2,
    lowRes: true,
  },
  constrained: {
    cubeResolution: 128,
    sphereSegments: 48,
    raysLineCount: 512,
    raysLineLength: 4,
    flaresLineCount: 320,
    flaresLineLength: 8,
    cubeUpdateInterval: 3,
    lowRes: true,
  },
};

/* ─── Geometry creators ─── */

const createGlowGeometry = (segments: number) => {
  const positions = new Float32Array(3 * (2 * segments));
  let offset = 0;

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.sin(angle) * GLOW_RING_RADIUS;
    const y = Math.cos(angle) * GLOW_RING_RADIUS;

    positions[offset++] = x;
    positions[offset++] = y;
    positions[offset++] = 0;

    positions[offset++] = x;
    positions[offset++] = y;
    positions[offset++] = 1;
  }

  const indices = new Uint16Array(2 * segments * 3);
  offset = 0;

  for (let i = 0; i < segments; i++) {
    const i0 = 2 * i;
    const i1 = 2 * i + 1;
    const i2 = 2 * ((i + 1) % segments);
    const i3 = i2 + 1;

    indices[offset++] = i0;
    indices[offset++] = i1;
    indices[offset++] = i2;
    indices[offset++] = i2;
    indices[offset++] = i1;
    indices[offset++] = i3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("aPos", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
};

const randomUnitVector = (target: THREE.Vector3) => {
  const z = Math.random() * 2 - 1;
  const theta = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(1 - z * z);
  target.set(radius * Math.cos(theta), radius * Math.sin(theta), z);
  return target;
};

const randomNormalizedVector = (target: THREE.Vector3) => {
  target.set(
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    Math.random() * 2 - 1
  );

  if (target.lengthSq() < 1e-6) {
    target.set(1, 0, 0);
  }

  return target.normalize();
};

const createSunRaysGeometry = (lineCount: number, lineLength: number) => {
  const vertsPerSegment = 2;
  const totalVerts = lineCount * lineLength * vertsPerSegment;
  const aPos = new Float32Array(totalVerts * 3);
  const aPos0 = new Float32Array(totalVerts * 3);
  const aWireRandom = new Float32Array(totalVerts * 4);
  const indices = new Uint16Array(lineCount * (lineLength - 1) * 2 * 3);

  const base = new THREE.Vector3();
  const jitter = new THREE.Vector3();
  const held = new THREE.Vector3();

  let posOffset = 0;
  let baseOffset = 0;
  let randomOffset = 0;
  let indexOffset = 0;

  let d = Math.random();
  let p = Math.random();

  for (let line = 0; line < lineCount; line++) {
    if (Math.random() < 0.1 || line === 0) {
      randomUnitVector(held).normalize();
      d = Math.random();
      p = Math.random();
    }

    base.copy(held);
    randomUnitVector(jitter).multiplyScalar(0.025);
    base.add(jitter).normalize();
    const rands = [d, p, Math.random(), Math.random()];

    for (let segment = 0; segment < lineLength; segment++) {
      const vertexBase = 2 * (line * lineLength + segment);

      for (let side = 0; side <= 1; side++) {
        aPos[posOffset++] = (segment + 0.5) / lineLength;
        aPos[posOffset++] = (line + 0.5) / lineCount;
        aPos[posOffset++] = 2 * side - 1;

        for (let i = 0; i < 4; i++) {
          aWireRandom[randomOffset++] = rands[i];
        }

        aPos0[baseOffset++] = base.x * SURFACE_RADIUS;
        aPos0[baseOffset++] = base.y * SURFACE_RADIUS;
        aPos0[baseOffset++] = base.z * SURFACE_RADIUS;
      }

      if (segment < lineLength - 1) {
        const a = vertexBase;
        const b = vertexBase + 1;
        const c = vertexBase + 2;
        const d2 = vertexBase + 3;

        indices[indexOffset++] = a;
        indices[indexOffset++] = b;
        indices[indexOffset++] = c;
        indices[indexOffset++] = c;
        indices[indexOffset++] = b;
        indices[indexOffset++] = d2;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("aPos", new THREE.BufferAttribute(aPos, 3));
  geometry.setAttribute("aPos0", new THREE.BufferAttribute(aPos0, 3));
  geometry.setAttribute(
    "aWireRandom",
    new THREE.BufferAttribute(aWireRandom, 4)
  );
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
};

const createSunFlaresGeometry = (lineCount: number, lineLength: number) => {
  const totalVerts = lineCount * lineLength * 2;
  const aPos = new Float32Array(totalVerts * 3);
  const aPos0 = new Float32Array(totalVerts * 3);
  const aPos1 = new Float32Array(totalVerts * 3);
  const aWireRandom = new Float32Array(totalVerts * 4);
  const indices = new Uint16Array(lineCount * (lineLength - 1) * 2 * 3);

  const held = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const jitter = new THREE.Vector3();

  let posOffset = 0;
  let startOffset = 0;
  let endOffset = 0;
  let randomOffset = 0;
  let indexOffset = 0;

  let m = Math.random();
  let p = Math.random();

  for (let line = 0; line < lineCount; line++) {
    if (Math.random() < 0.025 || line === 0) {
      randomNormalizedVector(direction);
      held.copy(direction);
      randomNormalizedVector(jitter).multiplyScalar(0.4);
      held.add(jitter).normalize();
      m = Math.random();
      p = Math.random();
    }

    start.copy(direction);
    randomNormalizedVector(jitter).multiplyScalar(0.02);
    start.add(jitter).normalize();

    end.copy(held);
    randomNormalizedVector(jitter).multiplyScalar(0.075);
    end.add(jitter).normalize();

    const rands = [m, p, Math.random(), Math.random()];

    for (let segment = 0; segment < lineLength; segment++) {
      const base = 2 * (line * lineLength + segment);

      for (let side = 0; side <= 1; side++) {
        aPos[posOffset++] = (segment + 0.5) / lineLength;
        aPos[posOffset++] = (line + 0.5) / lineCount;
        aPos[posOffset++] = 2 * side - 1;

        for (let i = 0; i < 4; i++) {
          aWireRandom[randomOffset++] = rands[i];
        }

        aPos0[startOffset++] = start.x * SURFACE_RADIUS;
        aPos0[startOffset++] = start.y * SURFACE_RADIUS;
        aPos0[startOffset++] = start.z * SURFACE_RADIUS;

        aPos1[endOffset++] = end.x * SURFACE_RADIUS;
        aPos1[endOffset++] = end.y * SURFACE_RADIUS;
        aPos1[endOffset++] = end.z * SURFACE_RADIUS;
      }

      if (segment < lineLength - 1) {
        indices[indexOffset++] = base;
        indices[indexOffset++] = base + 1;
        indices[indexOffset++] = base + 2;
        indices[indexOffset++] = base + 2;
        indices[indexOffset++] = base + 1;
        indices[indexOffset++] = base + 3;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("aPos", new THREE.BufferAttribute(aPos, 3));
  geometry.setAttribute("aPos0", new THREE.BufferAttribute(aPos0, 3));
  geometry.setAttribute("aPos1", new THREE.BufferAttribute(aPos1, 3));
  geometry.setAttribute(
    "aWireRandom",
    new THREE.BufferAttribute(aWireRandom, 4)
  );
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
};

/* ─── Component ─── */

interface ProceduralSun3DProps {
  qualityProfileName: ResolvedQualityName;
  sunVisualRadiusWorld: number;
}

export const ProceduralSun3D = ({
  qualityProfileName,
  sunVisualRadiusWorld,
}: ProceduralSun3DProps) => {
  const { gl } = useThree();
  const profile = SUN_FX_PROFILES[qualityProfileName];
  const groupRef = useRef<THREE.Group>(null);

  const lightDirWorld = useMemo(
    () => new THREE.Vector3(1, 1, 1).normalize(),
    []
  );

  const cameraUpRef = useRef(new THREE.Vector3());
  const frameCountRef = useRef(0);

  const sphereGeometry = useMemo(
    () =>
      new THREE.SphereGeometry(
        SPHERE_RADIUS,
        profile.sphereSegments,
        profile.sphereSegments
      ),
    [profile.sphereSegments]
  );
  const glowGeometry = useMemo(() => createGlowGeometry(134), []);
  const raysGeometry = useMemo(
    () => createSunRaysGeometry(profile.raysLineCount, profile.raysLineLength),
    [profile.raysLineCount, profile.raysLineLength]
  );
  const flaresGeometry = useMemo(
    () =>
      createSunFlaresGeometry(
        profile.flaresLineCount,
        profile.flaresLineLength
      ),
    [profile.flaresLineCount, profile.flaresLineLength]
  );

  const perlinResources = useMemo(() => {
    const scene = new THREE.Scene();
    const renderTarget = new THREE.WebGLCubeRenderTarget(
      profile.cubeResolution,
      {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        generateMipmaps: false,
      }
    );
    const cubeCamera = new THREE.CubeCamera(0.1, 100, renderTarget);
    const material = new THREE.ShaderMaterial({
      vertexShader: proceduralSunPerlinVertexShader,
      fragmentShader: proceduralSunPerlinFragmentShader,
      depthWrite: false,
      side: THREE.BackSide,
      uniforms: {
        uTime: { value: 0 },
        uSpatialFrequency: { value: 6 },
        uTemporalFrequency: { value: 0.1 },
        uH: { value: 1 },
        uContrast: { value: 0.25 },
        uFlatten: { value: 0.72 },
      },
      toneMapped: false,
    });
    const geometry = new THREE.BoxGeometry(2, 2, 2, 1, 1, 1);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    return { scene, renderTarget, cubeCamera, material, geometry };
  }, [profile.cubeResolution]);

  const sunMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: proceduralSunSphereVertexShader,
        fragmentShader: proceduralSunSphereFragmentShader,
        transparent: true,
        premultipliedAlpha: true,
        blending: THREE.NormalBlending,
        depthWrite: true,
        uniforms: {
          uTime: { value: 0 },
          uPerlinCube: { value: perlinResources.renderTarget.texture },
          uFresnelPower: { value: 1 },
          uFresnelInfluence: { value: 0.8 },
          uTint: { value: 0.2 },
          uBase: { value: 4 },
          uBrightnessOffset: { value: 1 },
          uBrightness: { value: 0.6 },
          uVisibility: { value: 1 },
          uDirection: { value: 1 },
          uLightView: { value: lightDirWorld.clone() },
        },
        toneMapped: false,
      }),
    [lightDirWorld, perlinResources.renderTarget.texture]
  );

  const glowMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: proceduralSunGlowVertexShader,
        fragmentShader: proceduralSunGlowFragmentShader,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uRadius: { value: 0.4 },
          uTint: { value: 0.4 },
          uBrightness: { value: 1.06 },
          uFalloffColor: { value: 0.5 },
          uCamUp: { value: new THREE.Vector3(0, 1, 0) },
          uVisibility: { value: 1 },
          uDirection: { value: 1 },
          uLightView: { value: lightDirWorld.clone() },
        },
        toneMapped: false,
      }),
    [lightDirWorld]
  );

  const raysMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: proceduralSunRaysVertexShader,
        fragmentShader: proceduralSunRaysFragmentShader,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uVisibility: { value: 1 },
          uDirection: { value: 1 },
          uLightView: { value: lightDirWorld.clone() },
          uWidth: { value: profile.lowRes ? 0.05 : 0.03 },
          uLength: { value: 0.45 },
          uOpacity: { value: profile.lowRes ? 0.05 : 0.03 },
          uNoiseFrequency: { value: 8 },
          uNoiseAmplitude: { value: 0.4 },
          uAlphaBlended: { value: 0.3 },
          uHueSpread: { value: 0.2 },
          uHue: { value: 0.2 },
        },
        toneMapped: false,
      }),
    [lightDirWorld, profile.lowRes]
  );

  const flaresMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: proceduralSunFlaresVertexShader,
        fragmentShader: proceduralSunFlaresFragmentShader,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uVisibility: { value: 1 },
          uDirection: { value: 1 },
          uLightView: { value: lightDirWorld.clone() },
          uWidth: { value: profile.lowRes ? 0.01 : 0.005 },
          uAmp: { value: 0.5 },
          uOpacity: { value: profile.lowRes ? 3 : 0.2 },
          uAlphaBlended: { value: 0.65 },
          uHueSpread: { value: 0.16 },
          uHue: { value: 0 },
          uNoiseFrequency: { value: 4 },
          uNoiseAmplitude: { value: 0.2 },
        },
        toneMapped: false,
      }),
    [lightDirWorld, profile.lowRes]
  );
  const perlinResourcesRef = useRef(perlinResources);
  const sunMaterialRef = useRef(sunMaterial);
  const glowMaterialRef = useRef(glowMaterial);
  const raysMaterialRef = useRef(raysMaterial);
  const flaresMaterialRef = useRef(flaresMaterial);

  useEffect(() => {
    perlinResourcesRef.current = perlinResources;
    sunMaterialRef.current = sunMaterial;
    glowMaterialRef.current = glowMaterial;
    raysMaterialRef.current = raysMaterial;
    flaresMaterialRef.current = flaresMaterial;
  }, [
    flaresMaterial,
    glowMaterial,
    perlinResources,
    raysMaterial,
    sunMaterial,
  ]);

  useEffect(() => {
    return () => {
      sphereGeometry.dispose();
      glowGeometry.dispose();
      raysGeometry.dispose();
      flaresGeometry.dispose();
      perlinResources.geometry.dispose();
      perlinResources.material.dispose();
      perlinResources.renderTarget.dispose();
      sunMaterial.dispose();
      glowMaterial.dispose();
      raysMaterial.dispose();
      flaresMaterial.dispose();
    };
  }, [
    flaresGeometry,
    flaresMaterial,
    glowGeometry,
    glowMaterial,
    perlinResources,
    raysGeometry,
    raysMaterial,
    sphereGeometry,
    sunMaterial,
  ]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    frameCountRef.current += 1;

    const group = groupRef.current;
    if (!group) return;

    // T4.9a' visibility gate — TEMPORARILY DISABLED 2026-04-23 as
    // part of the white-canvas boot bisect. Restoring the original
    // pre-T4.9a' behaviour (always visible, always update perlin
    // cubemap) to confirm whether this gate is contributing to the
    // Context Lost. SunBillboard mount is also disabled in
    // Scene.tsx for the same bisect.
    // const camDistance = state.camera.position.length();
    // const isClose = resolveSunRenderRange(camDistance) === "close";
    // group.visible = isClose;
    // if (!isClose) return;

    const perlinResources = perlinResourcesRef.current;
    const sunMaterial = sunMaterialRef.current;
    const glowMaterial = glowMaterialRef.current;
    const raysMaterial = raysMaterialRef.current;
    const flaresMaterial = flaresMaterialRef.current;

    // Scale the group so normalized geometry (radius=1.5) maps to world size
    const scale = sunVisualRadiusWorld / SPHERE_RADIUS;
    group.scale.setScalar(Math.max(scale, 0.0001));

    // Bake perlin cubemap
    perlinResources.material.uniforms.uTime.value = time * 0.1;
    if (frameCountRef.current % profile.cubeUpdateInterval === 0) {
      perlinResources.cubeCamera.update(gl, perlinResources.scene);
    }

    // Camera up vector for billboard shaders
    cameraUpRef.current
      .set(0, 1, 0)
      .applyQuaternion(state.camera.quaternion)
      .normalize();

    // Shared values
    const visibility = sunMaterial.uniforms.uVisibility.value;
    const direction = sunMaterial.uniforms.uDirection.value;

    // Sphere uniforms
    sunMaterial.uniforms.uTime.value = time * 0.04;
    sunMaterial.uniforms.uLightView.value.copy(lightDirWorld);

    // Glow uniforms
    glowMaterial.uniforms.uCamUp.value.copy(cameraUpRef.current);
    glowMaterial.uniforms.uLightView.value.copy(lightDirWorld);
    glowMaterial.uniforms.uVisibility.value = visibility;
    glowMaterial.uniforms.uDirection.value = direction;

    // Rays uniforms
    raysMaterial.uniforms.uTime.value = time;
    raysMaterial.uniforms.uLightView.value.copy(lightDirWorld);
    raysMaterial.uniforms.uVisibility.value = visibility;
    raysMaterial.uniforms.uDirection.value = direction;

    // Flares uniforms
    flaresMaterial.uniforms.uTime.value = time;
    flaresMaterial.uniforms.uLightView.value.copy(lightDirWorld);
    flaresMaterial.uniforms.uVisibility.value = visibility;
    flaresMaterial.uniforms.uDirection.value = direction;
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <mesh renderOrder={0} frustumCulled={false}>
        <primitive object={sphereGeometry} attach="geometry" />
        <primitive object={sunMaterial} attach="material" />
      </mesh>

      <mesh
        geometry={glowGeometry}
        material={glowMaterial}
        frustumCulled={false}
        renderOrder={2}
      />

      <mesh
        geometry={flaresGeometry}
        material={flaresMaterial}
        frustumCulled={false}
        renderOrder={1}
      />

      <mesh
        geometry={raysGeometry}
        material={raysMaterial}
        frustumCulled={false}
        renderOrder={3}
      />
    </group>
  );
};
