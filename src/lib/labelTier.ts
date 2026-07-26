import type { BodyType } from "./astrophysics";

/**
 * Visual weight of a body label.
 *
 * Every label used to render identically — same size, same grey, same
 * weight — so on a system-wide framing EARTH and WEYWOT competed on
 * equal footing and the screen read as an undifferentiated field of
 * names. The information needed to fix that already existed:
 * `OverlayPositionTracker` computes a per-body priority (focus 100 /
 * star 90 / planet 10 / dwarf 8 / moon 6 / other 4) but spends it only
 * on collision arbitration, i.e. on *which* labels survive, never on
 * how they look once they do.
 *
 * Three tiers, not six. The priority table needs fine gradations
 * because it resolves ties; the eye does not — past three steps the
 * distinctions stop being legible at a glance and the hierarchy reads
 * as noise. Planet-vs-everything-else is the split that carries the
 * meaning.
 *
 * The tracker classifies once and publishes `tier` on each overlay
 * item; both label renderers read it. Keeping the presentation tables
 * here as well means the whole hierarchy — who is in which tier, and
 * what each tier looks like in either renderer — is one file, rather
 * than two half-answers that can silently drift apart.
 */
export type LabelTier = "primary" | "secondary" | "tertiary";

/**
 * The focused body is always primary regardless of what it is: focus is
 * a statement about what the user is looking at, and a focused moon
 * that stayed dim would contradict the camera.
 */
export const labelTierFor = (type: BodyType, isFocused: boolean): LabelTier => {
  if (isFocused || type === "star") return "primary";
  if (type === "planet") return "secondary";
  return "tertiary";
};

/**
 * HTML renderer (`PlanetOverlay`). Colour and weight carry the
 * hierarchy; only the tertiary tier changes size, because shrinking
 * text below `text-xs` costs legibility faster than it buys contrast.
 */
export const LABEL_TIER_CLASS: Record<LabelTier, string> = {
  primary: "text-white text-xs font-semibold tracking-wider",
  secondary: "text-gray-200 text-xs font-semibold tracking-wide",
  tertiary: "text-gray-400 text-[10px] font-normal tracking-wide",
};

/**
 * SDF renderer (`PlanetLabels3D`). `scale` multiplies the
 * distance-derived font size, so it behaves like the HTML size step.
 * Colours match the Tailwind values above so flipping `labelMode`
 * does not change the hierarchy, only the renderer.
 */
export const LABEL_TIER_SDF: Record<
  LabelTier,
  { scale: number; color: string; fillOpacity: number }
> = {
  primary: { scale: 1.12, color: "#ffffff", fillOpacity: 1 },
  secondary: { scale: 1, color: "#e5e7eb", fillOpacity: 1 },
  tertiary: { scale: 0.84, color: "#9ca3af", fillOpacity: 0.9 },
};
