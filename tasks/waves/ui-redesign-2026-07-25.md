# Wave — interface redesign (2026-07-25)

**Law:** [`../../AGENTS.md`](../../AGENTS.md). Queue: [`../STATUS.md`](../STATUS.md).

Owner brief: the interface is being judged with fresh eyes. Evolution is
wanted, laziness about innovating is not. **Hard guardrail: nothing a user
can do today may disappear, and every visual change ships with a
before/after capture.**

Evidence base: 20 Playwright captures across six viewports and five states,
2026-07-24/25 (job scratch, not committed). Two of the findings in the first
pass were wrong on inspection — recorded below so they are not re-raised.

---

## Framing insight (drives the rest)

`INTRO_END_DIRECTION` was `(0, 1746, 7)` → **89.8° elevation**, i.e. plan
view. A plane viewed perpendicular is scale-invariant: no convergence, no
horizon, no depth. The Solar-System-Scope grid was ported faithfully and
then shown at the one angle where a ground plane conveys nothing. Fixed in
`f09ddcb` (28°). The scale stays **in the scene** — that is the point, and
an out-of-scene scale bar was explicitly rejected by the owner.

---

## Wave 1 — remove what is not true (DONE)

- Shipped migration notice "Quality & render settings moved to Display"
  (`LayersPanel`) — told users about an internal reorganisation they never
  experienced. Removed with its storage key and dismiss state.
- Colorblind Mode + High Contrast shipped as five disabled controls under
  "Available in a future update" in the **accessibility** panel. Removed.
  Store fields stay persisted, so wiring later is UI-only.
- `e2e/a11y.spec.ts` pinned the disabled row (the audit's P-QA-5). Replaced
  with the inverse contract: the panel must contain no disabled control and
  must not promise future updates.

## Wave 2 — one label arbitration pass (DONE, `0c1fd53`)

Three independent decluttering systems draw into the same pixels and cannot
see each other: grid AU ring labels (`GridDecadeLabel`, own
`DECLUTTER_MIN_NDC_GAP`), body labels (`OverlayPositionTracker`, own
priority + hysteresis) and HYG star labels. Captured collisions: "1 AU" vs
"MOON", and "1 AU" vs "EARTH" — different bodies, same defect.

- Single arbitration pass consuming all three sources.
- Reserve space for major bodies instead of dropping them: today priority
  only breaks ties between _overlapping_ boxes, so Venus loses its label
  near the Sun while Hygiea survives in empty screen space. A learner sees
  Hygiea and not Venus. Fix is spatial (leader lines / radial nudge), not a
  priority bump.
- Depth-aware labels, now unblocked by the SDF default (`a819566`): with
  Mars focused, "PLUTO" rendered inside the Mars system beside Phobos and
  Deimos, because a DOM overlay knows only screen-space proximity.

## Wave 3 — chrome hierarchy (DONE)

- **DONE** — sidebar order inverted. It opened with "QUICK CONTEXT"
  encyclopedia prose above the live readouts: the least time-sensitive
  thing on screen, and the only part a learner could read anywhere else,
  sitting above the numbers that exist _only_ because a simulation is
  running. Now Telemetry → Physical Data → Quick Context → Visual Fidelity.
- **DONE** — the context line. The most valuable pixels permanently read
  "ATLAS ORBITAL / SYSTEM ONLINE". That is a website header on a simulator;
  in this class of app the top-left carries **state**. `FocusChip` already
  exists to say "you are on X" but only appears when the sidebar is closed
  — a patch over a missing primitive. Replace with one persistent line:
  where, what scale, what time. Branding shrinks to a mark. Touches
  `TopBar`. Shipped as `ContextLine`, which ABSORBED `FocusChip` rather
  than sitting beside it: the chip said the same thing but only when the
  sidebar was closed, so keeping both would have duplicated the answer.
  Its click behaviour (re-open via `setSelectedId`, never `selectId`, so
  `focusHistory` is untouched) carried over with its tests. Three e2e specs
  waited on the decorative "System Online" string as a readiness signal;
  they now wait on the context line, which is real state.
- **WITHDRAWN** — "the rail splits in two". Reading the code, this is a
  deliberate drawer metaphor, not a defect: when a panel opens,
  `LayersPanel.tsx:408-417` replaces that tab with an invisible spacer of
  identical height/width/z so the remaining tabs keep their geometry, and
  an equivalent trigger is rendered docked to the panel. The tab travels
  with its drawer on purpose. A screenshot reads it as a split; the code
  reads as intent. Left alone.
- **DONE** — scroll affordance. The panels always scrolled, but content was
  sheared flat against the bottom edge and a 4px dim thumb is easy to miss.
  Added `.scroll-fade-bottom` (mask fading the last 14px) to the three
  scroll containers and widened the thumb to 6px.
- **DONE** — identity restatements. The catalog id now shows only when it
  differs from the display name, and the type chip only when the
  classification does not already contain the type word. Neither ever
  drops information; both stop repeating it. The header also leads with
  the ACTIVE language and shows the other as the secondary line.

## Wave 4 — scene semantics (DONE)

- **DONE — named territory.** `gridRegions.ts` + `GridRegionLabel.tsx`.
  "Earth's orbit", "Asteroid belt", "Kuiper belt", "Heliopause" drawn on
  the ecliptic at their real AU radii, through the same
  `AstroPhysics.auToWorld` mapping the planets use, so they hold in BOTH
  scale modes. Placed on the radial line OPPOSITE the AU ladder so
  landmarks and measurements never queue behind each other, dimmer and
  smaller because the number is the checkable quantity and the name is the
  intuition. Values and their approximate nature are documented at the
  data, and the distances are pinned by test — a silent edit there is a
  silent factual change on screen.
- **DONE — first run no longer hides the scene.** The tutorial dimmer was
  `bg-black/60 backdrop-blur-sm`: eight modal steps describing a solar
  system the reader could not see. Now a plain 35 % scrim.
- **DONE — the didactic↔realistic transition glides.** Flipping the mode
  used to teleport every body; the motion IS the lesson. Implemented at
  `AstroPhysics.auToWorld`, the single chokepoint all 44 consumers already
  route through and recompute per frame, so the whole scene animates
  without one call site changing — and, critically, without 44 chances to
  miss one and desync the grid from the planets. Self-advancing off the
  wall clock: no ticker, nothing to unmount. Verified in-scene that rings,
  orbit lines, region labels and planets expand together.

  The transition records its DIRECTION rather than inferring it from the
  requested mode. The first cut inferred it, which meant a caller asking
  for the mode being LEFT got a value sliding away from it; a test caught
  that. Known scope: only distance glides — body radii
  (`resolveSemanticBodyRadius`) still snap on the first frame, and grid
  decade SELECTION uses the target mode's inverse so LOD can be briefly
  early or late. Ring radii come from `auToWorld`, so nothing drifts apart
  on screen.

- **NOT A DEFECT — home framing distance.** Measured directly: in didactic
  mode `resolveFocusExtent` returns 2058 against Neptune's 1761, and
  `calculateViewportAwareDistance` puts the system at **82 % of frame
  height**. The framing was always correct.

  Every "the default view is a tiny dot" capture in this program was taken
  DURING the 12 s intro sweep — the loader hides well before
  `INTRO_DURATION_MS` elapses, so screenshotting shortly after it clears
  samples the camera mid-flight. Sampling at +20 s shows the full system,
  labelled, filling the frame. The 28° tilt remains the right change on its
  own merits (a plane viewed perpendicular has no depth cue), but the
  evidence originally given for it was an artifact. Any future capture of
  the home view must wait out the intro.

---

## Checked and NOT defects (do not re-raise)

| Claim                                     | Why it is wrong                                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AU label font "scales with ring radius"   | It is `FONT_WORLD_BASE_DOMINANT` (26 vs 16) — intentional current-scale emphasis; measured ~1.5×                                                                  |
| Ring label formatted "1.0 AU"             | Misread: the ring line struck through the "0". Formatter is correct; the halo fix addressed this                                                                  |
| BODIES chips show no on/off state         | They do — cyan border + tint + glow when active. All five happened to be enabled in the capture                                                                   |
| Chips vs switches is an inconsistency     | Chips are a multi-select filter, switches are independent booleans. Correct information design                                                                    |
| Mobile boot fails at 390 px               | Test-harness error: the readiness gate keys on a heading TopBar renders `{!isMobile && …}`                                                                        |
| The rail splits in two when a panel opens | Deliberate drawer metaphor: the open panel's tab becomes an invisible spacer of identical geometry (`LayersPanel.tsx:408-417`) and re-renders docked to the panel |
| Home framing is too far out               | Measured at 82 % of frame height. Every "tiny dot" capture sampled the camera mid-intro; the loader clears long before the 12 s sweep ends                        |

## Observed, left alone (needs a product call, not a fix)

- **Home in realistic mode parks 23 world units from the Sun**, filling the
  frame with its surface. `resolveFocusExtent` returns early for
  non-didactic (`astrophysics.ts:772-774`), so children never widen the
  extent. That early return is RIGHT for a body focus — framing Jupiter's
  moon system makes Jupiter a speck — but it makes Home a close-up. The
  honest overview in true scale is mostly empty space, which is arguably
  the whole lesson of the mode. Two defensible answers; not the assistant's
  call. Reproducible: set `scaleMode: "realistic"`, call `focusHome()`.

---

# HANDOFF — open work (2026-07-25, end of session)

Three items remain. Each is reproduced and located; none is fixed. Read the
operational traps first — they are what cost the previous session most.

## Operational traps (read before capturing anything)

1. **Wait out the intro.** Measured three times on a warm local preview:
   loader clears at **23–25 s**, the intro sweep finishes at **46–49 s**.
   The loader clears LONG before the camera settles, so a screenshot taken
   shortly after `atlas-loader` reaches count 0 samples the camera
   mid-flight. A whole round of "the default view is a tiny dot" findings
   came from this and had to be withdrawn. Wait ≥ 20 s past loader-gone.
2. **The store test hook needs the freeze flag.** `__ATLAS_TEST_STORE__` is
   installed only when `__ATLAS_TEST_FREEZE__` is set (`store.ts:722-739`),
   i.e. after `freezeSimulation(page)`. Freezing the SIMULATION clock does
   not affect the intro, which runs on wall clock.
3. **`labelMode`, `showEclipticGrid` and `scaleMode` are NOT persisted.**
   They are absent from `partialize`, so seeding `localStorage` for them is
   a silent no-op — two captures were produced that way and compared as if
   meaningful. Drive them via `__ATLAS_TEST_STORE__.setState(...)` after
   boot instead.
4. **Zeroing an effect's intensity proves nothing about WHICH term.** It
   kills the whole effect. Used as an A/B it establishes only "the artifact
   lives in this effect", which sent the last session after two wrong terms
   in a row.

## 1. Lens-flare hex blob (diagnosed, not fixed)

**Where:** `src/components/canvas/scene/effects/LensFlareEffect.ts:143`

```glsl
float s = max(0.01 - pow(regShape(p * 5.0 + mouse * dist * 5.0 + 0.9, 6), 1.0), 0.0) * 9.0;
```

`regShape(..., 6)` is a regular 6-sided polygon — the aperture-blade ghost,
a 1:1 port of Gaia `lensflare.frag.glsl:105-113`. The element is INTENDED.
The defect is that at weight `9.0` it saturates into an opaque grey plate
over the photosphere when the source fills the frame, instead of a faint
ghost.

**Prior art in-repo:** `LensFlareEffect.ts:200-207` documents this defect by
name — _"exploding halo + chromatic edges + hex blob" users report at
5–30 AU_ — with a 2026-05-04 fix clamping the HDR occlusion sample to LDR.
That fix did not close it; the blob is still there.

**Tried and REVERTED — do not repeat:**

- Softening the bias threshold + removing the `fract()` wrap in
  `PseudoLensFlareEffect.ts`. **Wrong file** — `lensFlareIntensityMul`
  targets the COMPLEX effect, stated at `resolver.ts:59`.
- Clamping `perLightIntensity` to [0,1] in `LensFlareEffect.ts`, on the
  theory that the per-light scalar multiplied after the existing clamp. No
  visible change.

**Next hypothesis, to MEASURE not assume:** the `* 9.0` weight on the `s`
term, or scaling `regShape`'s `p * 5.0` with the source's apparent size.
Isolate by zeroing `c`, `c1` and `s` individually — not the whole effect.

**Repro:** boot, wait out the intro, then
`setState({ scaleMode: "realistic" })` + `focusHome()`, wait ~9 s. The
hexagon sits lower-left of the Sun. Crop x420 y480 340×240 at 1440×900.

## 2. The `low` graphics preset renders an empty scene (reproduced, not fixed)

Boot at defaults, then Display panel → **Low** (or
`setGraphicsAutoMode(false)` + `setGraphicsPreset("low")`). The scene
collapses to HTML overlay icons plus a few star pixels. No Sun, planets,
orbits or grid.

**Evidence it is real, not environment or loading:**

- 45 s wait, then a direct `readPixels` of the centre 64×64 returns
  `mean 0, max 0`.
- `ultra` renders correctly in the same environment and run.
- Nothing throws. One telling warning: `[SceneReadyChecker] Scene-ready
fallback fired after 8000 ms — frame loop may not be running.`
- The first attempt seeded `qualityMode` only, leaving `graphicsPreset` at
  its default — a state no user can reach. Re-done through the real setter,
  it still reproduces.

**Why no test caught it:** `postprocessing.spec.ts` mounts the constrained
tier but asserts only `data-postprocessing="inactive"` — never that
anything renders. `boot.spec.ts`'s visual snapshot runs at the default
tier. **No test looks at pixels on the low tier.**

This is AGENTS.md pillar 4 (adaptive reach — "degrades to a fast floor").
A black screen is not a fast floor, and it is the low-end audience.

**Suggested first move:** a pixel gate asserting the canvas is not
uniformly black, per preset. Cheap, and it would have caught this.

## 3. Label visual hierarchy (not started)

Earth and Weywot render identically — same colour, weight and size. The
priority values already exist in `OverlayPositionTracker.tsx:159-168`
(focus 100 / star 90 / planet 10 / dwarf 8 / moon 6 / other 4) and are used
ONLY for collision arbitration, never for appearance. Making visual weight
follow the hierarchy that is already computed is cheap and is the fastest
way to make the scene read as designed. Both renderers need it:
`PlanetOverlay` (HTML) and `PlanetLabels3D` (SDF, now the default).
