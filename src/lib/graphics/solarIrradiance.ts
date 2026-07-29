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
 * ## The shipped default is `"assisted"`, and it ships with its badge
 *
 * {@link DEFAULT_SUNLIGHT_ASSIST_POLICY} is `"assisted"`: the fused scalar is
 * `E^SIGMA` with SIGMA = {@link SUNLIGHT_ASSIST_EXPONENT}. That is a **content**
 * claim (bodies are genuinely rendered at different brightnesses now), so per
 * the plan it landed in the same change as the disclosure surface — the
 * unified fidelity badge (`FidelityBadge.tsx`), whose Brightness line reads
 * amber for `"assisted"` / `"compensated"` and emerald for `"real"`.
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
 * How much of the real irradiance the viewer is shown. Three positions, each
 * named in the UI by its **visible consequence** — never by a provenance word
 * like "scientific", which `SceneLighting.tsx`'s `decay = 0` would make a
 * false claim (`handoffiluminacao.md` §4 item 5 / §6 item 3).
 *
 * - `"real"` — "True brightness". Gain is 1, so the fused scalar IS the
 *   irradiance. Mercury ~10.4×, Neptune ~1/900. The unassisted position: the
 *   badge's Brightness line reads emerald here and nowhere else.
 * - `"assisted"` — "Assisted", the shipped default. See
 *   {@link SUNLIGHT_ASSIST_EXPONENT}.
 * - `"compensated"` — "Equalized". Gain is `1 / E`, so the fused scalar is
 *   1.0 everywhere: every body is lit as though it sat at the anchor
 *   distance. This is the pre-Onda-2 picture, kept as an explicit choice
 *   rather than an accident of plumbing.
 */
export type SunlightAssistPolicy = "compensated" | "assisted" | "real";

/**
 * The compression exponent of the `"assisted"` position: `fused = E^SIGMA`.
 *
 * **A discretionary display tunable, not a measured constant.** It is chosen,
 * disclosed in the Credits panel, and the one number in this file with no
 * physical derivation behind it. What it buys:
 *
 * | body    | real E  | E^0.35 |
 * |---------|---------|--------|
 * | Mercury | 10.4×   | 2.27×  |
 * | Earth   | 1.0×    | 1.0×   |
 * | Neptune | 1/900   | 1/10.8 |
 *
 * — i.e. it takes a ~9400:1 dynamic range that no display can show at once
 * and compresses it to ~25:1, which one can. The property that makes it
 * honest rather than decorative is that `x ↦ x^0.35` is **strictly
 * increasing**: every body keeps its true brightness ORDERING and its true
 * SIGN of change as it moves along its orbit. `"compensated"` destroys both
 * (everything is 1.0); `"real"` keeps both but spends the entire display
 * range on bodies inside 2 AU and renders the outer system as black.
 *
 * 0.35 specifically: the smallest exponent tried that still keeps Neptune
 * above the ~1/16 point where the 0.02 ambient viewing floor
 * (`visualPresetOverrides.ts`) starts to dominate its direct sunlight — below
 * that the outer planets stop being *lit* and start being *ambient-washed*,
 * which is a different and worse lie than compression. Nothing downstream
 * depends on the exact value; changing it changes only how compressed the
 * `"assisted"` picture is.
 */
export const SUNLIGHT_ASSIST_EXPONENT = 0.35;

/**
 * The policy in force out of the box.
 *
 * `"assisted"` per the owner's product decision (`handoffiluminacao.md` §1.3
 * — assisted-by-default, on the triple precedent that Atlas already ships
 * `scaleMode: "didactic"` disclosed by a badge, that NASA Eyes defaults to
 * its assisted "Shadow" light mode, and that the whole comparison set ships a
 * non-zero ambient floor). It is disclosed, not hidden: the fidelity badge's
 * Brightness line reads amber and names the position.
 */
export const DEFAULT_SUNLIGHT_ASSIST_POLICY: SunlightAssistPolicy = "assisted";

/**
 * Live policy holder, same `{ value }` singleton idiom as
 * {@link file://./exposureRegistry.ts}'s `sceneExposure`: consumers read it
 * imperatively from inside `useFrame` (no React subscription on a
 * 60 Hz path), and one write propagates on the next frame.
 *
 * React surfaces (the badge, the DisplayPanel select) subscribe through
 * {@link subscribeSunlightAssistPolicy} + `useSyncExternalStore` rather than
 * mirroring the value into the zustand store — one source of truth, and this
 * module stays free of store imports so it can be unit-tested as a pure lib.
 */
export const sunlightAssistPolicy: { value: SunlightAssistPolicy } = {
  value: DEFAULT_SUNLIGHT_ASSIST_POLICY,
};

const policyListeners = new Set<() => void>();

/** Read the policy in force. Pure, alloc-free, safe on the hot path. */
export const getSunlightAssistPolicy = (): SunlightAssistPolicy =>
  sunlightAssistPolicy.value;

/**
 * Subscribe to policy changes. The `useSyncExternalStore` half of the pair —
 * returns its own unsubscribe, so a component can pass it straight through.
 */
export const subscribeSunlightAssistPolicy = (
  onChange: () => void
): (() => void) => {
  policyListeners.add(onChange);
  return () => {
    policyListeners.delete(onChange);
  };
};

/** Set the policy in force. The assist control's only write surface. */
export const setSunlightAssistPolicy = (next: SunlightAssistPolicy): void => {
  if (sunlightAssistPolicy.value === next) return;
  sunlightAssistPolicy.value = next;
  for (const listener of policyListeners) listener();
};

/**
 * Ceiling on the fused scalar when **no tone-mapping operator is mounted**.
 *
 * `PostProcessingPipeline.tsx` mounts a `ToneMapping` pass only on
 * composer-capable tiers AND only when the user's operator is not `"none"`;
 * the `constrained` tier unmounts the whole `EffectComposer`. Without an
 * operator the pipeline has no shoulder: anything above 1.0 hard-clips to
 * flat white, and worse, `Bloom`'s `luminanceThreshold = 1.0` contract
 * (`PostProcessingPipeline.tsx`) treats those surfaces as emissive and wraps
 * them in a halo. `"assisted"` puts Mercury at ~2.27 and `"real"` at ~10.4,
 * so both would trip it.
 *
 * This is a **display-clipping guard, not a photometric statement**: values
 * above 1.0 are unrepresentable on that path anyway, so the cap removes the
 * bloom artefact without discarding anything the viewer could have seen. It
 * is inactive whenever an operator is mounted, which is the default on every
 * composer tier (AgX — see `PRESET_DEFAULTS` in `resolver.ts`).
 *
 * Satisfies `handoffiluminacao.md` §6 checklist item 4 ("gain ≠ 1 requires a
 * mounted tone-mapping operator, or a cap below the bloom threshold").
 */
export const SUNLIGHT_UNMAPPED_CEILING = 1;

/**
 * Whether a tone-mapping operator is currently mounted in the composer.
 *
 * Written by `PostProcessingPipeline.tsx` itself — the component that makes
 * the mount decision — so this flag cannot drift from the pipeline it
 * describes. Starts `false`, which is also the correct value for the
 * `constrained` tier, where that component never mounts at all and therefore
 * never runs the effect that would set it.
 */
export const sunlightToneMappingMounted: { value: boolean } = { value: false };

/** Read the mount flag. Pure, alloc-free, safe on the hot path. */
export const getSunlightToneMappingMounted = (): boolean =>
  sunlightToneMappingMounted.value;

/** Set the mount flag. `PostProcessingPipeline`'s only write surface. */
export const setSunlightToneMappingMounted = (mounted: boolean): void => {
  sunlightToneMappingMounted.value = mounted;
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
 * Each position is defined by the FUSED result it produces, and the gain is
 * whatever gets there from `E`:
 *
 *   - `"compensated"` → fused 1: gain is the exact inverse `1 / E`.
 *   - `"assisted"`    → fused `E^σ`: gain is `E^(σ-1)`.
 *   - `"real"`        → fused `E`: gain is exactly 1, an IEEE-754 identity,
 *     which is what makes "no assist ≡ pure physics" a bit-level claim rather
 *     than an approximate one.
 */
export const resolveAssistGain = (
  irradiance: number,
  policy: SunlightAssistPolicy
): number => {
  switch (policy) {
    case "compensated":
      return 1 / irradiance;
    case "assisted":
      return Math.pow(irradiance, SUNLIGHT_ASSIST_EXPONENT - 1);
    case "real":
      return 1;
  }
};

/**
 * The fused scalar a planet material multiplies its direct sunlight by:
 * `E(d) × assistGain(d)`, capped at {@link SUNLIGHT_UNMAPPED_CEILING} when no
 * tone-mapping operator is mounted to roll values above 1.0 off.
 *
 * Named argument, because the one thing that must never happen to this
 * function is being handed a world-space distance — `resolveFusedSunlightScalar(d)`
 * reads fine at a call site holding either kind of number, and
 * `{ heliocentricDistanceAU: d }` does not.
 */
export const resolveFusedSunlightScalar = ({
  heliocentricDistanceAU,
  policy = getSunlightAssistPolicy(),
  toneMapped = getSunlightToneMappingMounted(),
}: {
  heliocentricDistanceAU: number;
  policy?: SunlightAssistPolicy;
  /**
   * Whether a tone-mapping operator will roll off values above 1.0. Defaults
   * to the live pipeline flag; passed explicitly by tests.
   */
  toneMapped?: boolean;
}): number => {
  const irradiance = solarIrradianceAtAU(heliocentricDistanceAU);
  const fused = irradiance * resolveAssistGain(irradiance, policy);
  return toneMapped ? fused : Math.min(fused, SUNLIGHT_UNMAPPED_CEILING);
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
  policy: SunlightAssistPolicy = getSunlightAssistPolicy(),
  toneMapped: boolean = getSunlightToneMappingMounted()
): number =>
  resolveFusedSunlightScalar({
    heliocentricDistanceAU: resolveHeliocentricDistanceAU(bodyId, date),
    policy,
    toneMapped,
  });
