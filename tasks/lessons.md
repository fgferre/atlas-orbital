# Lessons — Atlas Orbital

Meta-rules distilled from 34 incidents (sessions 2026-04-17 → 2026-04-24).
Each rule is the generalised trap that a family of incidents share. When a
new failure mode surfaces, check whether it specialises an existing Mx
before appending — a seventh rule only earns its place after ≥3 incidents
share a pattern that genuinely doesn't fit M1-M6.

**Where the anecdotes live.** `git log tasks/lessons.md` preserves the full
incident history (pre-consolidation revision has every L1-L32 narrative).
The auto-memory system at `~/.claude/projects/.../memory/` carries the
behavioural rules that fire cross-session. Precedence: `feedback_*.md`
files over this file for rules; this file over memory for atlas code
markers.

---

## M1. Ground truth is the wired runtime, not prose

Any claim about what the code / data / scene does — docstring, ROADMAP
entry, subagent synthesis, formula description, external AI review, user
memory, cited value in a comment — is a HYPOTHESIS until verified against
the executed artefact. Four gates:

- **R1 two-sided.** Before porting, read BOTH cited Gaia source AND
  current atlas state; `git log` the atlas file because the fix may have
  shipped since the audit. Shader-file existence ≠ active — grep
  `MainPostProcessor.java` (or composer) for `new <Class>(` before
  treating a Gaia file as a port target; if zero hits, the file is
  documentation of an experiment.
- **Line-by-line diff before any "1:1 port" claim.** Codex / subagent
  prose pattern-matches; the mechanical diff compares tokens. Every
  divergence carries a one-line rationale (arch adaptation / HDR
  strategy / intentional tuning) or it's a ship blocker.
- **Scope the gate where the values actually live.** Shader diff misses
  numeric constants set in host-side Java / TS wrappers
  (`AtmosphereComponent.java`, not just `atmosphere.frag.glsl`). The
  `config.yaml` default branch may not be the one atlas ships — trace
  the variant selector to its `MainPostProcessor` branch before tuning.
  Cite `file:line` for every numeric claim; "default Earth value" is
  invention until grepped. Attribute names can lie about physics — JPL
  "reference plane" varies per satellite, Gaia `a_size` is pseudo-size
  not physical radius. Trace shader read → CPU write site → catalog
  loader → JavaDoc before inferring physics from a name.
- **Contradictions between passes = investigate, never average.** Two
  reviewers, tools, or audit passes disagreeing about the same code is
  evidence that at least one is wrong. Budget 5 min to spot-check before
  consolidating. Subagent claims of "atlas has/doesn't have X" always
  get the 30-second `Read`/`Grep` before folding into user-facing
  synthesis. Cross-AI cold reads hallucinate too — apply the same
  `file:line` standard to external reviews. Provenance strings describe
  the operation the user-facing code performed, not the literature it
  loosely resembles.

**Fires when:** starting any port; reading a ROADMAP entry older than a
few commits; accepting a subagent / AI / user-memory claim that scopes
work; two gates disagree about the same code.

**Canonical code markers:** `sanitizeVsopSeries()` in
`src/lib/orbital/analytical/vsop87Planets.ts`; `provenanceFor()` in
`analyticalProvider.ts`; `SatelliteEntry.source` discriminant in
`satellites.ts`; DIFF GATE (step 4) + PREDECESSOR SWEEP (step 5) in
`tasks/STATUS.md`; `GAIA_DEFAULT_*` atmosphere constants in
`src/components/canvas/shaders/atmosphereShader.ts` with
`AtmosphereComponent.java:LINE` citations; `LightGlowInjector.tsx:141-186`
(atlas state outran the ROADMAP — shipped at `a27dc42`); ROADMAP §T3.9
"NOT PORTING — Gaia dead code" header; baseline-PNG human gate in
STATUS.md §Ship-protocol step 10.

**Folds:** L1 L3 L4 L7 L22 L23 L24 L25 L27 L30 L31 L32.

---

## M2. Smallest change; cleanup pass is not optional

Every diff answers ONE reported symptom and defends itself on that
symptom's evidence. "While I'm here" changes hide their own justification
— raised HYG Pogson floor for a tier that never hit the old floor
flattened 90 % of the catalogue; neither change would have survived its
own justification round shipped separately. After any strategy change,
grep every symbol the old strategy introduced and delete dead callers
BEFORE marking done (dead code that ships is an unpaid debt). When
porting an effect with an atlas-native predecessor (sprite flare,
procedural halo, manual shader), delete the predecessor in the SAME
commit — two renderers + one post-FX reading the scene = phantom light
source the bloom treats as legitimate.

**Fires when:** a fix touches more than one call site; after refactoring
away a helper; porting a Gaia effect that overlaps anything atlas
already ships.

**Canonical code markers:** `perifocalToEcliptic` + `elementsToCartesian`

- `solveKeplerRad` in `coordUtils.ts` (single solver, delegated by
  `keplerProvider`); `hygTierForQuality()` in `src/lib/starfield.ts` pinned
  by `starfield.test.ts`; PREDECESSOR SWEEP step 5 in STATUS.md kickoff.

**Folds:** L5 L12 L29.

---

## M3. Port pixels, not formulas — calibrate against reference output

Ported formulas that match token-for-token can still look wrong on screen
because the **calibration constants** live in the host-side wrapper, not
the shader. The test is "what pixel size and alpha does the reference
emit for sample inputs", not "does the math match". Three corollaries:

- **Anchor perceptual layers to the raw physical axis.** Smoothstep
  lifts, tone curves, gamma bumps — parameterise on the quantity the
  human reasons about (apparent mag), never on an internal transform
  (`compressedMag`). Else telescopic stars out-brighten binocular stars.
- **No global hard floors on a physics curve.** A flat clamp over 109k
  stars where > 90 % sit past mag 6.5 turns the tail into a uniform
  plate, destroying magnitude ordering. Use a graduated smoothstep
  window with fade-to-zero before the deep tail.
- **When the reference uses a perceptual curve, match the curve
  shape.** Fechner log-compression (`brightness = 2·log(1 + flux·C)`)
  already is the eye-response shape; stacking Pogson + clamps + ad-hoc
  lifts to approximate it is the long way around. When in doubt, port
  the reference's calibration end-to-end: size multiplier, clamp range,
  clamp order (before/after `× particleSize`), alpha formula, fragment
  exponent, and DPR source (`gl.getPixelRatio()`, not
  `window.devicePixelRatio` — atlas clamps DPR in the renderer).

**Fires when:** porting any visual effect judged by eye; tuning
photometric transforms; debugging "looks timid / too fuzzy" on a
correctly-ported shader.

**Canonical code markers:** `brightness = 2·log(1 + flux·250)` in
`src/components/canvas/Starfield.tsx` (250 = NASA absMag+inverse-square
collapsed for solar-system-local observer; ~1.75 % divergence at 1000 AU
for Proxima — documented in shader comment); `faintLift = smoothstep(6.0,
7.5, mag) * (1 - smoothstep(9.5, 12.0, mag))` using raw `mag`;
`starfieldShaderMath.test.ts` pins monotonicity ("mag 7.5 strictly
brighter than mag 12"); atmosphere `GAIA_DEFAULT_*` constants.

**Folds:** L13 L14 L16 L17.

---

## M4. 60 Hz hot-path hygiene

Per-frame code allocates nothing, constructs nothing, traverses nothing,
and writes no store-level state unless an observable output changed. Four
invariants:

- **Materials with per-frame-mutated uniforms are built explicitly.**
  `useMemo(() => new THREE.ShaderMaterial(...), [])` + `<points
material={m}>`. NOT `<shaderMaterial uniforms={{...}}>` as a JSX child
  — each parent render hands a fresh uniforms object; the compiled
  WebGLProgram stays bound to the original; `useFrame` writes become
  no-ops. React Compiler's immutability warning here is silenced with a
  scoped disable since the mutation is intentional.
- **Scene-graph lookups and scratch vectors live at module scope.**
  `Map<bodyId, Object3D>` populated lazily, invalidated when
  `cached.parent === null`. One `TMP_WORLD` per file reused across
  bodies in the same `useFrame` tick (R3F serialises frame callbacks,
  so shared scratch is safe).
- **Simulation time lives in a plain object, not the store.**
  `simulationClock.getNow()` inside `useFrame`; a low-rate mirror
  (`displayedDatetime`, ~4 Hz + milestones) drives UI surfaces that need
  React invalidation; the store owns playback intent (`isPlaying`,
  `speed`, `isLiveMode`), never the tick. Drive `startLoop`/`stopLoop`
  unconditionally from the intended state — both calls are idempotent
  and the "only start on transition" guard is a silent-freeze trap.
- **Store writes gated by pixel-quantized fingerprint.** Build a compact
  key (id + quantized x/y + visibility); only call the setter when the
  key differs. Combined with `React.memo` + specific selectors
  downstream (never `useStore()` without a selector in a render-heavy
  subtree), the tree stays silent during camera idle.

**Library globals corollary.** Leva's `useControls` / `folder` / `button`
auto-mount a panel in `document.body` when no `<Leva />` is in the tree.
Keep `<Leva />` mounted always; control visibility via `hidden`, never
conditional JSX. Any global-store library has the same failure mode.

**Fires when:** editing inside `useFrame`; wiring a store subscription in
a render-heavy subtree; mounting a global-store library.

**Canonical code markers:** memoised material in
`src/components/canvas/Starfield.tsx`; `src/lib/simulationClock.ts` +
store↔clock bridges in `src/store.ts`; `OverlayPositionTracker.tsx`
(`meshCache`, `TMP_WORLD`, `prevKeyRef`, pixel fingerprint);
`CameraController.tsx` (`focusMeshRef`, `TMP_WORLD_POS`); `Scene.tsx` —
`<Suspense fallback={null}><Leva hidden={!debugMode} /></Suspense>`
mounted unconditionally.

**Folds:** L15 L18 L19a L19b L19c L20.

---

## M5. A gate only catches drift inside its own scope

Every verification mechanism has a scope; drifts outside that scope sail
through no matter how many times you re-run. Five gates, each with its
blind spot:

- **Single screenshot** proves compile + static draw, NOT temporal
  stability. Flicker from transparent-sort flips is multi-frame. Either
  get user live-watch confirmation ("does it flicker or blank?") or
  sample `readPixels` across ≥30 frames and assert ≤1-step variance.
- **Shader DIFF GATE** checks GLSL tokens; misses numeric constants set
  in host-side Java / TS wrappers. Expand scope to the host file or
  cite `file:line` for every uniform default.
- **Playwright `--update-snapshots`** proves the new frame is
  self-consistent, NOT that the baseline is correct. Requires a
  human-eye diff of OLD baseline vs new render (`npx playwright test
--reporter=html`) and a commit message citing which code change
  caused which visual delta. PNG file-size delta (e.g. 333 → 130 KB) is
  a first-pass "scene complexity changed substantially" signal worth
  closer inspection.
- **Claude Preview HMR** state accumulates across in-session edits —
  multiple WebSocket clients, frozen canvas at boot stage, screenshot
  timeouts. `preview_stop` + `preview_start` resets; don't bisect
  runtime code when the logs already named the failure mode.
- **In-session subagent synthesis** can miss architectural stacking
  that a cold external agent with only repo URL + SHAs catches
  (different framing widens scope from "single-shader port" to
  "architecture"). Schedule cross-AI at phase boundaries.
- **Texture wrap-mode × edge-pixel contract is invisible to every
  math/diff gate.** DIFF GATE sees the GLSL tokens; SUBAGENT VERIFY
  sees source-vs-port; unit tests see the formula. None of them
  exercise what the shader's sampler DOES with the baked texture's
  edge row/column. `ClampToEdgeWrapping` replicates the edge pixel
  **infinitely** along any axis where `glow_tc` overflows [0, 1]
  — a gaussian with σ=20 in a 128-wide sprite has ~0.006 brightness
  at the middle of each edge, and that tiny value smeared along 4
  cardinal rays per light reads as "cartesian cross-spikes on every
  bright star" when accumulated across multi-light halo effects.
  Pin a border-zero invariant in the sprite's unit test (every
  pixel on each of the four edges `=== 0`) any time you ship a
  procedural sprite sampled under `ClampToEdge`. Gaia's real
  vendored textures already have zero borders; the trap is
  atlas-specific to our procedural substitutes.
- **Subagent `file:line` citations need spot-check verification
  before you build on them.** Broad-scope audit prompts nudge
  subagents toward confident-sounding but fabricated citations —
  `SunComponent.java:50-70` and `$GS_DATA/tex/base/sun-{surface,
glow,corona}` both came back in the 2026-04-23 T4.9 Sun audit,
  and neither exists in `/tmp/gaiasky/`. The ROADMAP picked up an
  entire sub-wave plan (T4.9a/b/c) on those fabricated paths
  before the next iteration's R1 grep caught it. Mitigation:
  grep the file path + read the cited lines on at least 2-3
  claims from any subagent verdict before using it as a ship
  basis. If ANY cite is wrong, treat the whole report as
  unreliable (the confidence of the language is uncorrelated
  with accuracy — fabrication is cheaper than real analysis for
  a subagent under broad scope). Pair this with M1 ("ground
  truth is the wired runtime, not prose") — Gaia source IS the
  wired runtime for port-direction claims; subagent prose is not.
- **Per-commit gates miss cross-commit cumulative regressions.**
  DIFF GATE + SUBAGENT VERIFY scope to the ship under review;
  they cannot see that commit N's pure-TS math helper + commit
  N+2's new useFrame + commit N+4's new `document` listener
  together push a frame over the 10 s Chrome GPU watchdog
  threshold. The 2026-04-23 session shipped 18 feats in one day,
  every gate green on each; the COMPOSITION produced a
  white-canvas regression that took a 2026-04-24 external-agent
  audit (Codex) + 4 parallel Sonnet subagents to root-cause.
  Primary mechanism turned out to be a 100 ms race window in
  `InitialCameraAnimation` where the camera was at ~1e12 world
  units but the `isIntroAnimating` gate had not yet flipped, so
  distance-sensitive consumers uploaded ~1e10-scale vertices and
  ANGLE/D3D11 stalled — a physics problem invisible to any
  CPU-side gate. Amplifiers landed as debug helpers in the same
  session (`main.tsx` error listener leak across HMR,
  `SurfaceModeFirstPerson` pointer-lock retry loop). Mitigation
  for future waves: after ≥3 commits touching the same subsystem
  (Camera / Scene / Planet / postprocess), run a cumulative-smoke
  step — build prod bundle, serve, record Chrome Performance
  from cold boot, confirm first-frame <100 ms and no long tasks
  > 50 ms. If preview-MCP runtime smoke is unavailable (the
  > 2026-04-23 session's known HMR-env issue), schedule an external
  > audit at the wave boundary instead of waiting for a user bug
  > report. Dovetails with the "cross-AI at phase boundaries"
  > bullet above: the trigger threshold is "≥3 commits to same
  > subsystem", not just "phase complete".
- **`setInterval`-driven state is the wrong authority for critical
  UI gates.** The loader's `canExitLoader` gate was conditioned on
  `displayProgress >= 99.5`, where `displayProgress` was a React
  state lerped by a 16 ms `setInterval`. Under main-thread
  congestion (R3F scene-ready shader compiles + first paint), the
  interval callback can be queued for 10-20 s without firing —
  a Playwright dense-timeline diag measured an 18-second stall of
  `displayProgress === 73 %` with the stage already "ready" and
  `getNextLoaderDisplayProgress` returning 100 unconditionally.
  The gate was scoped to a state that implicitly assumed "timer
  fires on schedule"; when that assumption broke, the gate silently
  froze. **Mitigation**: for critical gate conditions, derive the
  value in render instead of relying on a timer-driven state. In
  T5.7 the fix was `effectiveDisplayProgress = stage === "ready"
? 100 : displayProgress` — the gate became independent of
  `setInterval` scheduling. Fires when: gating an exit animation,
  a route transition, or any handoff on a value that gets updated
  by a callback (`setInterval`, rAF, listener) rather than by a
  pure render-time derivation. Also applicable to `setTimeout`-
  delayed state flips — same starvation pattern.

**HDR pipeline corollary.** `depthTest: false` and `toneMapped: false`
are implicit contracts with every HDR post-effect ("treat me as a light
source"). Default both `true`. When a material legitimately needs either
off it must live in a pass HDR post-effects skip — atlas has no such
pass today, so each off-flag is a debt. Grep both flags during any
lens-flare / bloom / LightGlow audit.

**Fires when:** marking "runtime smoke passed" on a visual shader
change; regenerating a Playwright baseline; after a burst of HMR edits;
consolidating multi-pass audit output.

**Canonical code markers:** Ship-protocol step 8 (temporal smoke) + step
10 (baseline PNG human gate) in `tasks/STATUS.md`; HDR convention
`depthTest={true} toneMapped={true}` per `ProceduralSun3D.tsx:419,445,475`
and the `1d6cc30` fix to `SunScreenFlare.tsx` + `PlanetMotionOverlays.tsx`.

**Folds:** L11 L26 L28 L29-framing L32-screenshot.

---

## M6. Explicit units at every boundary

Numerical values carry implicit assumptions (time scale, reference plane,
magnitude convention, pixel-ratio source, module resolver, port policy).
Name them at the interface; never cross a boundary without a named
conversion. Duplicated math inside one engine is the same smell — two
solvers, two rotations = two truths.

- **Epoch tags match the propagator's time scale.** If the engine
  evaluates at TDB, the epoch JD is TDB (not UT — 74 s gap becomes a
  0.97° Phobos error at the supposed epoch). Accept two-body
  propagation's accuracy horizon honestly: record per-body drift
  (Io ~70°/yr, Titan ~1°/yr, Oberon ~1.5°/yr) with the physical reason,
  don't loosen tolerances silently. When drift is a UX problem, the fix
  is periodic epoch refresh or adding the specific perturbation term.
- **Tooling contracts are literal.** TypeScript under `moduleResolution:
"bundler"` ignores ambient `declare module` — use a typed shim module,
  not `.d.ts`. Playwright on a fixed port needs `--strictPort` on the
  dev server or the webServer waits at 4174 while Vite bumps to 4175.
  CLAUDE.md file paths (`tasks/todo.md`, `tasks/lessons.md`,
  `AGENTS.md`) are literal — `TodoWrite` is complementary, not a
  substitute. Don't invent files, APIs, scripts, or env vars in
  comments: either the script exists at the cited path, or the
  derivation is narrated inline, or the comment is silent.
- **One solver, one rotation.** When a helper already exists, consume it
  or factor out the shared core — don't add a second copy "for clarity".
  Clarity is the reader seeing one solver, not two.

**Fires when:** writing a numerical value alongside a time/frame field;
adopting a new tooling contract (tsconfig, test harness, CI); finding
yourself typing a second implementation of a shared math op.

**Canonical code markers:** `EPOCH_2020_JD` in
`src/lib/orbital/analytical/satellites.ts` with TDB conversion comment;
`scripts/derive-elements-from-fixtures.js` applies `dateToTDB` before
emitting; `src/lib/orbital/analytical/astronomiaShim.ts`; `"preview:test":
"vite preview --host 127.0.0.1 --port 4174 --strictPort"` in
`package.json` + fixed `baseURL` in `playwright.config.ts`;
`MULTI_EPOCH_OVERRIDES` in `regression.test.ts` with physical-reason
comments per body.

**Folds:** L2 L6 L8 L9 L10 L21.

---

## Appending rule

New incident → check if it specialises an existing Mx. If yes, append
one bullet under that rule's list + a code marker; don't spawn a new
meta-rule. Open M7 only after ≥3 incidents share a pattern that
genuinely doesn't fit M1-M6.
