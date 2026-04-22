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

**Policy note (2026-04-18 Wave α):** the Claude Preview MCP is an
allowed tool for interactive iteration per the updated `AGENTS.md`
"Browser automation" section. The HMR-cascade caveat above still
applies — flush with `preview_stop` + `preview_start` if the canvas
gets wedged. CI-grade pixel-diff baselines still live in Playwright
specs (`e2e/*.spec.ts`), not MCP snapshots.

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

### L15. `<shaderMaterial uniforms={{...}}>` as a JSX child silently breaks per-frame uniform writes

**Context:** User reported toggling a shader-driven Settings control
did nothing visually — flipping Photometric/Cinematic produced no
observable change on the rendered sky. The UI state flipped, the
store persisted, and `materialRef.current.uniforms.styleMix.value`
read back as the expected `1`, but stars didn't change. A temporary
red-tint debug in the vertex shader (`vColor = mix(bvToRGB(ci),
vec3(1,0,0), styleMix)`) made the user see every star turn red — so
the shader WAS reading styleMix — yet the _real_ cinematic math
(sprite boost, flat alpha bump, compressed magnitude) had no visible
effect. Root cause: `<shaderMaterial uniforms={{...}}>` as a JSX
child passes a fresh uniforms object on every parent render. R3F's
applyProps calls `material.setValues({ uniforms: newObj })`, which
replaces the whole uniforms map — but the compiled WebGLProgram had
already bound its uniform locations to the ORIGINAL object's
`styleMix`, `particleSize`, etc. Per-frame writes via `useFrame`
mutated values the GPU no longer read from. Playwright pixel-diff
confirmed: 0.06 % of pixels changed when toggling (essentially
noise) with the JSX-child pattern, 0.55 % after the fix.

**Rule:** For any R3F ShaderMaterial whose uniforms are mutated per
frame, build the material explicitly via `useMemo(() => new
THREE.ShaderMaterial({...}), [deps])` and pass it as an instance
prop: `<points material={material}>`. Do NOT use
`<points><shaderMaterial uniforms={{...}}>...</shaderMaterial></points>`
as the child pattern creates a new uniforms object on every render.
The React Compiler "cannot modify" rule will flag `useFrame` writes
into the memoised material — silence it with a scoped
`/* eslint-disable react-hooks/immutability */` block since the
mutation is intentional and scoped to per-frame GPU-bound values.

**Tooling corollary:** shader-uniform regressions are easiest to
catch with a Playwright pixel-diff (canvas over time, two toggles
compared). The Claude Preview MCP can confirm the bug visually but
is less rigorous — prefer `node script.mjs` using the `playwright`
npm module directly for any gate, and keep MCP snapshots for
interactive "did this obviously change" checks.

**Code marker:** `const material = useMemo(() => new
THREE.ShaderMaterial(...), [])` in
`src/components/canvas/Starfield.tsx` (deps list is empty — the
material captures no reactive inputs at construction time; the per-
frame values flow via the mutable uniforms map inside `useFrame`).

### L16. Log compression (Fechner) beats Pogson + clamps for "realistic + dense" star rendering

**Context:** After two rounds of tuning (raising Pogson clamps, then
adding smoothstep lifts, then introducing a Photometric/Cinematic
toggle), the user's feedback was still "I don't like the result — I
want realistic + dense, like NASA Eyes". The repo already had a
reference NASA Eyes renderer (`NASAStarfield.tsx`) using a
fundamentally different curve: `brightness = 2·log(1 + flux·C)` —
a single log-compression step that maps flux to both size and alpha.

The lesson I kept missing: **Pogson magnitude is a physics convention,
not a display convention.** The eye integrates light logarithmically
(Fechner's law), which is why magnitudes are logarithmic in the first
place. So the "correct" display transform is NOT another Pogson-shaped
curve with clamps on top — it's one log step that's already the
eye-response shape, then linear scaling into screen units. No
two-stage "realistic vs cinematic" binary, no smoothstep lift, no
separate Pogson for size and Pogson for alpha.

**Rule:** When mapping a physics-derived photometric quantity to a
display, prefer a single monotonic log-compressed curve over any
stack of Pogson + clamps + perceptual lifts. Log(1 + flux·C) in
particular naturally saturates bright stars, preserves rank order
everywhere, and gives a usable value for every magnitude that a
small floor keeps visibly on screen. If the reference renderer uses
log compression (NASA Eyes, most modern space visualisers),
matching that shape is usually the shortest path to a result users
actually recognise as "realistic".

**Code marker:** `brightness = 2·log(1 + flux·250)` in
`src/components/canvas/Starfield.tsx` vertex shader; mirrored in
`src/lib/starfieldShaderMath.ts` with 15 unit tests pinning the
full curve end to end. The `250` is the apparent-mag equivalent of
NASA's absMag + inverse-square constant for a solar-system-local
observer — see L17 for the derivation and the caveat.

**Tooling corollary:** Playwright's `page.screenshot` with
R3F's continuous render loop is fragile — the "wait for stable"
heuristic often times out. For R3F visual checks, prefer short
explicit `waitForTimeout`s and skip `animations: "disabled"` (the
loop never stops). If the screenshot still hangs, fall back to
reading GL pixels via `page.evaluate` + `readPixels` on the canvas
WebGL context.

### L17. Porting a transfer curve is not enough — calibrate sprite sizes against the reference's actual pixel output

**Context:** After porting NASA Eyes' log-compression transfer curve
verbatim (`brightness = 2·log(1 + flux · C)`) I still had the user
complain that our stars looked rounder and bigger than NASA's. The
port was mathematically identical at the formula level — same
`pow(d, 5)` fragment falloff, same additive blending, same log
shape. The gap was in the **calibration constants**:

- NASA's `C` is an effective value near 250 when you collapse their
  absMag + inverse-square pipeline for a solar-system observer.
  Our port used 5000 — a ~20× higher multiplier, pushing every
  star brighter on the log curve.
- NASA's size multiplier was 4 in their code but the baseline
  brightness they feed it is also smaller. Net on-screen: sprites
  in the 1–12 px range for most stars, with only the brightest
  handful hitting the 50 px ceiling.
- Our calibration (size × 3, clamp [4, 40]) meant mag 4 stars
  rendered at ~24 px (should have been ~6 px) and mag 6 stars at
  ~16 px (should have been floor-clamped).

Production star renderers (Celestia, tiffnix's three.js write-up,
every community tutorial I found) **all use sub-3 px sprite cores**
and let the fragment falloff do the visual work. Large sprites on a
soft `pow(d, 5)` radial falloff just look fuzzy; small sprites on a
sharper `pow(d, 8-12)` falloff look crystalline.

**Rule:** When porting a visual effect, port **the numbers it
actually produces on screen**, not just the formula. If the
reference renderer is available (it was, in our own repo at
`NASAStarfield.tsx`), compute what pixel sizes and alphas it emits
for sample magnitudes, and calibrate your port until those match —
_then_ confirm the visual. "Math ported correctly" and "looks like
the reference" are two different claims.

**Full list of divergences** between the pre-3675322 HYG shader and
`nasaStarShaders.ts`, each of which had to be fixed individually:

1. Size multiplier: `brightness * 1.5` vs NASA's `brightness * 4.0`.
2. Size clamp range: `[2, 12]` vs NASA's `[5, 50]`.
3. Clamp order: mine clamped _before_ `× particleSize`; NASA clamps
   _after_. With `particleSize ≈ 0.75` that shifts the effective
   range by another factor, so the two are not interchangeable.
4. Alpha formula: fixed coefficient `0.08` vs NASA's
   `brightness * particleSize`. With `particleSize ≈ 0.75` the NASA
   alpha hits ceiling 1.0 at `brightness ≥ 1.33`, so every star
   brighter than ~mag 6 saturates.
5. Alpha floor: `0.12` vs NASA's `0.05`.
6. Fragment falloff: `pow(d, 8)` vs NASA's `pow(d, 5)`.
7. A separate `pixelRatio` uniform multiplier on top of
   `particleSize`, even though `particleSize` already bakes DPR in.

An earlier draft of this lesson only called out (3), (4), and (7).
That undercount was itself a blindside — when listing "what you
fixed", list everything, not just the structural highlights.

**Second-order lesson:** my first "calibration" pass got the
transfer-curve constant right (250) but also mistuned the size
multiplier and clamp range — guesses rather than direct ports.
Result: the sky went from "too big and round" straight to "timid
and depopulated". The honest port applies NASA's exact formula
including _where the clamp lives_, _what the alpha is proportional
to_, _the fragment exponent_, and _which DPR value feeds the
viewport scale_. Diff the two shaders line by line and port the
structure, not just the values.

**Third-order lesson on the equivalence claim:** "port of NASA" is
honest _for an observer local to the solar system_. At camera
distances ≫ 1 AU from the Sun the NASA formula's
`length(viewPosition)` varies meaningfully between stars at different
catalogue distances, while my fixed-C apparent-magnitude formula
does not. Worst-case numerical divergence I verified: ~1.75 % at
1000 AU for Proxima Centauri (1.3 pc); the error shrinks for more
distant stars and nearer cameras. Call this out in the shader doc
comment instead of claiming unqualified match.

**DPR blindside that slipped through the first honest port:** I
used `window.devicePixelRatio` in `viewportScale`, but Scene.tsx
clamps the renderer DPR via `qualityProfile.dprMax`. On a DPR-3
display with the constrained profile (dprMax 1), window DPR is 3
but the renderer draws at 1 — my sprites were sized for 3 while
the buffer only had 1, making them √3 larger than intended.
Fix: use `gl.getPixelRatio()`, which returns the clamped effective
DPR. Same fix applied to `NASAStarfield.tsx`, which had the same
bug — the reference renderer in the repo was subtly wrong too.

**Code marker:** the constants block at the top of
`src/lib/starfieldShaderMath.ts` — log scale 250, size coefficient
4, clamp `[5, 50]` px, alpha coefficient = particleSize (not a
fixed 0.08) — matches NASA's nasaStarShaders.ts exactly. DPR source
is `gl.getPixelRatio()` in both `Starfield.tsx` and
`NASAStarfield.tsx`'s `useFrame`.

## 2026-04-18 session

### L18. Simulation-time tick does not belong in the React store

**Context:** `Timeline.tsx` drove the simulation by writing
`store.datetime = new Date(prev + speed × deltaMs)` inside its own
`requestAnimationFrame` loop. That made the advancing time a Zustand
mutation at ~60 Hz, which cascaded into every subscriber:

- `Planet.tsx` (×45 instances) subscribed to `state.datetime` and
  re-rendered 60× per second, taking the `orbitPoints` useMemo with it.
- `Starfield.tsx`, `SmartSunLight.tsx`, `Timeline.tsx` itself, and the
  five hooks in `useOrbitalEngine.ts` (consumed by `Sidebar.tsx`) all
  sat on the same 60 Hz re-render cascade.
- The `orbitalEngine` cache in `engine.ts:30` (bucket ~0,864 s, TTL 1 s)
  could never hit because every frame constructed a brand-new `Date`
  and React never gave the memos a stable key to reuse.

The visible effect was fine — the orbits looked smooth — but the React
reconciliation cost scaled with the number of in-canvas components.
Two independent Codex reviews flagged this as the biggest single lever
in the project before any feature work.

**Rule:** the owner of "what time is the simulation at right now" is a
plain object/class with its own `requestAnimationFrame` loop, not the
React store. In-canvas consumers inside `useFrame` read the value
imperatively (`simulationClock.getNow()`). UI surfaces that need a
readable clock subscribe to a low-rate mirror (`displayedDatetime`,
updated at ~4 Hz + on milestones) that is written by a clock→store
bridge. The store still owns playback intent (`isPlaying`, `speed`,
`isLiveMode`); a store→clock bridge mirrors those into the clock, so
Timeline's React behavior — buttons, sliders, Live Sync — doesn't have
to change.

Two specific traps this pattern avoids:

1. **"Default state means loop is already running" is a lie.** When
   the clock's boot call is `syncFromState({ isPlaying: true, ... })`
   and the clock's default field is also `isPlaying = true`, the naive
   "only start if transitioning from false" guard never fires. The rAF
   loop never starts, the displayed clock freezes on the initial
   timestamp, and the bug is silent. Drive `startLoop`/`stopLoop`
   unconditionally from the intended state (both calls are idempotent).
   Pinned by the `syncFromState with matching isPlaying=true still
emits a UI tick (boot parity)` regression test.
2. **Removing datetime from deps is not the same as removing it from
   the subscription.** Hot consumers that still need React-level
   invalidation (e.g. `Planet.tsx`'s `orbitPoints` useMemo) should
   subscribe to the **low-rate** mirror (`displayedDatetime`), not to
   the raw simulation time. The `useFrame` math inside the same
   component then reads the clock directly for the full-rate value.
   The subscription decides "when does this component re-render"; the
   imperative read decides "what value does this frame see".

**Code marker:** `src/lib/simulationClock.ts` (class + singleton with
`getNow`, `onUiTick`, `setIsPlaying`, `syncFromState`, `advanceForTest`)
and the bridge block at the bottom of `src/store.ts`. 11 unit tests in
`src/lib/simulationClock.test.ts`.

### L19. Overlay hot-path hygiene — three compounding wins

**Context:** After L18 drained the simulation-tick re-render cascade,
profiling the overlay subsystem still showed a steady cost per frame.
Three independent items were eating CPU and triggering redundant React
work inside `OverlayPositionTracker.tsx` (and its consumer
`PlanetOverlay.tsx`):

1. **Scene traversal every frame.** `scene.getObjectByName(body.id)`
   walks the Three.js scene graph looking for a matching `.name`. For
   each of ~45 bodies × 60 FPS = 2 700 traversals per second. Planets
   mount once and stay for the session — the lookup result doesn't
   change between renders unless a body unmounts.
2. **Vector3 allocation per body per frame.** `new THREE.Vector3()` on
   line 96 (world position) and `worldPos.clone()` on line 103 (before
   `.project(camera)` which mutates in place) gave ~90 allocations per
   frame → ~5 400/s of GC pressure for values that live one iteration.
3. **Unconditional `setOverlayItems`.** Even when the pixel-quantized
   screen positions hadn't changed (camera idle, tracker smoothing
   still emitting nanometer-level drift), the Zustand setter fired and
   `PlanetOverlay` — which was ALSO subscribed via `useStore()` without
   a selector (see L19c below) — re-rendered its entire HTML subtree.

**Rules:**

- **(L19a) Cache scene-graph lookups across frames.** Module-level
  `Map<bodyId, Object3D>` populated on first hit, invalidated lazily
  when the cached entry reports `parent === null`. Same shape works
  for singular lookups (CameraController's focus mesh, populated by a
  `useEffect([focusId])`).
- **(L19b) Scratch vectors at module scope, not per-frame `new`.** One
  `TMP_WORLD` reused across bodies in the same `useFrame` tick is
  safe because React-Three-Fiber serializes frame callbacks and each
  body reads synchronously in the iteration it wrote. If the code
  wants a projected copy, prefer reusing the same vector —
  `TMP_WORLD.project(camera)` turns it into NDC in place instead of
  calling `.clone()`.
- **(L19c) Don't emit store updates when the observable output is
  unchanged.** Build a compact fingerprint (id + pixel-quantized x/y +
  visibility flags) and only call the setter when the key differs
  from the last emitted one. Cheap key generation amortizes the
  deeper React reconciliation cost, and combined with `React.memo` on
  the downstream HTML component the subtree stays quiet while the
  user hasn't moved.

**Tooling corollary:** `useStore()` with no selector subscribes the
component to EVERY store mutation. This is never what you want in a
render-heavy subtree — always pass a selector (`useStore((s) => s.x)`)
or use `useShallow`. `PlanetOverlay.tsx:5` was this exact anti-pattern
before the fix; combined with `setOverlayItems` firing every frame, it
meant the HTML overlay re-rendered at 60 Hz whenever anything in the
store moved, which was always.

**Code marker:**
`src/components/canvas/OverlayPositionTracker.tsx` — `meshCache`,
`TMP_WORLD`, `prevKeyRef`, and the pixel-quantized fingerprint loop.
`src/components/canvas/PlanetOverlay.tsx` — specific selectors +
`memo`.
`src/components/canvas/CameraController.tsx` — `focusMeshRef` +
`TMP_WORLD_POS` + `TMP_PREV_TARGET`. Verified by a DOM `MutationObserver`
on the overlay container reading zero mutations in 3 s of camera idle.

## L20 — Leva's `useControls` auto-mounts a global panel in `document.body` when no `<Leva />` is present in the tree

**2026-04-18. Discovered while landing Onda 9a (lazy-load of Leva) and
caught by the user on first reload.**

The Onda 9a refactor wrapped Leva's `<Leva />` component in
`{debugMode && <Suspense><Leva /></Suspense>}` so non-debug users
wouldn't pay the render-tree cost. The app then shipped a surprise:
the debug panel appeared on every fresh boot even though `debugMode`
defaulted to `false` and was not persisted.

**Root cause.** Leva (v0.10) is a controls library with global-store
semantics. When `useControls` / `folder` / `button` are invoked —
which `useSceneDebugControls` does unconditionally, because hooks
cannot be conditional — Leva looks up the explicit `<Leva />` anchor
in the component tree. If it can't find one, it **auto-inserts a
default `<Leva />` panel into `document.body`** so the controls have
somewhere to render. Gating the `<Leva />` JSX behind `debugMode`
removed the explicit anchor; Leva's fallback path mounted an
uncontrolled, fully-visible panel on top of the scene.

**Rule.** Any component tree that consumes `useControls` / `folder` /
`button` **must** keep `<Leva />` mounted. Visibility is controlled
via the `hidden` prop, never by gating the element with conditional
JSX.

**Tooling corollary.** Lazy-loading Leva via `React.lazy` is fine —
the library still auto-inserts its root only once, and the lazy
wrapper delays the paint, not the module registration. But when the
hook API (`useControls`) is imported statically (which it must be —
hooks need stable identity across renders), the bundler will fold
Leva into the owning chunk. There is no network-bytes saving from
lazy-loading Leva's `<Leva />` UI component under that constraint,
only render-tree savings. Do not write comments claiming otherwise.

**Code marker.** `src/components/canvas/Scene.tsx` —
`<Suspense fallback={null}><Leva hidden={!debugMode} /></Suspense>`
mounted unconditionally; `src/components/canvas/scene/useSceneDebugControls.ts`
imports `useControls, folder, button` from `"leva"` statically.

## L21 — Fixed-port harnesses must pass `--strictPort` to the dev server they assume

**2026-04-18. Caught by Codex review of Onda 9c/9b/7 batch.**

The Playwright config in `playwright.config.ts` hard-codes
`http://127.0.0.1:4174/atlas-orbital/`, but the `preview:test` npm
script in `package.json` was originally `vite preview --port 4174`
without `--strictPort`. If port 4174 is already occupied — common on
a developer machine running multiple previews — Vite auto-bumps to
4175, 4176, etc., while Playwright's `webServer` waits on (or reuses) 4174. Result: flaky failures that surface as timeouts, with no
obvious hint that the preview moved.

**Rule.** When a test harness (Playwright, curl probes, any integration
client) targets a fixed port, the spawning script MUST pass
`--strictPort` (or the framework equivalent) so the dev server fails
loudly on port conflict rather than silently relocating. The harness
config and the server script are a coupled pair; either both know
where the other is or neither does.

**Code marker.** `package.json:12` —
`"preview:test": "vite preview --host 127.0.0.1 --port 4174 --strictPort"`.
`playwright.config.ts:3` — `baseURL: "http://127.0.0.1:4174/atlas-orbital/"`

- `webServer: { command: "npm run preview:test", url: "...:4174/..." }`.

## L22 — 1:1 port claim requires a line-by-line diff gate before ship

**2026-04-22. Caught by the 19-pass audit of Phase θ shipped work.**

Phase θ shipped 4 waves (θ.1, θ.1b, θ.3, θ.4) each through the then-
current protocol: R1 source-read → implementation → self-check →
gates → runtime smoke → codex audit. Every wave was claimed as
"1:1 port of Gaia source with documented divergences." Still, a
mechanical line-by-line diff (pass P10 of the consolidation audit)
caught an **undocumented drift** in θ.4:
`src/components/canvas/scene/effects/PseudoLensFlareEffect.ts:198,202`
samples the starburst texture at `Y=0.5` while
`/tmp/gaiasky/assets/shader/postprocess/lensdirt.frag.glsl:29,30`
samples at `Y=0.0`. Two characters. Undocumented. Ship went out.
Neither codex review nor self-check nor smoke test caught it. The
diff was the first tool that actually compared line-to-line.

**Rule.** When claiming a 1:1 shader port, produce and attach (to the
PR or commit message) a diff between the Gaia source shader and the
atlas port. Every divergence must carry a one-line rationale
comment in the atlas code — category one of: (a) arch adaptation
(e.g. pmndrs Effect signature order), (b) HDR strategy
(clamp-scope or blend-mode divergence that changes the contract
with downstream effects), (c) intentional tuning (atlas-native
default with calibration rationale). **Any undocumented
divergence is a ship blocker** — either document it or remove it.

Codex or LLM-based reviewer audits are not a substitute for the
mechanical diff. They pattern-match prose; the diff compares
tokens. Both can coexist; only the diff is the gate.

**Code marker.** Ship-protocol step 4 in `tasks/STATUS.md` is
the DIFF GATE. Previous "codex audit" step 6 is subsumed.

## L23 — Subagent synthesis must be spot-checked in the main context

**2026-04-22. Caught during the 19-pass audit synthesis.**

During the audit, one subagent reading `config.yaml` + shader
snippet library reported "atlas has no log-depth buffer, Gaia's
`logdepthbuff.glsl` is used in 34 shaders — atlas should port." I
folded this into the user-facing synthesis as a structural gap.
A subsequent pass (specifically looking at atlas's WebGLRenderer
config) found
`src/components/canvas/Scene.tsx:261: glConfig = { ..., logarithmicDepthBuffer: true }`.
Atlas had had the flag on all along — Three.js handles log-depth
via the native renderer option, not via the Gaia-style
`#include <logdepthbuff.glsl>` pattern. The synthesis went out
wrong and had to be publicly corrected in the next turn.

**Rule.** When a subagent makes a claim about atlas
_capabilities_ (has / doesn't have X), spot-check it in main
context with a direct `Read` or `Grep` before consolidating into
user-facing synthesis. The agent synthesizes what it found; it
doesn't know what it missed. Critical-path check for any
"feature absent in atlas" claim: 30 seconds of grep in the main
context is cheap compared to the cost of the user correcting
your synthesis and losing trust. The inverse ("feature present")
needs less scrutiny — you can't grep for something that isn't
there, so false positives are rare.

**Tooling corollary.** When dispatching research agents, tell
them to cite `file:line` for every claim. It makes the
verification spot-check trivial: open the cited path and
confirm the line. Claims without citations should not be folded
into synthesis at all.

## L24 — Contradictions between audit passes are signal, not noise

**2026-04-22. Caught during the 19-pass audit consolidation.**

Pass C (config.yaml inventory) claimed "no log-depth in atlas."
Pass P8 (depth-buffer verdict) found
`logarithmicDepthBuffer: true` in `Scene.tsx:261`. Both passes
read the same codebase. The temptation when consolidating was
to pick the more detailed one, average, or defer; the correct
response was to investigate. When I spot-checked (L23's rule),
P8 was right — Pass C had looked only at Gaia `config.yaml`
and inferred absence in atlas by pattern, not by direct grep.

**Rule.** When two audit passes, reviewers, or tools produce
contradicting facts about the same code, treat it as a
high-priority signal to re-verify — don't average them, don't
pick the more confident one, don't defer to "we'll sort it later."
The contradiction IS evidence that at least one source is wrong,
and downstream work cannot safely build on either until you have
ground truth. Budget 5 min to spot-check the disagreement before
moving on.

**Process corollary.** When dispatching multiple passes over
overlapping surface area, structure prompts so contradictions
are easy to detect. Mandate `file:line` citations; require
"not found" as explicit output when a search returns empty;
align each pass's output to a consistent table schema so
diffing pass outputs is mechanical. Loose prose summaries
hide contradictions.

## L25 — ROADMAP items can be stale; R1 BOTH Gaia source AND current atlas state

**2026-04-22. Caught during T1.3 iteration.**

Ship-protocol step 2 says "Read `tasks/ROADMAP.md` for that item's
Gaia source citation and effort" and step 3 says "R1 source-read:
open the cited Gaia source and quote the relevant lines back."
Both steps treated the ROADMAP claim about atlas-side state
(`LightGlowEffect.ts:45-46` hardcodes `fovFactor=1.0`; halo size
constant across zooms) as ground truth. It wasn't. The live atlas
code in `src/components/canvas/scene/LightGlowInjector.tsx:141-186`
already drives
`effect.setSpiralScale(LIGHT_GLOW_DEFAULT_SPIRAL_SCALE / fovFactor)`
per frame via `computeFovFactor(camera.fov)` from
`src/lib/lightRegistry.ts:78-82` — a byte-identical mirror of
`AbstractCamera.java:148`. The entire T1.3 "fix" had already
shipped in `a27dc42` (the original θ.3 feature commit). Only
luck made the discovery cheap: I loaded the injector file as
part of R1, noticed the per-frame driver, and bailed before
writing code. If I had trusted ROADMAP and jumped straight to
implementing `u_fovFactor`, I'd have duplicated the driver, broken
the pinned `lightRegistry.test.ts` assertions, and had to roll
back. How the audit went wrong: P10 looked at the `LightGlowEffect.ts:45-46`
docstring on `LIGHT_GLOW_DEFAULT_SPIRAL_SCALE` — the default base
constant — which correctly states it assumes `fovFactor=1.0`, and
read it as "runtime hardcodes fovFactor=1.0". The runtime sits in
the injector, one layer up, and divides by the live fovFactor
before setting it on the effect. The constant and the runtime
value are not the same thing.

**Rule.** R1 source-read is **two reads, not one**: (a) the cited
Gaia source, AND (b) the current atlas implementation of the
alleged drift. Before writing any code, verify the atlas side of
the ROADMAP claim is still accurate — grep `git log` on the cited
atlas file to check for fixes that landed after the audit was
written; open the full per-frame driver chain (React effect →
`useFrame` → uniform setters), not just the `Effect` subclass
constructor. A ROADMAP "Atlas: hardcodes X" line is a SNAPSHOT of
atlas state at the moment the audit ran. Later commits may have
shipped the fix — the ROADMAP is not auto-synced to the repo.

**Process corollary.** When the cited atlas file has had commits
since the audit note was written, treat that as a **high-priority
check** and read the whole driver chain, not just the docstring
or the immediate accessor. L23 is the inverse (spot-check subagent
synthesis); this is: spot-check the task list itself before acting
on it. If the check reveals the fix already shipped, ship a
doc-only correction (STATUS.md + ROADMAP.md marked SHIPPED with
commit SHA + a line explaining how the audit went wrong) and add
a lesson — don't silently move on, the stale entry will trip the
next agent.

**Code marker.** T1.3 — `LightGlowInjector.tsx:141-186` +
`lightRegistry.ts:78-82` + `lightRegistry.test.ts:107-114`, all
shipped in `a27dc42`. ROADMAP §T1.3 claimed "unfixed"; was
corrected 2026-04-22.

## L26 — Runtime smoke for visual shaders needs temporal observation, not a screenshot

**2026-04-22. Caught during θ.5b runtime smoke (commit `56d0e38`, reverted `422d794`).**

The ship protocol's step 8 is "Runtime smoke: Claude Preview MCP —
confirm no shader compile errors and scene renders (not black)."
I satisfied this mechanically: opened the preview, read console
logs (clean), took one screenshot (Earth visible with atmosphere),
declared PASS. Shipped the commit. User watching live immediately
reported: **"a tela está piscando e fica preta de vez em quando"**
(screen flickers and goes black sometimes). Corrective message was
blunt: **"vc nao vai conseguir captar os flickerings e a tela preta
vendo screenshots"** — you won't catch flickers via screenshots.

Root cause of the flicker: my shader produced near-saturated output
with hardcoded defaults (integrator math computed `v3FrontColor`
≈10⁴-10⁵ per sample → post-tonemap ≈vec3(1.0)). Stacked with
existing cloud-layer (also `AdditiveBlending` + `depthWrite:false`

- `transparent:true`), Three's per-frame transparent-sort flipped
  the two layers, producing visible flicker. None of this surfaces
  in a single-instant screenshot because flicker is **temporal** —
  two consecutive frames can each be rendered fine individually but
  differ by enough to read as a blink.

**Rule.** "Runtime smoke" for a shader that affects pixels in the
main render path is NOT complete until behavior is observed **over
time with all sibling layers active**. Acceptable completions:

1. User-watched live confirmation — the human is the authoritative
   oracle for flicker. After shipping a preview build, explicitly
   ask "does it flicker or blank at any moment?" before marking
   smoke passed.
2. Multi-frame numeric invariant — via `preview_eval`, install a
   `requestAnimationFrame` loop that samples `canvas.getContext('2d')`
   or uses the GL `readPixels` at a fixed coordinate across ≥30
   frames (~0.5s at 60fps); a static scene should have ≤1-step
   variance. Report max pairwise pixel-delta; flag anything >5
   units per channel as a flicker signal.
3. Playwright video capture (`video: 'on'` in playwright config)
   for regressions that need to persist in CI.

A single screenshot proves COMPILE + STATIC-DRAW. It does NOT prove
stability. "No console errors" is not sufficient either — flicker
from transparent-sort flips or NaN in some fragments can occur with
a 100% clean console.

**Process corollary.** When the onda changes a shader that layers
additively with other transparent meshes (clouds, lens flares,
atmosphere shells, glows), explicitly enumerate the sibling layers
in the ship-protocol checklist and include a specific "does not
flicker against <sibling>" assertion in step 8. `tasks/STATUS.md`
should track these sibling relationships per body (Earth: planet +
clouds + atmosphere + ring-shadow; etc.).

**Code marker.** Ship-protocol step 8 in `tasks/STATUS.md` kickoff
prompt. θ.5b was the discovery case — reverted in `422d794`.

## L27 — DIFF GATE + SUBAGENT VERIFY must read numeric sources end-to-end; don't validate against claimed values

**2026-04-22. Caught during θ.5d R1 re-read of
`AtmosphereComponent.java`.**

θ.5b+c (`bc0a429`) shipped with three numerical drifts vs Gaia:

| Uniform           | θ.5b+c value      | Gaia source                                       | Gap                                                                                                             |
| ----------------- | ----------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `fG`              | −0.85 (backward)  | `AtmosphereComponent.java:112`: +0.76             | Sign flip. Changed the phase function from backward- to forward-scattering — a visually significant difference. |
| `nSamples`        | 5                 | `AtmosphereComponent.java:56`: 23                 | Under-sampled integrator (my "perf budget" excuse); visually coarser.                                           |
| (implicit) `eSun` | 20 → fKrESun=0.05 | `AtmosphereComponent.java:55`: 10 → fKrESun=0.025 | Sun brightness doubled — atmosphere twice as intense as Gaia.                                                   |

All three passed **three verification layers**: self-DIFF GATE,
independent SUBAGENT VERIFY (with explicit `file:line` citation
protocol), AND user live-watch. None caught the drifts. Why?

The DIFF GATE prompts I wrote — and the subagent prompts I
dispatched — both framed the verification as "confirm the atlas
shader matches Gaia's GLSL source". That scope is correct but
INCOMPLETE: the atmosphere's numeric constants don't live in the
GLSL file. They live in the **Java wrapper** (`AtmosphereComponent.java`)
that writes uniforms per-body. The snippet GLSL just says
`uniform float fG;` — no value. The value comes from Java.

My θ.5b+c verification prompts read the `.glsl` files and checked
that atlas's shader template is a byte-match. They didn't point
subagents at the Java file where the default values are set. So
my "Earth defaults" — fabricated from memory of the Nishita paper —
sailed through every gate because no one was comparing them to
Gaia's actual defaults.

User live-watch also missed it: the atmosphere rendered a plausible
blue haze. Without a side-by-side against Gaia's rendering of the
same scene, "looks like an atmosphere" = "ships". The fidelity gap
was invisible to human eye on a single planet.

**Rule.** For any shader port whose runtime behavior depends on
uniforms set by host-side (Java) code:

1. **DIFF GATE scope includes the host-side code**, not just the
   shader. Read `setFooUniform()` / `setUp...Material()` / the
   equivalent Java method that pushes values to the GPU. List
   every uniform with its Gaia value.
2. **SUBAGENT VERIFY prompt must cite the host-side file**. Write
   the prompt so the agent has to open the Java file and verify
   default constants. Don't let "just diff the .glsl" hide the
   numeric gap.
3. **Constants with known Gaia defaults must cite a specific
   `java:line`**. If a value came from "a Nishita paper default"
   or "common Earth value", that's an invention until verified.
   Under the Gaia-fidelity rule, invented defaults lose to
   Gaia-source defaults — even if visually plausible.

**Process corollary.** The three verification layers (DIFF GATE,
SUBAGENT VERIFY, MATH TESTS) protect against different failure
modes — but they only catch drifts **inside the scope of what they
read**. If a drift lives outside that scope (host-side defaults,
config files, data bundles), no number of re-audits within the
scope will find it. Expanding scope is the only remedy.

**Code marker.** θ.5d `f64411e` fixes the three drifts and adds
six `GAIA_DEFAULT_*` constants in
`src/components/canvas/shaders/atmosphereShader.ts` with
`AtmosphereComponent.java:LINE` citations for every default. Future
DIFF GATE prompts for atmosphere should cite **both** the snippet
GLSL and the Java wrapper.

## L28 — `depthTest: false` on HDR sprites silently breaks occlusion AND fools post-FX

**2026-04-22. Caught by user report of two simultaneous visual
bugs on Earth close-up.**

User observed two independent artefacts:

1. Lens-flare ghosts emanating from the Sun _through_ Earth's
   silhouette when the Sun was supposed to be occluded by the
   planet.
2. Rainbow chromatic-aberration fringes on the prograde direction
   vector, as if the vector were a point light source.

Both bugs shared a single architectural hazard: HDR-bright sprites
that bypass either depth testing or tone mapping silently contaminate
the HDR buffer, and any post-effect that samples that buffer
(bloom, lens flare, light glow spiral search) will treat those
pixels as legitimate bright sources.

**Bug 1 — `depthTest={false}`.**
`src/components/canvas/planet/SunScreenFlare.tsx` rendered three
Sun sprites (`core`, `halo`, `rays`) with
`depthTest={false} + renderOrder={5000..5003} + AdditiveBlending +
toneMapped={false}`. The `depthTest={false}` meant Earth's closer
opaque depth could not cull the Sun's sprite fragments — the Sun
always drew over the planet's night side. PseudoLensFlare's bias
filter (Gaia-parity `−0.98`) then saw bright HDR values at the Sun's
projected position and correctly generated ghost trails, but the
input premise was false: the Sun should have been occluded.

**Bug 2 — `toneMapped={false}`.**
`src/components/canvas/planet/PlanetMotionOverlays.tsx` rendered the
prograde arrow with `toneMapped={false}`. That flag bypasses atlas's
AgX tone-map step, so the arrow's sRGB color goes into the HDR
HalfFloat RT verbatim. With `AdditiveBlending` on the halo mesh
stacking onto the main mesh, the arrow could exceed the PseudoLensFlare
bias threshold and the Bloom threshold, and get treated as a point
light — the rainbow CA fringes in the user's screenshot.

**Rule.** For any sprite / mesh / particle rendered into the HDR
pipeline:

1. **Default to `depthTest: true`.** If physical optics would
   occlude the sprite behind scene geometry, so must the render.
   `depthTest: false` is reserved for UI overlays that have been
   explicitly extracted from the HDR pipeline.
2. **Default to `toneMapped: true`** for any material whose color
   comes from a regular palette. `toneMapped: false` is for genuinely
   HDR-bright emissive surfaces (sun cores, star billboards) that
   legitimately exceed the [0, 1] range and want the full AgX/ACES
   compression to happen later in the pipeline.
3. **If you must set `depthTest: false` (legit UI overlay) OR
   `toneMapped: false` (legit emissive source)**, the material MUST
   be registered in a render pass that the HDR-reading post-effects
   skip. Atlas has no such pass today; adding one would be the
   principled fix. Until then, every `depthTest: false / toneMapped:
false` in the scene graph is an implicit contract with every
   downstream post-FX: "please treat me as a light source."

**Process corollary.** When auditing lens-flare / bloom / LightGlow
divergence from Gaia, the audit must include a grep for
`depthTest` and `toneMapped` on every scene material, not just
shader-level inspection of the post-effect. The HDR contract crosses
the mesh / post-FX boundary and a single `toneMapped: false` on an
unrelated mesh can ruin an otherwise-correct flare port.

**Code marker.** Fix `1d6cc30` flipped
`SunScreenFlare.tsx:242,254,266` to `depthTest={true}` and
`PlanetMotionOverlays.tsx:30,43` to `toneMapped={true}`. Atlas
convention for HDR sprites now aligned with `ProceduralSun3D.tsx:419,445,475`.

## L29 — Cross-AI review catches framing blind spots the 3-layer protocol misses

\*\*2026-04-22. Caught when an external AI review of Phase θ surfaced
a `SunScreenFlare` + `PseudoLensFlareEffect` stacking that DIFF GATE

- SUBAGENT VERIFY + MATH TESTS had all let through.\*\*

After θ.4 (pseudo-lens-flare post-process port, `db407dc` + `4cc35cb`)
shipped and passed all three verification layers, a user-requested
external-AI review (cold — no conversation context, given only repo
URL + commit SHAs) surfaced that atlas still renders two lens-flare
systems on top of each other for the Sun:

1. `src/components/canvas/planet/SunScreenFlare.tsx` — 3 sprite
   meshes (core / halo / rays) with `AdditiveBlending`, mounted for
   `body.type === "star"` in `Planet.tsx:839-845`. Pre-θ.4
   atlas-native implementation.
2. `src/components/canvas/scene/effects/PseudoLensFlareEffect.ts` —
   the θ.4 post-process port, mounted at
   `PostProcessingPipeline.tsx:130` via `<LensFlareSlot />`.

Both draw on the Sun simultaneously. This violates the
`feedback_no_effect_stacking.md` memory rule (Replace, don't stack).
The θ.4 ship should have deleted `SunScreenFlare` as the final step
of the port — that cleanup was missed.

**Why the 3-layer verification protocol didn't catch it**:

- **DIFF GATE** scope is "does the port match Gaia GLSL
  line-by-line?" It did. Nothing about the port itself drifted.
- **SUBAGENT VERIFY** inherits the DIFF GATE scope — the prompt
  framed verification as "compare atlas shader X to Gaia shader Y".
  The subagent never examined `Planet.tsx` to see what other meshes
  coexisted at the Sun's position.
- **MATH TESTS** pin shader numeric behavior in isolation. Stacking
  between object-space meshes and post-process effects is outside
  any unit-test scope.

The cross-AI review asked a different question: "what shaders does
Gaia use, and does atlas replicate them?" That framing implicitly
widened scope from "single-shader port" to "lens-flare architecture"
and surfaced the stacking immediately.

**Rule.** When porting a Gaia Sky effect with a pre-existing
atlas-native equivalent, the ship-protocol checklist MUST include
an explicit **PREDECESSOR SWEEP** step before DIFF GATE — grep for
the atlas-native predecessor (sprite-based flare, procedural shader,
manual implementation); delete it in the same commit as the port,
or document in the commit message why it stays. Added as step 5 of
the kickoff prompt in `STATUS.md` and to the "Ship protocol
(enforced)" section.

**Process corollary — cross-AI review is a qualitatively distinct
verification layer.** Dispatching a cold external agent with only
the repo URL + commit SHAs (no conversation context, no in-session
priming) answers a qualitatively different question from DIFF GATE

- SUBAGENT VERIFY. DIFF GATE / SUBAGENT VERIFY answer "does the
  port match source?" Cross-AI review answers "is the port the right
  thing to have in the first place?" Schedule cross-AI review at
  phase boundaries (end of θ, end of Tier 2, etc.), not per-onda.

**Be critical of cross-AI review output too.** External AIs
hallucinate. The review that surfaced this stacking ALSO contained
a Part 2 that falsely claimed atlas had NONE of the post-process
pipeline implemented — corrected only in Part 3 after the reviewer
actually read `PseudoLensFlareEffect.ts`. Apply the same
`file:line` verification standard to external reviews as to
internal subagents (L23). Contradictions between review sections
are signal, not noise (L24).

**Also verify user-asserted facts before scoping.** During this
same pivot, user recalled a ~285MB Gaia data pack containing the
lens PNGs. WebFetch of `gaiasky.space/resources/datasets/` showed
the actual packs are `default-data` (73 MiB, no lens assets) and
`hi-res-textures` (248 MiB, planet surfaces only) — neither
includes the PNGs. Had I scoped T2.3 around "vendor the 285MB
pack" without verifying, the onda would have stalled at asset
download time. Apply L23's spot-check rule to **every** external
claim that scopes work — user memory included.

**Code marker**: T2.0 in `tasks/ROADMAP.md` (new onda removes the
stacking). Kickoff prompt gains step 5 PREDECESSOR SWEEP in
`STATUS.md`.
