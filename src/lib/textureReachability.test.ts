import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { SOLAR_SYSTEM_BODIES } from "../data/celestialBodies";
import { TEXTURE_VARIANT_MANIFEST } from "./textureVariantManifest";
import {
  resolveTextureRequest,
  type TextureChannel,
  type TextureQualityProfile,
} from "./textureVariants";

/**
 * Every texture the progressive loader can ask for is actually on disk.
 *
 * The loader is a tier ladder, not a fixed asset list: `resolveTextureRequest`
 * picks a path from `(body, channel, quality profile, salience)`, where
 * salience encodes focus and on-screen size. An overview body is served 2k or
 * boot no matter the profile — that band exists because drawing every body at
 * its 8k canonical allocated ~3.9 GB on ultra and lost the GL context — and
 * focus or zoom promotes it up the ladder. So the set of URLs the app can
 * request is a *product*, not a list, and a missing file inside it surfaces as
 * a 404 and an untextured body only for the specific profile and zoom that
 * reaches it. No screenshot at one zoom level covers that.
 *
 * This enumerates the whole product and asserts every path exists. It is the
 * cheap guard the ladder never had.
 *
 * **The inverse is deliberately not asserted.** Files on disk that nothing can
 * request are dead weight — `public/` is copied into `dist/` verbatim, so they
 * ship to every user — but "unreachable" is genuinely hard to establish and two
 * careless passes got it wrong before this file existed:
 *
 *  - `preferWebPAsset` rewrites three basenames to `.webp` in a real browser,
 *    and `detectWebPSupport()` is false under vitest, so those siblings look
 *    orphaned here and are not.
 *  - `scripts/download-textures.js` names assets the app never renders, so a
 *    repo-wide grep finds "references" that are only re-download instructions.
 *  - Substring matching counts `8k_mercury.jpg` as a hit for `mercury.jpg`.
 *
 * A dead-asset sweep therefore stays a deliberate audit with those three traps
 * in hand, not an assertion that would rot into a stale allowlist.
 */

const CHANNELS: TextureChannel[] = [
  "map",
  "clouds",
  "night",
  "ring",
  "atmosphere",
  "normal",
  "roughness",
];

const PROFILES: TextureQualityProfile[] = [
  "ultra",
  "high",
  "balanced",
  "constrained",
];

/**
 * Salience samples chosen to straddle every branch in `getPreferenceOrder`:
 * the balanced+boot special case at ≤0.2, the overview band below 0.9, and the
 * focus/zoom promotion at and above it.
 */
const SALIENCES = [0, 0.1, 0.2, 0.5, 0.89, 0.9, 1];

/**
 * `preferWebPAsset` swaps these to `.webp` when the browser supports it. That
 * rewrite cannot fire under vitest, so the siblings are added by hand — keep in
 * lockstep with `WEBP_AVAILABLE_BASENAMES` in `textureVariants.ts`.
 */
const WEBP_BASENAMES = ["4k_oberon", "8k_mercury", "8k_moon"];

function enumerateRequestablePaths(): Set<string> {
  const paths = new Set<string>();

  for (const body of SOLAR_SYSTEM_BODIES) {
    for (const channel of CHANNELS) {
      for (const profile of PROFILES) {
        for (const salience of SALIENCES) {
          const resolved = resolveTextureRequest(
            body,
            channel,
            profile,
            salience,
            TEXTURE_VARIANT_MANIFEST
          );
          // `availablePaths` is the honest superset: `selectedPath` is only
          // what this particular tuple picked, while a progressive upgrade
          // walks the others as the camera moves.
          for (const candidate of Object.values(resolved.availablePaths)) {
            if (candidate) paths.add(candidate);
          }
          if (resolved.canonicalPath) paths.add(resolved.canonicalPath);
          if (resolved.selectedPath) paths.add(resolved.selectedPath);
        }
      }
    }
  }

  return paths;
}

describe("progressive texture ladder", () => {
  it("can never request a file that is not on disk", () => {
    const requestable = new Set(
      [...enumerateRequestablePaths()].map((url) => url.split("/").pop()!)
    );
    for (const basename of WEBP_BASENAMES) requestable.add(`${basename}.webp`);

    const textureDir = path.resolve("public/textures");
    const onDisk = new Set(
      fs
        .readdirSync(textureDir)
        .filter((file) => /\.(jpg|png|webp)$/i.test(file))
    );

    // Floor, because an empty enumeration would satisfy the assertion below
    // while checking nothing. The ladder currently reaches 76 files; this only
    // has to fail if `resolveTextureRequest` starts returning nothing.
    expect(
      requestable.size,
      "the enumeration collapsed — the assertion below would pass vacuously"
    ).toBeGreaterThan(60);

    const missing = [...requestable].filter((file) => !onDisk.has(file)).sort();

    expect(
      missing,
      `the loader can request ${missing.length} file(s) that do not exist — each is a 404 and an untextured body at the profile/zoom that reaches it:\n  ${missing.join("\n  ")}`
    ).toEqual([]);
  });

  it("serves a small tier in the overview band for every profile", () => {
    // Guards the VRAM fix itself, not just file existence: if this regresses,
    // ultra allocates full-res for every body at boot again.
    const earth = SOLAR_SYSTEM_BODIES.find((b) => b.id === "earth")!;

    for (const profile of PROFILES) {
      const overview = resolveTextureRequest(
        earth,
        "map",
        profile,
        0.5,
        TEXTURE_VARIANT_MANIFEST
      );
      expect(
        overview.selectedTier,
        `${profile} profile promoted Earth to ${overview.selectedTier} while it was only an overview dot`
      ).not.toBe("8k");
    }

    const focused = resolveTextureRequest(
      earth,
      "map",
      "ultra",
      1,
      TEXTURE_VARIANT_MANIFEST
    );
    expect(focused.selectedPath).toContain("8k_earth_daymap");
  });
});
