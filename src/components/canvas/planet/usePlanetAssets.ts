import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { type CelestialBody } from "../../../lib/astrophysics";
import { useDeferredTexture } from "../../../hooks/useDeferredTexture";
import { preloadDeferredTexture } from "../../../lib/deferredTextureCache";
import { resolveTextureRequest } from "../../../lib/textureVariants";
import { TEXTURE_VARIANT_MANIFEST } from "../../../lib/textureVariantManifest";
import type { ResolvedQualityName } from "../../../lib/qualityProfile";
import type { ResolvedSunRenderMode } from "../../../lib/sunRenderMode";
import {
  createProceduralSurfaceTexture,
  getSurfaceFillLight,
  shouldRenderDirectSurfaceMap,
} from "../../../utils/proceduralSurface";

interface UsePlanetAssetsParams {
  body: CelestialBody;
  qualityProfileName: ResolvedQualityName;
  sunRenderMode: ResolvedSunRenderMode;
  assetPriority: number;
  baseTextureSalience: number;
  focusId: string | null;
  screenSalience: number;
}

export function usePlanetAssets({
  body,
  qualityProfileName,
  sunRenderMode,
  assetPriority,
  baseTextureSalience,
  focusId,
  screenSalience,
}: UsePlanetAssetsParams) {
  const directSurfaceMapEnabled =
    Boolean(body.textures?.map) &&
    shouldRenderDirectSurfaceMap(body) &&
    !(body.id === "sun" && sunRenderMode === "procedural");
  const mapSalience = Math.max(baseTextureSalience, screenSalience);
  const shouldPinMap =
    assetPriority <= 1 || body.id === "sun" || focusId === body.id;
  const shouldLoadMap =
    body.id === "sun"
      ? sunRenderMode !== "procedural"
      : assetPriority <= 2 || mapSalience >= 0.35;
  const shouldLoadSecondary =
    assetPriority <= 1 || focusId === body.id || mapSalience >= 0.78;

  const mapRequest = useMemo(() => {
    if (!directSurfaceMapEnabled) {
      return null;
    }

    return resolveTextureRequest(
      body,
      "map",
      qualityProfileName,
      mapSalience,
      TEXTURE_VARIANT_MANIFEST
    );
  }, [body, directSurfaceMapEnabled, mapSalience, qualityProfileName]);

  const ringRequest = useMemo(
    () =>
      resolveTextureRequest(
        body,
        "ring",
        qualityProfileName,
        mapSalience,
        TEXTURE_VARIANT_MANIFEST
      ),
    [body, mapSalience, qualityProfileName]
  );

  const cloudRequest = useMemo(
    () =>
      resolveTextureRequest(
        body,
        "clouds",
        qualityProfileName,
        mapSalience,
        TEXTURE_VARIANT_MANIFEST
      ),
    [body, mapSalience, qualityProfileName]
  );

  const nightRequest = useMemo(
    () =>
      resolveTextureRequest(
        body,
        "night",
        qualityProfileName,
        mapSalience,
        TEXTURE_VARIANT_MANIFEST
      ),
    [body, mapSalience, qualityProfileName]
  );

  const normalRequest = useMemo(
    () =>
      resolveTextureRequest(
        body,
        "normal",
        qualityProfileName,
        mapSalience,
        TEXTURE_VARIANT_MANIFEST
      ),
    [body, mapSalience, qualityProfileName]
  );

  const roughnessRequest = useMemo(
    () =>
      resolveTextureRequest(
        body,
        "roughness",
        qualityProfileName,
        mapSalience,
        TEXTURE_VARIANT_MANIFEST
      ),
    [body, mapSalience, qualityProfileName]
  );

  const ringTextureLoaded = useDeferredTexture(ringRequest.selectedPath, {
    enabled: shouldLoadSecondary,
    pin: shouldPinMap,
  });
  const cloudTextureLoaded = useDeferredTexture(cloudRequest.selectedPath, {
    enabled: shouldLoadSecondary,
    pin: shouldPinMap,
  });
  const bodyTextureLoaded = useDeferredTexture(mapRequest?.selectedPath, {
    enabled: shouldLoadMap,
    pin: shouldPinMap,
  });
  const nightTextureLoaded = useDeferredTexture(nightRequest.selectedPath, {
    enabled: shouldLoadSecondary,
    pin: shouldPinMap,
  });
  // Normal + roughness share the "secondary" gating because they only matter
  // at close range. They need NoColorSpace so the GPU samples them linearly —
  // sRGB decoding would corrupt the tangent-space normals and mis-scale roughness.
  //
  // T3.8 audit (2026-04-22): verified `NoColorSpace` is correct for the
  // roughness map. Chain of custody for `{2k,8k}_earth_roughness_map.jpg`:
  //   1. Solar System Scope ships `*_earth_specular_map.tif` as a LINEAR
  //      grayscale specular intensity (their documented convention;
  //      `scripts/bake-earth-pbr.js:11-12,48-53` records provenance).
  //   2. `scripts/bake-earth-pbr.js:118-122` pipeline: decode TIFF →
  //      `.grayscale()` (linearity preserved) → `.negate({alpha:false})`
  //      which is `255 - x` (linearity preserved — it's the
  //      specular→roughness inversion) → `.jpeg({quality:85, mozjpeg:true})`
  //      which re-encodes without colourspace conversion.
  //   3. Stored JPG byte = linear roughness × 255. Three's
  //      `MeshStandardMaterial` roughness sampler expects linear
  //      `[0, 1]` values, so `NoColorSpace` makes the GPU read the
  //      byte/255 directly as the roughness scalar — CORRECT.
  //      `SRGBColorSpace` would apply a `pow(x/255, 2.2)` decode,
  //      understating roughness on rough-surface bands by up to ~4×.
  const normalTextureLoaded = useDeferredTexture(normalRequest.selectedPath, {
    enabled: shouldLoadSecondary,
    pin: shouldPinMap,
    colorSpace: THREE.NoColorSpace,
  });
  const roughnessTextureLoaded = useDeferredTexture(
    roughnessRequest.selectedPath,
    {
      enabled: shouldLoadSecondary,
      pin: shouldPinMap,
      colorSpace: THREE.NoColorSpace,
    }
  );

  useEffect(() => {
    if (assetPriority !== 1 || !mapRequest?.selectedPath) {
      return;
    }

    void preloadDeferredTexture(mapRequest.selectedPath);
  }, [assetPriority, mapRequest?.selectedPath]);

  const textureRing = ringTextureLoaded.texture ?? undefined;
  const textureClouds = cloudTextureLoaded.texture ?? undefined;
  const textureMap = directSurfaceMapEnabled
    ? (bodyTextureLoaded.texture ?? undefined)
    : undefined;
  const textureNight = nightTextureLoaded.texture ?? undefined;
  // PBR maps only apply when the albedo map is loaded — they describe the
  // same surface, and a naked normal map over a procedural base looks broken.
  const textureNormal = textureMap
    ? (normalTextureLoaded.texture ?? undefined)
    : undefined;
  const textureRoughness = textureMap
    ? (roughnessTextureLoaded.texture ?? undefined)
    : undefined;
  const proceduralSurfaceMap = useMemo(() => {
    if (body.type === "star" || textureMap) return null;
    return createProceduralSurfaceTexture(body);
  }, [body, textureMap]);
  const surfaceFillLight = useMemo(() => {
    if (body.type === "star" || textureMap) return null;
    return getSurfaceFillLight(body);
  }, [body, textureMap]);
  const surfaceMap = textureMap ?? proceduralSurfaceMap ?? undefined;

  useEffect(() => {
    return () => {
      proceduralSurfaceMap?.dispose();
    };
  }, [proceduralSurfaceMap]);

  return useMemo(
    () => ({
      textureRing,
      textureClouds,
      textureMap,
      textureNight,
      textureNormal,
      textureRoughness,
      surfaceMap,
      proceduralSurfaceMap,
      surfaceFillLight,
      mapSalience,
      shouldPinMap,
      shouldLoadMap,
      shouldLoadSecondary,
    }),
    [
      textureRing,
      textureClouds,
      textureMap,
      textureNight,
      textureNormal,
      textureRoughness,
      surfaceMap,
      proceduralSurfaceMap,
      surfaceFillLight,
      mapSalience,
      shouldPinMap,
      shouldLoadMap,
      shouldLoadSecondary,
    ]
  );
}
