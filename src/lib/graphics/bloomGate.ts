/**
 * T5.3a — Bloom mount/skip gate (Codex P2 QUIET).
 *
 * Ports Gaia Sky's `MainPostProcessor` Bloom enablement semantics
 * into a single pure predicate that atlas's PostProcessingPipeline
 * can use to conditionally mount the pmndrs `<Bloom />` effect.
 *
 * **Source** (`/tmp/gaiasky/core/src/gaiasky/render/MainPostProcessor.java:329-336`):
 * ```java
 * var bloom = new Bloom((int) (width * settings.postprocess.bloom.fboScale),
 *                       (int) (height * settings.postprocess.bloom.fboScale));
 * bloom.setBloomIntesnity(settings.postprocess.bloom.intensity);
 * bloom.setBlurPasses(10);
 * bloom.setBlurAmount(0);
 * bloom.setBloomSaturation(0.7f);
 * bloom.setThreshold(0.0f);
 * bloom.setEnabled(settings.postprocess.bloom.intensity > 0);  // ← the gate
 * ppb.add(bloom);
 * ```
 *
 * Gaia ALWAYS instantiates the Bloom effect and inserts it into the
 * post-process chain, but calls `setEnabled(intensity > 0)`. When
 * `bloom.intensity === 0` (Gaia's default per
 * `assets/conf/config.yaml:bloom.intensity: 0.0`), the effect is in
 * the chain but its pass is skipped by the composer. Net behavior:
 * zero CPU/GPU cost when the user hasn't explicitly asked for bloom.
 *
 * **Atlas architecture.** pmndrs `@react-three/postprocessing`
 * wraps its `Effect` instances as React components inside
 * `<EffectComposer>`. There is no stdlib-exposed `enabled` prop on
 * the `<Bloom>` component; the underlying `BloomEffect` does have a
 * mutable `.enabled` flag we could toggle per-frame via a ref, but
 * exposing that through atlas's existing `BloomController` ref
 * contract is more surface than necessary. The Gaia-equivalent
 * outcome — "pass runs zero work when intensity=0" — is also
 * achievable by simply NOT MOUNTING the `<Bloom>` component when
 * the intensity is 0. React / pmndrs then rebuilds the composer
 * pipeline without the Bloom stage, so the 5-mip downsample +
 * upsample + blend pass never executes.
 *
 * **One tradeoff**: mount/unmount forces a pmndrs composer rebuild
 * (new EffectPass, shader recompile) when the user drags the Bloom
 * slider from 0 → 0.1. A user-initiated action is the right moment
 * to pay a one-frame shader-compile hitch; it matches AAA UX for
 * "enabling an effect for the first time this session". Gaia pays
 * this hitch differently (keeps the program compiled but skips the
 * pass), which is theoretically cheaper for toggle-off/toggle-on
 * but adds to the always-compiled program count at startup.
 *
 * **1b invariant**: visual presets now ship non-zero
 * `bloomIntensity` per context (0.35 / 0.3 / 0.15 / 0.3 / 0.3 —
 * see `config/visualPresets.ts`), so a fresh atlas boot with no
 * DisplayPanel override MOUNTS bloom on composer tiers (ultra /
 * high / medium) by default. The gate call site in `Scene.tsx`
 * passes `effectiveGraphics.bloomIntensity ?? VISUAL_PRESETS[ visualPreset
 * ].bloomIntensity` — the `??` falls through to the visual preset base
 * when the user has no override, so the gate sees the non-zero base.
 * A user who drags Bloom Intensity to 0 sets
 * `graphicsOverrides.bloomIntensity = 0`, which `shouldMountBloom`
 * reads as `0 > 0 → false` and unmounts to save the 5-mip pass.
 * `low` (constrained) still skips via `bloomEnabled: false`.
 */

/**
 * Should the pmndrs `<Bloom />` effect be mounted into the
 * EffectComposer this frame?
 *
 * `bloomEnabled`: the quality-profile-level boolean. `false` on the
 * `low` preset and any explicit user override; skip outright.
 * `effectiveBloomIntensity`: the resolved post-preset-post-override
 * intensity value (see `resolver.ts` + `useVisualPresetLerp.ts`
 * composition). When `undefined` (no override, no preset value), we
 * treat it as 0 for the gate — safe default, matches Gaia's
 * `bloom.intensity` reading a zeroed `config.yaml` field.
 *
 * Gate logic matches `MainPostProcessor.java:335`: skip when
 * intensity is ≤ 0. Negative intensities are nonsensical but clamp
 * to "skip" defensively.
 */
export const shouldMountBloom = (
  bloomEnabled: boolean,
  effectiveBloomIntensity: number | undefined
): boolean => {
  if (!bloomEnabled) return false;
  if (effectiveBloomIntensity === undefined) return false;
  return effectiveBloomIntensity > 0;
};
