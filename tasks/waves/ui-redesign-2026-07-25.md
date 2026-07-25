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

## Wave 4 — scene semantics (PARTIAL)

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
- **OPEN — the didactic↔realistic transition.** Still a radio button.
  Watching compression release and the planets rush apart _is_ the lesson;
  animating `scaleMode` changes is a real feature, not a constant tweak.
- **RESOLVED IN PART — home framing.** The 28° tilt fixed the axis that
  actually mattered (depth). The DISTANCE is still too far: at 1440×900 the
  planetary system occupies roughly a tenth of the frame height.

  Investigated and **ruled out**: the body set. `resolveIntroEndPosition`
  already routes through `AstroPhysics.resolveFocusExtent`, which for the
  Sun filters internally to planets plus dwarfs with `a ≤ 40`
  (`astrophysics.ts:776-790`) — Sedna was never in the framing, so
  narrowing the `bodies` argument changes almost nothing. A patch doing
  that was written, measured, and reverted. The dominant term is in
  `resolveFocusExtent`'s ring/semantic-radius maths or in
  `calculateViewportAwareDistance`'s margin; whoever picks this up should
  instrument those two before editing either.

---

## Checked and NOT defects (do not re-raise)

| Claim                                   | Why it is wrong                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| AU label font "scales with ring radius" | It is `FONT_WORLD_BASE_DOMINANT` (26 vs 16) — intentional current-scale emphasis; measured ~1.5× |
| Ring label formatted "1.0 AU"           | Misread: the ring line struck through the "0". Formatter is correct; the halo fix addressed this |
| BODIES chips show no on/off state       | They do — cyan border + tint + glow when active. All five happened to be enabled in the capture  |
| Chips vs switches is an inconsistency   | Chips are a multi-select filter, switches are independent booleans. Correct information design   |
| Mobile boot fails at 390 px             | Test-harness error: the readiness gate keys on a heading TopBar renders `{!isMobile && …}`       |
