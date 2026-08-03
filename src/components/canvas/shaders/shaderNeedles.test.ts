import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

/**
 * W7 — the general guard for the second silent-no-op class this wave found.
 *
 * `String.prototype.replace` with an absent needle returns the string
 * unchanged, so a three.js chunk rename turns a shader patch into a no-op
 * with no error anywhere: the eclipse output patch injected nothing from
 * r152 (when `output_fragment` became `opaque_fragment`) until W7, across
 * three injection sites and three shipped waves. This test walks every
 * `#include <...>` needle the repo replaces and asserts the chunk exists in
 * the installed three — so the next rename fails a unit test instead of
 * shipping a dead shader whose age nobody can state.
 * (`regolithPhotometry.test.ts` has the single-needle form it generalises.)
 */

const SRC_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const NEEDLE_PATTERN = /\.replace\(\s*["'`]#include <(\w+)>["'`]/g;

const collectSourceFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
};

const collectNeedles = (): { file: string; chunk: string }[] => {
  const needles: { file: string; chunk: string }[] = [];
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(NEEDLE_PATTERN)) {
      needles.push({ file: file.slice(SRC_ROOT.length), chunk: match[1] });
    }
  }
  return needles;
};

describe("shader chunk needles", () => {
  const needles = collectNeedles();

  it("finds the injection sites at all (the walker itself must not silently no-op)", () => {
    expect(needles.length).toBeGreaterThanOrEqual(10);
    // The three eclipse sites specifically — cloud, Earth day/night,
    // eclipse-only — all anchor on opaque_fragment post-W7.
    expect(
      needles.filter((n) => n.chunk === "opaque_fragment").length
    ).toBeGreaterThanOrEqual(3);
  });

  it("every replaced needle names a chunk the installed three actually ships", () => {
    for (const { file, chunk } of needles) {
      expect(
        (THREE.ShaderChunk as unknown as Record<string, string>)[chunk],
        `${file} replaces "#include <${chunk}>" but three ${THREE.REVISION} ships no such chunk`
      ).toBeDefined();
    }
  });

  it("the r152 rename that caused this cannot silently come back", () => {
    expect(needles.some((n) => n.chunk === "output_fragment")).toBe(false);
    expect(
      (THREE.ShaderChunk as unknown as Record<string, string>).opaque_fragment
    ).toBeDefined();
  });
});
