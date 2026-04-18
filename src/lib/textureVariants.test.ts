// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CelestialBody } from "../lib/astrophysics";
import {
  __resetWebPSupportCache,
  preferWebPAsset,
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

  it("resolves Earth PBR channels through the shared manifest pipeline", () => {
    const body = makeBody({
      id: "earth",
      textures: {
        map: "textures/8k_earth_daymap.jpg",
        normal: "textures/8k_earth_normal_map.jpg",
        roughness: "textures/8k_earth_roughness_map.jpg",
      },
    });

    const ultraNormal = resolveTextureRequest(
      body,
      "normal",
      "ultra",
      1,
      TEXTURE_VARIANT_MANIFEST
    );
    expect(ultraNormal.selectedPath).toBe("textures/8k_earth_normal_map.jpg");
    expect(ultraNormal.selectedTier).toBe("8k");

    const constrainedRoughness = resolveTextureRequest(
      body,
      "roughness",
      "constrained",
      0.1,
      TEXTURE_VARIANT_MANIFEST
    );
    expect(constrainedRoughness.selectedPath).toBe(
      "/textures/2k_earth_roughness_map.jpg"
    );
    expect(constrainedRoughness.selectedTier).toBe("2k");
    expect(constrainedRoughness.source).toBe("manifest");
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

describe("preferWebPAsset", () => {
  beforeEach(() => {
    __resetWebPSupportCache();
  });

  afterEach(() => {
    __resetWebPSupportCache();
    vi.restoreAllMocks();
  });

  const stubWebPSupport = (supported: boolean) => {
    // Override the canvas prototype rather than spying on
    // `document.createElement`. jsdom hands back a canvas whose
    // `toDataURL` returns a "data:," sentinel; we replace the method
    // with a deterministic fake. `vi.spyOn` on a prototype method is
    // auto-restored by `vi.restoreAllMocks()`.
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() =>
      supported
        ? "data:image/webp;base64,UklGRg=="
        : "data:image/png;base64,iVBORw0KGgo="
    );
  };

  it("returns the input unchanged when the basename has no .webp sibling", () => {
    stubWebPSupport(true);
    expect(preferWebPAsset("/textures/4k_triton.png")).toBe(
      "/textures/4k_triton.png"
    );
  });

  it("rewrites to .webp when the browser supports it and a sibling exists", () => {
    stubWebPSupport(true);
    expect(preferWebPAsset("/textures/4k_oberon.png")).toBe(
      "/textures/4k_oberon.webp"
    );
    expect(preferWebPAsset("/textures/8k_moon.jpg")).toBe(
      "/textures/8k_moon.webp"
    );
  });

  it("keeps the original path when the browser does not support WebP", () => {
    stubWebPSupport(false);
    expect(preferWebPAsset("/textures/4k_oberon.png")).toBe(
      "/textures/4k_oberon.png"
    );
  });

  it("passes null through unchanged", () => {
    stubWebPSupport(true);
    expect(preferWebPAsset(null)).toBeNull();
  });

  it("routes through resolveTextureRequest's selectedPath", () => {
    stubWebPSupport(true);
    const body = {
      id: "oberon",
      type: "moon",
      name: { en: "OBERON", pt: "OBERON" },
      radiusKm: 1,
      color: "#ffffff",
      orbit: { a: 1, e: 0, i: 0, O: 0, w: 0, M0: 0, n: 1 },
      rotationPeriodHours: 24,
      axialTilt: 0,
      info: "test",
      textures: { map: "/textures/4k_oberon.png" },
    } as unknown as CelestialBody;

    const resolved = resolveTextureRequest(body, "map", "high");
    expect(resolved.selectedPath).toBe("/textures/4k_oberon.webp");
    expect(resolved.canonicalPath).toBe("/textures/4k_oberon.png");
  });
});
