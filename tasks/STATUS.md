# STATUS — agent work queue

**Read with [`AGENTS.md`](../AGENTS.md).** That file is product law.
This file is only **what to do next**. Folder map: [`README.md`](./README.md).

_Last updated: 2026-07-28 (parallel texture-VRAM line opened; W1–W5 + W6 stage A code-complete; browser smokes BATCHED to the end of the wave; W6 stage B next)._

---

## Parallel line — texture VRAM & tiled streaming

**[`tasks/waves/tiled-streaming-2026-07-28.md`](./waves/tiled-streaming-2026-07-28.md)**
— runs independently of the fidelity-honesty wave. Opened after the desktop
render failure was traced to VRAM.

Two things were already fixed and pushed before the cheap fixes (composer MSAA
was taking the library default of 8, ~1.6 GB on a 4K desktop; and the context
asked for `antialias` under an active composer, which could not change a pixel).

**All three cheap fixes are now code-complete** — admission control in
`deferredTextureCache.ts`, the resize of the three textures that exceeded
`MAX_TEXTURE_SIZE`, and a GPU signal in tier detection. **They owe a human
render check on real desktop hardware**, which no gate here can substitute:
Playwright renders on SwiftShader, which has neither a VRAM ceiling nor a
`MAX_TEXTURE_SIZE` to exceed. Tiling work (S1–S4) is next and unstarted.

Read the wave file's **"Measured baseline"** section first. Every number in it
was measured against the real files and survived an adversarial refutation pass;
re-deriving them costs hours. In particular do not re-measure: Earth focus is
853.3 MB at ultra (**still true — Earth was not resized**) and the overview band
allocates the same 440.6 MB on `constrained` as on `ultra` (**still true and
still untouched**). `4k_enceladus.jpg` **was** 15960x7980 and is now 4096x2048,
with the canonical moved to `8k_enceladus.jpg` at 8192x4096 — that one row of
the baseline is superseded by the resize, and the wave file records the
before/after table.

Closed predecessor: [`texture-inventory-2026-07-27.md`](./waves/texture-inventory-2026-07-27.md)
— the orphan verdict table, the five measurement traps, and the source sweeps
(NASA 3D Resources, CelestiaContent, Stellarium) with per-asset licences.

---

## Active wave

**[`tasks/waves/fidelity-honesty-2026-07-26.md`](./waves/fidelity-honesty-2026-07-26.md)** —
thirteen waves in two tranches. Tranche 1 (W1–W10) closes every confirmed
fidelity and honesty defect; **tranche 2 is re-decided at the checkpoint, not
pre-committed**.

**W1 through W5 are code-complete on `main` (through `d5c6ebb`), and their browser
smokes are batched into one pass at the end of the wave** — owner decision,
2026-07-26, so "smoke pending" in the progress table is NOT a blocker and no
increment waits on it. The consolidated checklist is the wave's **Deferred smoke
gate** section; do not rebuild it from the per-wave prose.

**W6 stage A is code-complete** — `src/lib/bodyOrientation.ts` is now the single
orientation source, Earth's hand-tuned +140° is gone, and the Sun plus all eight
planets carry measured IAU rotational elements transcribed from NAIF's
`pck00011.tpc` (which cites Archinal 2018 **and** its erratum). Read W6's
"Stage A shipped" subsection before continuing — it records two things a later
session must not re-derive: **the drafted 0.1°-at-2026 gate cannot pass for a
correct model** (IAU W is ICRF, GMST is mean-equinox-of-date, precession
separates them by 0.34° — the gate now runs at J2000 plus a separate rate
check), and **Mars's 1.59° periodic term is a fixed offset, not a wobble**, so
dropping it would have shipped a 1.6° pole error that looked right.

**The verification story changed on 2026-07-27 and stage B inherits the new
one.** The owner said plainly that he cannot technically evaluate whether the
orientation is right — and he was correct to, because the residual is 0.06° and
the defect class is 0.3°, both far below what an eye resolves. The human smoke
was never a gate. It is replaced by **JPL Horizons sub-observer fixtures**
(`HORIZONS_MODE=subpoint` in the existing script) and
[`subSolarPoint.test.ts`](../src/lib/subSolarPoint.test.ts): 74 assertions, all
eight planets, epochs from 1900 to 2100. Read that file's header before adding
bodies — it records the west-vs-east longitude trap, the light-time treatment,
and why the residual growth after 2025 is a ΔT-model divergence rather than a
bad Ẇ. **Do not "fix" the app's ΔT toward JPL**: Horizons freezes it beyond the
observed record, the app extrapolates with Espenak-Meeus, and future Earth
rotation is unknowable.

**W6 stage B is next:** the 18 analytical satellites plus the Moon, Pluto and
Charon, the Triton decision, and OPP-PC. The sub-observer instrument the "Third
round" subsection asks for now **exists and works** — stage B only has to add
bodies to it. Pole-vs-orbit-normal and running the lock check at every fixture
epoch are still owed for the 20 bodies with no independent anchor. `moonSceneFrame.test.ts` now asserts Pluto has no
rotation solution; stage B flips that assertion and must re-derive Charon's
mount with it.

Two W3 findings a later wave must not re-derive, both recorded in that wave's
"What the gates actually proved" subsection: **the single pixel gate is
structurally blind to planet surfaces** (the frozen boot frame is a wide shot —
so W5/W9/W10 should not read "baseline unchanged" as a photometry result), and
**the eclipse fragment patch has never run on three r181** — `output_fragment` was
renamed `opaque_fragment` in r152, so three `.replace` calls in
`usePlanetMaterials.ts` are silent no-ops. That one is logged against **W7**, not
open for a drive-by fix: repairing the needle before the cone switches on a shadow
that fires on ~86% of new moons.

W4 added a third: **the wave file's own Rigel and Proxima figures were computed
from a catalog edition that is not the one on disk.** The shipped code is right
and the plan's numbers are not — do not tune the code to match them. Measured
values and the corrected Stefan-Boltzmann comparison are in W4's "What the gates
actually proved".

Read that file's **Standing law** before touching anything: it fixes the
helper-deletes-what-it-replaces rule, the zero-new-uniform GLSL convention, the
independent-check rule for every new physical constant, the single pixel gate,
and the seven arbitrated decisions that must not be re-litigated.

Findings, evidence and the rejection list live in
[`archive/audits/cross-ai-triage-2026-07-26.md`](./archive/audits/cross-ai-triage-2026-07-26.md).
Do not schedule anything from its §3 — that is what was checked and killed.

Previous waves: UI redesign (all five done) archived at
[`archive/waves/ui-redesign-2026-07-25.md`](./archive/waves/ui-redesign-2026-07-25.md);
T6.4 HYG visual recovery at
[`archive/waves/T6.4-visual-recovery.md`](./archive/waves/T6.4-visual-recovery.md).

**Default agent action on a fresh session:** do **not** invent a Gaia
port onda. Work the active wave in order, or prefer user-stated tasks.

---

## Parallel line — texture inventory

**[`tasks/waves/texture-inventory-2026-07-27.md`](./waves/texture-inventory-2026-07-27.md)**
— runs independently of the fidelity-honesty wave, intended for its own
worktree. 28 assets in `public/textures/` cannot be reached by any code path.
The question is **why**, not how fast they can be deleted: one of the three
categories is a wiring bug, where the good asset is on disk and the app serves
something worse. That brief carries the four measurement traps that already
produced wrong answers, so do not re-derive the orphan list from scratch.

---

## Carryover (parked — do not auto-expand)

| ID           | Pri | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------ | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-smoke      | P2  | **Superseded by the active wave's Deferred smoke gate**, which batches every owed browser observation (W1–W5A + NEW-6) into one end-of-wave pass. Original scope: optional user re-smoke of HYG fly-to / search / star panel after T6.4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Doc-debt     | —   | Historical audits/sweeps live under `archive/`; re-check claims against **current** code before treating as open bugs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Cross-AI     | —   | Validation brief: [`archive/audits/cross-ai-validation-brief-2026-07-24.md`](./archive/audits/cross-ai-validation-brief-2026-07-24.md). **Three external audits were revalidated against code on 2026-07-24** — see the Cross-AI triage note below. Do not re-open their claims without new evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Hunt-07-25   | —   | Proven opportunity hunt (bugs + gaps, no re-proposals): [`archive/audits/opportunity-hunt-2026-07-25.md`](./archive/audits/opportunity-hunt-2026-07-25.md). Re-check HEAD before treating IDs as open. **Still open and deliberately NOT in the active wave** — the 07-26 hunt was told not to re-propose them, so V1–V8, U1–U5, A1–A3 and Q1–Q4 remain this file's own queue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| NEW-6        | P1  | **Sprite↔mesh misalignment on the HYG focus transition — option C SHIPPED in `084a26b`.** The focused star's sprite now takes `mat3(modelViewMatrix) * u_focusedCamRel`, where the offset is `resolveHygWorldPosition(K) - camera.position` computed on the CPU via `cameraRelativeVector3`, so sprite, mesh and camera aim read one float64 function. **Verification is incomplete and deliberately labelled so:** the mechanism is verified from `cameraRelative.ts:30-39` (which puts the threshold at ~1e7 wu, 3400× below 52 Ori) and the fix is regression-free, but the before/after capture sampled 22 s after selection, when the cross-fade is already done and the sprite is at alpha 0 — so it does NOT prove the artifact is gone. **Owed: a human running the original repro.** Still open beside it: `cameraRelative.ts:46-52`'s CLOSED-AS-MOOT line needs correcting, `hygFocusResolver.ts:148-150` still says float32 "fits comfortably", and the unfocused field keeps the absolute path by design. |
| Triage-07-26 | —   | Six external audits triaged by 21 agents: [`archive/audits/cross-ai-triage-2026-07-26.md`](./archive/audits/cross-ai-triage-2026-07-26.md). ~2/3 of the pasted claims died. **§3 is a do-not-reopen list with the killing evidence attached.** Survivors are scheduled in the active wave.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Post–July 2026 audit fixes already landed on `main`/ahead branch
(frame, moons, `n`, mobile sidebar, CI gates, LOD, reduced-motion,
WebGL card, etc.). **Archived audit P0 lists are not a todo list.**

### Cross-AI triage — 2026-07-24

~30 claims from three external audits (Antigravity, GLM, Grok) were
verified line-by-line against HEAD. **Fixed:** ΔT clamp → Espenak-Meeus
(honesty at the announced VSOP range), HYG proper motion missing from
every CPU consumer (fly-to aimed ~94 000 wu off the drawn sprite),
`useDialogFocus` focus yank, `?`/Ctrl+Shift+T modal stacking,
`PlanetModel` ignoring `rotationEpoch`, Playwright `retries`,
NASA downloader truncation guard.

**Rejected with evidence — do not re-open:** hyperbolic Kepler solver
(catalog max e = 0.85, no comets, no user-add path); GPU-instanced orbit
curves (13 orbits by default, 44 max); QD→star-shader bridge (~1e-4 px);
`starfield.ts` base-path bug (already `BASE_URL`-aware); `selectId(null)`,
`onRehydrateStorage`, `migrateLegacyStorage` SSR, texture-cache eviction,
HYG CSV quote handling (0 of 119 626 rows affected), `camera.near`
collapse. Three proposed fixes would have **introduced** bugs
(`useOrbitalEngine` → frozen Sidebar; `onRehydrateStorage` → TDZ crash at
boot; focus-tracking reset → target snap).

---

## Loop protocol (minimal)

```
1. Read AGENTS.md (constitution + test ratchet).
2. Read this STATUS (queue only).
3. If STATUS names an active wave file, read only that section.
4. Do not open archive/ unless excavating a specific historical claim.
5. Implement minimum diff; product contracts only (AGENTS §6).
6. Smallest verification: targeted test / lint / runtime smoke if render.
7. docs:check if you touched hot-path docs.
```

---

## Gate commands

- `npm run test:run` — CI-style unit (or `npm run test:run -- <pattern>`)
- `npm run lint`
- `npm run build`
- `npm run docs:check`
- `npm run test:e2e` — when changing boot/focus/a11y paths

Do **not** use `npm test --run` (deprecated).

---

## Archive links (excavation only)

- [`archive/`](./archive/) — ROADMAP Gaia era, waves, audits, sweeps, postmortems
- [`lessons.md`](./lessons.md) — operational traps (on-demand; L41 = Atlas constitution)
