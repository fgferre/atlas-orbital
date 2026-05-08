# Phase θ — Gaia Sky port status

**Hot path. Read FIRST.** Per L38 (lessons.md), this file is
single-source-of-truth for "what's the next agent action" only.
History, shipped-onda detail, and audit narratives live in
`tasks/archive/`. Wave-specific plans live in `tasks/waves/`.

_Last updated: 2026-05-08. T6.4 M1-M7 all agent-side ✅;
wave-acceptance gate open on user smoke. Post-audit Codex review
chain landed: M5 H-R inference + JSDoc sync (`b3f764c`/`c5ecc0d`),
MS tolerance band + Sun anchor (`9578156`), prose alignment
(`adc0091`), Path A radius gap (`5051723`), HYG click → info
panel + orbital-engine guard (`932dd10`), onPointerMissed race
defense (`7e30ab2`). Plan B blend `313cd9b` activated for hot
stars; M5 non-MS radius `6d589a1` extended SB to giants /
supergiants. M7 agent closeout clean: `gl.isContextLost()===false`,
`level:error` empty, L26 invariant variance=0 across 32 rAF.
Per-commit detail lives in `tasks/waves/T6.4-visual-recovery.md`
§M5 / §M6 sub-track sections._

---

## → Active wave: **T6.4 — Visual recovery (PRIORITY 0)**

See `tasks/waves/T6.4-visual-recovery.md` for full plan.

**TL;DR**: T6 wave (T6.0 → T6.3-ε, 17 commits) wired the full
HYG focus pipeline; first user smoke 2026-05-04 surfaced four
silent root causes (precision collapse, hard transition, partial
class variation, missing supergiant spect). T6.4 fixes those
plus the M2.5 fly-to two-channel transition (added after the
2026-05-05 smoke) and the M6 HygStarPanel + Wikipedia + search
forward-port (promoted same day). M1+M2+M2.5+M3+M4+M5+M6+M7 —
ALL shipped agent-side 2026-05-07. Wave acceptance now blocks
entirely on user smoke (cycle spec in §"Higher-priority parallel
work for the user" below).

**Default fresh-loop fire** (autonomous-agent-actionable):
**No T6.4 agent work pending**. M1-M7 all shipped agent-side;
wave acceptance is now blocked entirely on user smoke. Until
user delivers smoke feedback, the agent has no in-scope T6.4
ondas to fire. Other active waves (T-Closeout, T4.3, T5.x re-
bakes) are themselves blocked behind T6.4 acceptance per
§Other active waves below — so the natural next agent action
on a fresh /loop fire is to re-read STATUS for new Carryover
findings (user smoke regressions) before doing anything else.

**Higher-priority parallel work for the user** (only the user
can do this): full T6.4 wave acceptance smoke. Required cycle:
4 named stars (Sirius, Betelgeuse, Proxima, far-edge anchor) ×
2 zoom cycles each (verify no warp perception, landing pose
~456 wu for Sirius, mid-flight drag cleanly interrupts) +
quality-flip while focused on a HYG star (low ↔ high) +
Gam-2 Vel or other Bayer-only sidecar (verify post-`b3f764c`
H-R-inferred granulation/rays texture reads as giant/supergiant,
not V-class). Passing smoke closes U-1 / U-2 / U-3 / U-5 and
the wave; unblocks T-Closeout + T4.3 + T5.x re-bakes.

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

**Forward queue**: empty. M6 forward-port (8 sub-tracks A-H —
i18n + HYG binary v3 + search + HygStarPanel + Wikipedia REST +
IndexedDB cache + settings toggle + CSP) all shipped 2026-05-06.
M3 (sprite ↔ mesh cross-fade) shipped 2026-05-06. M5 post-audit
H-R inference (b3f764c) + M7 closeout (1ce1d20) shipped 2026-05-07.

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

**User-surfaced from 2026-05-05 smoke** (all rounds + M6
forward-port shipped agent-side 2026-05-06/07; awaiting user
smoke for full wave acceptance):

| ID  | Pri | Status                                          | Summary                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| U-1 | P1  | Round-6 + aim-lerp shipped, awaiting user smoke | Solar→star fly-to "jumps". Round-6 A-H + post-R6 aim-lerp rewrite shipped 2026-05-06 (10 commits ending at 68e7fb7). Sirius arrival ~4.65 s under R6-F first-guess calibration. Initial post-R6 user smoke surfaced "marcha ré" + "tela muda" — root-caused as orientation-lag in OrientationLerp + OrbitControls priority lag; fixed structurally by AimLerp slerp + camera.lookAt. Re-smoke pending. |
| U-2 | P2  | M6-C shipped, awaiting user smoke               | Search box doesn't find HYG stars. M6-C shipped 2026-05-06: SearchBar autocomplete now matches via proper name / Bayer (Latin or Greek glyph) / HD / HIP / Gliese. Sirius / α CMa / HD 48915 verified in Preview-MCP smoke.                                                                                                                                                                            |
| U-3 | P2  | M3 shipped 2026-05-06                           | Sprite↔mesh transition has visible "pop". M3 (cross-fade with focused-star ramp via continuous `a_fadeAlpha` + mesh `uVisibility` lockstep) shipped. User-perceptual smoke deferred to user.                                                                                                                                                                                                          |
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

**M6 forward-port — shipped 2026-05-06** (8 sub-tracks across
~14 h, all ✅; full spec in wave file §M6):

| Sub-track | Deliverable                                                                      | New deps                                                       |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| A ✅      | i18n foundation (en + pt-BR locales, wired via `useTranslation`)                 | `react-i18next`, `i18next`, `i18next-browser-languagedetector` |
| B ✅      | HYG binary v3 with `properName` + Bayer + Flamsteed + HD/HIP/Gliese designations | none (extends `build-hyg-binary.js`)                           |
| C ✅      | SearchBar wires HYG name index with autocomplete                                 | none                                                           |
| D ✅      | HygStarPanel UI (matches solar-system info-panel style) + i18n strings           | depends on A, E                                                |
| E ✅      | Wikipedia REST client (rate-limit + abort + disambiguation `_(star)`)            | none (browser fetch)                                           |
| F ✅      | IndexedDB persistent cache (LRU 200 entries, TTL 30 days)                        | `idb` (~3KB gzipped)                                           |
| G ✅      | Settings toggle for Wikipedia integration (default ON, persist localStorage)     | none                                                           |
| H ✅      | CSP allow `upload.wikimedia.org` (Vite config)                                   | none                                                           |

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
