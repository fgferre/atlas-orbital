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
