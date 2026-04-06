import { describe, expect, it } from "vitest";
import type { CelestialBody } from "../lib/astrophysics";
import {
  resolveTextureRequest,
  type TextureVariantManifest,
} from "./textureVariants";
import { TEXTURE_VARIANT_MANIFEST } from "./textureVariantManifest";

const makeBody = (
  overrides: Partial<CelestialBody> & Pick<CelestialBody, "id" | "textures">
) =>
  (() => {
    const { id, ...rest } = overrides;

    return {
      id,
      type: "planet",
      name: { en: id.toUpperCase(), pt: id.toUpperCase() },
      radiusKm: 1,
      color: "#ffffff",
      orbit: { a: 1, e: 0, i: 0, O: 0, w: 0, M0: 0, n: 1 },
      rotationPeriodHours: 24,
      axialTilt: 0,
      info: "test",
      ...rest,
    } as CelestialBody;
  })();

describe("resolveTextureRequest", () => {
  it("falls back to the canonical texture when no tiered variant exists", () => {
    const body = makeBody({
      id: "mars",
      textures: {
        clouds: "textures/mars_clouds.jpg",
      },
    });

    const resolved = resolveTextureRequest(body, "clouds", "high");

    expect(resolved.selectedPath).toBe("textures/mars_clouds.jpg");
    expect(resolved.selectedTier).toBe("canonical");
    expect(resolved.source).toBe("canonical");
    expect(resolved.isBootAsset).toBe(false);
  });

  it("keeps the canonical tier when no explicit variant exists", () => {
    const body = makeBody({
      id: "earth",
      textures: {
        map: "textures/8k_earth_daymap.jpg",
      },
    });

    const resolved = resolveTextureRequest(body, "map", "high");

    expect(resolved.selectedPath).toBe("textures/8k_earth_daymap.jpg");
    expect(resolved.selectedTier).toBe("8k");
    expect(resolved.source).toBe("canonical");
  });

  it("uses explicit manifest entries for irregular texture names", () => {
    const body = makeBody({
      id: "uranus",
      textures: {
        atmosphere:
          "textures/uranus_texture_map_8k_by_floridaemojicat_dj4s9vd.jpg",
      },
    });

    const manifest: TextureVariantManifest = {
      uranus: {
        atmosphere: {
          variants: {
            "4k": "textures/uranus_texture_map_4k.jpg",
            "2k": "textures/uranus_texture_map_2k.jpg",
          },
        },
      },
    };

    const resolved = resolveTextureRequest(
      body,
      "atmosphere",
      "high",
      1,
      manifest
    );

    expect(resolved.selectedPath).toBe("textures/uranus_texture_map_4k.jpg");
    expect(resolved.selectedTier).toBe("4k");
    expect(resolved.source).toBe("manifest");
  });

  it("prefers manifest-backed boot assets for constrained first-view textures", () => {
    const cases = [
      {
        body: makeBody({
          id: "sun",
          textures: {
            map: "textures/8k_sun.jpg",
          },
        }),
        channel: "map" as const,
        expectedPath: "/textures/boot_sun.jpg",
      },
      {
        body: makeBody({
          id: "earth",
          textures: {
            map: "textures/8k_earth_daymap.jpg",
          },
        }),
        channel: "map" as const,
        expectedPath: "/textures/boot_earth_daymap.jpg",
      },
      {
        body: makeBody({
          id: "saturn",
          textures: {
            map: "textures/8k_saturn.jpg",
          },
        }),
        channel: "map" as const,
        expectedPath: "/textures/boot_saturn.jpg",
      },
      {
        body: makeBody({
          id: "saturn",
          textures: {
            ring: "textures/8k_saturn_ring_alpha.png",
          },
        }),
        channel: "ring" as const,
        expectedPath: "/textures/boot_saturn_ring_alpha.png",
      },
    ];

    for (const { body, channel, expectedPath } of cases) {
      const resolved = resolveTextureRequest(
        body,
        channel,
        "constrained",
        1,
        TEXTURE_VARIANT_MANIFEST
      );

      expect(resolved.selectedPath).toBe(expectedPath);
      expect(resolved.selectedTier).toBe("boot");
      expect(resolved.source).toBe("manifest");
      expect(resolved.isBootAsset).toBe(true);
    }
  });
});
