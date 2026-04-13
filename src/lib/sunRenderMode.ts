import type { ResolvedQualityName } from "./qualityProfile";

export type SunRenderMode = "auto" | "texture" | "procedural";
export type ResolvedSunRenderMode = Exclude<SunRenderMode, "auto">;

export const resolveSunRenderMode = (
  mode: SunRenderMode,
  qualityProfileName: ResolvedQualityName
): ResolvedSunRenderMode => {
  if (mode !== "auto") {
    return mode;
  }

  return qualityProfileName === "ultra" ? "procedural" : "texture";
};
