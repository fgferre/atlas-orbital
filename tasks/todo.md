# Atlas Orbital — Active Todo

Updated: 2026-04-17

This file is the single running todo list for the orbital-realism initiative.
It complements the long-form plan in `PLAN.md` (strategy) and
`tasks/lessons.md` (accumulated mistakes and corrections).

## Active

### HYG v4.2 density restoration — 2026-04-17 session (done)

User reports the new HYG preset looks dramatically less dense than the
legacy tycho2 sky. Diagnosis confirmed two compound causes:

1. **Tier selection starves the render.** `hygTierForQuality()` maps
   `balanced → medium` (10 k stars) whereas tycho2 always loaded the
   full ~118 k catalog. Default `auto` mode resolves to `balanced` on
   any device with score ∈ [−1, 1] — i.e. most 2026 dev machines.
2. **Pogson shader collapses faint stars to sub-pixel.** Clamp floors
   `baseSize >= 1.5 px`, `alpha >= 0.08` at mag 6.5 kill the faint
   half of the catalog (mag ≥ 6). Old shader's linear `mix(3.0, 40.0, …)`
   - alpha floor 0.1 kept every star visibly solid.

- [x] Write plan to tasks/todo.md (L8 / CLAUDE.md literal).
- [x] **Fase 1 — shader floor + tier redistribution.**
  - [x] Raise clamps in `src/components/canvas/Starfield.tsx`:
        `baseSize` floor 1.5 → 2.5 px; `vBrightness` floor 0.08 → 0.20.
        Pogson curve intact at the bright end (mag ≤ 2 still scales
        up to 60 px).
  - [x] Redistribute `hygTierForQuality()` in `src/lib/starfield.ts`:
        `balanced → high` (50 k / 810 KB gzip) and `high → full`
        (109 k / 1.77 MB). `constrained → low` and `ultra → full`
        unchanged.
  - [x] Tier-table comment block rewritten with new payload sizes and
        rationale (density bias over bandwidth on broadband).
  - [x] `didacticBias = −0.9` re-checked under new Pogson curve — the
        1.51× size multiplier it produces matches the legacy 1.5×
        target, so no adjustment needed.
- [x] **Fase 1 — verification.**
  - [x] `npm run lint` clean.
  - [x] `npm run test:run` green — 287/287 across 30 files at
        `fae8a7a`. (Current tally 293/293 as of `aef03b8`.)
  - [x] Browser verify: fresh preview served `hyg-v1-full.bin.gz`
        (1.77 MB, ~109 400 stars) on page load, confirming the tier
        fix; rendered sky showed clearly dense faint-star field with
        visible B-V colour variation. NASA preset still loads the
        legacy asset for side-by-side visual sanity.
- [x] **Fase 2 — custom density override** — **not shipped**.
      Existing Quality control already exposes the full tier via
      `ultra`, and Phase 1 restored density for every non-constrained
      profile. Adding a separate "Starfield density" dropdown would
      duplicate that knob and widen the Settings surface without a
      user complaint to justify it (AGENTS.md #16: rationalization,
      simplest way to achieve the goal). If a real need surfaces
      later — e.g. a user with a mid-tier laptop preferring lower
      density for readability — the one-dropdown design outlined in
      the original plan remains valid and cheap to add on top.
- [x] Update review + lessons (below; `tasks/lessons.md` L11).

Deliberately **not** in scope (AGENTS.md #3 — smallest diff):
offline binary rebuild, proper-motion math, B-V curve, tilt, hover
picker, NASA renderer.

### Phase 3 — Horizons validation expansion (done)

- [x] `scripts/generate-horizons-fixtures.js` generalized (multi-body,
      multi-date, retry, preserves cross-run fixtures).
- [x] 53 fixtures across 28 bodies and 4 epochs — baseline 2020-01-01,
      mid-year 2020-07-01, one-year 2021-01-01, out-of-range 1890-01-01.
- [x] `scripts/derive-elements-from-fixtures.js` inverts fixture (r, v)
      into osculating elements. All 18 `*MeanElements` + asteroid entries
      now come from this pipeline, at epoch tagged in TDB scale so the
      engine lands at `dt=0` (see lessons L9).
- [x] Phase-4 tolerances enforced: 0.1°/0.2°/0.5° per family at baseline;
      per-body drift envelopes for multi-epoch (see lessons L10).

### Phase 3 tail (follow-on, lower priority)

- [x] Shift the analytical element epoch from 2020-01-01 to 2025-01-01
      so short-period moons (Io, Phobos, Mimas) stay within Phase-4
      tolerance at present-day simulation dates. Multi-epoch regression
      dates moved to 2025-01-01 / 2025-07-01 / 2026-01-01 to match.
      Obsolete 2020-_ / 2021-_ fixtures removed.
- [ ] Expand `MULTI_EPOCH_BODIES` in `regression.test.ts` from the
      current 12 representatives to all 28 analytical bodies, with
      per-body drift envelopes in `MULTI_EPOCH_OVERRIDES` sized by
      observed behaviour. The 2025-07-01 and 2026-01-01 fixtures for
      all 28 bodies are already on disk.
- [ ] Schedule an epoch refresh cadence (every 3–5 years) so drift never
      exceeds 1° at present-day simulation dates.

### HYG Starfield — in-place replacement of the legacy tycho2 preset (done)

All five sub-phases shipped:

- [x] **HYG-A** — offline pipeline (`scripts/download-hyg.js`,
      `scripts/build-hyg-binary.js`, `src/utils/hygBinary.ts`, 12 tests).
- [x] **HYG-B** — runtime migration. New shader with B-V colour, Pogson
      magnitude → size, proper motion uniform driven by simulation time.
      Store key migrated `"tycho2"` → `"hyg"`.
- [x] **HYG-C** — tier selection wired to `qualityProfile`. Constrained
      devices fetch 8 KB; ultra fetches 1.7 MB. Cache per tier so
      switching quality modes is free after first visit.
- [x] **HYG-D** — hover labels. 200 ms sustain, cursor feedback
      immediate, sidecar loaded on demand, disabled on constrained tier.
      IAU name + Bayer / Flamsteed + constellation + distance in ly.
- [x] **HYG-E** — legacy cleanup. Deleted `src/data/tycho2-processed.*`,
      `scripts/process-hyg.js`, `scripts/generate-tycho2-binary.js`,
      raw CSV. Updated credits and runtime metadata.

### Phase 5 — Deferred visual realism

- [x] Earth day/night shader fix — shipped in `abb2f6c`
      (world-space sun uniform; night-side clouds dim correctly).
- [x] Separate Earth cloud rotation from surface rotation. Cloud mesh
      and cloud-shadow caster now live in a sibling `cloudRotationRef`
      group under the axial-tilt parent, driven at
      `currentRotation * CLOUD_SUPER_ROTATION_FACTOR` (1.03). Applies to
      any body that renders a cloud layer.
- [x] PBR maps (normal / roughness) for Earth — shipped in `05ebaf7`.
      Bake pipeline at `scripts/bake-earth-pbr.js` pulls SSS CC-BY-4.0
      TIFF masters through Wayback (origin 403s scripted UA), inverts
      specular → roughness via sharp, emits 8k + 2k JPEG tiers.
      `useDeferredTexture` threaded with a `colorSpace` option so PBR
      channels sample linearly (`THREE.NoColorSpace`). Earth's
      `MeshStandardMaterial` gated on real albedo + screen salience.
      Unused `4k_ceres_fictional.jpg` (5 MB dead weight) retired in
      the same commit. Other bodies deferred to Phase 7 when
      per-body source research justifies the bake cost.
- [x] Moon-system visual regression — scoped out. WebGL pixel diffs
      are GPU-fingerprint fragile and the project has no existing
      Playwright infrastructure; baseline-PNG maintenance has a poor
      cost/benefit ratio here. Replaced in `aef03b8` with targeted
      vitest coverage: Earth PBR channel resolution (ultra/constrained
      tier selection) + Earth body-data wiring to the baked maps.

### Phase 6 — Cleanup tail (pending)

- [ ] Audit remaining scope-comments in tests (`regression.test.ts` lines
      referring to "scope of EPHASTER" etc.) — decide whether to keep as
      historical context or rewrite.
- [ ] Clarify the Playwright acceptance gate in `PLAN.md` — the current
      command fails with `ERR_CONNECTION_REFUSED` unless `npm run
preview:test` is running first. Either document the two-step flow
      or add a wrapper npm script that starts and tears down the preview.

## Review — graduated faint-star lift (2026-04-17)

Second Codex review, after the user reported the corrected sky felt
"a bit less dense". Codex's core diagnostic was right: any density
change between `fae8a7a` and `60cb1fa` in ultra can only come from
the shader (both commits map ultra → full → 109 400 stars). The
pre-fix `1.5 px / 0.08 α` floor is honest Pogson but visually
conservative; the `fae8a7a` hard floor at `2.5 px / 0.20 α` fixed
density by flattening the catalogue's ordering, which was worse.

Where I agreed with Codex:

- Drop the "50 k saturates perceived density" comment — user feedback
  contradicts it, and the real reason `high → high` stays is LOD
  ladder preservation, not a density claim. Rewrote the comment.
- Use a graduated lift in a narrow magnitude window rather than a
  hard global floor.
- Keep bright end pure Pogson (untouched).

Where I pushed back:

- **Per-profile shader uniforms** (Codex recommendation 3) — overkill.
  A single smoothstep window naturally scales across profiles: in
  balanced/high (tier max mag ~8.3) the lift fully covers the tail
  it has; in ultra (max mag ~20.5) the same window gives the
  naked-eye-to-binocular band presence while the telescopic tail
  (mag > 12) fades back to the raw floor and stays ghostly.
- **Core/halo split** (recommendation 6) — adds a second draw call
  or overdraw for a ~10 % perceptual gain over a good transfer
  curve. Park for a future "AAA mode" if and when density still
  feels short after this curve lands.

Shipped this round:

- **`src/components/canvas/Starfield.tsx`** — replace the 60cb1fa
  bare-Pogson + `1.5 / 0.08` floor with a smoothstep-window lift
  centred on shader mag ≈ 7.5. Size gets up to +1 px in the window,
  alpha up to +0.12. Window opens at mag 6, peaks at mag 7.5, fades
  back out by mag 12. Comment block rewritten to lay out _why not a
  flat floor_.
- **`src/lib/starfield.ts`** — header comment rewritten to drop the
  "50 k saturates perceived density" hypothesis (noted as wrong by
  Codex and by user feedback) and to name the real driver of
  perceived density (the shader transfer curve). Tier mapping
  unchanged.

Verified curve ordering by hand (key points, realistic mode):

| realmag | size px (60cb1fa) | size px (new) | Δ                    |
| ------- | ----------------- | ------------- | -------------------- |
| 5       | 4.99              | 4.99          | 0 (bright untouched) |
| 6       | 3.15              | 3.15          | 0 (window not open)  |
| 6.5     | 2.50              | 2.76          | +0.26                |
| 7.5     | 1.58 → 1.5 floor  | 2.58          | +1.00 (peak)         |
| 8.3     | 1.09 → 1.5 floor  | 2.09          | +0.59                |
| 10      | 0.40 → 1.5 floor  | 1.5           | 0 (fade kicking in)  |
| 12+     | sub-pixel → 1.5   | 1.5           | 0 (telescopic ghost) |

Monotonic across the whole range — no flattened buckets. The faint
naked-eye band (6.5–8.3) goes from "on the floor" to "clearly
visible with gradient", which is the density the user felt missing.
In `ultra` the full-tier population above mag 12 stays at the raw
`1.5 / 0.08` floor, so the catalogue does not turn into haze.

Verification: lint clean, 293/293 tests green (no regressions). The
browser preview is still pinned by L11 (iframe hosts a 0 × 0
viewport that blocks R3F canvas sizing); side-by-side screenshot
comparison in ultra will need to happen outside the Claude preview
MCP. User-facing visual acceptance remains open until the user or a
headed Playwright run confirms the lift looks right.

Lesson L13 (tasks/lessons.md): "global hard floors hide magnitude
ordering; graduated smoothstep windows are the right tool for
perceptual lifts inside a physics-informed transfer curve."

## Review — Codex follow-up on density fix (2026-04-17)

Independent Codex review of commit `fae8a7a` flagged three issues, all
confirmed correct after verifying the math and re-reading the paths:

1. **Shader floor change did not address the reported cause.** The old
   `1.5 px` floor activates at shader-mag ≥ 7.61; the old `0.08 α`
   floor at shader-mag ≥ 6.5. The complaint came from
   `auto → balanced → medium` (max real-mag 6.6) with default
   scaleMode `didactic` applying a `−0.9` bias — so the shader saw
   max mag ≈ 5.7, well below both floors. Zero stars in the reported
   case hit either floor. The shader edit was orthogonal to the
   user's complaint.
2. **The new `2.5 px / 0.20 α` floor destroyed magnitude ordering.**
   Floors now trigger at shader-mag ≥ 6.5, i.e. real-mag ≥ 7.4 in
   didactic mode. For the `high` tier (to mag ~8.3) that flattens
   ~80 % of stars to the same dot; for `full` (to mag ~20.5) it
   flattens ~90 %. The observable effect: a uniform haze of
   telescopic stars at the same visual weight as naked-eye stars.
3. **Tier remap collapsed the LOD ladder.** With `high → full` and
   `ultra → full`, the `ultra` profile no longer earns its extra
   payload over `high`. Plus `balanced` (score ∈ [−1, 1]) is genuine
   mixed hardware — 4 GB / 8-thread / 3G devices land there per
   `qualityProfile.test.ts:43`. 5× more stars means 5× decode,
   geometry build, and GPU upload, not just 5× network.

Corrections shipped in `60cb1fa`:

- **`src/components/canvas/Starfield.tsx`** — shader floors reverted
  to `1.5 px / 0.08 α` so the Pogson curve preserves magnitude
  ordering all the way out to mag 20. Comment block trimmed and
  reframed to explain _why the floor stays low_ (fog avoidance) so
  future maintainers do not walk back into the same trap.
- **`src/lib/starfield.ts`** — partial revert: `balanced → high`
  kept (this is the real fix for the complaint), `high → full`
  reverted to `high → high` so `ultra → full` stays the opt-in
  ceiling. Header comment rewritten accordingly.
- **`src/lib/starfield.test.ts`** — four unit tests pin
  `hygTierForQuality()` mapping (constrained→low, balanced→high,
  high→high, ultra→full). Next time someone shuffles the mapping,
  CI catches it without needing a human review round.

Verification: `npm run lint` clean; `npm run test:run` 291/291 green
(4 new, +0 regressions). Browser verify blocked by L11-style iframe
with 0x0 viewport (R3F cannot mount a sized canvas under a headless
preview); unit tests cover the decision logic directly.

Lesson: `tasks/lessons.md` L12 — "don't bundle two changes as one
fix; prove each addresses the reported cause independently".

## Review — HYG density restoration (2026-04-17 continuation)

Follow-up after the density complaint. Phase 1 shipped two surgical
changes; Phase 2 was consciously skipped.

- **`src/components/canvas/Starfield.tsx`** — shader vertex stage
  floors raised: `baseSize` clamp `1.5 → 2.5 px`, `vBrightness`
  clamp `0.08 → 0.20`. Expanded the adjacent comment block to
  explain the physical motivation (atmospheric PSF, glare, pupil
  adaptation) so a future reader does not "optimise" the floors back
  down. Pogson curve unchanged at the bright end.
- **`src/lib/starfield.ts`** — `hygTierForQuality()` remapped:
  `balanced → high` (was `medium`), `high → full` (was `high`).
  `constrained → low` and `ultra → full` unchanged. Comment header
  rewritten so the mapping's rationale (density bias over bandwidth
  on modern broadband) is visible at the call site.

Phase 2 (a per-subsystem "Starfield density" dropdown in the Settings
panel, mirroring AAA per-subsystem controls) was evaluated and
dropped: the existing Quality control already exposes the full tier
via `ultra`, so the new dropdown would duplicate that knob. Keeping
the Settings surface small is a more honest fix than adding a second
density control with a different label.

Verification:

- `npm run lint` clean.
- `npm run test:run` 287/287 green across 30 test files at `60cb1fa`.
  (Current tally 293/293 as of `aef03b8`.)
- Fresh preview instance confirmed `hyg-v1-full.bin.gz` (1.77 MB,
  ~109 400 stars) served on page load — i.e. the tier remap is live
  — and the rendered sky shows faint stars visibly resolved with
  B-V colour variation.

Note (AGENTS.md #8, honest limits): a genuinely constrained device
still gets the 500-star low tier with no in-app override. That is
intentional — the low tier exists for phones and 3G links that
cannot carry the full 1.77 MB payload — but a user with a mid-tier
laptop who prefers lower density for readability has no UI knob to
request it short of flipping Quality to `constrained`, which also
downgrades shadows and shader passes they may want to keep. If that
becomes a real request, the Phase 2 dropdown design stays on file.

Lessons: `tasks/lessons.md` L11 — Vite HMR state accumulates across
in-session edits; the Claude preview can look "stuck at 8%" when
the actual problem is a client-side `BOOT_STAGE` that never advances
because eight vite WebSocket clients are now fighting over the same
R3F canvas. Fix: `preview_stop` → `preview_start` flushes it.

## Review — 2026-04-17 session

Shipped after the pre-session baseline (commits top-to-bottom, oldest
first):

1. **Earth cloud day/night shader** (`feat(planet)…`, `abb2f6c`) —
   world-space sun uniform so the night side dims correctly.
2. **Real offline analytical ephemeris stack** (`feat(orbital)…`,
   `bbec355`) — VSOP87D, Pluto-Meeus, ELP/MPP02-trunc, satellite +
   asteroid modules. Consolidates Kepler math in `coordUtils.ts`,
   removes dead code, 15 new unit tests, honest provenance throughout.
3. **Multi-epoch Horizons regression** (`test(orbital)…`, `9279424`) —
   generalises `generate-horizons-fixtures.js`, expands regression
   suite to cover multi-epoch drift + validity-window routing.
4. **Fixture-derived satellite / asteroid elements** (`fix(orbital)…`,
   `fe23150`) — new `scripts/derive-elements-from-fixtures.js` inverts
   Horizons (r, v) into osculating elements. Fixes 50–170° satellite
   errors and the 72° Pallas error. Catches UT-vs-TDB epoch mismatch
   (L9).
5. **HYG v4.2 binary pipeline (offline)** (`feat(starfield)…`,
   `e4994c3`) — HYG-A. Spec, downloader, LOD-tier builder, 12 tests.
6. **First Codex review follow-up** (`fix(orbital)…`, `85bafe9`) —
   orbit lines now consume analytical osculating elements; credits +
   registry notes aligned with Horizons-derived reality; task log
   refreshed; Playwright gate clarified in PLAN.md.
7. **HYG runtime migration** (`feat(starfield)…`, `8035770`) — HYG-B.
   New shader with B-V colour, Pogson size, proper motion uniform.
   Store key `tycho2` → `hyg`.
8. **HYG tier selection** (`feat(starfield)…`, `f455f7a`) — HYG-C.
   `qualityProfile` → tier mapping; cache per tier.
9. **HYG hover labels** (`feat(starfield)…`, `188ba31`) — HYG-D.
   200 ms sustain tooltip, cursor feedback, disabled on constrained.
10. **Legacy tycho2 pipeline deleted** (`chore(starfield)…`,
    `d872104`) — HYG-E cleanup.
11. **Analytical epoch shift 2020 → 2025** (`fix(orbital)…`, `a7fe539`)
    — re-derives every satellite/asteroid entry from fresh Horizons
    fixtures at 2025-01-01 so short-period moons stay under Phase-4
    tolerance at present-day simulation dates. 84 new fixtures, 52
    obsolete ones removed, `MULTI_EPOCH_DATES` bumped to 2025 / 2025-07
    / 2026.
12. **Second Codex review follow-up** (`fix(orbital)…`, `30994e8`) —
    fixes the hover-picker catalog race that could keep
    tooltips disabled on first load, bumps
    `generate-horizons-fixtures.js` default dates to the 2025 set,
    aligns CreditsModal and task log to the current epoch.

Code quality checkpoints:

- `AGENTS.md` principles applied literally: no dead code after each
  strategy change, no duplicated Kepler solvers, honest provenance,
  no invented file references.
- Two rounds of independent Codex review, both acted on in the
  commit that immediately follows. `tasks/lessons.md` carries the L1-L10
  rule set derived from everything this session caught.
- Browser smoke test (preview mcp) confirmed zero runtime errors,
  hover tooltip working, tier selection auto-resolving, all textures
  loading.

Known remaining limits, surfaced explicitly (AGENTS.md #8):

- Multi-epoch drift for fast-moving satellites is real and bounded,
  not hidden: Io ±80° /yr, Titan / Oberon ±2° /yr. Encoded in
  `MULTI_EPOCH_OVERRIDES` with physical cause.
- `MULTI_EPOCH_BODIES` in `regression.test.ts` still only covers the
  12 original representatives. The 2025-07-01 / 2026-01-01 fixtures
  for the remaining 16 bodies are on disk but not yet held to tight
  multi-epoch tolerance (tracked in "Phase 3 tail").

Verification status: `npm run lint` clean, `npm run test:run` at
287/287 green across 30 test files, `npm run build` ~9 s — as of the
10-commit session that closed at `ae2a2a3`. Subsequent sessions pushed
this to 293/293 across 30 files (current as of `aef03b8`).
