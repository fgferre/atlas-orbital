# Phase θ — Gaia Sky port status

**Hot path. Read FIRST.** Per L38 (lessons.md), this file is
single-source-of-truth for "what's the next agent action" only.
History, shipped-onda detail, and audit narratives live in
`tasks/archive/`. Wave-specific plans live in `tasks/waves/`.

_Last updated: 2026-05-06 (T6.4 M1 + M2 ✅; M2.5 S1-S7 +
round-3 + round-4 + round-5 hotfixes shipped. **User smoke
2026-05-05** surfaced 4 issues during the 4-stars × 2-cycles
acceptance run: (1) Search box doesn't find HYG stars (out of
M2.5 scope, queued for M6 forward-port); (2) solar→star fly-to
feels like a jump — system disappears in a flash, no visible
"lift-off" phase; (2a) fly-to **only** feels smooth when
interrupting another in-flight transition (mid-flight switching
between similar-scale endpoints works); (3) sprite-to-mesh
transition has a visible "pop" hiatus (M3 wave will fix, this
gap is documented and expected); (3a) procedural-mesh disc
ends up small at landing (Gaia-spec landing radius is ~1°
angular radius for close stars; perception is partly amplified
by missing M3 cross-fade). **Round-5 attempt** (commit
`079eb52`): bumped logisticSigmoid `factor` 12→60 to match
Gaia's `CameraModule.java:1210` clamp range. The factor=12
default was a documented Atlas-Gaia divergence ("intentional");
user smoke disconfirmed the rationale. factor=60 gives clear
~30% stall on each end (departure → warp → arrival profile)
instead of the smooth-but-snap-feeling factor=12 distribution.
Awaiting user re-smoke of issue (2). M2.5 still agent-complete
pending user PASS on issue (2) + the original 4-stars smoke
per Acceptance §8.)_

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

**Default fresh-loop fire**: **user re-smoke after round-5**
— click any bright HYG star from the solar-system view, verify
the fly-to now has a visible departure phase (camera lingers
on the solar system for ~30% of the duration before warping
toward the destination). If PASS, the next fire flips to the
original 4-stars × 2-cycles acceptance smoke (§Acceptance §8 in
`tasks/waves/T6.4-visual-recovery.md`). If still FAIL, escalate
to round-6: port Gaia's `go_to_object` (interactive physics-
push from `InteractiveCameraModule.java:174-200`) into atlas's
HYG flight path. That's the Gaia-faithful approach for
cross-scale fly-to and is documented at the wave file's
§Round-6 plan.

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

**User-surfaced from 2026-05-05 smoke** (round-5 in
flight; round-5b/M6 forward-port queued):

| ID  | Pri | Status | Summary                                                                                                                             |
| --- | --- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| U-1 | P1  | Open   | Solar→star fly-to "jumps", system disappears in a flash. Round-5 attempt: factor=60 (Gaia-default). Awaiting user re-smoke.         |
| U-2 | P2  | Plan   | Search box doesn't find HYG stars. Queued as M6 forward-port (sub-track C — name index + autocomplete on Bayer/HD/proper-name).     |
| U-3 | P2  | Plan   | Sprite↔mesh transition has visible "pop". M3 wave plan covers this (cross-fade with focused-star ramp). Blocked by M2.5 close.     |
| U-4 | P3  | Plan   | Procedural disc small at landing. Per Gaia spec (~1° angular radius). Perception likely improves with M3 cross-fade. M4 may refine. |
| U-5 | P2  | Plan   | No HYG star info panel. Queued as M6 forward-port (sub-track D + E — HygStarPanel + Wikipedia REST integration like Gaia's          |
|     |     |        | `DataInfoWindow.java`).                                                                                                             |

**Round-6 contingent plan** (only if round-5 factor=60 doesn't
resolve U-1): port Gaia's `go_to_object` physics-push from
`InteractiveCameraModule.java:174-200`. Architectural
divergence from M2.5's pre-computed lerp (HYG path becomes
physics-driven; curated-body path stays lerp-based). Spec to
land in wave file §Round-6 if escalated.

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
| A         | i18n foundation (en + pt-BR locales, wired via `useTranslation`)                 | `react-i18next`, `i18next`, `i18next-browser-languagedetector` |
| B         | HYG binary v3 with `properName` + Bayer + Flamsteed + HD/HIP/Gliese designations | none (extends `build-hyg-binary.js`)                           |
| C         | SearchBar wires HYG name index with autocomplete                                 | none                                                           |
| D         | HygStarPanel UI (matches solar-system info-panel style) + i18n strings           | depends on A, E                                                |
| E         | Wikipedia REST client (rate-limit + abort + disambiguation `_(star)`)            | none (browser fetch)                                           |
| F         | IndexedDB persistent cache (LRU 200 entries, TTL 30 days)                        | `idb` (~3KB gzipped)                                           |
| G         | Settings toggle for Wikipedia integration (default ON, persist localStorage)     | none                                                           |
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
