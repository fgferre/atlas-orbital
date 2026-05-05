# Phase θ — Gaia Sky port status

**Hot path. Read FIRST.** Per L38 (lessons.md), this file is
single-source-of-truth for "what's the next agent action" only.
History, shipped-onda detail, and audit narratives live in
`tasks/archive/`. Wave-specific plans live in `tasks/waves/`.

_Last updated: 2026-05-05 (T6.4 M1 + M2 ✅; M2.5 S1-S7 shipped
but **Codex round-3 review (2026-05-05) surfaced 4 findings that
block M2.5 close** — 2 P1 (angle-math mis-port, pre-warm hides
sprite without M3 cross-fade) + 2 P2 (target-lerp comments
overstate Gaia parity, e2e too weak to catch flight-contract
regressions). All 4 verified against `/tmp/gaiasky` source.
Hotfix plan in wave file §M2.5 §Codex-round-3. Next agent action:
apply the hotfix, NOT M3 — Codex findings of P1/P2 touching
active scope take precedence per the loop-protocol step 2)._

---

## → Active wave: **T6.4 — Visual recovery (PRIORITY 0)**

See `tasks/waves/T6.4-visual-recovery.md` for full plan.

**TL;DR**: T6 wave (T6.0 → T6.3-ε, 17 commits) shipped the full
HYG focus pipeline + 7 Codex-caught surface bugs across δ/ε.
First user-driven manual smoke (2026-05-04) revealed the
procedural mesh **never renders visually** at HYG positions.
Four silent root causes (precision collapse, hard transition,
partial class variation, missing supergiant spect). T6.4 wave
fixes those four. **2026-05-05 user smoke after M1+M2** added
a fifth concern: HYG fly-to navigation feels jarring vs Gaia
Sky's two-channel transition (M2.5 inserted to address). M4
spec also expanded to put spectral color first (was 3 of 28
fields varying; raised to descriptor-driven). Estimate now
M1+M2 ✅, M2.5+M3+M4+M5+M7 core ~14-22 h; M6 optional
~2-3 h post-recovery.

**Default fresh-loop fire**: T6.4 **M2.5 Codex round-3 hotfix**
— apply the 4-finding hotfix in a single commit
`fix(t6.4): M2.5 — Codex round-3 review (4 findings)`. Spec in
`tasks/waves/T6.4-visual-recovery.md` §M2.5 §Codex-round-3. Six
items in scope:

1. **stellarFlightSolidAngle.ts angle-math fix (P1)** — rename
   `computeGaiaTargetFullAngleRad` → `computeGaiaTargetAngularRadiusRad`,
   field `fullAngleRad` → `angularRadiusRad` in `AtlasFlightTarget`,
   stop dividing the Gaia curve by 2 (it's already angular radius
   per `InteractiveCameraModule.java:172` + `ParticleSet.java:1220`),
   change `computeFlightTargetDistance` from
   `radius / tan(fullAngle * 0.5)` to `radius / tan(angularRadius)`.
   Sirius lands at ~458 wu (was ~916 wu, a 2× regression vs the
   adaptive contract). Also add a header note about the
   `fovFactor` divergence — Gaia normalises by `getFovFactor()`,
   Atlas does not (small impact at default fov, worth pinning).
2. **HygStellarMesh.tsx pre-warm revert (P1)** — remove the
   `progress >= 0.70 → next = true` force-activate. Keep the
   singleton + `posProgressRaw` infra in place (M3 will consume).
   Without M3 cross-fade, the force-activate writes
   `skipMask = 1` while the mesh is still angularly small,
   hiding the sprite into the gap M2.5 was meant to avoid.
3. **Honest comments (P2)** — `StellarFlightTransition.ts` +
   `CameraController.tsx` — replace "two-channel transition
   matching Gaia" wording with "OrbitControls-native
   approximation; Gaia uses quaternion slerp on dir+up
   (CameraModule.java:1419-1424), Atlas lerps controls.target
   and lets OrbitControls.lookAt derive orientation. Drops the
   Gaia explicit up/roll channel."
4. **Stronger e2e via test-only window hooks (P2)** — add
   `__ATLAS_TEST_CAMERA__` (returns `{position, target,
quaternion}` from R3F root state) and
   `__ATLAS_TEST_MESH_STATE__` (returns
   `{meshActive, skipMaskAtIndex(K)}` from `<HygStellarMesh>`).
   Both gated on `__ATLAS_TEST_FREEZE__`, production-inert.
   Update `e2e/hyg-focus.spec.ts` to assert: target lerped (not
   snapped — sample mid-fly), landing distance bracket
   `[400, 1000] wu` post-fix, mesh active state at known points,
   skipMask timing.
5. **Wave file: tighten the "Gaia-faithful" claims** — the
   M2.5 narrative around "Gaia-faithful" should be downgraded
   to "Gaia-informed" everywhere the contract diverges (the
   target-lerp + the angle math even after the fix still uses
   Gaia's curve but Atlas's physical-radius convention vs Gaia's
   pseudo-size).
6. **Lessons.md L39 (new)** — short rule capturing the lesson:
   "Codex 'verified against source' claims must distinguish
   'name from source text' from 'semantics matched against
   actual consumer in source'. Gaia's `getSolidAngle()` returns
   `(size/distance)/fovFactor` despite the name suggesting
   steradians; mis-porting the semantic cost a 2× landing
   distance bug that no gate caught for 4 sub-step commits."

After the hotfix lands and gates pass, M2.5 is agent-complete
again pending the user-driven smoke (4 named stars × 2 zoom
cycles per Acceptance §8). M3 stays blocked behind that user
smoke.

**Codex audit policy** (revised 2026-05-05 per
`feedback_codex_audit_frequency.md`): bundle audits to
milestone-level diffs (M2.5 as a whole when S1-S7 land
together; M3, M4 etc.). Do NOT fire `codex exec review` on
every sub-step commit — burns OpenAI Codex credits with little
new signal beyond what gates already provide. For sub-step
commits, suggest a copy-pasteable Codex prompt in the commit
message; user runs it manually if they want external review.

---

## Carryover findings

**Codex round-3 review of M2.5 (S1-S7 diff)**, surfaced
2026-05-05 after S7 shipped. All 4 findings verified against
`/tmp/gaiasky` source by the agent (per
`feedback_codex_findings_toward_1to1.md`'s rule that Codex
direction must be confirmed against source before applying).
Hotfix specced in wave file §M2.5 §Codex-round-3. Block M3.

| ID  | Pri | File                                                                                       | Summary                                                                                                                                                  |
| --- | --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1 | P1  | `src/lib/camera/stellarFlightSolidAngle.ts`                                                | Angle-math mis-port: Gaia curve is angular radius, Atlas treats as full angle → 2× landing distance                                                      |
| C-2 | P1  | `src/components/canvas/HygStellarMesh.tsx`                                                 | Pre-warm at progress 0.70 force-activates mesh AND writes skipMask=1, hiding sprite without M3 cross-fade                                                |
| C-3 | P2  | `src/lib/camera/StellarFlightTransition.ts` + `src/components/canvas/CameraController.tsx` | Comments overstate Gaia parity; target-lerp is OrbitControls-native, not equivalent to Gaia quaternion slerp                                             |
| C-4 | P2  | `e2e/hyg-focus.spec.ts`                                                                    | Spec only verifies focus-survives + console-clean; cannot catch flight-contract regressions (orientation snap, landing distance, mesh timing, interrupt) |

Source verification done in this session:

- C-1 confirmed via `/tmp/gaiasky/core/src/gaiasky/script/v2/impl/InteractiveCameraModule.java:158-172`
  (lerp target compared against `focusView.getSolidAngle()`) and
  `/tmp/gaiasky/core/src/gaiasky/scene/component/ParticleSet.java:1220`
  (`getSolidAngle = (size/distance)/fovFactor` — angular-radius semantics).
- C-3 confirmed via `/tmp/gaiasky/core/src/gaiasky/script/v2/impl/CameraModule.java:1419-1424`
  (`qd.set(startOrientation).slerp(endOrientation, ...)` then
  `cam.setUp` + `cam.setDirection` — full quaternion slerp on
  dir+up, which Atlas does not replicate).

Prior Codex audits (round-1, round-2, round-3 of T6.3-x, and
final-pass of the L38 restructure) all addressed; corrections
landed in commits `4d38251` (T6.3-δ) → `00e9a5a` (T6.3-ε) →
`68b1d9f` → `1f20e36` → `0b4c648` → `3b011d5`. The current C-1
to C-4 are a fresh review of M2.5 specifically.

---

## Other active waves / tracks

- **T-Closeout** (asset-licensing audit, ~0.5d doc-only) —
  blocked behind T6.4 visual delivery.
- **T4.3** (particle pipeline ~2-3w) — blocked behind T6.4.
- **T5.2 + T5.6 PNG re-bakes** — user-input blockers (user
  inspects `test-results/.../boot-frozen-actual.png` then runs
  `--update-snapshots`); independent of T6.4.

All other ondas closed or deferred. See ROADMAP for the full
strategic index; see `tasks/archive/status-history-2026-05-05.md`
for the prior history-as-status doc.

---

## Loop protocol (post-L38 restructure)

```
1. Read STATUS hot path (this file). Identify Active wave +
   Carryover findings.

2. Resolve Carryover findings first.
   - P1/P2 touching active scope block implementation
   - P3 may queue unless plan-relevant

3. Read active wave file (tasks/waves/<wave>.md).
   - Read only current milestone section + shared constraints.

4. R1 source-read.
   - Gaia source only if milestone is Gaia-informed (atlas-native
     waves: skip — see scope tag in wave file)
   - Atlas source before edits; quote file:line in notes/commit

5. PRE-CHECK (Gaia-informed only).
   - grep /tmp/gaiasky/assets/conf/config.yaml for default flag
   - grep core/src for `new <EffectClass>(` to confirm wired
   - Numeric drift vs *Filter.java = trust Java
   - Any drift documented in wave file BEFORE step 6

6. Implement minimum diff.
   - Extract math to TypeScript helpers if applicable
   - Pin sample input/output values

7. PREDECESSOR SWEEP.
   - Grep for atlas-native equivalent the port replaces
   - Delete in same commit OR document why it stays

8. DIFF GATE (Gaia-borrowed logic only) / per-decision rationale
   (atlas-native logic).
   - Borrowed: line-by-line diff vs Gaia, every divergence
     carries one-line rationale
   - Atlas-native: rationale comments + tests

9. SUBAGENT VERIFY (cold-read fresh agent, milestone diff only).
   - Bounded prompt: current commit/diff scope
   - Resolve findings before proceeding

10. Gates. `npm run test:run`, `npm run lint`, `npm run build`.

11. Runtime smoke.
    - Required for rendering claims (per L37): Preview MCP +
      browser console + visual user-path exercise. If preview
      can't drive the trigger, expose temp diagnostics on
      window, drive programmatically, REMOVE before commit.
    - Non-rendering ondas: scene boots clean + console clean
      sufficient.

12. Codex audit (per user request, post-2026-05-05) — milestone
    diff only, unbiased prompt, address findings.

13. Commit with source-file citations.

14. Update docs with single-source rule (L38).
    - Wave file: milestone status flip
    - STATUS hot path: only if Active wave changes or new
      Carryover findings emerge
    - lessons.md: ONLY if a new failure-mode rule (max ~8 lines
      per rule; long narrative goes to archive/postmortems/)

15. Run docs:check (consistency sweep).
    - npm run docs:check
    - Blocks stale terms in hot path

↻ back to step 1
```

**Visual parity vs Gaia runtime is OUTSIDE the loop.** Side-by-side
visual comparison requires running Gaia Sky (Java/LibGDX desktop
app) at a matched camera state, which Claude cannot reliably do.
Rigor comes from DIFF GATE + SUBAGENT VERIFY + MATH TESTS +
runtime smoke. If user reports a visual gap and code matches
1:1, cause is structural (config, quality tier, dependency) —
investigate with source + config diff.

---

## Gate commands (canonical, per AGENTS.md Test commands)

- `npm run test:run` — vitest run mode (CI-style). USE THIS.
- `npm run lint` — eslint.
- `npm run build` — vite production build.
- `npm run docs:check` — doc consistency sweep (post-L38).

**DO NOT use `npm test --run`** — emits deprecation warning;
breaks in future npm majors.

For targeted runs: `npm run test:run -- <pattern>`. The `--`
is the canonical npm passthrough delimiter.

---

## Decisions (all resolved 2026-04-22 under Gaia-fidelity rule)

Durable rule in memory `feedback_default_gaia_fidelity.md`:
**when a decision has a "match Gaia" branch and an "atlas
opinion" branch, pick Gaia**. See `ROADMAP.md §Decisions` for
full rationale per key.

| Key    | Resolution                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| **D1** | Moot — θ.1/θ.1b shipped 1:1.                                                                                        |
| **D2** | Port COMPLEX (Gaia default per `config.yaml` + `MainPostProcessor.java:280-312`).                                   |
| **D3** | Native CC-BY-4.0 sprites matching Gaia's output. Not procedural.                                                    |
| **D4** | Biggest-gap-first. Current winner: T3.1 (⭐ #1 cinematic gap).                                                      |
| **D5** | Match Gaia `config.yaml` — `toneMapping.type: NONE`, `bloom.intensity: 0.0`. Cinematic preset moves to user opt-in. |

---

## Archive links

- **`tasks/archive/status-history-2026-05-05.md`** — full prior
  STATUS-as-ata snapshot (631 lines): pre-2026-05-05 history
  banner, §Shipped ondas table, §Pipeline detailed entries, all
  prior session ship summaries, T2.1-fix wave narrative,
  white-canvas remediation wave narrative, chronic dev-mode
  Context Lost root-cause narrative, audit completeness pass.
- **`tasks/archive/postmortems/T6-visual-failure.md`** — T6 wave
  visual delivery failure (2026-05-04 user smoke) full narrative,
  4 root causes, and recovery plan rationale.
- **`tasks/waves/T6.4-visual-recovery.md`** — active wave plan
  (canonical milestone list + Codex audit per milestone protocol).
- **`tasks/lessons.md`** — operational rules (compact format
  per L38 restructure; long narratives in archive postmortems).
- **`tasks/ROADMAP.md`** — strategic index (active wave links
  to wave file; closed waves link to archive snapshots).

---
