# Phase θ — Gaia Sky port status

**Hot path. Read FIRST.** Per L38 (lessons.md), this file is
single-source-of-truth for "what's the next agent action" only.
History, shipped-onda detail, and audit narratives live in
`tasks/archive/`. Wave-specific plans live in `tasks/waves/`.

_Last updated: 2026-05-06 (T6.4 M1 + M2 ✅; M2.5 S1-S7 +
round-3 + round-4 + round-5 + round-5b hotfixes shipped.
**Round-6 promoted from CONTINGENT to ACTIVE 2026-05-06**
after Codex (external-friend audit) demonstrated mathematically
that round-5's factor 12→60 cannot resolve U-1 regardless of
the value chosen. Diagnosis: atlas's M2.5 ports Gaia's
**scripted** `CameraModule.transition_position` flow (linear
lerp + sigmoid mapper), but the user's "click on a star" use
case is structurally Gaia's **interactive**
`InteractiveCameraModule.go_to_object` flow (per-frame velocity
push driven by `NaturalCamera.java`'s force/friction model).
Round-5's factor=60 + lerp concentrates 99.5% of trajectory
progress into a ~825 ms warp window for Sirius (~6.4e8 wu/s
during warp = ~100× solar-system extent per frame at 60 fps);
no easing-factor adjustment can fix that — the architecture
needs to change. Round-5 + round-5b stay shipped: they
correctly close divergences in atlas's scripted flight contract
(factor 60/17, oriEasing, e2e + comment cleanup), and the
contract is reusable for future cinematic-tour features. They
just don't apply to click-driven focus, which Round-6 rewires
to a velocity/friction physics model. M2.5 close gate flips
from "user re-smoke after round-5" to "Round-6 PASS on the
no-warp acceptance §1 + 4 named stars × 2 cycles smoke".)_

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

**Default fresh-loop fire**: **Round-6 implementation kickoff**
— sub-tracks R6-A (HygPhysicsFlight core, ~3 h) + R6-B
(setupCameraHyg integration, ~2 h) + R6-C (useFrame branch,
~2 h). These three deliver the first runtime-testable physics
flight; subsequent sub-tracks (R6-D cancel handling, R6-E
debug telemetry, R6-F empirical calibration sweep, R6-G
tests, R6-H docs sync) follow in sequence. Total Round-6
estimate ~10-14 h. Full spec in
`tasks/waves/T6.4-visual-recovery.md` §Round-6 — includes the
5 Codex refinements (smooth orientation channel preserved,
calibrated-not-blind-port, full-stop cancel, `targetAngularRadiusRad`
naming consistent with C-1, semi-implicit Euler integrator) +
the 4 starting calibration constants for R6-F.

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

| ID  | Pri | Status | Summary                                                                                                                                                                                                                                                                                            |
| --- | --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-1 | P1  | Active | Solar→star fly-to "jumps". Round-5 attempt (factor=60) shipped but Codex audit 2026-05-06 mathematically demonstrated it can't fix the perception (99.5% trajectory in 20% time = ~6.4e8 wu/s warp = ~100× solar-system extent per frame). Round-6 (interactive physics flight) is the actual fix. |
| U-2 | P2  | Plan   | Search box doesn't find HYG stars. Queued as M6 forward-port (sub-track C — name index + autocomplete on Bayer/HD/proper-name).                                                                                                                                                                    |
| U-3 | P2  | Plan   | Sprite↔mesh transition has visible "pop". M3 wave plan covers this (cross-fade with focused-star ramp). Blocked by M2.5 close.                                                                                                                                                                    |
| U-4 | P3  | Plan   | Procedural disc small at landing. Per Gaia spec (~1° angular radius). Perception likely improves with M3 cross-fade. M4 may refine.                                                                                                                                                                |
| U-5 | P2  | Plan   | No HYG star info panel. Queued as M6 forward-port (sub-track D + E — HygStarPanel + Wikipedia REST integration like Gaia's `DataInfoWindow.java`).                                                                                                                                                 |

**Round-6 active scope** (promoted from CONTINGENT 2026-05-06):
port Gaia's interactive flight model — per-frame velocity push
driven by `InteractiveCameraModule.java:174-200`'s control loop,
combined with `NaturalCamera.java:125,341,985-1011,1533-1537`'s
force / friction / velocity physics. Atlas implements as a
small local `HygPhysicsFlight` class with semi-implicit Euler
integration, calibrated empirically (4 tunable constants:
initial force, max velocity factor, friction rate, decel onset
ratio). M2.5 contract preserved at the gate threshold
(`computeAtlasFlightTarget` → `targetAngularRadiusRad`).
`StellarFlightTransition` retained for the orientation-only
channel and future scripted-tour features. 8 sub-tracks specced
in wave file §Round-6 §Spec; ~10-14 h total effort.

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
