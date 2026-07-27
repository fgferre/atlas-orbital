# STATUS — agent work queue

**Read with [`AGENTS.md`](../AGENTS.md).** That file is product law.
This file is only **what to do next**. Folder map: [`README.md`](./README.md).

_Last updated: 2026-07-26 (W1–W4 + W5 stage A code-complete, smoke pending; W5 stage B next)._

---

## Active wave

**[`tasks/waves/fidelity-honesty-2026-07-26.md`](./waves/fidelity-honesty-2026-07-26.md)** —
thirteen waves in two tranches. Tranche 1 (W1–W10) closes every confirmed
fidelity and honesty defect; **tranche 2 is re-decided at the checkpoint, not
pre-committed**.

**W1 through W4 plus W5 stage A are code-complete on `main` (through `2d26f5e`);
all owe a browser smoke. W5 stage B (Saturn, F-09, the ring shaders) is next** —
the riskiest remaining increment in tranche 1, and stage A deliberately stopped
short of it because the wave declares stage A a valid stopping point. Read W5's
"Stage A shipped" subsection first: the bake-into-geometry decision **removes two
of stage B's three shader edits**, but the "in the ring shaders the pole is Z, not
Y" trap still applies in full to the planet-as-occluder solve, which is duplicated
across two patches. Per-item commits are in the wave file's progress table.

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

## Carryover (parked — do not auto-expand)

| ID           | Pri | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-smoke      | P2  | Optional user re-smoke of HYG fly-to / search / star panel after T6.4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Doc-debt     | —   | Historical audits/sweeps live under `archive/`; re-check claims against **current** code before treating as open bugs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Cross-AI     | —   | Validation brief: [`archive/audits/cross-ai-validation-brief-2026-07-24.md`](./archive/audits/cross-ai-validation-brief-2026-07-24.md). **Three external audits were revalidated against code on 2026-07-24** — see the Cross-AI triage note below. Do not re-open their claims without new evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Hunt-07-25   | —   | Proven opportunity hunt (bugs + gaps, no re-proposals): [`archive/audits/opportunity-hunt-2026-07-25.md`](./archive/audits/opportunity-hunt-2026-07-25.md). Re-check HEAD before treating IDs as open. **Still open and deliberately NOT in the active wave** — the 07-26 hunt was told not to re-propose them, so V1–V8, U1–U5, A1–A3 and Q1–Q4 remain this file's own queue.                                                                                                                                                                                                                                                                                                                                                                                               |
| NEW-6        | P1  | **Sprite↔mesh misalignment on the HYG focus transition is float32 precision, not frozen state.** Owner-reported in LIVE mode on 52 Ori and "several stars"; F-06 did not fix it because F-06 fixed frozen state. The sprite is drawn from a `Float32Array` of ABSOLUTE world coordinates through a float32 `mat4` whose translation is the camera position (~3.4e10 wu), while the mesh and camera use CPU float64. Measured 197 wu of storage round-off for 52 Ori = **4.0° at the landing pose, ~14× the star's own angular radius**; the GPU transform term is same-order and frame-varying. Full analysis, the measured-vs-reasoned split, and the two candidate fixes are in the active wave's W4 section under **NEW-6**. Not scheduled — needs an approach decision. |
| Triage-07-26 | —   | Six external audits triaged by 21 agents: [`archive/audits/cross-ai-triage-2026-07-26.md`](./archive/audits/cross-ai-triage-2026-07-26.md). ~2/3 of the pasted claims died. **§3 is a do-not-reopen list with the killing evidence attached.** Survivors are scheduled in the active wave.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

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
