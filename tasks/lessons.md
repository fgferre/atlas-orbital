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
