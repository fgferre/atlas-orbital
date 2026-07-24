# Grid / Coordinate-System Redesign — Plan (2026-06-17)

> Lead-engineer plan. Verdict: **Approach A — Minimal-Elegant (one
> ecliptic floor + adaptive decade label)**, with the **fix-vs-rewrite
> framing grafted from Approach C** (the surgical patch is Day 1 and is
> independently shippable; the drei-fork is the AAA upgrade layered on
> top, with a documented fallback). All file paths, LOC, store flags,
> and the scale-lock mechanism below were verified against the live
> tree on 2026-06-17 (drei 10.7.7 confirmed installed; grid subsystem =
> 1,552 source LOC across 8 files + 5 test files).

---

## 0. Decisions locked (owner, 2026-06-17)

These OVERRIDE the "default recommendation" wording later in this doc
(Sections 8, 10 task 7, 11):

1. **Projection callout — KEEP as an on-demand focus affordance** (NOT
   deleted). Rebuild as a single clean drop-line shown only while a body
   is focused — reproducing the Solar System Scope drop-line the owner
   likes. **Verified live 2026-06-17 (GPU backbuffer + geometry readback):**
   the current `GridProjectionLines` DOES render and tracks the focused
   body exactly (with Jupiter focused, geometry read
   `[0,-0.15,0, -521.06,-0.15,-812.63, -521.06,8.28,-812.63]` = Jupiter's
   live world position; it is correctly positioned in didactic mode, NOT
   misaligned). It is _effectively invisible in practice_ for three reasons
   the rebuild MUST fix: (a) its color is byte-identical to the ecliptic
   grid green `[0.059,0.616,0.345]` → camouflaged on the plane; (b) the
   near-body leg drowns in the planet's halo/glow (zero green pixels there);
   (c) the camera frames tight on the focused body, so the long salient
   horizontal leg trails off toward the off-screen Sun. Therefore the
   rebuilt drop-line: uses the DISTINCT teal accent (NEVER the grid color),
   EMPHASIZES the vertical height-above-plane leg at the body, renders
   legibly OVER the body glow (render order / brightness / slight offset),
   and flows through the unified `auToWorld` so it stays aligned in both
   scale modes. The old standing layer (`GridProjectionLines.tsx` +
   `gridProjection.ts` + the standing flag) is removed; a small focus-only
   affordance replaces it.
2. **Equatorial/galactic frames — DELETE now** (one-quaternion re-entry
   path documented).
3. **Soft teal extent disk — SHIP in v1** (tier-gated ultra/high/balanced).

**STATUS — Day-1 + the square-grid rework DONE (Day-1 committed `a5a4a88`,
2026-06-17; the rework is in the working tree for human visual review,
2026-06-18).**

**Day-1 (committed `a5a4a88`):** Task 1 shipped — `AstroPhysics.auToWorld`
/ `worldToAu` added (the single AU↔world authority). KEEP — correct.

**Rework (uncommitted, 2026-06-18) — supersedes the old ring approach.**
An independent Codex audit found the first square-grid pass (the
recursive-ring `getGridRecAuLockedScaling` mechanism described in earlier
revisions of this status block and in Section 5) NOT READY, for reasons
that are now FIXED. The owner-locked model is a **square Cartesian floor
used as a SPATIAL SCAFFOLD** (SSS look) with the **decade LABEL as the
scale ruler** (a map scale-bar). Planets sit on their ORBITS, not on grid
lines — we do NOT claim "each cell = 1 AU". Concretely the rework:

- **Replaced the recursive ring shader + the `dist=2` ring math** with
  drei `<Grid infiniteGrid followCamera>` (a two-tier white square floor).
  The old `getGridRecAuLockedScaling` / `baseRingRadius=200` ring-radius
  pinning is GONE — there are no rings; a square grid has no radial lock,
  so "a body at `10^decade` AU lands on a section line" was geometrically
  false (it holds only on-axis) and has been dropped along with the test
  that masked it by sampling only axis-aligned camera positions.
- **Drives the decade from VIEW SCALE, not heliocentric distance.**
  `camera.position.length()` barely moves while dollying around a focused
  body far from the Sun, so the grid never refined on zoom. The driver is
  now the on-screen view extent
  `2·camToTargetDist·tan(fov/2)` (camera → OrbitControls look-at target),
  inverted through `worldToAu` to pick the decade
  (`floor(log10(viewAU / TARGET_SECTIONS_ACROSS))`). The grid REFINES as
  the learner zooms into whatever they are looking at, and reduces to
  heliocentric framing when the target is the Sun.
- **Keeps the scaffold-spacing identity** `sectionSize =
auToWorld(10^decade, scaleMode)` — the ONLY spacing claim — so the floor
  compresses identically to the bodies in didactic mode (one pipeline, no
  drift) WITHOUT claiming any body sits on a line.
- Cross-fades spacing across decade boundaries (no 10× pop), injects
  three.js `logdepthbuf_*` chunks into drei's custom `GridMaterial` (so
  planets/orbits occlude the floor under `logarithmicDepthBuffer`), sizes
  the plane (`args=[2,2]`) so the radial fade reaches zero before the
  geometric edge, suppresses unreachable LY units in didactic mode, and
  shares ONE per-frame decade computation between grid + label.

Full suite green (98 files / 1743 tests); `tsc` clean; `docs:check`
clean. **Section 5 below describes the SUPERSEDED surgical-ring approach
and is retained only as historical context** — the shipped mechanism is
the view-scale square scaffold summarised here, NOT the `auToWorld(camDist)`
scalar feed into a ring walk. Deferred (NOT in this rework): the
on-demand teal focus drop-line (task 7), body-label unification + leader
lines (task 8), deeper tier-gating (task 9).

---

## 1. Problem statement (owner words + the real root cause)

The owner raised four complaints about the current grid subsystem:

1. **"Why do we need 3 systems?"** — too complex / visually confusing.
   Today there are three switchable coordinate frames (ecliptic /
   equatorial / galactic) on ONE recursive mesh, PLUS a projection-line
   layer, PLUS an AU-ruler label layer — four user-facing concepts.
2. **"It does not stay aligned with the planets when you zoom"** — grid
   and bodies visibly drift apart. This is a real bug (see root cause).
3. **"The measurement labels look ugly; no unified visual language."**
4. **"Labels are misaligned and balloon to enormous size when the
   camera is close; no intelligence in sizing or placement."**

**The real root cause of #2 (verified with file:line):**

- In didactic scale mode, planet positions are log-compressed through
  `AstroPhysics.mapDidacticHeliocentricDistance()`
  (`src/lib/astrophysics.ts:370-401`; a Hermite-near-origin + log-anchor
  curve over the 11 anchors at `astrophysics.ts:25-37`: `1 AU → 440`,
  `5.2 AU → 960`, `80 AU → 2350`, hard-capped at `3200`). The body
  positioner calls it at `astrophysics.ts:439-451`.
- The grid mesh instead reads **raw uncompressed world distance**:
  `GridRecursive.tsx:99` does `const dist = camera.position.length();`
  and feeds it straight into `getGridRecScaling(dist)`
  (`GridRecursive.tsx:105`). That function
  (`shaders/gridRecScaling.ts:72-90`) is **scale-INVARIANT by design** —
  its own JSDoc (`gridRecScaling.ts:18-29`) states the decade walk emits
  normalized ratios, so the unit choice "doesn't affect the output."
- **Consequence:** the grid's visual frequency derives from a different
  pipeline than the planets. They coincide only in realistic mode (both
  linear: `au × AU_TO_3D_UNITS`, `AU_TO_3D_UNITS = 1000`,
  `astrophysics.ts:4`). In didactic mode they drift apart under zoom.

**The root cause of #4 (verified):** `GridAuLabels.tsx:73` sets
`LABEL_FONT_SIZE = 180` in **world units**. World-unit text grows
without bound on screen as the camera approaches — that constant _is_
the ballooning bug. (`PlanetLabels3D.tsx:181-199` documents this exact
failure class and already solves it with screen-stable scaling — our
reuse target.)

**Note on the half-fix already in tree:** `GridAuLabels.tsx:129-135`
was patched on 2026-06-17 to position its ticks through
`mapDidacticHeliocentricDistance(au)` — proving the correct transform.
But that fixed only the _label positions_; the grid **mesh** at
`GridRecursive.tsx:99` still scales from raw camera distance, so mesh
and bodies still drift in didactic mode. The asymmetry is the bug.

---

## 2. Current-state inventory (files, LOC, store flags, the bug)

| File                                              | LOC       | Role                                                                                                                                          |
| ------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/canvas/GridRecursive.tsx`         | 149       | Grid mesh component; `useFrame` at :96-127 reads raw camera distance (:99) — **bug origin**                                                   |
| `src/components/canvas/shaders/gridRecScaling.ts` | 90        | Scale-invariant decade walk (`-25..25`); consumes uncompressed distance                                                                       |
| `src/components/canvas/shaders/gridRecShader.ts`  | 394       | Verbatim Gaia `gridrec.fragment.glsl` port (recursive ring shader)                                                                            |
| `src/components/canvas/shaders/gridRecMath.ts`    | 199       | Recursive-walk math helpers; consumed only by the gridrec shader path                                                                         |
| `src/components/canvas/GridAuLabels.tsx`          | 182       | 14 AU ticks (7 values × 2 axes) at `LABEL_FONT_SIZE=180` world units — **balloon bug** (:73)                                                  |
| `src/components/canvas/GridProjectionLines.tsx`   | 177       | L-shaped focus→plane callout; focus-gated (:126-131); world-space (unaffected by scaleMode)                                                   |
| `src/lib/gridProjection.ts`                       | 202       | Gaia camera-relative projection helpers (pinned, currently unused by the world-space β path)                                                  |
| `src/lib/gridOrientation.ts`                      | 159       | Orientation quaternions + `GRID_ORIENTATION_COLORS` + ecliptic/equatorial/galactic matrices                                                   |
| **Total source**                                  | **1,552** | + 5 test files: `GridRecursive.test.ts`, `gridRecScaling.test.ts`, `gridRecMath.test.ts`, `gridOrientation.test.ts`, `gridProjection.test.ts` |

**Store flags** (`src/store.ts`):

- `showEclipticGrid: boolean` (default `true`, :72 / :270; toggle :379)
- `gridOrientation: GridOrientation` (default `"ecliptic"`, :83 / :271;
  setter `setGridOrientation` :174 / :380)
- `gridProjectionLines: boolean` (default `true`, :94 / :272; toggle
  `toggleGridProjectionLines` :175 / :381-382)
- `showLabels: boolean` (global body-label flag, :48 / :265; toggle
  :371) — currently also gates the AU ruler (`GridAuLabels.tsx:87,113,121`)
- `scaleMode: "didactic" | "realistic"` (:107 / :275; default
  `"didactic"`) — **read in `GridAuLabels` (:89) but NOT in
  `GridRecursive`.** That asymmetry is the scale-lock bug.

**LayersPanel** (`src/components/ui/LayersPanel.tsx:299-327`): a master
"Coordinate Grid" toggle, then a nested block exposing a 3-way "Grid
Orientation" radio (:306-320) and a "Projection Lines" toggle (:321-325).

**Consumer-safety check (Grep-verified):** `gridOrientation.ts`,
`gridProjection.ts`, `gridRecScaling.ts`, `gridRecMath.ts`,
`gridRecShader.ts` are imported **only** by the grid subsystem files
and their tests — no constellation/starfield/other feature consumes the
orientation matrices or projection helpers. Deletion is safe.

**Engine substrate (confirmed):** `Scene.tsx:421` sets
`logarithmicDepthBuffer: true`. Keep it — it is the substrate that makes
single-scene planet→outer-system zoom survive 32-bit float precision and
lets bodies/orbits occlude the floor. `qualityProfile.ts` exposes tiers
`ultra / high / balanced / constrained` (:3-6, :80-84) — the tier-gating
hook for grid LOD richness.

---

## 3. Market research — condensed

| Reference                                                                               | Frames model                                                                            | Scale-zoom handling                                                                                                                                               | The one takeaway worth stealing                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **NASA Eyes on the Solar System**                                                       | **ZERO** coordinate grids — orbit ellipses ARE the scaffold                             | One true-coordinate scene, no dual pipeline → lock by construction; scale via camera-framing presets                                                              | Measurement NUMBERS live in a screen-space HUD, never painted as world-scaled 3D text; labels are constant-screen-size, distant ones DIM (priority declutter)                              |
| **Solar System Scope** _(owner north-star)_                                             | **ONE** ecliptic floor; frame switch demoted to an advanced sky-mode submenu            | Grid + scale label both derive from ONE quantity (the current decade) → structurally cannot drift; unit auto-advances 10→100→1000 AU→10 LY                        | TWO label classes: ONE flat-on-plane teal decade label that scales WITH the grid + small constant-size light-blue billboarded body labels; one teal accent, soft glow not heavy stroke     |
| **Stellarium + Celestia**                                                               | Many frames, but default OFF; one frame = one orientation quaternion over a unit sphere | Line spacing snapped to a "nice number" table from FOV (constant on-screen density), never raw distance                                                           | Labels are constant-pixel 2D text at the line∩viewport-edge intersection; declutter by culling oblique/back-hemisphere labels; precision tracks the step                                   |
| **Gaia Sky** _(what atlas ported)_                                                      | FOUR grid objects; the 3 frames are a whole-sky-survey feature for mission astronomers  | Recursive `-25..25` decade walk for scale-invariance across ~50 orders of magnitude — overkill for a ~3-decade solar system                                       | The 3 frames answer a question a solar-system learner never asks → dropping them is the #1 complexity win at zero educational cost; bound the decade walk                                  |
| **Pro 3D/CAD (Blender, Unreal, Google Earth, AutoCAD) + canonical WebGL infinite-grid** | Exactly ONE plane; alternate frames = exclusive mode toggle, never a stack              | Infinite-grid shader: ray-plane intersection derives worldPos from the SAME camera matrices as content → alignment automatic; decade LOD via `floor/fract(log10)` | The Google-Earth scale-bar law: the LABEL is constant on-screen size, only its NUMBER/UNIT changes, tied to the zoom DECADE not to object proximity — exactly atlas's missing intelligence |

**Convergence (5/5):** one default frame; alignment is structural (one
pipeline), not maintained; measurement labels are constant-screen-size
and tied to the grid decade. High-confidence, not a judgment call.

---

## 4. Recommended approach + rationale

**RECOMMENDED: Approach A — Minimal-Elegant**, sequenced with Approach
C's fix-first discipline.

- **One ecliptic floor grid**, on by default, rendered by a forked drei
  `<Grid infiniteGrid>` material whose decade stepping and every feature
  radius are driven through ONE shared `auToWorld(au, scaleMode)`
  transform — the same transform the bodies and labels use.
- **One flat-on-plane adaptive decade scale label** (teal, wide-tracked
  uppercase, `"10 AU" → "100 AU" → … → "10 LY"`), tied to the grid
  decade, replacing all 14 AU ticks.
- **Body labels** reuse `PlanetLabels3D`'s screen-stable, decluttered,
  billboarded pattern; restyle to the unified palette.
- **Equatorial + galactic frames DELETED now** (recoverable later as one
  swappable orientation quaternion behind an advanced disclosure, per
  Celestia's model — documented, not shipped).

**Why A over B (Balanced-Clean):** B keeps the equatorial/galactic math
behind an "Advanced" disclosure. That is defensible (the math is tested
and cheap) but it preserves surface area the owner explicitly called
confusing, for a capability no solar-system learner asks for, and it
leaves dead-but-maintained code. The research is high-confidence that
the frames are noise here. We take B's _one genuinely better idea_ — its
crisp `auToWorld` extraction + the explicit Playwright zoom-sweep gate —
into A. The equatorial/galactic re-entry path is documented (Section 11

- Section 6) so B's "keep it just in case" is satisfied at zero runtime
  cost.

**Why A over C (Lock-and-Collapse):** C's headline insight — that the
recursive UV-ring primitive draws decade-normalized rings with _no
defined world-AU radius_, so a scalar camera-distance inversion can
never lock (drift measured 2.27× at 1 AU rising to 20.75× at 40 AU) — is
**correct and load-bearing**, and we adopt it as the justification for
replacing the primitive rather than patching it. But C then proposes, in
didactic mode, to drop the continuous floor for a set of discrete
concentric AU **ring markers**. That is a visual departure from the SSS
north-star's _continuous_ floor and adds a second grid representation
(rings vs. floor) — the opposite of "simpler is better." A keeps ONE
continuous floor in both modes by rendering the grid in the shared
compressed world space, which is both simpler and closer to the target.
We borrow C's honest fix-vs-rewrite verdict and its drift numbers.

---

## 5. The scale-lock fix (core technical solution)

> **SUPERSEDED (2026-06-18) — historical context only.** This section
> describes the original "feed `worldToAu(camDist)` into a recursive-ring
> decade walk" mechanism. The shipped rework uses a **square Cartesian
> scaffold** whose decade is driven by **VIEW SCALE** (camera-to-target
> distance + FOV), not heliocentric `camDist`, and makes NO radial /
> ring claim — see the STATUS block in Section 0 for the actual,
> implemented mechanism. The `auToWorld` authority (the one piece below
> that survived) is correct and shipped; the ring/decade-walk plumbing
> below is not what runs.

### The exact transform

Extract one canonical helper from the pattern already duplicated in
`GridAuLabels.tsx:131-134` and `astrophysics.ts:439-451`:

```ts
// src/lib/astrophysics.ts — new static, factored from the existing
// inline calculateLocalPosition / GridAuLabels logic. NOT new physics.
static auToWorld(au: number, scaleMode: ScaleMode): number {
  return scaleMode === "didactic"
    ? this.mapDidacticHeliocentricDistance(au)   // astrophysics.ts:370
    : au * AU_TO_3D_UNITS;                        // = au * 1000
}
```

This is the single authority. Bodies (`calculateLocalPosition`), the
grid, the decade label, and the optional extent disk all flow through
it. "Planet at 1 AU sits on the 1-AU grid feature" then holds **by
construction** in both modes — there is no second pipeline to drift.

### The exact injection point

Two plug-ins, both removing the raw-camera-distance dependency:

**(1) Decade selection** — replace `GridRecursive.tsx:99` (the bug line).
Instead of `camera.position.length()`, compute the camera's **effective
AU** by inverting `auToWorld` (monotonic, so the inverse is well-defined;
implement as a cached binary search over the 11 anchors + the saturated
tail beyond `80 AU → 2350` capped at `3200`), then pick the decade:

```diff
- // GridRecursive.tsx useFrame (current)
- const dist = camera.position.length();
- const scaling = getGridRecScaling(dist);
- uniforms.u_tessQuality.value = scaling.tessQuality;
- uniforms.u_heightScale.value = scaling.heightScale;
+ // new: drive the decade from effective-AU, in the SAME space as bodies
+ const scaleMode = useStore.getState().scaleMode;           // read it!
+ const camWorld = camera.position.length();
+ const effAU = AstroPhysics.worldToAu(camWorld, scaleMode); // inverse of auToWorld
+ const decade = Math.floor(Math.log10(Math.max(effAU, 1e-3)));
+ const frac = Math.log10(effAU) - decade;                   // cross-fade
+ material.uniforms.u_decadeWorldRadius.value =
+   AstroPhysics.auToWorld(Math.pow(10, decade), scaleMode);
+ material.uniforms.u_decadeFrac.value = frac;
```

**(2) Grid spacing** — the forked drei material spaces its major
(section) lines at multiples of `u_decadeWorldRadius` (a world radius
that already passed through `auToWorld`) rather than at raw powers of
ten. In realistic mode `auToWorld` degenerates to `au × 1000`, so the
shader reduces to the trivially-correct linear case and the drei
infinite-grid's automatic camera-matrix alignment carries the lock for
free.

### Why this is honest (AGENTS.md pillar 18)

In didactic mode the grid lives in compressed space, so it must stay
labeled as compressed. The decade label inherits the existing
`scaleMode` "not to scale" framing (a learner counting rings is never
told the compressed spacing is linear AU).

### Surgical fallback (de-risks the whole plan)

If the drei-fork shader work (gl*FragDepth + decade stepping) overruns,
keep the existing `gridRecShader.ts` mesh but drive it through
`auToWorld`/`worldToAu` (i.e. plug-in (1) only, feeding the \_existing*
`getGridRecScaling` an effective-AU instead of raw distance). That alone
satisfies every HARD requirement; the infinite-grid fork is the AAA
upgrade on top, not a prerequisite for correctness.

---

## 6. File-level plan: KEEP / REWRITE / DELETE

**KEEP (do not rewrite working code):**

- `src/lib/astrophysics.ts` — **KEEP + ADD** `auToWorld(au,scaleMode)` and
  its inverse `worldToAu(world,scaleMode)`. Factor from existing inline
  logic; do not alter the physics.
- `src/components/canvas/PlanetLabels3D.tsx` — **KEEP**; reuse as the
  screen-stable, billboarded, declutter-arbitrated body-label class
  (the `:181-199` scaling mechanism). Minor restyle only.
- `src/components/canvas/Scene.tsx` — **KEEP** `logarithmicDepthBuffer`
  (:421).
- `src/store.ts` `scaleMode` — **KEEP**; now also read by the grid.
- drei `<Grid>` / `<Text>` / `<Billboard>` (10.7.7) — fork `<Grid>`'s
  material; reuse `<Text>`/`<Billboard>` as-is.

**REWRITE:**

- `src/components/canvas/GridRecursive.tsx` — thin wrapper around the
  forked drei infinite-grid material; `useFrame` drives the decade via
  `worldToAu` + pushes `u_decadeWorldRadius` / `u_decadeFrac`; keeps the
  opacity-fade-on-toggle affordance.
- `src/components/canvas/shaders/gridRecScaling.ts` — replace the
  scale-invariant `-25..25` walk with bounded decade-from-effective-AU
  stepping (`floor(log10)` + `fract` cross-fade), ~3 solar-system
  decades. (Or delete if fully absorbed into the new material module.)
- `src/lib/gridOrientation.ts` — strip to **ecliptic-only**: delete
  `getEclipticToEquatorialMatrix`, `getGalacticToEquatorialMatrix`, the
  non-identity branches of `getGridOrientationMatrix`,
  `GRID_ORIENTATION_COLORS`/`_BYTES`, `GRID_ORIENTATIONS`,
  `GRID_ORIENTATION_LABELS`, `OBLIQUITY_DEG_J2000`, `GALACTIC_*_DEG`,
  `getGridRotationMatrix`. Since the ecliptic case is identity in atlas's
  world frame, the module collapses to a single `GRID_LINE_COLOR` const
  - a one-line provenance JSDoc documenting the Celestia single-quaternion
    re-entry path. (Effectively a delete-down-to-a-constant.)

**DELETE:**

- `src/components/canvas/shaders/gridRecShader.ts` (394) — recursive
  Gaia ring shader, superseded by the forked infinite-grid material.
  _(Survives only if the surgical fallback is taken.)_
- `src/components/canvas/shaders/gridRecMath.ts` (199) — recursive-walk
  math, no remaining consumer.
- `src/components/canvas/GridAuLabels.tsx` (182) — the 14 world-unit
  ticks at `LABEL_FONT_SIZE=180` ARE the balloon bug; replaced wholesale
  by the single decade label.
- `src/components/canvas/GridProjectionLines.tsx` (177) **as a standing
  layer** — demote to an on-demand focus affordance (re-styled teal,
  drawn only while a body is focused) OR delete. See Section 8 verdict.
- `src/lib/gridProjection.ts` (202) — pinned camera-relative helpers,
  already unused by the world-space β path; delete with the projection
  layer.
- Tests: remove `gridRecMath.test.ts`, `gridProjection.test.ts`,
  `gridOrientation.test.ts` (subjects deleted); rewrite
  `gridRecScaling.test.ts` and `GridRecursive.test.ts` as
  decade-from-`auToWorld` tests; add `astrophysics.auToWorld`
  round-trip tests.

**NEW:**

- `src/components/canvas/GridDecadeLabel.tsx` — the single flat-on-plane
  teal adaptive decade label (+ optional teal extent disk).
- (material lives either in the rewritten `gridRecScaling.ts` or a new
  `shaders/infiniteGridMaterial.ts` — implementer's call; keep it one
  file).

---

## 7. Store + UI changes

**Store (`src/store.ts`):**

- **DELETE** `gridOrientation` + `setGridOrientation` (:83, :174, :271,
  :380) and the `GridOrientation` import (:5).
- **DELETE** `gridProjectionLines` + `toggleGridProjectionLines` (:94,
  :175, :272, :381-382) — _unless_ the projection callout survives as an
  on-demand affordance, in which case keep the flag but move its UI to a
  focus-context affordance, not a standing toggle.
- **KEEP** `showEclipticGrid` as the single master **"Grid"** toggle
  (default `true`); rename the UI copy to "Grid", keep the store key for
  persist-migration safety. Adaptive decade behavior is on by default,
  no sub-flags.
- **KEEP** `scaleMode` unchanged — now also consumed by the grid (the
  asymmetry that caused the bug is removed).
- `showLabels` stays the global body-label toggle. **Decouple the decade
  label from `showLabels`** — it rides the master Grid toggle, not the
  body-name flag (the AU ruler being gated on `showLabels` was itself a
  coupling bug).
- _(Optional)_ add `gridExtentDisk: boolean` defaulted on for
  ultra/high/balanced via `qualityProfile`, off for constrained.

**UI (`src/components/ui/LayersPanel.tsx:299-327`):**

- Collapse the nested block (:304-327): remove the 3-way "Grid
  Orientation" radio (:306-320) and the "Projection Lines" toggle
  (:321-325). The "Coordinate Grid" master toggle (renamed "Grid")
  becomes a single control with adaptive behavior.
- Remove the now-dead imports from `gridOrientation` (:9, :312-317).

**Progressive-disclosure decision:** ship NO frame selector now. The
equatorial/galactic re-entry (one mesh + one swappable orientation
quaternion behind an "Advanced" disclosure, Celestia's `SkyGrid.orientation`
model) is documented in `gridOrientation.ts`'s surviving JSDoc + Section
11, to be implemented only if/when requested.

---

## 8. Visual treatment + LABEL SYSTEM

### Grid line style

Premium-minimal, near-monochrome. Pure-black background, white point
stars (existing). Grid: thin uniform **WHITE** lines, two tiers — dim
minor cell (`~rgba(255,255,255,0.12)`) + brighter 10× major section
(`~rgba(255,255,255,0.30)`). The forked drei material carries the Ben-Golus
AA essentials: `fwidth`-derivative constant-pixel line width, Phone-Wire
clamp (lines never thinner than 1px, fade opacity instead), sub-pixel
Moiré fade-to-flat-tone, radial opacity falloff
(`pow(1 - d/fadeDistance, fadeStrength)`) as the only depth cue, and
`gl_FragDepth` write so planets/orbits occlude the floor. `~0.3s` opacity
fade on the master Grid toggle (Stellarium fader feel; reuse the existing
`guideIntensity`/opacity lerp logic from `GridRecursive.tsx:113-126`).
One cyan/teal accent (the existing `--nasa-accent` token) for everything
"measurement"; default grid is neutral white (no per-frame color coding —
`GRID_ORIENTATION_COLORS` is deleted).

### LABEL SYSTEM (dedicated spec) — Solar System Scope as north-star

**Unified visual language (shared with the rest of the UI):**

- ONE type family carried from app chrome into the scene (the chrome's
  tracked-uppercase font, e.g. `font-orbitron`, wide letter-spacing).
- TWO weights, TWO colors only: **teal = measurement** (decade label,
  extent disk, stellar leader lines); **light-blue = object names**.
- Drop the heavy `outlineWidth=6 / outlineColor='#000' / outlineOpacity=0.7`
  black stroke (`GridAuLabels.tsx:151-153`, the "ugly" culprit) for a
  subtle ~1px glow so labels read premium.

**Class A — ONE flat decade scale label (NEW, `GridDecadeLabel.tsx`):**

- A single drei `<Text>` laid FLAT-in-perspective on the plane
  (`rotation-x = -π/2`, **NOT billboarded** — must read as painted on the
  floor).
- Teal, wide-tracked uppercase: `"10 AU" → "100 AU" → "1 000 AU" → …` then
  auto-switch unit to `"10 LY"` at stellar scale.
- Content AND world size are tied to the **grid decade** (scales WITH the
  grid via `u_decadeWorldRadius`), **NEVER to body proximity** — this is
  the anchoring intelligence missing today. Cross-fade opacity on decade
  transitions via `u_decadeFrac`.
- Clamp its in-plane orientation toward the camera's ground-projected
  heading and fade it out below a minimum elevation angle (so it stays
  readable near edge-on to the ecliptic).
- _(Optional, tier-gated)_ a soft translucent teal extent disk
  (`<Ring>`/`<Circle>` at the current decade radius) that shrinks as you
  dolly out.

**Class B — body-name labels (REUSE `PlanetLabels3D.tsx`):**

- Already correct: screen-stable sizing (`FONT_WORLD_BASE / FONT_DISTANCE_DIVISOR`
  at `:181-199`) with the `LABEL_SCALE_MAX_WORLD_UNITS` upper cap;
  billboarded (`lookAt` + `rotateY(π)`); decluttered by the existing
  `overlayItems` NDC-overlap/priority arbitration.
- Restyle to light-blue + subtle glow + unified font. Add thin **teal
  leader lines** from an offset label to the 3D position at stellar scale.
- _Stellar-scale caveat:_ HYG catalog stars have no per-star scene mesh
  (one instanced billboard in `Starfield.tsx`; see
  `GridProjectionLines.tsx:117-125`), so leader-line anchoring at stellar
  scale must read instanced positions, not `scene.getObjectByName`.

**Label intelligence (satisfies the HARD requirement):** constant /
clamped screen size for body labels (no ballooning, by construction —
size flows through the same distance math as `PlanetLabels3D`); priority
decluttering (focused > near > distant, fade/cull low-priority on
NDC-overlap); billboard angle clamped upright; leader lines when offset.

### Projection callout — keep-or-cut verdict

**CUT as a standing layer.** The SSS / NASA model conveys "where on the
plane is this body" via the flat decade label + leader lines, not a
persistent L-callout. **Recommendation:** delete
`GridProjectionLines.tsx` + `gridProjection.ts` and the
`gridProjectionLines` store flag. If the owner wants the height-above-plane
cue retained (it is genuinely useful and is the one piece of Gaia's
complexity worth keeping), reimplement it as a tiny **on-demand focus
affordance** (a single thin teal leader drawn only while a body is
focused) rather than a standing toggle. This is the only open fork —
see Section 11.

---

## 9. Risks + how to verify

**Risks:**

1. **Forking drei `<Grid>` for gl_FragDepth + decade-stepping is real
   shader work.** `gl_FragDepth` disables early-Z and has flat-shading
   caveats. _Mitigation:_ the surgical fallback (Section 5) satisfies all
   HARD requirements without the fork.
2. **`worldToAu` inverse must be numerically robust** across the
   Hermite-near-origin regime and the saturated tail (beyond `80 AU →
2350`, capped `3200`). _Mitigation:_ binary search over the 11 anchors
   - an explicit saturated-regime branch so the decade label keeps
     advancing into light-years without the inverse going singular; unit
     tests assert round-trip across both branches and the cap.
3. **z-fighting: flat coplanar grid vs. orbit lines on low tiers** (the
   `logarithmicDepthBuffer` + `gl_FragDepth` interaction). _Mitigation:_
   keep `planeYOffset` slightly below 0 (already `-0.15`,
   `gridRecursiveConfig.ts:11`) and `renderOrder -100`; test explicitly
   on the constrained tier.
4. **Flat decade label unreadable at grazing camera angles.**
   _Mitigation:_ the in-plane orientation clamp + min-elevation fade
   (Section 8).
5. **Deleting tested code** (`gridOrientation`, `gridProjection`,
   `gridRecMath`). _Mitigation:_ Grep confirmed grid-subsystem-only
   consumers; recoverable in git history per the rollback-safety-net
   pattern.

**How to verify (preview + gates):**

- **Scale-lock (the hard requirement) — DIDACTIC + REALISTIC:** unit
  test `auToWorld(1,'didactic')===440`, `auToWorld(1,'realistic')===1000`,
  `worldToAu(auToWorld(x))===x` round-trip. Then a Playwright zoom-sweep
  (`npm run test:e2e`) in **both** modes asserting the 1-AU grid feature's
  screen position stays coincident with Earth across zoom levels.
- **No ballooning:** Claude-Preview MCP screenshots at 1 AU / 40 AU /
  stellar in both scale modes; confirm the decade label scales with the
  grid and body labels hold constant screen size.
- **Occlusion / z-fighting:** visual check that planets and orbit lines
  occlude the floor with no shimmer on the constrained tier.
- **Console smoke (per-ship rule):** open Claude-Preview, wait 15-25s for
  full boot, navigate, read both `error` and `warn` levels — GLSL-only
  errors (e.g. an Effect signature mismatch) do NOT surface in headless
  Playwright.
- **Gates:** `npm run test:run`, `npm run test:e2e`, `npm run docs:check`.

---

## 10. Implementation task list (ordered, atomic, independently committable)

> Each task names the file(s), the change, and the verify step. Tasks
> 1-2 ship the alignment fix alone (the hard requirement) and are
> independently valuable; tasks 3+ layer the redesign on top.

1. **Extract `auToWorld` + `worldToAu` into `astrophysics.ts`.**
   - _Files:_ `src/lib/astrophysics.ts` (+ new tests).
   - _Change:_ add `static auToWorld(au, scaleMode)` (factored from the
     `:439-451` inline logic) and `static worldToAu(world, scaleMode)`
     (monotonic inverse: `world / AU_TO_3D_UNITS` in realistic; binary
     search over `DIDACTIC_HELIOCENTRIC_DISTANCE_ANCHORS` + saturated tail
     in didactic). No change to existing physics.
   - _Verify:_ unit tests — `auToWorld(1,'didactic')===440`,
     `auToWorld(1,'realistic')===1000`, round-trip
     `worldToAu(auToWorld(x,m),m)≈x` across both branches + the `3200` cap.
     `npm run test:run -- astrophysics`.

2. **Fix the scale-lock in the existing grid (surgical, shippable alone).**
   - _Files:_ `src/components/canvas/GridRecursive.tsx`,
     `src/components/canvas/shaders/gridRecScaling.ts`.
   - _Change:_ read `scaleMode` in the `useFrame`; replace raw
     `camera.position.length()` (:99) with
     `worldToAu(camWorld, scaleMode)` → feed effective-AU into the decade
     selection so grid decades live in the same space as bodies.
   - _Verify:_ Playwright zoom-sweep in BOTH modes asserts the 1-AU grid
     feature stays coincident with Earth; Claude-Preview screenshots at
     1 / 40 AU in didactic confirm no drift. **This is the hard-requirement
     gate — commit here.**

3. **Fork drei `<Grid>` into the atlas infinite-grid material.**
   - _Files:_ new `shaders/infiniteGridMaterial.ts` (or rewrite
     `gridRecScaling.ts`); `GridRecursive.tsx`.
   - _Change:_ two-tier white lines, `fwidth` AA + Phone-Wire clamp +
     Moiré fade + `gl_FragDepth` write; major-line spacing driven by
     `u_decadeWorldRadius` (from `auToWorld(10^decade, scaleMode)`) +
     `u_decadeFrac` cross-fade; bounded to ~3 solar-system decades.
   - _Verify:_ z-fighting check vs orbit lines on constrained tier;
     confirm occlusion; preview screenshots both modes.

4. **Add the flat decade scale label (`GridDecadeLabel.tsx`).**
   - _Files:_ new `src/components/canvas/GridDecadeLabel.tsx`; mount in
     the same scene group as the grid.
   - _Change:_ one flat-on-plane (`rotation-x=-π/2`, not billboarded) teal
     drei `<Text>`, decade-tied content + size, `"AU"→"LY"` unit switch,
     decade cross-fade, in-plane orientation clamp + min-elevation fade.
     _(Optional)_ teal extent disk.
   - _Verify:_ preview at each decade boundary — label announces correct
     scale, scales WITH grid, never with proximity, readable at grazing
     angles.

5. **Delete `GridAuLabels.tsx` + wire the decade label to the master
   Grid toggle.**
   - _Files:_ delete `GridAuLabels.tsx`; update its mount site; `store.ts`
     decouple decade label from `showLabels`.
   - _Verify:_ the 14 ticks are gone; the decade label rides the Grid
     toggle; no balloon at close range (preview at 1 AU).

6. **Collapse the frame system (store + lib + UI).**
   - _Files:_ `src/store.ts` (delete `gridOrientation` + setter, :5/:83/
     :174/:271/:380); `src/lib/gridOrientation.ts` (strip to a single
     `GRID_LINE_COLOR` const + re-entry JSDoc);
     `src/components/ui/LayersPanel.tsx:299-327` (remove the orientation
     radio + dead imports).
   - _Verify:_ `npm run test:run` (orientation tests removed); the panel
     shows ONE "Grid" toggle; app boots clean (console smoke).

7. **Resolve the projection callout (per Section 11 fork).**
   - _Files:_ delete `GridProjectionLines.tsx` + `src/lib/gridProjection.ts`
     - the `gridProjectionLines` store flag (:94/:175/:272/:381-382) +
       its UI, AND reimplement it as a small on-demand focus-only teal
       "height above the ecliptic" drop-line (SSS-style), driven through
       `auToWorld` so it stays aligned in both scale modes, shown only while
       a body is focused. LOCKED to KEEP (not delete) per Section 0.
   - _Verify:_ no standing projection layer; the drop-line draws only while
     a body is focused, aligns with the body in didactic + realistic, and
     reads cleanly in the unified teal language.

8. **Unify the body-label visual language + leader lines.** _(DEFERRED —
   not in the 2026-06-18 rework.)_
   - _Files:_ `src/components/canvas/PlanetLabels3D.tsx` (restyle only).
   - _Change:_ light-blue color, subtle glow (drop heavy black stroke),
     unified font; add thin teal leader lines from offset labels to the
     3D position at stellar scale (read instanced HYG positions, not
     `getObjectByName`).
   - **Default-label-path correction (Codex C10).** `PlanetLabels3D` is
     the **SDF (`labelMode === "sdf"`)** path and is **opt-in**, not the
     default. The default body-label path is **HTML overlay**
     (`DEFAULT_LABEL_MODE = "html"`, `src/lib/labelMode.ts:56`; the SDF
     `PlanetLabels3D` mount gates on `labelMode === "sdf" && showLabels`
     in `Scene.tsx:660`). So this task restyles the OPT-IN SDF path; the
     equivalent HTML-overlay restyle (the path a fresh boot actually
     shows) must be scoped alongside it, or the unified language only
     reaches users who toggle SDF on.
   - _Verify:_ preview at planetary + stellar scale — constant size,
     declutter intact, leaders point correctly; check BOTH `html`
     (default) and `sdf` label modes.

9. **Tier-gate via `qualityProfile`.**
   - _Files:_ the grid material + `GridDecadeLabel.tsx`.
   - _Change:_ ultra/high/balanced → multi-decade cross-fade + full AA +
     extent disk; constrained → single-decade flat floor, no Moiré pass,
     no disk.
   - _Verify:_ force each tier; confirm graceful degradation + no perf
     regression on constrained.

10. **Rewrite/prune tests + final gates.**
    - _Files:_ rewrite `gridRecScaling.test.ts` + `GridRecursive.test.ts`
      as decade-from-`auToWorld` tests; delete `gridRecMath.test.ts`,
      `gridProjection.test.ts`, `gridOrientation.test.ts`.
    - _Verify:_ `npm run test:run` && `npm run test:e2e` &&
      `npm run docs:check`; Claude-Preview console smoke (boot, navigate,
      read error+warn).

---

## 11. Open questions for the owner (genuine forks only)

1. **Projection callout — delete entirely, or keep as an on-demand focus
   affordance?** The redesign conveys spatial context via the flat decade
   label + leader lines, so the standing L-callout is cut either way. The
   only fork is whether to retain a _transient_ "height above the ecliptic
   plane" leader that appears solely while a body is focused (the one
   genuinely useful piece of Gaia's projection feature). Default
   recommendation: **delete**; reimplement on demand only if the
   height-above-plane cue is missed.

2. **Equatorial / galactic frames — confirm delete-now is acceptable?**
   The plan removes them entirely with a documented one-quaternion
   re-entry path (Celestia model) behind a future "Advanced" disclosure.
   This is the single biggest simplicity win and matches all five
   references. Confirm no near-term need for inter-frame-tilt teaching
   before we delete the tested orientation math.

3. **Soft teal extent disk — ship in v1 or defer?** It is a high-clarity,
   low-cost SSS cue (tier-gated to ultra/high/balanced). Default: **ship
   it**; flag here only because it is additive polish beyond the core
   one-grid-one-label deliverable.
