No Alta findings. I would carry four items forward.

1. Média — `a_size` synthesis is a justified stack/API adaptation, but it is still materially farther from Gaia than the commit message suggests for bright giants/supergiants.
   a. Divergence: Gaia consumes a per-star `a_size` directly in `assets/shader/star.group.quad.vertex.glsl` via `solidAngle = a_size / dist;`. Atlas synthesizes `a_size` from `bvToRadiusPc(ci)` in `src/lib/starPhysics.ts` and uploads it in `src/components/canvas/Starfield.tsx`. The current HYG runtime binary only carries `positions`, `magnitudes`, `colorIndices`, `pmRA`, `pmDec` in `src/utils/hygBinary.ts`, so this is a real data-gap adaptation, not pure invention.
   b. TIGHTEN / LOOSEN: TIGHTEN.
   c. Fix: keep the current B-V lookup as a temporary stack/API bridge, but do not treat the giant/supergiant miss as safely negligible. For 1:1 parity, escalate the ingest path to preserve more stellar-state and derive radius from actual HYG data. The plan-approved tightening path is Stefan-Boltzmann from `absMag + B-V -> Teff`, or carrying spectral/luminosity class into the binary. My inference: a magnitude-limited catalog keeps many prominent giants, so main-sequence-only radii will compress exactly the bright anchor stars users will compare against Gaia.

2. Baixa — the upper solid-angle clamp was turned into an atlas-owned knob even though Gaia hardcodes it.
   a. Divergence: Gaia clamps with a literal upper bound in `star.group.quad.vertex.glsl`: `clamp(..., u_minQuadSolidAngle, 3.0e-8);`. Atlas introduces `u_maxQuadSolidAngle` in the GLSL and `U_MAX_QUAD_SOLID_ANGLE` in `src/lib/starfieldShaderMath.ts`.
   b. TIGHTEN / LOOSEN: TIGHTEN.
   c. Fix: inline `3.0e-8` in the shader and TS mirror, keep only `u_minQuadSolidAngle` as the runtime uniform. This is closer to source and removes an unnecessary parity-loosening surface. I would classify the extra runtime knob as invention in disguise, not a necessary atlas adaptation.

3. Baixa — dead `mag` plumbing remains after the NASA-Eyes curve was removed.
   a. Divergence: Gaia’s quad vertex has no magnitude attribute in the source block you inlined. Atlas still declares `attribute float mag;` in `src/components/canvas/Starfield.tsx`, still builds `magArray`, and still uploads `geom.setAttribute("mag", ...)`, but the new solid-angle path never reads it.
   b. TIGHTEN / LOOSEN: TIGHTEN.
   c. Fix: remove the `mag` shader attribute, `magArray`, and the uploaded buffer attribute. That tightens the attribute set toward Gaia and removes one orphaned per-vertex upload.

4. Baixa — the most important atlas-only adaptation is still unpinned by tests.
   a. Divergence: Gaia uses `billboard.stretch.glsl` world-space quads; atlas substitutes `gl_PointSize = solidAngle * u_sizeFactor * projectionMatrix[1][1] * u_viewportHeight * 0.5`. The new tests in `src/lib/starfieldShaderMath.test.ts` pin solid-angle mapping, boundary fade, and precision wrappers, but not the pixels-per-radian conversion or the DPR feed.
   b. TIGHTEN / LOOSEN: TIGHTEN.
   c. Fix: add one pure unit around `pixelsPerRadian = cot(fov/2) * renderBufferHeight / 2`, plus one host-side pin that `u_viewportHeight` uses `size.height * gl.getPixelRatio()`. That is the critical stack/API adaptation and deserves a direct guard.

Direct answers on the nine axes:

1. Vertex math fidelity: the core port is otherwise good. `solidAngle = a_size / dist` is source-faithful aside from the harmless `max(dist, 1e-20)` safety guard, which I classify as stack/API robustness. `lint_ss` matches `lib/math.glsl` exactly. `degrees12` / `radians12` are structurally correct and use the right `180.0e12 / PI` form. `boundaryFade = smoothstep(LEN0, LEN0 * 1000, dist)` is the correct direction, and the `alpha <= 1e-3 || dist < LEN0` null branch is equivalent to Gaia’s line-121 behavior. The only real math-surface divergence I’d flag is the uniformized upper clamp.

2. `gl_PointSize` conversion: yes, the formula is the correct pixels-per-radian conversion for a perspective camera. `projectionMatrix[1][1]` is `cot(fovY/2)`, so `solidAngle * cot(fovY/2) * renderBufferHeight / 2` is the right small-angle pixel size. Using `u_viewportHeight = size.height * gl.getPixelRatio()` is also the correct DPR feed and matches L17.

3. `a_size` synthesis: legitimate stack/API adaptation, not invention in disguise, because the shipped HYG runtime format no longer exposes radius, spectral class, or absMag. The lookup values are coarse but reasonable as main-sequence typologies. The weak point is not the numbers themselves, it is the assumption that main-sequence radii are good enough for a parity target.

4. Retired NASA math: on the atlas side, the old HYG/NASA-equivalent helper path is gone from the ported file. The surviving NASA reference path is still live by design through `NASAStarfield.tsx`, `nasaStarShaders.ts`, `useStarfieldParticleSize.ts`, `StarfieldManager.tsx`, `store.ts`, and `LayersPanel.tsx`. I could not run a local grep in this session because the shell was blocked, so that part is based on the inspected adjacent files plus the diff.

5. Known side-effect disclosure: the qualitative claim is right. Raw point size is subpixel for most stars under this mapping, which is consistent with Gaia’s vertex relying on later glow/composer work for visible halos. The specific “Sirius at ~2e-4 px” number is not universal because it depends on FOV and render-buffer height; under many desktop FOVs it will actually be even smaller. That does not point to a size-conversion bug.

6. L-lessons: L15 yes, L17 yes, L14 yes, L13 yes.

7. Scope-cut honesty: deferring `NASAStarfield` deletion is an adjacent-surface R7 cut, not a forbidden cut on θ.1b’s core effect.

8. Test coverage: the missing critical pin is the screen-space conversion and DPR wiring. I would also want one explicit regression that the solid-angle path is independent of the old `mag` attribute, once that dead path is removed.

9. Dead code: beyond the intentional NASA deferral, the clear orphan is the unused `mag` attribute path on the HYG starfield.

Net: the port moves atlas toward Gaia on the core vertex math. The two changes that most tighten parity are removing the invented upper-clamp uniform and treating the current `a_size` synthesis as temporary rather than “good enough” for bright-star parity.
