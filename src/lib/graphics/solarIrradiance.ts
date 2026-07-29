/**
 * Per-body solar irradiance from **ephemeris** distance, fused with the
 * didactic assist gain into the ONE scalar a planet material multiplies its
 * direct sunlight by (lighting redesign, Onda 2.1).
 *
 * ## The law
 *
 * A point source radiates over a sphere whose area grows as r², so the
 * irradiance a body receives falls as the inverse square of its heliocentric
 * distance:
 *
 *     E(d) = (d₀ / d)²
 *
 * Atlas's scene today has one `pointLight` with `decay = 0`
 * (`SceneLighting.tsx`), i.e. **no** distance falloff at all: Mercury and
 * Sedna are handed identical irradiance, a factor ~10⁷ lie. That light stays
 * exactly as it is — it is the scene's direction and shadow source, and its
 * intensity is the user/preset scalar surface (Sun Brightness ×, preset
 * `sunIntensity`). The distance law lives here instead, as a per-material
 * scalar, so exactly one place in the renderer knows about `1/r²`.
 *
 * ## The anchor is PROVISIONAL
 *
 * `d₀ = 1 AU`, so Earth reads 1.0 and every other body is expressed relative
 * to today's Earth look. That is a **normalisation choice, not a radiometric
 * calibration**: "what does 0 EV mean physically" is an explicitly OPEN
 * design question (`handoffiluminacao.md` §5.3), and until it is answered no
 * absolute claim can be made about what `1.0` corresponds to in W/m² or in
 * photometric EV. Earth-at-1-AU was chosen because it is the one body whose
 * current appearance the project has actually tuned against reference
 * imagery, so anchoring there makes this change a pure redistribution rather
 * than a global brightness edit. When §5.3 closes, THIS constant is what
 * moves — not the call sites.
 *
 * ## The input is ephemeris AU. Never world coordinates.
 *
 * Atlas renders in a didactically-compressed space (log compression capped at
 * 3200 render units, saturating around 323 AU — `astrophysics.ts`), and the
 * owner's 2026-07-29 decision is that irradiance follows the REAL ephemeris
 * distance in BOTH scale modes: the light always tells the true story, and
 * the assist gain (with disclosure) is what keeps bodies visible. Sampling a
 * scene-graph `getWorldPosition()` would therefore feed a *compressed*
 * distance into a physical law and silently corrupt the photometry — Neptune
 * would come out ~9× too bright in didactic mode and the number would still
 * look plausible. {@link resolveBodySunlightScalar} is the app-facing entry
 * point precisely so the only reachable source is the ephemeris chain
 * (`resolveHeliocentricDistanceAU`, which composes parent-centered satellite
 * positions up to the Sun in physical AU).
 *
 * ## One uniform, not two multipliers
 *
 * The irradiance and the didactic assist gain are fused here into a single
 * number ({@link resolveFusedSunlightScalar}) before they ever reach a
 * shader. Shipping them as two stacked uniforms is the named failure mode in
 * the plan ("senão nascem dois multiplicadores empilhados que depois brigam"):
 * two independently-tuned multipliers on the same quantity drift apart and
 * then fight, and no single place can answer "how much light is this body
 * actually getting".
 *
 * ## Today's default is a visual NO-OP, by construction
 *
 * {@link DEFAULT_SUNLIGHT_ASSIST_POLICY} is `"compensated"`, whose gain is
 * exactly `1 / E` — so the fused scalar is 1.0 for every body and this
 * infrastructure changes not one pixel. That is deliberate: real irradiance
 * is a **content** claim (a body genuinely rendered dimmer than the viewer
 * might expect), and per the plan a content claim ships together with its
 * disclosure UI, never ahead of it. The next agent in the queue owns the
 * unified fidelity badge + assist control and flips
 * {@link DEFAULT_SUNLIGHT_ASSIST_POLICY} to `"real"` in that same change.
 *
 * ## What this scalar does NOT touch
 *
 *  - **Ambient / indirect.** The 0.02 viewing floor
 *    (`visualPresetOverrides.ts`) is a display guarantee — "shadowed terrain
 *    is never pure black on a phone in daylight" — not a statement about
 *    incoming sunlight. Scaling it by 1/r² would make the guarantee fail
 *    exactly where it is needed most. The shader patch wraps `RE_Direct`
 *    only; `RE_IndirectDiffuse` is untouched.
 *  - **Emissives.** Night lights, the Sun disc, the atmosphere shell, ring
 *    emissive and the COLOR-blended cloud layer are all out of scope here and
 *    recorded as deferrals in `exposureRegistry.ts`.
 */

import { resolveHeliocentricDistanceAU } from "../orbital";

/**
 * The distance at which irradiance is defined to be 1.0, in AU.
 *
 * PROVISIONAL — see this file's header. It encodes "today's Earth look is the
 * reference", not a radiometric zero point.
 */
export const SOLAR_IRRADIANCE_ANCHOR_AU = 1.0;

/**
 * Lower clamp on the distance fed to the inverse square, in AU.
 *
 * Two jobs. (1) The Sun's own heliocentric distance is exactly 0, so an
 * unclamped `1/d²` is a division by zero on a body that is in the catalog and
 * does get resolved. (2) It bounds the scalar a shader can ever see. 0.05 AU
 * sits well inside Mercury's perihelion (a = 0.387, e = 0.205 → 0.3077 AU,
 * the closest approach any body in the catalog makes) with room for a future
 * sungrazer record, so it never clamps a real body today.
 */
export const SOLAR_IRRADIANCE_MIN_AU = 0.05;

/**
 * Upper clamp on the distance fed to the inverse square, in AU.
 *
 * Just past Sedna's aphelion (a = 524.4, e = 0.85 → 970.1 AU), the farthest
 * point any catalog body reaches, so it never clamps a real body either. It
 * exists so a wrong-units caller — a render-space distance, which runs to the
 * didactic cap of 3200 — lands on a bounded, obviously-black value instead of
 * a denormal.
 */
export const SOLAR_IRRADIANCE_MAX_AU = 1000;

/**
 * How much of the real irradiance the viewer is shown.
 *
 * - `"compensated"` — gain is `1 / E`, so the fused scalar is 1.0 everywhere:
 *   every body is lit as though it sat at the anchor distance. This is
 *   today's shipped behaviour and reproduces the pre-Onda-2 picture exactly.
 * - `"real"` — gain is 1, so the fused scalar IS the irradiance. Mercury
 *   ~10.4×, Neptune ~1/900. A content claim; ships with its disclosure badge.
 *
 * A third, interpolating position (a compressive curve between the two — the
 * plan's "Realçado") is the natural next member. It is deliberately NOT
 * declared until something implements it: an unimplemented union member is a
 * branch every consumer has to handle for no behaviour.
 */
export type SunlightAssistPolicy = "compensated" | "real";

/**
 * The policy in force out of the box.
 *
 * `"compensated"` makes Onda 2.1 a visual no-op. The badge + assist-control
 * agent flips this to `"real"` **together with** the disclosure UI — that is
 * the whole reason the plumbing lands first and the default flip lands later.
 */
export const DEFAULT_SUNLIGHT_ASSIST_POLICY: SunlightAssistPolicy =
  "compensated";

/**
 * Live policy holder, same `{ value }` singleton idiom as
 * {@link file://./exposureRegistry.ts}'s `sceneExposure`: consumers read it
 * imperatively from inside `useFrame` (no React subscription on a
 * 60 Hz path), and one write propagates on the next frame.
 */
export const sunlightAssistPolicy: { value: SunlightAssistPolicy } = {
  value: DEFAULT_SUNLIGHT_ASSIST_POLICY,
};

/** Read the policy in force. Pure, alloc-free, safe on the hot path. */
export const getSunlightAssistPolicy = (): SunlightAssistPolicy =>
  sunlightAssistPolicy.value;

/** Set the policy in force. The assist control's only write surface. */
export const setSunlightAssistPolicy = (next: SunlightAssistPolicy): void => {
  sunlightAssistPolicy.value = next;
};

/**
 * Irradiance relative to the anchor distance, from a heliocentric distance in
 * **AU** — an ephemeris quantity, never a render-space one.
 *
 * Returns 1.0 (neutral) for a non-finite input rather than propagating NaN
 * into a uniform, which would paint the body black with no error anywhere.
 */
export const solarIrradianceAtAU = (heliocentricDistanceAU: number): number => {
  if (!Number.isFinite(heliocentricDistanceAU)) return 1;
  const distance = Math.min(
    SOLAR_IRRADIANCE_MAX_AU,
    Math.max(SOLAR_IRRADIANCE_MIN_AU, Math.abs(heliocentricDistanceAU))
  );
  const ratio = SOLAR_IRRADIANCE_ANCHOR_AU / distance;
  return ratio * ratio;
};

/**
 * The didactic assist gain for a body already carrying `irradiance`.
 *
 * Under `"compensated"` this is the exact inverse, which is what makes the
 * fused product 1.0 and the whole feature invisible until the default moves.
 */
export const resolveAssistGain = (
  irradiance: number,
  policy: SunlightAssistPolicy
): number => (policy === "compensated" ? 1 / irradiance : 1);

/**
 * The fused scalar a planet material multiplies its direct sunlight by:
 * `E(d) × assistGain(d)`.
 *
 * Named argument, because the one thing that must never happen to this
 * function is being handed a world-space distance — `resolveFusedSunlightScalar(d)`
 * reads fine at a call site holding either kind of number, and
 * `{ heliocentricDistanceAU: d }` does not.
 */
export const resolveFusedSunlightScalar = ({
  heliocentricDistanceAU,
  policy = getSunlightAssistPolicy(),
}: {
  heliocentricDistanceAU: number;
  policy?: SunlightAssistPolicy;
}): number => {
  const irradiance = solarIrradianceAtAU(heliocentricDistanceAU);
  return irradiance * resolveAssistGain(irradiance, policy);
};

/**
 * The app-facing entry point: the fused scalar for a catalog body at a given
 * instant, with the heliocentric distance taken from the ephemeris chain.
 *
 * This overload exists so the render path cannot express the wrong thing. A
 * caller holding a body id and a date has no way to reach into scene
 * coordinates from here; `resolveHeliocentricDistanceAU` composes
 * parent-centered satellite positions up to the Sun in physical AU,
 * independent of the didactic render-space remap.
 *
 * Callers on the 60 Hz path should cache per (body, ~1 s) — no body drifts
 * measurably on that scale. See `Planet.tsx`, which copies the cache shape
 * `useVisualPresetLerp.ts` already uses for the same resolver.
 */
export const resolveBodySunlightScalar = (
  bodyId: string,
  date: Date,
  policy: SunlightAssistPolicy = getSunlightAssistPolicy()
): number =>
  resolveFusedSunlightScalar({
    heliocentricDistanceAU: resolveHeliocentricDistanceAU(bodyId, date),
    policy,
  });
