# Wave — fidelity & honesty (2026-07-26)

**Authority:** [`AGENTS.md`](../../AGENTS.md). **Queue:** [`../STATUS.md`](../STATUS.md).
**Findings and rejections:** [`../archive/audits/cross-ai-triage-2026-07-26.md`](../archive/audits/cross-ai-triage-2026-07-26.md)

Thirteen waves in two tranches, plus a gated appendix. Tranche 1 (W1-W10) closes
every confirmed fidelity and honesty defect. Tranche 2 is additive and is
**re-decided at the checkpoint, not pre-committed**.

Item IDs are defined in the triage document. Do not schedule anything from its §3.

**Revised 2026-07-26 after a second external review round** (three reviewers, then
three verification agents against HEAD). Eleven findings landed; eight were
defects in this file's own text, not in the code. The material ones, each marked
inline where it lives: the eclipse cone anchors were computed from the **mean**
Earth–Moon distance and would have rendered a total eclipse annular (W7); the
obliquity derivation used ecliptic north instead of the orbital normal, wrong by
176° for Venus (W2); the plume speed band was gas velocity applied to grain
trajectories, entirely above escape (W13); the `groupRef` invariant fused two
different refs (W5); standing law 2 forbade uniforms that W7 and W10 both require;
a 6 h eclipse scan step misses **every** eclipse in the decade (W8); W11's
acceptance gate watched tolerance literals rather than measured residuals; the
Moon is not among the eighteen analytical satellites (W6); and **NEW-5**, a live
411× atmosphere overboost, surfaced from reversing one of the triage's own
rejections (W10).

**Third round, 2026-07-26 — the three riskiest waves reviewed individually by an
independent model, free-format, mandated to hunt opportunities and adjacent bugs
rather than validate.** Each of W5, W6 and W7 gained a "Third round" subsection.
The three that change the shape of the work: **a second eclipse renderer** (the
`SmartSunLight` shadow map casts hard cross-body silhouettes that visually
override W7's corrected penumbra, and already draws didactic-wrong Jovian transits
today — W7's "identical to main" gate passes straight through it); **lunar
eclipses are already live** and W7 as drafted would regress totality to a black
disc with no lunar anchor anywhere in the wave; and **Charon's orbital phase is
fabricated**, which makes W6's own mutual-lock smoke undecidable and invites an
implementer to un-transcribe a constant to make it pass. Two design changes were
adopted: baking the ellipsoid into the geometry (W5, deletes two of three shader
edits) and a three-layer frame-explicit orientation API (W6, because W11 consumes
it in the astro frame while the drafted function returns a scene-basis
quaternion). One decision was **reversed**: the Moon ships a mean Ẇ, because
optical libration comes from real ELP positions and a uniform spin — the E-series
buys ~3-4° that no learner can see.

**Scope boundary.** The 2026-07-25 hunt's own queue — V1–V8 (limb darkening,
anisotropy, wrapS, earthshine, Mars atmosphere, bloom/AgX defaults, HYG bulk
colours, Venus atmosphere map), U1–U5, A1–A3, Q1–Q4 — is **deliberately not in
this wave**. The agents that produced this plan were instructed not to re-propose
those items, so their absence here means "already logged elsewhere", never
"checked and rejected". They remain
[`../archive/audits/opportunity-hunt-2026-07-25.md`](../archive/audits/opportunity-hunt-2026-07-25.md)'s
queue. Two natural merges if either is ever picked up: **V2 (anisotropy)** belongs
in W3, which already owns the photometry and exposure floor, and **V1 (limb
darkening)** belongs beside it.

---

## Progress

| Wave                                    | Status                            | Commit                                                                                                                |
| --------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| W1 Correct the record                   | code done, **user smoke pending** | `6528d48` F-11 · `7e50574` F-10 · `f56d701` D-05 · `61a26b8` OPP-VALIDITY                                             |
| W2 The panel stops contradicting itself | code done, **user smoke pending** | `52c4c0c` F-08 · `c32e652` F-07 · `cfc6867` D-03 · `4837596` OPP-EARTHCMP · `a67c778` OPP-ELONG · `31bb225` tilt cell |
| W3 Photometry and the exposure floor    | not started                       | —                                                                                                                     |
| W4 The star surfaces stop lying         | not started                       | —                                                                                                                     |
| W5 Body figure                          | not started                       | —                                                                                                                     |
| W6 One pole, one spin                   | not started                       | —                                                                                                                     |
| W7 Eclipses happen when eclipses happen | not started                       | —                                                                                                                     |
| W8 Reach and discovery                  | not started                       | —                                                                                                                     |
| W9 The rings transmit                   | not started                       | —                                                                                                                     |
| W10 Atmosphere on the disc              | not started                       | —                                                                                                                     |
| — CHECKPOINT —                          | —                                 | —                                                                                                                     |
| W11 J2 secular precession               | not decided                       | —                                                                                                                     |
| W12 Uranus stops being a bare ball      | not decided                       | —                                                                                                                     |
| W13 Enceladus erupts                    | not decided                       | —                                                                                                                     |

---

## Standing law

Applies to every wave. Violations are defects, not style notes.

1. **The diff that introduces a helper deletes what it replaces, in the same
   commit.** No wave leaves a half-migrated call site on `main`.
2. **New GLSL prefers built-ins over new uniforms; where a wave must add one it
   names it in its exit criteria with the reason.** Corrected 2026-07-26 — the
   original wording said "zero uniforms and zero varyings", which the plan's own
   W7 (+2 eclipse-cone uniforms across three declaration sites) and W10
   (+1 `vAtmPosition` varying) both violate. Those two are the sanctioned
   exceptions; anything else needs the same justification in writing.
   The Sun **is** at the world origin, so `viewMatrix[3].xyz` is the Sun in view
   space and needs no uniform — but note `usePlanetMaterials.ts:107`/`:383` are
   precedent for the **invariant**, not for the technique: those sites bind an
   explicit `uSunPositionWorld` at `:108`/`:384`.
   `geometryPosition`/`geometryNormal`/`geometryViewDir` exist only _after_
   `lights_fragment_begin`; before it (at `map_fragment` / `emissivemap_fragment`)
   use `vViewPosition` and the faceDirection-flipped `normal`. Redeclaring
   `vWorldPos`/`vWorldNormal` reproduces the "redefinition" failure recorded at
   `usePlanetMaterials.ts:252-257`.
3. **Every physical constant this plan introduces needs an independent check that
   does not pass through the constant itself**, named in the JSDoc beside it.
   This rule was earned: a specified flattening formula would have shipped
   Jupiter's equator 1.4% small inside a fidelity fix, and only the catalog's own
   radii could falsify it. Add the short rule to
   [`../lessons.md`](../lessons.md) in W6 — narrative stays here, the rule goes
   there (L38).
4. **The commit that changes a number or a model greps every sentence in the repo
   that describes it and updates all of them in the same diff.** F-05 has three
   such sentences, not one.
5. **There is exactly one pixel gate:**
   `e2e/boot.spec.ts-snapshots/boot-frozen-chromium-win32.png` at 1% tolerance,
   run by CI on every push. Any wave that changes what the boot frame draws runs
   `npm run test:e2e` as its last step. A baseline is re-committed only after a
   human confirms a correct, populated render, with one sentence in this file
   saying what changed and what must not have — never to turn a red assertion
   green (`e2e/boot.spec.ts:23-26`).
6. **CI runs `test:coverage` and `docs:check` on every push.** Waves that delete
   covered code (W1, W6, W7, W9) run `npm run test:coverage` in their gate. Do
   not lower the thresholds; `vitest.config.ts:34-35` records the intent to raise
   them.
7. **Every wave's final commit** updates the table above, updates STATUS's
   Active-wave line if it moved, and runs `npm run docs:check`.
8. **Runtime smoke is not optional and headless does not substitute.** The
   failure mode for most of this plan is a GLSL-only error with a black body and
   a console line — invisible to `npm run build` and `npm run test:run`. Open the
   app, wait for full boot, navigate, and read the console at **error and warn**.

---

## Tranche 1

### W1 — Correct the record · low · 0.5-1 day

**Items:** F-10, F-11, D-05, OPP-VALIDITY

Every label, tutorial bullet and source comment means what it claims, and the
repo stops carrying unreachable parity math whose header advertises a decision
that already closed.

**Already done, with this file:** STATUS's Active wave points here and
`ui-redesign-2026-07-25.md` moved to `../archive/waves/` (its three inbound
references were updated in the same commit). Without that a fresh session reads a
completed wave, concludes the queue is empty, and is explicitly instructed not to
invent work — and `docs:check` cannot catch a stale-but-existing pointer, because
it only verifies that referenced files exist.

**Exit criteria.** `TutorialOverlay` step 6 names the gear button and all three
features named there are findable. `asteroids.ts:5` reads 2000, matching the
enforced range, with a comment recording why 1900 was rejected (the `ceres-1890`
fixture at 7.40°). `grep -r msdfFontMath src` returns zero, and neither
`labelMode.ts:36` nor `PlanetLabels3D.tsx:34` still advertises a deferred MSDF
override. `getProvenance` emits the registry's measured note when **in** window
and a Kepler-fallback-framed note when out — never the analytical note for a
model that is not running.

**Verification.** `npm run test:run -- engine celestialBodies && npm run test:coverage && npm run lint && npm run build && npm run docs:check`.
Smoke: Ctrl+Shift+T to tutorial step 6; select Titan and read the Orbit Model
block at desktop and 390px; drag Ceres to 1890 and confirm the note flips.

---

### W2 — The panel stops contradicting itself · low · 2-2.5 days

**Items:** F-08, F-07, D-03, OPP-EARTHCMP, OPP-ELONG, **+ the axial-tilt cell**

Four of six items edit `Sidebar.tsx` and three edit the same 20-line grid, so
they are one wave with a fixed internal order: **F-08 → F-07 → D-03 →
OPP-EARTHCMP → OPP-ELONG → tilt cell**. F-07 establishes the derived-value
`subLabel` convention ("Derived from mean motion", "to ecliptic") that D-03 and
OPP-ELONG reuse rather than each inventing its own disclosure.

Placed second on truth-first grounds: Mercury's panel prints "Day Length 58.6
Earth days" directly above a Fact saying a Mercurian day lasts 176 days, which
any reader can falsify without leaving the panel.

**Exit criteria.** The stat reads "Rotation Period" and Earth's value reads
"23h 56min (sidereal)", so all 47 records mean one quantity; `astrophysics.ts`'s
JSDoc names Mercury, Venus and the Moon as the three bodies whose solar day
differs materially. `grep -c 'yearLength: "Unknown"'` returns 0 and Io / Titan /
Iapetus read 1.77 / 15.94 / 79.33 days with the sub-label. `useOsculatingElements`
is deleted; the panel is fed from `b.orbit` via `resolveOrbitDistanceBoundsAU`.
Pluto shows e 0.248 and a single full-width "Perihelion / Aphelion" cell reading
"29.70 – 49.26 AU". **Iapetus shows no inclination cell** — its 15.47° is to its
Laplace plane and the catalog records no reference-plane field; inclination
renders only for sun-orbiting bodies, labelled "to ecliptic". Ω, ω and M render
nowhere, so the five TNOs' fabricated zeros stay invisible. Io reads Mass 0.015×
Earth and Escape 0.16×; Mimas shows no mass badge rather than "0.00×". Mercury's
geometric elongation never exceeds ~28.3° across a simulated year, and the Sky
Geometry note states geometric-from-Earth's-centre with no observer location,
atmosphere or twilight. **The tilt cell becomes pole-first**, with the derivation
**corrected 2026-07-26** — the first draft said "derive obliquity from
`poleRA`/`poleDec`", i.e. the angle to **ecliptic north**, which is wrong by
6.98° for Mercury, **176.1°** for Venus (prograde where it is retrograde) and
15.5° for Uranus, and right only for Earth because Earth's orbit _is_ the
ecliptic. Obliquity is the angle between the spin axis and the **orbital
normal**, so the derivation needs four inputs: the IAU pole; the obliquity of the
ecliptic ε to rotate that pole into the frame the orbit lives in; the orbit
normal `n̂ = (sin i sin Ω, −sin i cos Ω, cos i)` from the record's own `i`/`Ω`;
and the retrograde flip `obliquity = retrograde ? 180 − θ : θ`, keyed off
`sign(rotationPeriodHours)` (Venus −5832.5, Uranus −17.24 already carry it).
Verified against the catalog: Mercury 0.0166 vs 0.03, Venus 177.365 vs 177.3,
Uranus 97.775 vs 97.77, Earth 23.4393 vs 23.44. **Satellites get no derived
obliquity** — their `i` is referred to a mix of Laplace and parent-equatorial
planes with no field recording which, the same gap that drops Iapetus's
inclination cell in this wave. So: derive for sun-orbiting bodies, show
`axialTilt` where a real measured value exists, honest "N/A" otherwise —
`${b.axialTilt}°` is currently unguarded and `StatBox`'s `value || "N/A"` cannot
catch the string `"undefined°"`, which is truthy. This stops 27 invented `0°`
readings four waves earlier than the schema change.

Scope note: for the Moon the parent **is** Earth, so the geocentric vector is
used directly and the result is the lunar phase. Other satellites render no Sky
Geometry section — their elongation is within a degree of their parent's.

Sidebar's stat labels are hardcoded English today (only body names route through
i18n). W2 follows that convention and adds no keys. **This is a recorded
deferral, not an oversight** — W8 introduces the panel's first keys, and
migrating the labels is its own increment.

**Verification.** `npm run test:run -- celestialBodies useOrbitalEngine astrophysics && npm run lint`.
Smoke: Mercury (grid and Facts must now read as two different, both-true
statements), Venus, Moon, Io, Titan, Iapetus, Pluto, Sedna, Mimas, Earth; a Venus
greatest-elongation date for the ~50% dichotomy and a new-moon date for
elongation ~0; repeat at 390px.

---

### W3 — Photometry and the exposure floor · medium · 2-2.5 days

**Items:** P-01, OPP-BRDF, F-05

Ahead of every other look wave deliberately, and this is the plan's sharpest
ordering call: `metalness 0.3 → 0.0` moves peak linear direct diffuse ~1.43×
globally, so landing it now means W5, W9 and W10 are smoked against **final**
exposure and a look change is attributable to the wave that caused it. That is a
measurement-validity argument, not taste.

Fixed internal order: **P-01 → BRDF part A → F-05 → BRDF part B**, so F-05's one
judgement call is made against a settled floor rather than one about to shift.

**Exit criteria.** `cubeUpdateInterval` is 4 at ultra and high with a comment
explaining the deliberate non-monotonicity against balanced's 2; the modulo is
evaluated **before** the increment so every tier bakes on frame 0; phase
continuity across the `isClose` early-return is preserved; `cubeResolution`
512→256 is explicitly **not** in this change. `DEFAULT_PLANET_METALNESS` is 0.0
with a JSDoc stating rock, ice and regolith are dielectrics at F0 = 0.04. The
Lommel-Seeliger patch is applied at **two** call sites, because the branch chain
is mutually exclusive: inside the eclipse branch (the Moon's only route) and in a
new trailing branch for Mercury, Ganymede, Callisto, Io, Europa and Enceladus,
which reach no branch today. The 4/3 factor is **derived**, not tuned — mean μ₀
over the projected disc at zero phase is 2/3 and the LS product collapses to C/2
— so it is flux-neutral and only the brightness distribution changes. Earth,
Venus, Mars, Titan and the four giants keep Lambert, and Earth's branch is
byte-unchanged. `atmscatteringSnippet.ts:269` reads `.rgb`, and **all three**
sentences claiming byte-identity are updated in the same diff:
`atmscatteringSnippet.ts:27-33` gains an explicit **Atlas correctness** divergence
entry (not an upstream sync — Gaia is not a product rule), and
`atmosphereShader.ts:73` and `:99` are amended to name the Rec.709 luma exception
and cross-reference it.

`regolithPhotometryPatch.ts`'s header cites the Lommel-Seeliger law and its
applicability to airless regolith, states that 4/3 is an Atlas flux-preserving
normalisation rather than a published coefficient, and names the selection
criterion (no optically significant atmosphere). The schema flag is named for the
physical property, not as a one-member extensibility union.

**P-01's automated gate must be built, not borrowed.** `cubeUpdateInterval` lives
only in `ProceduralSun3D.tsx` (`SUN_FX_PROFILES` at `:53/:63/:73/:83`, consumed at
`:735`) and **no test file anywhere references it or `SUN_FX_PROFILES`** — the
originally-specified `celestialBodies qualityProfile` command is structurally
blind and P-01 could ship unfixed with a green gate. Lift the profile record (or
at minimum the interval map) into an exported module beside
`stellarVisualProfile.ts`, extract the schedule predicate as a pure
`shouldBakeCube(frameCount, interval)`, and pin both: the four tier values, the
frame-0 bake, and phase continuity across an `isClose` gap.

**Known limitation to record, not silently skip.** Bodies with a `model` field —
haumea, vesta, pallas, hygiea — render through `PlanetModel.tsx`, which builds its
own materials with no `onBeforeCompile` and never calls `usePlanetMaterials`. They
receive `roughness`/`metalness` as props (so P-01's metalness change does reach
them) but no shader patch from W3, W7 or W9. All four are airless rock or ice and
therefore meet W3's own selection criterion while being unable to receive the
patch. State it; do not let the asymmetry pass unremarked.

**Verification.** `npm run lint && npm run build && npm run test:run -- celestialBodies qualityProfile sunFxProfile`,
then **one browser smoke per commit**. P-01: granulation identical to main after
15 s, first frame after boot lit not black, frame time measured with the Sun
filling the viewport before and after. BRDF: a full Moon's limb stops darkening
and the disc reads flat to a hard edge; Earth's day/night, night lights and cloud
blend unchanged; Vesta on the GLB path not blown out. F-05: A/B Earth's lit limb
and terminator against main — same hue, less opaque, smooth fade with no hard
outer ring. If it rings, the per-body `alpha` field is the only knob touched,
never `fKrESun`/`fKmESun`. Then `npm run test:e2e`; re-bless the single baseline
deliberately and record here that every body brightened ~1.43× in diffuse while
Earth's night-lights blend and cloud terminator stayed byte-identical.

---

### W4 — The star surfaces stop lying · low · 2-2.5 days

**Items:** F-06, OPP-STAR-PANEL

Fully independent — no other wave touches `HygStellarMesh`, `hygStarInfo`,
`hygNameIndex` or `HygStarPanel` — so it competes for nothing and gives a second
high-confidence ship before the orientation chain's risk. Both are smoked in one
browser session with a star focused.

**Exit criteria.** `starData.worldPos` is gone and the `useFrame` re-resolves into
a `posRef` each frame, copied onto the group inside `ProceduralSun3D`'s
`useFrame` **before** the `isClose` early-return. The `positionRef` prop is
mandatory, not stylistic: the group commits position through the R3F prop and R3F
applies props on reconciliation only, so mutating a `Vector3` in place never
reaches `group.position`. The Sun mount (no `positionRef`) is byte-identical.
`CameraController.tsx:452`'s "static for HYG stars, so no further drift" comment
— a second copy of the same frozen assumption, in a file whose own code
re-resolves per frame — is corrected.

Rigel reads Luminosity ~40 600 × Sun and **not** ~857 000: the Stefan-Boltzmann
form inherits `radiusFromSpect`'s geometric-mean blend with the Ia table value of
1000 R☉, tuned for apparent disc size rather than luminosity accounting, and
would ship a 7.1× error inside an honesty fix. Constellation reads "Orion" —
`CONSTELLATION_NAMES` moves from its private copy in `StarHoverTooltip.tsx` to
`hygNameIndex.ts`, which already is the HYG-abbreviation-to-display module and is
already imported by `hygStarInfo.ts`. Temperature, Radius and Mass each carry an
"est." chip and **Luminosity deliberately does not**, because marking a catalog
restatement as modelled is its own small lie. The footer cites
`STARFIELD_SOURCE_METADATA.hyg.label` and `.creditsLink` rather than a
hand-written string. Proxima prints 5.4e-5, not "0.00". A spect-less star hides
the est. rows and the footer together. Every new string exists in en **and**
pt-BR (`i18n.test.ts:141` already enforces parity — no new test needed).

**Verification.** `npm run test:run -- hygFocusResolver HygStarPanel i18n stellarPhysics && npm run build`.
Smoke: search Sirius, fly in until the disc appears, set 1 year/second and play —
the disc must stay centred with no lateral slide and no sprite/mesh pop for 20+ s.
Expect the gate to **stop** firing: today the camera tracks the live star and
runs away from the frozen mesh, so the fix removes hysteresis churn rather than
introducing it. Defocus/refocus to confirm the ramp restarts from 0; re-check the
Sun; then Rigel, Proxima and a spect-less star; flip to pt-BR for raw keys.

---

### W5 — Body figure · medium · 3-4 days

**Items:** F-04, OPP-SHAPE, NEW-1, **+ F-09 as the first commit of stage B**

Moved ahead of the orientation chain, correcting an implied dependency: stage A
does **not** need F-01. `computePoleOrientationQuaternion` uses
`setFromUnitVectors`, which gets the axis right and leaves only the azimuth
arbitrary, and all five flattened bodies already carry IAU poles — squash-about-Y
then spin-about-Y commutes. OPP-SHAPE depends on F-04 alone.

**The invariant, binding on every commit in this wave.** Corrected 2026-07-26 —
the first draft fused **two different `groupRef`s** into one sentence. There are
two: `PlanetVisual`'s own ref (declared `Planet.tsx:152`, scaled at `:230`,
rendered `:424`), and the **outer** `Planet` ref (declared `:620`, positioned at
`:780`, rendered `:1008`). They have different jobs and the invariant is different
for each.

- **`PlanetVisual`'s ref stays uniform** at `resolveSemanticBodyRadius`, because
  a pole quaternion (`:435`) and the spin group (`:437`) sit **below** it, so a
  non-uniform scale there composes as S·R — a **shear**, not a rotated ellipsoid.
  Uranus at 97.77° would render a skewed blob and Quaoar's long axis would freeze
  in the ecliptic frame. It parents **no** satellites.
- **The outer `Planet` ref must never receive scale of any kind.** It is the one
  that parents both satellite subtrees (`:1039-1041`), and it carries position
  only today. This is what the wave's smoke line is actually testing when it says
  "if Weywot or Io moved, the scale went on `groupRef`".

The per-axis vector goes to the planet, cloud and atmosphere **meshes** individually,
as the **normalised** ratio `resolveBodyAxisScale(...) / resolveSemanticBodyRadius(...)`
whose max component is exactly 1.0 — assert that identity first. Apply the same
normalised ratio at `PlanetModel.tsx` instead of the raw `shapeScale`.

**Hard gate on the formula:** `axis = R * ((1-f)^(-1/3), (1-f)^(2/3), (1-f)^(-1/3))`,
**not** `axis.y *= (1-f)`. `radiusKm` is the volumetric mean radius; the correct
form reproduces published equatorial/polar radii to 4-6 digits for all four
giants (Jupiter 71491.7/66853.7 vs 71492/66854; Saturn 60268.0/54364.0; Uranus
25558.8/24972.8; Neptune 24763.8/24340.8). The wrong form leaves Jupiter's
equator 1.4% and its pole 2.2% small.

**Exit criteria.** Both `shapeScale` double-applies deleted (`Planet.tsx:794-802`
active, `PlanetModel.tsx:251-259` latent). `resolveBodyAxisScale('quaoar')`
returns three distinct components whose max equals
`resolveSemanticBodyRadius('quaoar')`; Quaoar's silhouette visibly changes width
across its 17.68 h spin and is no longer 18% oversized against Orcus and Sedna.
Jupiter's limb is visibly elliptical with the bulge locked to the pole while it
spins; Uranus's bulge lies **across** the visible disc at 97.77°. Earth is
deliberately not flagged (0.00335 is sub-pixel and it is the only Nishita-shell
body). The five `flattening` values carry a JSDoc naming the source (IAU/NASA
fact sheet, edition and access date), stating it is geometric flattening
(Re−Rp)/Re, and naming the falsification test — each value is read out of the
source at edit time, never copied from this file.

Stage A is Jupiter, Uranus, Neptune and Mars, and is a **valid stopping point** —
the catalog has exactly one `atmosphereScattering` (Earth) and exactly one
`ringSystem` (Saturn), so stage A is trap-free. Stage B is Saturn and touches two
shipped shaders: normalise `vPos.y` by (1−f) in the ring-shadow-on-planet patch
and apply the same normalisation to the planet-shadow-on-ring solve that
hard-codes "Radius is 1.0". **`vObjectNormal` moves in the same commit** — the
shader exports the raw unit-sphere attribute at `usePlanetMaterials.ts:548` and
consumes it for `sunDot` at `:571`, feeding the `smoothstep(0.0, 0.05, sunDot)`
terminator fade. Mapping the position by 1/(1−f) while leaving the normal at
identity is inconsistent, and on Saturn (f = 0.098) the true surface normal
departs from the spherical one by up to **5.6°**, which lands the terminator-side
edge of the ring shadow in the wrong place — precisely what this wave's own smoke
is looking at. The normal transforms by the **inverse-transpose** of the axis
scale (reciprocal per-axis factors), not by the same (1−f) as the position. **Stage B opens with F-09** — Saturn's
(1−f)^(−1/3) = 1.034963 _is_ the 60268/58232 = 1.034963 factor, so the wave that
changes the object-space unit owns the ring ratios: write them once as the
published 1.110 / 2.326, with a comment stating the settled invariant (ring
ratios are published radii against IAU equatorial 60 268 km; the object-space
unit is equatorial) rather than a conditional. Also fix `astrophysics.ts:717-718`
(`ringOuterPhysicalAU`, the didactic ring reach — **not** `:705-706`, which is
`physicalParentRadii` for moon-distance compression where the mean radius is
correct and must be left alone),
which computes didactic ring reach from `radiusKm` — the same mean-vs-equatorial
bug two hundred lines away.

#### Third round — what an independent review added

**The axis order is the data, and every gate in this wave is blind to it.**
`shapeScale: [1.18, 0.99, 0.86]` is in **publication order** (a, b, c —
semi-major, intermediate, minor); it is volume-preserving against `radiusKm: 555`
(product 1.0047), which confirms the reading, and the schema comment defines no
axis convention because `Math.max()` made the order irrelevant. In published
occultation and lightcurve solutions the **short axis c is the spin axis**, and
the mesh spins about **Y**. Feeding the triple straight through therefore gives
the pole b = 0.99 and an equatorial direction c = 0.86 — a body rotating about its
**intermediate axis**, dynamically impossible for a relaxed rotator and a
contradiction of the cited source. Worse, the wrong mapping _looks better_: it
swings the silhouette 1.18↔0.86 (37%) against the correct 1.18↔0.99 (19%), so the
smoke would read as extra convincing. Define the convention once — keep the
catalog in publication order, map in the resolver as `(x, y, z) = (a, c, b)`, name
it in the JSDoc — and add the **order-sensitive** assert standing law 3 demands:
`axisScale.y === min(components)` for any triaxial rotator, cited to
rotation-about-c. This is the pseudo-size lesson repeating: the field name said
"shape" and nobody traced which axis was which.

**Consider baking the figure into the geometry instead of scaling the mesh.**
The per-axis mesh scale is why this wave has to hand-correct `vPos.y` and
`vObjectNormal` in shader patches — the figure lives _above_ the geometry, so
every object-space varying still reads a unit sphere. The alternative: build the
sphere once, `geometry.applyMatrix4(makeScale(rx, ry, rz))` with the normalised
ratio, memoise and dispose it beside `ringGeometry` in the existing
geometry-owning idiom, and share it across the planet, cloud and atmosphere
meshes. `applyMatrix4` updates positions **and** re-derives normals through the
normal matrix, so `vPos` is already the ellipsoid point and `vObjectNormal` is
already the true normal — **two of stage B's three shader edits dissolve instead
of being implemented**, and every future object-space patch inherits the figure
for free. Costs three JSX `<sphereGeometry>` instances collapsing into one shared
primitive, which is fewer allocations than today. The GLB path keeps mesh-level
scale (loader geometry is cached and must not be mutated). Judgement call, but it
is the more elegant answer and it shrinks the riskiest part of the wave.

**Stage B trap: in the ring shaders the pole is Z, not Y.** The ring is
`RingGeometry` in its local XY plane rotated `[-π/2, 0, 0]`, so ring-local **+Z**
maps to the rotation frame's +Y, and `uSunPosition` for that material is built in
the same ring-local frame. An implementer copying the `.y` treatment into the ring
patch warps the shadow along an **in-plane** axis, compiles clean, and passes
every gate with a plausible wrong shadow. Two sub-traps: the planet-as-occluder
solve is **duplicated** in `planetShadowFragmentPatch` and
`planetShadowEmissivePatch` and both copies must move; and if the ray _direction_
is stretched, the quadratic gains a non-unit `a = dot(Sd, Sd)` that the current
code assumes is 1 because `lightDir` is normalised.

**`PlanetModel` needs the invariant and a precedence rule.** The latent
double-apply sits where `scale.set(s·sx, s·sy, s·sz)` puts non-uniform scale on
the outer group with the tilt group and `rotationRef` **below** it — the same S·R
shear this wave outlaws in `PlanetVisual`, and the wave's one-clause instruction
invites an implementer to fix it in place and keep the shear. Keep that group
uniform at `s` and move the ratio below `rotationRef`. Then write the precedence
rule into the resolver's JSDoc: **the model path ignores `shapeScale` and
`flattening` — the asset owns the figure.** Haumea's GLB already encodes its
ellipsoid, so the day anyone gives Haumea a `shapeScale` the model path would
squash an already-squashed mesh.

**Contract caveats to write into the JSDoc.** `max component` is correct for every
live consumer — nobody wants the mean, and for texture LOD the max is
_preferable_ because a projected radius would flicker Quaoar's tier every half
period. But say **why** (upper bound for framing and bounds consumers; LOD
stability), and record that "max = equatorial" is an accident of biaxial figures:
for a triaxial body max is the longest equatorial semi-axis, which no published
ring ratio uses — harmless while Saturn is the only `ringSystem`, but Quaoar is
both the one triaxial body and one whose record mentions a ring.

**Three more ripples.** The suspense fallback scales a 32×32 sphere uniformly by
the semantic radius, so post-W5 it re-commits F-04 in miniature during boot and
permanently for model bodies below the salience gate — one line, apply the same
axis vector. The eclipse driver's comment justifying its radius as "the same value
the eclipsing body's mesh is actually scaled by" becomes false for a flattened
body and is standing law 4's problem in **this** wave's diff, not W7's. And
`flattening` on Mars collides with the already-logged V5 (Mars atmosphere), whose
Nishita integrator assumes a unit sphere — assert that `atmosphereScattering` and
a non-identity figure are mutually exclusive until the shader learns ellipsoids,
which is also the recorded reason Earth is exempt, so it is one fact written where
it will be found. Assert the same for `flattening` and `shapeScale` on one record.

**The independent check standing law 3 asks for already exists on disk.**
`celestialBodies.test.ts`'s gravity-identity allowlist already records Saturn
0.098 and Jupiter 0.065 by a route (equatorial 1-bar gravity vs GM/R̄²) that does
not pass through the new constants. Reuse it; do not invent a second anchor.

**Cheapest reference-grade follow-on, once this lands:** Phobos and Deimos
ellipsoids. Both have published triaxial dimensions (the test allowlist already
quotes "15×12×11" for one of them), both are tidally locked so the long axis
meaningfully points at Mars once W6 fixes phase, both render as spheres today
directly under catalog prose calling them irregular, and both are focusable
close-ups where the figure dominates the silhouette. Two catalog triples in the
convention above plus Quaoar-style provenance blocks. Zero new code.

**Verification.** `npm run test:run -- astrophysics celestialBodies cameraNearPlane moonSceneFrame && npm run lint && npm run build`.
Add a real assert in `astrophysics.test.ts`: `resolveSemanticBodyRadius(saturn,'realistic') / KM_TO_3D_UNITS` equals 60 268 ± 0.1% and Jupiter 71 492 — `cameraNearPlane.test.ts` is built entirely on Deimos, which has neither `shapeScale` nor flattening, so it is **structurally blind** to this wave and must not be described as the gate (lesson M5). Post-stage-B arithmetic gate: `resolveRingOuterRadius(saturn,'realistic') / KM_TO_3D_UNITS` still equals 140 180 km within 1%. Smoke per commit: Quaoar through one 17.68 h period; Jupiter limb plus spin-axis lock (a wobble means the scale went on the wrong group); Uranus; stage B, Saturn's ring shadow still tracking the drawn ring at three sub-solar latitudes, and didactic Saturnian moons still outside the rings. **Confirm Weywot's separation from Quaoar and Io's from Jupiter are unchanged from main at the same timestamp** — if either moved, the scale went on `groupRef`. Record the measured focus-extent deltas here: the equatorial radius grows 3.5% for Saturn, 2.2% Jupiter, 0.8% Uranus, 0.6% Neptune, in both scale modes, which shifts every moon of every flattened planet in didactic mode. Then `npm run test:e2e`.

---

### W6 — One pole, one spin · **high** · 5-6 days

**Items:** F-01, F-02, NEW-2, OPP-PC, **+ `axialTilt` schema and the GLB path**

The plan's highest-fan-out wave and its largest live falsehood: the app says LIVE
and draws Earth ~280° out of phase, so the terminator, the 8k night-lights map
and the shipped eclipse shadow all land on the wrong continents — and the phase
origin is a constant whose own comment admits it was tuned to flatter one
country's afternoon.

F-01 and F-02 **cannot be split.** IAU W is measured from node Q, and
`setFromUnitVectors` leaves the azimuth about the spin axis arbitrary, so bolting
W onto the existing minimal-rotation basis is meaningless. They are one change to
one function.

**The helper already exists.** `computePoleOrientationQuaternion`
(`moonSceneFrame.ts:50`) is already IAU-pole-first with an `axialTilt` fallback
and is already live in both render branches (`Planet.tsx:177`, `:634`).
`src/lib/bodyOrientation.ts` **absorbs and deletes it**, re-pointing `Planet.tsx`,
`moonSceneFrame.ts` (which keeps only `satelliteUsesParentEquatorialFrame`) and
`PlanetModel.tsx` — creating it alongside would ship two competing orientation
sources, the exact defect this wave is named for. Two pure exports:
`computeBodyPoleQuaternion` building an explicit `makeBasis(nodeDir, poleDir, third)`
with an asserted positive determinant, and `computeSpinAngleRad` returning
**unwrapped** W. `calculateRotationAngle`, `EARTH_ROTATION_OFFSET_DEG`, the
`earthRotationOffset` prop chain and the `rotationOffsetDegrees`/`rotationEpoch`
schema fields are deleted in this wave.

**Step-1 gate, before any satellite data lands.** The sub-solar longitude from
pole quaternion + W at a 2026 date matches the GMST-derived value within 0.1° —
GMST at J2000.0 = 280.46061837° is an anchor that passes through **no**
transcribed constant. Two third-round corrections to this gate. First, the
drafted companion assert — `computeSpinAngleRad('earth')` at J2000 equals
190.147° — is **circular**: at d = 0 it reads back the transcribed W₀ and verifies
nothing. Drop it; the GMST comparison is the real gate. Second, **the 0.1°
tolerance is load-bearing at exactly 0.1° and must not be loosened.** IAU W is a
TDB expression, GMST is a UT quantity, and ΔT ≈ 70-75 s in 2026 is 0.29-0.31° of
Earth spin — so feeding the spin from a raw UT day count fails by ~0.3° one way
and feeding GMST jdTDB fails by ~0.3° the other. Only the correct pairing passes.
Widening to 0.5° "because it's close" readmits both wrong forms. State the
signature as `computeSpinAngleRad(body, jdTDB)` with jdTDB from the existing
`dateToTDB`, computed **once per frame and shared** — `calculateDeltaT` allocates
a `Date`, and calling it per body per frame is needless churn in a file that
otherwise uses `TMP_` scratch religiously.
`npm run test:run -- regression` proves positions did not move. Earth's sub-solar
point sits near Greenwich at 2026-03-20T12:00:00Z and near the antipode at 00:00Z
— **this stays a smoke, never a tight assert**: the equation of time puts it ~1.9°
west of Greenwich on that date, so a tight bound would fail a _correct_ model. **NEW-2 is fixed in the same diff:** the cloud super-rotation multiplies
the **rate**, not the wrapped angle, so the once-per-day 10.7° snap is gone. **No
per-texture seam-offset field is introduced**, with the derivation **corrected
2026-07-26**. `SphereGeometry` does put the u = 0.5 meridian on mesh **+X** —
the leading minus on `vertex.x` (`three/src/geometries/SphereGeometry.js:100`)
gives u = 0 → −X, 0.25 → +Z, 0.5 → **+X**, 0.75 → −Z. The original justification
via `ecliptic2ThreeJs` was a **non-sequitur** (that function remaps the orbital
engine's position vectors and never touches the mesh-local texture path); the
real argument is rotation handedness — `rotationRef.rotation.y = W` and `R_y(+W)`
maps +X → −Z, the same sense in which u increases. And the residual is **not zero
by construction**: it is zero **given the equirectangular convention that
longitude 0 sits at u = 0.5**, which is a property of the asset, not of the
geometry. **Assert it once, in this gate, against Earth's Greenwich check** —
do not assume it holds for Ganymede's or Iapetus's map.

**Step 2 — nineteen bodies, not eighteen.** The analytical satellite record holds
exactly 18 keys and **the Moon is not among them**: it is `ELP-MPP02-trunc`,
served by `moonElp.ts`, and its catalog record carries no `poleRA`/`poleDec`. Left
as drafted it would fall to the `rotationPeriodHours` fallback with W₀ = 0 and an
unconstrained phase origin — flatly contradicting this wave's own smoke, which
demands the near-side maria stay Earth-facing. So: the eighteen analytical
satellites **plus the Moon** plus Pluto and Charon carry poles and W terms
transcribed from **Archinal et al. 2018, Tables 1 and 2, read out of the source at
edit time — never copied from this file or from any plan**, with Pluto and Charon
sharing α₀ 132.993 / δ₀ −6.163 at a 180° W offset. **Decide and record for the
Moon specifically** whether it gets the full E₁–E₁₃ physical-libration series or a
mean Ẇ with the libration terms deferred. **Third-round correction: the rationale
for that choice was backwards, and it flips the decision.** The visible ±8°
rocking is **optical** libration and comes out automatically from real ELP
positions plus a _uniform_ Ẇ — longitude libration ≈ 2e ≈ 6.3° from orbital speed
variation against uniform spin, latitude libration ≈ 6.7° from the equator tilt
already carried by a constant J2000 pole. The E-series adds the pole's 18.6-year
precession and physical libration, roughly a ±3-4° slow correction that reads as
nothing. So a mean-Ẇ Moon **will** visibly rock, and ~50 more transcribed numbers
buy accuracy no learner can see. Ship mean Ẇ with a J2000 pole and a JSDoc stating
that nutation and physical-libration terms are dropped and the sub-Earth point is
good to about 5°, cycling over 18.6 years. The smoke's "rocking proves the model"
therefore proves the _positions_ are real, not that W is right — which is why the
sub-observer fixture below is the actual instrument.
**The same decision is unspecified for the other 18**, whose IAU expressions also
carry trig terms (and Phobos a quadratic). Prescribe once: transcribe secular
terms, record each body's dropped amplitude in its JSDoc, and check that amplitude
against the ~1° lock budget so the truncation and the gate are sized together. Fixtures exist for all of them (`moon-2025-01-01.json` and two
more), so the "zero new fixtures" arithmetic still holds. For each body, its
Horizons fixture vector transformed into the body-fixed frame gives sub-parent
longitude 0 within its optical-libration amplitude (~8° Moon, ~1° others). The
Moon must **visibly rock**: a face-the-parent hack would pass a static check and
kill libration. No pole is added to Orcus or Quaoar — none is measured, and
`Planet.tsx:1041` mounts equatorial-framed children under the parent quaternion,
so a parent pole would move Vanth and Weywot.

**Charon needs a relative pole, and Pluto's pole moves Charon.** Charon is
Kepler-primary, so `satelliteUsesParentEquatorialFrame` is **true** for it and it
is mounted **inside** Pluto's quaternion group (`Planet.tsx:1041`) — pinned by
`moonSceneFrame.test.ts:262-269`. Giving Charon an **absolute** IAU pole therefore
composes `Q_pluto · Q_charon` and breaks the very mutual lock this wave is trying
to demonstrate. Two acceptable resolutions, pick one and record it: pass Charon's
pole **relative to Pluto's frame** (`Q_pluto⁻¹ · Q_charon`), or move Charon out of
`equatorialChildren` by giving it ecliptic-J2000 elements in the same diff.
Second-order and unmentioned in the first draft: giving **Pluto** a pole also
changes **Charon's position**, because the same quaternion rotates the
equatorial-frame Kepler elements, and replacing `setFromUnitVectors` with an
explicit `makeBasis` pins an azimuth that was previously arbitrary. Charon has no
Horizons fixture, so the suite physically cannot see that move — the smoke is the
only instrument, and it must check Charon's orbital longitude against main, not
just the face lock.

#### Third round — what an independent review added

**The mutual-lock smoke is undecidable as drafted, and that is how this wave
ships a confident invention.** Charon's record carries `O: 0, w: 0, M0: 0` —
fabricated, the same class this plan hides Ω/ω/M for in W2 — and `n: 56.3` against
a true 56.362°/day, which is **22.8° of orbital phase per year** and roughly 590°
accumulated since J2000. The rendered lock is `W_pluto(t) − λ_charon(t)`, so with
perfectly transcribed constants the smoke shows a **broken** lock at an angle that
depends on the sim date. The predictable response is to nudge W₀ until it looks
right today — un-transcribing a constant inside the wave whose entire risk section
is about recalled constants. The other drafted instruction, "check Charon's
orbital longitude against main", measures a quantity with no truth value; it can
neither pass nor fail meaningfully.
**Resolution: one Charon fixture at 2025-01-01 plus a derived-elements entry.**
Both scripts already exist and produced all 18 analytical element sets from
exactly this input. It makes the smoke decidable, kills the 22.8°/yr drift, and
lets Charon join the same fixture-based lock check as everyone else. The "zero new
fixtures" line was optimising the wrong thing.
**Trap inside the drafted option (b):** giving Charon ecliptic elements does _not_
move it out of `equatorialChildren`, because the mount discriminator is
`!hasAnalyticalEphemeris(id)` — **registry-derived, not element-derived**. New
elements alone still route through `keplerProvider` and still mount under Pluto's
quaternion, double-rotating them. Option (b) requires Charon to become an
analytical satellite in the registry, which the fixture route delivers naturally.
And note that under option (a) the "relative pole" is analytically **the
identity** — Pluto and Charon share α₀/δ₀ and Ẇ, so it reduces to
`W_charon = W_pluto + 180°`, nearly free but true by construction, which means the
smoke would prove nothing about the constants.

**Triton is the unnamed casualty and the unclaimed win.** It is F-02's largest
remaining instance — seventh-largest moon in the system, shipping a 4k texture,
`axialTilt: 0`, no pole — and the `makeBasis` azimuth re-pin **moves it**, because
Neptune already carries a pole and Triton is a legacy equatorial child mounted
under it. That is the same second-order effect this wave documents for
Charon-under-Pluto, in the one other place it occurs, currently unmentioned. Three
Triton fixtures are already on disk and `moonSceneFrame.test.ts` says outright
that its fabricated-node assertion "is expected to be inverted" when Triton gets
real elements. Same half-day, same tooling: it retires a disclosed 150° envelope
and lets Triton take a real pole. If declined, the wave must say F-02 stays open
for Triton and why — "One pole, one spin" currently implies a closure it does not
deliver for the most prominent body it skips.

**The lock check is blind to a whole class of transcription errors.** Sub-parent
longitude _and_ latitude are both invariant under rotation of the pole about the
axis pointing at the parent — so a δ₀ digit-swap that happens to tilt the pole
along that line sails through, and the two anchors that bypass transcribed
constants are Earth-only. The mitigation as drafted guards **intent**, not error,
for 20 of 21 bodies. Three instruments close it, all nearly free:

- **Horizons sub-observer fixtures.** The existing generation script hits the same
  API with `EPHEM_TYPE: 'VECTORS'`; switching to `OBSERVER` with `QUANTITIES: '14'`
  and `CENTER` at the parent returns sub-observer longitude **and latitude** as
  truth values. That turns the lock check from "≈ 0 within an amplitude I also
  assumed" into "equals what JPL computes". Not independent of the IAU _model_,
  but fully independent of **this repo's transcription**, which is the named risk.
- **Pole vs orbit normal**, zero cost: the repo's own elements were least-squares
  fitted to Horizons vectors and never touched Archinal, so the angle between a
  transcribed pole and the fitted orbit normal is an independent gross-error trap.
- **Run the lock check at every fixture epoch, not one.** Five epochs spanning
  2024-01→2026-01 are on disk. A single-epoch check is blind to Ẇ typos — exactly
  the "wrong Ẇ only diverges over years" failure the risk section names without
  prescribing the fix that is already sitting in the fixtures directory.

**The two-function API is the wrong shape twice.** It is _frame-mislayered_ for
its own declared consumer: W11 imports it to rotate ecliptic-J2000 **elements**,
which live in the astro z-up frame, while the planned function returns a
`THREE.Quaternion` in the Y-up **scene** basis — applying one to the other is
wrong by a signed axis permutation and produces plausible garbage. The existing
`equatorialToEcliptic` inherits this because it silently does two jobs under a
name claiming one, with the scene remap hand-inlined and duplicating
`ecliptic2ThreeJs`. Three layers instead: a pure three-free core in the astro
frame (`resolveIauOrientation(bodyId, jdTDB) → { poleEcl, nodeEcl, spinDeg }`) —
what W11 imports and what unit tests pin; a thin scene adapter applying
`ecliptic2ThreeJs` from `coordUtils` plus `makeBasis` and the determinant assert;
and `computeSpinAngleRad`. It is also _time-blind_: IAU poles are functions of
time, and both consumption sites freeze the quaternion in a `useMemo` keyed on
scalars and a JSX prop that R3F applies on reconciliation only. Give the pole
group a ref and write the quaternion in the same `useFrame` that writes
`rotation.y`; keep the satellite-mount quaternion reconciliation-static with a
documented "parent pole evaluated at the 4 Hz tick" approximation. Prefer one
structured `iauOrientation` schema field over four loose scalars — its presence
then _is_ the has-a-real-solution discriminator instead of `poleRA !== undefined`
sniffing.

**Adjacent, and visible.** The two render paths disagree on the tilt **sign**
today — `moonSceneFrame.ts` uses `Euler(0, 0, −tilt)` while `PlanetModel.tsx` uses
`+tilt` — and all four model bodies carry a nonzero tilt (haumea 28°, vesta 29°,
pallas 84°, hygiea 60°), so unifying them swings each azimuth by 2×tilt, **up to
168° for Pallas**. The unification is right (both azimuths are arbitrary) but it is
a visible change on a path this wave's smoke never opens: add one GLB body to the
smoke and record the intended flip. Related: GLB and OBJ meridian alignment is
unverifiable, so those bodies **stay on the fallback even where Archinal has a W
row** — transcribing W₀ for a mesh with unaudited axes converts a measured number
into a false claim, and the per-texture seam warning must extend to the model path.
Also worth one comment, not a fix: `Planet.tsx` inverts `rotationRef.matrixWorld`
in the same `useFrame` that writes `rotation.y`, so the ring-shadow and atmosphere
sun-locals lag the spin by a frame — invisible at today's near-static azimuth,
worth knowing once the spin is real and fast under warp.

**Checked and clean, so the wave need not fear them:** night-lights, terminator
and cloud lighting all use world-space `uSunPositionWorld` with the Sun at origin,
so they are azimuth-independent and the geography correction flows through with no
shader edit; only Earth has a cloud texture, so the 1.03 super-rotation factor
touches nothing else; the prograde arrow and orbit lines are pole-independent; and
the boot pixel gate freezes at a fixed epoch, so the Earth-azimuth change shifts
that baseline once, deterministically.

**OPP-PC needs two lines it does not have.** Compute the barycentre offset from
**Charon's own rendered display vector** (mass ratio × the same vector that
positions Charon), never from an independent evaluation, or Pluto's wobble and
Charon's position desync. Deriving it from the rendered vector also makes the
offset inherit Charon's didactic exaggeration for free — otherwise Pluto's circle
collapses to sub-pixel in didactic while Charon orbits at an exaggerated radius,
breaking the very relative-geometry claim being fixed.

**Provenance nit with teeth:** cite Archinal et al. 2018 **including the 2019
erratum**, which corrected table entries — not bare "IAU/WGCCRE 2015".

**Schema and the second render path.** `axialTilt` becomes `axialTilt?: number`
with a JSDoc naming it a legacy display field superseded by `poleRA`/`poleDec`
and retained for records with no measured pole — the fallback at
`moonSceneFrame.ts:69` is load-bearing for Vanth, Weywot and the TNO moons, and
deleting the field would destroy measured obliquity for bodies with a tilt but no
pole solution. The 27 invented `axialTilt: 0` values are scrubbed where a real
pole now exists; W2 already made the display safe. `PlanetModel.tsx`'s Z-Euler
group is replaced by `computeBodyPoleQuaternion(body)` so both render paths share
one orientation source. `moonSceneFrame.test.ts`'s
`expect(pluto.poleRA).toBeUndefined()` pins the exact data gap being closed and is
rewritten to the new invariant or deleted, not worked around.

**OPP-PC rides in the tail.** Pluto visibly circles a barycentre 1.79 of its own
radii outside its surface every 6.39 days — the defining property of the only true
binary in the catalog, asserted in Charon's own curiosity text and denied on
screen. The split lands as a named function beside `resolveOrbitalDisplayPosition`,
**never** as an `if (body.id === 'pluto')` in `Planet.tsx`. **No ratio test** — it
would restate the implementation line, and the sign error it guards is visible in
the same smoke. The JSDoc states out loud that this is a **modelled convention**
justified by a measured mass ratio, that Meeus Ch. 37's own stated accuracy
(~30 000 km in the radius vector) is 14× larger than the 2 126 km offset, and that
no fixture can adjudicate whether the series returns Pluto's centre or the system
barycentre. It must **not** claim improved heliocentric accuracy. It is a strict
improvement under both readings: if the series returns the barycentre the offset
makes Pluto correct, and if it returns Pluto's centre it introduces an error 14×
below the series' own noise floor while fixing a relative-geometry claim the app
prints in text. `regression.test.ts`'s pluto tolerance is **not** widened — if it
needs widening, the sign is wrong.

**Also:** add the standing-law-3 rule to `../lessons.md` as a short
Trigger/Rule/Action/Source entry.

**Verification.** `npm run test:run -- bodyOrientation moonSceneFrame regression && npm run test:coverage && npm run lint && npm run build`.
Smoke, which a headless pass does not substitute for: Earth at both 2026-03-20
timestamps; two simulated days at high speed watching the cloud layer for the
snap; the Moon over a full month at ~5000× — the near-side maria must stay
Earth-facing **while rocking gently**, and that rocking is the proof the model is
right rather than a hack; Pluto for mutual lock and the small circle (Charon has
no Horizons fixture, so the suite physically cannot see it move — the smoke is
the only instrument). Then `npm run test:e2e` and a deliberate, explained
re-bless if the boot frame moved.

**Risk.** This wave ships ~29 recalled constants under a "measured, IAU/WGCCRE
2015" provenance tag, and a wrong W₀ renders as a perfectly plausible planet while
a wrong Ẇ only diverges over years of simulated time. `calculateRotationAngle` has
zero tests, so nothing on disk pins the behaviour being replaced. Any body whose
numbers cannot be sourced stays on the `rotationPeriodHours` fallback with W₀ = 0
and a JSDoc line stating its phase origin is unconstrained — **an honest gap beats
a confident invention.**

---

### W7 — Eclipses happen when eclipses happen · **high** · 4-5 days

**Items:** F-03, OPP-ECL-SCOPE, D-04 (deletion), NEW-4

The last place where the app renders a physically false statement in its
**default teaching mode**. Follows W6 so the shadow also lands on correct
geography.

**Shared mechanism.** New `src/lib/eclipseGeometry.ts` exporting
`resolveEclipseConeGeometry` — the **single** body-level shadow-cone predicate,
consumed by the per-frame driver here and by W8's badge and scan. Nothing may
grow a second predicate: if the badge and the render disagree about whether an
eclipse is happening, that is the worst possible outcome for an honesty-first
product. Its header cites `heliocentric.ts:11-15`, whose own JSDoc already states
this item's exact principle — that didactic mode would lie about real distances
if sampled via scene-graph `getWorldPosition()`.

**Performance is part of the contract, not an afterthought.** Resolve the two AU
vectors on a sim-time throttle (the `CAMERA_ASSET_INTEREST` pattern at
`Planet.tsx:787-791`) into module-scope `TMP_` vectors and a ref — **not** per
frame per body. `resolveHeliocentricPositionAU` recurses up the parent chain and
`.clone()`s at every level, and the engine's own comment records that under time
warp every frame produces a unique cache key, so 13 moons would mean ~26 full
analytical evaluations and ~40 allocations per frame in a file that otherwise
uses `TMP_` scratch religiously. Give `resolveEclipseConeGeometry` an
out-parameter so it allocates nothing. Cache the eclipser `Object3D` in a ref
(copying `SmartSunLight.tsx:118-130` in shape), which removes a per-frame
whole-scene DFS and pins NEW-4's currently-accidental resolution.

**Exit criteria.** `resolveEclipseConeGeometry(earth, moon)` returns active at
2024-04-08T18:18Z and inactive at 2024-05-08T03:22Z, **scale-mode independently**,
with anchors in its JSDoc that were **recomputed 2026-07-26** — the first draft's
numbers came from the **mean** Earth–Moon distance rather than the distance on
eclipse day, which inverted the sign of the umbra and would have forced the
2024-04-08 **total** eclipse to render annular. Correct values from this repo's
own ELP and VSOP providers at 2024-04-08T18:18Z (`d_se` 149 463 545 km, `d_er`
**359 804** km): umbra **+64.9 km**, penumbra **3 417.5 km = 1.968 R_moon**.
The positive umbra **is** the falsification test that the event renders total.
Cross-check that does not pass through the same arithmetic: the perpendicular
distance from Earth's centre to the shadow axis comes out 2 192 km against a
published gamma of 2 188 km. The Io/Jupiter anchor carried the same slip this
plan calls F-09 — it was derived from Jupiter's **equatorial** 71 492 km while
the code feeds `radiusKm` **69 911**, so the anchors are **69 558 / 70 343 km**.
**Anchors are computed at the instant, never from mean distances.** `vrScale` is
recomputed from the synthesized point — the current `receiverWorldPos.length()*2`
is already marginal and **fails silently** once the axis point moves to physical
range, because `dist_segment_point` then returns an endpoint distance and the
shadow quietly does not appear. `uEclipsingBodyRadius` is replaced by
`uEclipsingUmbraRadius` + `uEclipsingPenumbraRadius` in **all three** declaration
sites (cloud, Earth, eclipse-only) — missing one is a runtime-only GLSL
"undeclared identifier". **The rename also touches the driver's READ sites, in
the same commit.** `Planet.tsx:408` reads `s.uniforms.uEclipsingBodyRadius` and
`:411` is `if (!uPos || !uRadius || !uVrScale || !uActive) continue;` — a
rename that updates only the declarations leaves every material failing that
guard, so `uActive` is never written and **all eclipses stop firing with no
console error at all**, because the injected GLSL still compiles. This is the
single most silent failure in the wave.
**W3's regolith patch survives this rewrite verbatim.** Io, Europa, Ganymede,
Callisto and Enceladus reach W3's trailing branch today; the moment they gain
`eclipsingBodyId` here they jump into the eclipse branch — the one this wave
rewrites — and its only Lommel-Seeliger copy is the one W3 put there for the
Moon. Assert after the rewrite that all five still carry LS; otherwise five
moons revert to Lambert silently, with no test and no console line. `uEclipsingMinShadow` makes annular eclipses render
annular rather than total. `computeEclipseShading`, `eclipseBlend`,
`distSegmentPoint`, `getDiffractionSpectrum` and their 26 test cases are
**deleted** while the constants `eclipseShaderPatch.ts` interpolates survive, and
the file's JSDoc is rewritten from "pure-TypeScript mirror" to the constant
registry it actually is. Fix three mislabelled comments while there:
`eclipseMath.ts:123` says "Atlas uses km units" and `eclipseShaderPatch.ts:41`
says "world-space radius (km)" — every quantity in this path is three.js **world
units** (1 wu = AU/1000), not km. Harmless today because the mislabel is uniform,
but it is what led an external reviewer to report a nonexistent 1e5 unit
mismatch, and this plan's own standing law 4 says the sentences that describe a
number get corrected with it. Thirteen moons gain `eclipsingBodyId` with **zero** code
change, and Io darkens through a visible gradient on ingress rather than snapping
— today's fixed `UMBRA0 = 0.04` at Jupiter's radius is 2 861 km, larger than Io
itself. Realistic mode is visually identical to main.

**Not in scope:** the if/else-if restructure (paid only when a ringed planet first
gets an eclipser) and Jovian shadow transits — see the appendix.

**Verification.** `npm run test:run -- eclipseGeometry eclipseMath && npm run test:coverage && npm run build && npm run lint`
— the build is the proof no still-interpolated constant was removed. Smoke: in
**didactic** mode set 2024-04-08 18:18 UTC with Earth focused; a penumbral spot
must appear. Step to 2024-05-08 03:22 UTC; the disc must be completely clean,
where today it shows a shadow. Repeat both in realistic and confirm no visible
change from main. Then a known Io ingress and egress, plus a negative control
across a full Io orbit at a non-eclipse time. Measure frame time at 1 yr/s with
Jupiter and all four Galileans on screen, before and after. Read the console at
error **and** warn for "undeclared identifier" from all three patched materials.

#### Third round — what an independent review added

**BLOCKING: the app has a second eclipse renderer and this wave only fixes the
first.** `SmartSunLight` is a `castShadow` directional light, and every non-star
surface mesh carries `castShadow` (`Planet.tsx:441`). Shadow _receipt_ is
layer-limited to the tracked subtree, but shadow _casting_ is not — three filters
casters by the render camera's layers and every mesh stays on layer 0, so any
`castShadow` mesh inside the frustum renders into the map. The frustum reaches
other bodies: in realistic mode the light sits ~10 wu sunward with `far ≈ 10.14`,
and the Moon at 2.57 wu from Earth is comfortably inside it. On 2024-04-08 the
Moon paints its **full hard silhouette — 1738 km radius, ~27% of Earth's radius —
onto Earth through a 4096² map**. The physically correct render this wave ships is
a 3417 km _soft_ penumbra around a 65 km umbra; the shadow map's hard disc is 27×
the umbra radius and will visually dominate the corrected look. Same for Io under
Jupiter. And in **didactic** mode with Jupiter focused, Io's shadow transits on
Jupiter's cloud tops **are already rendering today**, at didactic-wrong times, via
this path — the exact feature the appendix records as deferred and not shipped.
This wave's gates are structurally blind to it: "realistic mode visually identical
to main" **passes**, because the disc exists on main too.
**The fix is one line and provably lossless.** Enumerate the shadow map's real
consumers: clouds cast, the planet surface receives, rings already opted out with
the comment _"receiveShadow removed to prevent double shadows (we use analytical
shadows)"_, clouds do not receive, and non-tracked bodies are not lit by the
directional light at all. The surface sphere is **convex**, so its own `castShadow`
can never produce a legitimate self-shadow — it serves nothing except cross-body
blobs. Delete it (keep the cloud mesh's) and the whole class dies. It belongs in
**this** wave, because "eclipses happen when eclipses happen" is false while a
second renderer fires on scene-graph geometry. Audit the GLB path separately —
Vesta is non-convex, so self-shadowing there is a real and different question.
First act of the wave: a five-minute browser check (realistic, 2024-04-08 18:18,
Earth focused, toggle the directional light) settles it before any code.

**Lunar eclipses are already shipped, and this wave would regress them to a black
disc.** The Moon already carries `eclipsingBodyId: "earth"`, and its own catalog
comment promises "the signature blood-moon red tint comes from the diffraction
spectrum". Run the computed cone through the lunar geometry and Earth's umbra at
lunar distance is ~2.6 R*moon — **the whole Moon fits inside it**, `shdw = 0`
everywhere, and totality renders **black** where today an accidental copper wash
appears. That is a fidelity \_and* wow regression on the most commonly observed
eclipse type there is, inside the wave named for eclipse fidelity, and the drafted
exit criteria contain **zero lunar anchors**. Two obligations, whichever path is
taken: add the anchors (`resolveEclipseConeGeometry(moon, earth)` active at the
2025-03-14 total lunar eclipse, inactive at an ordinary full moon, recomputed from
the repo's own providers at edit time per this wave's own anchor discipline), and
decide the umbral floor. Closing it honestly is small because the shader is
already open: floor the umbral blend at a red-orange refracted term — sunlight
through Earth's limb atmosphere, ~10⁻³–10⁻⁴ of direct — shipping a typical Danjon
L2–L3 value with a JSDoc disclosing that the _existence and colour family_ are
measured physics while the brightness on any given night is not predictable. About
half a day. Note W8 already assumes lunar events exist, so the badge will report
eclipses the renderer would draw as a black disc.

**The diffraction machinery is keyed to the uniform this wave deletes, and the
plan never says what happens to it.** `penumbraRadius`, `diffractionStart` and
`diffractionEnd` are all products of `eclipsingBodyRadius`. Replacing that uniform
leaves the band, the intensity scale, the spectrum gradient and the edge-fade
gates dangling with no stated re-keying — an implementer either gets a compile
failure (benign) or silently re-keys to the penumbra radius with no criterion
saying what is correct. Decide it here. Recommended, flagged as judgement:
**delete the tint for solar receivers** — seen from space, penumbral shading is
neutral, and the orange band is an uncited artistic inheritance from a reference
this project no longer treats as law — and **repurpose the spectrum constants as
the lunar refraction floor above**, which is the one place an orange-red term has
real physics behind it. That also settles which constants the shader patch still
legitimately registers.

**Specify the synthesis transform; it is the actual heart of the wave.** The
drafted criteria pin _when_ but not **where on the disc or how large**, and the
predicate anchors are scale-mode-independent by construction so they constrain the
AU math and not the AU→render mapping at all. There is one clean answer: a
**similarity transform anchored at the receiver's centre**. With
`s = receiverRenderRadius / receiverRadiusKm`, publish synthetic eclipser position
`= receiverWorld + s·(E⃗−R⃗)`, umbra and penumbra radii `× s`, and
`vrScale > 2·s·|E⃗−R⃗|`. That preserves every angular relationship per fragment, so
the existing per-fragment machinery stays valid unmodified — which is also the
answer to whether a body-level predicate is the right abstraction when the shader
needs a per-fragment answer: **yes, if and only if the helper emits a
similarity-transformed configuration rather than mixed-frame scalars.** Two free
consequences: in realistic mode `s = KM_TO_3D_UNITS`, so the transform degenerates
to the identity and "realistic is scale-faithful" holds **by construction** rather
than by testing; and a mixed-frame implementation would pass every drafted anchor
while drawing the spot the wrong size. Add the render-side anchor the wave lacks,
which W6 makes checkable: at 2024-04-08 18:18 UT the penumbral spot is centred
over northern Mexico / Texas with radius ≈ 0.54 × Earth's rendered radius.
Also derive `uEclipsingMinShadow` rather than tuning it — the annular floor is
`1 − (θ_moon/θ_sun)²` on the axis, computable from the two distances the helper
already holds, with the 2023-10-14 annular obscuration (~0.90) as the independent
check standing law 3 requires. Going further than two radii — oblate umbra ~0.3%,
atmospheric enlargement ~2%, limb-darkened penumbra profile — is sub-pixel at
reachable zooms: name the three omissions with magnitudes in the JSDoc and stop.

**NEW-4's fix is a deletion, not a pin.** Post-W7 the driver needs the eclipser's
**mesh** for nothing — position comes from the AU resolver, radius from the
catalog — so the ambiguous `scene.getObjectByName` lookup becomes dead code and
NEW-4 dissolves rather than being pinned. One consequence to record: `active`
currently drops when the eclipser mesh is unloaded or hidden, but physically
Earth's shadow on the Moon exists whether or not Earth's mesh is mounted. Key
`active` off the predicate alone and say so — it is the fidelity-first reading and
it removes a load-order dependency.

**Two scope notes.** The sim-time throttle degrades badly in both directions: at
high warp it becomes per-frame anyway, and at _low_ warp with a moon receiver it
must still tick every few sim-seconds or Io's ~785 km penumbra–umbra annulus (~45 s
of sim time, whole ingress ~4 min) renders as a stuttering lagging edge. The
cleaner gate is the one the driver already holds — skip resolution entirely for
receivers whose `cameraInterest` is hidden, resolve per-frame for the handful on
screen; measure before optimising further. And record that the 13-moon selection is
a **perf** criterion, not a physics one: pre-W7 withholding `eclipsingBodyId` was a
correctness necessity because the tuned cone would fire garbage, but the physical
predicate makes over-assignment safe — a Uranian moon would simply almost never
eclipse, its seasons being ~42 years apart, which is itself a nice teaching fact.

**One opportunity worth riding along, at near-zero cost.** Atlas will compute
_geometric_ Io eclipse times with no light-time correction. That discrepancy — up
to ~16.6 minutes across Earth's orbit — is literally how Rømer measured the speed
of light in 1676. One curiosity string on Io plus one JSDoc line on the scan
("times are geometric; light-travel delay, up to ~17 min at Jupiter, is not
modelled") converts a model limitation into the best teaching hook in the app.

---

### W8 — Reach and discovery · medium · 3.5-4 days

**Items:** OPP-BROWSE, OPP-HOTKEYS, OPP-ECL-UI

A learner who does not already know the word Enceladus can find Enceladus, pause
time from anywhere, and be told when a shadow is actually falling.
OPP-ECL-UI sets the wave's floor — building the badge before W7 would put a UI
claim on a shadow that fires ten times too often, which is strictly worse than
silence.

**Exit criteria.** An empty Search box lists all 45 bodies grouped Sun / Planets
(moons nested) / Dwarf Planets / TNOs / Asteroids under a header disclosing that
45 is **not** a complete inventory (Jupiter has 95 known moons and Atlas ships 4),
in a scrolling container — the empty-state div has no height cap today while the
results list already does. **Browse rows are plain `<button>` elements sharing
only the visual classes**; the container keeps `role={undefined}` and the
`listbox` / `aria-activedescendant` machinery stays confined to the query branch —
pasting `role="option"` rows into the empty state would emit 45 orphan options
with no listbox owner. Add an assert to the a11y e2e spec that an empty-query
panel exposes zero `role="option"` nodes. `SEARCH_QUICK_TARGETS` is deleted. The
page body never scrolls horizontally at 390px.

**The visibility auto-enable walks `parentId` to the root**, not one level:
`SolarSystem.tsx` renders every child inside its parent's `<Planet>`, so hiding
the `planets` category unmounts Jupiter _and_ all four Galileans, and enabling
only the selected body's own category leaves 23 of 45 bodies dead-clicking. Use a
read-then-toggle guard so an already-visible category is never flipped off. It
lives in `SearchBar`'s shared `handleSelect` so browse and query results cannot
diverge on a pre-existing dead click.

Space toggles play/pause exactly once **even when the Timeline play button has
focus** (the existing `isTyping` guard covers only INPUT/TEXTAREA/contentEditable,
and Space on a focused BUTTON fires a native click), types a space inside a text
field, does not scroll the page, and appears in the `?` sheet. Speed-step hotkeys
are explicitly out of scope — `TIME_STEPS` is module-local to Timeline and
binding it means extracting that state machine.

The eclipse badge appears at 2024-04-08 18:18 UTC and is gone at 2024-05-08, sits
behind the same `BODIES_BY_ID` guard documented as the fix for a prior
`console.error` storm, is labelled a **geometric shadow-cone intersection** rather
than a visibility prediction, quotes the model's accuracy in **minutes never
seconds**, and never implies an observer location — "a shadow is falling on Earth
now", never "visible from your city". **The forward scan brackets candidates at syzygy, not by endpoint sign change** —
corrected 2026-07-26. The first draft's 6 h coarse step **misses every eclipse in
the decade**: the 2024-04-08 intersection window is 5.17 h (15:42→20:52 UTC,
reproducing published P1/P4 to about a minute), so samples at 15:00 and 21:00 are
both negative, and the shortest windows in ten years are **2.28 h** (solar,
2029-07-11) and **1.45 h** (lunar, 2031-06-05). No fixed step is ever safe here,
because a near-grazing event's window shrinks continuously to zero — the scan is
hunting a transient positive bump in a smooth function, not a sign change. Bracket
from mean lunar elongation, which is monotone and cheap, or detect local maxima of
the cone-margin function, then bisect to ~1 min. That collapses the cost to ~50
candidates and a few hundred evaluations; a fixed 30-min step would instead be
~70 000 samples, **12× the budget the first draft assumed**. Either way it runs
off the render path **with its own engine instance or a bounded scratch cache** —
the shared cache holds 2 000 entries with oldest-insertion eviction, so a naive
scan flushes the live position cache and every visible body takes a cold-miss
frame right after the click. Both locale bundles carry every new key.

**Four badge exposures the drafted guardrails do not cover** (third round).
**Penumbral-only lunar eclipses** are ~35-40% of all lunar eclipses and are
invisible to the naked eye — a badge reading "a lunar eclipse is happening" during
one is geometrically true and perceptually misleading, and the app's own render
will rightly show almost nothing. The cone geometry gives the vocabulary for free:
_penumbral contact / umbral contact / umbral axis on the surface_. Use it, and
either suppress penumbral-lunar or tag it "not visually perceptible". This is the
claim the plan is closest to making and cannot support in a one-bit form.
**Type labels are falsifiable**: hybrid events exist inside the scan decade
(2031-11-14), so the badge may state only the **instantaneous** geometry — the
sign of the umbra radius at the axis-surface intersection right now — and must
never classify an event as a whole. **The scan horizon must be clamped to the
providers' disclosed validity**; "reproduces P1/P4 to about a minute" was measured
at 2024, and a confidently printed 2045 date is invented precision — validate once
at the far end of the horizon or quote looser there. And **scope the badge**: with
13 armed moons, Io alone is eclipsed most 42.5 h orbits and would make it a
permanently-lit lamp. Report the **focused body's system** (focus Io → Io's
eclipse; focus Earth or nothing → Earth/Moon), which solves always-on and turns
the Galilean events into a discovery surface rather than noise. Product judgement,
flagged as such.

**Verification.** `npm run test:run -- i18n bodySearch && npm run lint && npm run build`.
Smoke at both viewports: empty Search lists 45 grouped bodies, scroll to the
bottom, click Enceladus; **hide Planets, browse to Enceladus, and confirm Saturn
and Enceladus both mount and the camera focuses** (Ceres alone is the one case a
single-level fix happens to cover); at 390px confirm the list scrolls inside the
sheet; Space with canvas focus, with the play button focused, and inside a text
field; the two eclipse dates for badge on/off; the scan's found date against
published eclipse canon with the stated accuracy no tighter than the model's;
measure the first frame after a scan completes; flip to pt-BR for raw keys.

---

### W9 — The rings transmit · low · 1-1.5 days

**Items:** OPP-RINGFACE, NEW-3 (deletion)

Flying under Saturn's ring plane stops looking identical to flying over it: the
optically thick B ring goes near-black while the Cassini Division and C ring glow
with transmitted sunlight.

The finding's premise needed correcting first: `DoubleSide` plus three's
`faceDirection` flip means Lambert diffuse **already** inverts. What is genuinely
face- and τ-independent is the emissive floor, which swamps a lit-face diffuse
limited to sin(ring opening) ≤ 0.45. That makes the fix smaller and better
grounded — modulate **only** the emissive, **only** on the unlit face, leaving the
lit face bit-identical so the ratchet cannot be violated.

**No new module.** The ~8 GLSL lines are appended to `planetShadowEmissivePatch`
in `planetShadowShader.ts`, where they are injected anyway. A TypeScript mirror
of two GLSL lines plus a test pinning it is precisely the coverage theatre W7
deletes. The cited precedent is itself dead: **the same commit deletes
`ringShadowMath.ts` and its 96-LOC test** — the only importer is that test, its
docblock admits it exists "solely to pin shader behavior in tests", and the
transform it provides is inlined separately at `Planet.tsx:270-271`/`:292-293`.
`nightLightsMath` stays: it survives on a real utility import.

Note the injection point: `planetShadowEmissivePatch` replaces
`#include <emissivemap_fragment>`, which three emits **before**
`lights_fragment_begin` — so use `vViewPosition` and the post-flip `normal`, not
`geometryPosition`/`geometryNormal`/`geometryViewDir`, which are not yet declared.
`DOUBLE_SIDED` has already flipped `normal` toward the viewer, so
`dot(normal, sunView) <= 0` **is** the shadowed face; no `gl_FrontFacing`, no
`uSunPosition`.

**Exit criteria.** `diffuseColor.a` is **not** touched, so the B ring stays opaque
while going black — that occlusion is the Cassini look. A 0.01 floor keeps the
unlit B ring at ~1% rather than literally 0. Saturn gains its **first**
`visualProvenance` block (fidelity `observational-model`) naming the τ proxy, the
exp(−τ/μ) single-scattering transmission, and the standing limitation that the
shipped alpha strip is painted, with its Cassini dip mapping to ~113 400 km
against the measured 117 580 km inner edge. `RING_EMISSIVE_POWER`'s JSDoc says it
is now the **lit-face** floor. Calibrate against the **shipped** asset only: the
runtime texture is the 8k strip on focus and the 1024×62 boot strip off-focus —
`2k_saturn_ring_alpha.png` has no manifest variant and is unreachable.

**Verification.** `npm run test:run -- celestialBodies && npm run test:coverage && npm run build && npm run lint`.
Smoke: focus Saturn at a clearly non-zero ring opening and orbit from above the
plane to below it, checking four things — (a) the B ring goes near-black on the
unlit side while the Cassini Division and C ring stay visible, (b) Saturn's globe
is **still** occluded by the dark B ring, proving alpha was untouched, (c) the
plane crossing is a smooth ramp rather than a one-frame pop, (d) console clean.
Then `npm run test:e2e` — this changes what the boot frame draws.

---

### W10 — Atmosphere on the disc · medium · 2-3 days

**Items:** D-01, NEW-5, **+ D-02's comment correction**

Earth's day side reddens approaching the terminator and the limb lifts blue — the
ISS orbital-photo look — by compiling the Nishita ground integrator that is
already ported, already compiled, and currently stubbed to `vec3(0.0)`.

Depends on W3 (F-05) so it is tuned against corrected atmosphere brightness, and
it spends the GPU headroom P-01 freed. It has **no** dependency on D-02: the
ground path's `fadeFactor` is `smoothstep(0.5, 1.0, heightNormalized)`, which
clamps to 1 above camera height 1.0125, so unlike the sky path it is at full
strength from every reachable position. Two facts make it complement rather than
double-count: the shell is `BackSide` with depth test on, so its back faces over
the disc are depth-rejected and today's atmosphere is a **limb annulus only**.

**Exit criteria.** Only `#define atmosphereGround` is defined, so the sky
integrator compiles to its `#else` stub. The injection is
`outgoingLight += computeAtmosphericScatteringGround(vAtmPosition)` placed
**before** the existing eclipse output patch, so an eclipse shadow also darkens
the in-scattered light — physically right, eclipsed air is dark air — with the
ordering commented and the additive composition flagged as an **Atlas decision**
rather than a claimed port, because the exact upstream site is not recorded here.
Exactly **one** hand-declared varying (`vAtmPosition = position`) instead of
pasting the vertex snippet, whose `#define out varying` shim would leak into
three's GLSL1 chunks. Reuses `buildAtmosphereUniforms` so the 14 derived scalars
keep one source of truth, and extends the existing per-frame block rather than
computing a second inverse matrix. Gated to ultra/high by a `qualityProfileName`
check **at the call site** — not a new per-feature field in `RESOLVED_PROFILES`
for a single consumer — with `qualityProfileName` in the material `useMemo` deps
so a quality flip does not keep a stale material. `atmosphereShader.ts`'s
divergence entry no longer says the ground function is a no-op stub.

**Folded in from D-02:** `Planet.tsx:334-352` and the `atmosphereDynamics.ts`
header state that the descent-brightening branch is unreachable **through the
dolly path** behind the 1.1 margin against a 1.025 shell, that the same geometry
keeps the T5.1 ESun boost dormant there (`camHeightGr` 0.1 vs `atmosphereHeight`
0.025), and name the one change that would unlock it.
`computeDynamicAtmosphereUniforms` and its test **stay**.

**NEW-5 — a live overbright defect, one clamp.** `minDistance` bounds
camera-to-**target**, not camera-to-body: panning is enabled, the pan offset is
deliberately preserved across focus tracking, and nothing bounds it, so
camera-to-body reaches zero whenever the pan offset equals the orbit radius. At
the body centre `atmFactor = 1.025/0.025 = 41` and `eSun = 10 + 41 × 100 = 4110`
— a **411×** overboost with no lower clamp (`atmosphereDynamics.ts:149-159`). The
surface-mode interlock that would otherwise block the descent arms only for a
focused `type === "planet"` body, is bound to pointer-lock **success** rather than
to surface mode, and stops re-requesting for the session after three failures.
Clamp `atmFactor` to 1.0 (or clamp `camHeightGr` at the inner radius) with a
comment recording that the upstream guard assumed a bounded camera. It is one
line and has no dependency on the rest of this wave — pull it into W1 if the
overbright is ever observed before W10 lands.

**Known limit to state explicitly:** the Earth branch is gated on `textureNight`
having resolved, and Earth carries `eclipsingBodyId`, so before the night map
loads Earth falls through to the eclipse-only branch and the ground in-scatter is
absent. Confirm during the smoke and record whether that is acceptable — it
probably is, being a focus-band luxury. Note also that after W7 gives the Galilean
moons an `eclipsingBodyId`, W3's trailing regolith branch serves Mercury alone —
so nobody removes it as dead code.

**Verification.** `npm run build && npm run lint` — stated, not assumed, to catch
nothing GLSL-side. The smoke is the whole gate (experimental look work gets zero
unit tests until it stabilises): at ultra, park the camera so the terminator
crosses the middle of Earth's disc — before, no colour on it; after, a warm
reddening band on the day side and a blue lift toward the limb, **on the disc**.
Read the console at error and warn for compile failures from the Earth material,
which declares `scale()`, `rayleighPhase()`, `miePhase()` and the intersection
helpers — collisions surface at runtime only. Force constrained and confirm the
block is absent, the material still compiles and the console is clean. Measure
frame time with Earth filling the frame at ultra, before and after. Then
`npm run test:e2e`.

---

## ═══ CHECKPOINT ═══

Ship W1-W10, then **re-decide**. The cut is verified clean: nothing in W1-W10
references tranche 2. Every confirmed fidelity and honesty defect lands before
this line; what follows is additive wow plus one ephemeris refinement that sits
below its own series' error visibility.

**Revised after the third round: roughly 4-5 weeks of solo work reaches here**,
not the 3-4 first estimated — W5, W6 and W7 each grew, W6 and W7 are now both
high-risk, and W6 gained real data work (a Charon fixture, probably a Triton one,
and sub-observer orientation fixtures). The remaining three waves are another 2-3
weeks and buy nothing the earlier ten depend on. If the schedule has to give,
the honest order of cuts is: W5's stage B (stage A is a declared stopping point),
then Triton inside W6, then W10 — never the lunar anchors in W7, because the wave
regresses live behaviour without them.

---

## Tranche 2 — not pre-committed

### W11 — J2 secular precession · medium

**Item:** OPP-J2

**Half-day desk spike as the gate, before any propagator code:** compute
`−1.5·n·J2·(R/a)²·cos i/(1−e²)²` offline for the four `pub` bodies (Phobos,
Mimas, Tethys, Io) and check sign and magnitude against the **signed along-track
residual at one epoch on each side of the 2025-01-01 baseline**, recomputed from
the fixtures. Corrected 2026-07-26: the first draft said to check against the
recorded 5.213° / 3.550°, which cannot confirm a sign — those are **unsigned
maxima over a two-sided window** of a multi-term error budget (the test's own
comment attributes them jointly to nodal precession, apsidal precession, resonance
and J2 short-period terms). A sign flip shows as an error that grows on one side
of the baseline and shrinks on the other; a two-sided max hides exactly that.
If the predicted correction does not match, **the wave does not exist** and cost
half a day instead of five.

**Acceptance gate, non-negotiable — and it must be built first.** Corrected
2026-07-26: "no number in `MULTI_EPOCH_OVERRIDES` may rise" is **not a gate**.
That table holds **tolerance literals** sized at roughly 1.1–1.3× the observed
residual and never below a 0.3°/0.2% floor, edited by hand and written by nothing
— Callisto's 0.024° observed sits under a 0.3° tolerance, so a wrongly-signed term
could **double** its error and pass with 6× margin, and the stated gate is
satisfied trivially by not touching the file. The diagnostic gate is: commit the
current **measured** per-body, per-epoch `angleError` (18 bodies × 4 off-baseline
epochs = 72 values) as a baseline table, then assert element-wise
`newError <= baselineError`, with the four `pub` bodies additionally required to
**drop**. Fourteen of the eighteen mean motions carry `fix` provenance and were
least-squares fitted in-sample, and a fit against along-track error necessarily
absorbs the secular longitude rate — so an explicit term on top can make those 14
worse. If any rises, re-derive with the J2 propagator in the loop and rewrite
every affected provenance tag honestly; that branch is a real possibility, not a
hedge, and it is what turns 4-5 days into 7-8.

Imports `computeBodyPoleQuaternion` from W6 — the secular formulae are valid only
in the parent's equatorial frame while the stored elements are ecliptic-J2000, so
the propagation rotates in, advances, and rotates back. Writing a second
pole-to-matrix conversion in the orbital layer is forbidden. Once residuals drop,
**tighten** the registry validity notes and the accuracy block in the same commit
— leaving stale disclosed numbers would be an honesty regression even though the
physics improved. Verify that tightening by grepping every quoted residual figure
against the new table; `docs:check` does **not** cover `src/lib/orbital/README.md`.

### W12 — Uranus stops being a bare ball · medium

**Item:** OPP-GIANTRINGS, **rescoped**

Ship-1 is the **epsilon ring plus one composite inner band**. That scope
_dissolves_ the sub-texel aliasing question rather than scheduling it — with no
individually-resolved 1.5 km ring there is no one-texel problem. Ratios are
recomputed against the IAU **equatorial** radius 25 559 km: the 1.650/2.019 values
derived against the catalog's mean 25 362 km would re-commit F-09 at 0.78% inside
the plan that fixes F-09. No generic builder API for a single caller — emit the
strip inline from the ring table.

Jupiter is excluded on **honesty** grounds (main-ring normal optical depth ~1e-6
in backscatter, so any visible alpha is invented visibility) and Neptune because
its arcs need azimuthal τ the 1-D uv cannot carry. Giving Uranus a `ringSystem`
silently rewires three non-render behaviours — focus extent, shadow frustum and
didactic moon placement — so extend the existing `astrophysics.test.ts` didactic
case to assert every Uranian moon stays outside the new ring reach, and check the
ring-shadow patch at a 97.77° obliquity it has never encountered.

### W13 — Enceladus erupts · high

**Item:** OPP-PLUMES

**Hard-blocked on W6.** Enceladus has `axialTilt: 0`, no pole, and
`satelliteUsesParentEquatorialFrame` is false because it has an analytical
ephemeris — so its rendered south pole is ecliptic south, ~27° off true. Emitting
a measured phenomenon at a wrong location would violate the fidelity pillar while
claiming to serve it. **Verify the emission point before any look work.**

**The speed band was corrected 2026-07-26** — the first draft applied the **gas**
velocity to a **grain** trajectory model. Escape velocity from the record's own
0.113 m/s² and 252 km radius is **238.7 m/s**, so the quoted 300-1000 m/s band is
1.26× to 4.19× escape and **nothing in it returns**; even the slowest would reach
an apex of 398 km, 1.6 × the moon's radius, before turning over. The real plume is
two populations: the gas leaves supersonically and unbound at 300-1000 m/s, while
the **ice grains** — the thing that is actually visible — span roughly 50-200 m/s,
mostly **below** escape, falling back as south-polar snow, with a fast minority
escaping to feed the E ring. That straddling is the honest physical picture and it
is also the teaching point.

Ship-1 is **one** south-polar source region, the ballistic parabola driven by the
sub-escape grain distribution against the record's own 0.113 m/s² surface gravity,
the Henyey-Greenstein forward-scattering term (g ≈ 0.6), and the measured ~3×
orbital-phase modulation peaking near apoapsis. Four separately-parameterised
tiger-stripe sources are what turn this into a 4-5 day wave, and at the ~40 px
visibility floor they span a few pixels and are not distinguishable from one.

Reuses the `Starfield` instanced-billboard idiom, **not** `THREE.InstancedMesh` —
a second instancing idiom is the competing-path failure `AGENTS §11` exists to
prevent. Tier-gated by a feature-local profile record mirroring `SUN_FX_PROFILES`,
not a new field on `ResolvedQualityProfile`. A `visualProvenance` block with
fidelity `interpretive` states explicitly that source location, height, speed
range and the 3× timing are **measured** while individual particle trajectories,
jet count and opacity are interpretive fill. **One** unit test, on the
orbital-phase modulation helper only.

---

## Appendix — gated proposals (outside the numbering)

Not waves. Each is a decision request; an agent must not start render code on any
of them. Numbering them would invite exactly the failure mode of the 2026-04-20 θ
rollback: implementation invented ahead of ground truth.

- **D-06 · The Milky Way background.** _Question for the owner: is there an
  all-sky panorama with published provenance we may ship?_ The failure mode is a
  fidelity **regression**, not a missed opportunity — a band in the wrong place,
  or an unattributable artist composite presented as the sky, is worse than
  today's void. If it proceeds: the composed rotation must go through the same
  `hygEquatorialToScene` the starfield uses, or the band and the stars will
  disagree; the galactic→ICRS angles survive only in a comment, not as live code;
  and the coordinate assert (l=0, b=0 → RA 17h45.6m / Dec −28.94°) is the one
  thing a screenshot cannot catch, since a band wrong by tens of degrees still
  looks plausible.
- **OPP-BELT · Populate the main belt.** _Question for the owner: do we accept a
  multi-MB deferred MPC sidecar and its attribution obligation?_ Record the
  explicit rejection of the cheap substitute: a procedural "dust band" would be
  invented detail presented as measured and must be refused if proposed.
- **Jovian shadow transits** (a moon's shadow **on** Jupiter's cloud tops) —
  deferred, not cancelled, and named here so it is not mistaken for shipped in
  W7. `eclipsingBodyId?: string` holds one id and Jupiter needs four, so it is a
  `string → string[]` schema change plus a per-frame eclipser selection.
  **Landmine recorded:** the eclipse branch at `usePlanetMaterials.ts:490`
  _precedes_ the ring branch at `:528`, so giving a **ringed** planet an
  `eclipsingBodyId` silently deletes its ring-shadow-on-planet shader. Harmless
  today because `ringSystem` occurs exactly once, but Titan's shadow on Saturn is
  precisely the case that would trip it — restructure into "select base patch,
  then optionally append eclipse" only when a ringed planet actually gets an
  eclipser.

---

## Arbitrated decisions — do not re-litigate

Seven were contested between the plan's author and its critics. Resolved with
evidence; reopening needs new evidence.

|     | Decision                                     | Ruling                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Where the `axialTilt` change lives           | Display in **W2** (that grid is already being rewritten and 27 invented zeros mislead today); schema, scrub and the GLB migration in **W6**. The field is made optional, **never deleted** — the `moonSceneFrame.ts:69` fallback is load-bearing for bodies that will never have an IAU solution                                                                                |
| B   | F-09 in W1 or W5                             | **W5**, first commit of stage B. The collision is exact — `60268/58232 = (1−f)^(−1/3)` to six digits — so a W1 placement is a guaranteed write-then-undo, and the conditional comment fencing it would reproduce F-11's defect inside the plan that fixes F-11                                                                                                                  |
| C   | The Milky Way and the belt as numbered waves | **Appendix.** A wave whose own estimate reads "indefinite if the gate does not clear", where the gate is a decision no agent can make, is a decision request wearing a wave number                                                                                                                                                                                              |
| D   | The Pluto-Charon barycentre                  | **Merged into W6's tail**, not its own wave and not dropped. The relative-geometry framing saves it: Meeus's ±30 000 km displaces the _system_, and the claim being fixed is Pluto's offset **relative to Charon** — a strict improvement under both readings of the centre-vs-barycentre ambiguity, against an app that prints the opposite in text. The ratio test is deleted |
| E   | Uranus's rings                               | Stays numbered, in tranche 2, with the scope cut — the cut **dissolves** the open design question instead of scheduling it                                                                                                                                                                                                                                                      |
| F   | A declared stopping point                    | **Yes, after W10.** The dependency graph confirms a clean tail cut and every fidelity/honesty defect lands before it                                                                                                                                                                                                                                                            |
| G   | A `ringFaceMath.ts` module                   | **Do not build it.** The cited precedent is itself a dead mirror; a plan cannot delete the _imported_ mirror (`eclipseMath`) and birth an unimported one. The same commit deletes `ringShadowMath.ts` and its test                                                                                                                                                              |

---

_Method and the full rejection list: [`../archive/audits/cross-ai-triage-2026-07-26.md`](../archive/audits/cross-ai-triage-2026-07-26.md)._
