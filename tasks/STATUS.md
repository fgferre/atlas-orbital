# Phase θ — Gaia Sky port status

Single source of truth for where we are in the visual port. Read FIRST.

_Last updated: 2026-04-22 after **T2.3a shipped** (`51750c3`) — procedural `DataTexture` bakes in `lensFlareSprites.ts` replaced by `THREE.TextureLoader().load(...)` calls reading the 3 Gaia-original placeholders from gitignored `public/textures/lens/`. Placeholder sha256 fingerprints recorded in ROADMAP §T2.3a match exactly. Shader sampling contract (filter/wrap/colorSpace/mipmap) pinned by new jsdom-env test file `lensFlareSprites.test.ts` (7 tests). Lens Closure Wave advances to **T2.2 — 35-pass Gaussian blur** next. T2.0 shipped earlier today in `cd626dc`._

---

## Kickoff prompt (paste into any new session)

Copy the 11-step loop below. **Step 1 bootstraps everything else** —
the agent reads this file and the docs it references, so reading
order, rules, Gaia source path, and §Next up are all discovered
automatically.

```
1.  Read tasks/STATUS.md fully, then the docs it references
    (AGENTS.md, CLAUDE.md, tasks/ROADMAP.md, tasks/lessons.md,
    /tmp/gaiasky/). Identify §Next up.
2.  Read tasks/ROADMAP.md for that item's Gaia source citation,
    effort, and Dependencies. If STATUS §Next up conflicts with
    ROADMAP Dependencies (stale audit), fix STATUS before
    proceeding (L25).
3.  R1 source-read: open the cited Gaia source and quote the
    relevant lines back as evidence.
4.  Implement port with the smallest diff that matches source.
    Extract the math to TypeScript (pattern: foo.ts + foo.test.ts)
    and pin sample input/output values against Gaia behavior.
5.  PREDECESSOR SWEEP (L29) — grep for any atlas-native equivalent
    the port is replacing (sprite-based flare, procedural shader,
    manual implementation). Delete it in the same commit OR
    document in the commit message why it stays
    (`feedback_no_effect_stacking.md`). Skipping this step is how
    θ.4 shipped with `SunScreenFlare` stacking intact.
6.  DIFF GATE — self-run a line-by-line diff between the Gaia
    source shader and the atlas port. Every divergence carries a
    one-line rationale comment in the atlas code. Undocumented
    divergence is a ship blocker.
7.  SUBAGENT VERIFY — dispatch an Explore subagent (Sonnet) with
    no context from this session. Prompt: "Re-diff <atlas port
    file> against Gaia source at <file:line>. Cite file:line for
    every divergence. Flag any undocumented divergence." Resolve
    findings before proceeding.
8.  Gates: `npm test -- --run`, `npm run lint`, `npm run build`.
9.  Runtime smoke: Claude Preview MCP — confirm no shader compile
    errors AND scene renders AND **does not flicker over time**
    (L26: screenshots don't catch temporal bugs; use multi-frame
    pixel sampling via preview_eval+rAF for ≥30 frames, or ask the
    user to watch live, before marking smoke passed).
10. Commit with source-file citations in the message.
11. Update tasks/STATUS.md (shipped row + §Next up) and
    tasks/ROADMAP.md (item → done + commit SHA).
12. Update tasks/lessons.md only if a new engineering failure
    mode was discovered in this iteration.

Stop and check in before any non-reversible step (destructive git,
file deletion, invasive refactor, new major dependency).
```

---

## For a fresh agent picking up mid-phase

1. `AGENTS.md` (repo root) — engineering standards.
2. `CLAUDE.md` (repo root) — workflow orchestration rules.
3. `~/.claude/projects/.../memory/MEMORY.md` — behavioral rules index.
4. **This file** — what's shipped + known drifts + immediate next.
5. `tasks/ROADMAP.md` — full tiered plan (what / why / Gaia source citation / effort).
6. `tasks/lessons.md` — cross-cutting engineering lessons (L1–L28).
7. `/tmp/gaiasky/` — cloned Gaia Sky source. Read the actual
   `.glsl` / `.java` BEFORE any port (memory rule
   `feedback_gaia_sky_source_first`).

After reading, the **→ Next up** section tells you exactly what to do.

---

## Shipped ondas

| Onda                                        | Commits                                                                      | 1:1 status (verified pass P10 — diff)                                                                                                                                                                                                                                                                                                                                              | Known drifts / known-good                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **θ.1 + θ.1b — star billboard**             | `2662f08`, `13e501e`, `22349b0`..`fa23a27` (10 commits ending with LEN0 fix) | **1:1 VERIFIED**. Divergences are stylistic unrolls, inlined `luma.glsl`, pmndrs adaptations — all documented.                                                                                                                                                                                                                                                                     | None outstanding. Full Gaia color pipeline (Ballesteros → xyY → XYZ → γRGB +0.16 HSV), LEN0 unit fix, pseudo-size kernel all match source line-for-line.                                                                                                                                                                                                                                                 |
| **θ.3 — LightGlow**                         | `a27dc42`, `fdb66ae`                                                         | **1:1 VERIFIED** with documented arch divergences (vertex→fragment move required by pmndrs; HDR clamp strategy scoped to glow contribution). Spiral scale IS FOV-aware (2026-04-22 T1.3 audit).                                                                                                                                                                                    | Sprite uses pure radial gaussian because Gaia asset `star-tex-03-*` is in `$GS_DATA` with no public license. (FOV-factor drift listed in earlier STATUS rows was audit-stale: `LightGlowInjector.tsx:141-186` already drives `setSpiralScale(.../fovFactor)` per frame — shipped in `a27dc42`.)                                                                                                          |
| **θ.4 — PseudoLensFlare**                   | `db407dc`, `4cc35cb`                                                         | **1:1 VERIFIED** (post-T1.1). Starburst Y-coord now matches Gaia.                                                                                                                                                                                                                                                                                                                  | Starburst Y-coord fixed in T1.1 (`4cc35cb`) — extracted to `PSEUDO_LENS_STARBURST_SAMPLE_Y_COORD = 0.0` with pinned regression test. Residual: 35-pass blur omitted → `flareIntensity=0.03` vs Gaia literal `0.15` (documented tuning). Ships PSEUDO variant; Gaia default is COMPLEX (`MainPostProcessor.java:280-312`, different shader entirely) — tracked as T2.1.                                   |
| **θ.5a — atmscattering snippet**            | `c2f05a6`                                                                    | **1:1 VERIFIED** (DIFF GATE + independent SUBAGENT VERIFY). Snippet byte-identical except header guards (documented). Math mirrors pin 16 values against hand-derived Gaia formulas.                                                                                                                                                                                               | Building-block ship — consumed by θ.5b+c at `bc0a429`. No runtime behavior change at this commit.                                                                                                                                                                                                                                                                                                        |
| **T3.5 — night-lights terminator**          | `33807b6`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY + multi-frame smoke). `linstep(-0.1, 0.1, -intensity)` mirrors `pbr.glsl:98-99`. 9 pinned test values cover every break point. Old atlas smoothstep leaked 15.6% night-lights at sun=5.7° above horizon; now 0.                                                                                                                      | None. Scope limited to the night-lights emissive gate for Earth's `body.id === "earth"` branch. Gaia's `selfShadow *= dayFactor` at `pbr.glsl:102` is ring-surface-specific and not ported (documented in shader-patch comment).                                                                                                                                                                         |
| **θ.5b+c — atmosphere + per-frame wiring**  | `bc0a429` (prior `56d0e38` **reverted `422d794`**)                           | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY + multi-frame smoke + user live-watch) at ship time. θ.5d R1 re-read later caught 3 numerical drifts (fG=-0.85 not +0.76; nSamples=5 not 23; implicit eSun=20 not 10) that had slipped past the original checks — fixed in θ.5d, see lesson **L27**.                                                                                 | Scope limited to Earth — uniform bundle `buildEarthAtmosphereUniforms()` hard-wires Earth's Nishita coefficients. Mars/Venus/others wait for θ.5d's per-body config layer.                                                                                                                                                                                                                               |
| **T3.6 — cloud terminator**                 | `785c925`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY + multi-frame smoke). Blending `AdditiveBlending → CustomBlending(ONE, ONE_MINUS_SRC_COLOR)` = Gaia `BlendMode.COLOR`. Formula `1 − linstep(-0.25, 0.12, -NL)` + `clamp(_, 0.03, 1.0)` mirrors `cloud.fragment.glsl:144,165`. 8 pinned tests.                                                                                        | Atlas uses scalar `cloudDayFactor` not Gaia's RGB vector-length — acceptable under single-Sun assumption. Atlas does NOT re-implement Gaia's multi-light loop; Three.js MSM PBR chunks handle shading AFTER the `cloudBrightness` modulation. Both documented in file comments.                                                                                                                          |
| **T3.4 — cloud-shadow cleanup**             | `9c06c16`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY + multi-frame smoke). NTSC→Rec.709 luma match Gaia `luma.glsl:3-4`; two-mesh workaround collapsed to one; `CLOUD_SHADOW_LUMA_CUTOFF` dedup. First iteration flickered 15 units from self-shadow loop; fixed by `receiveShadow={false}` on the cloud mesh.                                                                            | Gaia writes depth from `cloud.fragment.glsl`; atlas keeps `customDepthMaterial` because cloudMaterial has `depthWrite:false` (T3.6 CustomBlending). Arch adaptation documented in `usePlanetMaterials.ts`.                                                                                                                                                                                               |
| **T2.0 — SunScreenFlare predecessor sweep** | `cd626dc`                                                                    | **PURE DELETION** — atlas-native predecessor to θ.4, not a Gaia port. 3-sprite object-space layer removed; Sun now renders through `ProceduralSun3D` billboard + θ.4 `PseudoLensFlareEffect` post-process only. Orphan sweep confirmed no remaining refs to `SunScreenFlare` / `createRadialGradientTexture` / `createStarburstTexture` in `src/`.                                 | None. Gates green (873/873 tests; lint + build clean). Runtime smoke: 55-56 FPS sustained across two 2s windows; zero console errors; scene renders cleanly. L26 per-pixel temporal sampling blocked by `preserveDrawingBuffer: false` on the Three.js canvas — acceptable fallback for a pure-deletion onda with no new shader/uniform surface.                                                         |
| **T2.3a — lens sprite placeholder wiring**  | `51750c3`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY 7/7 PASS + runtime smoke). Procedural `DataTexture` bakes in `lensFlareSprites.ts` replaced by `THREE.TextureLoader().load(...)` with contract preserved: LinearFilter + ClampToEdge (Repeat for starburst wrapS) + NoColorSpace + no mipmaps. URLs use `${BASE_URL}textures/lens/...`. 7 new jsdom-env tests pin the sync contract. | Placeholders are the Gaia originals (sha256 `d59b923b…` / `c61a00d7…` / `71da64eb…`) at `public/textures/lens/` — gitignored via `public/textures/lens/*.{png,jpg}`. Real asset sizes (256×1, 819×461, 502×60) differ from the old procedural bake sizes (256×1, 512×512, 256×1); shader samples by UV so dimensions are free. License-ambiguous — T2.3b swaps for CC-BY-4.0 user-supplied replacements. |

---

## → Next up: Lens Closure Wave — **T2.2 35-pass Gaussian blur** (T2.0 ✅ `cd626dc`, T2.3a ✅ `51750c3`; remaining: T2.2 → T2.1; T2.3b hot-swap on asset delivery)

**T2.3a landed 2026-04-22 (`51750c3`)** —
`src/components/canvas/scene/effects/lensFlareSprites.ts`
procedural `DataTexture` bakes replaced by
`THREE.TextureLoader().load(...)` reading from
`public/textures/lens/{lenscolor.png, lensdirt-low.jpg, lensstarburst.jpg}`
(gitignored placeholders — Gaia originals, sha256 matches ROADMAP
§T2.3a fingerprint). Shader sampling contract (LinearFilter,
ClampToEdge except starburst wrapS=Repeat, NoColorSpace, no
mipmaps) pinned by new `lensFlareSprites.test.ts` under
`// @vitest-environment jsdom`. `LENS_*_SPRITE_SIZE` exports
dropped — dimensions now come from the asset (real Gaia sizes
differ from the old procedural bake).

**T2.0 landed 2026-04-22 (`cd626dc`)** — `SunScreenFlare.tsx` +
its `Planet.tsx:21` import + `Planet.tsx:839-845` mount deleted.
Sun now renders through `ProceduralSun3D` billboard + the θ.4
`PseudoLensFlareEffect.ts` post-process pipeline (mounted at
`PostProcessingPipeline.tsx:130` via `<LensFlareSlot/>`). Pipeline
output is now isolable — T2.2 blur + intensity raise and T2.1
COMPLEX port measure the post-process alone, not the sum of two
competing effects or a procedural-baked contract.

**Cross-AI review origin (2026-04-22)**: atlas had been shipping
TWO lens-flare systems stacked on the Sun — `SunScreenFlare.tsx`
(3 object-space sprites, `body.type === "star"` gate) coexisting
with θ.4 `PseudoLensFlareEffect.ts`. Violated
`feedback_no_effect_stacking.md` memory rule (Replace, don't
stack). The θ.4 ship should have deleted the predecessor as the
final step; that cleanup was missed and slipped past DIFF GATE +
SUBAGENT VERIFY + MATH TESTS because all three scoped to "does
the port match source?" rather than "is this the right thing to
have in the first place?" See L29.

**Asset reality check** (verified 2026-04-22 against
`gaiasky.space/resources/datasets/` and `/licenses/`): the
user-recalled "~285MB Gaia pack with lens PNGs" does not exist.
Public packs are `default-data` (v62, 73 MiB — solar system data
only) and `hi-res-textures` (v15, 248 MiB — 4K/8K planet surfaces
only). Neither includes `lenscolor.png`, `lensdirt.jpg`,
`lensstarburst.jpg` — those live in `$GS_DATA/tex/base/` per
`Settings.java:4351-4353` with NO stated license on the Gaia
licenses page (software = MPL 2.0, audiovisual = CC-BY, datasets
= CC-BY or original; image textures = unspecified). **D3
"reconstruct natively under CC-BY-4.0" path remains correct** —
direct vendoring is not license-safe.

**Placeholder policy** (2026-04-22 user decision). T2.3 splits
into **T2.3a** (wire the Gaia-original PNGs as gitignored
placeholders at `public/textures/lens/` to unblock T2.2/T2.1
calibration now, without waiting for external AI-generation) and
**T2.3b** (hot-swap placeholders for user's CC-BY-4.0 AI-generated
assets once delivered). Placeholders are license-ambiguous and
MUST NOT be committed — a targeted `public/textures/lens/*.{png,jpg}`
rule in `.gitignore` is the safety rail. Current placeholder
hashes / mtimes are recorded in `ROADMAP.md §T2.3` so a future
agent can prove by mtime-delta that the swap actually happened.

### Wave order (smallest diff first; each onda a separate 12-step ship)

| Onda          | Scope                                                                                                                                                                                                                                                                                                       | Effort |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| ~~**T2.0**~~  | ✅ **Shipped `cd626dc`** — `SunScreenFlare.tsx` + `Planet.tsx:21` import + mount at `Planet.tsx:839-845` deleted. Orphan helpers (`createRadialGradientTexture`, `createStarburstTexture`) gone with the file.                                                                                              | done   |
| ~~**T2.3a**~~ | ✅ **Shipped `51750c3`** — `lensFlareSprites.ts` rewritten on top of `THREE.TextureLoader().load(...)`; Gaia-original placeholders copied to `public/textures/lens/`; targeted `*.{png,jpg}` rule added to `.gitignore`; `LENS_*_SPRITE_SIZE` dead code removed; 7 jsdom-env contract tests added.          | done   |
| **T2.2**      | Port Gaia's 35-pass Gaussian blur (between `PseudoLensFlareEffect` and Bloom); raise `PSEUDO_LENS_FLARE_DEFAULT_INTENSITY` from `0.03` back to Gaia literal `0.15`; verify no periphery rings.                                                                                                              | 2-3 d  |
| **T2.1**      | Port COMPLEX variant (D2-resolved) — `lensflare.frag.glsl` is a different shader from PSEUDO. New `LensFlareEffect.ts`; register PSEUDO as alternate variant.                                                                                                                                               | 3-5 d  |
| **T2.3b**     | **CC-BY-4.0 asset swap** (BLOCKS on user AI-gen delivery). When user drops replacements into `references/gaia-sky-source/` (verify by hash-delta AND mtime ≥ `2026-04-22`): copy to `public/textures/lens/`, remove the gitignore rule, add credits to root `README.md` + new `public/textures/CREDITS.md`. | 2-4 h  |

Total Lens Closure Wave: ~1-2 weeks. Full scope / evidence /
dependencies per onda in `ROADMAP.md §T2.0-T2.3`.

**Parked during the wave**: T3.3 (eclipse geometry, 3-5 d) — was
Next up pre-pivot; remains the front-runner once the wave closes.
T3.2 PBR hooks stay asset-blocked.

Under the Gaia-fidelity rule (memory
`feedback_default_gaia_fidelity.md`), D2/D3/D4/D5 remain resolved —
no pending user input.

---

## Confirmed non-drifts (stop re-auditing)

These came up as "suspected drift" in earlier passes but were verified
present / correct on 2026-04-22. Future passes should not rediscover
them:

- Atlas **has** log-depth buffer enabled
  (`Scene.tsx:261` → `glConfig = { antialias, logarithmicDepthBuffer: true }`).
- Atlas **has** dynamic near-plane adjustment per focus
  (`CameraController.tsx:310-314`).
- Atlas **applies** stellar proper motion in the vertex shader
  (`Starfield.tsx:26-28,146-147` — `velocity × yearsSinceJ2000`).
- Simulation clock is time-accurate (J2000 epoch, matches Gaia's
  `GlobalClock`); user can warp to any date.
- θ.1/θ.1b/θ.3 shaders are 1:1 with documented divergences only
  (verified by pass P10 mechanical diff).

---

## Ship protocol (enforced)

Every onda ships through 11 steps. Three independent verification
layers replace visual parity: self-run **DIFF GATE** + independent
**SUBAGENT VERIFY** + pinned **MATH TESTS**.

1. **R1 source-read** — read the actual Gaia `.glsl` / Java files for
   the onda. No plan-prose shortcuts.
2. **Plan port** — smallest diff matching source; identify which math
   layer needs extraction to TypeScript helpers.
3. **Implement** + extract math to `foo.ts` + `foo.test.ts`. Pin
   sample input/output values against Gaia behavior (pattern:
   `lensFlareMath.test.ts`, `lightGlowMath.test.ts`,
   `starfieldShaderMath.test.ts`).
4. **⭐ DIFF GATE** (lesson L22) — self-run line-by-line diff
   between Gaia source shader and atlas port. Every divergence
   carries a one-line rationale comment in the atlas code
   (arch adaptation / HDR strategy / intentional tuning). Any
   undocumented divergence blocks ship.
5. **⭐ SUBAGENT VERIFY** — dispatch an Explore subagent (Sonnet)
   with **no context from this session**. Prompt it with the two
   file paths (atlas port + Gaia source) and demand: re-diff,
   cite `file:line` for every divergence, flag undocumented. The
   agent's verdict is independent of the implementer's
   rationalizations. Resolve any findings before proceeding.
6. **Gates** — `npm test -- --run` (the pinned math tests run
   here), `npm run lint`, `npm run build`.
7. **Runtime smoke** — Claude Preview MCP screenshot; check
   console for shader compile errors; confirm scene renders
   (not black). Last machine-checkable gate.
8. **Commit** with message citing source files.
9. **Update STATUS.md** (this file) and `ROADMAP.md` — mark onda
   shipped, flag any residual drifts, move to next.
10. **Update `lessons.md`** only if a new engineering failure mode
    was discovered.
11. **Loop** — read §Next up for the next item.

**Visual parity vs Gaia runtime is OUTSIDE the loop.** Side-by-side
visual comparison requires running Gaia Sky (Java/LibGDX desktop
app) at a matched camera state, which Claude cannot reliably do.
Rigor comes from the three verification layers above: DIFF GATE
catches implementer drift, SUBAGENT VERIFY catches confirmation
bias, MATH TESTS pin numeric behavior. If the code matches 1:1
with documented divergences and the user still reports a visual
gap, the cause is structural (config defaults, quality tier,
dependency behavior) — investigate with source + config diff,
never attempt further runtime visual comparison.

---

## Audit completeness (2026-04-22)

Port state was audited across 19 verification passes:

- 4 initial passes: post-processing inventory, scene
  lighting/materials, lens effects drift, HDR/tone/depth architecture
- 5 mid passes: camera cinematics, texture assets/licensing, scene-graph
  LOD + star density, atlas pre-θ divergence, config.yaml + shader
  snippet library
- 10 final passes: line rendering, grid rendering, particle systems,
  transparency + render order, precision/scale/jitter, shadow system,
  animation/time/proper-motion, depth-buffer verdict, text/MSDF labels,
  **1:1 shader line-by-line diff (P10)**

All findings consolidated in `ROADMAP.md`. No further full-audit rounds
needed unless new subsystems are introduced.

---

## Decisions (all resolved 2026-04-22 under Gaia-fidelity rule)

Durable rule in memory `feedback_default_gaia_fidelity.md`: **when
a decision has a "match Gaia" branch and an "atlas opinion" branch,
pick Gaia**. Do not re-surface resolved items here — see
`ROADMAP.md §Decisions` for full rationale per key.

| Key    | Resolution                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| **D1** | Moot — θ.1/θ.1b shipped 1:1.                                                                                        |
| **D2** | Port COMPLEX (Gaia default per `config.yaml` + `MainPostProcessor.java:280-312`).                                   |
| **D3** | Native CC-BY-4.0 sprites matching Gaia's output. Not procedural.                                                    |
| **D4** | Biggest-gap-first. Current winner: T3.1 (⭐ #1 cinematic gap).                                                      |
| **D5** | Match Gaia `config.yaml` — `toneMapping.type: NONE`, `bloom.intensity: 0.0`. Cinematic preset moves to user opt-in. |
