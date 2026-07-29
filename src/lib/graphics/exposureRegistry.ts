/**
 * Scene exposure registry — single source of truth for "this scene's
 * current operator-stop shift" before eye adaptation (1d) and the
 * photometric-EV readout (later waves) drive the number.
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
 * surface that lets eye-adaptation reach every family's INTERNAL
 * exposure term simultaneously, OR (current implementation) reach
 * the AgX operator alone, depending on each family's needs.
 *
 * ## 1c scope — minimum viable plumbing
 *
 * 1c ONLY ships:
 *   • the registry itself (this file)
 *   • the `ExposureBridge` that pushes `sceneExposure.value` into
 *     `gl.toneMappingExposure` every frame, so the AgX EffectPass
 *     (`ToneMappingEffect` from `@react-three/postprocessing`) reads
 *     it via `<tonemapping_pars_fragment>`'s `toneMappingExposure`
 *     uniform (three.js pushes the renderer value to any material
 *     that includes that chunk — the EffectPass does, see
 *     `node_modules/postprocessing` src/effects/ToneMappingEffect.js).
 *
 * The registry starts at `1.0` — **no visual change** versus the
 * pre-1c state. 1d (auto-eye-adaptation) will WRITE to this number;
 * sub-pulls after 1c may opt more shaders into per-subsystem
 * subscription if A/B testing shows the linear AgX-only scaling
 * produces the detachment the audit foresees.
 *
 * ## Composition rules
 *
 *   • Writing `sceneExposure.value = 0.5` from any caller (1d, etc.)
 *     propagates to every consumer the next frame via the same shared
 *     object reference — R3F + three.js don't share uniforms across
 *     materials by default, but a singletons `{ value }` is the
 *     cheapest opt-in coordination.
 *   • Setters clamp to `[1e-6, 16]` so a misbehaving caller cannot
 *     NaN the renderer (`* 0.0` would disable AgX; `* Infinity`
 *     would clip the buffer; both blocked defensively).
 *   • Default `1.0` is the "operator stop middle" position — no
 *     shift. Read `getSceneExposure()` from anywhere outside Canvas
 *     hot path (e.g., a Display-panel "−N EV @ X AU" readout) to
 *     surface the live value.
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
 *     not fixed.
 *   • Starfield — stars are not lit by our Sun. Correct as is.
 */

/**
 * The exposure shift, expressed as a multiplicative scalar on the
 * scene's pre-tonemap luminance. `1.0` is neutral.
 *
 * Held as a `{ value: T }` object so multiple consumers can hold a
 * reference and see live updates without each registering a
 * subscription.
 */
export const sceneExposure: { value: number } = { value: 1.0 };

/** Lower clamp — keeps the AgX pass compilable ("/0"-style paths would
 *  divide to a non-finite everywhere). */
export const SCENE_EXPOSURE_MIN = 1e-6;
/** Upper clamp — keeps any single stop shift from clipping the HalfFloat
 *  target wholesale before AgX runs (16 stops covers realistic eye
 *  adaptation plus photometric EV across the Solar System). */
export const SCENE_EXPOSURE_MAX = 16.0;

/**
 * Read the registry's current scalar. Pure, alloc-free; safe to call from
 * event handlers, UI surfaces, and the post-loop.
 */
export const getSceneExposure = (): number => sceneExposure.value;

/**
 * Mutator with safety clamp. Convergence-rate callers (1d
 * eye-adaptation, future photometric-EV) should route writes through
 * this so a stray NaN/Infinity does not poison the buffer.
 */
export const setSceneExposure = (next: number): void => {
  if (!Number.isFinite(next)) return;
  sceneExposure.value = Math.max(
    SCENE_EXPOSURE_MIN,
    Math.min(next, SCENE_EXPOSURE_MAX)
  );
};
