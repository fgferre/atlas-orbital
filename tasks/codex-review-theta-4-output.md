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
session id: 019db12e-4c99-7600-b0b4-a12c633093b2

---

user
You are auditing atlas-orbital's θ.4 (pseudo-lens-flare +
lensdirt + starburst) port against the Gaia Sky reference
implementation. Goal: identify **mathematical drift** between
atlas's shader math / constants / pipeline semantics and Gaia Sky's
source. No runtime execution — just code reads + symbolic checks.

## Orientation

All paths are relative to the atlas-orbital repo root. Gaia Sky
source is cloned at `/tmp/gaiasky/`.

Read these first, in order:

1. `tasks/STATUS.md` — dashboard + ship-protocol.
2. `tasks/phase-gaia-sky.md §5 θ.4` (line ~963) — the port plan.
3. `memory/MEMORY.md` + `feedback_*.md` referenced there. Especially:
   - `feedback_codex_verified_claims_can_still_drift.md`
   - `feedback_pseudo_size_not_physical_radius.md`
   - `feedback_gaia_sky_source_first.md`
4. Prior audit reports:
   - `tasks/audit-math-drift-report.md` (θ.1/θ.1b/θ.3 math audit)
   - `tasks/codex-review-theta-3-output.md`

## What to audit

### Gaia Sky reference

- `/tmp/gaiasky/assets/shader/postprocess/pseudolensflare.frag.glsl`
  (68 LOC — Chapman ghost march + halo + CA + lens-colour lookup)
- `/tmp/gaiasky/assets/shader/postprocess/lensdirt.frag.glsl` (37
  LOC — composite `base × (dirt × 3 + starburst)` with 1D starburst
  sampled twice and a centre smoothstep bump)
- `/tmp/gaiasky/assets/shader/postprocess/bias.frag.glsl` (25 LOC
  — binary threshold `avg + bias > 0 ? vec3(1) : vec3(0)`)
- `/tmp/gaiasky/core/src/gaiasky/render/postprocess/effects/PseudoLensFlare.java`
  (full pipeline wrapper: Bias → PseudoLens → Blur × N → LensDirt →
  Combine)
- `/tmp/gaiasky/core/src/gaiasky/render/postprocess/filters/PseudoLensFlareFilter.java`
- `/tmp/gaiasky/core/src/gaiasky/render/postprocess/filters/LensDirtFilter.java`
- `/tmp/gaiasky/core/src/gaiasky/render/MainPostProcessor.java`:
  - lines 109-118 (texture asset loads),
  - lines 268-290 (PseudoLensFlare init + defaults from config),
  - lines 540-565 (helper texture-scale + spiral-scale formulas —
    note these apply to LightGlow θ.3, not θ.4, but cross-check for
    any θ.4 defaults you haven't seen yet),
  - lines 895-920 (`CAMERA_MOTION_UPDATE` event — starburstOffset
    driver).
- `/tmp/gaiasky/assets/conf/config.yaml` lines 599-622 (lensFlare
  section — NB atlas port uses PSEUDO variant although config
  default is COMPLEX).

### Atlas implementation (under audit)

- `src/components/canvas/scene/effects/PseudoLensFlareEffect.ts` —
  MERGED effect (bias + pseudo-lens + lensdirt/starburst). The plan
  originally scoped two chained effects; the first implementation
  (two effects) produced a drift where lensdirt multiplied the
  SCENE rather than only the flare layer. Fix: merge into one
  shader with ADD-blend onto scene so dirt/starburst modulate only
  the flare contribution (flare = 0 elsewhere → no scene darkening).
- `src/components/canvas/scene/effects/lensFlareSprites.ts` —
  procedural substitutes for `lenscolor.png` (256×1 1D gradient),
  `lensdirt.jpg` (512×512 2D noise), `lensstarburst.jpg` (256×1
  1D spike profile). Gaia binary assets live in `$GS_DATA`.
- `src/components/canvas/scene/effects/lensFlareMath.ts` + test —
  executable TS mirrors (biasedSample, ghostWeight, starburst,
  lensDirtComposite, starburstOffsetFromCameraDirection).
- `src/components/canvas/scene/LensFlareInjector.tsx` —
  `<LensFlareSlot>` mounts effect + drives `u_starburstOffset` per
  frame via `camera.getWorldDirection().x + .y + .z` (matches Gaia
  `MainPostProcessor.java:911`).
- `src/components/canvas/scene/PostProcessingPipeline.tsx` —
  composer ordering. `<LightGlowSlot>` → `<LensFlareSlot>` → Bloom
  (conditional) → AgX → HueSat → BrightnessContrast. Composer
  configured with `frameBufferType={THREE.HalfFloatType}` (θ.4
  hard prerequisite).

## What to compare

### Part 1 — Shader math (line-by-line vs Gaia)

1. **Bias threshold**: atlas inlines per-sample. Gaia pre-passes
   via `bias.frag.glsl` which emits binary `vec3(1.0)` / `vec3(0.0)`.
   Confirm atlas emits binary too (not raw rgb).
2. **textureDistorted**: Gaia samples scene at `uv + direction ×
distortion.r/.g/.b` and picks R/G/B from each offset (CA).
   Confirm atlas's `textureDistortedBiased` matches.
3. **ghostVec / haloVec / distortion**: literal-match against
   `pseudolensflare.frag.glsl:34-40`.
4. **Ghost loop**: Gaia `for i in 0..u_ghosts`. Atlas caps at 16
   for GLSL-ES-3.00 compatibility. Verify no off-by-one.
5. **Ghost weight**: `length(0.5 - offset) / length(0.5)` then
   `pow(1 - w, 2.0)` per-ghost, `pow(1 - w, 3.0)` for halo. Verify
   both exponents.
6. **`min(vec4(0.7), result)`**: Gaia's "too strong halo" clamp at
   `pseudolensflare.frag.glsl:61`. Confirm atlas has it.
7. **Lens colour lookup**: Gaia does `vec2(length(0.5 - texcoord) /
length(0.5))` — vec2 with same value in both components, since
   asset is 1D strip. Atlas uses `vec2(radialUv, 0.5)` — also a 1D
   lookup. Are these mathematically equivalent given the 256×1
   texture + ClampToEdge wrap + LinearFilter?
8. **lensdirt merge**: atlas computes `modulated = flare × (dirt ×
3 + starburst) × flareIntensity` and ADD-blends onto scene.
   Gaia's pipeline is `scene + 0.15 × (blurredFlare × (dirt×3 +
starburst))`. Confirm the atlas merge is equivalent when blur is
   omitted (atlas documented divergence).
9. **Starburst formula**: atlas mirrors `lensdirt.frag.glsl:20-27`.
   Check: `radial = centerVec.x / d` guarded for `d ≈ 0`, two 1D
   samples at `mod(abs(radial ± offset), 1)`, product + centre
   smoothstep bump, `clamp(..., 0, 1)`.

### Part 2 — Defaults / constants

Match each atlas default against Gaia source literals:

- `u_ghosts` = 8 (config.yaml `numGhosts`)
- `u_haloWidth` = 0.5 (config.yaml `haloWidth`)
- `u_ghostDispersal` = 0.4 (shader literal, line 13)
- `u_aberrationAmount` = 3.5 (shader literal, line 14)
- `u_bias` = -0.98 (config.yaml `bias`)
- `u_flareIntensity` = atlas **0.03** (tuned-down from Gaia's
  `strength × 0.15 = 0.15` to compensate for the omitted 35-pass
  Gaussian blur in `BlurFilter`). Documented in the
  `PSEUDO_LENS_FLARE_DEFAULT_INTENSITY` constant. Evaluate: is 0.03
  a defensible compensation? Any drift concern beyond "subjective
  tuning"?
- `u_starburstOffset` = 0 at init, driven per-frame from camera
  direction.

### Part 3 — Documented intentional divergences (do NOT flag)

1. **Merged shader (pseudo + lensdirt)** vs Gaia's 5-filter chain
   (Bias → PseudoLens → Blur × N → LensDirt → Combine). Atlas
   inlines bias per-sample, skips Blur (with compensating intensity
   drop), replaces Combine with `BlendFunction.ADD`. Merge was
   necessary because pmndrs `EffectComposer` is linear — splitting
   into two Effects made lensdirt multiply the whole scene, which
   darkened every pixel by `dirt × 3 + starburst`.
2. **Blur skipped**. Gaia `BlurFilter` runs Gaussian 5×5 for
   `blurPasses = 35` on the flare layer. Atlas omits for v1; the
   `u_flareIntensity = 0.03` default compensates.
3. **`BlendFunction.ADD` replacing `CombineFilter`**. Gaia's
   combine does `scene × baseIntensity + processedFlare ×
flareIntensity` (baseIntensity=1 default). Atlas's ADD-blend
   with intensity applied in-shader is mathematically equivalent
   for baseIntensity=1, which is Gaia's default.
4. **Procedural texture substitutes**. Gaia assets in `$GS_DATA`
   not vendored. Atlas uses conservative procedural versions
   (simple gradient, low-contrast noise, periodic spikes). Flag if
   the procedural shapes introduce obvious drift (e.g. wrong strip
   dimensions, wrong channel semantics) but NOT "needs real asset".
5. **config.yaml `type: COMPLEX` default**. Gaia's runtime default
   is COMPLEX (true lens flare via `LensFlare.java` — per-light
   flares using `u_lightPositions[]`). Atlas ships PSEUDO as a
   smaller-scope first implementation; True LensFlare deferred to
   §9. This is a documented scope deferral, not a drift.

### Part 4 — High-risk drift categories

Prior θ ports produced drifts in:

A. **Attribute semantic vs name.** `u_texture1` in
`pseudolensflare.frag.glsl` is LENS COLOUR (radial gradient),
even though a comment calls it "Lens dirt" — the actual dirt
texture enters in `lensdirt.frag.glsl` as its own `u_texture1`.
Verify atlas binds the right texture to the right sampler in
the merged shader.
B. **Runtime override hidden in init code**. Atlas assumes Gaia's
defaults at init. Are there any `MainPostProcessor.updateX()`
methods that override `numGhosts` / `haloWidth` / `bias`
AFTER init (analogous to `updateGlow()` forcing nSamples=1)?
C. **Pre-clamp vs post-clamp uniform feed**: not applicable here
— θ.4's flare intensity is a scalar, no clamp.
D. **Source-literal vs runtime-uniform confusion**. The `min(vec4(0.7),
    result)` clamp is a hard source literal — verify atlas inlines
it (it does).
E. **`BlendFunction.ADD` semantics**. pmndrs' ADD adds source to
dest; confirm atlas's in-shader `× flareIntensity` before ADD
produces the same energy-preserving mix as Gaia's combine.
F. **Starburst offset formula**. Gaia uses `direction.x + .y +
    .z` (summed, not normalized). Atlas does the same via
`Vector3.getWorldDirection`. Any subtle direction-vector
convention mismatch?

## Output format

Single markdown report, same structure as `tasks/audit-math-drift-report.md`:

```
# θ.4 math drift audit — atlas-orbital vs Gaia Sky (<date>)

## Summary
(1-3 sentences: overall parity, P0/P1/P2 count, whether atlas's
merged shader produces the same visual layer Gaia's 5-filter chain
would produce at default values.)

## Scope checked
(Gaia + atlas files you actually read, with line ranges.)

## Verified 1:1
(Bullet list — atlas file:line ↔ Gaia file:line.)

## Drifts found

For each:
### DN — <short title>
- **Priority:** P0 / P1 / P2
- **Onda:** θ.4
- **Atlas location:** file:LINE-LINE
- **Gaia Sky reference:** /tmp/gaiasky/path:LINE-LINE
- **What atlas computes:** exact formula / constant
- **What Gaia computes:** exact formula / constant
- **Numerical delta:** if symbolically computable
- **Fix direction:** direction, not code

## Non-drifts (confirmed intentional)
## Questions raised by the audit (not drifts)
## Unanswerable without missing source
```

## Constraints

- **No runtime.** Read + compute only.
- **No code changes.** Report only.
- **Cite file:line on every drift.** Both sides.
- **Don't flag documented intentional divergences** (Part 3).
- **Don't propose simplifications.** If Gaia has a specific formula,
  atlas must match.
- **Don't cite files you haven't read.**
- **Exhaustive.** θ.4 port surface is ~500 LOC TS + ~200 LOC GLSL.
- **Output a single markdown report to stdout.**
  2026-04-21T17:54:55.868300Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Auth(TokenRefreshFailed("Failed to parse server response"))
  codex
  I’ll do this as a read-only source audit and keep it to a single markdown report. I’ll start by reading the orientation docs and then compare Gaia and atlas files line-by-line with line numbers.
  exec
  "C:\\Users\\fgfer\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'Get-Content -Path memory/MEMORY.md' in C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital
  exec
  "C:\\Users\\fgfer\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'Get-Content -Path tasks/STATUS.md' in C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital
  exec
  "C:\\Users\\fgfer\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command '$i=0; Get-Content -Path tasks/phase-gaia-sky.md | ForEach-Object { $i++; if ($i -ge 930 -and $i -le 1045) { '"'{0,5}: {1}' -f "'$i, $_ } }' in C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital
2026-04-21T17:55:06.392685Z ERROR codex_core::tools::router: error=`"C:\\Users\\fgfer\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command '$i=0; Get-Content -Path tasks/phase-gaia-sky.md | ForEach-Object { $i++; if ($i -ge 930 -and $i -le 1045) { '"'{0,5}: {1}' -f "'$i, $_ } }'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Users\\fgfer\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command '$i=0; Get-Content -Path tasks/phase-gaia-sky.md | ForEach-Object { $i++; if ($i -ge 930 -and $i -le 1045) { '"'{0,5}: {1}' -f "'$i, $\_ } }'`rejected: blocked by policy
2026-04-21T17:55:06.528324Z ERROR codex_core::exec: exec error: windows sandbox: runner error: CreateProcessAsUserW failed: 5
2026-04-21T17:55:06.529719Z ERROR codex_core::tools::router: error=execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
 exited -1 in 0ms:
execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
2026-04-21T17:55:06.540651Z ERROR codex_core::exec: exec error: windows sandbox: runner error: CreateProcessAsUserW failed: 5
2026-04-21T17:55:06.541617Z ERROR codex_core::tools::router: error=execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
 exited -1 in 0ms:
execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
codex
The initial parallel read hit the Windows sandbox runner rather than the repo. I’m switching to smaller direct reads to isolate whether this is shell startup or a specific command quoting issue.
exec
"C:\\Users\\fgfer\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -NoProfile -Command Get-Location in C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital
2026-04-21T17:55:11.818828Z ERROR codex_core::exec: exec error: windows sandbox: runner error: CreateProcessAsUserW failed: 5
2026-04-21T17:55:11.820301Z ERROR codex_core::tools::router: error=execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
 exited -1 in 0ms:
execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
codex
Even a trivial PowerShell command fails before execution, so this looks like a sandbox launch problem rather than repo contents. I’ll check whether any MCP file resources are exposed for the workspace; if not, I’ll report the blocker rather than inventing line citations.
mcp: codex/list_mcp_resources started
mcp: codex/list_mcp_resources (completed)
codex
No workspace resources are exposed through MCP either. I’ll try the connected GitHub repository interface as a read-only fallback, but Gaia’s`/tmp/gaiasky` clone may still be unavailable unless it’s also accessible through the filesystem.
  mcp: codex_apps/github_search_repositories started
  mcp: codex_apps/github_search_repositories (completed)
  web search:
  web search: Gaia Sky pseudolensflare.frag.glsl
  web search:
  web search: site:gitlab.com "pseudolensflare.frag.glsl"
  web search:
  web search: Gaia Sky source repository github gaiasky
  web search:
  web search:
  web search:
  web search: codeberg gaiasky pseudolensflare.frag.glsl
  web search:
  web search:
  web search:
  web search: https://gitlab.com/gaiasky/gaiasky
  web search:
  web search:
  web search:
  web search: "u_aberrationAmount" "pseudolensflare"
  web search:
  web search:
  web search:
  web search: site:gitlab.com/gaiasky/gaiasky/-/blob/master/assets/shader/postprocess pseudolensflare
  web search:
  web search:
  web search:
  web search: "pseudolensflare.frag.glsl" "Langurmonkey"
  codex
  The local filesystem remains unavailable, but the atlas repo is available through the GitHub connector. I’m reading the atlas files there and using public Gaia Sky source mirrors/docs only where I can fetch actual source content with line numbers.
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (failed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (failed)
  mcp: codex_apps/github_search started
  mcp: codex_apps/github_search (completed)
  mcp: codex_apps/github_search started
  mcp: codex_apps/github_search (completed)
  mcp: codex_apps/github_search started
  mcp: codex_apps/github_search (completed)
  mcp: codex_apps/github_search_branches started
  mcp: codex_apps/github_search_branches (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (completed)
  mcp: codex_apps/github_get_users_recent_prs_in_repo started
  mcp: codex_apps/github_get_users_recent_prs_in_repo (completed)
  codex
  The GitHub copy is missing several files from the requested audit surface, which means the working tree is ahead of the remote or otherwise not represented there. I’m making one more shell startup check outside the repo path; if that still fails, the only defensible output is a blocker report with the exact unreadable inputs.
  exec
  "C:\\Users\\fgfer\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -NoProfile -Command 'Get-ChildItem -Name' in C:\
  2026-04-21T17:57:10.180631Z ERROR codex_core::exec: exec error: windows sandbox: runner error: CreateProcessAsUserW failed: 5
  2026-04-21T17:57:10.182138Z ERROR codex_core::tools::router: error=execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
  exited -1 in 0ms:
  execution error: Io(Custom { kind: Other, error: "windows sandbox: runner error: CreateProcessAsUserW failed: 5" })
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (failed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (failed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (failed)
  mcp: codex_apps/github_download_user_content started
  mcp: codex_apps/github_download_user_content (failed)
  web search:
  web search: "float u_ghostDispersal = 0.4" "pseudolensflare"
  web search:
  web search:
  web search:
  web search: https://codeberg.org/gaiasky/gaiasky/raw/branch/master/assets/shader/postprocess/pseudolensflare.frag.glsl
  web search:
  web search: https://gitlab.com/api/v4/projects/6581209/repository/files/assets%2Fshader%2Fpostprocess%2Fpseudolensflare.frag.glsl/raw?ref=master
  web search:
  web search:
  web search:
  web search: https://gitlab.com/api/v4/projects/6581209/repository/files/README.md?ref=master
  web search:
  web search:
  web search:
  web search: https://gitlab.com/gaiasky/gaiasky/-/raw/master/README.md?inline=false
  codex
  There is also a GitHub mirror of Gaia Sky, so I can read that source through the GitHub connector with exact paths. The atlas working tree is still inaccessible locally and absent from GitHub, which remains the main blocker for a complete audit.
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
  web search: github langurmonkey gaiasky pseudolensflare.frag.glsl
  mcp: codex_apps/github_search started
  mcp: codex_apps/github_search (completed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (failed)
  mcp: codex_apps/github_fetch_file started
  mcp: codex_apps/github_fetch_file (failed)
  codex

# θ.4 math drift audit — atlas-orbital vs Gaia Sky (2026-04-21)

## Summary

Blocked: I could not complete the requested atlas-vs-Gaia drift audit because the local workspace shell cannot start (`CreateProcessAsUserW failed: 5`), no MCP filesystem resources are exposed, and the GitHub `main` copy of `fgferre/atlas-orbital` does not contain the θ.4 atlas files or several required audit docs. I read Gaia Sky source through the public GitHub mirror, but I cannot defensibly report atlas mathematical parity or drift without reading the atlas implementation under audit.

P0/P1/P2 count: not adjudicated. No drift findings are reported because the required atlas-side file:line evidence is unavailable.

## Scope checked

Gaia Sky source read via `langurmonkey/gaiasky` GitHub mirror:

- `assets/shader/postprocess/pseudolensflare.frag.glsl` — full file, 68 LOC  
  https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/pseudolensflare.frag.glsl
- `assets/shader/postprocess/lensdirt.frag.glsl` — full file, 36 LOC  
  https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/lensdirt.frag.glsl
- `assets/shader/postprocess/bias.frag.glsl` — full file  
  https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/bias.frag.glsl
- `core/src/gaiasky/render/postprocess/effects/PseudoLensFlare.java` — full file  
  https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/postprocess/effects/PseudoLensFlare.java
- `core/src/gaiasky/render/postprocess/filters/PseudoLensFlareFilter.java` — full file  
  https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/postprocess/filters/PseudoLensFlareFilter.java
- `core/src/gaiasky/render/postprocess/filters/LensDirtFilter.java` — full file  
  https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/postprocess/filters/LensDirtFilter.java
- `core/src/gaiasky/render/MainPostProcessor.java` — full file fetched; relevant sections include asset loads, pseudo lens flare setup, glow helpers, and `CAMERA_MOTION_UPDATE`.

Atlas files requested but not readable locally and absent from GitHub `main`:

- `tasks/STATUS.md`
- `memory/MEMORY.md`
- `tasks/audit-math-drift-report.md`
- `tasks/codex-review-theta-3-output.md`
- `src/components/canvas/scene/effects/PseudoLensFlareEffect.ts`
- `src/components/canvas/scene/effects/lensFlareSprites.ts`
- `src/components/canvas/scene/effects/lensFlareMath.ts`
- `src/components/canvas/scene/LensFlareInjector.tsx`
- `src/components/canvas/scene/PostProcessingPipeline.tsx`

`tasks/phase-gaia-sky.md` was readable from GitHub `main`, but the fetched remote copy is planning context only and does not substitute for the atlas implementation files.

## Verified 1:1

None. I cannot verify atlas 1:1 math without reading the atlas implementation files.

## Drifts found

None reportable. Any drift claim would require atlas file:line citations, which are unavailable in this environment.

## Non-drifts (confirmed intentional)

Not adjudicated. The listed intentional divergences are understood, but confirmation requires reading atlas code.

## Questions raised by the audit (not drifts)

- Is the local workspace ahead of GitHub `main`? The requested θ.4 implementation and audit docs are not present in the remote repository branch available through the connector.
- Is the Windows shell sandbox expected to be able to read `C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital`? Every shell invocation failed before command execution with `CreateProcessAsUserW failed: 5`, including a trivial `Get-ChildItem` from `C:\`.

## Unanswerable without missing source

All atlas-vs-Gaia comparisons requested in Parts 1-4 remain unanswerable until the atlas files are readable:

- Bias threshold binary emission.
- `textureDistortedBiased` chromatic aberration sampling.
- `ghostVec`, `haloVec`, and distortion literal parity.
- Ghost-loop off-by-one behavior under atlas’s GLSL-ES cap.
- Ghost and halo weight exponents.
- `min(vec4(0.7), result)` clamp parity.
- Lens colour lookup equivalence with atlas texture dimensions and sampler setup.
- Merged lensdirt/starburst ADD pipeline equivalence.
- Starburst center guard and formula parity.
- Atlas defaults and constants.
- Texture binding semantics.
- Hidden runtime overrides.
- pmndrs `BlendFunction.ADD` energy semantics as implemented.
- `camera.getWorldDirection()` convention parity with Gaia’s `camera.direction` sum.
  tokens used
  221.737

# θ.4 math drift audit — atlas-orbital vs Gaia Sky (2026-04-21)

## Summary

Blocked: I could not complete the requested atlas-vs-Gaia drift audit because the local workspace shell cannot start (`CreateProcessAsUserW failed: 5`), no MCP filesystem resources are exposed, and the GitHub `main` copy of `fgferre/atlas-orbital` does not contain the θ.4 atlas files or several required audit docs. I read Gaia Sky source through the public GitHub mirror, but I cannot defensibly report atlas mathematical parity or drift without reading the atlas implementation under audit.

P0/P1/P2 count: not adjudicated. No drift findings are reported because the required atlas-side file:line evidence is unavailable.

## Scope checked

Gaia Sky source read via `langurmonkey/gaiasky` GitHub mirror:

- `assets/shader/postprocess/pseudolensflare.frag.glsl` — full file, 68 LOC  
  https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/pseudolensflare.frag.glsl
- `assets/shader/postprocess/lensdirt.frag.glsl` — full file, 36 LOC  
  https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/lensdirt.frag.glsl
- `assets/shader/postprocess/bias.frag.glsl` — full file  
  https://github.com/langurmonkey/gaiasky/blob/master/assets/shader/postprocess/bias.frag.glsl
- `core/src/gaiasky/render/postprocess/effects/PseudoLensFlare.java` — full file  
  https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/postprocess/effects/PseudoLensFlare.java
- `core/src/gaiasky/render/postprocess/filters/PseudoLensFlareFilter.java` — full file  
  https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/postprocess/filters/PseudoLensFlareFilter.java
- `core/src/gaiasky/render/postprocess/filters/LensDirtFilter.java` — full file  
  https://github.com/langurmonkey/gaiasky/blob/master/core/src/gaiasky/render/postprocess/filters/LensDirtFilter.java
- `core/src/gaiasky/render/MainPostProcessor.java` — full file fetched; relevant sections include asset loads, pseudo lens flare setup, glow helpers, and `CAMERA_MOTION_UPDATE`.

Atlas files requested but not readable locally and absent from GitHub `main`:

- `tasks/STATUS.md`
- `memory/MEMORY.md`
- `tasks/audit-math-drift-report.md`
- `tasks/codex-review-theta-3-output.md`
- `src/components/canvas/scene/effects/PseudoLensFlareEffect.ts`
- `src/components/canvas/scene/effects/lensFlareSprites.ts`
- `src/components/canvas/scene/effects/lensFlareMath.ts`
- `src/components/canvas/scene/LensFlareInjector.tsx`
- `src/components/canvas/scene/PostProcessingPipeline.tsx`

`tasks/phase-gaia-sky.md` was readable from GitHub `main`, but the fetched remote copy is planning context only and does not substitute for the atlas implementation files.

## Verified 1:1

None. I cannot verify atlas 1:1 math without reading the atlas implementation files.

## Drifts found

None reportable. Any drift claim would require atlas file:line citations, which are unavailable in this environment.

## Non-drifts (confirmed intentional)

Not adjudicated. The listed intentional divergences are understood, but confirmation requires reading atlas code.

## Questions raised by the audit (not drifts)

- Is the local workspace ahead of GitHub `main`? The requested θ.4 implementation and audit docs are not present in the remote repository branch available through the connector.
- Is the Windows shell sandbox expected to be able to read `C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital`? Every shell invocation failed before command execution with `CreateProcessAsUserW failed: 5`, including a trivial `Get-ChildItem` from `C:\`.

## Unanswerable without missing source

All atlas-vs-Gaia comparisons requested in Parts 1-4 remain unanswerable until the atlas files are readable:

- Bias threshold binary emission.
- `textureDistortedBiased` chromatic aberration sampling.
- `ghostVec`, `haloVec`, and distortion literal parity.
- Ghost-loop off-by-one behavior under atlas’s GLSL-ES cap.
- Ghost and halo weight exponents.
- `min(vec4(0.7), result)` clamp parity.
- Lens colour lookup equivalence with atlas texture dimensions and sampler setup.
- Merged lensdirt/starburst ADD pipeline equivalence.
- Starburst center guard and formula parity.
- Atlas defaults and constants.
- Texture binding semantics.
- Hidden runtime overrides.
- pmndrs `BlendFunction.ADD` energy semantics as implemented.
- `camera.getWorldDirection()` convention parity with Gaia’s `camera.direction` sum.
