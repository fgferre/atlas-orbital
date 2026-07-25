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

## Wave 3 — chrome hierarchy (PARTIAL)

- **DONE** — sidebar order inverted. It opened with "QUICK CONTEXT"
  encyclopedia prose above the live readouts: the least time-sensitive
  thing on screen, and the only part a learner could read anywhere else,
  sitting above the numbers that exist _only_ because a simulation is
  running. Now Telemetry → Physical Data → Quick Context → Visual Fidelity.
- **OPEN** — the context line. The most valuable pixels permanently read
  "ATLAS ORBITAL / SYSTEM ONLINE". That is a website header on a simulator;
  in this class of app the top-left carries **state**. `FocusChip` already
  exists to say "you are on X" but only appears when the sidebar is closed
  — a patch over a missing primitive. Replace with one persistent line:
  where, what scale, what time. Branding shrinks to a mark. Touches
  `TopBar`, `FocusChip` (+ its test) and the NOT-TO-SCALE pill's placement.
- **OPEN, root cause found** — the right rail is not a rail. There is no
  rail container: `RightControlRail.tsx` exports only icons/labels, and
  each panel (`LayersPanel`, `SearchBar`, and the Display/A11y hosts)
  renders **its own tab as a child of itself**. So when a panel slides in,
  its tab travels with it and the strip visibly splits in two. Fixing it
  means hoisting all four tabs into one positioned rail container and
  having panels stop rendering tabs — a refactor across four files, not a
  CSS tweak. Do not attempt it as a quick fix.
- **OPEN** — panels clip content with no scroll affordance.
- **OPEN** — the body identity is restated five times above the first datum
  (`MARS`, `MARTE`, "TERRESTRIAL PLANET MARS", "PLANET", "INNER SYSTEM").

## Wave 4 — scene semantics

- **Named territory, not only numbers.** Nobody has intuition for "100 AU";
  everybody has intuition for "this is where Voyager is". Band the plane
  with named regions (Earth's orbit, Belt, Kuiper, heliopause) with the
  number riding along for honesty. In-scene, SSS in spirit.
- **The didactic↔realistic transition is the strongest teaching moment the
  app owns and it is a radio button.** Watching compression release and the
  planets rush apart _is_ the lesson.
- Default home framing: what should "home" frame — Neptune, the belt, or a
  cinematic outside-in approach? Owner decision, still open.
- First run is an 8-step modal over a fully dimmed scene: the tutorial
  hides the thing it describes.

---

## Checked and NOT defects (do not re-raise)

| Claim                                   | Why it is wrong                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| AU label font "scales with ring radius" | It is `FONT_WORLD_BASE_DOMINANT` (26 vs 16) — intentional current-scale emphasis; measured ~1.5× |
| Ring label formatted "1.0 AU"           | Misread: the ring line struck through the "0". Formatter is correct; the halo fix addressed this |
| BODIES chips show no on/off state       | They do — cyan border + tint + glow when active. All five happened to be enabled in the capture  |
| Chips vs switches is an inconsistency   | Chips are a multi-select filter, switches are independent booleans. Correct information design   |
| Mobile boot fails at 390 px             | Test-harness error: the readiness gate keys on a heading TopBar renders `{!isMobile && …}`       |
