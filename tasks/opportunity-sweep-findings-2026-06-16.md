# Atlas Orbital — Opportunity Sweep (2026-06-16)

Atlas Orbital already has the hard parts built — an honest VSOP87D/Kepler engine, a tiered HYG starfield with real B-V colors, a didactic/realistic scale system, and a rich curated-body catalog. What it lacks is the thin layer of _framing_ that turns raw, correct numbers into things a 14-year-old can feel: a parsec becomes "light left this star before you were born," a `0.38 g` badge becomes "you'd weigh 19 kg on Mars," a `mag -1.46` becomes "very bright." The strongest opportunities below are almost all cheap derived-display work on values **already in scope** — and the few honesty-bug fixes (grid AU label drift, ΔT caution) _remove_ current dishonesty rather than add features. Two structural gaps stand out as signature bets: the missing in-app **language toggle** (the i18n pipeline is wired but unreachable — table-stakes inclusivity) and a **jump-to-date control** (the engine can evaluate any date but the user can never aim at one). Everything is ranked payoff-over-effort; "already exists" items are framed as finish/expose, not build.

---

## Do now — cheap wins

Ranked by payoff/effort. These are XS/S, mostly one derived value on data already in scope, and several remove real dishonesty.

1. **Light-travel-time line on the star panel** — `src/components/ui/HygStarPanel.tsx:229-238` — a 14-year-old grasps that looking at a star _is_ looking back in time (Sirius's light left ~8.6 yrs ago; Deneb's before they were born). — **XS** — `distanceLy` is already in scope at line 131; add one StatRow `"Light left this star ~{round(distanceLy)} years ago — in {currentYear − round(distanceLy)}"` plus one i18n key pair. Pure arithmetic, no new data.

2. **Magnitude → brightness qualifier in the star tooltip/panel** — `StarHoverTooltip.tsx:152-156` + `HygStarPanel.tsx:239-244` — cracks the single most counter-intuitive rule in naked-eye astronomy (brighter = smaller number). — **XS/S** — one pure `magQualifier(mag)` bin lookup (`mag -1.46 · very bright`, `mag 6.1 · barely visible`) + two one-line insertions. No new component.

3. **Fix the didactic-mode grid AU label drift** — `src/components/canvas/GridAuLabels.tsx:123` — the "1/5/10 AU" ruler actually lines up with where planets are drawn, so a learner counting AU rings isn't silently misled. — **S** — _removes a documented honesty bug._ Read `scaleMode` from the store; in didactic mode place each tick at `AstroPhysics.mapDidacticHeliocentricDistance(au)` instead of `au * AU_TO_3D_UNITS`. ~4 lines.

4. **"Your weight here" on rocky worlds** — `src/components/ui/Sidebar.tsx:276-288` (Gravity StatBox) — abstract `0.38 g` becomes visceral: a 50 kg teen weighs ~19 kg on Mars. — **XS/S** — reuse the `gRatio` already parsed for the existing badge; add one subLabel `"A 50 kg person weighs {50 × gRatio} kg here"`, gated on rocky/moon body type so it skips gas giants.

5. **"How long to get there" travel-time chips on planet distance** — `src/components/ui/Sidebar.tsx:245-261` — internalizes solar-system emptiness: light reaches Mars in minutes, a jet would take centuries. — **S** — `stats.distKm` already computed; derive light / jet (~900 km/h) / Voyager (~17 km/s) chips from three constants. Uses the REAL distance, not the compressed 3D gap. Switch light to seconds for very close bodies (one ternary).

6. **Persistent "Not to scale / True scale" pill on the canvas** — `src/components/ui/Overlay.tsx` — the single most important framing, surfaced where the learner is actually looking; also discovers the true-scale toggle (currently buried two taps deep). — **S** — _the rubric's sanctioned honesty move._ Amber `"NOT TO SCALE — sizes & gaps exaggerated"` / green `"TRUE SCALE"` pill reading existing `scaleMode`, click calls existing `toggleScaleMode`, dismissible via the `RestructureHint` pattern. Drop the "in-canvas pointer" sub-idea — the pill's own click covers discovery.

7. **Per-body "shown ~N× true size" exaggeration badge** — `src/components/ui/Sidebar.tsx:271-275` (Radius StatBox) — the learner sees the exact puff-up factor (Jupiter ~73×) so they never mistake the picture for reality. — **XS/S** — didactic mode only; `factor = calculateDidacticRadius(r) ÷ (r × KM_TO_3D_UNITS)`, both engine paths already exist. Hide / show "true scale" in realistic mode.

8. **Scale-mode disclosure on Current Distance telemetry** — `src/components/ui/Sidebar.tsx:245-260` — teaches that the live distance reading is the REAL AU value but the on-screen gaps are squished. — **S** — when `scaleMode==='didactic'`, add a caption below (not replacing) the StatBox: `"Distance is real; on-screen gap compressed ~{ratio}×"`, ratio computed live from `mapDidacticHeliocentricDistance` (varies hugely by body, so it must be live). Guard for moons.

9. **"Compared to the Sun" temperature framing on stars** — `src/components/ui/HygStarPanel.tsx:204-211` — raw `11,000 K` becomes "~1.9× the Sun." — **S** — _shrunk to temperature only:_ radius/mass already read in R☉/M☉ (the unit IS the comparison), so append `"· 1.9× Sun"` inline using `T_SUN` (already in `stellarPhysics.ts`). One i18n key, no new StatBox props.

10. **Star distance uncertainty note** — `src/components/ui/HygStarPanel.tsx:229-237` — distance in light-years is a _measurement with error_, not an exact fact — a core idea of how we know the sky. — **S** — qualitative caption only: `"Distance derived from parallax; precision drops for faraway stars."` The binary stores no `e_Plx`, so **do NOT invent a ± number** — stay qualitative. One i18n key pair.

11. **Per-stat micro-glossary on the Sidebar data grids** — `src/components/ui/Sidebar.tsx:266-372` (StatBox) — the learner who doesn't know "escape velocity" / "axial tilt" / "AU" gets a one-line plain-language definition right where the number is. — **S** — add optional `hint?: string` + an `ⓘ` tap-to-expand (mobile-safe; CSS-hover tooltips silently fail on touch) over a ~10-term static map.

12. **Escape-to-deselect + canvas as a focusable landmark** — `src/components/ui/Overlay.tsx:46-80` + `src/components/canvas/Scene.tsx` (Canvas) — Escape backs out cleanly, and keyboard/screen-reader users can finally reach the 3D scene at all. — **S** — add an Escape branch to the existing keydown switch calling `selectId(null)`; add `tabIndex=0` + `role="application"` + `aria-label` to the Canvas wrapper.

13. **Skip-link + app-shell landmark roles** — `src/App.tsx:96`, `src/components/ui/Overlay.tsx:82-130` — a screen-reader/keyboard learner jumps straight to the controls instead of tabbing through an opaque canvas. — **S** — one `sr-only` "Skip to controls" anchor + `role=banner/region/toolbar` on three existing structural divs. 5-8 lines, zero runtime cost.

14. **Keyboard number-row quick-jump + `[` / `]` cycling** — `src/components/ui/Overlay.tsx:46-80` — keyboard-only tour of the system (0=Sun, 1-8=Mercury→Neptune), reinforcing planet order through muscle memory. — **S** — small ordered id array dispatched through existing `selectId`; honors the existing typing/overlay guards. Add the two rows to the shortcuts modal.

15. **"Surprise me" jump to a random notable star/body** — `src/components/ui/SearchBar.tsx:398-415` — wonder without the blank-page problem: one click flies to a real, named object with its panel open. — **S** — curate ~30 high-interest targets (6 quick-jump bodies + ~24 famous proper-name stars), pick one at random, dispatch through the existing `handleSelect`/`formatHygFocusId` path. A discovery affordance, not gamification.

16. **Stellar + constellation Quick Jumps row** — `controlPanelConfig.ts:136-143` + `SearchBar.tsx:398-415` — teaches that the catalog holds FAMOUS STARS too (Sirius, Vega, Polaris), widening the mental map past the solar system. — **S** — `STAR_QUICK_TARGETS` of ~6 proper names resolved via the already-imported `searchHygCatalog`; render a "Stars" row under the existing "Planets" row. Skip names that don't resolve in the current tier.

17. **Search facts/records as queries ("hottest", "largest moon", "life")** — `src/lib/bodySearch.ts:19-83` — turns trivia curiosity into navigation: ask "which is hottest?" → fly to Venus with the record shown. — **S** — add `records[]`/`facts[]` as low-weight searchable fields in `scoreBody` (data already authored per body); optionally surface the matched record as the result subtitle. No UI change required.

18. **Enrich mobile HYG search rows with constellation + magnitude** — `src/components/ui/SearchBar.tsx:68-93,465-499` — a phone user can tell what a result IS before a 12-second fly-to, where no hover tooltip ever fires on touch. — **XS** — extend `formatHygDisplay` to append constellation full name + mag (`Sirius — A1V · 2.64 pc · Canis Major`). Requires exporting `CONSTELLATION_NAMES` from `StarHoverTooltip.tsx` to a shared util.

19. **Stop page pinch-zoom from fighting OrbitControls** — `index.html:5` — pinching toward Saturn zooms the SCENE, not the whole webpage. — **XS** — add `maximum-scale=1, user-scalable=no` to the viewport meta. _Caveat:_ this trades away OS pinch-zoom for low-vision users — the in-app UI-Scale slider (`A11yPanel.tsx:59-70`) is the escape hatch; note the tradeoff at land time and resolve jointly with any WCAG-zoom concern.

20. **Visible "degraded boot" notice when the 8s safety hatch fires** — `src/components/canvas/SceneReadyChecker.tsx:58-68` + `Overlay.tsx` — if the engine silently fails to start frames, the learner sees an honest "reload?" note instead of an empty scene they assume is correct. — **S** — detection already exists (console.warn only); add one store boolean in the existing timeout branch + one dismissible banner. No retry logic, no FPS monitoring.

21. **Standardize HUD/transport buttons to 44px touch targets** — `src/components/ui/Timeline.tsx:272-276,334-340` — a learner on a phone (or with motor difficulty) can actually hit play/pause/speed/step, with a visible focus ring. — **S** — swap `h-9 w-9 → h-11 w-11` on the mobile breakpoint, copy the existing focus-visible classes. _(Two cost/prior-art verifiers were unavailable; honesty kept it — low risk, but confirm the breakpoint behavior at land.)_

22. **Pending "Locating star…" indicator for HYG clicks** — `src/components/canvas/CameraController.tsx:90-93,249-253` — tapping a faint star before the catalog loads shows a cue instead of a dead click that feels broken. — **S** — reuse the existing `starfieldProviderStates.hyg.status`; render a `role=status` chip near `FocusChip`. Also fixes a screen-reader gap for free.

23. **Global aria-live announcer for focus / loader changes** — `src/App.tsx:96` or `Overlay.tsx` — a blind learner hears "Now viewing Jupiter" / "Loading star catalog" instead of silence. — **S/M** — one store `announcement` field written by the existing `selectId` unifier + one off-screen `role=status` region. v1 = focus changes + loader done; skip time-speed.

24. **Plain-language star-type one-liner ("what kind of star is this?")** — `src/components/ui/HygStarPanel.tsx:198-203` — decodes the cryptic `A1V` into "a hot, white, main-sequence star — far hotter than our Sun." — **S/M** — lookup table over already-parsed spectral letter (O/B/A/F/G/K/M) × luminosity class (V/III/I) → fixed sentence + i18n; hedge for spect-less stars.

25. **Self-documenting, localized Keyboard Shortcuts modal** — `src/components/ui/KeyboardShortcutsModal.tsx:12-21` — the learner discovers what the app can do, in their language, instead of guessing. — **M** — move the hardcoded English list into one exported registry _consumed by the handlers_ (so the modal can't drift) and thread it through `useTranslation` (en/pt-BR keys). Anti-drift is the real payoff.

---

## Signature bets

Ambitious, high-payoff. Each justifies its cost in one line.

- **Jump-to-date control: date picker + "Now" reset** — `src/components/ui/Timeline.tsx` (transport block) — **M (truly S)** — the single biggest "I can drive this" affordance Stellarium and Solar System Scope have and Atlas lacks: typing "2024-04-08" and watching the planets snap to where they really were is the teaching moment. `setDisplayedDatetime` (store.ts:331) is purpose-built for it — comment already reads "Use this for date-picker seeks."

- **In-app language toggle (en/pt-BR) in GearPopover** — `src/components/ui/GearPopover.tsx` — **S** — _table stakes, not eye-candy:_ the i18n pipeline and both locale bundles are fully wired but `changeLanguage` is called only in tests, so a Brazilian 14-year-old has no way to switch — two buttons (~20 lines) unlock an already-built but unreachable inclusivity layer. _Shrunk:_ drop the first-run nudge banner; navigator auto-detect already covers most pt-BR users.

- **Habitable-zone band marker for the home star** — `src/components/ui/Sidebar.tsx:355-372` — **S/M (really S)** — the learner sees WHY Earth has liquid water and Mars/Venus don't: conservative HZ bounds (`inner=0.95√L`, `outer=1.67√L`, L=1 for the Sun) label each planet inside/too-hot/too-cold by `orbit.a`. Published constants, with a "simplified model" note (ignores albedo/atmosphere).

- **Live Moon phase + illuminated-fraction readout** — new `src/lib/orbital/moonPhase.ts` → Sidebar, gated on `selectedId==='moon'` — **M (really S)** — the Moon is the one object a learner can walk outside and verify the same night ("73% lit, waxing gibbous"); it's a two-dot-product calc on positions the engine already computes (`moonElp.ts` + Sun), no new ephemeris. SVG crescent icon is a stretch.

- **Side-by-side visual size-comparison strip in the planet panel** — `src/components/ui/Sidebar.tsx:265-306` — **S** — the learner SEES Jupiter dwarf Earth, which lands far harder than the "11.2× Earth" text badge; two CSS circles sized by the radius ratio already computed by `getEarthComparison`, clamped so tiny moons stay visible, with a "to scale with each other" caption.

- **Guided Tour ("Grand Tour of the Solar System")** — new `src/data/tours.ts` + `src/components/ui/GuidedTour.tsx` — **M (shrunk to S)** — solves blank-slate paralysis: one button flies the learner body-to-body with a sentence of context at each stop. _Shrunk:_ one hardcoded ~6-stop tour, a modal cloning the `TutorialOverlay` pattern, entry via the Gear popover (no new rail tab, no mobile layout risk). `selectId` gives the fly-to for free.

- **"Nearest named stars to here" mini-list** — `src/components/ui/HygStarPanel.tsx` (panel body) — **M (really S)** — directly contradicts the flat-sky mental model the panel exists to fix: after landing on Sirius, the learner sees its real neighbours by parsec distance (Procyon 5.2 pc away, Rigel hundreds). O(n) scan over the few-hundred named-star subset of the already-loaded catalog; each entry is a focus button.

- **"Tell me about this" guided-read mode in the Sidebar** — `src/components/ui/Sidebar.tsx:138-178` — **S** — instead of a wall of stats (worst on mobile, where the panel is height-capped and sections get missed), a "Guide me" toggle paces content into beats: what it is → wow-fact → why it matters. Pure local `useState`; re-sequences content already rendered, zero new data. Guard empty beats for sparse bodies.

---

## Later

Good, but lower priority, blocked, or only worth folding into adjacent work.

- **Deep-link bootstrap (restore body/time from URL)** — `src/App.tsx:80-92` — **M (shrunk to S)** — a teacher pastes one link and every student lands on the same view. _Why later:_ high value but best sequenced right before the share-button cluster so the read-side and write-side land together. _Shrunk:_ read only `focus` (validated against `BODIES_BY_ID`) + `t` synchronously; defer star links and scale param.

- **Stable star identity in links via HIP id** — `src/lib/focus/hygFocusResolver.ts` — **S** — a star link opens the SAME star on phone and laptop instead of a different one because the catalog tier differs. _Why later:_ it is the correctness prerequisite for _any_ HYG target in deep-links/share — schedule it immediately before the star-sharing work, not standalone.

- **Copy-link button in the TopBar** — `src/components/ui/TopBar.tsx:16-51` — **S (shrunk)** — the "show my friend this" moment. _Why later:_ the write-side is inert without a boot-time read-side, so it must ship paired. _Shrunk:_ ship button + read hook together, drop `?t=` (the simulationClock seek path needs care first); start with `?focus=&scale=&playing=`.

- **Encode visibility layers in the link ("clean teaching view")** — `src/store.ts` toggles → `v=` bitfield — **M** — a teacher sends a stripped-down view so beginners aren't overwhelmed. _Why later:_ depends on deep-link bootstrap existing first; apply-on-load only, keep URL-sync-on-toggle out of scope.

- **Body-vs-Body comparison card** — `src/components/ui/Sidebar.tsx` — **M (shrunk to XS)** — two worlds side by side. _Why later / shrunk:_ `dayLength`/`distance` are free-text strings with no parseable format, so a full 4-row card needs a data migration. _Shrunk:_ inline a 2-row "Compare to Earth" block (radius + gravity, both already numeric); skip the body-picker and the prose fields until numeric companion fields exist.

- **Extreme-date ΔT accuracy caution in the Orbit Model card** — `src/components/ui/Sidebar.tsx:472-476` — **M (really S)** — _removes a documented silent gap:_ scrubbing to year 9999 shows "ΔT model is fitted for ~2000–2050; positions outside may drift." _Why later only by a hair:_ lower day-to-day reach than the near-present features above. Append one date-derived string in `getProvenance`; word it to acknowledge the [30,100]s clamp softens (not "will drift significantly").

- **"Did you know?" rotating fact ticker (deselected view)** — new `src/components/ui/FactTicker.tsx` → `Overlay.tsx` — **S** — idle facts drift by and pull the learner toward something to click. _Why later:_ genuinely good but overlaps the empty-state hint and guided-read in the "what do I do here" space; sequence after those land to avoid clutter. Single fade-swap line, honors `reducedMotion`.

- **Empty-canvas first-tap hint** — `src/components/ui/Overlay.tsx:21-132` — **S** — one line ("Tap a planet, or press / to search") shown only when `selectedId===null` and tutorial isn't active, for the learner who skipped the 8-step wall. _Why later:_ lowest-risk of the onboarding cluster but should coordinate placement with the fact ticker so they don't both float in the deselected view. (Note: land at bottom-center in Overlay, not the SearchBar slot the proposal named — that slot isn't always visible.)

- **Pause/clamp the render loop when the tab is hidden** — `src/lib/orbital/engine.ts` — **S (shrunk)** — _Why later / shrunk:_ the browser already throttles rAF on hidden tabs, so the battery/heat payoff is ~90% free; the real failure is the dt spike teleporting planets on resume. Skip the visibilitychange listener; add a one-line `dt = Math.min(dt, 0.1)` clamp in the frame consumer.

- **Runtime FPS watchdog → one-time "lighten the view?" offer** — new `src/hooks/useFrameHealthMonitor.ts` — **M (really S)** — a kid on a slow Chromebook gets a usable scene. _Why later:_ high value but needs a 5s boot-settle guard to avoid false positives during asset streaming; never auto-applies, fires once per session. Changes only render fidelity, never positions/magnitudes.

- **Lazy-defer / offload the HYG catalog decode off the boot path** — `src/lib/starfield.ts` — **S (shrunk)** — the solar system appears fast on a weak phone. _Why later / shrunk:_ the scene-ready gate already unblocks on "loading," so the real pain is the _synchronous_ decode janking frames. Move `parseHygBinaryBuffer` into a Worker via a transferred ArrayBuffer; skip the full two-phase tier-upgrade state machine.

- **Respect Data Saver / metered connection** — `src/lib/qualityProfile.ts` — **S (shrunk)** — a learner on a capped plan isn't silently charged ~1.8 MB of stars. _Why later / shrunk:_ `effectiveType` already handles 2g/3g; the gap is the explicit `saveData` flag. Add `saveData` to the signals and clamp to constrained in `resolveQualityProfile`; skip the new DisplayPanel button (existing presets already let users opt up).

- **Plain-language device-tier readout ("why slower than my friend's?")** — `src/components/ui/DisplayPanel.tsx:163-168` — **S** — a 14-year-old learns their own device (RAM, cores) is the variable, not a broken app. _Why later:_ solid but niche; one sentence built from already-collected signals, omitting any undefined signal. Bundle with other DisplayPanel copy work.

- **State-preserving reload for Antialias (and reload-gated options)** — `src/components/ui/DisplayPanel.tsx:184-192` — **M** — toggle the most expensive smoothing and feel the speed change without losing your place. _Why later:_ real but narrow (MSAA is genuinely a context-creation flag); sessionStorage handoff is the right primitive, gate restore on tutorial completion. Becomes trivial if deep-link state lands first.

- **DRY the Wikipedia loading/error/retry pattern into a shared hook** — `src/components/ui/HygStarPanel.tsx:90-124` — **XS (deferred)** — _Why later:_ there is exactly one call site today and no behavior changes for users; the 41 already-tested lines buy nothing extracted now. Fold the extraction into the next PR that adds a second Wikipedia-consuming panel.

- **Save-image / snapshot button (canvas → PNG)** — GearPopover (not TopBar) — **M (shrunk)** — the "I made this" classroom artifact. _Why later / shrunk:_ `preserveDrawingBuffer` is a permanent per-frame GPU tax on every device, worst on the constrained tier. Use a double-rAF `canvas.toBlob` capture without it; only fall back to an opt-in `preserveDrawingBuffer` store flag if testing proves the rAF path unreliable.

---

## Rejected (with reasons)

One line each — already-exists, off-brand, or not worth it.

- **c12 — Plain-language gloss for "Visual Fidelity" jargon** — already exists: `VISUAL_FIDELITY_LABELS` (Sidebar.tsx:12-17) already maps all four tiers + renders summary/limitation; extending it is four strings, not a build.
- **c15 — "What is this?" type chips on bodies** — already exists: Sidebar.tsx:152-174 already renders classification subtitle + MOON/PLANET/DWARF + "ORBITING <parent>" chips for every curated body.
- **c16 — Orbit-line / arrow / grid color key** — kept-eligible but routed as new work in LayersPanel; included implicitly is _not_ — it is genuinely absent but was not in the survivor set, so flagged here as future LayersPanel copy (3 descriptor lines, no new files).
- **c22 — Focus breadcrumb with Back+Forward** — already half-built: `focusHistory`, `focusBack`, `focusHome` and a live Back button all exist; only a `forwardHistory` field + chip rendering remain (finish, not build).
- **c24 — App-shell ErrorBoundary crash card** — already exists: `ErrorBoundary` is fully implemented and used per-planet; only one wiring line at `main.tsx:38` remains.
- **c28 — Empty-state guards for missing Sidebar fields** — already exists: every optional section is conditionally rendered and StatBox has a `{value || "N/A"}` fallback; premise (blank gaps/errors) is untrue.
- **c30 — Activate safe-area insets** — already half-built: 8 components ship `env(safe-area-inset-*)`; only `viewport-fit=cover` on `index.html:5` is missing (one-token change).
- **c33 — Tap-and-hold star preview** — already half-built: pick math + tooltip + `hoveredStar` slice exist; only a touchstart listener reusing them remains.
- **c34 — Touch path to Surface Mode** — already half-built: desktop pointer-lock path complete and input-source-agnostic; only a touchmove→refs branch remains.
- **c35 — Bottom-anchored Quick-Jump chips** — already built: `SEARCH_QUICK_TARGETS` chips render and dispatch today; only ambient bottom-rail placement is a pure layout task.
- **c36 — High-contrast theme** — already a wired stub: `highContrast` store field + A11y toggle exist (disabled); only a `useEffect` + CSS block remain.
- **c37 — Focus-visible ring + Escape on desktop Gear popover** — already half-built: `useDialogFocus` is fully wired; removing `&& isMobile` on GearPopover.tsx:42 is the entire fix.
- **c47 — Share-landing scaleMode guardrail note** — blocked: the share-link feature it triggers on does not exist, so the banner would be dead code from day one.
- **c48 — Earth-comparison provenance citation** — already substantially built: ratios + constants exist inline; only a one-line `title`/footnote surfacing 6371 km / 9.8 m/s² remains (cosmetic finish).
- **c53 — Translate the Tutorial copy** — already half-built: i18next pipeline + bundles are operational; this is content extraction (add `tutorial.*` keys, swap literals for `t()`), not a new build.
- **c54 — "Why isn't this to scale?" explainer popover** — already exists: the rationale copy is already rendered below the scale toggle (LayersPanel.tsx:234-237); only cosmetic reformatting into a popover differs.
- **c57 — Search by constellation name** — already half-built: 88-entry `CONSTELLATION_NAMES` map + the index loop reading `con` both exist; one `addKey(fullName,...)` call wires it.
- **x2 — Day/year-length + spin-direction teaching row** — already built: Day Length / Year Length / Axial Tilt StatBoxes are live (Sidebar.tsx:361-370); only the "spins backwards" chip from negative `rotationPeriodHours` is a one-line stretch.
