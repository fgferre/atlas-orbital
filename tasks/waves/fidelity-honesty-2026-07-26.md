# Wave — fidelity & honesty (2026-07-26)

**Authority:** [`AGENTS.md`](../../AGENTS.md). **Queue:** [`../STATUS.md`](../STATUS.md).
**Findings and rejections:** [`../archive/audits/cross-ai-triage-2026-07-26.md`](../archive/audits/cross-ai-triage-2026-07-26.md)

Thirteen waves in two tranches, plus a gated appendix. Tranche 1 (W1-W10) closes
every confirmed fidelity and honesty defect. Tranche 2 is additive and is
**re-decided at the checkpoint, not pre-committed**.

Item IDs are defined in the triage document. Do not schedule anything from its §3.

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

| Wave                                    | Status      | Commit |
| --------------------------------------- | ----------- | ------ |
| W1 Correct the record                   | not started | —      |
| W2 The panel stops contradicting itself | not started | —      |
| W3 Photometry and the exposure floor    | not started | —      |
| W4 The star surfaces stop lying         | not started | —      |
| W5 Body figure                          | not started | —      |
| W6 One pole, one spin                   | not started | —      |
| W7 Eclipses happen when eclipses happen | not started | —      |
| W8 Reach and discovery                  | not started | —      |
| W9 The rings transmit                   | not started | —      |
| W10 Atmosphere on the disc              | not started | —      |
| — CHECKPOINT —                          | —           | —      |
| W11 J2 secular precession               | not decided | —      |
| W12 Uranus stops being a bare ball      | not decided | —      |
| W13 Enceladus erupts                    | not decided | —      |

---

## Standing law

Applies to every wave. Violations are defects, not style notes.

1. **The diff that introduces a helper deletes what it replaces, in the same
   commit.** No wave leaves a half-migrated call site on `main`.
2. **New GLSL adds zero uniforms and zero varyings.** `viewMatrix[3].xyz` is the
   Sun in view space — an invariant `usePlanetMaterials.ts:107` and `:383`
   already lean on. `geometryPosition`/`geometryNormal`/`geometryViewDir` exist
   only _after_ `lights_fragment_begin`; before it (at `map_fragment` /
   `emissivemap_fragment`) use `vViewPosition` and the faceDirection-flipped
   `normal`. Redeclaring `vWorldPos`/`vWorldNormal` reproduces the "redefinition"
   failure recorded at `usePlanetMaterials.ts:252-257`.
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
atmosphere or twilight. **The tilt cell becomes pole-first:** derive obliquity
from `poleRA`/`poleDec` when present, show `axialTilt` when it is a real
measured value, honest "N/A" otherwise — `${b.axialTilt}°` is currently
unguarded and `StatBox`'s `value || "N/A"` cannot catch the string `"undefined°"`,
which is truthy. This stops 27 invented `0°` readings four waves earlier than the
schema change.

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

**Verification.** `npm run lint && npm run build && npm run test:run -- celestialBodies qualityProfile`,
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

### W5 — Body figure · medium · 2.5-3 days

**Items:** F-04, OPP-SHAPE, NEW-1, **+ F-09 as the first commit of stage B**

Moved ahead of the orientation chain, correcting an implied dependency: stage A
does **not** need F-01. `computePoleOrientationQuaternion` uses
`setFromUnitVectors`, which gets the axis right and leaves only the azimuth
arbitrary, and all five flattened bodies already carry IAU poles — squash-about-Y
then spin-about-Y commutes. OPP-SHAPE depends on F-04 alone.

**The invariant, binding on every commit in this wave:** `groupRef` stays
**uniform** at `resolveSemanticBodyRadius`. It parents both satellite subtrees at
`Planet.tsx:1039-1043`, and a non-uniform parent scale composed with a child
rotation is a **shear**, not a rotated ellipsoid — Uranus at 97.77° would render
a skewed blob and Quaoar's long axis would freeze in the ecliptic frame. The
per-axis vector goes to the planet, cloud and atmosphere **meshes** individually,
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
hard-codes "Radius is 1.0". **Stage B opens with F-09** — Saturn's
(1−f)^(−1/3) = 1.034963 _is_ the 60268/58232 = 1.034963 factor, so the wave that
changes the object-space unit owns the ring ratios: write them once as the
published 1.110 / 2.326, with a comment stating the settled invariant (ring
ratios are published radii against IAU equatorial 60 268 km; the object-space
unit is equatorial) rather than a conditional. Also fix `astrophysics.ts:706`,
which computes didactic ring reach from `radiusKm` — the same mean-vs-equatorial
bug two hundred lines away.

**Verification.** `npm run test:run -- astrophysics celestialBodies cameraNearPlane moonSceneFrame && npm run lint && npm run build`.
Add a real assert in `astrophysics.test.ts`: `resolveSemanticBodyRadius(saturn,'realistic') / KM_TO_3D_UNITS` equals 60 268 ± 0.1% and Jupiter 71 492 — `cameraNearPlane.test.ts` is built entirely on Deimos, which has neither `shapeScale` nor flattening, so it is **structurally blind** to this wave and must not be described as the gate (lesson M5). Post-stage-B arithmetic gate: `resolveRingOuterRadius(saturn,'realistic') / KM_TO_3D_UNITS` still equals 140 180 km within 1%. Smoke per commit: Quaoar through one 17.68 h period; Jupiter limb plus spin-axis lock (a wobble means the scale went on the wrong group); Uranus; stage B, Saturn's ring shadow still tracking the drawn ring at three sub-solar latitudes, and didactic Saturnian moons still outside the rings. **Confirm Weywot's separation from Quaoar and Io's from Jupiter are unchanged from main at the same timestamp** — if either moved, the scale went on `groupRef`. Record the measured focus-extent deltas here: the equatorial radius grows 3.5% for Saturn, 2.2% Jupiter, 0.8% Uranus, 0.6% Neptune, in both scale modes, which shifts every moon of every flattened planet in didactic mode. Then `npm run test:e2e`.

---

### W6 — One pole, one spin · **high** · 3-4 days

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

**Step-1 gate, before any satellite data lands.** `computeSpinAngleRad('earth')`
at 2000-01-01T12:00:00 TDB equals 190.147°, and the sub-solar longitude from pole
quaternion + W at a 2026 date matches the GMST-derived value within 0.1° — GMST
at J2000.0 = 280.46061837° is an anchor that passes through **no** transcribed
constant. `npm run test:run -- regression` proves positions did not move. Earth's
sub-solar point sits on Greenwich at 2026-03-20T12:00:00Z and at the antipode at
00:00Z. **NEW-2 is fixed in the same diff:** the cloud super-rotation multiplies
the **rate**, not the wrapped angle, so the once-per-day 10.7° snap is gone. **No
per-texture seam-offset field is introduced** — `SphereGeometry` puts the u = 0.5
meridian on mesh +X, which is where node Q sits at W = 0, and increasing u drives
z negative, which `ecliptic2ThreeJs` maps to increasing east longitude; the
residual is zero by construction.

**Step 2.** Eighteen analytical satellites plus Pluto and Charon carry poles and
W terms transcribed from **Archinal et al. 2018, Tables 1 and 2, read out of the
source at edit time — never copied from this file or from any plan**, with Pluto
and Charon sharing α₀ 132.993 / δ₀ −6.163 at a 180° W offset. For each satellite,
its existing Horizons fixture vector transformed into the body-fixed frame gives
sub-parent longitude 0 within its optical-libration amplitude (~8° Moon, ~1°
others), using the 18 fixtures already on disk — **zero new fixtures**. The Moon
must **visibly rock**: a face-the-parent hack would pass a static check and kill
libration. No pole is added to Orcus or Quaoar — none is measured, and
`Planet.tsx:1039-1041` mounts equatorial-framed children under the parent
quaternion, so a parent pole would move Vanth and Weywot.

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

### W7 — Eclipses happen when eclipses happen · medium · 3-4 days

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
with the Earth/Moon (umbra −47 km, penumbra 3 529 km = 2.03 R_moon) and Io/Jupiter
(umbra 71 153 km, penumbra 71 908 km) anchors in its JSDoc. `vrScale` is
recomputed from the synthesized point — the current `receiverWorldPos.length()*2`
is already marginal and **fails silently** once the axis point moves to physical
range, because `dist_segment_point` then returns an endpoint distance and the
shadow quietly does not appear. `uEclipsingBodyRadius` is replaced by
`uEclipsingUmbraRadius` + `uEclipsingPenumbraRadius` in **all three** declaration
sites (cloud, Earth, eclipse-only) — missing one is a runtime-only GLSL
"undeclared identifier". `uEclipsingMinShadow` makes annular eclipses render
annular rather than total. `computeEclipseShading`, `eclipseBlend`,
`distSegmentPoint`, `getDiffractionSpectrum` and their 26 test cases are
**deleted** while the constants `eclipseShaderPatch.ts` interpolates survive, and
the file's JSDoc is rewritten from "pure-TypeScript mirror" to the constant
registry it actually is. Thirteen moons gain `eclipsingBodyId` with **zero** code
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
now", never "visible from your city". The forward scan (6 h coarse step to a sign
change, then bisect to ~1 min) runs off the render path **with its own engine
instance or a bounded scratch cache** — a 2-year scan is ~2 920 samples × 2 bodies
against a 2 000-entry shared cache with oldest-insertion eviction, so a naive scan
flushes the live position cache and every visible body takes a cold-miss frame
right after the click. Both locale bundles carry every new key.

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

**Items:** D-01, **+ D-02's comment correction**

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
header state that the descent-brightening branch is unreachable behind the 1.1
dolly margin against a 1.025 shell, that the same geometry kills the T5.1 ESun
boost (`camHeightGr` 0.1 vs `atmosphereHeight` 0.025), and name the one change
that would unlock it. `computeDynamicAtmosphereUniforms` and its test **stay**.

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
below its own series' error visibility. Roughly 3-4 weeks of solo work reaches
here; the remaining three waves are another 2-3 and buy nothing the earlier ten
depend on.

---

## Tranche 2 — not pre-committed

### W11 — J2 secular precession · medium

**Item:** OPP-J2

**Half-day desk spike as the gate, before any propagator code:** compute
`−1.5·n·J2·(R/a)²·cos i/(1−e²)²` offline for the four `pub` bodies (Phobos,
Mimas, Tethys, Io) and check sign and magnitude against their recorded residuals
(Mimas 5.213°, Phobos 3.550°). If the predicted correction does not match the
residual's direction and scale, **the wave does not exist** and cost half a day
instead of five.

**Acceptance gate, non-negotiable:** no number in `MULTI_EPOCH_OVERRIDES` may
**rise**. Fourteen of the eighteen mean motions carry `fix` provenance and were
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

Ship-1 is **one** south-polar source region, the ballistic parabola from the
measured 300-1000 m/s ejection range and the record's own 0.113 m/s² surface
gravity, the Henyey-Greenstein forward-scattering term (g ≈ 0.6), and the measured
~3× orbital-phase modulation peaking near apoapsis. Four separately-parameterised
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
