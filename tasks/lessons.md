# Lessons — Atlas Orbital

A running record of concrete mistakes and the rules that prevent them.
Append to this file after any correction from the user or any hunt that
revealed a non-obvious failure mode.

## 2026-04-17 session

### L1. Trust-but-verify third-party data tables

**Context:** `astronomia` 4.2.0 ships `vsop87Duranus.js` and
`vsop87Dneptune.js` with a handful of `[NaN, NaN, NaN]` rows produced by an
upstream converter underflow. A single NaN poisons the Horner evaluation
and the planet ends up ~12° off.

**Rule:** When consuming tabular numeric data from a third-party package,
sanitize at load time — filter non-finite rows / coerce NaNs — before the
data reaches any math path. Evaluate the sanitizer as a production fix,
not a debug band-aid.

**Code marker:** `sanitizeVsopSeries()` in `vsop87Planets.ts`.

### L2. `moduleResolution: "bundler"` ignores ambient `declare module`

**Context:** I created `src/lib/orbital/astronomia.d.ts` with
`declare module "astronomia/planetposition"` etc. TypeScript ignored it
because the package's `exports` field resolves to `.js` files, and the
bundler resolver prefers those over ambient declarations. All
`@ts-ignore` removals reintroduced TS7016.

**Rule:** For untyped JS packages under `moduleResolution: "bundler"`, the
correct pattern is a **typed shim module** that does the dirty
`@ts-ignore` import once and re-exports strongly typed surfaces. Do not
try to fix it with a `.d.ts`.

**Code marker:** `src/lib/orbital/analytical/astronomiaShim.ts`.

### L3. JPL SSD mean elements use different reference planes per satellite

**Context:** Initial attempt used JPL satellite mean-element tables on the
parent equator for all moons, then rotated to the ecliptic at runtime.
Titan came back ~136° off because its tabulated elements are on Saturn's
Laplace plane, not the Saturn equator.

**Rule:** When using mean-element tables, read the "Reference plane"
column for every body. Do not assume a family uses one plane. For the
bodies that matter most visually (large radius, slow motion, prominent in
frame), derive elements directly from a Horizons state vector at a known
epoch instead of trusting the table. Store the derived values and the
source (`"fixture"` vs `"rotated-tabular"`) next to the elements.

**Code marker:** `SatelliteEntry.source` discriminant in `satellites.ts`.

### L4. Provenance labels must name what ran, not the literature

**Context:** `CreditsModal`, `registry.notes`, and
`analyticalProvider.provenanceFor()` carried strings like
`"GUST86-derived mean elements on Uranus equator"` while the runtime was
actually just two-body Kepler propagation of J2000 ecliptic elements.
GUST86 was never executed. This violates PLAN.md's hard constraint
"Do not claim an analytical model is active unless it actually produced
the position" and it was reaching the UI.

**Rule:** Provenance strings describe the _operation the user-facing code
performed_, not the historical reference theory whose accuracy scope the
data loosely matches. When in doubt, write it in the imperative: "Two-body
propagation of J2000 ecliptic elements". If you cite a published theory
by name (VSOP87D, Meeus Ch. 37, ELP/MPP02), make sure a function in the
analytical/ module actually evaluated that theory's series.

**Code marker:** `provenanceFor()` in `analyticalProvider.ts`.

### L5. Cleanup pass is mandatory after strategy changes

**Context:** I built `planetEquatorToEclipticMatrix` (55 lines) expecting
to do the equator→ecliptic rotation at runtime, then later moved the
rotation offline (values pre-baked into the element tables). The matrix
function became dead code and sat there unused for the rest of the
session. Same with `asJDE` (a no-op identity). Same with
`OBLIQUITY_J2000_RAD` (only used by the matrix).

**Rule (AGENTS.md #12 literal):** After any non-trivial strategy change,
grep for every symbol introduced during the old strategy and delete what
no longer has callers. Do this _before_ claiming the task is complete —
dead code that ships is an unpaid debt, not a "harmless leftover".

### L6. Duplicated math inside one engine is a design smell, not a convenience

**Context:** `keplerProvider.ts` had `solveKeplerEquation` (5 iter, no
convergence check) and its own perifocal-to-ecliptic rotation.
`coordUtils.ts` had `solveKeplerRad` (12 iter, 1e-12 convergence) and
`elementsToCartesian` doing the same rotation. Analytical satellites and
asteroids consumed the coordUtils copy; the Kepler fallback kept its
private copy. Two solvers, two rotations, one engine.

**Rule:** When a helper exists already in the module you're working on,
consume it. When the helper is almost-but-not-quite what you need, factor
out the shared core (e.g. `perifocalToEcliptic`) and have both call
sites delegate. Do not add a second Kepler solver "for clarity" —
clarity is the reader seeing one solver, not two.

**Code marker:** `perifocalToEcliptic` + `elementsToCartesian` +
`solveKeplerRad` in `coordUtils.ts`; `keplerProvider.ts` delegates.

### L7. Do not reference files or scripts that do not exist

**Context:** A comment in `satellites.ts` claimed the tabulated osculating
elements for Io / Titan / Oberon were produced by
`deriveElementsFromFixture.mjs`. That file never existed — the derivation
was done ad-hoc once in-session, never persisted.

**Rule (AGENTS.md #4):** Do not invent files, APIs, scripts, or env vars
in comments or docs. Either (a) the script exists and the comment points
at its path, (b) the derivation is inline / narrated with enough detail
that anyone could redo it from the comment alone, or (c) the comment is
silent. Never split the difference.

### L8. CLAUDE.md task-management files are literal

**Context:** CLAUDE.md states:

> 1. Plan First: Write plan to **tasks/todo.md** with checkable items
> 2. Document Results: Add review section to **tasks/todo.md**
> 3. Capture Lessons: Update **tasks/lessons.md** after corrections

I tracked everything in the ephemeral `TodoWrite` tool and never created
the files. The user had to flag it twice.

**Rule:** When a project instruction names a file path (`tasks/todo.md`,
`tasks/lessons.md`, `AGENTS.md`), create or update that exact file. The
`TodoWrite` in-memory list is complementary, not a substitute.

### L9. Element epoch must live in the same time scale the engine evaluates at

**Context:** I tagged fixture-derived satellite elements with
`epochJD = 2458849.5` — the **UT** Julian Date of 2020-01-01T00:00:00Z.
The engine evaluates at `jdTDB`, which at that instant is ≈ 2458849.50086
(offset ≈ 74.4 s, dominated by Delta-T). For slow bodies the mismatch is
invisible; for Phobos (mean motion 1128 °/day) the 74 s gap becomes a
real 0.97° angular error at the supposed epoch — enough to fail a
Phase-4 tight-tolerance regression.

**Rule:** When writing "epoch" alongside osculating elements, store the
Julian Date in the **same time scale the propagator consumes**. If the
engine takes TDB, the epoch tag is TDB. Write the conversion step
explicitly in the code comment so future readers don't confuse UT JD
("the normal one") with TDB JD. `scripts/derive-elements-from-fixtures.js`
now applies the engine's `dateToTDB` formula before emitting epochJD.

**Code marker:** comment on `EPOCH_2020_JD` in
`src/lib/orbital/analytical/satellites.ts`.

### L10. Two-body Kepler propagation has a well-defined accuracy horizon

**Context:** After fixture-deriving all 15 `*MeanElements` satellites at
2020-01-01, multi-epoch regression showed drift consistent with real
perturbations the engine does not model: Io ~70°/yr (jovian resonance +
Jupiter J2), Titan ~1°/yr (Saturn J2 + Hyperion resonance + solar), Oberon
~1.5°/yr (Uranus J2). Attempting to hold these to the Phase-4 0.5°
target for multi-epoch would require modelling the secular perturbations.

**Rule:** Accept the two-body horizon honestly. Record per-body drift
rates in `MULTI_EPOCH_OVERRIDES` (and `satellites.ts` comments) with the
physical reason for each — not as "the test is too strict" but as "this
is exactly how far two-body propagation works". When drift becomes a
real UX problem, the fix is periodic epoch refresh (re-invert from a
newer fixture) or adding the specific perturbation term, not loosening
tolerances silently.

**Code marker:** `MULTI_EPOCH_OVERRIDES` in `regression.test.ts` with
physical-reason comments.

### L11. Claude Preview HMR state accumulates across in-session edits

**Context:** During HYG density verification I edited two files in
quick succession and then asked for a screenshot of the running
preview. `preview_screenshot` timed out at 30 s. The logs showed the
client stuck at `BOOT_STAGE: BOOT` 8 % with the canvas frozen at the
default `300×150`. Console revealed **eight** accumulated vite
WebSocket clients competing for the same R3F canvas — HMR had
re-mounted the app on each edit but not torn down the previous
handlers, so subsequent frames could never advance past boot.

**Rule:** When the preview misbehaves after a burst of in-session
edits — stuck boot stage, frozen canvas, screenshot timeouts,
multiple WebSocket clients in the logs — treat it as an HMR cascade,
not an app bug. `preview_stop` followed by `preview_start` gives a
clean state; the app itself was fine. Do not spend time bisecting
runtime code when the logs already named the failure mode.

**Code marker:** no code change. Operational only.

### L12. Don't bundle two changes behind one "fix" — prove each addresses the reported cause

**Context:** Commit `fae8a7a` rolled two changes under one message
("restore HYG visual density"): a tier remap (`balanced → high`,
`high → full`) and a shader floor raise (`1.5 px → 2.5 px`,
`0.08 α → 0.20 α`). Codex review caught that the shader floor raise
was orthogonal to the reported cause: the complaint path
(`auto → balanced → medium` in default didactic mode) sees max
shader-mag ≈ 5.7, which never hit either old floor. The raise then
made things worse for the richer tiers — flattening ~80 % of `high`
and ~90 % of `full` to the same dot/alpha. Had the two changes been
separated, the second one would not have survived its own
justification round.

**Rule:** When a fix touches more than one call site or system,
write down _per change_ which observable symptom it addresses and
the quantitative evidence (thresholds, counts, ranges). If a change
cannot defend itself as the direct cause of the reported bug, drop
it or ship it separately with its own justification. "It couldn't
hurt" is not a justification — it hides an overcorrection in the
same diff as the real fix.

**Code marker:** `hygTierForQuality()` in
`src/lib/starfield.ts`; Pogson clamps in
`src/components/canvas/Starfield.tsx`. `starfield.test.ts` now
pins the tier mapping so a silent re-shuffle fails CI.

### L13. Global hard floors hide magnitude ordering; use graduated smoothstep windows

**Context:** Twice in the same session the temptation came up to
"lift the faint tail" by raising the Pogson clamps (`1.5 px → 2.5 px`,
`0.08 α → 0.20 α`). Both times a reviewer caught it: a hard floor
applied to the whole catalogue turns the tail into a uniform plate —
stars at `mag 7` and `mag 20` render at identical size and alpha,
which destroys magnitude ordering. In a 109 400-star `full` tier
where > 90 % of rows sit at `mag ≥ 6.5`, the floor becomes the entire
rendered sky and the result is an additive haze, not a starfield.

**Rule:** When a physics-informed transfer curve needs perceptual
correction, the correction should be **graduated and windowed**, not
a global clamp. Build it as a `smoothstep(edge0, peak) * (1 -
smoothstep(fade0, fade1))` kernel over the magnitude axis, added on
top of the raw curve. The window must fade back to zero before the
deep tail so telescopic stars stay ghostly. Verify the full curve is
monotonic at half a dozen sample magnitudes on paper before shipping
— ordering is cheap to check and easy to lose.

**Code marker:** `faintLift` in the Starfield vertex shader
(`src/components/canvas/Starfield.tsx`) — window 6 → 7.5 peak, fade
9.5 → 12, adding up to +1 px / +0.12 α; clamped back into the raw
`1.5 px / 0.08 α` Pogson floor outside the window.

### L14. Perceptual lifts must stay anchored to the raw physical axis, never a derived one

**Context:** When shipping the Photometric/Cinematic toggle I added a
magnitude-axis compression step (`compressedMag`) for cinematic mode,
then — thinking it was "cleaner" — routed the existing smoothstep
lift window through `compressedMag` too. Codex caught the regression
numerically: in cinematic, raw mag 12 compressed to 8.4 and hit the
lift's peak (`faintLift = 1`) while raw mag 7.5 compressed to 6.6 and
only got the ramp (`faintLift ≈ 0.352`). Result: telescopic stars
out-brightened binocular stars — exactly the "haze of faint stars
brighter than mid-faint stars" failure mode L13 was supposed to
prevent. The user's "I don't see any difference" report was this bug
manifesting as incoherent noise rather than a visible density lift.

**Rule:** Perceptual adjustments (smoothstep lifts, tone curves,
gamma bumps) must be parameterised on the **raw physical axis** that
the human reasons about, not on any internal transform of it. If a
new feature introduces a compression or remapping step, keep the
original axis around and feed downstream perceptual layers from it.
Share only what's strictly required by the physics path (Pogson flux,
in this case).

**Code marker:** `faintLift = smoothstep(6.0, 7.5, mag) * (1 -
smoothstep(9.5, 12.0, mag))` in `src/components/canvas/Starfield.tsx`
— uses raw `mag`, not `compressedMag`. Regression pinned by
`starfieldShaderMath.test.ts` "mag 7.5 strictly brighter than mag 12"
test.
