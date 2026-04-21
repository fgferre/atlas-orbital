Reading additional input from stdin...
OpenAI Codex v0.121.0 (research preview)

---

workdir: C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital
model: gpt-5.4
provider: openai
approval: never
sandbox: read-only
reasoning effort: high
reasoning summaries: none
session id: 019db01b-d6ab-7d80-9fbc-892d128def20

---

user
You are auditing the Gaia Sky LightGlow post-process port (θ.3) that
just landed in atlas-orbital. Goal: detect any drift from the Gaia
Sky source implementation that would keep the atlas port from
rendering a 1:1 halo around the Sun and the top-N bright stars.

## Context

atlas-orbital is porting Gaia Sky's star-rendering subsystem to
Three.js / R3F / TypeScript. Phase θ.3 ports the LightGlow post-
process pass — the soft, time-animated halo on bright stars that
gives Gaia Sky its "alive" look. Prior phases (θ.1 / θ.1b) ported
the fragment kernel, vertex solid-angle math, pseudo-size formula,
billboard-quad rendering, color pipeline, and fragment saturate.

Gaia Sky source lives at /tmp/gaiasky. Key files:

- `assets/shader/postprocess/lightglow.frag.glsl` (99 LOC) — the
  polar-masked halo shader
- `assets/shader/postprocess/lightglow.vert.glsl` (77 LOC) — the
  Archimedean spiral vertex-stage luma sampler
- `core/src/gaiasky/render/postprocess/effects/LightGlow.java` — the
  Effect wrapper
- `core/src/gaiasky/render/postprocess/filters/GlowFilter.java` —
  the Filter that binds uniforms
- `core/src/gaiasky/render/system/LightPositionUpdater.java` — the
  per-frame light registry that feeds positions / solidAngles / colors
- `core/src/gaiasky/scene/system/update/GraphUpdater.java:182` — the
  body.solidAngleApparent = solidAngle × star.brightness / fovFactor
  formula that produces the `u_lightViewAngles` values
- `core/src/gaiasky/render/MainPostProcessor.java:214-227` +
  `:540-562` — the Effect wiring, default values, and texture-scale
  formulas
- `assets/conf/config.yaml` — `lightGlow.active: true`, `samples: 10`,
  `scene.star.brightness: 2.22`, `star.glowFactor: 0.055`
- `core/src/gaiasky/util/Settings.java:672` — tier-nLights map
  (low 4 / normal 5 / high 6 / ultra 8)

## Atlas implementation (under audit)

Files to read:

- `src/lib/lightRegistry.ts` + `.test.ts` — CPU-side light selection
  (Sun always slot 0 + top-N HYG by clamped solid angle), NDC
  projection, per-frame `updateLightRegistry()` entrypoint.
- `src/components/canvas/scene/effects/LightGlowEffect.ts` — the
  ported shader as a pmndrs `Effect` subclass. 1:1 port of Gaia's
  fragment with the Archimedean spiral moved from vertex-stage to
  fragment-stage (documented inside the file as a
  correctness-preserving move because the computation is
  uniform-constant per frame).
- `src/components/canvas/scene/effects/lightGlowSprite.ts` —
  procedural gaussian replacement for Gaia's `star-tex-01.png`.
- `src/components/canvas/scene/effects/lightGlowMath.ts` +
  `.test.ts` — executable mirrors of the polar mask + halo-size
  formulas.
- `src/components/canvas/scene/LightGlowInjector.tsx` — React
  wrapper (`LightGlowSlot`) that creates the effect, drives its
  uniforms each frame via `useFrame`, and enforces the
  reduced-motion gate.
- `src/components/canvas/scene/PostProcessingPipeline.tsx` — where
  `LightGlowSlot` gets mounted as the FIRST child of
  `<EffectComposer>` (ahead of Bloom).
- `tasks/phase-gaia-sky.md §5 θ.3` — plan section with
  "Implementation notes" capturing the drift we caught during
  self-check (`solidAngleApparent` was initially post-clamp; fixed
  pre-ship to match `GraphUpdater.java:182`).

## Your audit questions

### Part 1: Shader correctness (most important)

1. **Polar mask formula** — does the TS + GLSL `polarMask(uv, time)`
   match `lightglow.frag.glsl:40-65` exactly? Check:
   - The three sinusoidal terms with frequencies 12, 37, 59.
   - Time multipliers 2.0, -1.3, 1.6.
   - `minVal = 0.55` floor.
   - Centre smoothstep `smoothstep(0.85, 1.0, 1.0 - r)`.

2. **Spiral sampling loop** — the vertex→fragment migration. Does
   the inlined loop at the top of `mainImage` in
   `LightGlowEffect.ts` compute the same `v_lums[li]` that Gaia's
   vertex shader would (given identical inputs)? Check:
   - `dt = 3π / nSamples`.
   - `fx(t, a) = a·t·cos(t)`, `fy(t, a) = a·t·sin(t)`.
   - Aspect-ratio division `fx / ar`.
   - Luma threshold `0.95` via `step(0.95, value)`.
   - Bonus post-loop sample (Gaia has one extra sample after the
     nSamples loop).
   - `lum /= nSamples` at the end.

3. **Halo rendering per light** — does the per-light halo math
   match `lightglow.frag.glsl:77-96` exactly? Check:
   - `viewAngle = min(0.0001, u_lightViewAngles[li])`.
   - `size = u_textureScale × min(1.6, viewAngle × 5e5) × lum`.
   - `glow_tc = (uv × u_backbufferScale - lightPositions[li])`,
     `glow_tc.x ×= ar`, `/= size`, `+= 0.5`.
   - `core_inc = (0.1 - min(0.1, dist_center)) × glow_value`.
   - Final accumulation into `effectColor`.

4. **ADD-blend vs saturate() divergence** — Gaia ends with
   `fragColor.rgb = saturate(effectColor + scene.rgb)`; atlas
   emits only `effectColor` and relies on pmndrs
   `BlendFunction.ADD`. The plan doc calls this a documented HDR-
   preservation divergence. Is this defensible, or does it cause a
   visible discrepancy?

### Part 2: Light registry correctness

5. **`solidAngleApparent` semantics.** Gaia's
   `GraphUpdater.java:182` sets `body.solidAngleApparent =
body.solidAngle × scene.star.brightness / camera.fovFactor` for
   stars. Atlas's `lightRegistry.ts` feeds `rawSolidAngle ×
STAR_BRIGHTNESS_DEFAULT` (2.22). We omit the `/fovFactor`
   divisor because the atlas camera uses a fixed 60° FOV
   (fovFactor = 1). Is this a real drift when the user zooms in
   via the FOV control?

6. **NDC projection coordinate system.** Gaia writes
   `positions[li*2] = auxV.x / w` where `auxV` comes from
   `camera.project(pos3, 0, 0, w, h)` — which uses Y-down screen
   coordinates. Three.js's `Vector3.project(camera)` returns NDC
   in [-1, 1] (Y-up). We rescale via `(x+1)*0.5, (y+1)*0.5`. Does
   our Y-up source produce positions correctly oriented for the
   shader's spiral-sampling `texture(u_texture0, u_lightPositions
   - ...)`which is definitely Y-up in a WebGL/Three.js texture
coordinate system? The shader comments mention viewport
coordinates at`LightPositionUpdater.java:121` — check for
     potential Y-flip.

7. **Tier mapping.** `LIGHT_GLOW_N_LIGHTS_BY_TIER` maps low/
   normal/high/ultra to 4/5/6/8 matching `Settings.java:672`. The
   atlas `tierForProfile` function in `LightGlowInjector.tsx`
   maps:
   - constrained → low
   - balanced → normal
   - high → high
   - ultra → ultra
     Is the mapping defensible, or is a quality profile missing?

8. **Sun always at slot 0.** Atlas unconditionally inserts the
   Sun first. Gaia's `LightPositionUpdater` loops backwards through
   the render proximity list, picking up any `Mapper.hip`-tagged
   entity — the Sun happens to be in that list but isn't
   guaranteed slot 0. Is our unconditional Sun slot an invented
   requirement, or a sensible adaptation given atlas's heliocentric
   scene?

9. **Tests** — run through `src/lib/lightRegistry.test.ts` and
   `src/components/canvas/scene/effects/lightGlowMath.test.ts`.
   Do the pins + expectations align with Gaia's source? Any test
   that would silently let a future regression through?

### Part 3: Composer integration

10. **Insertion position.** LightGlow is the FIRST child of
    `<EffectComposer>` in `PostProcessingPipeline.tsx`, per plan
    §5.1 (Gaia runs LightGlow before Bloom per
    `MainPostProcessor.java:227`). Verify this matches Gaia.

11. **Texture-scale + spiral-scale defaults.**
    `LIGHT_GLOW_DEFAULT_TEXTURE_SCALE = 2.22 × (0.055/0.06) × 0.2`
    ≈ 0.407 and `LIGHT_GLOW_DEFAULT_SPIRAL_SCALE = 2.22 × 3.0 ×
0.5e-4` ≈ 3.33e-4. These come from
    `MainPostProcessor.java:552-563`. Confirm the arithmetic +
    formula match (note the non-cubemap branch).

12. **Reduced-motion gate.** `<LightGlowSlot>` returns `null` when
    `state.accessibility.reducedMotion === true` so the effect
    never enters the composer. Is this a proper implementation of
    plan §4.2? Any leak where the effect's fragment cost might
    still run?

### Output format

Write a short report:

- **Summary** (1-2 sentences).
- **Verified 1:1** (bullet list of checks that pass).
- **Drifts found** (if any), priority-sorted, each with file:line
  - fix direction.
- **Unanswerable without runtime** (visual-only concerns, if any).

Cite Gaia Sky source file:line on all claims. Keep the report
focused — do not suggest scope extensions (θ.4 / θ.5 / θ.14 are
separate ondas in the sequence).

## Explicit non-goals

- Don't flag the fragment-stage spiral sampling as a drift —
  it's documented as a correctness-preserving re-arrangement.
- Don't flag the HDR ADD-blend as a drift beyond the one question
  in Part 1 Q4.
- Don't flag the procedural gaussian sprite as a drift unless it
  produces a visibly different halo profile than Gaia's
  `star-tex-01.png`.
  2026-04-21T12:55:08.825606Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Auth(TokenRefreshFailed("Failed to parse server response"))
  codex
  I’ll audit the local port against the Gaia Sky files and keep this read-only. I’ll first gather exact line references from both trees, then run the relevant tests if the sandbox permits execution.
  exec
  "C:\\Users\\fgfer\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'rg -n "polarMask|mainImage|v_lums|u_textureScale|LIGHT_GLOW_DEFAULT|BlendFunction|viewAngle|smoothstep|core_inc|u_lightViewAngles" src/components/canvas/scene/effects/LightGlowEffect.ts src/components/canvas/scene/effects/lightGlowMath.ts src/components/canvas/scene/effects/lightGlowMath.test.ts' in C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital
  exec
  "C:\\Users\\fgfer\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "rg -n \"lightGlow|GlowFilter|setLightGlow|nLights|textureScale|spiral|fovFactor|solidAngleApparent|positions\\[|project\\(\" /tmp/gaiasky/assets/shader/postprocess/lightglow.frag.glsl /tmp/gaiasky/assets/shader/postprocess/lightglow.vert.glsl /tmp/gaiasky/core/src/gaiasky/render/postprocess/effects/LightGlow.java /tmp/gaiasky/core/src/gaiasky/render/postprocess/filters/GlowFilter.java /tmp/gaiasky/core/src/gaiasky/render/system/LightPositionUpdater.java /tmp/gaiasky/core/src/gaiasky/scene/system/update/GraphUpdater.java /tmp/gaiasky/core/src/gaiasky/render/MainPostProcessor.java /tmp/gaiasky/core/src/gaiasky/util/Settings.java /tmp/gaiasky/assets/conf/config.yaml" in C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital
  exec
  "C:\\Users\\fgfer\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'rg -n "solidAngle|STAR_BRIGHTNESS|LIGHT_GLOW_N_LIGHTS|project|tierForProfile|Sun|sun|updateLightRegistry|slot" src/lib/lightRegistry.ts src/lib/lightRegistry.test.ts src/components/canvas/scene/LightGlowInjector.tsx src/components/canvas/scene/PostProcessingPipeline.tsx' in C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital
  2026-04-21T12:55:23.983830Z ERROR codex_core::exec: exec error: windows sandbox: runner error: CreateProcessAsUserW failed: 5
  2026-04-21T12:55:23.985454Z ERROR codex_core::tools::router: error=execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
  exited -1 in 0ms:
  execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
  2026-04-21T12:55:23.997124Z ERROR codex_core::exec: exec error: windows sandbox: runner error: CreateProcessAsUserW failed: 5
  2026-04-21T12:55:23.998999Z ERROR codex_core::tools::router: error=execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
  exited -1 in 0ms:
  execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
  2026-04-21T12:55:24.011903Z ERROR codex_core::exec: exec error: windows sandbox: runner error: CreateProcessAsUserW failed: 5
  2026-04-21T12:55:24.013084Z ERROR codex_core::tools::router: error=execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
  exited -1 in 0ms:
  execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
  codex
  The sandbox is refusing even read-only PowerShell process creation with `CreateProcessAsUserW failed: 5`. I’m going to try a simpler read command and, if local shell remains blocked, use the available file connectors only where they expose content.
  exec
  "C:\\Users\\fgfer\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command Get-Location in C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital
  2026-04-21T12:55:30.405344Z ERROR codex_core::exec: exec error: windows sandbox: runner error: CreateProcessAsUserW failed: 5
  2026-04-21T12:55:30.406844Z ERROR codex_core::tools::router: error=execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
  exited -1 in 0ms:
  execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
  codex
  Since local process execution is blocked, I’m switching to the GitHub connector for repository reads and public source lookup for Gaia Sky references. This still lets me audit code, but I won’t be able to run the tests locally unless the shell issue clears.
  mcp: codex_apps/github_search_installed_repositories_streaming started
  mcp: codex_apps/github_search_installed_repositories_streaming (completed)
  mcp: codex_apps/github_search_repositories started
  mcp: codex_apps/github_search_repositories (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (failed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (failed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (failed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (failed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  codex
  The GitHub default branch does not contain the θ.3 files, so this looks like a local or PR branch. I’m checking recent PRs/branches for the landed LightGlow work before falling back to reporting the local-read blocker.
  mcp: codex_apps/github_search_prs started
  mcp: codex_apps/github_search_prs (failed)
  mcp: codex_apps/github_search_branches started
  mcp: codex_apps/github_search_branches (completed)
  mcp: codex_apps/github_search_branches started
  mcp: codex_apps/github_search_branches (completed)
  mcp: codex_apps/github_search_prs started
  mcp: codex_apps/github_search_prs (completed)
  mcp: codex/list_mcp_resources started
  mcp: codex/list_mcp_resources (completed)
  exec
  "C:\\Users\\fgfer\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command Get-ChildItem in C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital
  2026-04-21T12:56:14.459808Z ERROR codex_core::exec: exec error: windows sandbox: runner error: CreateProcessAsUserW failed: 5
  2026-04-21T12:56:14.461194Z ERROR codex_core::tools::router: error=execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
  exited -1 in 0ms:
  execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
  mcp: codex_apps/github_search_commits started
  mcp: codex_apps/github_search_commits (completed)
  mcp: codex_apps/github_search_commits started
  mcp: codex_apps/github_search_commits (completed)
  mcp: codex_apps/github_search_commits started
  mcp: codex_apps/github_search_commits (completed)
  mcp: codex_apps/github_search_branches started
  mcp: codex_apps/github_search_branches (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  web search:
  web search:
  web search:
  web search: github langurmonkey gaiasky lightglow.frag.glsl
  mcp: codex_apps/github_search started
  mcp: codex_apps/github_search (completed)
  mcp: codex_apps/github_search started
  mcp: codex_apps/github_search (completed)
  mcp: codex_apps/github_search started
  mcp: codex_apps/github_search (completed)
  mcp: codex_apps/github_search started
  mcp: codex_apps/github_search (completed)
  web search:
  web search:
  mcp: codex_apps/github_fetch started
  mcp: codex_apps/github_fetch (completed)
  codex
  I’ve confirmed the Gaia Sky source side, including one important detail in `lightglow.vert.glsl`: the post-loop bonus sample is not identical to the loop sample because it uses `fy(t, a) * ar` and is unclamped. I still can’t read the local θ.3 files, so the final report will distinguish source-confirmed checks from local-unverified ones unless access resumes.
  codex
  **Summary**
  I could not complete a true local audit because every shell read failed with `CreateProcessAsUserW failed: 5`, and the θ.3 files are not on `fgferre/atlas-orbital@main`. I verified the Gaia Sky source side and found one source-confirmed drift risk plus one likely real drift from the user-provided atlas description.

**Verified 1:1**

- Gaia polar mask baseline: frequencies `12/37/59`, time multipliers `2.0/-1.3/1.6`, `minVal = 0.55`, and center `smoothstep(0.85, 1.0, 1.0 - r)` are exactly in `lightglow.frag.glsl` lines [46-68](https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/lightglow.frag.glsl#L46-L68).
- Gaia per-light halo baseline: `viewAngle = min(0.0001, ...)`, `size = u_textureScale * min(1.6, viewAngle * 5.0e5) * lum`, aspect-scaled `glow_tc`, `core_inc`, and final `saturate(effectColor + scene)` are in lines [72-98](https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/lightglow.frag.glsl#L72-L98).
- Gaia spiral sampler baseline: `dt = 3π / u_nSamples`, `fx/fy`, threshold `0.95`, loop accumulation, extra post-loop sample, and `lum /= u_nSamples` are in lines [40-73](https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/lightglow.vert.glsl#L40-L73).
- LightGlow precedes Bloom in Gaia’s post chain: LightGlow is added around [MainPostProcessor.java#L214-L227](https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/MainPostProcessor.java#L214-L227), Bloom later around [L309-L316](https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/MainPostProcessor.java#L309-L316).
- Tier n-light counts match Gaia’s quality map: low/normal/high/ultra = `4/5/6/8` in [Settings.java#L657-L676](https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/util/Settings.java#L657-L676).

**Drifts Found**

- **P1: FOV zoom drift in `solidAngleApparent`.** Gaia divides star apparent solid angle by `camera.getFovFactor()` in [GraphUpdater.java#L181-L183](https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/scene/system/update/GraphUpdater.java#L181-L183), and passes that value into LightGlow via [LightPositionUpdater.java#L121-L126](https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/system/LightPositionUpdater.java#L121-L126). If atlas uses `rawSolidAngle * 2.22` and omits `/ fovFactor`, it is only correct at the calibrated 60-degree FOV. Fix direction: feed the active camera FOV factor into `src/lib/lightRegistry.ts` and into texture/spiral scale uniforms when the FOV control changes.
- **P1 risk: bonus spiral sample must preserve Gaia’s odd Y scaling.** Gaia’s loop samples `vec2(fx(t,a) / ar, fy(t,a))`, but the extra post-loop sample uses `vec2(fx(t,a) / ar, fy(t,a) * ar)` and is not clamped, in [lightglow.vert.glsl#L62-L70](https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/lightglow.vert.glsl#L62-L70). If atlas normalized this to the loop formula, it is not a 1:1 port. Fix direction: mirror the post-loop sample exactly or document it as an intentional visual divergence.
- **Accepted divergence: ADD blend is not literal 1:1.** Gaia clamps `effectColor + texture(u_texture0)` in-shader at [lightglow.frag.glsl#L97](https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/lightglow.frag.glsl#L97). Atlas emitting `effectColor` with `BlendFunction.ADD` is defensible for HDR preservation, but it can visibly increase downstream Bloom/AgX energy versus Gaia’s clamped result.

**Unanswerable Without Runtime / Local Read**

- I could not inspect the atlas TS/GLSL lines, tests, reduced-motion gate, or actual composer ordering locally, and I could not run `lightRegistry.test.ts` or `lightGlowMath.test.ts`.
- Visual-only: procedural gaussian vs Gaia `star-tex-01.png`, HDR ADD intensity, and Y-orientation correctness need a matched screenshot/runtime check. Based on Gaia’s `camera.project(...)/w,h` write in [LightPositionUpdater.java#L116-L126](https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/system/LightPositionUpdater.java#L116-L126), Three’s `(ndc.y + 1) * 0.5` is the correct WebGL UV orientation; a `1 - y` flip would be wrong.
  tokens used
  171.940
  **Summary**
  I could not complete a true local audit because every shell read failed with `CreateProcessAsUserW failed: 5`, and the θ.3 files are not on `fgferre/atlas-orbital@main`. I verified the Gaia Sky source side and found one source-confirmed drift risk plus one likely real drift from the user-provided atlas description.

**Verified 1:1**

- Gaia polar mask baseline: frequencies `12/37/59`, time multipliers `2.0/-1.3/1.6`, `minVal = 0.55`, and center `smoothstep(0.85, 1.0, 1.0 - r)` are exactly in `lightglow.frag.glsl` lines [46-68](https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/lightglow.frag.glsl#L46-L68).
- Gaia per-light halo baseline: `viewAngle = min(0.0001, ...)`, `size = u_textureScale * min(1.6, viewAngle * 5.0e5) * lum`, aspect-scaled `glow_tc`, `core_inc`, and final `saturate(effectColor + scene)` are in lines [72-98](https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/lightglow.frag.glsl#L72-L98).
- Gaia spiral sampler baseline: `dt = 3π / u_nSamples`, `fx/fy`, threshold `0.95`, loop accumulation, extra post-loop sample, and `lum /= u_nSamples` are in lines [40-73](https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/lightglow.vert.glsl#L40-L73).
- LightGlow precedes Bloom in Gaia’s post chain: LightGlow is added around [MainPostProcessor.java#L214-L227](https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/MainPostProcessor.java#L214-L227), Bloom later around [L309-L316](https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/MainPostProcessor.java#L309-L316).
- Tier n-light counts match Gaia’s quality map: low/normal/high/ultra = `4/5/6/8` in [Settings.java#L657-L676](https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/util/Settings.java#L657-L676).

**Drifts Found**

- **P1: FOV zoom drift in `solidAngleApparent`.** Gaia divides star apparent solid angle by `camera.getFovFactor()` in [GraphUpdater.java#L181-L183](https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/scene/system/update/GraphUpdater.java#L181-L183), and passes that value into LightGlow via [LightPositionUpdater.java#L121-L126](https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/system/LightPositionUpdater.java#L121-L126). If atlas uses `rawSolidAngle * 2.22` and omits `/ fovFactor`, it is only correct at the calibrated 60-degree FOV. Fix direction: feed the active camera FOV factor into `src/lib/lightRegistry.ts` and into texture/spiral scale uniforms when the FOV control changes.
- **P1 risk: bonus spiral sample must preserve Gaia’s odd Y scaling.** Gaia’s loop samples `vec2(fx(t,a) / ar, fy(t,a))`, but the extra post-loop sample uses `vec2(fx(t,a) / ar, fy(t,a) * ar)` and is not clamped, in [lightglow.vert.glsl#L62-L70](https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/lightglow.vert.glsl#L62-L70). If atlas normalized this to the loop formula, it is not a 1:1 port. Fix direction: mirror the post-loop sample exactly or document it as an intentional visual divergence.
- **Accepted divergence: ADD blend is not literal 1:1.** Gaia clamps `effectColor + texture(u_texture0)` in-shader at [lightglow.frag.glsl#L97](https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/lightglow.frag.glsl#L97). Atlas emitting `effectColor` with `BlendFunction.ADD` is defensible for HDR preservation, but it can visibly increase downstream Bloom/AgX energy versus Gaia’s clamped result.

**Unanswerable Without Runtime / Local Read**

- I could not inspect the atlas TS/GLSL lines, tests, reduced-motion gate, or actual composer ordering locally, and I could not run `lightRegistry.test.ts` or `lightGlowMath.test.ts`.
- Visual-only: procedural gaussian vs Gaia `star-tex-01.png`, HDR ADD intensity, and Y-orientation correctness need a matched screenshot/runtime check. Based on Gaia’s `camera.project(...)/w,h` write in [LightPositionUpdater.java#L116-L126](https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/system/LightPositionUpdater.java#L116-L126), Three’s `(ndc.y + 1) * 0.5` is the correct WebGL UV orientation; a `1 - y` flip would be wrong.
