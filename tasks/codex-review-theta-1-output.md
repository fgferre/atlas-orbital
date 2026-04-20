**Findings**

- Alta — `src/components/canvas/Starfield.tsx` overstates the blend equivalence. The RGB path is only equivalent to Gaia Sky up to the point where Gaia does its final `saturate()`, and only because `alpha = vBrightness * profile <= 1` in your pipeline. The actual math is:
  `atlas RGB = alpha * (vColor + 2*core)` under `AdditiveBlending = SrcAlpha, One`;
  `Gaia RGB = clamp(alpha * (v_col.rgb + 2*core), 0, 1)` under `GL_ONE, GL_ONE`.
  So there is no `SrcAlpha` blindside on RGB itself, but the commit message's “exactly” claim is false once HDR is allowed through. On current repo defaults (`vfxHdrGain` 4.0 / 3.0 / 2.5 in `src/lib/qualityProfile.ts`), a center pixel with `alpha=1` and `core=1` lands around `6 / 5 / 4.5` per hot channel, whereas Gaia clamps that to `1`. Also, framebuffer alpha is not equivalent: three.js here accumulates roughly `dst.a + alpha^2`, Gaia would accumulate `dst.a + alpha`. If exact Gaia semantics matter, the revisit area is `CustomBlending`/premultiplied output, not the current “equivalent exactly” wording.

- Alta — the new kernel materially changes the HDR/bloom allow-list, and the tests do not cover that interaction. `src/lib/starfieldShaderMath.test.ts` still models bloom eligibility as `vColorChannel * vBrightness * gain`; after θ.1 the center pixel is `vBrightness * (gain * channel + 2)` when `core=1`. With current tier gains, that pushes stars around mag 8 over the 1.0 threshold on `ultra` and `high` (`0.22 * (4 + 2) = 1.32`, `0.22 * (3 + 2) = 1.10`), where the pre-θ.1 tests expected only brighter stars to bloom. That is the main HDR blindside, not `SrcAlpha`. Revisit area: add a small helper that models center-pixel contribution after the θ.1 core and re-pin the tier/magnitude boundaries explicitly.

- Média — `tasks/phase-gaia-sky.md` does not describe the shipped halo generator correctly. The plan says `OffscreenCanvas` and `exp(-(r/σ)^2)`. The patch actually ships a `THREE.DataTexture` from a `Uint8Array` and computes `exp(-r² / (2σ²))`. The missing `1/2` is not cosmetic; it changes the effective width a lot. This means the plan’s σ language is not source-of-truth for the shipped kernel. One-line doc fix:
  `Shape exp(-(r/σ)²)` → `Shape exp(-r² / (2σ²))`.

- Média — the L17 risk prose in `tasks/phase-gaia-sky.md` miscomputes the core footprint by 2x. The source threshold is `distance(vec2(0.5), uv) * 2.0 <= 0.04`, which means UV radius `0.02`, so pixel diameter is `0.04 * gl_PointSize`. At a 50 px sprite that is about `2 px`, not `4 px`. The current prose says “core diameter ≈ 4 px” and “8% of sprite width”; the code yields about `4%`. That does not break the shader, but it weakens the calibration argument you cite under L17. One-line doc fix:
  `core diameter ≈ 4 px` → `core diameter ≈ 2 px`.

- Baixa — the five new kernel tests are good anchors, but they still leave room for a non-Gaia monotone curve that matches `0`, `0.02`, and `0.04`. If the goal is to pin “this is smoothstep, not just any decreasing bump,” add one off-midpoint sample. The obvious one-line addition is:
  `approxEq(starfieldCoreKernel(0.01), 0.84375);`
  and optionally the symmetric `0.03 -> 0.15625`.

**Ambiguities**

- I do not see a defect in the fragment’s core math itself. On the axes you named, the ported shader is faithful on UV space, discard-by-profile, core edges `(0.0, 0.04)`, additive-to-RGB core composition, and `alpha = brightness/profile product`. The only fragment-level divergences I can defend are the existing atlas pipeline mismatch on `v_col.a` semantics and the explicitly documented HDR choice to drop Gaia’s final clamp.

- I do not see an R7 scope violation in deferring the Playwright harness or external reference capture. Those are adjacent verification surfaces, not the θ.1 effect core. The missing item that feels core-adjacent is not the deferred Playwright file itself; it is the missing unit coverage for the new bloom interaction.

- σ = 10 looks directionally plausible for a soft radial profile, and Gaia’s docs do indicate the default star texture option includes a “simple radial profile.” But I could not verify the actual `star-tex-NN` bitmap family in this session, so I would not call the width “Gaia-fidelity” yet, only “atlas-side tuning that is consistent with a radial sprite.”

**Summary**

Mixed verdict. The redo fixes the actual θ.1 source-fidelity failures that caused the rollback: the bogus `(0.45, 0.50)` core is gone, the core is added to RGB instead of alpha, and `billboard.fragment.glsl` is no longer being smuggled into θ.1. I do not see dead `pow(d,5)` behavior left in the patch itself.

The two things I would not let stand unqualified are the “exactly equivalent” blend claim and the unchanged HDR tests. Those are the parts most likely to mislead the next onda.

Sources checked: three.js material/blending docs at https://threejs.org/docs/pages/Material.html and Gaia Sky properties/docs snippet at https://gaia.ari.uni-heidelberg.de/gaiasky/docs/3.0.0/Properties-file.html. I could not run local tests or fetch the reviewed SHA from remote GitHub in this session, so this is a static review of the supplied patch plus current remote pipeline files.
