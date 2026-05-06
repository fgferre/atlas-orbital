# Phase θ — Gaia Sky port status

**Hot path. Read FIRST.** Per L38 (lessons.md), this file is
single-source-of-truth for "what's the next agent action" only.
History, shipped-onda detail, and audit narratives live in
`tasks/archive/`. Wave-specific plans live in `tasks/waves/`.

_Last updated: 2026-05-06 late night. T6.4 M1 + M2 shipped; M2.5
S1-S7 + rounds 3, 4, 5, 5b shipped; Round-6 A-H shipped 2026-05-06;
**M6 A+B+C+D+E+G shipped 2026-05-06** (i18n, HYG v3, SearchBar, panel,
Wiki client, settings toggle; U-2 + U-5 closed)._ The integrator port (`HygPhysicsFlight`),
aim-direction lerp (`AimLerp`), `setupCameraHyg` rewire,
useFrame physics branch, cancel handlers, first-guess
calibration (`MAX_VELOCITY_FACTOR=3.0`, `INITIAL_FORCE_FACTOR=8.0`,
Sirius ~4.65 s), e2e respec, and sub-stepping hardening
(`MAX_DT_SUBSTEP=0.05 s`, `MAX_DT_TOTAL=0.1 s` per-frame
visible-jump cap) all landed. R6-H close-out removed the R6-E
telemetry scaffolding and synced docs.
_Post-R6-H user-smoke regression + aim-lerp rewrite._ Smoke
reported "marcha ré" + "tela muda para um quadro errado". Codex
audit found three structural issues in `OrientationLerp`
(target sat behind camera, path could cross + degenerate, Drei
OrbitControls priority -1 lagged quaternion 1 frame). Fix:
`AimLerp` slerps the aim DIRECTION (target = `pos + aimDir ×
dist`, never crosses) + `camera.lookAt` after writes forces
in-frame orientation. Round-6 commit chain (10 commits):
89816e5, 9a8688e, cbb767f, 5336b70, be2406f, e5ea617, c9a0c95,
48e294c (superseded), 21d7bf3 (aim-lerp), 68e7fb7 (doc cleanup).

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
M1+M2 ✅, M2.5+M3+M4+M5+M7 core ~14-22 h; M6 forward-port
~14 h (8 sub-tracks, parallelizable post-M2.5).

**Default fresh-loop fire** (autonomous-agent-actionable):
**M6 sub-track F — IndexedDB persistent cache** (~1.5h, spec in
wave file §M6 §"Sub-track F"). A+B+C+D+E+G shipped 2026-05-06;
F caches Wikipedia summaries between visits via `idb` (LRU 200,
TTL 30 days). Independent of Round-6.

**Higher-priority parallel work for the user** (only the user
can do this): user-smoke Round-6 acceptance — 4 named stars
(Sirius, Betelgeuse, Proxima, far-edge anchor) × 2 zoom cycles
each. Verify no warp perception, landing pose ~456 wu for
Sirius, mid-flight drag cleanly interrupts. Passing smoke
closes U-1 and unblocks M3 (sprite↔mesh cross-fade).

**Calibration risk** (R6-F first-guess, may surface in smoke):
`MAX_VELOCITY_FACTOR=3.0` tunes for Sirius (~4.65 s). Far stars
arrive proportionally to ln(distance) — Betelgeuse ~1.7 s vs
wave-file 7-10 s expectation. User-smoke decides: accept the
linear-log shape as Gaia-faithful (matches `speedScaling`) OR
add distance-dependent velocity scaling (e.g. `vmax ∝ sqrt(distance)`).
If smoke surfaces a regression, reopen Round-6 with an empirical
calibration sweep — temporarily re-add the
`__ATLAS_DEBUG_HYG_PHYSICS__` ring buffer (removed at R6-H per
L37).

**Forward queue** (independent of M2.5 close):

- **M6 forward-port** (HygStarPanel + search + Wikipedia
  integration + i18n foundation) — user-requested 2026-05-05
  after the smoke. Wikipedia REST API integration matches
  Gaia's `DataInfoWindow.java:62-71` pattern (see wave-file
  §M6 spec). ~14 h across 8 sub-tracks; independent of the
  flight-contract close. Can run in parallel with the
  flight-contract user re-smoke.
- **M3** (sprite ↔ mesh cross-fade) stays blocked until M2.5
  closes (cross-fade is meaningless if camera is mid-snap on
  arrival).

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

**User-surfaced from 2026-05-05 smoke** (round-5 + round-5b
shipped; Round-6 promoted from CONTINGENT to ACTIVE
2026-05-06; M6 forward-port queued):

| ID  | Pri | Status                                          | Summary                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| U-1 | P1  | Round-6 + aim-lerp shipped, awaiting user smoke | Solar→star fly-to "jumps". Round-6 A-H + post-R6 aim-lerp rewrite shipped 2026-05-06 (10 commits ending at 68e7fb7). Sirius arrival ~4.65 s under R6-F first-guess calibration. Initial post-R6 user smoke surfaced "marcha ré" + "tela muda" — root-caused as orientation-lag in OrientationLerp + OrbitControls priority lag; fixed structurally by AimLerp slerp + camera.lookAt. Re-smoke pending. |
| U-2 | P2  | M6-C shipped, awaiting user smoke               | Search box doesn't find HYG stars. M6-C shipped 2026-05-06: SearchBar autocomplete now matches via proper name / Bayer (Latin or Greek glyph) / HD / HIP / Gliese. Sirius / α CMa / HD 48915 verified in Preview-MCP smoke.                                                                                                                                                                            |
| U-3 | P2  | Plan                                            | Sprite↔mesh transition has visible "pop". M3 wave plan covers this (cross-fade with focused-star ramp). Blocked by M2.5 close.                                                                                                                                                                                                                                                                        |
| U-4 | P3  | Plan                                            | Procedural disc small at landing. Per Gaia spec (~1° angular radius). Perception likely improves with M3 cross-fade. M4 may refine.                                                                                                                                                                                                                                                                    |
| U-5 | P2  | M6-D shipped                                    | No HYG star info panel. M6-D shipped 2026-05-06 — stellar-physics grid + Wikipedia "About" via M6-E client. Sirius smoke verified.                                                                                                                                                                                                                                                                     |

**Round-6 closed + post-R6 aim-lerp rewrite** (sub-tracks A-H
plus the post-R6-H user-smoke fix shipped 2026-05-06; 10
commits total ending at 68e7fb7). Full audit history +
per-sub-track narrative in wave file §Round-6 §"Sub-track
progress".

**P3 forward-looking notes** parked OUTSIDE M2.5 (Codex
round-4 audit, do not block):

- **Singleton progress channel is unkeyed** —
  `lib/camera/hygFlightPosProgress.ts`. Today's React effect
  ordering protects against star-A→B leak, but if M3 fade adds
  a second consumer, key the signal as
  `{ focusId, progress }` to make the contract grep-able.
- **Test hooks are runtime-gated, not DCE-eliminated** —
  `src/store.ts:707`, `Scene.tsx`, `HygStellarMesh.tsx`. The
  `__ATLAS_TEST_FREEZE__` if-blocks ship in prod bundles
  (~30 lines, dead). Replace with a Vite `import.meta.env.MODE`
  guard if production-bundle absence ever matters.

**M6 forward-port plan** (independent of M2.5 close):
~14 h across 8 sub-tracks, full spec in wave file §M6.

| Sub-track | Deliverable                                                                      | New deps                                                       |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| A ✅      | i18n foundation (en + pt-BR locales, wired via `useTranslation`)                 | `react-i18next`, `i18next`, `i18next-browser-languagedetector` |
| B ✅      | HYG binary v3 with `properName` + Bayer + Flamsteed + HD/HIP/Gliese designations | none (extends `build-hyg-binary.js`)                           |
| C ✅      | SearchBar wires HYG name index with autocomplete                                 | none                                                           |
| D ✅      | HygStarPanel UI (matches solar-system info-panel style) + i18n strings           | depends on A, E                                                |
| E ✅      | Wikipedia REST client (rate-limit + abort + disambiguation `_(star)`)            | none (browser fetch)                                           |
| F         | IndexedDB persistent cache (LRU 200 entries, TTL 30 days)                        | `idb` (~3KB gzipped)                                           |
| G ✅      | Settings toggle for Wikipedia integration (default ON, persist localStorage)     | none                                                           |
| H         | CSP allow `upload.wikimedia.org` (Vite config)                                   | none                                                           |

Prior Codex audits (round-1, round-2, round-3 of T6.3-x, and
final-pass of the L38 restructure) all addressed; corrections
landed in commits `4d38251` (T6.3-δ) → `00e9a5a` (T6.3-ε) →
`68b1d9f` → `1f20e36` → `0b4c648` → `3b011d5`.

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
