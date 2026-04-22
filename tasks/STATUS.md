# Phase θ — Gaia Sky port status

Single source of truth for where we are in the visual port. Read FIRST.

_Last updated: 2026-04-22 after θ.5b+c ship (`bc0a429`) — Rayleigh+Mie atmosphere + per-frame uniforms wired for Earth. Pending user live-watch confirmation; next = θ.5d (per-body configs)._

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
5.  DIFF GATE — self-run a line-by-line diff between the Gaia
    source shader and the atlas port. Every divergence carries a
    one-line rationale comment in the atlas code. Undocumented
    divergence is a ship blocker.
6.  SUBAGENT VERIFY — dispatch an Explore subagent (Sonnet) with
    no context from this session. Prompt: "Re-diff <atlas port
    file> against Gaia source at <file:line>. Cite file:line for
    every divergence. Flag any undocumented divergence." Resolve
    findings before proceeding.
7.  Gates: `npm test -- --run`, `npm run lint`, `npm run build`.
8.  Runtime smoke: Claude Preview MCP — confirm no shader compile
    errors AND scene renders AND **does not flicker over time**
    (L26: screenshots don't catch temporal bugs; use multi-frame
    pixel sampling via preview_eval+rAF for ≥30 frames, or ask the
    user to watch live, before marking smoke passed).
9.  Commit with source-file citations in the message.
10. Update tasks/STATUS.md (shipped row + §Next up) and
    tasks/ROADMAP.md (item → done + commit SHA).
11. Update tasks/lessons.md only if a new engineering failure
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
6. `tasks/lessons.md` — cross-cutting engineering lessons (L1–L26).
7. `/tmp/gaiasky/` — cloned Gaia Sky source. Read the actual
   `.glsl` / `.java` BEFORE any port (memory rule
   `feedback_gaia_sky_source_first`).

After reading, the **→ Next up** section tells you exactly what to do.

---

## Shipped ondas

| Onda                                       | Commits                                                                      | 1:1 status (verified pass P10 — diff)                                                                                                                                                                                                                                                  | Known drifts / known-good                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **θ.1 + θ.1b — star billboard**            | `2662f08`, `13e501e`, `22349b0`..`fa23a27` (10 commits ending with LEN0 fix) | **1:1 VERIFIED**. Divergences are stylistic unrolls, inlined `luma.glsl`, pmndrs adaptations — all documented.                                                                                                                                                                         | None outstanding. Full Gaia color pipeline (Ballesteros → xyY → XYZ → γRGB +0.16 HSV), LEN0 unit fix, pseudo-size kernel all match source line-for-line.                                                                                                                                                                                                               |
| **θ.3 — LightGlow**                        | `a27dc42`, `fdb66ae`                                                         | **1:1 VERIFIED** with documented arch divergences (vertex→fragment move required by pmndrs; HDR clamp strategy scoped to glow contribution). Spiral scale IS FOV-aware (2026-04-22 T1.3 audit).                                                                                        | Sprite uses pure radial gaussian because Gaia asset `star-tex-03-*` is in `$GS_DATA` with no public license. (FOV-factor drift listed in earlier STATUS rows was audit-stale: `LightGlowInjector.tsx:141-186` already drives `setSpiralScale(.../fovFactor)` per frame — shipped in `a27dc42`.)                                                                        |
| **θ.4 — PseudoLensFlare**                  | `db407dc`, `4cc35cb`                                                         | **1:1 VERIFIED** (post-T1.1). Starburst Y-coord now matches Gaia.                                                                                                                                                                                                                      | Starburst Y-coord fixed in T1.1 (`4cc35cb`) — extracted to `PSEUDO_LENS_STARBURST_SAMPLE_Y_COORD = 0.0` with pinned regression test. Residual: 35-pass blur omitted → `flareIntensity=0.03` vs Gaia literal `0.15` (documented tuning). Ships PSEUDO variant; Gaia default is COMPLEX (`MainPostProcessor.java:280-312`, different shader entirely) — tracked as T2.1. |
| **θ.5a — atmscattering snippet**           | `c2f05a6`                                                                    | **1:1 VERIFIED** (DIFF GATE + independent SUBAGENT VERIFY). Snippet byte-identical except header guards (documented). Math mirrors pin 16 values against hand-derived Gaia formulas.                                                                                                   | Building-block ship — consumed by θ.5b+c at `bc0a429`. No runtime behavior change at this commit.                                                                                                                                                                                                                                                                      |
| **θ.5b+c — atmosphere + per-frame wiring** | `bc0a429` (prior `56d0e38` **reverted `422d794`**)                           | **1:1 VERIFIED** (DIFF GATE + SUBAGENT VERIFY). Earth uses Nishita Rayleigh+Mie via snippet. Per-frame `v3CameraPos`/`v3LightPos`/`fCameraHeight` in planet-local frame via T1.2-pattern inverse matrix. Multi-frame preview_eval smoke (L26): maxDelta=0 across 60 frames × 7 points. | Scope limited to Earth — uniform bundle `buildEarthAtmosphereUniforms()` hard-wires Earth's Nishita coefficients. Mars/Venus/others wait for θ.5d's per-body config layer. Pending user live-watch (final oracle per L26).                                                                                                                                             |

---

## → Next up: **θ.5b+c — atmosphere shader + per-frame wiring (combined)** (`ROADMAP.md §T3.1`) ⭐

Previous θ.5b attempt (`56d0e38`, reverted in `422d794`) shipped
the shader with STATIC defaults and punted per-frame wiring to
θ.5c. Mistake: static uniforms produced saturated output that
interacted with the cloud layer via transparent-sort flips →
flicker. L26 captures the verification-method failure;
**scope-level lesson**: the shader rewrite and the per-frame
uniform writes are one coherent unit and can't be split cleanly.

T3.1 sub-onda progress:

- ✅ **θ.5a** — `c2f05a6` — snippet + math mirrors landed. Unchanged
  by the revert; still the 1:1-verified building block.
- 🟡 **θ.5b+c** ← here. Combined ship in one commit:
  1. Rewrite `src/components/canvas/shaders/atmosphereShader.ts`
     to compose `ATMSCATTERING_{FRAG,VERT}_GLSL` + inlined `luma()`
     - the Earth uniform bundle (same as reverted `56d0e38`, with
       the GLSL1 + `#define out varying` shim that passed runtime
       compile).
  2. Add `useFrame` in `Planet.tsx` (Earth branch only) that writes
     per-frame:
     - `v3CameraPos` = `inverse(mesh.matrixWorld) * camera.position`
       (camera in Earth-local frame; mirrors T1.2 ring-shadow
       pattern at `Planet.tsx:247-284`).
     - `v3LightPos` = normalized Sun direction in Earth-local frame
       (Sun lives at world origin; `v3LightPos = normalize(inverse(mesh.matrixWorld) * (0,0,0) - v3PlanetPos_local)`).
     - `v3PlanetPos` = `(0,0,0)` (planet at its own local origin).
     - `fCameraHeight` = `length(v3CameraPos)`.
  3. Runtime smoke via multi-frame pixel sampling (L26) +
     explicit user-watched confirmation before commit. No screenshot-
     only green lights.
- 🔲 **θ.5d** — per-body Rayleigh/Mie/scale-height config loaded
  from body record; Mars + any other candidate body gets its own
  params; per-body runtime smoke; final gates; ship (completes
  T3.1).

Scope for θ.5b+c: Earth only, Earth-default uniforms hard-wired in
the material factory. Mars/Venus atmospheres wait for θ.5d's
per-body config layer.

After T3.1 ships, D4 re-ranks the remaining set; next-biggest gaps
are T3.2 (PBR metallic/roughness) and T3.3 (eclipse geometry), both
visible on Earth/Saturn. Then T2.1 (COMPLEX lens flare) and the
small Tier 3 polish fixes (T3.5/T3.6/T3.7).

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
