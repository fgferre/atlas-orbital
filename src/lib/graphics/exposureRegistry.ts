/**
 * Scene exposure registry — single source of truth for "this scene's
 * current operator-stop shift", composed from exactly TWO named factors.
 *
 * ## What this IS
 *
 * A {@link sceneExposure} mutable singleton reference shared by every
 * shader family that wants to participate in the SAME scene-wide
 * exposure shift. The number multiplies into each subsystem's OWN
 * calibrated exposure constant (AgX's `toneMappingExposure`, the
 * starfield's `u_exposure`, atmospheres' `exposureGround`/`exposureSky`,
 * the Sun's `sunEmissive`, the rings' `emissiveIntensity`) so the
 * per-subsystem calibration math stays untouched and one update here
 * propagates through every emissive surface in lockstep.
 *
 * ## Two factors, two writers, one product (Onda 2.4)
 *
 *     sceneExposure = anchor × adaptation
 *
 * Before Onda 2.4 there was one setter (`setSceneExposure`) and one
 * writer (`EyeAdaptationBridge`). Onda 2.4 added a second, physically
 * derived driver — the analytical radiometric anchor — and two writers
 * on one number is the "dois multiplicadores empilhados que depois
 * brigam" failure mode the lighting plan names by name
 * (`handoffiluminacao.md` §4, Onda 2), the same law
 * `solarIrradiance.ts` obeys by FUSING irradiance and assist gain
 * before either reaches a shader. So the composition is structural
 * here, not conventional: each driver owns one factor, neither can
 * observe or overwrite the other's, and the product is recomputed on
 * every write.
 *
 *   • **{@link setExposureAnchor} — the analytical factor.** Owned by
 *     `AutoExposureBridge`. A pure function of the FOCUSED body's
 *     heliocentric distance and the active assist policy
 *     (`autoExposure.ts`): `anchor = 1 / fusedSunlightScalar(focus)`,
 *     so the focused body always lands at reference display
 *     brightness — a camera exposes for its subject. Unfocused ⇒ 1.
 *     This is the number that answers `handoffiluminacao.md` §5.3
 *     ("âncora radiométrica: o que significa 0 EV fisicamente").
 *
 *   • **{@link setExposureAdaptation} — the measured refinement.**
 *     Owned by `EyeAdaptationBridge` (1d). Bounded to ±1 stop
 *     ({@link EXPOSURE_ADAPTATION_MIN}…{@link EXPOSURE_ADAPTATION_MAX})
 *     so a measured loop can trim glare AROUND the anchor but can
 *     never relocate it. See {@link EXPOSURE_ADAPTATION_MIN} for why
 *     that specific bound and why the measured loop was kept at all
 *     rather than disabled.
 *
 * ## Why a registry at all (audit fable-5)
 *
 * Half a dozen exposure-like constants live across the repo (atmos
 * `1 - exp(-scatter * exposure_atmos)`, starfield `u_exposure`, Sun
 * `SUN_EMISSIVE_POWER`, rings `RING_EMISSIVE_POWER`) — each with its
 * own physical justification. Without a registry, an eye-adaptation
 * pass scaling the AGX operator's `toneMappingExposure` ONLY would
 * shift the buffer uniformly *after* every per-subsystem exposure
 * baked in. The audit (fable-5) flagged this as the "halo da Terra
 * descola da superfície" failure mode: atmos output is non-linear in
 * its own exposure constant, so linear scaling at the AgX stage can
 * move the bright limb differently from the surface and produce a
 * visibly detached glow. The registry is the opt-in coordination
 * surface that lets exposure drivers reach every family's INTERNAL
 * exposure term simultaneously, OR (current implementation) reach
 * the AgX operator alone, depending on each family's needs.
 *
 * ## The transport
 *
 * `ExposureBridge` pushes `sceneExposure.value` into
 * `gl.toneMappingExposure` every frame, so the AgX EffectPass
 * (`ToneMappingEffect` from `@react-three/postprocessing`) reads
 * it via `<tonemapping_pars_fragment>`'s `toneMappingExposure`
 * uniform (three.js pushes the renderer value to any material that
 * includes that chunk — the EffectPass does, see
 * `node_modules/postprocessing` src/effects/ToneMappingEffect.js;
 * every non-Linear branch of three's chunk, AgX at line 113 included,
 * multiplies by it).
 *
 * **This number is a no-op wherever no tone-mapping operator is
 * mounted** — the `constrained` tier unmounts the whole
 * `EffectComposer`, and `gl.toneMapping === NoToneMapping` means
 * three never even emits the chunk into scene materials. That is why
 * the headless boot pixel baseline is structurally immune to
 * everything in this file.
 *
 * ## Composition rules
 *
 *   • Writing a factor propagates to every consumer the next frame via
 *     the same shared object reference — R3F + three.js don't share
 *     uniforms across materials by default, but a singleton `{ value }`
 *     is the cheapest opt-in coordination.
 *   • Both setters clamp, and the product clamps again, so a
 *     misbehaving caller cannot NaN the renderer (`* 0.0` would
 *     disable AgX; `* Infinity` would clip the buffer; both blocked
 *     defensively).
 *   • Default `1.0 × 1.0 = 1.0` is the "operator stop middle"
 *     position — no shift. Read `getSceneExposure()` from anywhere
 *     outside the Canvas hot path (e.g. a Display-panel "−N EV @ X AU"
 *     readout) to surface the live value.
 *
 * ## Deferred: emissive families vs. per-body solar irradiance (Onda 2.1)
 *
 * `solarIrradiance.ts` + `solarIrradiancePatch.ts` shipped a per-body
 * `irradiance × assistGain` scalar that multiplies **direct sunlight
 * only**, by wrapping `RE_Direct` on the planet materials. Every
 * luminance source that does NOT flow through a direct light is
 * therefore outside it, and will not follow a body as its irradiance
 * changes once the assist default flips to `"real"`:
 *
 *   • Sun disc — `sunEmissive` on a `MeshBasicMaterial`
 *     (`usePlanetMaterials.ts`, star branch) and `ProceduralSun3D`.
 *     `toneMapped: false`, so it also bypasses THIS registry entirely:
 *     the Sun stays saturated at any exposure. Physically right — the
 *     adapted eye still cannot look at the Sun from Neptune.
 *   • Earth night lights — `uNightLightIntensity`, added to
 *     `totalEmissiveRadiance` (`usePlanetMaterials.ts`, Earth branch).
 *   • Atmosphere shell — its own `ShaderMaterial` ignores scene lights
 *     entirely and carries hardcoded `exposureGround` / `exposureSky`
 *     (`atmscatteringSnippet.ts`).
 *   • Cloud layer — lit via a `MeshStandardMaterial` but composited
 *     with a COLOR blend (`ONE / ONE_MINUS_SRC_COLOR`) that is NOT
 *     invariant to luminance scale: `src > 1` produces a negative
 *     factor and subtractive artefacts. Scaling it needs the blend
 *     decision revisited, not just a uniform.
 *   • Ring emissive — `ringEmissive` / `RING_EMISSIVE_POWER`.
 *   • Starfield — `u_exposure` is set once at material construction
 *     (`Starfield.tsx`'s `useMemo`) from `starExposure()` and never
 *     re-reads `sceneExposure`; it is NOT a registry participant. The
 *     starfield still tracks scene-wide exposure shifts correctly today
 *     because `ExposureBridge` drives `gl.toneMappingExposure`, which
 *     scales the whole rendered buffer (stars included) after the fact —
 *     so behaviour is fine, only this line's "already wired" claim
 *     was wrong.
 *
 * **Decided when the default flipped to `"assisted"` (Onda 2.2): all six
 * stay body-independent, deliberately, and none of them joins the
 * irradiance term in that change.** The reasoning is per family and it
 * is not "we ran out of time":
 *
 *   • Sun disc — it is the SOURCE. Its own surface radiance does not
 *     fall off with the distance to whoever is looking at it; only the
 *     apparent size does, which the projection already handles.
 *   • Earth night lights — city lights are not sunlight. Scaling them
 *     by Earth's solar irradiance would dim a lamp because the Sun is
 *     far away, which is backwards.
 *   • Atmosphere shell + cloud layer — these DO need to follow, and
 *     cannot yet: the atmosphere's ShaderMaterial ignores scene lights
 *     and carries hardcoded exposures, and the cloud COLOR blend is not
 *     invariant to luminance scale. Both are real pending work, and
 *     both are bounded today because `SUNLIGHT_ASSIST_EXPONENT = 0.35`
 *     keeps Earth (the only body with either) at exactly 1.0 — the
 *     fixed point of every position. The detachment becomes visible the
 *     first time another atmosphere body ships, or if the anchor moves.
 *   • Ring emissive — Saturn only; same 9.6 AU as its planet, so it
 *     detaches by a constant factor rather than a varying one. Recorded,
 *     not fixed. **Onda 2.4 makes this visible**: focusing Saturn in
 *     `"real"` now sets the anchor to ~89, which lifts the constant
 *     ring emissive by the same 89× while the planet's own surface
 *     stays at reference. Owed to the rings wave (W5-B).
 *   • Starfield — stars are not lit by our Sun. Correct as is. They DO
 *     scale with this registry (via `toneMappingExposure`), so a
 *     high-anchor focus lifts the whole sky — a dark-adapted observer's
 *     sky, and the honest consequence of exposing for a dim subject.
 */

/**
 * The exposure shift, expressed as a multiplicative scalar on the
 * scene's pre-tonemap luminance. `1.0` is neutral.
 *
 * **Derived, never assigned from outside this module** — it is
 * `anchor × adaptation`, recomputed by {@link setExposureAnchor} /
 * {@link setExposureAdaptation}. Held as a `{ value: T }` object so
 * multiple consumers can hold a reference and see live updates without
 * each registering a subscription.
 */
export const sceneExposure: { value: number } = { value: 1.0 };

/** Lower clamp — keeps the AgX pass compilable ("/0"-style paths would
 *  divide to a non-finite everywhere). */
export const SCENE_EXPOSURE_MIN = 1e-6;

/**
 * Upper clamp — **structurally derived, not a taste number**.
 *
 * It is exactly `SOLAR_IRRADIANCE_MAX_AU²` = `1000² = 1e6`, i.e. the
 * reciprocal of the smallest irradiance `solarIrradiance.ts` can
 * produce (`solarIrradianceAtAU` clamps its input distance to
 * `SOLAR_IRRADIANCE_MAX_AU = 1000 AU`). Pinned to that identity by
 * `exposureRegistry.test.ts` so the two modules cannot drift apart.
 *
 * ## Why it had to move, and why *this* far
 *
 * The pre-Onda-2.4 ceiling was **16**, chosen when the only writer was
 * eye adaptation and every value it could produce sat in `[0.165, 1]`.
 * The analytical anchor asks for `1 / E`, which is `d²` in AU:
 *
 * | focus (real policy) | d (AU) | anchor |
 * |---------------------|--------|--------|
 * | Jupiter             | 5.2    | ~27    |
 * | Saturn              | 9.45   | ~89    |
 * | Neptune             | 30.1   | ~906   |
 * | Pluto               | ~35    | ~1200  |
 * | Eris (aphelion)     | ~97.6  | ~9500  |
 * | Sedna (aphelion)    | ~970   | ~941k  |
 *
 * A ceiling of 16 would have clipped everything from Jupiter outward —
 * i.e. would have silently reproduced the exact defect Onda 2.4 exists
 * to fix (Saturn and Jupiter as pitch-black discs in "True
 * brightness"). Any *round* replacement (4096, 65536) still clips SOME
 * catalog body and therefore still breaks the anchor's one invariant —
 * `fused × exposure ≡ 1` for the focused body — for that body only,
 * which is the worst kind of bound: correct almost everywhere and
 * silently wrong at the edge. Tying the ceiling to the irradiance
 * module's own distance clamp makes the invariant hold for **every**
 * body the catalog can ever contain, by construction.
 *
 * ## Is 1e6 safe downstream?
 *
 * Yes, and it is reachable only by focusing Sedna near aphelion in
 * `"real"`. `gl.toneMappingExposure` is consumed exclusively by the
 * `ToneMappingEffect` fragment shader, which three compiles at
 * `precision highp float` (float32 — WebGL2 mandates highp in fragment
 * shaders), so `color *= 1e6` cannot overflow. AgX then clamps
 * `log2(color)` into its `[-12.47, 4.026]` EV window before the
 * sigmoid, so even a zero-luminance pixel resolves to the operator's
 * black instead of a NaN. The composer's own buffers never see the
 * multiplied value — AgX outputs `[0, 1]`.
 */
export const SCENE_EXPOSURE_MAX = 1e6;

/**
 * Lower bound on the measured refinement factor — one stop of trim.
 *
 * ## Why the measured loop survives at all
 *
 * 1d's `exposureFromAdaptedLuminance` returns `TARGET / max(L, TARGET)`
 * with `TARGET = STAR_DISPLAY_BLACK_POINT = 0.165`, i.e. a value in
 * `(0, 1]` that is **1.0 for the overwhelming majority of frames** (a
 * mostly-black solar-system frame averages far below 0.165 in the
 * library's 1×1 mip, so the floor pins it) and only dips when
 * something genuinely blows out the frame — the Sun in view, a close
 * inner-planet pass. Read plainly: its real contribution today is
 * *glare protection*, not exposure placement. That is orthogonal to
 * what the anchor does, and worth keeping.
 *
 * ## Why it could not stay as-is
 *
 * As an ABSOLUTE writer it answered a different question than the
 * anchor ("put the frame average at 0.165" vs "put the focused body at
 * reference") and the last writer of the frame won. It is now a
 * multiplier instead, which is also the honest reading of a
 * biological eye adapting *around* a scene it is already exposed for.
 *
 * ## Why ±1 stop
 *
 * One stop is the largest trim that cannot change which body reads as
 * brighter than which — the ordering claim `"assisted"`/`"real"` make
 * is that irradiance RATIOS survive, and the smallest ratio between
 * adjacent catalog bodies is well over 2:1. A wider window could
 * invert a pair as the measured average drifts; a narrower one makes
 * the glare protection useless where the Sun is in frame. The measured
 * loop can only DIM (its own output is ≤ 1), so the upper bound is
 * headroom for a future opt-in brightening, not something 1d reaches.
 *
 * The measured signal itself is NOT a feedback loop through this
 * registry: `AdaptiveLuminancePass` samples the composer's HDR input
 * buffer, which is upstream of the `ToneMappingEffect` that consumes
 * `toneMappingExposure`. Raising the anchor therefore does not feed
 * back into the measurement.
 */
export const EXPOSURE_ADAPTATION_MIN = 0.5;

/** Upper bound on the measured refinement factor — see {@link EXPOSURE_ADAPTATION_MIN}. */
export const EXPOSURE_ADAPTATION_MAX = 2.0;

/** The analytical anchor factor. Written only by `AutoExposureBridge`. */
const exposureAnchor = { value: 1.0 };
/** The measured refinement factor. Written only by `EyeAdaptationBridge`. */
const exposureAdaptation = { value: 1.0 };

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

/** Recompute the product. The ONLY place `sceneExposure.value` is assigned. */
const recomposeSceneExposure = (): void => {
  sceneExposure.value = clamp(
    exposureAnchor.value * exposureAdaptation.value,
    SCENE_EXPOSURE_MIN,
    SCENE_EXPOSURE_MAX
  );
};

/**
 * Read the registry's current scalar. Pure, alloc-free; safe to call from
 * event handlers, UI surfaces, and the post-loop.
 */
export const getSceneExposure = (): number => sceneExposure.value;

/** Read the analytical anchor factor alone (readouts, tests). */
export const getExposureAnchor = (): number => exposureAnchor.value;

/** Read the measured refinement factor alone (readouts, tests). */
export const getExposureAdaptation = (): number => exposureAdaptation.value;

/**
 * Set the analytical radiometric anchor — `AutoExposureBridge`'s only
 * write surface. Clamped to the registry's full range; non-finite
 * inputs are ignored rather than propagated into the renderer.
 */
export const setExposureAnchor = (next: number): void => {
  if (!Number.isFinite(next)) return;
  exposureAnchor.value = clamp(next, SCENE_EXPOSURE_MIN, SCENE_EXPOSURE_MAX);
  recomposeSceneExposure();
};

/**
 * Set the measured refinement factor — `EyeAdaptationBridge`'s only
 * write surface. Clamped to ±1 stop so a measured loop can trim glare
 * around the anchor but never relocate it.
 */
export const setExposureAdaptation = (next: number): void => {
  if (!Number.isFinite(next)) return;
  exposureAdaptation.value = clamp(
    next,
    EXPOSURE_ADAPTATION_MIN,
    EXPOSURE_ADAPTATION_MAX
  );
  recomposeSceneExposure();
};

/**
 * Reset both factors to neutral. Test-support only — the app has no
 * "turn exposure off" affordance, and neither bridge ever needs it.
 */
export const resetSceneExposure = (): void => {
  exposureAnchor.value = 1.0;
  exposureAdaptation.value = 1.0;
  recomposeSceneExposure();
};
