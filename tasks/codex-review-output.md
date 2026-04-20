# Phase θ — Codex independent review (2026-04-20)

## Summary verdict

SHIP-READY-WITH-AMENDMENTS: the onda set is strong, but the phase-level contracts for verification, tiering/a11y, hot-path/store behavior, and render-space invariants need tightening before execution.

## High-severity findings

1. **Finding:** The phase-level verification contract is impossible as written and incomplete for the six swarm-added ondas.

- **Evidence:** `tasks/phase-gaia-sky.md:643` starts a verification matrix that stops at `θ.8`; `tasks/phase-gaia-sky.md:1040` requires all fourteen ondas to have “unit + Playwright gates”; but `tasks/phase-gaia-sky.md:277`, `tasks/phase-gaia-sky.md:338`, `tasks/phase-gaia-sky.md:400`, `tasks/phase-gaia-sky.md:454`, and `tasks/phase-gaia-sky.md:937` explicitly say unit coverage is “not feasible” or “none”.
- **Impact:** The exit gate is not satisfiable, and reviewers will not know whether θ.9–θ.14 are failing the plan or the plan is failing itself.
- **Recommended fix:** Rewrite §7 and §10 to say “unit where feasible, otherwise explicit config/math guard + Playwright gate.” Either extend the matrix through θ.14 or delete the matrix and rely on per-onda verification only.

2. **Finding:** The phase-level tier/reduced-motion contract is stale and self-contradictory after θ.9–θ.14.

- **Evidence:** `tasks/phase-gaia-sky.md:69` defines tier behavior only for `θ.1–θ.8`; `tasks/todo.md:41`–`tasks/todo.md:48` still hard-code only early-wave constraints; `tasks/phase-gaia-sky.md:272` says θ.3 should freeze `u_time` under reduced motion, but `tasks/phase-gaia-sky.md:1048` says reduced motion force-disables θ.3/θ.5/θ.14; `tasks/todo.md:47` mentions only θ.3 and θ.5.
- **Impact:** Different implementers can ship different behavior, and perf/baseline expectations for balanced/high/ultra become non-authoritative exactly where the plan expanded.
- **Recommended fix:** Make §4 the single source of truth for all 14 ondas, including reduced-motion behavior. Then align `tasks/todo.md` and θ.3/θ.14 wording to that single contract.

3. **Finding:** θ.7’s hero-star detector/store plan reopens L18/L19 hot-path risks.

- **Evidence:** `tasks/phase-gaia-sky.md:491` proposes a 250 ms scan and flipping `activeHeroStarId` in Zustand; `tasks/phase-gaia-sky.md:555` only calls out polling cost on constrained; `tasks/lessons.md:485` says high-rate state should live outside the React store; `tasks/lessons.md:546` and `tasks/lessons.md:558` require cached lookups and no store updates when the observable output is unchanged.
- **Impact:** Camera motion near dense/star-label scenes can reintroduce avoidable React churn and make θ.7 the perf cliff of the phase.
- **Recommended fix:** State explicitly that detector math stays imperative/outside React, candidate lookups are cached, and Zustand writes happen only when `(heroStarId, lodStage)` actually changes.

4. **Finding:** The plan never states a single render-space/color-management contract for passes that straddle HDR-linear and display-referred stages.

- **Evidence:** `tasks/phase-gaia-sky.md:258` puts LightGlow before Bloom and AgX; `tasks/phase-gaia-sky.md:320` puts lens flare before AgX; `tasks/phase-gaia-sky.md:385` puts motion blur after AgX; `tasks/phase-gaia-sky.md:439` puts CA/vignette/grain after AgX; `tasks/phase-gaia-sky.md:921` puts dithering last; but `tasks/phase-gaia-sky.md:30`–`tasks/phase-gaia-sky.md:47` and `tasks/phase-gaia-sky.md:627`–`tasks/phase-gaia-sky.md:639` never say which passes are linear-HDR only, which are post-tone-map only, or where output encoding is authoritative.
- **Impact:** Subtle bugs will look like “taste” instead of contract violations: wrong flare energy, wrong grain/dither domain, and hard-to-reproduce screenshots across devices.
- **Recommended fix:** Add a short “rendering invariants” block: HalfFloat linear working buffer, AgX position, post-AgX display-space passes, and final output/dither order.

## Medium-severity findings

1. **Finding:** θ.14 violates L14 as written: it specifies a magnitude-domain effect but applies it on derived brightness.

- **Evidence:** `tasks/phase-gaia-sky.md:950` says amplitude is `±0.08 magnitude`; `tasks/phase-gaia-sky.md:965` multiplies `brightness`; `tasks/lessons.md:266` says perceptual adjustments must stay on the raw physical axis.
- **Impact:** Twinkle amplitude becomes non-uniform by magnitude and can locally scramble ordering.
- **Recommended fix:** Apply twinkle on raw flux/mag before log compression, or rename the parameter in brightness units and add an ordering test.

2. **Finding:** θ.3/θ.4 are coupled to Bloom internals without acknowledging the feasibility risk.

- **Evidence:** `tasks/phase-gaia-sky.md:252` reuses Bloom’s downsampled threshold buffer for LightGlow; `tasks/phase-gaia-sky.md:312` feeds lens flare from the same buffer; the risk register at `tasks/phase-gaia-sky.md:631`–`tasks/phase-gaia-sky.md:639` never names that dependency.
- **Impact:** If pmndrs does not expose that buffer cleanly, two ondas slip at once.
- **Recommended fix:** Add a spike/fallback note now: either prove buffer access first or budget a dedicated luminance prepass.

3. **Finding:** The Playwright strategy does not carry forward the repo’s own R3F screenshot lessons.

- **Evidence:** `tasks/lessons.md:361` warns that R3F `page.screenshot` is fragile and recommends explicit waits / `readPixels`; `tasks/phase-gaia-sky.md:643`–`tasks/phase-gaia-sky.md:657` and the per-onda specs add many screenshot gates but never restate that harness rule.
- **Impact:** CI flakiness is likely on θ.3, θ.5, and θ.14, where “animation exists” is the assertion.
- **Recommended fix:** Add one phase-wide test-harness note: no `animations: "disabled"`, explicit settle waits, and `readPixels` fallback for animated canvas checks.

4. **Finding:** θ.6 bundles three independent image treatments into one onda, weakening L12-style causality and rollback.

- **Evidence:** `tasks/phase-gaia-sky.md:422` groups chromatic aberration, vignette, and film grain; `tasks/phase-gaia-sky.md:455` verifies them together; `tasks/lessons.md:214` says each change should defend its own symptom/cause.
- **Impact:** If one treatment is rejected, the onda becomes awkward to bisect and rebaseline.
- **Recommended fix:** Keep one onda if you want, but split acceptance into three explicit toggles/baselines or two commits.

5. **Finding:** θ.10/θ.11 add third-party data/assets without L1/L7 guardrails or fallback behavior.

- **Evidence:** `tasks/phase-gaia-sky.md:778` downloads a constellation dataset; `tasks/phase-gaia-sky.md:824` downloads an ESO panorama; `tasks/phase-gaia-sky.md:798` only verifies HIP existence; `tasks/lessons.md:16` requires sanitizing third-party tables; `tasks/lessons.md:112` forbids invented script/file contracts; `AGENTS.md:15` and `AGENTS.md:18` require existing-equivalent search plus edge/error/empty states.
- **Impact:** Brittle builds, provenance drift, and poor runtime behavior if assets are absent/corrupt.
- **Recommended fix:** Add schema/non-finite validation, a provenance/licensing note, and explicit runtime fallback (`black background`, `dust off`, `constellations off`).

6. **Finding:** The plan omits Gaia Sky’s AA/sharpening tier strategy even though θ.9/θ.10/θ.12 make alias-prone lines and text central.

- **Evidence:** `tasks/phase-gaia-sky.md:69`–`tasks/phase-gaia-sky.md:80` define no AA behavior, and no onda or §9 item covers AA; Gaia Sky exposes antialiasing as a first-class graphics control and pairs AA with unsharp mask in its preset stack. citeturn1search0turn2search1
- **Impact:** The upgraded scene can still ship with the most obvious remaining artifact class: jagged orbit lines, label edges, and shimmer.
- **Recommended fix:** Fold AA/sharpening into θ.13/θ.6 or defer it explicitly in §9.

7. **Finding:** The exit/display naming is internally ambiguous around “Lens.”

- **Evidence:** `tasks/phase-gaia-sky.md:333` names θ.4 “Lens Flare”; `tasks/phase-gaia-sky.md:451` names θ.6 a “Lens” section; `tasks/phase-gaia-sky.md:1042` lists “Lens (θ.4)” in exit criteria.
- **Impact:** Reviewers can pass/fail the wrong UI surface.
- **Recommended fix:** Rename the exit criterion to match the actual section/row names.

8. **Finding:** θ.11’s backdrop asset target contradicts its own risk note.

- **Evidence:** `tasks/phase-gaia-sky.md:838` sets `2048` per face as the ultra parameter; `tasks/phase-gaia-sky.md:854` then says `6×2048` is excessive and default should stay `6×1024`.
- **Impact:** Asset-build target and perf budget are unclear before implementation starts.
- **Recommended fix:** State one default and one optional HD target in the main onda body, not only in the risk note.

9. **Finding:** Verification matrix §7 was never updated for θ.9–θ.14.

- **Evidence:** `tasks/phase-gaia-sky.md:643`–`tasks/phase-gaia-sky.md:657` list only θ.1–θ.8, while `tasks/phase-gaia-sky.md:709`–`tasks/phase-gaia-sky.md:980` define six more ondas and `tasks/todo.md:34`–`tasks/todo.md:39` track them.
- **Impact:** The plan’s “quick scan” view is no longer authoritative.
- **Recommended fix:** Extend §7 through θ.14 or remove it.

## Low-severity / nice-to-have

- `tasks/todo.md:47` omits θ.14 from reduced-motion hard constraints.
- `tasks/phase-gaia-sky.md:974` calls the row “Star Twinkle,” while `tasks/phase-gaia-sky.md:1047` calls it “Alive Sky.”
- `tasks/phase-gaia-sky.md:111`, `tasks/phase-gaia-sky.md:317`, `tasks/phase-gaia-sky.md:779`, and `tasks/phase-gaia-sky.md:825` assume new `scripts/build-*.mjs` files without a preflight “search existing pipeline first” note.
- θ.8’s `cameraSlice` is reasonable, but the plan should say it stays low-rate intent only, never frame-state.
- θ.7 verification sample distances (`tasks/phase-gaia-sky.md:530`) are far above the stated `~10 AU` engagement zone, so the narrative is clearer than the numeric checkpoints.
- `tasks/phase-gaia-sky.md:1008` keeps Phong billboard mode “documented but not planned”; it reads cleaner in §9.
- Risk register §6 never mentions licensing/provenance review for the ESO panorama or constellation source files.

## Lessons audit

L01: AT-RISK in θ.10 (third-party constellation data gets only HIP-existence checks, not sanitize/schema guards).  
L02: N/A for this phase.  
L03: N/A for this phase.  
L04: N/A for this phase.  
L05: AT-RISK phase-wide (many exploratory scripts/assets/effects, no explicit cleanup pass clause).  
L06: AT-RISK in θ.7/θ.8 (same surface-mode threshold appears twice; no shared helper is mandated).  
L07: AT-RISK in θ.1/θ.4/θ.10/θ.11 (new scripts/files are named before any “search existing equivalent” step).  
L08: RESPECTED.  
L09: N/A for this phase.  
L10: N/A for this phase.  
L11: AT-RISK phase-wide (manual preview / screenshot guidance omits the HMR-reset caveat).  
L12: AT-RISK in θ.6 and partially θ.7 (multi-change ondas reduce per-change proof).  
L13: RESPECTED.  
L14: AT-RISK in θ.14 (mag-domain spec, brightness-domain implementation).  
L15: AT-RISK in θ.9/θ.13/θ.14 (new custom shader/effect work is not explicitly covered by the L15 guardrail).  
L16: RESPECTED.  
L17: RESPECTED.  
L18: AT-RISK in θ.7 and θ.14 (new time/state behavior is not fully pinned to imperative clock rules).  
L19: AT-RISK in θ.7/θ.12 (no explicit dedupe/caching/store-quiet rule on the hot path).  
L20: N/A for this phase.  
L21: RESPECTED.

## Missing Gaia Sky features (your pick)

- **AA + unsharp mask tiering** — Gaia Sky treats antialiasing and sharpening as first-class graphics features; phase θ has neither an onda nor a §9 defer. Fold into `θ.13` or add a new onda. citeturn1search0turn2search1
- **Occlusion-aware star glow over objects** — Gaia Sky separates ordinary glow from “star glow over objects”; current `θ.3` is bright-pass-only. Fold into `θ.3`. citeturn2search1
- **Star motion trails** — Gaia Sky exposes star-specific motion trails distinct from full-scene camera blur; phase θ only plans camera motion blur. Fold into `θ.5` or defer to §9. citeturn2search1
- **Shadow mapping / eclipse shadows** — Gaia Sky exposes shadow mapping in graphics settings/presets; phase θ has no equivalent or explicit defer. Add a new onda or defer to §9. citeturn1search0turn1search2
- **Dynamic resolution / back-buffer supersampling** — Gaia Sky exposes both dynamic resolution and back-buffer scale for upscale/downscale quality control; phase θ’s tier strategy has no HiDPI/output-resolution clause beyond DPR correctness. Add to §4 or defer to §9. citeturn1search0turn2search1

## Do-not-fix (deliberate scope control)

- **Depth of field** — I considered flagging it, but I did not find enough Gaia-Sky-specific evidence to call it a must-have for this phase.
- **Terrain AO / virtual-texture close-surface planet work** — real Gaia Sky territory, but it is planetary surface fidelity work, not the star-focused θ scope. citeturn2search0turn2search1
- **True per-element lens flare chain** — already explicitly deferred in `tasks/phase-gaia-sky.md:1023`; no need to reopen it.
- **Render star spheres for all stars** — θ.7 captures the high-value hero-star case; all-stars sphere rendering would blow up scope for limited payoff.
