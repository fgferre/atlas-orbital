# Phase θ — Gaia Sky port status

**Hot path. Read FIRST.** Per L38 (lessons.md), this file is
single-source-of-truth for "what's the next agent action" only.
History, shipped-onda detail, and audit narratives live in
`tasks/archive/`. Wave-specific plans live in `tasks/waves/`.

_Last updated: 2026-05-05 (T6.4 active recovery wave; doc
restructure per L38 lesson — STATUS hot-path ~250 lines vs
prior 631-line ata; wave detail moved to per-wave files)._

---

## → Active wave: **T6.4 — Visual recovery (PRIORITY 0)**

See `tasks/waves/T6.4-visual-recovery.md` for full plan.

**TL;DR**: T6 wave (T6.0 → T6.3-ε, 17 commits) shipped the full
HYG focus pipeline + 7 Codex-caught surface bugs across δ/ε.
First user-driven manual smoke (2026-05-04) revealed the
procedural mesh **never renders visually** at HYG positions.
Four silent root causes (precision collapse, hard transition,
partial class variation, missing supergiant spect). T6.4 wave
fixes all four. Estimate: M1-M5+M7 core ~8-13 h; M6 optional
~2-3 h post-recovery.

**Default fresh-loop fire**: T6.4-M1 (sphere shader →
modelViewMatrix). Smallest validation of the precision
hypothesis; either mesh appears for Sirius (validates approach
and unblocks M2-M7) or doesn't (re-diagnose before continuing).

**Codex audit per milestone before commit** (per user request
2026-05-05). Run audit on uncommitted diff, address findings,
THEN commit.

---

## Carryover findings

None outstanding. Codex audits round-1, round-2, round-3, and
final-pass all addressed; corrections landed in commits
`4d38251` (T6.3-δ) → `00e9a5a` (T6.3-ε) → `68b1d9f` →
`1f20e36` → `0b4c648` → `3b011d5` (cross-doc sweep + L38).

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
  (M1-M7, Codex audit per milestone protocol).
- **`tasks/lessons.md`** — operational rules (compact format
  per L38 restructure; long narratives in archive postmortems).
- **`tasks/ROADMAP.md`** — strategic index (active wave links
  to wave file; closed waves link to archive snapshots).

---
