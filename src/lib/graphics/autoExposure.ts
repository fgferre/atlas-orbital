/**
 * Analytical auto-exposure — the radiometric anchor (Onda 2.4).
 *
 * ## The defect this closes
 *
 * Onda 2.1–2.3 gave every body the sunlight it actually receives
 * (`solarIrradiance.ts`) but left exposure pinned at the 1 AU
 * reference. In `"real"` that meant the viewer was shown Saturn's true
 * RADIANCE *under Earth's exposure*, and Saturn came out a pitch-black
 * disc — invisible. The owner's objection (2026-07-29, "você acha que
 * esse é o brilho real em Saturno?") is correct on the physics:
 * Saturn receives ~1.1 % of Earth's irradiance, and 1 % of sunlight is
 * ~1500 lux — an overcast Earth afternoon. An observer at Saturn, or
 * any Cassini frame, sees a brilliantly lit planet. Nothing was wrong
 * with the irradiance; the exposure was wrong.
 *
 * ## The formula
 *
 *     sceneExposure_anchor = 1 / fusedSunlightScalar(focusedBody, policy)
 *
 * `fusedSunlightScalar` is the SAME resolver the planet materials
 * already multiply their direct sunlight by
 * (`solarIrradiance.ts#resolveFusedSunlightScalar`) — not a parallel
 * re-derivation. That identity is the whole design: the focused body's
 * on-screen luminance is `fused × exposure ≡ 1`, exactly reference
 * display brightness, in **every** policy. A camera exposes for its
 * subject.
 *
 * This is the answer to `handoffiluminacao.md` §5.3 ("âncora
 * radiométrica: o que significa 0 EV fisicamente?"). **0 EV means: the
 * sunlight falling on the body you are looking at.** Not a fixed W/m²,
 * not 1 AU forever — an observer's adaptation state, which is what a
 * display-referred pipeline can honestly claim. The 1 AU constant
 * survives as the *unfocused* anchor only (below).
 *
 * ## What the three policies now mean
 *
 * Consequence of the identity above, and all of it intended:
 *
 *   • the FOCUSED body always lands at reference brightness — the
 *     policy control no longer decides whether you can see your
 *     subject, only how the rest of the scene relates to it;
 *   • `"real"` — the remaining bodies sit at their TRUE brightness
 *     ratios relative to the subject (from Saturn, Jupiter is ~3.3×
 *     brighter and Neptune ~10× dimmer, because they are);
 *   • `"assisted"` — those ratios are compressed by the σ = 0.35
 *     exponent, same as before;
 *   • `"compensated"` — `fused ≡ 1` for every body, so the anchor is
 *     ≡ 1 too and the picture is byte-identical to the pre-2.4 look.
 *
 * ## The unfocused anchor, and why the Sun is not a subject
 *
 * With no body focused (the boot frame, the system overview) the
 * anchor falls back to {@link SOLAR_IRRADIANCE_ANCHOR_AU} = 1 AU ⇒
 * exposure exactly 1 in every policy. Not a special case in the code:
 * the same expression is evaluated at the reference distance. The boot
 * frame is therefore unchanged, which the e2e pixel baseline pins.
 *
 * The **Sun** takes that same fallback. Its heliocentric distance is
 * 0, and `solarIrradianceAtAU` clamps 0 up to
 * {@link SOLAR_IRRADIANCE_MIN_AU} = 0.05 AU purely as a
 * division-by-zero guard for the material path — a defensive bound,
 * explicitly "not a photometric statement" in that module's own
 * docstring. Using it as an exposure anchor would promote the guard to
 * a claim (the scene would darken 400× on `focusHome()`), and the
 * underlying quantity is undefined anyway: the Sun does not *receive*
 * sunlight. So the anchor is defined only on the inverse-square law's
 * valid domain, and anything inside the near clamp — or outside the
 * catalog entirely, which is how HYG star focus ids arrive here —
 * reads the 1 AU reference instead.
 *
 * ## The ramp is time-based, not flight-progress-based
 *
 * The plan asked for "rampa em espaço log amarrada ao PROGRESSO do
 * voo". Log space: shipped, and non-negotiable — the anchor crosses
 * ~10 stops between Earth and Neptune, and a linear lerp across that
 * would spend ~97 % of its duration in the last stop, i.e. a hard cut
 * followed by a crawl.
 *
 * Flight progress: **not** shipped, deliberately. The only
 * flight-progress scalar this repo exposes is
 * `hygFlightPosProgress`, and it covers HYG *star* flights — the one
 * class of focus that does not have a heliocentric distance and
 * therefore never moves the anchor at all. The curated-body fly-to
 * (`CameraController.tsx`'s `CameraTransition`) keeps its progress
 * inside a component-local ref with no exported surface, and the
 * bodies whose exposure actually swings — Jupiter, Saturn, Neptune —
 * are all on that path. Publishing it would mean either a 60 Hz
 * store write (a React re-render per frame) or a second camera→
 * photometry singleton, to buy a difference the eye cannot resolve:
 * the fly-to is duration-clamped to 1.5–4 s
 * (`CameraController.tsx`) and {@link AUTO_EXPOSURE_RAMP_TAU_S} is
 * 1.5 s, so the two curves already land together. Taken as the
 * documented fallback the brief allows, and recorded as such in the
 * wave file rather than left implicit.
 */

import { BODIES_BY_ID } from "../../data/celestialBodies";
import { resolveHeliocentricDistanceAU } from "../orbital";
import {
  getSunlightAssistPolicy,
  getSunlightToneMappingMounted,
  resolveFusedSunlightScalar,
  SOLAR_IRRADIANCE_ANCHOR_AU,
  SOLAR_IRRADIANCE_MIN_AU,
  type SunlightAssistPolicy,
} from "./solarIrradiance";
import { SCENE_EXPOSURE_MAX, SCENE_EXPOSURE_MIN } from "./exposureRegistry";

/**
 * Time constant of the log-space exposure ramp, in seconds.
 *
 * Matched to the curated-body fly-to, which `CameraController.tsx`
 * clamps to `[1500, 4000] ms` (plus a 520/800 ms fast path for layout
 * reframes and scale-mode switches). At τ = 1.5 s the anchor has
 * covered 63 % of its stops by the time a minimum-length flight ends
 * and >93 % by the end of a maximum-length one, so the scene is
 * visually settled on arrival without the exposure leading the camera.
 */
export const AUTO_EXPOSURE_RAMP_TAU_S = 1.5;

/**
 * Ramp settle threshold, in stops. 1e-3 stops is a 0.07 % luminance
 * difference — far below any display's discrimination — so snapping
 * here lets a settled scene stop writing the registry entirely.
 */
const AUTO_EXPOSURE_SETTLE_STOPS = 1e-3;

/**
 * The exposure that puts a body at `heliocentricDistanceAU` at
 * reference display brightness, under `policy`.
 *
 * The reciprocal of the exact scalar the body's own material uses, so
 * `fused × exposure ≡ 1` holds by construction rather than by
 * agreement between two formulas. Clamped to the registry's range,
 * whose ceiling is itself derived from `solarIrradiance.ts`'s distance
 * clamp so no catalog body can reach it.
 */
export const resolveAnalyticalExposure = ({
  heliocentricDistanceAU,
  policy = getSunlightAssistPolicy(),
  toneMapped = getSunlightToneMappingMounted(),
}: {
  heliocentricDistanceAU: number;
  policy?: SunlightAssistPolicy;
  toneMapped?: boolean;
}): number => {
  const fused = resolveFusedSunlightScalar({
    heliocentricDistanceAU,
    policy,
    toneMapped,
  });
  if (!Number.isFinite(fused) || fused <= 0) return 1;
  return Math.max(SCENE_EXPOSURE_MIN, Math.min(1 / fused, SCENE_EXPOSURE_MAX));
};

/**
 * The heliocentric distance the anchor should be evaluated at for a
 * given focus id — the body's own, or the 1 AU reference when the
 * focus is not a sunlit catalog body.
 *
 * Three ways to land on the reference (see the module header): no
 * focus at all, a focus id outside the curated catalog (HYG stars
 * arrive as `hyg:<index>`, and `resolveHeliocentricDistanceAU` throws
 * on unknown ids rather than masking them), or a body sitting inside
 * `SOLAR_IRRADIANCE_MIN_AU` where the inverse-square input is a
 * division guard rather than a measurement — the Sun, and only the
 * Sun, since Mercury's perihelion is 0.3077 AU.
 */
export const resolveAnchorDistanceAU = (
  focusId: string | null | undefined,
  date: Date
): number => {
  if (!focusId || !BODIES_BY_ID.has(focusId)) {
    return SOLAR_IRRADIANCE_ANCHOR_AU;
  }
  const distance = resolveHeliocentricDistanceAU(focusId, date);
  if (!Number.isFinite(distance) || distance < SOLAR_IRRADIANCE_MIN_AU) {
    return SOLAR_IRRADIANCE_ANCHOR_AU;
  }
  return distance;
};

/**
 * The app-facing entry point: the analytical exposure anchor for the
 * currently focused body at a given instant.
 *
 * Pure — the caller supplies the focus id, the date and (in tests) the
 * policy, so the whole radiometric decision is assertable without a
 * renderer or an R3F tree.
 */
export const resolveFocusExposure = (
  focusId: string | null | undefined,
  date: Date,
  policy: SunlightAssistPolicy = getSunlightAssistPolicy(),
  toneMapped: boolean = getSunlightToneMappingMounted()
): number =>
  resolveAnalyticalExposure({
    heliocentricDistanceAU: resolveAnchorDistanceAU(focusId, date),
    policy,
    toneMapped,
  });

/**
 * Advance the live exposure one frame toward `target`, interpolating in
 * **log2 (stop) space**.
 *
 * Frame-rate independent exponential approach with
 * {@link AUTO_EXPOSURE_RAMP_TAU_S}. Because the interpolation happens
 * on `log2`, the result is strictly monotone in the direction of
 * travel and never overshoots (`blend ∈ (0, 1]`), and equal *stops*
 * take equal time regardless of where in the ~20-stop Mercury→Sedna
 * range the ramp is — the property a linear lerp cannot have.
 *
 * Non-positive or non-finite inputs return the target directly rather
 * than propagating a `log2` of zero or a NaN into the registry.
 */
export const stepExposureLogTowards = (
  current: number,
  target: number,
  deltaSeconds: number,
  tauSeconds: number = AUTO_EXPOSURE_RAMP_TAU_S
): number => {
  if (!Number.isFinite(target) || target <= 0) return current;
  if (!Number.isFinite(current) || current <= 0) return target;
  if (current === target) return target;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current;
  if (!Number.isFinite(tauSeconds) || tauSeconds <= 0) return target;

  const currentStops = Math.log2(current);
  const targetStops = Math.log2(target);
  const blend = 1 - Math.exp(-deltaSeconds / tauSeconds);
  const nextStops = currentStops + (targetStops - currentStops) * blend;

  return Math.abs(targetStops - nextStops) <= AUTO_EXPOSURE_SETTLE_STOPS
    ? target
    : Math.pow(2, nextStops);
};
