import * as THREE from "three";
import type { CelestialBody } from "../lib/astrophysics";

type SurfaceProfile = {
  base: string;
  secondary: string;
  accent: string;
  contrast: number;
  featureCount: number;
  featureSize: number;
  bandFrequency: number;
  accentStrength: number;
  polarDarkening: number;
};

const DEFAULT_PROFILE: SurfaceProfile = {
  base: "#7A7670",
  secondary: "#A39E96",
  accent: "#4F4A45",
  contrast: 0.12,
  featureCount: 5,
  featureSize: 0.18,
  bandFrequency: 1.35,
  accentStrength: 0.18,
  polarDarkening: 0.05,
};

const SURFACE_PROFILES: Record<string, Partial<SurfaceProfile>> = {
  pallas: {
    base: "#8C8578",
    secondary: "#B7B0A2",
    accent: "#625C52",
    contrast: 0.11,
    featureCount: 4,
    featureSize: 0.2,
    bandFrequency: 1.1,
    accentStrength: 0.12,
  },
  hygiea: {
    base: "#2E3235",
    secondary: "#565F61",
    accent: "#15181A",
    contrast: 0.16,
    featureCount: 4,
    featureSize: 0.24,
    bandFrequency: 0.85,
    accentStrength: 0.08,
    polarDarkening: 0.1,
  },
  quaoar: {
    base: "#74462B",
    secondary: "#9B6B4A",
    accent: "#4D2D1A",
    contrast: 0.11,
    featureCount: 4,
    featureSize: 0.19,
    bandFrequency: 1.15,
    accentStrength: 0.14,
  },
  gonggong: {
    base: "#8C1F12",
    secondary: "#C64320",
    accent: "#4D0F08",
    contrast: 0.16,
    featureCount: 5,
    featureSize: 0.2,
    bandFrequency: 0.95,
    accentStrength: 0.22,
    polarDarkening: 0.04,
  },
  orcus: {
    base: "#81868B",
    secondary: "#B6BBC0",
    accent: "#565A5F",
    contrast: 0.08,
    featureCount: 4,
    featureSize: 0.21,
    bandFrequency: 1.25,
    accentStrength: 0.08,
  },
  sedna: {
    base: "#8A2318",
    secondary: "#C43A21",
    accent: "#541109",
    contrast: 0.16,
    featureCount: 5,
    featureSize: 0.19,
    bandFrequency: 1.0,
    accentStrength: 0.2,
  },
  salacia: {
    base: "#555B60",
    secondary: "#757C83",
    accent: "#30353A",
    contrast: 0.1,
    featureCount: 4,
    featureSize: 0.22,
    bandFrequency: 0.9,
    accentStrength: 0.1,
    polarDarkening: 0.08,
  },
  vanth: {
    base: "#6C7073",
    secondary: "#8E9498",
    accent: "#3C4045",
    contrast: 0.1,
    featureCount: 4,
    featureSize: 0.2,
    bandFrequency: 1.1,
    accentStrength: 0.1,
  },
  weywot: {
    base: "#7B4F31",
    secondary: "#A86C42",
    accent: "#442614",
    contrast: 0.14,
    featureCount: 4,
    featureSize: 0.18,
    bandFrequency: 1.2,
    accentStrength: 0.15,
  },
};

const TAU = Math.PI * 2;

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => () => {
  let state = (seed += 0x6d2b79f5);
  state = Math.imul(state ^ (state >>> 15), state | 1);
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
};

const wrapDistance = (a: number, b: number) => {
  const delta = Math.abs(a - b);
  return Math.min(delta, 1 - delta);
};

const getSurfaceProfile = (body: CelestialBody): SurfaceProfile => {
  return {
    ...DEFAULT_PROFILE,
    ...SURFACE_PROFILES[body.id],
  };
};

const createFeatureSet = (
  body: CelestialBody,
  profile: SurfaceProfile
): Array<{
  x: number;
  y: number;
  amplitude: number;
  width: number;
  height: number;
}> => {
  const random = mulberry32(hashString(body.id));

  return Array.from({ length: profile.featureCount }, () => ({
    x: random(),
    y: random() * 1.6 - 0.8,
    amplitude: (random() * 2 - 1) * profile.contrast,
    width: profile.featureSize * (0.7 + random() * 0.8),
    height: profile.featureSize * 0.6 * (0.7 + random() * 0.8),
  }));
};

export const shouldRenderDirectSurfaceMap = (body: CelestialBody) => {
  return body.id !== "hygiea";
};

export const createProceduralSurfaceTexture = (
  body: CelestialBody,
  width = 512,
  height = 256
): THREE.CanvasTexture | null => {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(width, height);
  const profile = getSurfaceProfile(body);
  const features = createFeatureSet(body, profile);

  const base = new THREE.Color(profile.base);
  const secondary = new THREE.Color(profile.secondary);
  const accent = new THREE.Color(profile.accent);

  const bodySeed = hashString(`${body.id}:${body.color}`);
  const phaseA = (bodySeed % 1024) / 1024;
  const phaseB = ((bodySeed >>> 10) % 1024) / 1024;

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const latitude = v * 2 - 1;

    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const longitude = u * TAU;

      const waveA =
        Math.sin(longitude * profile.bandFrequency + phaseA * TAU) *
        Math.cos(latitude * Math.PI * 0.85 + phaseB * TAU);
      const waveB =
        Math.cos(longitude * (profile.bandFrequency * 0.5 + 0.65) - phaseB) *
        Math.sin(latitude * Math.PI * 1.4 - phaseA);

      let field = 0.5 + waveA * 0.12 + waveB * 0.08;

      for (const feature of features) {
        const dx = wrapDistance(u, feature.x);
        const dy = latitude - feature.y;
        const gaussian = Math.exp(
          -(
            (dx * dx) / (feature.width * feature.width) +
            (dy * dy) / (feature.height * feature.height)
          )
        );
        field += gaussian * feature.amplitude;
      }

      field -= Math.pow(Math.abs(latitude), 1.8) * profile.polarDarkening;
      field = THREE.MathUtils.clamp(field, 0, 1);

      const mixSecondary = THREE.MathUtils.clamp(0.2 + field * 0.8, 0, 1);
      const mixAccent = THREE.MathUtils.clamp(
        (0.55 - field) * profile.accentStrength * 3,
        0,
        1
      );
      const lightness = 0.84 + field * 0.32;

      const red =
        THREE.MathUtils.clamp(
          (base.r * (1 - mixSecondary) +
            secondary.r * mixSecondary * (1 - mixAccent) +
            accent.r * mixAccent) *
            lightness,
          0,
          1
        ) * 255;
      const green =
        THREE.MathUtils.clamp(
          (base.g * (1 - mixSecondary) +
            secondary.g * mixSecondary * (1 - mixAccent) +
            accent.g * mixAccent) *
            lightness,
          0,
          1
        ) * 255;
      const blue =
        THREE.MathUtils.clamp(
          (base.b * (1 - mixSecondary) +
            secondary.b * mixSecondary * (1 - mixAccent) +
            accent.b * mixAccent) *
            lightness,
          0,
          1
        ) * 255;

      const index = (y * width + x) * 4;
      image.data[index] = red;
      image.data[index + 1] = green;
      image.data[index + 2] = blue;
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
};
