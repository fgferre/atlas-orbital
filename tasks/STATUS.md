# Phase θ — Gaia Sky port status

Single source of truth for where we are in the visual port. Read FIRST.

_Last updated: 2026-04-23 — session ship summary below; details per onda in §Shipped ondas table._

**This session (2026-04-23) shipped 12 feats + 3 doc commits + associated docs**:

- **Unblock pivot** (3c3846d / e9eb1e6 / 49a44f9): T4.9a' Sun billboard at stellar distances (placeholder asset), T4.2 sub-wave plan α/β/γ written, T4.5-β body labels via drei `<Text>` (additive opt-in `labelMode: "html" | "sdf"`). T4.5-γ + T4.9b' retired; T2.3b deferred to final asset wave.
- **T4.2 wave starts** (`dae3815`): T4.2-α proximity-aware damping shipped. Pure-TS port of `NaturalCamera.java:993-997` `counterAmount` curve in `src/lib/camera/proximityDamping.ts` + per-frame setter on OrbitControls' `dampingFactor` from `CameraController.tsx`. T4.2-γ (zoom physics) + T4.2-β (surface mode) remaining.

- **T2.5 + T2.6** (`9910eeb` + `444c6c2`) — `shadowIntensity 1.3-1.5 → 0.4`, `envMapIntensity 1.9-2.1 → 0.0`. Closes residual drift T2.4 left behind.
- **T4.4 full wave CLOSED** across 6 sub-waves: T4.4a (`49fdaf0`, math extraction), T4.4b (`94af1b8`, shader port + mount + `EclipticGrid` predecessor sweep), T4.4c (`2e42b8c`, `getGridScaling` runtime driver), T4.4d (`379fd2e`, Equatorial/Ecliptic/Galactic orientation toggle with per-orientation color callouts), T4.4e-α (`521ae82`, projection-lines math), T4.4e-β (`ae13866`, projection-lines mount). Full 1:1 with Gaia on the recursive grid.
- **LightGlow cross-spike fix** (`d6165c6`) — `ClampToEdge`-on-gaussian-edge leakage killed via border-zero invariant. Then superseded by **`a9f9bd5`** — vendored Gaia's real `star-tex-03.jpg` (Ressl/Hammerschmid, Seed of Andromeda) as gitignored placeholder at `public/textures/stars/`.
- **T4.9 R1 re-verify** (`e2a01df`) — original audit subagent fabricated `SunComponent.java:50-70` + `sun-{surface,glow,corona}` citations. Re-scoped: T4.9a' ship-ready (star-tex-04 billboard fallback), T4.9b' BLOCKED on `default-data` pack, T4.9c confirmed NOT a divergence.
- **Comprehensive drift audit CLEAN** (`a065136`) — fresh-context subagent covering 8 categories (numeric constants, uniform writes, NaN, material leaks, race conditions, undocumented shader divergences, stale ROADMAP, compile warnings). Three spot-checks (eclipse / atmosphere / LightGlow) verified byte-identity in-thread.
- **T4.5-α + T4.5-δ** (`ed22f53` + `7abbc78`) — MSDF font-math primitives pinned (3 constants + 6 helpers + 25 tests); AU tick labels restored via drei `<Text>` closing the T4.4b predecessor-sweep regression. Label color matches grid orientation; troika default smoothing (Gaia `1/(16×scale)` override deferred).
- **M5 lesson** (`677ee5c`) — subagent file:line citations need spot-check verification before use.

**Test count**: 1107/1107 (+234 from session start). Lint + build clean throughout, zero rollbacks. Prior Codex audit (`a722bba` T2.4 + `cced2ae` triage) resolved the original lighting drift chain that this session built on top of. Codex's original lighting audit (`a722bba` T2.4 + `cced2ae` triage) + this session's T2.5/T2.6 (`9910eeb`), T4.4 full wave (`49fdaf0`→`ae13866`), T4.6 (`a6a3644`), LightGlow asset swap (`a9f9bd5`), and T4.9 re-verify (`e2a01df`) collectively closed every known drift against Gaia source. A fresh-context Explore subagent re-audit across 8 categories (numeric constants vs `*Filter.java`/`.glsl`, uniform-write-to-GPU, NaN/undefined propagation, material dispose leaks, race conditions, undocumented shader divergences, stale ROADMAP items, silent shader compile warnings) returned **NO ACTIVE DRIFTS**. Spot-verified in-thread: eclipse constants (UMBRA=0.04, PENUMBRA=1.7, DIFFRACTION=[0.2,1.6], spectrum RGBs [0.41,0.26,0.013]/[0.88,0.42,0.063]), atmosphere (exposureGround=0.5, exposureSky=0.25), LightGlow polar-mask floor (minVal=0.55) — all byte-identical to Gaia. Previously open items re-scoped: **T4.9a'** (Sun billboard fallback at stellar distances — ship-ready, 0.5-1 d, same pattern as `a9f9bd5`); **T4.9b'** (close-Sun dataset port — BLOCKED on `default-data` pack acquisition); **T4.9c** (procedural dwarf surfaces — confirmed NOT a divergence, Gaia does the same fallback). Prior **T4.9 R1 re-verify + re-scope** (doc-only, this commit). Traced Gaia's actual Sun-render path across five renderers (`BillboardRenderer`, `SingleStarQuadRenderer`, `StarSetInstancedRenderer`, `VariableSetInstancedRenderer`, `LightGlowRenderPass`) and confirmed the original audit's `SunComponent.java:50-70` + `sun-{surface,glow,corona}` citations were fabricated. Reality: Gaia renders the Sun as a star-billboard (`star-tex-04-*.png` per `config.yaml:169`) at stellar distances, and as a body-pipeline mesh (dataset in `$GS_DATA/default-data/data/sol/`, NOT in source tree) at close range. T4.9 re-scoped: **T4.9a'** = ship-ready (vendor `star-tex-04-low.jpg` + distance-gated billboard fallback for Sun, ~0.5-1 d, same pattern as `a9f9bd5`); **T4.9b'** = BLOCKED on `default-data` pack acquisition; **T4.9c** = confirmed NOT a divergence. Prior **T4.4e-β projection-lines mount (`ae13866`)** — closed T4.4 fully 1:1 with Gaia. New `GridProjectionLines.tsx` renders a 3-point continuous L-polyline (Sun origin → focus's XZ projection on the grid plane → focus's world position) via drei `<Line>` + `useGaiaSdfLinePatch` (T4.6 SDF feathering), colored by the active grid orientation (gRed/gGreen/gBlue per `GridRecursive.java:21-23`). Store slice `gridProjectionLines: boolean` + `toggleGridProjectionLines` (default `true` per `config.yaml:381`). UI toggle in `LayersPanel.tsx` under the Coordinate Grid sub-section. Gated on `showEclipticGrid && gridProjectionLines && focusId !== "sun"`. Key architectural divergence from Gaia: Gaia's `GridRecUpdater.java:171-200` math (ported 1:1 in T4.4e-α, `src/lib/gridProjection.ts`) produces endpoints in Gaia's camera-relative rendering frame; atlas uses absolute-world rendering so β computes endpoints directly from world positions (same visual intent, cleaner for atlas's current architecture). α's helpers remain pinned for the day T4.1 camera-relative rendering ships. 1082/1082 tests; lint + build clean. Prior **T4.4e-α projection-math ship (`521ae82`)** — pure-TS mirror of Gaia's recursive-grid projection-lines math (`GridRecUpdater.java:171-200`). `src/lib/gridProjection.ts` exports `computeCFPos` + `computeZXLineEndpoints` + `computeYLineEndpoints` + end-to-end driver `computeProjectionSegments` + scratch-bundle factory. 15 pinned tests cover identity, rotations around all three axes, L-corner continuity (`yA === zxB`), and two geometric invariants (`yB_world === focus − cam`, `zxA_world === −cam`) under arbitrary grid rotations. Documented divergence: float32 instead of Gaia's double (render-space ≤140k units fits float precision comfortably). DIFF GATE + SUBAGENT VERIFY both PASS; 1082/1082 tests. Building-block only — T4.4e-β mounts it into a gated `<Line>` component + store slice + UI toggle. T4.9 Sun procedural-substitute audit flagged R1-PENDING (`1c36237`) — subagent citations fabricated, do not ship without re-verifying Gaia's actual Sun-render path. Prior **LightGlow asset-swap ship (`a9f9bd5`)** — vendored Gaia's real `star-tex-03.jpg` sprite (credit: Andreas Ressl + Georg Hammerschmid, Seed of Andromeda) as a gitignored placeholder at `public/textures/stars/`, mirroring T2.3a's lens-sprite workflow. `lightGlowSprite.ts` rewritten from procedural-gaussian bake to `THREE.TextureLoader().load()` with LinearFilter + ClampToEdge + no-mipmaps + NoColorSpace. Bright stars now render Gaia's signature 4-ray cross-spikes instead of the prior soft-circle halo (which was the border-zero-fixed substitute from `d6165c6`). Procedural-substitute audit ran alongside: surfaced **T4.9** (Sun surface texture + flare sprites still procedural in `ProceduralSun3D.tsx`, ~3-5 d) as the next noticeable Gaia-divergence to close. Prior **LightGlow cross-spike fix (`d6165c6`)** — user reported thin horizontal + vertical rays extending from every bright star regardless of grid state. Root cause: `lightGlowSprite.ts` baked a pure radial gaussian (σ=20) into a 128² texture whose edge pixels were ~0.006 (non-zero). The LightGlow shader samples with `ClampToEdgeWrapping`, which replicated that non-zero edge row/column **infinitely** along any axis where `glow_tc` overflowed [0,1] — producing 4 faint rays per halo, accumulated across N=8 lights → visible cross-spikes. Fix hard-zeroes the sprite beyond `LIGHT_GLOW_SPRITE_ZERO_RADIUS = SIZE/2 - 2 = 62 px` (3σ + 2), 12 new tests pin the border-zero invariant on all four edges + center=peak + ClampToEdge wrap. Pure data fix at bake time, no shader change. 1074/1074 tests, lint + build clean. Prior **T4.4d orientation-toggle ship (`379fd2e`)** — users can now flip the recursive grid between Equatorial / Ecliptic / Galactic via a 3-way radio in the Layers panel. `src/lib/gridOrientation.ts` ports `Coordinates.java:65-74`'s three rotation matrices via a 1:1 `getRotationMatrix(α, β, γ) = Ry(γ)·Rz(β)·Ry(α)` mirror (`OBLIQUITY_DEG_J2000=23.4392808`, galactic Euler `R=32.93192, Q=27.12825, P=192.85948`) + per-orientation color callouts (`ccEq=gRed=[219,68,55]`, `ccEcl=gGreen=[15,157,88]`, `ccGal=gBlue=[66,133,244]` from `ColorUtils.java:28-32` + `GridRecursive.java:21-23`). `GridRecursive.tsx` wraps the mesh in a `<group>` with quaternion built from the orientation matrix and mutates `u_diffuseColor` + `u_emissiveColor` (inner at 0.3α) on flip. Documented axis-convention divergence: atlas's ecliptic mode is identity (atlas's world frame is ecliptic-aligned via planet orbits); Gaia's frame is equatorial so the mapping inverts. 23 new pinned tests (1062 total). DIFF GATE + SUBAGENT VERIFY 8/8 PASS. Runtime smoke: outer grid ring now vivid green (ccEcl) where T4.4b/c shipped atlas cyan — visual confirmation of the color uniform swap. T4.4e (projection lines) remaining. Prior **T4.4c `getGridScaling` runtime-driver ship (`2e42b8c`)** — the recursive grid is now actually recursive. `gridRecScaling.ts` ports `GridRecUpdater.java:148-160`'s decade-walk algorithm (find the smallest power-of-10 bracket containing camera distance, normalize `tessQuality` into `[0.1, 1.0]` within that decade, `lint(heightScale)` from 1 at the lower bound to 0 at the upper). `GridRecursive.tsx`'s `useFrame` pushes the two outputs into `u_tessQuality` + `u_heightScale` each frame, so level-1 rings sit at 1 / 10 / 100 / ... world units and smoothly swap when the camera crosses a decade boundary. 18 new pinned tests covering the bracket lookup, `gridRecLint`, scale-invariance (cameraDistance 0.5 / 5 / 50 / 500 all produce `(tessQuality=0.5, heightScale≈0.556)`), and Gaia's >10^25 fallback. One documented divergence — no AU conversion (the algorithm is scale-invariant). DIFF GATE + SUBAGENT VERIFY both PASS 6/6 checkpoints; 1039/1039 tests; lint + build clean; runtime smoke: concentric-ring geometry now visible at close camera distances that static-uniform T4.4b produced a flat pattern at. T4.4d (orientation toggle) + T4.4e (projection lines) still queued. Prior **T4.4b gridrec shader-port ship (`94af1b8`)** — Gaia's recursive-grid fragment shader now drives atlas's coordinate-plane rendering, replacing the atlas-opinion `EclipticGrid.tsx` under `feedback_no_effect_stacking.md`. `src/components/canvas/shaders/gridRecShader.ts` ports `rotateUV`/`circle_rec`/`circle`/`square_rec`/`square`/`main` verbatim, template-interpolating numeric literals from T4.4a's `gridRecMath.ts` so TS and GLSL stay in lockstep by construction. `GridRecursive.tsx` mounts a 40k×40k horizontal quad at y=-0.15 with CIRCULAR style default (Gaia `config.yaml:384`) + neutral `u_tessQuality=1` / `u_heightScale=1` / `u_ts=1.4` uniforms pre-T4.4c runtime drivers. 28 new jsdom tests (1021 total). Predecessor sweep deleted `EclipticGrid.tsx` (341 LOC) + `EclipticGrid.test.ts` + `eclipticGridHelpers.ts`; AU tick labels (atlas-opinion, no Gaia equivalent on the grid mesh) regress until T4.5 brings a Gaia-native MSDF label path. 6 documented divergences (WebGL1 GLSL 1.00, log-depth skipped, simple*noise dropped, layout→gl_FragColor, opacity-via-uniform, gridrec*/GRIDREC* namespace prefixes). DIFF GATE + SUBAGENT VERIFY both PASS uniform-by-uniform. Runtime smoke: console clean, ring geometry visible at oblique camera angle confirming `circle()` branch. Prior ships still load-bearing: T4.4a (`49fdaf0`, math extraction), T2.5 + T2.6 (`9910eeb`, lighting drift closure), T2.4 (`a722bba`, ambient/sun/bloom/tone-mapping alignment) — details in §Shipped-ondas table. L32 still in force: visual-diff baseline PNGs need an explicit review gate when re-baked.*

---

## Kickoff prompt (paste into any new session)

Copy the 13-step loop below. **Step 1 bootstraps everything else** —
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
3.  **ROADMAP PRE-CHECK (L30 + L31)** — before R1-reading any
    shader, verify the port target is actually Gaia's DEFAULT
    render path, not dead code or a non-default variant:
    (a) grep `/tmp/gaiasky/assets/conf/config.yaml` for the
        feature's `type` / `active` / `default` key. If Gaia
        ships a non-default variant, the onda ports THAT
        variant, not whatever the ROADMAP happens to name.
    (b) grep `/tmp/gaiasky/core/src` for
        `new <EffectClass>(` — confirm at least one hit.
        Zero hits = Gaia dead code; demote the onda to
        "confirmed non-port" and move on. Shader file
        existence is necessary but not sufficient (L31).
    (c) if the ROADMAP numeric literals disagree with the
        `*Filter.java` defaults, trust the Java (L27).
    Any drift found here gets documented in ROADMAP + lessons.md
    BEFORE moving to step 4.
4.  R1 source-read: open the cited Gaia source and quote the
    relevant lines back as evidence.
5.  Implement port with the smallest diff that matches source.
    Extract the math to TypeScript (pattern: foo.ts + foo.test.ts)
    and pin sample input/output values against Gaia behavior.
6.  PREDECESSOR SWEEP (L29) — grep for any atlas-native equivalent
    the port is replacing (sprite-based flare, procedural shader,
    manual implementation). Delete it in the same commit OR
    document in the commit message why it stays
    (`feedback_no_effect_stacking.md`). Skipping this step is how
    θ.4 shipped with `SunScreenFlare` stacking intact.
7.  DIFF GATE — self-run a line-by-line diff between the Gaia
    source shader and the atlas port. Every divergence carries a
    one-line rationale comment in the atlas code. Undocumented
    divergence is a ship blocker.
8.  SUBAGENT VERIFY — dispatch an Explore subagent (Sonnet) with
    no context from this session. Prompt: "Re-diff <atlas port
    file> against Gaia source at <file:line>. Cite file:line for
    every divergence. Flag any undocumented divergence." Resolve
    findings before proceeding.
9.  Gates: `npm test -- --run`, `npm run lint`, `npm run build`.
10. Runtime smoke: Claude Preview MCP — confirm no shader compile
    errors AND scene renders AND **does not flicker over time**
    (L26: screenshots don't catch temporal bugs; use multi-frame
    pixel sampling via preview_eval+rAF for ≥30 frames, or ask the
    user to watch live, before marking smoke passed). **If the
    commit re-bakes any `e2e/**/*-snapshots/*.png` baseline, visually
    inspect the new PNG and confirm every visible delta traces to an
    intentional change in the same commit (L32). File-size delta ≥2×
    is a flag for closer review.**
11. Commit with source-file citations in the message.
12. Update tasks/STATUS.md (shipped row + §Next up) and
    tasks/ROADMAP.md (item → done + commit SHA).
13. Update tasks/lessons.md only if a new engineering failure
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
6. `tasks/lessons.md` — cross-cutting engineering lessons (L1–L32).
   Newest entries codify plan-vs-reality drift guards across the
   ship lifecycle: L30 (plan-time — wave ordering must respect
   `config.yaml` defaults), L31 (port-time — shader file existence
   ≠ Gaia runtime wiring), L32 (verify-time — visual-diff baseline
   PNGs need a human "does this delta make sense?" pass when
   re-baked).
7. `/tmp/gaiasky/` — cloned Gaia Sky source. Read the actual
   `.glsl` / `.java` BEFORE any port (memory rule
   `feedback_gaia_sky_source_first`).

After reading, the **→ Next up** section tells you exactly what to do.

---

## Shipped ondas

| Onda                                          | Commits                                                                      | 1:1 status (verified pass P10 — diff)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Known drifts / known-good                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **θ.1 + θ.1b — star billboard**               | `2662f08`, `13e501e`, `22349b0`..`fa23a27` (10 commits ending with LEN0 fix) | **1:1 VERIFIED**. Divergences are stylistic unrolls, inlined `luma.glsl`, pmndrs adaptations — all documented.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | None outstanding. Full Gaia color pipeline (Ballesteros → xyY → XYZ → γRGB +0.16 HSV), LEN0 unit fix, pseudo-size kernel all match source line-for-line.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **θ.3 — LightGlow**                           | `a27dc42`, `fdb66ae`                                                         | **1:1 VERIFIED** with documented arch divergences (vertex→fragment move required by pmndrs; HDR clamp strategy scoped to glow contribution). Spiral scale IS FOV-aware (2026-04-22 T1.3 audit).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Sprite uses pure radial gaussian because Gaia asset `star-tex-03-*` is in `$GS_DATA` with no public license. (FOV-factor drift listed in earlier STATUS rows was audit-stale: `LightGlowInjector.tsx:141-186` already drives `setSpiralScale(.../fovFactor)` per frame — shipped in `a27dc42`.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **θ.4 — PseudoLensFlare**                     | `db407dc`, `4cc35cb`                                                         | **1:1 VERIFIED** (post-T1.1). Starburst Y-coord now matches Gaia.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Starburst Y-coord fixed in T1.1 (`4cc35cb`) — extracted to `PSEUDO_LENS_STARBURST_SAMPLE_Y_COORD = 0.0` with pinned regression test. Residual: 35-pass blur omitted → `flareIntensity=0.03` vs Gaia literal `0.15` (documented tuning). Ships PSEUDO variant; Gaia default is COMPLEX (`MainPostProcessor.java:280-312`, different shader entirely) — tracked as T2.1.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **θ.5a — atmscattering snippet**              | `c2f05a6`                                                                    | **1:1 VERIFIED** (DIFF GATE + independent SUBAGENT VERIFY). Snippet byte-identical except header guards (documented). Math mirrors pin 16 values against hand-derived Gaia formulas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Building-block ship — consumed by θ.5b+c at `bc0a429`. No runtime behavior change at this commit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **T3.5 — night-lights terminator**            | `33807b6`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY + multi-frame smoke). `linstep(-0.1, 0.1, -intensity)` mirrors `pbr.glsl:98-99`. 9 pinned test values cover every break point. Old atlas smoothstep leaked 15.6% night-lights at sun=5.7° above horizon; now 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | None. Scope limited to the night-lights emissive gate for Earth's `body.id === "earth"` branch. Gaia's `selfShadow *= dayFactor` at `pbr.glsl:102` is ring-surface-specific and not ported (documented in shader-patch comment).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **θ.5b+c — atmosphere + per-frame wiring**    | `bc0a429` (prior `56d0e38` **reverted `422d794`**)                           | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY + multi-frame smoke + user live-watch) at ship time. θ.5d R1 re-read later caught 3 numerical drifts (fG=-0.85 not +0.76; nSamples=5 not 23; implicit eSun=20 not 10) that had slipped past the original checks — fixed in θ.5d, see lesson **L27**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Scope limited to Earth — uniform bundle `buildEarthAtmosphereUniforms()` hard-wires Earth's Nishita coefficients. Mars/Venus/others wait for θ.5d's per-body config layer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **T3.6 — cloud terminator**                   | `785c925`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY + multi-frame smoke). Blending `AdditiveBlending → CustomBlending(ONE, ONE_MINUS_SRC_COLOR)` = Gaia `BlendMode.COLOR`. Formula `1 − linstep(-0.25, 0.12, -NL)` + `clamp(_, 0.03, 1.0)` mirrors `cloud.fragment.glsl:144,165`. 8 pinned tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Atlas uses scalar `cloudDayFactor` not Gaia's RGB vector-length — acceptable under single-Sun assumption. Atlas does NOT re-implement Gaia's multi-light loop; Three.js MSM PBR chunks handle shading AFTER the `cloudBrightness` modulation. Both documented in file comments.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **T3.4 — cloud-shadow cleanup**               | `9c06c16`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY + multi-frame smoke). NTSC→Rec.709 luma match Gaia `luma.glsl:3-4`; two-mesh workaround collapsed to one; `CLOUD_SHADOW_LUMA_CUTOFF` dedup. First iteration flickered 15 units from self-shadow loop; fixed by `receiveShadow={false}` on the cloud mesh.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Gaia writes depth from `cloud.fragment.glsl`; atlas keeps `customDepthMaterial` because cloudMaterial has `depthWrite:false` (T3.6 CustomBlending). Arch adaptation documented in `usePlanetMaterials.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **T2.0 — SunScreenFlare predecessor sweep**   | `cd626dc`                                                                    | **PURE DELETION** — atlas-native predecessor to θ.4, not a Gaia port. 3-sprite object-space layer removed; Sun now renders through `ProceduralSun3D` billboard + θ.4 `PseudoLensFlareEffect` post-process only. Orphan sweep confirmed no remaining refs to `SunScreenFlare` / `createRadialGradientTexture` / `createStarburstTexture` in `src/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | None. Gates green (873/873 tests; lint + build clean). Runtime smoke: 55-56 FPS sustained across two 2s windows; zero console errors; scene renders cleanly. L26 per-pixel temporal sampling blocked by `preserveDrawingBuffer: false` on the Three.js canvas — acceptable fallback for a pure-deletion onda with no new shader/uniform surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **T2.3a — lens sprite placeholder wiring**    | `51750c3`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY 7/7 PASS + runtime smoke). Procedural `DataTexture` bakes in `lensFlareSprites.ts` replaced by `THREE.TextureLoader().load(...)` with contract preserved: LinearFilter + ClampToEdge (Repeat for starburst wrapS) + NoColorSpace + no mipmaps. URLs use `${BASE_URL}textures/lens/...`. 7 new jsdom-env tests pin the sync contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Placeholders are the Gaia originals (sha256 `d59b923b…` / `c61a00d7…` / `71da64eb…`) at `public/textures/lens/` — gitignored via `public/textures/lens/*.{png,jpg}`. Real asset sizes (256×1, 819×461, 502×60) differ from the old procedural bake sizes (256×1, 512×512, 256×1); shader samples by UV so dimensions are free. License-ambiguous — T2.3b swaps for CC-BY-4.0 user-supplied replacements.                                                                                                                                                                                                                                                                                                                                                                                                                |
| **T2.1 — COMPLEX lens flare port**            | `a2c6594`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY 10/10 PASS + runtime smoke). `lensflare.frag.glsl` `#ifdef complexLensFlare` branch ported as new pmndrs `LensFlareEffect`; Sun-projection driver in `LensFlareInjector.tsx` pushes `[uv.x, uv.y]` → light slot 0, off-screen cull via `clearLights()` + `setIntensity(0)` (matches `MainPostProcessor.java:671`). Default variant flipped from PSEUDO → COMPLEX per `config.yaml:606`. 13 new pinned tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Divergences all documented inline: `rnd` → `rnd1`/`rnd2` (GLSL ES no overload), `STRENGTH = 0.35` hardcoded (dirt-inline path), constant loop bound + break (GLSL ES), inline dirt + starburst (pmndrs single-Effect architecture), `inputColor.a` preservation on early-out. SIMPLE branch NOT ported (Gaia ships COMPLEX by default). `u_color = (1,1,1)` hardcoded per `LensFlareFilter.java:32`. PseudoLensFlareEffect preserved as importable opt-in.                                                                                                                                                                                                                                                                                                                                                              |
| **T3.3 — Eclipse geometry**                   | `c44f913`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY 11/11 PASS + runtime smoke). `eclipses.glsl` ported across `eclipseMath.ts` (10 constants + 4 helpers + 26 pinned tests) + `eclipseShaderPatch.ts` (GLSL templates reusing JS constants via string interpolation) + `usePlanetMaterials` Earth branch extension + new eclipse-only branch for Moon + per-frame driver in `Planet.tsx`. `CelestialBody.eclipsingBodyId?` field added; Earth↔Moon pair wired.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Divergences documented: outline branch (`#ifdef eclipseOutlines`) skipped (Gaia debug wireframe); `gs_` prefix on helpers (avoids ShaderChunk collision); `uEclipsingActive` runtime gate (atlas-added, replaces Gaia's compile-time `#ifdef eclipsingBodyFlag`); single injection site before `<output_fragment>` vs Gaia's two-call split. Visual verification requires time-warping to a known eclipse event — smoke scope limited to compile + static render + no flicker.                                                                                                                                                                                                                                                                                                                                          |
| **T4.6 — Quad-SDF line rendering**            | `a6a3644`                                                                    | **1:1 VERIFIED** (Step-3 PRE-CHECK + DIFF GATE + SUBAGENT VERIFY 10/10 PASS + runtime smoke). `line.quad.cpu.fragment.glsl:20-33` SDF feathering ported as `onBeforeCompile` patch on drei's LineMaterial. `lineSdfMath.ts` + 14 pinned tests; `useGaiaSdfLinePatch.ts` preserves LineMaterial's original `onBeforeCompile` (`USE_LINE_COLOR_ALPHA` define) via chained bind. Three-stdlib@2.36.1 sentinel pinned by `useGaiaSdfLinePatch.test.ts` (3 tests — added 2026-04-22 after codex audit false-alarmed the sentinel as missing).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Divergences documented: `(v_uv.y-0.5)*2.0` skipped (drei's vUv.y already [-1,1]); `layerBuffer` → `gl_FragColor`; `logarithmicDepth()` handled by Three's `<logdepthbuf_fragment>` + renderer-level flag; shader-side premultiply collapses to standard GPU alpha blend (algebraically equivalent). Applied only to `PlanetOrbitLine`; other drei `<Line>` usages get the plain LineMaterial unchanged unless they also install the hook.                                                                                                                                                                                                                                                                                                                                                                               |
| **T2.5 + T2.6 — lighting drift closure**      | `9910eeb`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY 4/4 PASS + runtime smoke). T2.6 `envMapIntensity` 1.9-2.1 → 0.0 matches Gaia exactly (`pbr.fragment.glsl:620-621` — reflection skybox is specular-only, no diffuse IBL). T2.5 `shadowIntensity` 1.3-1.5 → 0.4 (ROADMAP Option 1 empirical floor) drops focused-body over-brightness vs `LightingUtils.java:49 pointLight.intensity=1` from ≈2.5× to ≈1.4×. JSDoc header at `visualPresets.ts:33-49` cites source lines; CLOSE_FLYBY's shadow/envMap differentiation retired. `SmartSunLight.tsx` default 1.5→0.4 (cosmetic — useVisualPresetLerp overwrites per frame).                                                                                                                                                                                                                                                                                                                                                                                       | T2.5 residual ≈40% over-brightness on focused body is Three.js architectural: libGDX PBR's per-model point-light shadow map has no r3f direct equivalent, so SmartSunLight's DirectionalLight intensity must stay >0 to cast visible crater/cloud shadows. Option 3 (point-shadow cubemap at origin, 3-5 d) would drop the drift to 0 at higher perf cost — tracked under ROADMAP §T2.5 for later.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **T4.4a — gridrec math extraction**           | `49fdaf0`                                                                    | **1:1 VERIFIED** (Step-3 PRE-CHECK + DIFF GATE + SUBAGENT VERIFY 15/15 constants + 9/9 helpers PASS). Pure-TS mirror of `gridrec.fragment.glsl` (MPL-2.0) landed as `src/components/canvas/shaders/gridRecMath.ts` + 59 pinned tests. Constants: N=10, BASE_LINE_WIDTH=5, BASE_COL_DIAG=(1,0.492,0.09,0.3), RAD=π/180, circle level-F 10/1, square level-F 400/40, square LW mult 2, cross/diag pow 2/3, diag rotation 45°, heightScale fade exp 0.5, circle dist-cull 40, center smooth-stop 0.3, radial alpha exp 4. Helpers: rotateUV, remapUvToSigned, radialAlpha, heightScaleFade, lineWidth, circleGridFunc, squareGridFunc, circleCenterAlphaMultiplier, circleIsCulled, smoothstep, styleToElevationMultiplier.                                                                                                                                                                                                                                                                                    | Building-block ship — no runtime wiring, no shader mount yet; `circle()` / `square()` / `circle_rec()` / `square_rec()` composites + `main()` body (depth + branching) intentionally deferred to T4.4b. Step-3 PRE-CHECK corrected ROADMAP drift: ROADMAP mentioned a `gridrec.vertex.glsl` that doesn't exist — `RenderAssets.java:211` pairs the fragment with `shader/default.vertex.glsl`. CIRCULAR confirmed as Gaia's default `recursiveGrid.style` per `config.yaml:384`.                                                                                                                                                                                                                                                                                                                                        |
| **T4.4b — gridrec shader + mount + sweep**    | `94af1b8`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY uniform-by-uniform + helper-by-helper PASS + runtime smoke). `gridrec.fragment.glsl` composites (`rotateUV`, `circle_rec`, `circle`, `square_rec`, `square`, `main`) ported verbatim to `shaders/gridRecShader.ts` — numeric literals template-interpolated from T4.4a's `gridRecMath.ts` via `glslFloat()`, so shader constants cannot drift from TS mirrors. `GridRecursive.tsx` mounts on a 40k×40k horizontal quad via `buildGridRecShaderMaterial()` (transparent + additive + double-sided, `derivatives=true`). `gridRecursiveConfig.ts` hosts layout/fade constants so the component file passes `react-refresh/only-export-components`. 28 new jsdom tests (1021 total).                                                                                                                                                                                                                                                                             | Predecessor swept: `EclipticGrid.tsx` (341 LOC) + `.test.ts` + `eclipticGridHelpers.ts` deleted under `feedback_no_effect_stacking.md`. **AU tick labels regress** (1/2/5/10/20/30/40 AU sprite text — atlas-opinion, no Gaia equivalent on the grid mesh) until T4.5 brings a Gaia-native MSDF label path. 6 documented divergences: WebGL1 GLSL 1.00 not 330 core; log-depth include + depth-buffer write skipped (linear depth stable at current camera ranges); `simple_noise` dropped (defensive-only in Gaia); `layout(location=0)` → `gl_FragColor` single-MRT; opacity via `u_opacity` uniform instead of `v_opacity` varying; `gridrec_`/`GRIDREC_` namespace prefixes. T4.4c driver landed (see next row); T4.4d (orientation toggle) + T4.4e (projection lines) remaining.                                   |
| **T4.4c — getGridScaling runtime driver**     | `2e42b8c`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY 6/6 PASS + runtime smoke). `gridRecScaling.ts` ports `GridRecUpdater.java:148-160`'s decade-walk + `gridRecLint` mirror of `MathUtilsDouble.lint`. `GridRecursive.tsx`'s `useFrame` now feeds `camera.position.length()` → `getGridRecScaling` → `u_tessQuality` + `u_heightScale` every frame. 18 new tests (1039 total) covering decade brackets, lint contract, scale-invariance sampling, and the Gaia >10^25 fallback. 1 documented divergence: no AU conversion (algorithm is scale-invariant — same normalized `(tessQuality, heightScale)` pair emerges whether caller feeds atlas world units or AU).                                                                                                                                                                                                                                                                                                                                                | Grid now actually recursive: level-1 rings sit at 1 / 10 / 100 / ... world units and smoothly swap when the camera crosses a decade boundary — smoke confirms concentric-ring geometry visible at close zoom that static-uniform T4.4b produced a flat pattern at. The atlas-native scene-level opacity fade (10k → 140k world units) remains as a UI affordance on top of the Gaia driver. T4.4d (orientation toggle) + T4.4e (projection lines) left to close T4.4 fully.                                                                                                                                                                                                                                                                                                                                             |
| **T4.4d — orientation toggle**                | `379fd2e`                                                                    | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY 8/8 PASS + runtime smoke). `src/lib/gridOrientation.ts` ports `Coordinates.getRotationMatrix` + the three orientation matrices (OBLIQUITY 23.4392808°, galactic Euler R/Q/P from `Coordinates.java:39-41`) + per-orientation color callouts (ccEq/ccEcl/ccGal = gRed/gGreen/gBlue byte-exact). `GridRecursive.tsx` wraps the mesh in a `<group>` whose quaternion comes from `getGridOrientationMatrix(orientation)` + mutates `u_diffuseColor` / `u_emissiveColor` on flip. `LayersPanel.tsx` adds a 3-way ChoiceButton radio under the renamed "Coordinate Grid" toggle; store adds `gridOrientation: "equatorial"\|"ecliptic"\|"galactic"` slice + `setGridOrientation` setter (default `"ecliptic"`). 23 new pinned tests (1062 total).                                                                                                                                                                                                                   | Documented axis-convention divergence: atlas's "ecliptic" orientation dispatcher returns identity because atlas's world frame is already ecliptic-aligned (planets orbit the XZ plane); Gaia's frame is equatorial so `Gaia EQUATORIAL=null-transform, ECLIPTIC=obliquity-rotation` inverts to `atlas ecliptic=identity, equatorial=obliquity-rotation`. Inner-ring color is the outer RGB at α=0.3 (atlas-opinion; Gaia uses a complementary color via `ColorUtils.getRgbaComplimentary` at `GridRecursiveRadio.java:51`). T4.4e (projection lines per `GridRecUpdater.java:84-102`) is all that remains to close T4.4.                                                                                                                                                                                                |
| **T4.9a' — Sun billboard at stellar dist.**   | `3c3846d`                                                                    | **Behavior approximation** (not 1:1; documented divergences). `src/lib/sunRenderRange.ts` pins `SUN_BILLBOARD_THRESHOLD_AU = 100` + `resolveSunRenderRange(dist)` gate; 5 pinned tests cover boundary + AU↔world-unit conversion. `SunBillboard.tsx` mounts a Three.js `<sprite>` with AdditiveBlending at the origin; per-frame self-gates visibility via `resolveSunRenderRange`, scales to constant on-screen size (`dist × SCREEN_SIZE_FACTOR=0.012` ≈ 17 px @ 1080p). `ProceduralSun3D.tsx` adds the inverse gate (group hides when `range === "far"`) so the two never composite (no `feedback_no_effect_stacking.md` violation). Procedural-mode-only for first ship; texture-mode Sun keeps current behavior.                                                                                                                                                                                                                                                                                      | Threshold uses simple AU distance vs Gaia's solid-angle + screen-footprint formula in `SingleStarQuadRenderer.java` — conservative placeholder. Texture is a byte-identical copy of `star-tex-03.jpg` placeholder; visually inherits star-tex-03's 4-ray cross-spike pattern instead of star-tex-04's softer halo. Real asset swap aligned with T2.3b in the final asset-licensing wave. Three.js `<sprite>` (auto-billboard) replaces Gaia's manual quad + vertex-shader rotation — same visual result, lower complexity. **Texture Sun mode (Sun-as-Planet) NOT gated** — out of scope for first ship. Runtime smoke limited (preview-MCP RAF stuck in background-tab throttle); HMR + console-clean during dev confirms no regression at boot.                                                                       |
| **T4.5-β — body name labels (drei `<Text>`)** | `49a44f9`                                                                    | **1:1 VERIFIED** for the SDF-text path; documented divergences for the visibility ramp (deferred). `src/lib/labelMode.ts` adds `LabelMode = "html" \| "sdf"` + `DEFAULT_LABEL_MODE = "html"` (a11y-safe). Store gains `labelMode` slice + `setLabelMode` setter (in-memory only). `PlanetLabels3D.tsx` renders one drei `<Text>` per body; per-frame mesh lookup cached by id; group billboards toward camera; scale = `(distance/1000)×9` for screen-stable text. Imperative `groupRefs` Map sidesteps `react-hooks/immutability` flag. Self-gates on `labelMode === "sdf" && showLabels`; per-body `showLabel` driven by `OverlayPositionTracker` (same collision arbitration as HTML mode). `PlanetOverlay.tsx` HTML label `<button>` gated additionally on `labelMode === "html"`; icon `<button>` stays unconditional (a11y surface in both modes). `LayersPanel.tsx` adds a 2-way ChoiceButton "Label Renderer" sub-section under the Labels toggle. 4 new lib tests + store-slice test (1116 total). | Smoothing uses troika's default `fwidth(distance)` vs Gaia's `1/(16 × u_scale)` from `font.fragment.glsl:26` — same decision as T4.5-δ (troika is DPR-aware + adapts to zoom; Gaia's fixed divisor stays pinned in `MSDF_SMOOTHING_DIVISOR` for a future override onda). Visibility uses boolean `showLabel` flag from `OverlayPositionTracker` instead of Gaia's per-body solid-angle fade-in ramp from `font.vertex.glsl:21-28` — first-cut simplification; full ramp port is a T4.5-β-ramp follow-up. Text size uses linear distance multiplier vs Gaia's `view.textScale() × camera.getFovFactor()` machinery — same intent, simpler. Default mode keeps HTML so a fresh boot retains every existing a11y guarantee. Runtime smoke limited (same preview-MCP RAF caveat as T4.9a'); HMR + console-clean during dev. |
| **T4.2-α — proximity-aware damping**          | `dae3815`                                                                    | **Behavior port** (algebraic identity for the proximity formula; saturation + scoping divergences documented). `src/lib/camera/proximityDamping.ts` ports Gaia's `counterAmount` curve from `NaturalCamera.java:993-997` via `1/((dist-elev)/elev) = elev/(dist-elev)` (algebraic), then saturates via `closeness = ratio/(1+ratio)` to fit OrbitControls' `dampingFactor ∈ (0,1]` domain. Constants pinned: `PROXIMITY_DAMPING_BASE=0.05` (= pre-T4.2-α OrbitControls default) and `PROXIMITY_DAMPING_MAX=0.5` (empirical surface-stop ceiling). 9 pinned tests (1125 total). `CameraController.tsx` writes the per-frame value inside the existing focus useFrame; PRE-CHECK confirmed at `OrbitControls.js:191-235` that three-stdlib reads `scope.dampingFactor` per `update()` so live mutation works without re-init. SUBAGENT VERIFY caught a missing `fullStop` documentation note; fixed pre-commit.                                                                                               | Documented divergences (proximityDamping.ts header): `lastFwdAmount` directional gate not ported (OrbitControls bidirectional); `cinematic` toggle deferred (open decision in ROADMAP §T4.2); saturation curve replaces Gaia's unbounded `counterAmount`; `fullStop` precondition not needed (OrbitControls' single damping mode is naturally swamped by active user-input deltas — architectural difference is Gaia: 2 friction modes vs atlas: 1 damping mode); terrain-aware elevation reduced to spherical radius (atlas has no terrain); output domain scalar (0,1] vs Gaia 3D friction vector. Runtime smoke limited (preview-MCP RAF stuck on background-tab throttle, same caveat as `3c3846d` / `49a44f9`); console clean.                                                                                     |

---

## → Next up: **T4.2 wave continues — α shipped (`dae3815`)**, γ next. T4.5 fully closed (α + β + δ shipped; γ retired). T4.9a' shipped with placeholder asset; T4.9b' retired; T2.3b deferred. T4.4 fully closed. Clear ship sequence:

1. **T4.2-γ** — Inertial zoom physics (~3-5 d). Replace `NormalizedWheelZoom` step accumulator with velocity-integrating zoom mirroring `NaturalCamera.java:980-1010`. Independent of α/β. PRE-CHECK: confirm three-stdlib OrbitControls allows external `dollyIn`/`dollyOut` calls interleaved with internal `update()` without breaking the spherical-coords accumulator.
2. **T4.2-β** — Surface mode (~3-4 d). Port `NaturalCamera.java:524-548` `surfaceModeFlag` (`distFromFocus < radius × 2.5 / fovFactor`) + free-rotation handler swap. Depends on T4.2-α (shipped).

**Asset-deferred (shipped what was possible, asset swap waits)**: T4.9a' (Sun billboard at stellar distances) shipped at `3c3846d` with `star-tex-04-low.jpg` placeholder = byte-identical copy of existing `star-tex-03.jpg`. Real asset swap aligned with T2.3b in the final asset-licensing wave.

**Retired (won't port, header kept for traceability)**: T4.5-γ (constellation lines — atlas is solar-system-first, no orbital-mechanics value); T4.9b' (close-Sun dataset port — `ProceduralSun3D` covers acceptably, re-open only on user complaint); T3.7 / T3.9 / T4.7 / T4.9c (per earlier audit passes).

**Out of current session's scope**: **T4.1 camera-relative rendering** (2-3w, unlocks T4.4e-α's Gaia-faithful projection-line math but large refactor), **T4.3 particle system** (2-3w, subsumes Milky Way backdrop gap).

All shipped this session 2026-04-23: T2.5 + T2.6 (`9910eeb`); T4.4 full wave (`49fdaf0` → `ae13866` across 6 sub-waves); T4.4e-β projection lines mount (`ae13866`); LightGlow cross-spike fix + asset swap (`d6165c6` + `a9f9bd5`); T4.9 R1 re-verify (`e2a01df`); comprehensive drift audit CLEAN verdict (`a065136`); T4.5-α MSDF math (`ed22f53`); T4.5-δ AU tick labels (`7abbc78`); M5 lesson on subagent-citation verification (`677ee5c`); **T4.9a' Sun billboard at stellar distances (`3c3846d`)** — placeholder-asset ship; **ROADMAP unblock pivot + T4.2 sub-wave plan (`e9eb1e6`)** — T4.5-γ retired, T4.9b' retired, T2.3b deferred to final asset wave, T4.2 α/β/γ plan written; **T4.5-β body name labels via drei `<Text>` (`49a44f9`)** — additive opt-in via `labelMode: "html" | "sdf"` slice (default `"html"`, a11y-safe).

Earlier ships still load-bearing: T2.0 `cd626dc`, T2.1 `a2c6594`, T2.3a `51750c3`, T2.4 `a722bba`, T3.3 `c44f913`, T3.4 `9c06c16`, T3.5 `33807b6`, T3.6 `785c925`, T4.6 `a6a3644`. Confirmed NOT ports: T3.7, T3.9, T4.7, T4.9c.

Lens Closure Wave (default path) complete: T2.0 ✅ `cd626dc`,
T2.3a ✅ `51750c3`, T2.1 ✅ `a2c6594`. T3.3 ✅ `c44f913` adds
eclipse geometry. **T2.3b** deferred to the final asset-
licensing wave (decision 2026-04-23): the gitignored
placeholders at `public/textures/lens/` stay in place for
regular development; `.gitignore` is the safety rail; swap
runs alongside T4.9a' real-asset swap when the asset wave
fires. **T2.2** (opt-in PSEUDO blur, not on Gaia default path)
remains optional/deferred.

**Tier-4 hygiene pass (2026-04-22)**: two more items closed via
L31-style re-verification:

- **T4.7** (Milky Way backdrop) — **❌ NOT PORTING as described**.
  ROADMAP said "Gaia: panoramic cubemap with dust"; reality is
  Gaia renders the MW as a `BillboardDataset` (procedural
  particle set) via `BillboardSetExtractor`. The only Gaia
  skybox reference (`config.yaml:20 reflectionSkyboxLocation`)
  is for cubemap REFLECTIONS, not a backdrop. An ESO panorama
  ship would be atlas-opinion, not Gaia-fidelity; the MW gap
  properly belongs inside T4.3 scope expansion (which already
  covers asteroid belt + Kuiper + clusters + nebulae via
  Gaia's particle pipeline).
- **T4.8** (transparency sorting / OIT) — **AUDIT CLOSED**.
  Refreshed renderOrder inventory (SunScreenFlare removed per
  T2.0; EclipticGrid labels at -97 were missed in pre-audit).
  Both known risks from the ROADMAP text are addressed:
  cloud+atmosphere additive stacking fixed by T3.6 (`CustomBlending`
  flipped clouds from additive to multiplicative BlendMode.COLOR)
  - T3.4 (`receiveShadow:false` on cloud mesh fixed the 15-unit
    maxDelta L26 caught); ring vs overlay composition correct at
    1000 vs 2000 regardless of traversal. No OIT needed at
    current atlas scope; re-open if multi-overlapping translucent
    layers ship later (T4.3 nebulae etc.).

**Tier-3 hygiene pass (2026-04-22, earlier this session)**:
R1-reading each remaining T3.x item against `/tmp/gaiasky/`
surfaced three more ROADMAP drifts matching the L30 / L31
pattern:

- **T3.7** (atmosphere exponent parameterization) — **MOOT**.
  The `pow(max(..), 4.0)` rim-glow hardcode it referenced
  vanished when θ.5b+c shipped the Nishita multi-sample
  scattering. No parameter to parameterize.
- **T3.8** (roughness-map colour-space audit) — **AUDIT CLOSED**
  via doc-only ship. Solar System Scope linear specular TIFF →
  atlas bake via `.grayscale().negate()` preserves linearity →
  JPG stored byte IS the linear roughness × 255 →
  `NoColorSpace` is correct. `SRGBColorSpace` would understate
  roughness by ~4× on rough bands. Chain-of-custody comment
  added at `usePlanetAssets.ts:139-158`.
- **T3.9** (lightscattering god rays) — **❌ NOT PORTING**.
  `LightScattering.java` is Gaia dead code (zero `new
LightScattering(` hits across the repo); `MainPostProcessor.java`
  wires `LightGlow` (atlas θ.3) but never the scattering effect.
  The Gaia GUI label "light scattering" toggles LightGlow, whose
  shader's own header comment reads "Light scattering
  implementation". Atlas already has parity on the active Gaia
  path via θ.3. Porting the inactive effect would diverge from
  Gaia default. **L31 captured** to prevent future
  ROADMAP-vs-dead-code traps.

**T3.3 landed 2026-04-22 (`c44f913`)** — three new files:
`src/components/canvas/shaders/eclipseMath.ts` (pure-TS mirror
with 10 constants + 4 helpers),
`src/components/canvas/shaders/eclipseMath.test.ts` (26 pinned
tests), `src/components/canvas/shaders/eclipseShaderPatch.ts`
(reusable GLSL templates). Plus: `eclipsingBodyId?` on
`CelestialBody` (Earth → "moon", Moon → "earth"), extended
Earth day/night branch with optional eclipse patch, new
eclipse-only branch for Moon, per-frame driver in `Planet.tsx`
that looks up eclipsing body via `scene.getObjectByName`,
pushes world-pos + semantic radius + vrScale into uniforms.
Under the Gaia-fidelity rule this closes the
"syzygies invisible" gap (ROADMAP §T3.3 pre-ship text).

**T2.1 landed 2026-04-22 (`a2c6594`)** — new
`src/components/canvas/scene/effects/LensFlareEffect.ts` ports
Gaia's `lensflare.frag.glsl` `#ifdef complexLensFlare` branch
1:1 (lines 84-161). Helpers `lensFlareCircle`, `regShape`,
`rnd1`, `rnd2` byte-for-byte; main() with the 6-sample
Archimedean-spiral occlusion luma check. Driver
`LensFlareInjector.tsx` projects the Sun world-pos → NDC → UV
via `ndcToLensFlareUv`, pushes slot 0, off-screen cull matches
`MainPostProcessor.java:671`. Atlas's default flare variant now
matches Gaia's `config.yaml:606 type: COMPLEX`. PSEUDO
(`PseudoLensFlareEffect`) stays importable as opt-in alternate.
Runtime smoke: COMPLEX ring pattern visible around the Sun at
58.5 FPS; zero console errors; 890 tests pass (+13 from T2.1).

**Wave reorder rationale (2026-04-22)**: the original order
T2.2 → T2.1 put PSEUDO's 35-pass blur before the COMPLEX port.
Re-verification against `/tmp/gaiasky/` exposed that as a
Gaia-fidelity violation:

- **Gaia's default** is `lensFlare.type: COMPLEX` per
  `config.yaml:606`. The COMPLEX pipeline (`lensflare.frag.glsl`)
  is the shader Gaia Sky renders out of the box — and is a
  **completely different shader** from PSEUDO's
  `pseudolensflare.frag.glsl`.
- **Atlas today ships only PSEUDO** (θ.4). Out-of-box atlas
  therefore diverges from out-of-box Gaia. This is the divergence
  the user's cross-AI review was actually describing.
- **The 35-pass blur is PSEUDO-only**. `MainPostProcessor.java:268-312`
  branches: if `type == PSEUDO` → `PseudoLensFlare` (with the blur);
  else → `LensFlare` (COMPLEX/SIMPLE, **no blur chain**).
  `PseudoLensFlare.java:197-212` shows the blur is **internal**
  to PseudoLensFlare, sandwiched between the flare and dirt
  stages — **not** "between PseudoLensFlareEffect and Bloom" as
  ROADMAP claimed.
- Spending 2-3 d polishing PSEUDO's blur before COMPLEX exists
  would be tuning the secondary variant before the primary even
  lands. Under `feedback_default_gaia_fidelity.md`, D-type
  decisions resolve silently toward Gaia-default ⇒ T2.1 first.

**T2.2 status**: **demoted** from Lens Closure Wave to optional
follow-up. Only relevant if user explicitly opts the atlas
variant-selector into PSEUDO. Remains tracked in ROADMAP for
that scenario; no longer blocks any default-path onda.

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
differ from the old procedural bake). T2.3a also pre-wires the
placeholder `lensstarburst.jpg` that COMPLEX will consume via
`LensFlare.java:77-93` when dirt is enabled, so T2.1's dirt path
inherits the same asset surface.

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

| Onda             | Scope                                                                                                                                                                                                                                                                                                                                                                                                        | Effort         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| ~~**T2.0**~~     | ✅ **Shipped `cd626dc`** — `SunScreenFlare.tsx` + `Planet.tsx:21` import + mount at `Planet.tsx:839-845` deleted. Orphan helpers (`createRadialGradientTexture`, `createStarburstTexture`) gone with the file.                                                                                                                                                                                               | done           |
| ~~**T2.3a**~~    | ✅ **Shipped `51750c3`** — `lensFlareSprites.ts` rewritten on top of `THREE.TextureLoader().load(...)`; Gaia-original placeholders copied to `public/textures/lens/`; targeted `*.{png,jpg}` rule added to `.gitignore`; `LENS_*_SPRITE_SIZE` dead code removed; 7 jsdom-env contract tests added.                                                                                                           | done           |
| ~~**T2.1**~~     | ✅ **Shipped `a2c6594`** — new `LensFlareEffect` pmndrs Effect ports `lensflare.frag.glsl` complex branch 1:1; Sun-projection driver via `ndcToLensFlareUv` + `getObjectByName("sun")`; off-screen cull via `clearLights()` + `setIntensity(0)`. Default variant flipped PSEUDO → COMPLEX matching `config.yaml:606`. 13 new pinned tests; PSEUDO preserved as opt-in.                                       | done           |
| _T2.2 (demoted)_ | Port PSEUDO's 35-pass Gaussian blur chain (internal to `PseudoLensFlare.java:197-212`, between the flare and dirt stages); raise `PSEUDO_LENS_FLARE_DEFAULT_INTENSITY` from `0.03` back to Gaia literal `0.15`; verify no periphery rings. **Only relevant if user opts atlas into PSEUDO variant**; not on the default path. Previously listed before T2.1 — reordered 2026-04-22 under Gaia-fidelity rule. | 2-3 d (opt-in) |
| **T2.3b**        | **CC-BY-4.0 asset swap** (BLOCKS on user AI-gen delivery). When user drops replacements into `references/gaia-sky-source/` (verify by hash-delta AND mtime ≥ `2026-04-22`): copy to `public/textures/lens/`, remove the gitignore rule, add credits to root `README.md` + new `public/textures/CREDITS.md`.                                                                                                  | 2-4 h          |

Lens Closure Wave default path complete in-session (T2.0, T2.3a,
T2.1 all shipped 2026-04-22). Only T2.3b remains on the default
path and blocks on user delivery of CC-BY-4.0 assets. T2.2
(opt-in, 2-3 d) tracked outside the default-path total.

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

Every onda ships through 13 steps. Three independent verification
layers replace visual parity: self-run **DIFF GATE** + independent
**SUBAGENT VERIFY** + pinned **MATH TESTS**. The first two steps
are ROADMAP-hygiene guards added 2026-04-22 after L30/L31 caught
cases where porting the ROADMAP-named shader would have shipped
dead code (T3.9) or the wrong variant (T2.2 before reorder).

1. **Kickoff read** — this file + `AGENTS.md`, `CLAUDE.md`,
   `tasks/ROADMAP.md`, `tasks/lessons.md`, `/tmp/gaiasky/`.
   Identify §Next up.
2. **ROADMAP PRE-CHECK (L30 + L31)** — before R1-reading the
   shader, grep `/tmp/gaiasky/assets/conf/config.yaml` for the
   feature's default flag + grep `core/src` for `new
<EffectClass>(` to confirm Gaia wires the target. Zero
   instantiations = dead code; demote. Non-default variant =
   reorder wave. Numeric drift vs `*Filter.java` = trust Java.
   Any drift found here gets documented in ROADMAP + lessons.md
   BEFORE step 3.
3. **R1 source-read** — open the cited Gaia `.glsl` / Java
   files. No plan-prose shortcuts.
4. **Plan port** — smallest diff matching source; identify
   which math layer needs extraction to TypeScript helpers.
5. **Implement** + extract math to `foo.ts` + `foo.test.ts`.
   Pin sample input/output values against Gaia behavior
   (pattern: `lensFlareMath.test.ts`, `eclipseMath.test.ts`,
   `starfieldShaderMath.test.ts`).
6. **PREDECESSOR SWEEP (L29)** — grep for any atlas-native
   equivalent the port is replacing. Delete in the same commit
   or document in the message why it stays. Skipping is how
   θ.4 shipped with `SunScreenFlare` stacking intact.
7. **⭐ DIFF GATE** (L22) — self-run line-by-line diff between
   Gaia source and atlas port. Every divergence carries a
   one-line rationale comment (arch adaptation / HDR strategy
   / intentional tuning). Undocumented divergence blocks ship.
8. **⭐ SUBAGENT VERIFY** — dispatch an Explore subagent
   (Sonnet) with **no context from this session**. Prompt:
   "Re-diff <atlas port> against Gaia <file:line>. Cite
   file:line for every divergence. Flag undocumented."
   Agent's verdict is independent of the implementer's
   rationalizations. Resolve findings before proceeding.
9. **Gates** — `npm test -- --run` (pinned math tests run
   here), `npm run lint`, `npm run build`.
10. **Runtime smoke** — Claude Preview MCP; check console for
    shader compile errors; confirm scene renders; L26
    multi-frame stability check if the port touches any
    transparent-sort or HDR layer.
11. **Commit** with message citing source files.
12. **Update STATUS.md** (this file) and `ROADMAP.md` — mark
    onda shipped, flag residual drifts, move to next.
13. **Update `lessons.md`** only if a new engineering failure
    mode was discovered. **Loop** — read §Next up.

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
