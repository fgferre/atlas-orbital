# Phase θ — Gaia Sky port status

Single source of truth for where we are in the visual port. Read FIRST.

_Last updated: 2026-04-22 after T1.1 ship (4cc35cb) — θ.4 starburst Y-coord drift resolved._

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
2.  Read tasks/ROADMAP.md for that item's Gaia source citation
    and effort.
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
    errors and scene renders (not black).
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
6. `tasks/lessons.md` — cross-cutting engineering lessons (L1–L24).
7. `/tmp/gaiasky/` — cloned Gaia Sky source. Read the actual
   `.glsl` / `.java` BEFORE any port (memory rule
   `feedback_gaia_sky_source_first`).

After reading, the **→ Next up** section tells you exactly what to do.

---

## Shipped ondas

| Onda                            | Commits                                                                      | 1:1 status (verified pass P10 — diff)                                                                                                        | Known drifts / known-good                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **θ.1 + θ.1b — star billboard** | `2662f08`, `13e501e`, `22349b0`..`fa23a27` (10 commits ending with LEN0 fix) | **1:1 VERIFIED**. Divergences are stylistic unrolls, inlined `luma.glsl`, pmndrs adaptations — all documented.                               | None outstanding. Full Gaia color pipeline (Ballesteros → xyY → XYZ → γRGB +0.16 HSV), LEN0 unit fix, pseudo-size kernel all match source line-for-line.                                                                                                                                                                                                               |
| **θ.3 — LightGlow**             | `a27dc42`, `fdb66ae`                                                         | **1:1 VERIFIED** with documented arch divergences (vertex→fragment move required by pmndrs; HDR clamp strategy scoped to glow contribution). | Sprite uses pure radial gaussian because Gaia asset `star-tex-03-*` is in `$GS_DATA` with no public license. Spiral scale not FOV-aware — `LightGlowEffect.ts:45-46` hardcodes assuming `fovFactor=1.0`; Gaia `MainPostProcessor.java:562` divides by dynamic fovFactor.                                                                                               |
| **θ.4 — PseudoLensFlare**       | `db407dc`, `4cc35cb`                                                         | **1:1 VERIFIED** (post-T1.1). Starburst Y-coord now matches Gaia.                                                                            | Starburst Y-coord fixed in T1.1 (`4cc35cb`) — extracted to `PSEUDO_LENS_STARBURST_SAMPLE_Y_COORD = 0.0` with pinned regression test. Residual: 35-pass blur omitted → `flareIntensity=0.03` vs Gaia literal `0.15` (documented tuning). Ships PSEUDO variant; Gaia default is COMPLEX (`MainPostProcessor.java:280-312`, different shader entirely) — tracked as T2.1. |

---

## → Next up: **Tier 1 quick wins** (`ROADMAP.md §Tier 1`)

Two remaining bugs with direct source citations. No new foundations
needed. (T1.1 shipped in `4cc35cb`.)

1. **T1.2 — Fix ring shadow frame mixing** — object-space `vPos` mixed
   with world-space `uSunPosition` in `ringShadowShader.ts:31` and
   `usePlanetMaterials.ts:342`. Works only when planet matrix is
   identity; breaks under Saturn 26.73° tilt.
2. **T1.3 — Wire LightGlow spiral to FOV factor** —
   `LightGlowEffect.ts:45-46` accepts a uniform + camera feeds
   `fovFactor = tan(FOV/2) / tan(20°)` per frame.

Effort: 1 day remaining. Ship each through the protocol below.

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

## Pending decisions (see `ROADMAP.md §Pending decisions`)

| Key    | Question                                                       | Blocks                          |
| ------ | -------------------------------------------------------------- | ------------------------------- |
| **D1** | Which starfield source was shown in reference screenshots?     | Interpretation of θ.1/θ.1b ship |
| **D2** | COMPLEX vs PSEUDO lens flare?                                  | T2.1 execution                  |
| **D3** | Lens sprites — create native / stay procedural / request perm? | T2.3 execution                  |
| **D4** | Tier order (1→4 sequential vs prioritize T3 for scene impact)? | Everything after Tier 1         |
| **D5** | Tone map + bloom defaults — atlas opinion or Gaia parity?      | T2.4 execution                  |

Tier 1 can proceed without any of these decisions.
