# STATUS — agent work queue

**Read with [`AGENTS.md`](../AGENTS.md).** That file is product law.
This file is only **what to do next**. Folder map: [`README.md`](./README.md).

_Last updated: 2026-07-27 (W1–W6 code-complete; browser smokes BATCHED to the end of the wave; **W7 next**)._

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

**W6 is code-complete.** `src/lib/bodyOrientation.ts` is the single orientation
source, and the Sun, all eight planets, the Moon, the eighteen analytical
satellites, Triton, Pluto and Charon now carry measured IAU rotational elements.
Read W6's **"Stage B shipped"** subsection before touching orientation again —
it records what a later session must not re-derive.

**The satellite constants were not typed by a human.**
`scripts/derive-iau-orientation.js` parses NAIF's `pck00011.tpc`; it re-emits
the nine bodies stage A entered by hand and reproduces all 54 of their secular
coefficients exactly, which is what validates the other 22. **Do not
hand-transcribe additions** — and do not restore the plan's "drop periodic
terms, disclose the amplitude" prescription: Mimas's prime meridian librates
44.85° and Triton's pole 32.35°, so that instruction would have shipped gross
errors under a ~1° budget.

**Triton and Charon are analytical satellites now**, with Horizons-derived
ecliptic elements, and both left the parent-equatorial mount. Their fabricated
nodes are gone (Charon's `O/w/M0` were zeros; Triton carried a disclosed 150°
envelope) and both sit inside the 0.5° family bound. **Pluto's obliquity was
also corrected**, 122.53° → 119.59°: the old figure was measured to the ecliptic
where the rest of the catalog uses the orbit. The retrograde sign in
`resolveObliquityDeg` now comes from the IAU Ẇ, not `rotationPeriodHours` —
those two genuinely disagree for Pluto and both are true.

**Verification, and what it is not.** Orientation is checked against **JPL
Horizons sub-solar points** (127 fixtures, 30 bodies, 1900–2100) in
[`subSolarPoint.test.ts`](../src/lib/subSolarPoint.test.ts), and every satellite
pole is checked against an **independently fitted orbit normal** in
`bodyOrientation.test.ts` — 20 bodies, all within 0.69°, from two datasets that
share no input. Read those files' headers before adding bodies: they record the
west-vs-east longitude trap, light-time treatment, the planetocentric-vs-
planetodetic latitude conversion, and why a stale satellite phase — not a bad Ẇ
— loosens the 2000-01-01 longitude bound. **Do not "fix" the app's ΔT toward
JPL**: Horizons freezes it beyond the observed record, the app extrapolates with
Espenak-Meeus, and future Earth rotation is unknowable.

**Nothing is owed for W6.** The pixel-gate re-bless both stages predicted is
not needed: `npm run test:e2e` passes 12/12 including `boot visual identity`,
unchanged at 1% tolerance, so no baseline was regenerated. Do not read that as
"Earth's orientation did not move" — it did, and `subSolarPoint.test.ts` is what
proves it now matches JPL. It means the frozen boot frame is a wide shot with no
planet surface in it, which is W3's finding, not a new one.

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

**Already running, do not re-open it.** A worktree exists at
`../atlas-textures` on branch `texture-inventory` (from `9cc4fb0`) with a
session working that brief. A `main` session should leave `public/textures/`,
`src/lib/textureVariants.ts` and `src/lib/textureVariantManifest.ts` alone
until that branch merges, or the two lines will conflict.

---

## Carryover (parked — do not auto-expand)

| ID             | Pri    | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-smoke        | P2     | **Superseded by the active wave's Deferred smoke gate**, which batches every owed browser observation (W1–W5A + NEW-6) into one end-of-wave pass. Original scope: optional user re-smoke of HYG fly-to / search / star panel after T6.4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Doc-debt       | —      | Historical audits/sweeps live under `archive/`; re-check claims against **current** code before treating as open bugs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Cross-AI       | —      | Validation brief: [`archive/audits/cross-ai-validation-brief-2026-07-24.md`](./archive/audits/cross-ai-validation-brief-2026-07-24.md). **Three external audits were revalidated against code on 2026-07-24** — see the Cross-AI triage note below. Do not re-open their claims without new evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Hunt-07-25     | —      | Proven opportunity hunt (bugs + gaps, no re-proposals): [`archive/audits/opportunity-hunt-2026-07-25.md`](./archive/audits/opportunity-hunt-2026-07-25.md). Re-check HEAD before treating IDs as open. **Still open and deliberately NOT in the active wave** — the 07-26 hunt was told not to re-propose them, so V1–V8, U1–U5, A1–A3 and Q1–Q4 remain this file's own queue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| NEW-6          | P1     | **Sprite↔mesh misalignment on the HYG focus transition — option C SHIPPED in `084a26b`.** The focused star's sprite now takes `mat3(modelViewMatrix) * u_focusedCamRel`, where the offset is `resolveHygWorldPosition(K) - camera.position` computed on the CPU via `cameraRelativeVector3`, so sprite, mesh and camera aim read one float64 function. **Verification is incomplete and deliberately labelled so:** the mechanism is verified from `cameraRelative.ts:30-39` (which puts the threshold at ~1e7 wu, 3400× below 52 Ori) and the fix is regression-free, but the before/after capture sampled 22 s after selection, when the cross-fade is already done and the sprite is at alpha 0 — so it does NOT prove the artifact is gone. **Owed: a human running the original repro.** Still open beside it: `cameraRelative.ts:46-52`'s CLOSED-AS-MOOT line needs correcting, `hygFocusResolver.ts:148-150` still says float32 "fits comfortably", and the unfocused field keeps the absolute path by design.                                                                                                        |
| Fallback-frame | **P1** | **Eighteen analytical satellites render their orbit in the wrong plane outside the 2020-2030 validity window.** `engine.ts` drops to the Kepler fallback there and reads `body.orbit`, whose `i`/`Ω` are parent-EQUATORIAL for these records — but `satelliteUsesParentEquatorialFrame` is registry-driven and **date-blind**, so nothing rotates them any more. Measured plane shift 2025 → 2035: **Miranda 104.6°**, Ariel/Umbriel/Titania/Oberon ~98°, the Saturnians ~28°, Phobos 26.3°, Deimos 24.1°, the Galileans ~2°. Reachable by dragging the date slider; invisible to the suite, whose satellite fixtures are all in-window. Found by an external audit of W6 on 2026-07-27. **The fix is known and mechanical** — W6 applied it to Charon and Triton (now 0.00°): put the same fixture-derived ecliptic elements in `body.orbit`, re-referenced from the 2025 epoch to J2000 (`M0 − n·(epochJD − J2000)`), which makes the fallback geometrically identical to the analytical path so only the uncharacterised _accuracy_ degrades. Deliberately NOT swept into W6: it predates the wave and touches 18 records. |
| Triage-07-26   | —      | Six external audits triaged by 21 agents: [`archive/audits/cross-ai-triage-2026-07-26.md`](./archive/audits/cross-ai-triage-2026-07-26.md). ~2/3 of the pasted claims died. **§3 is a do-not-reopen list with the killing evidence attached.** Survivors are scheduled in the active wave.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

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
