# STATUS — agent work queue

**Read with [`AGENTS.md`](../AGENTS.md).** That file is product law.
This file is only **what to do next**. Folder map: [`README.md`](./README.md).

_Last updated: 2026-07-29 (**Onda 2.4 shipped — analytical auto-exposure / radiometric anchor**: scene exposure is now `1 / fusedSunlightScalar(focusedBody, policy)`, so the focused body always lands at reference display brightness and Saturn/Jupiter stop rendering as black discs in "Brilho real"; `handoffiluminacao.md` §5.3 closed; exposure registry is a two-factor product (`anchor × adaptation`) with 1d demoted to a ±1-stop refinement; `SCENE_EXPOSURE_MAX` 16 → 1e6; boot frame unchanged, no re-bless. Owed: aesthetics of the high-anchor star sky. Prior: planetshine GLSL-compile defect FIXED — `planetshinePatch.ts` (`26cb756`) now declares `u_shineDir`/`u_shineRadiance` at the `lights_physical_pars_fragment` anchor it shares with `solarIrradiancePatch.ts`; Io, Europa and the Moon render correctly again. New permanent regression net: `e2e/ultra-shaders.spec.ts` (forced-ultra focus sweep over one representative per patched material family, asserts zero console errors — this is the gate that would have caught the defect before ship). Prior: forced-ultra headless verification pass found the defect (see lighting-redesign wave file's "2026-07-29 (forced-ultra headless verification pass)" section for the original report, now closed). Before that: halo-alignment fix — `LightGlowInjector.tsx`'s fourth missed `hygFrame.ts` call site, see starfield-upgrade section below. Before that: lighting-redesign queue step 2 shipped — realistic-scale boot default + system-overview camera framing, second attempt same day after the first found and resolved the real blocker; Onda 2.2 assisted sunlight default + unified fidelity badge, Onda 1 items 1–3 and Onda 2.1 already in; starfield visual-upgrade and texture-VRAM lines still open; W1–W5 + W6 stage A code-complete; browser smokes BATCHED to the end of the wave; W6 stage B next)._

---

## Parallel line — starfield visual upgrade (partial, handoff)

**[`tasks/waves/starfield-visual-upgrade-2026-07-28.md`](./waves/starfield-visual-upgrade-2026-07-28.md)**

**#4 (Milky Way HDR panorama) PULLED after the owner's eye pass
(2026-07-29)** — verdict: "muito ruim, confuso e não integrado com o
starfield. ele some nos fly-bys". `MilkyWaySkybox.tsx` + its `Scene.tsx`
mount + CreditsModal entry removed; `milkyWayOrientation.ts` (verified
transform) and the source JPEG kept for the rethink. Do not re-attempt
the additive-shell approach — [`galaxy volumetric`](./waves/galaxy-volumetric-2026-07-29.md)
plan ready, M1 awaits owner go + GPU answers (§8; §0.1's
`ZodiacalLightSkybox` camera-outrun spin-off fixed separately). **#3 (zodiacal light) PULLED the same day, same reason** (owner: "muito trabalho para pouco benefício, não quero mais essa coisa. tire isso do projeto") — `ZodiacalLightSkybox.tsx` + mount + test + CreditsModal entry removed, `zodiacalLightLut.ts` kept parked for galaxy-volumetric's unified sky system; see wave file §"#3 pulled (2026-07-29)".

**2026-07-29 (halo-alignment fix):** `LightGlowInjector.tsx`, a fourth
missed `hygFrame.ts` call site, now routes through `hygEquatorialToScene`
— trail in the wave file. Owner: re-check the sky at home. Remaining
open in this wave: eye-adaptation runtime verification (1d shipped, not
eye-checked) and the LightGlow performance audit (blocked on real-GPU
access). CreditsModal now covers AgX only. Next agent: pick one of
those, or close the wave pending the owner's eye pass. Read the wave
file's "Honest disclosure" section before labelling any earlier
sub-pull done — green gates are not a runtime look.

---

## Parallel line — lighting redesign

**[`tasks/waves/lighting-redesign-2026-07-28.md`](./waves/lighting-redesign-2026-07-28.md)**

Runs in the same worktree as the starfield visual-upgrade line, source is
the owner's `handoffiluminacao.md` (repo-worktree root, read-only). Onda 1
items **1** (deleted the 5 dead lighting controls, kept + repurposed
Ambient → "Ambient Floor ×") and **3** (default 0.02 ambient viewing floor,
composed inside `resolveLerpRefTargets`, mid-industry between NASA Eyes
0.005 / Stellarium 0.02 / OpenSpace 0.05), item **2** (per-light regolith
`RE_Direct` wrapper), **Onda 2.1** (per-body solar irradiance from ephemeris
AU) and **Onda 2.2** (unified fidelity badge + assist control) are all
**shipped**.

**Onda 2.2 is the step where the lighting became visible.** The assist
default is `"assisted"` (`fused = E^0.35`, a third position between `"real"`
and the old `"compensated"`), shipped with its disclosure: `ScalePill`
replaced by `FidelityBadge`, ONE expandable surface grouping Scale +
Brightness, plus a `Sunlight` Select in the Display panel. The four
`PlanetModel` bodies (haumea, vesta, pallas, hygiea) **joined** the policy —
no exclusion, runtime-verified. `boot.spec.ts` also asserts the badge is
present and names both axes. Read the wave file's "Onda 2.2" section before
touching `solarIrradiance.ts` or the badge.

**Owner decision 2026-07-29 (default scale mode → realistic, boot = system
overview) SHIPPED** — `store.ts`'s `scaleMode` default is `"realistic"` and
`AstroPhysics.resolveFocusExtent` grew a realistic-mode system-overview
branch, so the boot camera parks ≈148 AU out (NASA-Eyes style). The wave's
re-bless budget is spent on that frame. **Onda 2.3's planetshine
GLSL-compile defect is FIXED** — regression net is
`e2e/ultra-shaders.spec.ts`. Both fully written up in the wave file.

**Onda 2.4 — analytical auto-exposure / radiometric anchor — SHIPPED
(2026-07-29).** Closes the owner's "Saturn is a pitch-black disc in Brilho
real" report and answers `handoffiluminacao.md` §5.3: scene exposure is now
`1 / fusedSunlightScalar(focusedBody, policy)`, so the focused body always
lands at reference brightness and the policy decides only how the rest of
the scene relates to it. Unfocused ⇒ exactly 1, boot frame unchanged, no
re-bless. Registry is a two-factor product (`anchor × adaptation`,
`setSceneExposure` deleted; 1d demoted to a ±1-stop refinement);
`SCENE_EXPOSURE_MAX` 16 → 1e6. **Owed: the aesthetics of the high-anchor
star sky** — at Neptune-real ×906 the starfield lifts hard, physically
defensible, left uncapped, needs the owner's eye. Read the wave file's
"Onda 2.4" section before touching `exposureRegistry.ts`,
`autoExposure.ts` or either exposure bridge.

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

**W1-W4 and W6 are done on `main`; their browser smokes are batched into one
pass at the end of the wave** — owner decision, 2026-07-26, so "smoke pending"
in the progress table is NOT a blocker and no increment waits on it. The
consolidated checklist is the wave's **Deferred smoke gate** section; do not
rebuild it from the per-wave prose.

**W5 stage B is still open** and is the one thing an agent could walk past,
because W6 landing later makes the queue look finished: stage A shipped the
body figure (`2d26f5e`), stage B — **Saturn, F-09, the ring shaders** — was
never started. Arbitrated decision B puts F-09 in W5, first commit of stage B,
not in W1. So the next increment is **W5 stage B or W7**, owner's pick; they do
not depend on each other.

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

| ID             | Pri        | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-smoke        | P2         | **Superseded by the active wave's Deferred smoke gate**, which batches every owed browser observation (W1–W5A + NEW-6) into one end-of-wave pass. Original scope: optional user re-smoke of HYG fly-to / search / star panel after T6.4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Doc-debt       | —          | Historical audits/sweeps live under `archive/`; re-check claims against **current** code before treating as open bugs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Cross-AI       | —          | Validation brief: [`archive/audits/cross-ai-validation-brief-2026-07-24.md`](./archive/audits/cross-ai-validation-brief-2026-07-24.md). **Three external audits were revalidated against code on 2026-07-24** — see the Cross-AI triage note below. Do not re-open their claims without new evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Hunt-07-25     | —          | Proven opportunity hunt (bugs + gaps, no re-proposals): [`archive/audits/opportunity-hunt-2026-07-25.md`](./archive/audits/opportunity-hunt-2026-07-25.md). Re-check HEAD before treating IDs as open. **Still open and deliberately NOT in the active wave** — the 07-26 hunt was told not to re-propose them, so V1–V8, U1–U5, A1–A3 and Q1–Q4 remain this file's own queue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| NEW-6          | P1         | **Sprite↔mesh misalignment on the HYG focus transition — option C SHIPPED in `084a26b`.** The focused star's sprite now takes `mat3(modelViewMatrix) * u_focusedCamRel`, where the offset is `resolveHygWorldPosition(K) - camera.position` computed on the CPU via `cameraRelativeVector3`, so sprite, mesh and camera aim read one float64 function. **Verification is incomplete and deliberately labelled so:** the mechanism is verified from `cameraRelative.ts:30-39` (which puts the threshold at ~1e7 wu, 3400× below 52 Ori) and the fix is regression-free, but the before/after capture sampled 22 s after selection, when the cross-fade is already done and the sprite is at alpha 0 — so it does NOT prove the artifact is gone. **Owed: a human running the original repro.** Still open beside it: `cameraRelative.ts:46-52`'s CLOSED-AS-MOOT line needs correcting, `hygFocusResolver.ts:148-150` still says float32 "fits comfortably", and the unfocused field keeps the absolute path by design.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Fallback-frame | **CLOSED** | **Was:** the twenty analytical satellites drew their orbit in the wrong plane outside their validity window, because `engine.ts` dropped to the Kepler fallback and that fallback read `body.orbit` — published parent-referred `i`/`Ω`, thirteen of them with a fabricated `O: 0, w: 0, M0: 0` — while `satelliteUsesParentEquatorialFrame` had become registry-driven and date-blind, so nothing rotated them any more. Measured 2025 → 2035 and **drawn, orbit line included**: Miranda 104.6°, Ariel/Umbriel/Titania/Oberon ~98°, Iapetus 30.4°, the other Saturnians ~28°, Phobos 26.3°, Deimos 24.1°, the Galileans ~2°, Charon 67.2°. Scrubbing past 2030 laid Uranus's sideways moon system flat onto the ecliptic. **Fixed in `setup.ts`:** an analytical satellite now registers its own elements as its fallback via `getSatelliteOsculatingElements(id, J2000_JD)`, which does the epoch re-reference with the body's calibrated rate. Worst plane shift across all twenty is now **0.0000°**. Chosen over editing twenty `body.orbit` records because it copies nothing into a second home and leaves the published values the panel displays untouched — which also dissolved the one real cost the audit found (the `e` cell would have swapped published means for osculating values: Tethys 0.0001 → 0.000841, Ariel 0.0012 → 0.000328). Pinned for all twenty in `moonSceneFrame.test.ts`. Found by an external audit of W6, 2026-07-27. |
| Triage-07-26   | —          | Six external audits triaged by 21 agents: [`archive/audits/cross-ai-triage-2026-07-26.md`](./archive/audits/cross-ai-triage-2026-07-26.md). ~2/3 of the pasted claims died. **§3 is a do-not-reopen list with the killing evidence attached.** Survivors are scheduled in the active wave.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

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
