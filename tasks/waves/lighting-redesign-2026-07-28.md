# Wave — Lighting redesign (Onda 1 items 1-3, Onda 2.1)

_2026-07-28. Source: `handoffiluminacao.md` (repo-worktree root, READ-ONLY,
owner's file — never commit or edit it). That doc's §1 records product
decisions already made; §2 the pre-implementation code audit; §4 the
corrected Onda plan; §5 open design decisions; §6 the implementation
checklist. This wave file records what was shipped against that plan._

Read [`../../AGENTS.md`](../../AGENTS.md) before touching code. That file
is product law. This wave file is **operational context**.

---

## Scope of this session

Onda 1 items **1** (delete the 5 dead lighting controls, keep + repurpose
ambient) and **3** (non-zero display ambient floor, composed through the
lerp targets). Item 2 (per-light regolith photometry rewrite) is explicitly
a **separate agent's** work — not touched here, see "Item 2 — next" below.
Items 4 (assist naming/disclosure), 5, 6 are **blocked on owner decisions**
recorded in the handoff's §5 — not started.

---

## Item 1 — deleted the four dead controls, kept + repurposed ambient

**Root cause (from the pre-existing audit, re-verified against HEAD):**

- `ambientIntensityMul` / `envMapIntensityMul` multiplied preset bases that
  are `0.0` in all 5 `VISUAL_PRESETS` (`src/config/visualPresets.ts`) — the
  header there documents this as the Gaia-fidelity baseline, not a bug.
  `0 × anything = 0`; the sliders had no floor other than that preset zero,
  so they were provably inert.
- `shadowIntensityMul` fed `SmartSunLight`, which `SceneLighting.tsx`'s own
  comment already documents as **inert**: the light sits on layer 1
  (`SmartSunLight.tsx:74`) while the render camera never leaves layer 0, so
  three collects neither its illumination nor its shadow map.
- `shadowMapSize` / `environmentResolution` sized that same inert
  `SmartSunLight` shadow map and the `<Environment>` cubemap whose
  `environmentIntensity` the ambient-floor-adjacent `envMapIntensity` chain
  force-zeroes every frame — resizing either changes the cost of computing
  something nothing reads.

**What was removed** (DisplayPanel controls + their fields end-to-end):

- `src/components/ui/DisplayPanel.tsx` — deleted the "Shadow Map Size" and
  "Env Map Resolution" `Select`s (with their now-unused `SHADOW_OPTIONS` /
  `ENV_RES_OPTIONS` constants) and the "Shadow Light ×" / "Env Reflections
  ×" `Slider`s.
- `src/lib/graphics/resolver.ts` — removed `shadowMapSize` /
  `environmentResolution` / `shadowIntensityMul` / `envMapIntensityMul`
  from `GraphicsOverrides` (no longer user-overridable).
  `shadowIntensityMul` / `envMapIntensityMul` are also gone from
  `EffectiveGraphics` and every `PRESET_DEFAULTS` entry (pure override
  multipliers with no other consumer). `shadowMapSize` /
  `environmentResolution` **stay** on `EffectiveGraphics`/`PRESET_DEFAULTS`
  as tier-only values — `Scene.tsx` still threads them into `SceneLighting`
  and `<Environment>` (out of scope to touch; the task explicitly named
  `SmartSunLight`/`SceneLighting` off-limits), they just no longer take a
  DisplayPanel override. `resolveEffectiveGraphics` now reads
  `base.shadowMapSize` / `base.environmentResolution` unconditionally.
- `src/components/canvas/scene/visualPresetOverrides.ts` — removed
  `shadowIntensityMul` / `envMapIntensityMul` from its own (separate)
  `GraphicsOverrides` interface. `resolveLerpRefTargets` now passes
  `preset.shadowIntensity` / `preset.envMapIntensity` straight through
  (still written every frame to `smartSunLightRef` / `scene.environmentIntensity`
  by `useVisualPresetLerp.ts`, which is unchanged and out of scope) instead
  of multiplying by a deleted override.

**Kept:** Sun Brightness × (`sunIntensityMul`, live — scales the one real
light). Ambient Light × was kept and repurposed, see Item 3.

**Tests updated in the same commit (AGENTS.md §6 authorizes deleting
impl-pinning asserts for deleted fields):**

- `src/lib/graphics/resolver.test.ts` — the "every \*Mul field defaults to 1"
  test dropped its `shadowIntensityMul` / `envMapIntensityMul` assertions.
  The byte-match test (`shadowMapSize` / `environmentResolution` vs
  `qualityProfile.ts` `RESOLVED_PROFILES`) is untouched — those fields are
  still real tier config, still worth pinning.
- `src/components/canvas/scene/visualPresetOverrides.test.ts` — the
  "every \*Mul field scales independently" test dropped the two deleted
  overrides and gained an explicit assert that `shadowIntensity` /
  `envMapIntensity` now always equal the preset value regardless of the
  (now nonexistent) override keys. The "all override types combined" test
  dropped the same two keys from its input object.

---

## Item 3 — default ambient viewing floor via lerp targets

**Product decision (owner, handoff §1, not reopened here):**
assisted-by-default, on a triple precedent — Atlas already ships
`scaleMode: "didactic"` as an undisclosed-by-default convenience, NASA Eyes
defaults to its assisted "Shadow" light mode, and the entire comparison set
(NASA Eyes 0.005 / Stellarium 0.02 / OpenSpace 0.05) ships a non-zero
ambient floor. Chosen default: **0.02**, mid-industry — matches
Stellarium's hard-coded value exactly (a realism complaint against it was
closed wontfix, `Stellarium/stellarium#669`).

**Mechanism.** `AMBIENT_VIEWING_FLOOR = 0.02` is a new exported constant in
`src/components/canvas/scene/visualPresetOverrides.ts`, with the three-source
citation in its JSDoc. `resolveLerpRefTargets` composes it as:

```ts
ambientIntensity:
  Math.max(preset.ambientIntensity, AMBIENT_VIEWING_FLOOR) *
  (overrides.ambientIntensityMul ?? 1),
```

**Why `max`, not additive.** A floor is a guaranteed minimum, not a boost —
`max` never stacks on top of a preset that someday ships its own non-zero
ambient (every preset is `0.0` today, so the two forms are numerically
identical right now, but `max` is the semantically-correct one for a
"floor" and stays correct if that preset invariant ever changes). This
satisfies all three constraints from the task:

- **(a) slider-at-0 → true zero.** `overrides.ambientIntensityMul ?? 1`
  multiplies the WHOLE `max(...)` term, so `0` zeroes both the preset base
  and the floor — the fully-unassisted physical render is still one click
  away.
- **(b) survives the per-frame write.** `resolveLerpRefTargets` runs inside
  `useVisualPresetLerp`'s `useFrame` callback every frame (unchanged call
  site) — the floor is computed fresh each time, not set-and-overwritten.
- **(c) preset 0.0 values untouched.** Only read via `preset.ambientIntensity`
  inside `Math.max`; `visualPresets.ts` was not edited numerically (a
  forward-reference comment was added to its header pointing at this file,
  since a reader hitting `ambientIntensity: 0.0` there would otherwise
  reasonably conclude the app renders true black).

**UI:** the "Ambient Light ×" slider was renamed **"Ambient Floor ×"** in
`DisplayPanel.tsx` (same range/step, same underlying `ambientIntensityMul`
override field — repurposed, not replaced) with a hint line: "Minimum
dark-side brightness so shadowed terrain isn't pure black. 0 =
physically-accurate darkness." Default slider value 1 → floor 0.02 active
out of the box, matching the product decision.

**Disclosure scope (handoff item 4 — explicitly NOT this commit's job):**
this is a **display** control — no scale-pill-style UI ships with it; that
work is blocked on an owner decision (single-surface vs second pill, handoff
§5.6). What DID ship: an honest JSDoc on `AMBIENT_VIEWING_FLOOR` and a new
Credits entry ("Ambient light — a display floor, not physics") in
`src/components/ui/CreditsModal.tsx`, following the same disclosure idiom
already used there for AgX tone mapping and star rendering.

**Not touched, per explicit scope:** `SceneLighting`'s `decay=0`,
`SmartSunLight`, `regolithPhotometryPatch.ts` (Item 2, a separate agent),
tone mapping, and every numeric value inside `visualPresets.ts`.

**Tests updated (same file, same reasoning as Item 1):**
`visualPresetOverrides.test.ts`'s identity test now asserts
`ambientIntensity === AMBIENT_VIEWING_FLOOR` (not `BASE_PRESET.ambientIntensity`)
with empty overrides — this is a real, intentional behavior change, not a
pin regression. Added a dedicated `ambientIntensityMul=0 → true zero` test.

---

## Item 2 — regolith photometry as a per-light `RE_Direct` wrapper (done)

**Root cause.** The prior patch anchored after `#include
<lights_fragment_begin>` and multiplied the POST-SUM
`reflectedLight.directDiffuse` (the accumulation across every direct light
in the scene) by geometry derived from a single assumed sun at the world
origin (`viewMatrix[3].xyz`). With today's one `pointLight` this is
harmless, but any future second direct light — planetshine is planned for
Onda 2 — would have been amplified by up to ~13.3x near its own terminator,
because the correction factor was computed from a DIFFERENT light's
incidence geometry than the one it was scaling.

**Fix.** Three.js calls `RE_Direct` once per direct light
(`lights_fragment_begin.glsl.js`'s point/spot/directional loops), and
`RE_Direct` is a macro (`#define RE_Direct RE_Direct_Physical`, set at the
end of `lights_physical_pars_fragment.glsl.js`). The patch now injects
after `#include <lights_physical_pars_fragment>` (moved from
`lights_fragment_begin`, which is too late — the macro has to be redefined
before the light loop calls it) and defines a wrapper:

```glsl
void RE_Direct_Regolith( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

  vec3 lsDiffuseBefore = reflectedLight.directDiffuse;

  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

  float lsMu0 = saturate( dot( geometryNormal, directLight.direction ) );
  float lsMu = saturate( dot( geometryNormal, geometryViewDir ) );
  vec3 lsDiffuseDelta = reflectedLight.directDiffuse - lsDiffuseBefore;
  reflectedLight.directDiffuse = lsDiffuseBefore + lsDiffuseDelta * ( 1.3333333 / max( lsMu0 + lsMu, 1e-4 ) );

}
#undef RE_Direct
#define RE_Direct RE_Direct_Regolith
```

Each light's diffuse delta is now scaled by THAT light's own `mu0`/`mu` —
bounded to ≤ 4/3 by construction regardless of how many direct lights end
up calling `RE_Direct`. The `viewMatrix[3].xyz` sun-at-origin hack is gone
entirely: `directLight.direction` is a value three.js already computes per
light from scene state, so moving the Sun (or adding a second light) can no
longer silently break the photometry. Only the diffuse delta this call just
added is touched; specular/clearcoat/sheen and any earlier light's
already-accumulated diffuse pass through unscaled — same invariant the old
post-sum form held.

**Single-light identity, verified.** With today's one `pointLight` at the
world origin, `directLight.direction` is exactly `normalize(pointLight.position

- geometryPosition)`in view space — the same vector the old code derived
from`viewMatrix[3].xyz - geometryPosition`(the view-space position of the
world origin is the view matrix's translation column by definition).`directDiffuse`starts at`vec3(0)`before the scene's only light call, so`delta == reflectedLight.directDiffuse`there and`before + delta _ factor`reduces to exactly the old`sum _= factor`. `npx playwright test
  e2e/boot.spec.ts` confirmed zero pixel change against the frozen boot
  baseline, corroborating the algebra at runtime.

**Files:** `src/components/canvas/shaders/regolithPhotometryPatch.ts`
(rewritten, full derivation in its header),
`src/components/canvas/shaders/regolithPhotometry.test.ts` (quadrature
re-derivation of 4/3 kept verbatim; regex re-pinned to the new
`lsDiffuseDelta * ( 1.333... /` shape; added asserts that the old post-sum
line is absent and that the wrapper/macro-redirect shape is present).
`src/components/canvas/planet/usePlanetMaterials.ts`'s two call sites
(Moon's eclipse-branch and the trailing airless-body branch) both moved
their anchor from `#include <lights_fragment_begin>` to `#include
<lights_physical_pars_fragment>`.

---

## Onda 2.1 — per-body solar irradiance from ephemeris AU (done)

Queue step 1 of the "Owner decisions — 2026-07-29" list below. **Ships as a
visual no-op by construction** — see "The no-op contract" — so the owner sees
zero change until the badge + assist agent flips the default.

### Resolver — `src/lib/graphics/solarIrradiance.ts`

`E(d) = (d₀ / d)²` with `d₀ = SOLAR_IRRADIANCE_ANCHOR_AU = 1`, so Earth reads
1.0, Mercury near perihelion ≈ 10.4×, Neptune ≈ 1/900.

- **The anchor is PROVISIONAL and says so in its JSDoc.** Handoff §5.3 ("what
  does 0 EV mean physically") is still OPEN, so no absolute W/m² or EV claim is
  made. 1 AU was chosen because Earth is the one body whose look the project
  has tuned against reference imagery, which makes this change a
  redistribution rather than a global brightness edit. When §5.3 closes, that
  constant moves — not the call sites.
- **Input is ephemeris AU, never world coordinates.** `resolveBodySunlightScalar(bodyId, date)`
  is the app-facing entry point precisely because a caller holding a body id
  and a date cannot reach scene coordinates; it composes through
  `resolveHeliocentricDistanceAU`, which walks `parentId` to the Sun in
  physical AU (so Europa gets Jupiter's ~5.2 AU, not its own 0.0045 AU
  `orbit.a`). The pure kernel `solarIrradianceAtAU` takes a plain number, so
  the _type_ cannot distinguish AU from render units; the clamp
  `[0.05, 1000] AU` is the second line of defence — 0.05 sits inside
  Mercury's 0.3077 AU perihelion and keeps the Sun's own `d = 0` from dividing
  by zero; 1000 sits past Sedna's 970.1 AU aphelion, so a render-space caller
  (didactic cap 3200) lands on a bounded, uniformly-black value instead of a
  plausible-looking wrong one.
- **Fusion, one number.** `fused = E(d) × assistGain(d, policy)`. The two
  factors never exist as separate uniforms — that is handoff §4 Onda 2's named
  failure mode ("senão nascem dois multiplicadores empilhados que depois
  brigam").
- **Policy shape the next agent flips.** `SunlightAssistPolicy =
"compensated" | "real"`, with `DEFAULT_SUNLIGHT_ASSIST_POLICY =
"compensated"` and a live `{ value }` singleton
  (`get/setSunlightAssistPolicy`) copying `exposureRegistry.ts`'s idiom.
  `"compensated"` gain is exactly `1 / E`; `"real"` gain is 1. The plan's
  third "Realçado" position is documented as the natural next member but
  deliberately NOT declared — an unimplemented union member is a branch every
  consumer must handle for no behaviour. **The next agent changes the default
  policy value, not the plumbing.**

### Where the uniform lands — `solarIrradiancePatch.ts`

One `uniform float u_solarIrradiance`, injected by `applyPlanetDirectLightPatch`
at the `#include <lights_physical_pars_fragment>` anchor, wrapping `RE_Direct`:

```glsl
IncidentLight scaledLight = directLight;
scaledLight.color *= u_solarIrradiance;
RE_Direct( scaledLight, … );   // macro → whatever inner patch is installed
```

- **It scales the incoming irradiance, not the BRDF result.** So it reaches
  diffuse, specular, clearcoat and sheen with one multiply (all linear in
  incident radiance), and it lands **before** the Lommel-Seeliger factor —
  which is a purely geometric, flux-neutral redistribution in μ₀/μ. "How much
  light arrived" and "how that light is redistributed across the disc" stay
  independent concerns.
- **Composition with the Onda 1.2 regolith wrapper is by macro, not by name.**
  The regolith wrapper calls `RE_Direct_Physical` explicitly, so it must be
  INNER; the irradiance wrapper calls the `RE_Direct` macro, so it must be
  OUTER. `buildPlanetDirectLightPatch({ regolith })` emits the whole ordered
  chain as ONE replacement rather than two independent `String.replace` calls
  that could land in either order. `regolithPhotometryPatch.ts` is unchanged
  and its test is untouched and still green.
- **Ambient/indirect is NOT scaled.** Only `RE_Direct` is wrapped;
  `RE_IndirectDiffuse` is left alone, so the Onda 1.3 `AMBIENT_VIEWING_FLOOR`
  stays a display guarantee. Pinned by a test that forbids the string
  `RE_IndirectDiffuse` in the patch.
- **Material families reached.** All five branches of `usePlanetMaterials`'s
  `planetMaterial` now route through one hoisted `patchDirectLights` closure:
  Earth day/night, the eclipse branch (Moon), the ring branch (Saturn), and
  the airless-regolith path — plus a **new final `else`**. That fallthrough is
  the substantive addition: Mars, Venus, the giants, Titan and the sphere-path
  TNOs previously had no `onBeforeCompile` at all, so without it the
  irradiance law would have reached only the subset of bodies that happened to
  already be patched, and the day the default flips those would have stayed
  lit for 1 AU while their neighbours dimmed. The regolith decision also moved
  inside that closure (it reads `body.airlessRegolith` directly), so a future
  airless body that also carries a `ringSystem` keeps its ring shadow AND gets
  the photometry — a combination the old branch order had to choose between.
- **Per-frame write, no material recreation.** `Planet.tsx`'s existing
  `useFrame` writes `u_solarIrradiance` via `material.userData.shader.uniforms`,
  with a `(1 s bucket, policy)` cache copying `useVisualPresetLerp.ts`'s
  documented pattern. Nothing was added to any `useMemo` dep list — handoff §2
  "Pipeline / tone mapping" records that `sunEmissive`/`nightLightIntensity`/
  `surfaceFillLight` ARE deps and that scaling them per frame recreates the
  material; per-frame LIGHT/uniform values are the safe half. The uniform
  lookup runs before the resolver, so the Sun (a `MeshBasicMaterial` with no
  shader, and the one body at `d = 0`) never reaches it.

### The no-op contract

`"compensated"` gain is `1 / E`, so `fused = 1.0` for every body and the
shader multiply is an IEEE-754 identity. `solarIrradiance.test.ts` pins both
`toBeCloseTo(1, 12)` and `Math.fround(fused) === 1` — the second is what
actually reaches a float32 uniform, and it is what backs the "bit-identical
frame" claim. A companion test asserts the same bodies are NOT 1.0 under
`"real"`, so a resolver that returned 1.0 unconditionally (inert plumbing)
fails.

**Runtime proof the uniform is live** (not just string-shaped): the same
converged-frame harness `boot.spec.ts` uses (frozen sim → intro-end gate →
`waitForStableFrame`) was run twice against production builds differing only
in the default policy. Focused Mercury's frame mean luminance went
13.49 → 19.40 (+44 %) and focused Neptune's 7.58 → 7.50 when the default was
temporarily flipped to `"real"` — correct direction for both, with Neptune's
small magnitude explained by its disc occupying few pixels of the frame. A
smoke run also focused one body per patched family (Earth, Mercury, Moon,
Saturn, Mars) and recorded **zero console errors**, which is the real
GLSL-compile gate: `THREE.WebGLProgram` reports shader errors as
`console.error`, and the boot pixel baseline could not have caught a failed
program because its frame contains no resolvable planet disc. Both harnesses
were temporary and are not committed.

### Exclusions found (handoff §5.5 — verified against HEAD, still true)

`PlanetModel.tsx` builds its own materials in both loader paths — `GLBModel`
mutates the cloned GLTF materials' `roughness`/`metalness` only, `OBJModel`
constructs a fresh `MeshStandardMaterial` per mesh — and **neither sets
`onBeforeCompile`**. The four bodies that render through it (`haumea`,
`vesta`, `pallas`, `hygiea`, i.e. every catalog record with a `model` field)
therefore do NOT receive `u_solarIrradiance`.

Consequence for the next agent, stated plainly: **the moment the default flips
to `"real"`, those four become brightness outliers.** All four are in the
30–45 AU belt/TNO range where real irradiance is ~1/1000 to ~1/2000, so they
would render at full 1 AU brightness beside neighbours that had collapsed to
near-black — the most visible possible form of the asymmetry. They are also
already excluded from the Lommel-Seeliger photometry for the same structural
reason (documented in `regolithPhotometryPatch.ts`'s header since Onda 1.2).
Fixing this needs an `onBeforeCompile` pass in `PlanetModel.tsx`'s two
material-construction sites; it was left out of this step deliberately —
it changes a render path the no-op contract cannot protect, so it belongs with
the flip, not before it.

### Single-multiplier audit

After this change exactly **one** place multiplies irradiance by distance for
a body surface: `u_solarIrradiance`. Verified:

- `SceneLighting.tsx`'s `<pointLight decay={0}>` is untouched — no distance
  falloff at all, still purely the direction/shadow source.
- `Sun Brightness ×` (`sunIntensityMul`) and the preset `sunIntensity` lerp
  compose as `preset.sunIntensity × (overrides.sunIntensityMul ?? 1)` in
  `resolveLerpRefTargets`, written to `sunLightRef.current.intensity`. Plain
  user/preset scalars **on the light**, no distance term — unchanged, and
  they now sit on the opposite side of the pipeline from the distance law.
- `SmartSunLight` remains inert (layer 1, camera never leaves layer 0).
- Two other inverse-square laws exist in the repo and are **different
  quantities**, not a second body-irradiance law: `Starfield.tsx` /
  `starfieldShaderMath.ts` compute stellar flux from parsec distance (Pogson),
  and `zodiacalLightLut.ts` scales the dust band by `R^-2.5` from the CAMERA's
  heliocentric distance. Neither touches a planet material.

### Deferred, recorded in `exposureRegistry.ts`

Emissive/non-direct-light families are out of scope here and will not follow a
body's irradiance when the default flips: Sun disc (`sunEmissive`,
`ProceduralSun3D`), Earth night lights (`uNightLightIntensity`), the
atmosphere shell (own `ShaderMaterial`, ignores scene lights), the cloud layer
(COLOR blend is not invariant to luminance scale — `src > 1` goes subtractive,
so it needs the blend decision revisited, not a uniform), ring emissive, and
the starfield. The deferral list lives in that file's JSDoc so the exposure
registry stays the single place that enumerates luminance sources outside the
light path.

### Verification

- `npx tsc -b` — clean.
- `npm run lint` — clean.
- `npm run test:run` — **2453 passed / 120 files**, of which 17 tests in 2
  files are new here: 13 in `src/lib/graphics/solarIrradiance.test.ts`
  (the law, the clamps, the fusion, the no-op contract) and 4 in
  `src/components/canvas/shaders/solarIrradiancePatch.test.ts` (chain order,
  live anchor, ambient untouched, single application). No test was deleted or
  weakened; `regolithPhotometry.test.ts` is untouched and green.
- `npm run docs:check` — clean.
- `npm run build` — clean.
- **E2E gate:** `npx playwright test e2e/boot.spec.ts` — **2 passed**, no
  re-bless. The frozen boot frame is unchanged, which is the expected outcome
  of the no-op contract rather than a weak signal: the same harness detected a
  +44 % luminance change on the focused-Mercury frame the moment the policy
  was flipped, so it is not blind to this uniform.
- **This wave's re-bless budget (§4.7 "at most 1× per wave"): still UNSPENT.**

---

## Items 4 (assist)/5/6 — blocked on owner decisions

Per handoff §5, open. **§5.1 and §5.6 are now resolved** — see "Owner
decisions — 2026-07-29" below, which supersedes both. §5.2, §5.3, §5.4,
§5.5, §5.7 remain open and not this session's call:

- ~~§5.1 Didactic scale vs irradiance story~~ — **resolved**, see below.
- **§5.2 Screenshot/export disclosure** — the pill doesn't travel with an
  exported image.
- **§5.3 Radiometric anchor** — what 0 EV physically means; blocks a real
  "analytical auto-exposure" (Onda 2).
- **§5.4 Specular scope** — the GGX lobe still fires at grazing angles on
  regolith bodies; the regolith patch only corrects diffuse.
- **§5.5 PlanetModel-only bodies** (haumea, vesta, pallas, hygiea) — every
  per-material mechanism skips them; they become brightness outliers under
  real irradiance. **Re-verified against HEAD in Onda 2.1 — still true, and
  now quantified**: see "Exclusions found" in that section. Must be fixed in,
  or explicitly accepted by, the change that flips the assist default.
- ~~§5.6 Disclosure surface~~ — **resolved**, see below.
- **§5.7 Per-device adaptation** — a 10-second step-wedge test, never
  measured, only asserted (the "projector argument").

---

## Owner decisions — 2026-07-29

Recorded verbatim from the owner (relayed via the session coordinator, not
written into `handoffiluminacao.md` itself — that file stays read-only and
unedited). These supersede the handoff's open questions §5.1 (didactic
scale vs irradiance story) and §5.6 (disclosure surface: single expandable
badge vs second pill):

1. **Disclosure UI:** ONE unified fidelity badge grouping Scale and
   Brightness, expandable on click — no second permanent pill.
2. **Default scale mode changes to REAL distance ("realistic"), and body
   irradiance follows the REAL ephemeris distance in BOTH scale modes** —
   light always tells the true story; the content-assist gain (with
   disclosure) is what keeps things visible.
3. **Milky Way HDR panorama (#4, NASA SVS Deep Star Maps 2020) approved
   for implementation now**; formal licensing check stays with the owner.

**Scheduled next in the queue** (this order — each depends on state the
previous one leaves behind):

1. ~~Irradiance work first~~ — **DONE**, see "Onda 2.1 — per-body solar
   irradiance from ephemeris AU" above. Shipped as a visual no-op:
   `DEFAULT_SUNLIGHT_ASSIST_POLICY` is `"compensated"`, so `fused = 1.0`
   for every body and nothing on screen moved.
2. Default-mode change — flip `store.ts`'s `scaleMode` default from
   `"didactic"` to `"realistic"`, now that irradiance no longer silently
   diverges from what the scale mode shows.
3. Unified badge + assist control — the single expandable fidelity badge
   (decision 1) replacing/absorbing `ScalePill`, plus the "assist" gain
   control from handoff §4 item 4 (now unblocked by decision 1 resolving
   §5.6). **This step owns the default flip**: the assist default stays
   `"compensated"` until then, and the badge agent changes
   `DEFAULT_SUNLIGHT_ASSIST_POLICY` to `"real"` **in the same change as the
   disclosure UI** — a content claim never ships ahead of the surface that
   discloses it. Only the default value moves; the plumbing (resolver,
   uniform, per-frame write, policy singleton) is already in place. That
   change must also decide what happens to the four `PlanetModel` bodies
   (see "Exclusions found") and to the deferred emissive families listed in
   `exposureRegistry.ts`.
4. Milky Way HDR panorama — NASA SVS Deep Star Maps 2020 (decision 3),
   licensing check owner-side before shipping.

---

## Queue step 2 attempted 2026-07-29 — default-mode flip reverted, boot camera framing is the blocker

**Attempted:** flipped `src/store.ts`'s `scaleMode` initial state from
`"didactic"` to `"realistic"` (confirmed first that `scaleMode` is absent
from the persist `partialize` allowlist, so this really is the sole boot
default — no migration path needed either way). Ran the full gate
(`test:run` 2454/2454, `tsc -b`, `lint`, `docs:check`, `build` all clean)
then `npx playwright test e2e/boot.spec.ts`.

**Found broken — reverted before commit.** The frozen boot frame is not a
"whole system, different scale" shot the way the ambient-floor change in
Item 3 was — it's a camera-framing failure. `InitialCameraAnimation`
(`src/components/canvas/InitialCameraAnimation.tsx:91-133`,
`resolveIntroEndPosition`) already reads `scaleMode` and asks
`AstroPhysics.resolveFocusExtent` for how far back to park the camera once
the 12 s intro flight ends. That function
(`src/lib/astrophysics.ts:1151-1197`) has a didactic-only special case: for
the Sun, it walks every direct-child planet/near-dwarf and expands the
extent to cover the whole system
(`src/lib/astrophysics.ts:1167-1194`); for any other `scaleMode`
(line 1163: `if (scaleMode !== "didactic") { return extent; }`) it just
returns the Sun's own `resolveSemanticBodyRadius` — ~4.65 world units
(`696,000 km × KM_TO_3D_UNITS`, `AU_TO_3D_UNITS = 1000`). That "system
overview" affordance was only ever built for the didactic path, because
until this attempt didactic was the only mode ever reachable at boot.

Net effect: the intro flight lands the camera a few units from the Sun's
photosphere instead of an establishing shot. The captured
`boot-frozen.png` under `"realistic"` is the Sun's surface texture filling
~85 % of the viewport — starfield and grid lines visible at the edges, no
planets, no orbit rings, no labels, nothing recognizable as "solar
system." 171,705 / ~900k pixels differ from the current baseline (19 %,
vs. the 1 % gate). This is not a benign "scene got bigger" diff; it is the
"broken or empty" boot outcome the task brief for this session explicitly
named as a stop-and-revert condition, not a hack-a-fix-in-this-commit one.

**Reverted, not shipped.** `src/store.ts` and `src/store.test.ts` are back
to their pre-session content (`git diff` against HEAD is empty for both).
`npx playwright test e2e/` (all 12 specs) reruns green against a freshly
rebuilt `dist/` on the reverted code — the branch is exactly as shippable
as it was at the start of this attempt. No re-bless was spent (Item 7's
budget is still unspent).

**What actually blocks queue step 2, precisely:** a "solar-system overview"
extent for the realistic scale mode does not exist yet, and building one is
a real design problem, not a one-line port of the didactic branch — a
naive "include every planet's true AU distance" extent would push the
camera so far back that every planet (and the Sun) collapses to a sub-pixel
dot, which is astronomically correct but ships nothing "populated." The
next agent attempting the default-mode flip needs to design (and choose
where to route through `resolveFocusExtent`, `InitialCameraAnimation`, or a
new boot-specific framing) what a realistic-mode boot establishing shot
actually shows — before touching `store.ts`'s default again. That decision
was explicitly out of scope for this session (no camera/framing changes
were made).

**Anchor:** `boot-frozen-chromium-win32.png`
(`e2e/boot.spec.ts-snapshots/`), 1% tolerance, no resolvable planet disc in
frame (wide establishing shot). Handoff §2 confirms this is the only pixel
baseline in the repo and that shading changes on moons/planets cannot break
it — only a second visible pill (the existing `ScalePill` already occupies
~0.92% of the frame) or a global brightness shift large enough to move
average luminance across the whole wide shot would.

**This wave's own re-bless budget (§4.7 "at most 1× per wave"):
UNSPENT.** See "E2E gate" below for the actual run result — the ambient
floor did not move the frame at all, so no re-bless was needed. If it had
been needed, this wave file is where that spend would be recorded (not
`ca0eea6`, which belongs to the starfield-visual-upgrade wave's own
e2e-hygiene commit — see that wave's "Worktree hygiene" section).

---

## Verification

- `npx tsc -b` — clean.
- `npm run test:run` — 2435 tests green (0 removed net; identity-test
  assertions were edited in place, not deleted-and-not-replaced; 2 new
  asserts added for the floor's zero-case and the "surviving fields only"
  coverage).
- `npm run lint` — clean.
- `npm run docs:check` — clean.
- **E2E gate:** `npm run build && npx playwright test e2e/boot.spec.ts` —
  PASSED, no re-bless. Per the standing order, the actual vs. expected PNGs
  under `test-results/` were inspected before trusting the green result:
  the boot frame is unchanged pixel-for-pixel because the frozen boot pose
  (per `boot.spec.ts`'s own θ.2 comment) frames near-black deep space far
  from the Sun — a body-relative dark-side floor of 0.02 has nothing to
  brighten in that frame. This is the expected, honest outcome per Item 7's
  "sem realce == hoje" anchor rule, not a false pass.

---

## Handoff for the next agent

1. Read this file, then `handoffiluminacao.md` (still read-only), then
   `AGENTS.md`.
2. **Item 2 (regolith per-light `RE_Direct` wrapper) is done** — see its
   section above. Onda 2 is now unblocked on the sequencing dependency the
   handoff named.
3. §5.2, §5.3, §5.4, §5.5, §5.7 still need an **owner decision** first (see
   "blocked on owner decisions" above) — do not guess a resolution and ship
   UI against it. §5.1 and §5.6 are resolved — see "Owner decisions —
   2026-07-29" and follow its queue order (irradiance → default-mode flip →
   unified badge + assist control → Milky Way HDR panorama).
4. Onda 2's **irradiance** step is done (see its section above); the assist
   default deliberately still reads `"compensated"`, so the feature is live
   but neutral. What remains of Onda 2: analytical auto-exposure (still
   blocked on §5.3's radiometric anchor — the 1 AU anchor shipped here is
   explicitly provisional and is NOT that decision), the exposure-registry
   sweep, and planetshine. Per the owner-decisions queue, the next step is
   the `scaleMode` default flip, then the unified badge + assist control —
   which is the step that flips `DEFAULT_SUNLIGHT_ASSIST_POLICY` to
   `"real"`, together with its disclosure UI.
5. **The `scaleMode` default flip (queue step 2) was attempted 2026-07-29
   and reverted** — see "Queue step 2 attempted 2026-07-29" above. The
   store-default edit itself is trivial and not the blocker; the boot
   camera has no "solar-system overview" framing for `"realistic"` mode
   (`AstroPhysics.resolveFocusExtent`'s system-wide-extent branch is
   didactic-only), so the flip currently boots into a close-up on the
   Sun's photosphere. Design that framing (and decide what it should even
   show at true AU scale) before re-attempting the flip.
