import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { type CelestialBody } from "../../../lib/astrophysics";
import { useProgressiveDeferredTexture } from "../../../hooks/useProgressiveDeferredTexture";
import { resolveTextureRequest } from "../../../lib/textureVariants";
import { TEXTURE_VARIANT_MANIFEST } from "../../../lib/textureVariantManifest";
import type { ResolvedQualityName } from "../../../lib/qualityProfile";
import type { ResolvedSunRenderMode } from "../../../lib/sunRenderMode";
import type { CameraAssetInterest } from "../../../lib/cameraAssetInterest";
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
  focusId: string | null;
  cameraInterest: CameraAssetInterest;
}

const MIN_TEXTURED_RADIUS_PX = 18;

export function usePlanetAssets({
  body,
  qualityProfileName,
  sunRenderMode,
  assetPriority,
  focusId,
  cameraInterest,
}: UsePlanetAssetsParams) {
  const directSurfaceMapEnabled =
    Boolean(body.textures?.map) &&
    shouldRenderDirectSurfaceMap(body) &&
    !(body.id === "sun" && sunRenderMode === "procedural");
  const isFocused = focusId === body.id;
  const isCameraRelevant = cameraInterest.visibility !== "hidden";
  const isVisible = cameraInterest.visibility === "visible";
  const isLargeEnoughForTexture =
    cameraInterest.projectedRadiusPx >= MIN_TEXTURED_RADIUS_PX;
  const mapSalience = cameraInterest.salience;
  const shouldPinMap = body.id === "sun" || isFocused;
  const shouldLoadMap =
    (isFocused || (isCameraRelevant && isLargeEnoughForTexture)) &&
    (body.id !== "sun" || sunRenderMode !== "procedural");
  const shouldLoadRing =
    isFocused || (isCameraRelevant && isLargeEnoughForTexture);
  const shouldLoadSecondary = isVisible && mapSalience >= 0.78;
  const primaryLoadPriority = isFocused
    ? 0
    : isVisible && assetPriority <= 1
      ? 1
      : 2;

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

  const ringTextureLoaded = useProgressiveDeferredTexture(
    ringRequest.selectedPath,
    {
      enabled: shouldLoadRing,
      pin: shouldPinMap,
      priority: primaryLoadPriority,
    }
  );
  const cloudTextureLoaded = useProgressiveDeferredTexture(
    cloudRequest.selectedPath,
    {
      enabled: shouldLoadSecondary,
      pin: shouldPinMap,
      priority: 3,
    }
  );
  const bodyTextureLoaded = useProgressiveDeferredTexture(
    mapRequest?.selectedPath,
    {
      enabled: shouldLoadMap,
      pin: shouldPinMap,
      priority: primaryLoadPriority,
    }
  );
  const nightTextureLoaded = useProgressiveDeferredTexture(
    nightRequest.selectedPath,
    {
      enabled: shouldLoadSecondary,
      pin: shouldPinMap,
      priority: 3,
    }
  );
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
  const normalTextureLoaded = useProgressiveDeferredTexture(
    normalRequest.selectedPath,
    {
      enabled: shouldLoadSecondary,
      pin: shouldPinMap,
      priority: 3,
      colorSpace: THREE.NoColorSpace,
    }
  );
  const roughnessTextureLoaded = useProgressiveDeferredTexture(
    roughnessRequest.selectedPath,
    {
      enabled: shouldLoadSecondary,
      pin: shouldPinMap,
      priority: 3,
      colorSpace: THREE.NoColorSpace,
    }
  );

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
