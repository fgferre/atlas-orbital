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

> **RESOLVED in Onda 2.2** — both loader paths now install the chain and the
> four bodies joined the policy (runtime-verified: zero console errors on
> focus, focused-Vesta luminance ×1.40 across a policy switch). See "The four
> `PlanetModel` bodies" below. One factual correction to the §2 audit while
> we were in there: none of the four actually carries `airlessRegolith`, so
> they receive the irradiance wrapper alone, not Lommel-Seeliger.

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
- ~~**§5.5 PlanetModel-only bodies**~~ (haumea, vesta, pallas, hygiea) —
  **RESOLVED in Onda 2.2**: both `PlanetModel` loader paths now install the
  direct-light chain, so they follow the assist policy like every other
  body. No exclusion, no fallback. See "The four `PlanetModel` bodies".
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
3. ~~Unified badge + assist control~~ — **DONE**, see "Onda 2.2" below.
   Shipped with default `"assisted"` (a third position), not `"real"`.
4. Milky Way HDR panorama — NASA SVS Deep Star Maps 2020 (decision 3),
   licensing check owner-side before shipping.

---

## Onda 2.2 — unified fidelity badge + assist control, default flipped (done)

Queue step 3. **This is the step where the lighting behaviour became
visible**, and per the plan it shipped in ONE change with the surface that
discloses it.

### The third position, and why the default is not `"real"`

`SunlightAssistPolicy` is now `"real" | "assisted" | "compensated"`, default
**`"assisted"`**: `fused = E^σ`, `σ = SUNLIGHT_ASSIST_EXPONENT = 0.35`.

The queue entry above anticipated flipping the default straight to `"real"`.
That would have satisfied the letter of "light tells the true story" and
broken the product: at real irradiance the entire display range is spent on
bodies inside ~2 AU and everything from Jupiter out renders at or below the
0.02 ambient viewing floor — i.e. the outer system stops being _lit_ and
starts being _ambient-washed_, which is a worse lie than compression because
it also destroys the shape of the terminator. `"assisted"` is the owner's
own §1.3 decision (assisted-by-default, disclosed) applied to this axis.

| body    | real E | `E^0.35` |
| ------- | ------ | -------- |
| Mercury | 10.4×  | 2.27×    |
| Earth   | 1.0×   | 1.0×     |
| Neptune | 1/900  | 1/10.8   |

- **~9400:1 → ~25:1.** A range no display can show becomes one it can.
- **σ is a discretionary display tunable and says so** in its JSDoc and in
  the Credits entry. It is the one number in `solarIrradiance.ts` with no
  physical derivation. Nothing downstream depends on its exact value.
- **The honesty property is monotonicity.** `x ↦ x^0.35` is strictly
  increasing, so every body keeps its true brightness ORDERING and the true
  SIGN of change along its orbit. `"compensated"` destroys both; `"real"`
  keeps both and renders the outer system black. Pinned by a test that walks
  9 distances and asserts strict ordering.
- **1.0 is the fixed point of all three positions** (`1^σ = 1`), so Earth —
  the one body tuned against reference imagery — is unmoved by the choice.

### Tone-mapping cap (handoff §6 checklist item 4)

`"assisted"` puts Mercury at ~2.27 and `"real"` at ~10.4, both > 1. Without a
mounted operator there is no shoulder: values above 1.0 hard-clip AND cross
`Bloom`'s `luminanceThreshold = 1.0` contract into a halo. So the fused
scalar is capped at `SUNLIGHT_UNMAPPED_CEILING = 1` whenever no tone-mapping
pass is mounted — the `constrained` tier (no `EffectComposer` at all) and any
tier where the user selects Tone Mapping "None".

- **Written where the decision is made.** `PostProcessingPipeline.tsx` is the
  component that decides whether a `ToneMapping` pass mounts, so it sets
  `sunlightToneMappingMounted` in a `useEffect` keyed on that same
  `toneMappingMode !== undefined` expression, with cleanup → `false`. The
  cleanup is what covers `constrained`, where Scene.tsx unmounts the whole
  component; the flag's initial `false` covers "never mounted at all".
  Recomputing the condition at the consumer would have been a second copy of
  it, free to drift.
- **Uniform across positions, including `"real"`.** It is a
  display-clipping guard, not a photometric statement: above 1.0 nothing is
  representable on that path anyway, so the cap removes the bloom artefact
  without discarding anything the viewer could have seen. Documented as such.
- Cached per `(1 s bucket, policy, toneMapped)` so flipping either switch
  lands on the next frame.

### The four `PlanetModel` bodies — they JOINED (not excluded, no fallback)

The "Exclusions found" section above (Onda 2.1) called this out as the thing
that had to be decided here. Resolved by fixing it: both loader paths now
install the chain.

- `GLBModel` patches inside `cloneGlbSceneForRuntime`'s per-material visitor
  (materials are already cloned there, so the loader cache is untouched);
  `OBJModel` patches each `MeshStandardMaterial` it constructs.
- Materials are **collected at construction**, not by traversing the scene
  graph per frame, and the per-frame write reads
  `material.userData.shader?.uniforms[…]` — the same idiom `Planet.tsx` uses,
  which naturally skips a material that has not compiled yet.
- The 1 s-bucket cache was extracted to
  `src/components/canvas/planet/useBodySunlightScalar.ts` and is now shared
  by both render paths instead of duplicated.
- `regolith` is read from `body.airlessRegolith` exactly as the sphere path
  reads it. **Correction to the handoff's §2 claim:** none of these four
  actually carries that flag today (the seven that do — mercury, moon,
  ganymede, callisto, io, europa, enceladus — all render through the sphere
  path). So in practice they receive the irradiance wrapper alone and
  Lommel-Seeliger stays off for them. Wiring it through the flag rather than
  hard-coding `false` means flagging Vesta airless later needs no second edit.

**Runtime-verified, not just typed.** A throwaway Playwright harness (not
committed) focused all four in turn against a production build: **zero
console errors**, which is the real GLSL-compile gate — `THREE.WebGLProgram`
reports shader errors as `console.error`, and no committed spec frames these
bodies. Then, driving the badge exactly as a user would (expand → click
Brightness), focused-Vesta frame mean luminance went **5.91 (assisted) →
8.25 (equalized), ×1.40** — correct direction, and the right order of
magnitude for a 2.36 AU body whose surface ratio is 1/0.548 ≈ 1.82 diluted
across a frame that is mostly black sky.

### The badge — `ScalePill` → `FidelityBadge`

One surface, two lines, per owner decision 1. `src/components/ui/ScalePill.tsx`
and its test are deleted; `FidelityBadge.tsx` + `FidelityBadge.test.tsx`
replace them, `Overlay.tsx` mounts it in the same slot, and the i18n
`scalePill.*` block became `fidelityBadge.*` in both locales.

- **Collapsed (default)** — one line naming BOTH axes by visible
  consequence: `NOT TO SCALE · ASSISTED`. Aggregate dot is amber if ANY line
  deviates, emerald only when all are faithful. Both defaults deviate today,
  which is the point.
- **Expanded (click)** — one row per axis: axis name, current position, an
  honest one-sentence description, and the row itself is the control
  (scale toggles; brightness cycles real → assisted → equalized). The
  explanation and the switch are never one click apart.
- **a11y** — the header carries `aria-expanded` + `aria-controls`; the
  focus-visible ring and keyboard reachability match the old pill (the pill
  had 2 focusable buttons, the badge has 1 collapsed / 3 expanded).
  `e2e/a11y.spec.ts` never referenced the pill and is untouched and green.
- **`data-testid` migrated** `scale-pill` → `fidelity-badge`, with its tests
  updated in the same commit (AGENTS §6). No e2e spec referenced the old id
  — verified by grep across `e2e/` before renaming.
- Names never use "Scientific" — `decay = 0` still exists (§6 item 3).

### Naming positions in the DisplayPanel

New `Sunlight` Select in the "Atmosphere & Sun" section: **True / Assisted /
Equalized**, following the existing `Select` idiom, with a reset arrow back
to the default. `Select` gained an optional always-visible `hint` (mirroring
`Slider`'s) because the option labels alone cannot carry the disclosure.
Both this Select and the badge read the SAME policy singleton through
`useSyncExternalStore` — no mirrored copy in the zustand store, so the two
surfaces cannot disagree and `solarIrradiance.ts` stays store-free and
unit-testable as a pure lib.

### Emissive families (the other thing this step had to decide)

Decided and written into `exposureRegistry.ts`'s JSDoc: all six stay
body-independent, with per-family reasoning rather than "deferred". Sun disc
is the source; night lights are not sunlight; starfield is not lit by our
Sun. Atmosphere + clouds DO need to follow and structurally cannot yet —
bounded today because σ keeps Earth (their only carrier) at exactly 1.0.
Ring emissive detaches by a constant factor (Saturn only), recorded.

### Defects fixed here, found by external review

1. **Program-cache collision (critical, introduced by 2a20d28).**
   `THREE.Material.customProgramCacheKey()` defaults to
   `this.onBeforeCompile.toString()` — the callback's SOURCE TEXT (verified
   in `three@0.181.2`, `three.core.js:16877`). Onda 2.1 routed every planet
   branch through one hoisted `patchDirectLights` closure, so the regolith
   flag lives in a captured variable and never appears in that text: two
   materials agreeing on every other program parameter hashed identically
   and three served the second one the first one's compiled program. Either
   the airless bodies silently lost Lommel-Seeliger or venus/mars/giants/
   titan/TNOs silently gained it, decided by render order, reported by
   nothing. Fixed with `applyPlanetDirectLightCacheKey`, composed as
   `default ⊕ variant` — **never the bare variant**, since the per-branch
   callbacks (Earth day/night, ring shadow) rely on their own source text to
   stay distinct from each other, and replacing the key outright would have
   collapsed THOSE together, a worse bug. Applied once per material in
   `usePlanetMaterials` (reads `onBeforeCompile` lazily, so it is correct
   regardless of which branch assigns it) and in `PlanetModel`. Pinned by
   one test that starts from two materials sharing a callback and asserts
   the keys diverge while still containing the default.
2. **CreditsModal PSF number.** Claimed a "0.95-pixel" Gaussian PSF;
   `STAR_PSF_SIGMA_PX = 0.62` (`starfieldShaderMath.ts:398`). A factual
   error inside the honesty panel — corrected to 0.62.
3. **Bloom Intensity slider read 0 while bloom was running.**
   `effective.bloomIntensity` is the absolute override alone, `undefined`
   until dragged, and the panel rendered `?? 0` — so the control said "off"
   while `resolveLerpRefTargets` was applying `preset.bloomIntensity ×
bloomIntensityMultiplier` (0.15–0.35), and the first drag UP to 0.05 made
   the scene DARKER. Fallback is now the actually-applied
   `VISUAL_PRESETS[visualPreset].bloomIntensity × effective.bloomIntensityMul`,
   read from the same two inputs the renderer uses. No redesign of the
   override system.

### Verification

- `npx tsc -b` — clean.
- `npm run lint` — clean (one scoped `react-hooks/immutability` disable on
  the model-path uniform write, mirroring the one `Planet.tsx` already
  carries for the identical write).
- `npm run test:run` — **2464 passed / 120 files** (from 2453). Net +11: 8
  new in `solarIrradiance.test.ts` (assisted curve, monotonicity, the cap,
  `"real"` ≡ E exactly), 1 in `solarIrradiancePatch.test.ts` (cache-key
  divergence), 5 in `FidelityBadge.test.tsx`, minus the 3 deleted
  `ScalePill.test.tsx` tests.
- `npm run docs:check` — clean. `npm run build` — clean.
- **E2E:** `npx playwright test e2e/` — **12/12 passed.** One earlier run had
  `hyg-focus.spec.ts` fail on its "intermediate frame" sampler under 7-worker
  contention; it passes alone and passed in a clean full re-run — a
  load-timing flake, not a regression.
- **The boot pixel baseline did NOT need re-blessing.** The frozen frame is a
  wide establishing shot, so the assisted default has no resolvable disc to
  change, and the badge's redesign stayed inside the 1 % gate. **This wave's
  re-bless budget is still UNSPENT.**
- **Blind spot closed.** The pixel gate provably could NOT catch the badge
  disappearing: the badge's own footprint is ~0.92 % of the frame, under the
  1 % tolerance, so the app could have started making undisclosed claims with
  the gate green. `boot.spec.ts`'s first test now asserts the badge is
  visible and names both axes. Verified it fails-for-the-right-reason by
  construction and passes on HEAD.

### Open / handed on

- **Handoff §5.2 (screenshot/export disclosure) is now more pressing**, not
  less: there are two amber axes to not travel with an exported image.
- σ = 0.35 has never been evaluated on a real display by a human. It is the
  natural companion to §5.7's unmeasured step-wedge argument.
- Queue step 2 (`scaleMode` default → `"realistic"`) remains blocked on boot
  camera framing — see the section below, unchanged by this work.

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

## Queue step 2 shipped 2026-07-29 (second attempt) — realistic-mode system overview

**Owner decision recorded fresh today** (relayed via the session
coordinator): the app boots in `"realistic"` scale mode, AND the opening
view is a system overview — camera far enough to show the planetary orbits
with orbit lines and labels, planets appearing as the point-lights they
really are from that distance (NASA-Eyes style). This resolves the exact
blocker the attempt above stopped on: what a realistic-mode boot
establishing shot should show. It shows the outer-system-collapses-to-dots
outcome the previous attempt's author flagged as a risk — the owner
confirmed that IS the desired look, not a defect.

**The fix.** `AstroPhysics.resolveFocusExtent` (`src/lib/astrophysics.ts`)
had a didactic-only system-extent walk for a Sun focus (guard at the top:
`if (scaleMode !== "didactic") return extent`). Extended, NOT rewritten:
the walk now also runs when `scaleMode === "realistic" && body.id ===
"sun"` — every other body's realistic-mode focus extent is byte-for-byte
unchanged (own radius/ring only), because widening the walk to every
parent would have also re-framed e.g. "focus Jupiter" in realistic mode to
include Callisto's true ~1.9M km orbit, a real, unrequested behavior
change to an already-shipped mode. Inside the walk, the one literal that
changed is the child-distance lookup: `resolveDisplayOrbitDistanceBounds`
is now called with the ACTUAL `scaleMode` variable instead of a hardcoded
`"didactic"` string — a no-op for the didactic path (scaleMode already
equals `"didactic"` there) and the whole fix for the realistic path (now
reads real max-orbit-distance-in-AU instead of the didactic-compressed
figure). The inclusion filter itself — direct children of the Sun that are
a planet, or a dwarf with `orbit.a <= 40` AU — was not touched; it already
scale-mode-agnostic and is the SAME set `useOrbitalSalience.ts`'s
`isSolarOverviewBody` uses for orbit-line emphasis in the unfocused
overview state, which is independent confirmation this is the
established "system overview" body set, not a new invention.

**Extent numbers (`TEST_DATE` = J2000, orbital-envelope based so they are
date-independent — same design as the didactic branch).** Direct children
walked: the 8 planets + Pluto + Ceres (Haumea 43.2 AU, Makemake 45.7 AU,
Eris 67.8 AU all fail the `<= 40` AU cutoff, same as the didactic branch).
Aphelion reach in world units (`AU_TO_3D_UNITS = 1000`):

| body      | aphelion AU | world units |
| --------- | ----------- | ----------- |
| Mercury   | 0.467       | 467         |
| Venus     | 0.728       | 728         |
| Earth     | 1.017       | 1 017       |
| Mars      | 1.666       | 1 666       |
| Jupiter   | 5.457       | 5 457       |
| Saturn    | 10.076      | 10 076      |
| Uranus    | 20.079      | 20 079      |
| Neptune   | 30.381      | 30 381      |
| Ceres     | 2.978       | 2 978       |
| **Pluto** | **49.271**  | **~49 271** |

**Pluto wins**, not Neptune — despite the smaller semi-major axis, Pluto's
e = 0.248 (vs Neptune's 0.009) pushes its aphelion past Neptune's. The
walk correctly picks up on this because it measures REACH (aphelion +
body radius), not semi-major axis. `resolveFocusExtent(sun, "realistic")`
≈ 49 271 world units. Fed through
`PrivilegedPosition.calculateViewportAwareDistance` (45° FOV, 1.15 margin,
no viewport composition offset at boot) that lands the camera at
**≈ 148 000 world units (≈ 148 AU) from the Sun** — inside `camera.far =
1e15` (`Scene.tsx`) and `OrbitControls.maxDistance = 1e12` (`Scene.tsx`)
with enormous headroom, so no frustum/far-plane change was needed; the
task's "verify the renderer copes" concern was already satisfied by
existing config, not something this fix had to add.

**Intro flight sanity (task item 5).** `INTRO_START_POSITION`
(`InitialCameraAnimation.tsx`) is a fixed constant (~1e12 wu, representing
the pre-existing deep-space "Milky Way view" start) that does **not**
derive from `resolveFocusExtent` — confirmed by reading the component, not
inferred — so it needed no adjustment. Only the END position changed
(via `resolveIntroEndPosition` → `resolveFocusExtent`), and
`interpolatePosition`'s log-lerp of distance + normalized-direction lerp
is well-defined for any positive end distance, so a bigger end distance
does not risk a degenerate (NaN / inside-the-Sun) path. Verified live, not
just by inspection: an unfrozen (real 12 s) boot was screenshotted through
the full intro (loader → t+30 s) against a `npm run dev` build — zero
console/page errors the whole way, and the settled frame is
pixel-equivalent to the frozen-sim boot frame below.

**Boot-frame verdict — inspected, healthy.** `npx playwright test
e2e/boot.spec.ts` diffed the new frame at 2 % against the OLD (didactic)
baseline (`9841 / ~491k` pixels — every earlier session's 1 % gate was
correctly tripped, this is the "legitimately changed" case the task brief
anticipated, not the "broken" one from the first attempt). The actual PNG
under `test-results/` was inspected before re-blessing: a populated,
recognizable solar system — orbit ellipses for Uranus, Saturn, Neptune,
Pluto and the outer dwarfs/TNOs (Makemake, Haumea, Gonggong, Varda,
Salacia, Weywot, Sedna, Eris) all visible with labels, a "10 AU" grid
ring, a dense populated starfield, and the `FidelityBadge` reading **`TRUE
SCALE · ASSISTED`** in amber (Scale line alone is emerald/faithful now;
Brightness still deviates by design default). Nothing resembles the first
attempt's photosphere-filling failure — this is the requested NASA-Eyes
overview. Re-blessed with `--update-snapshots`; the new
`boot-frozen-chromium-win32.png` was read back and visually confirmed
identical to the inspected actual frame.

**Store default.** `src/store.ts`'s `scaleMode` initial-state literal
flipped `"didactic"` → `"realistic"` (still absent from the persist
`partialize` allowlist — confirmed again — so this is still the sole boot
default, no migration path). Pinned in `src/store.test.ts` (new test:
default is `"realistic"`, `toggleScaleMode` round-trips through
`"didactic"` and back).

**FidelityBadge — no code change needed.** It already read `scaleMode`
generically (`isDidactic = scaleMode === "didactic"`); flipping the store
default makes it boot on the `realisticTitle` i18n string (`"TRUE SCALE"`)
with no edit to `FidelityBadge.tsx`. `FidelityBadge.test.tsx` force-sets
`scaleMode: "didactic"` in its own `beforeEach`, so it was unaffected by
the store default flip and needed no changes.
`e2e/boot.spec.ts`'s console-error test asserts the badge text; updated
its expected string from `"NOT TO SCALE"` to `"TRUE SCALE"` (the
`"ASSISTED"` assertion is unchanged — the brightness default did not
move).

**New test:** `src/lib/astrophysics.test.ts` gained a realistic-mode
counterpart to the existing didactic Sun-focus-extent test (Pluto in,
Eris out, Neptune's reach covered, a sanity bound on the overall
magnitude) — a product-contract test per AGENTS §6 (boot resilience that
blocks seeing the scene).

**Verification.**

- `npm run test:run` — 2466 passed / 120 files (2464 → 2466, net +2: one
  in `astrophysics.test.ts`, one in `store.test.ts`).
- `npx tsc -b` — clean. `npm run lint` — clean. `npm run docs:check` —
  clean. `npm run build` — clean.
- `npx playwright test e2e/` — **12/12 passed**, including a clean
  `hyg-focus.spec.ts` run (no repeat of the earlier session's
  worker-contention flake).
- **This wave's re-bless budget (§4.7 "at most 1× per wave") is now
  SPENT** — `boot-frozen-chromium-win32.png` re-blessed from an inspected,
  populated system-overview frame (see "Boot-frame verdict" above).

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

## Onda 2.3 — planetshine / earthshine second-source uniforms (done)

Queue item from "Handoff for the next agent" #4 ("What remains of Onda 2:
… and planetshine"). Io + Europa Jupiter-shine, Moon earthshine — a SECOND
incident-light magnitude for exactly these 3 bodies, with **zero new
three.js scene lights** (handoff §6 checklist item 2): a real light would
change `NUM_POINT_LIGHTS` for every patched material family and force a
recompile — a hitch of hundreds of ms across the whole catalogue.

### The published R table (handoff §6 checklist item 7)

| body   | R                                  | source                                                             |
| ------ | ---------------------------------- | ------------------------------------------------------------------ |
| Io     | 9.0 × 10⁻³                         | Mergny & Schmidt 2024                                              |
| Europa | 3.6 × 10⁻³                         | Mergny & Schmidt 2024                                              |
| Moon   | up to ≈1.01 × 10⁻⁴, × (1 − phase)² | derived (see below); phase-shape precedent Stellarium `Planet.cpp` |

`R` is "shine irradiance as a fraction of the recipient's own local solar
irradiance". Io receives ~2.5× Europa's Jupiter-shine (9.0 / 3.6 = 2.5
exactly, pinned by test) — shipping Europa alone would have cherry-picked
the smaller number and silently dropped the brighter one from the same
paper.

**Excluded, with reasons** (`PLANETSHINE_EXCLUDED` in
`src/lib/graphics/planetshine.ts` — inspectable in code, not just prose):

| body     | R          | reason                                                                                                                                                                                                                  |
| -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ganymede | 2.2 × 10⁻³ | below `PLANETSHINE_FLOOR = 3.0 × 10⁻³` — real per Mergny & Schmidt, just under the line this wave draws for "worth the extra uniform + shader branch"                                                                   |
| Callisto | not cited  | no R figure carried into this wave                                                                                                                                                                                      |
| Charon   | not cited  | Lauer et al. 2021 (PSJ 2, 214) measured Pluto–Charon mutual shine directly — a different body pair outside today's Sun-Jupiter-moon / Sun-Earth-Moon recipient set; cited as the excluded-tier example, not implemented |

**Earthshine's peak, derived rather than asserted.** Glenar et al. (2019)
characterise earthshine's spectrum, not a single "R vs local solar
irradiance" ratio, so `EARTHSHINE_R_FULL` is derived from the same
point-reflector approximation the R table implicitly rests on:
`R_full = A × (r/d)²`, with Earth's V-band geometric albedo `A ≈ 0.367`
(geometric, not Bond — this is a single reflectance snapshot, not an
all-phase energy budget), `r = 6371 km`, `d = 384400 km` (the same
Earth–Moon distance `celestialBodies.ts`'s Moon record quotes):

```
(r/d)² = (6371 / 384400)² ≈ 2.746 × 10⁻⁴
R_full = 0.367 × 2.746 × 10⁻⁴ ≈ 1.008 × 10⁻⁴
```

Within 1% of the plan's "≈1.0 × 10⁻⁴" anchor — and it is a live
computation in `planetshine.ts`, not a rounded literal, so the arithmetic
is auditable at the source. The phase SHAPE, `(1 − phase)²`, is borrowed
from Stellarium's `Planet.cpp` earthshine ambient term (`phase` = the
Moon's own illuminated fraction, 1 = full, 0 = new — the two phases are
geometric complements, so Earth is fully lit as seen from the Moon exactly
at new Moon). Stellarium's own `0.15` peak is NOT reused — it is an opaque
ambient-relative constant in Stellarium's own units, not comparable to this
file's "fraction of local solar irradiance" convention; the grounded
`R_full` above replaces it. `phase` itself comes from
`AstroPhysics.resolveSkyGeometry`, the SAME function `Sidebar.tsx` already
uses for the Moon's own phase display.

### CPU side — `src/lib/graphics/planetshine.ts`

Pure resolver, same split as `solarIrradiance.ts`: `resolvePlanetshineRadianceScalar`
takes AU directly (`R × resolveFusedSunlightScalar({heliocentricDistanceAU:
parentAU, …})` — literally the SAME function the sun path uses, evaluated
at the shine SOURCE's distance instead of the recipient's own; since a
satellite's orbital radius is 10³–10⁵× smaller than its parent's
heliocentric distance, the two AU values agree to better than 1 part in
10⁵, so scaling by the parent's irradiance is both the physically direct
read — Jupiter/Earth reflect a fraction of the sunlight THEY receive — and
numerically indistinguishable from scaling by the recipient's own).
`resolvePlanetshineScalar(bodyId, parentId, date, policy, toneMapped)` is
the ephemeris-consuming app-facing entry point, mirroring
`resolveBodySunlightScalar`'s shape exactly. `usePlanetshineScalar.ts`
copies `useBodySunlightScalar.ts`'s 1 s-bucket cache idiom verbatim.

**Policy, not the "Sun Brightness ×" exposure knob.** "The SAME assist-gain
policy scalar the sun path uses" means `SunlightAssistPolicy` (real /
assisted / equalized) — literally the same function call — not the
separate, display-only `sunIntensityMul` slider (Onda 1's "DOIS controles"
split). Under the default preset the two are numerically the same thing
anyway; a user who cranks Sun Brightness will see the shine no longer track
that adjustment 1:1 — a documented, minor simplification, not a silent one.

### GLSL side — `src/components/canvas/shaders/planetshinePatch.ts`

**Where it lands, and how double-scaling is avoided.** The wrapper chain
`solarIrradiancePatch.ts` builds ends with the `RE_Direct` macro pointing
at `RE_Direct_SolarIrradiance`, which multiplies the ONE real light (the
Sun) by `u_solarIrradiance`. This patch does NOT call that macro for its
manual shine light — doing so would multiply the CPU's already-final
`u_shineRadiance` a SECOND time by the sun's own body-relative scalar.
Instead it calls `RE_Direct_Regolith` or `RE_Direct_Physical` **by name**
— whichever one the existing chain built for this material, both always
defined regardless — so the shine still gets the per-light Lommel-Seeliger
correction (or plain Lambert) using ITS OWN incidence geometry, the entire
reason the regolith patch was rewritten per-light (c145b01). The injection
anchor is therefore `#include <lights_fragment_begin>` (a SEPARATE anchor
from where `solarIrradiancePatch.ts` / `regolithPhotometryPatch.ts` land,
`lights_physical_pars_fragment`) — it has to run after `geometryPosition` /
`geometryNormal` / `geometryViewDir` / `reflectedLight` exist, which is
exactly what `lights_fragment_begin` declares.

Direction (`u_shineDir`) is a WORLD-space unit vector, converted to the
VIEW space `IncidentLight.direction` needs via the built-in `viewMatrix`
uniform three always provides (the same uniform the pre-c145b01 regolith
patch read for its old sun-at-origin shortcut). Radiance
(`u_shineRadiance`) is a neutral grey `vec3` — no spectral tint is cited in
this wave's sources, so none is invented.

**Cache-key handling (66ab30f discipline).** `applyPlanetshinePatch` only
ever runs on the 3 recipients (`usePlanetMaterials.ts`'s
`receivesPlanetshine` guard), so a recipient's generated GLSL already
differs from a non-recipient's. `solarIrradiancePatch.ts`'s
`resolveDirectLightVariant` gained an optional `shine` flag (default
`false`, so every pre-existing call site's key is byte-identical to
before), appended to the variant string as `-shine` — so three's
`customProgramCacheKey` (default: `onBeforeCompile` SOURCE TEXT, not
behaviour) cannot hash a recipient and a non-recipient of the same
regolith-ness to the same compiled program.

**Zero effect on the other ~30 bodies.** `usePlanetMaterials.ts`'s hoisted
`patchDirectLights` closure calls `applyPlanetshinePatch` only when
`isPlanetshineRecipient(body.id)` is true; every other body's
`onBeforeCompile` never references the shine module at all, so its
generated GLSL is byte-for-byte unchanged.

### CPU wiring — `Planet.tsx`

A new `usePlanetshineScalar(body.id, body.parentId)` hook call (safe to
call unconditionally — resolves to 0 for the ~40 non-recipient bodies) and
a 4th per-frame block alongside the existing `u_solarIrradiance` write:
magnitude from the cached resolver; direction from `scene.getObjectByName
(body.parentId)`'s ACTUAL rendered world position minus the recipient's
own (`groupRef.current.getWorldPosition`) — the SAME pattern the eclipse
block above it already uses to find its eclipsing body's position, not a
duplicate ephemeris-direction path. This is safe because
`mapPhysicalPositionToDisplay` (`astrophysics.ts`) preserves direction
under the didactic-mode remap (only the magnitude compresses), so the
rendered-scene direction and the ephemeris direction agree by construction.

### Tests

- `src/lib/graphics/planetshine.test.ts` (22 tests) — the pure-resolver
  pins the checklist named: Io/Europa ratio exactly 2.5, radiance scaling
  with parent AU by inverse square (quarters on doubling, `"real"`
  policy), earthshine → 0 at full Moon / maximal at new Moon, policy
  neutrality (`"real"` ⇒ `radiance === R × E` bit-for-bit, no
  `toBeCloseTo`), plus the R-table/floor/exclusion invariants and an
  ephemeris-consuming end-to-end check (`resolvePlanetshineScalar` against
  the real orbital engine for Io/Europa/Jupiter and Moon/Earth).
- `src/components/canvas/shaders/planetshinePatch.test.ts` (7 tests) — the
  patch-shape idiom `solarIrradiancePatch.test.ts` / `regolithPhotometry.
test.ts` already use: the shine chunk anchors on a chunk three actually
  ships, calls the named `RE_Direct_*` function and never the bare
  `RE_Direct` macro, converts direction via `viewMatrix`, registers
  neutral (zero) uniforms and rewrites the shader exactly once, is absent
  from an untouched material's shader entirely, gives a recipient a
  different program cache key than a non-recipient of the same
  regolith-ness, and composes cleanly with `applyPlanetDirectLightPatch`
  on the same shader object.

### Verification

- `npm run test:run` — **2532 passed / 124 files** (net +29 here: 22 in
  `planetshine.test.ts`, 7 in `planetshinePatch.test.ts`). No test deleted
  or weakened.
- `npx tsc -b` — clean.
- `npm run lint` — clean.
- `npm run docs:check` — clean.
- `npm run build` — clean.
- **E2E gate:** `npx playwright test e2e/boot.spec.ts` — **2 passed, zero
  pixel diff, no re-bless.** Expected: the frozen boot frame is a wide
  system-overview shot with no resolvable Io/Europa/Moon disc (per this
  wave's own "constrained tier + wide shot" anchor rule), and Onda 2.3
  touches only those 3 bodies' own materials — nothing else in the frame
  could move.

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
4. Onda 2's **irradiance** step, the **unified badge + assist control**,
   and **planetshine/earthshine** are all done (see their sections above).
   The default sunlight policy is `"assisted"` — a third, compressive
   position — and it ships disclosed by `FidelityBadge`. What remains of
   Onda 2: analytical auto-exposure (still blocked on §5.3's radiometric
   anchor — the 1 AU anchor is explicitly provisional and is NOT that
   decision). The exposure-registry sweep is decided per family in
   `exposureRegistry.ts`'s JSDoc; atmosphere + clouds are the two that
   still structurally cannot follow a body's irradiance.
5. **The `scaleMode` default flip (queue step 2) is DONE**, second
   attempt, 2026-07-29 — see "Queue step 2 shipped 2026-07-29" above. The
   first attempt (see "Queue step 2 attempted 2026-07-29" just above it,
   kept for the record) correctly found and reverted on a real blocker: no
   realistic-mode system-overview framing existed. That blocker is
   resolved by an owner decision (system overview, orbits + labels,
   planets as point-lights, NASA-Eyes style) plus a scoped extension of
   `AstroPhysics.resolveFocusExtent`'s Sun-focus walk to realistic mode.
   The app now boots in `"realistic"` scale mode on a populated,
   inspected, re-blessed system-overview frame. Nothing about this queue
   step remains open.

---

## 2026-07-29 (forced-ultra headless verification pass)

Coordinator-requested runtime pass, real pixels, headless Playwright
against a production build with `graphicsAutoMode=false` +
`graphicsPreset="ultra"` forced via `window.__ATLAS_TEST_STORE__`
immediately after boot (bypasses the SwiftShader→`constrained` tier
ceiling that blocked every prior session's attempt at this — see the
starfield-visual-upgrade wave file's "Outstanding calibration" section
for the full technique and its camera-aiming limits, which apply here
too). `qualityTier: ultra` confirmed via the boot diagnostic before
every check below. Throwaway scripts, not committed; screenshot paths
handed to the orchestrator.

### Assisted lighting (Onda 2.2 default, item 4) — PASS

Focused Mercury and Neptune in turn (`selectId`, curated-body flight,
distances cross-checked against the Sidebar's own telemetry: Mercury
0.461 AU vs UI's 0.463 AU, Neptune 29.88 AU vs UI's ~29.9 AU — same
cross-check used in the starfield wave file, confirms the flight
actually landed rather than stalling mid-lerp). Mean frame luminance
(simple average of `max(r,g,b)` over the full screenshot, 0-255 scale):
**Mercury 71.8, Neptune 12.9** — Mercury visibly brighter, the correct
ordering under the assisted `E^0.35` curve (Mercury real E ≈ 10.4× →
assisted ≈ 2.27×; Neptune real E ≈ 1/900 → assisted ≈ 1/10.8 — see the
"Onda 2.2" section's table above). Not a controlled single-variable
measurement (whole-frame luminance includes each planet's own disc
size, starfield background, and UI chrome, which differ between the
two shots) but the direction and rough magnitude both match the
documented curve.

### Eye-adaptation (1d, item 3) — INCONCLUSIVE, new information about why

The intended test ("frame the Sun prominently → wait → frame dark
starfield → wait → compare") could not be performed as specified.
**New finding this session**: `setFocusId("sun")` in the app's current
default (realistic scale mode) does not produce a close-up bright Sun —
`AstroPhysics.resolveFocusExtent`'s Sun-focus system-overview special
case (the same one that sizes the ≈148 AU boot pose) fires, landing the
camera at a ≈250+ AU wide establishing shot instead. This is a
consequence of the queue-step-2 realistic-mode work above, not a bug in
1d or in this session's harness — but it means "frame the Sun" is not
currently reachable via body-focus in realistic mode, and no
alternative technique (see the starfield wave file's camera-aiming
section) was found in time to substitute.

What WAS measured: mean luminance of the wide Sun-pose frame held
essentially flat over 8 s (16.03 → 16.02 → 15.99 → 15.98 — a 0.3%
drift, no pumping or oscillation). A second frame aimed off-Sun (a HYG
star dispatch, itself still resolving its own aim during the sampling
window) read 13.47 → 17.33 → 17.09 → 16.83 over the same 8 s — rising
rather than falling, but this reflects the aim target's own motion
during sampling, not an isolated exposure reading, so it is not
attributable to eye-adaptation specifically either way. **Net: no
evidence of unhealthy pumping/oscillation in the one stable frame
available, but the core "does exposure move the right direction for a
genuinely bright vs. genuinely dark frame" question is still owed** —
same status as every prior session's attempt at this, now with a
concrete explanation of one reason the test setup is harder than it
looks (the Sun-focus system-overview interaction).

### Planetshine / earthshine (Onda 2.3, item 6) — DEFECT FOUND, contradicts this section's own "zero console errors" claim above

**The GLSL patch never compiles.** `src/components/canvas/shaders/planetshinePatch.ts`'s
`buildPlanetshinePatch()` references `u_shineDir` (vec3) and
`u_shineRadiance` (vec3) inside its injected `#include
<lights_fragment_begin>` block — but never declares either as a GLSL
`uniform`, anywhere in the file. Compare `solarIrradiancePatch.ts`,
which explicitly emits `uniform float u_solarIrradiance;` (line 74) as
part of its own injected text before referencing it. `shader.uniforms[name]
= {value: …}` (JS-side, both files do this) registers the value for
three.js's uniform upload; it does **not** generate the matching GLSL
declaration — that is a second, separate step this file skips. This is
the exact bug class the starfield-visual-upgrade wave's zodiacal
rebuild found and fixed in the OTHER shader last session ("`u_sunDir`
was read in `main()` but declared nowhere… an undeclared custom
uniform is a link failure, not a warning"); it was never checked for
here.

**Confirmed at runtime, twice, independently:**

```
THREE.THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
Material Type: MeshStandardMaterial
Program Info Log: Fragment shader is not compiled.
ERROR: 0:1908: 'u_shineDir' : undeclared identifier
ERROR: 0:1908: 'constructor' : not enough data provided for construction
ERROR: 0:1909: 'u_shineRadiance' : undeclared identifier
ERROR: 0:1909: '=' : dimension mismatch
```

Fires at plain boot (forced ultra, waited through the full intro + a
settle buffer: 4 errors — Io, Europa, Moon's own compile plus one
retry-variant) and again when each of the 3 recipients is explicitly
focused (moon / io / europa in turn: 6 total console errors across the
session). `applyPlanetshinePatch` only runs for the 3
`isPlanetshineRecipient` bodies (Io, Europa, Moon —
`usePlanetMaterials.ts`'s `receivesPlanetshine` guard), so it never
touches the other ~40 bodies' materials, consistent with only these 3
throwing.

**Visual impact is not "earthshine missing" — it is "the body doesn't
render".** Screenshots (`item6-moon.png`, `item6-io.png`, handed to the
orchestrator):

- **Moon**: renders as a flat, blown-out white/grey irregular polygon
  with no shading, no terminator, no crater texture — not a sphere.
- **Io**: renders as a completely flat BLACK disc (no sunlit surface
  detail at all — Io should show a mottled sulfur-yellow lit
  hemisphere), with a separate corrupted glowing white/yellow flat
  polygon artifact floating near it in the same frame.

Both match the generic "shader failed to link" symptom (three.js
either falls back to a broken/partial program or renders with
undefined behaviour from the last successfully-linked program state) —
not a lighting-tuning issue, a rendering regression affecting Io,
Europa, and the Moon's basic visibility, live on `main` right now.

**Why the existing gates missed this.** `e2e/boot.spec.ts`'s first test
does assert `consoleErrors` is empty, but it resolves as soon as the
top-bar heading + a sized canvas appear — well before these 3 bodies'
materials get their first draw call and compile. The second boot test
waits long enough (through `isIntroAnimating` + `waitForStableFrame`)
but asserts no console errors at all. `npx playwright test
e2e/boot.spec.ts` passing (as recorded throughout this wave's
"Verification" sections) is therefore not in conflict with this
finding — it structurally cannot observe it. The Onda 2.3 section's own
"Runtime-verified, not just typed… zero console errors" claim above was
against a **different, uncommitted throwaway harness** whose exact wait
timing isn't recorded; this session's reproduction is with a committed,
inspectable technique (`__ATLAS_TEST_STORE__` + wait-for-intro-end) and
is repeatable.

**Not fixed — this session is docs/verification only per its brief.**
The fix is almost certainly a one-line addition of `uniform vec3
u_shineDir; uniform vec3 u_shineRadiance;` to the injected GLSL text in
`buildPlanetshinePatch()` (mirroring `solarIrradiancePatch.ts`'s
pattern), but that is product code and out of scope for this pass —
flagged as a follow-up task instead.

Moon's phase (`illuminatedFraction`, needed for the earthshine-visible
check) could not be read from the Sidebar's "Sky Geometry" panel within
this session (it sits below the captured viewport fold and a text-regex
extraction attempt found nothing) — moot until the compile failure
above is fixed, since the material doesn't render correctly regardless
of phase.

---

## 2026-07-29 (planetshine GLSL-compile defect — FIXED)

Follow-up to the "DEFECT FOUND" section immediately above. The one-line
fix that section predicted was directionally right but incomplete: the
declarations cannot land inline where `buildPlanetshinePatch()` reads
them, because that call site (`#include <lights_fragment_begin>`) is
already inside `main()` and GLSL forbids a `uniform` declaration inside a
function body.

**The fix.** `planetshinePatch.ts` gained a second export,
`PLANETSHINE_PARS_PATCH`, injected at the SAME `#include
<lights_physical_pars_fragment>` anchor `solarIrradiancePatch.ts` already
owns:

```glsl
uniform vec3 u_shineDir;
uniform vec3 u_shineRadiance;
#include <lights_physical_pars_fragment>
```

This works because both branches of `buildPlanetDirectLightPatch`
(regolith and lambert) re-emit that literal `#include
<lights_physical_pars_fragment>` token verbatim as the first line of their
own replacement text — so after `applyPlanetDirectLightPatch` runs, the
token still appears in the shader exactly once, embedded in what it just
inserted, and `applyPlanetshinePatch`'s own `.replace()` against that same
token finds it and prepends the two declarations ahead of it. This makes
call order **load-bearing, not incidental**: `applyPlanetshinePatch` must
run after `applyPlanetDirectLightPatch` on the same shader object, which
`usePlanetMaterials.ts`'s `patchDirectLights` closure already does for
every branch. `applyPlanetshinePatch`'s docstring (previously claiming
"order does not actually matter") was corrected to say so.

**CPU-side binding was already correct.** `shader.uniforms[u_shineDir]` /
`[u_shineRadiance]` were registered by `applyPlanetshinePatch` from the
start, and `Planet.tsx`'s per-frame write already read
`material.userData.shader.uniforms[...]` correctly — the JS-side objects
simply had no matching GLSL declaration to bind to at compile time. No
change was needed on that side.

**Root cause of how it escaped `test:run`.** `planetshinePatch.test.ts`'s
"composes cleanly with the direct-light patch on the same shader" test
asserted chunk PRESENCE (`toContain("IncidentLight shineLight;")`,
`toContain("void RE_Direct_SolarIrradiance(")`) but never that a
referenced identifier was actually DECLARED — `String.prototype.includes`
cannot see a GLSL compile error. Hardened with a shared static-consistency
helper, `src/components/canvas/shaders/shaderUniformAudit.ts`
(`findUndeclaredUniforms` / `assertAllUniformsDeclared`): strips GLSL
comments, then flags any `u_`-prefixed identifier referenced in a composed
shader string with no matching `uniform` declaration in that same string.
Applied to the whole `onBeforeCompile` patch family —
`planetshinePatch.test.ts` (against the fully composed shader, both
`regolith` variants — this is the assert that fails on `26cb756` and
passes on the fix), `solarIrradiancePatch.test.ts` (defensive pin;
`u_solarIrradiance` was already declared correctly) and
`regolithPhotometry.test.ts` (defensive pin; that patch carries no custom
uniforms today).

**New permanent regression net: `e2e/ultra-shaders.spec.ts`.** The static
check above proves internal consistency of the shader TEXT, not that a
real GPU accepts it — so a runtime net was also added, committing the
"forced-ultra headless verification pass" technique that found this
defect as a permanent gate instead of a one-off throwaway harness. Single
page load, `__ATLAS_TEST_STORE__`-driven `setGraphicsAutoMode(false)` +
`setGraphicsPreset("ultra")` immediately after the test store appears
(bypassing headless SwiftShader's `constrained`-tier auto-detect
ceiling), then sequential `setFocusId` across one representative per
patched material family — `moon` + `io` (the shine recipients this defect
broke), `mercury` (airless-regolith, non-recipient), `earth` (day/night
branch), `saturn` (ring-shadow branch) — asserting zero console errors
throughout. Runtime ≈ 40–48 s.

**Verified the regression net actually catches the defect** (not just
asserted): temporarily reverted `planetshinePatch.ts` to the pre-fix
`26cb756` shape, rebuilt, and ran `e2e/ultra-shaders.spec.ts` alone — it
failed red with the exact reported errors (`ERROR: … 'u_shineDir' :
undeclared identifier`, `ERROR: … 'u_shineRadiance' : undeclared
identifier`) for Io, Europa and the Moon. Restored the fix, rebuilt, and
the same spec passed clean.

**Visual confirmation.** Forced-ultra screenshots of the Moon and Io,
focused individually post-fix: the Moon renders as a proper lit sphere
with visible terminator and crater texture (not the pre-fix flat white
polygon); Io renders with its mottled sulfur-yellow/red lit hemisphere and
a dark limb (not the pre-fix flat black disc). One loose end from the
original report was run down and resolved as a non-issue: the "separate
corrupted glowing white/yellow flat polygon artifact floating near" Io in
the pre-fix screenshots is the app's existing off-screen/nearby-body
direction-indicator arrow UI (confirmed by focusing Europa and Jupiter
individually and seeing the same arrow, correctly labelled, pointing at
Callisto and the Sun respectively) — an unrelated, pre-existing, working
feature that happened to sit next to Io's own broken disc in that frame,
not a second shader defect.

**Verification.**

- `npm run test:run` — 2536 passed / 125 files (net +1 file:
  `shaderUniformAudit.ts` is not itself a test file; the 3 patch-family
  test files gained one assert each except `planetshinePatch.test.ts`,
  which gained the composed-shader regression pin). No test deleted or
  weakened.
- `npx tsc -b` — clean. `npm run lint` — clean. `npm run docs:check` —
  clean. `npm run build` — clean.
- **E2E gate:** `npx playwright test e2e/` — 13/13 passed (the new
  `ultra-shaders.spec.ts` plus the existing 12). One run hit
  `hyg-focus.spec.ts`'s already-documented worker-contention flake on its
  "intermediate frame" sampler (see the "Onda 2.2" section's own note on
  this exact flake); it passed alone and passed again in a clean full
  re-run. The boot pixel baseline needed no re-blessing — this defect and
  its fix never touch the wide, disc-free boot frame.

---

## Onda 2.4 — analytical auto-exposure / radiometric anchor (done)

Shipped 2026-07-29. Closes the owner's report that in "Brilho real"
Saturn and Jupiter render as **pitch-black discs** — reproduced
headlessly before the fix (`saturn-real-before.png`: an invisible
planet, only the constant ring emissive faintly present) and after
(`saturn-real-after.png`: banded disc, terminator, lit rings).

### The defect was the exposure, not the irradiance

Onda 2.1–2.3 gave every body the sunlight it really receives, but left
exposure pinned at the 1 AU reference. In `"real"` that showed Saturn's
true RADIANCE **under Earth's exposure**. The owner's objection is
correct on the physics: Saturn receives ~1.1 % of Earth's irradiance,
and 1 % of sunlight is ~1500 lux — an overcast Earth afternoon. Any
observer at Saturn, and every Cassini frame, sees a brilliant planet.
No serious astronomy app fixes exposure at one body's distance while
claiming to show another body's brightness.

### The formula

```
sceneExposure_anchor = 1 / fusedSunlightScalar(focusedBody, activePolicy)
```

`fusedSunlightScalar` is the **same** `resolveFusedSunlightScalar` the
planet materials multiply their direct sunlight by — not a parallel
re-derivation. That identity is the design: the focused body's
on-screen luminance is `fused × exposure ≡ 1`, exactly reference
display brightness, in every policy. A camera exposes for its subject.
`autoExposure.test.ts` pins the invariant across 10 bodies × 3
policies; if the two ever drift, the black-disc defect returns for
whatever body the drift covers.

Pinned positions (`autoExposure.test.ts`):

| focus                | policy        | anchor                           |
| -------------------- | ------------- | -------------------------------- |
| any body             | `compensated` | exactly 1 (`Math.fround` = 1.0f) |
| Saturn (9.0–10.1 AU) | `real`        | d² = 81–102, ~89 mid-orbit       |
| Neptune              | `assisted`    | ~10.8                            |
| Neptune              | `real`        | ~906                             |
| nothing focused      | any           | exactly 1                        |

### The §5.3 answer — "âncora radiométrica: o que significa 0 EV?"

**0 EV means the sunlight falling on the body you are looking at.** Not
a fixed W/m², not 1 AU forever — an observer's adaptation state, which
is the only thing a display-referred pipeline can honestly claim. The
1 AU constant survives as the _unfocused_ anchor: system overview and
boot frame yield exposure exactly 1. `handoffiluminacao.md` §5.3 is
closed; `solarIrradiance.ts`'s "the anchor is PROVISIONAL" header is now
about where the _material_ normalisation sits, not about an unanswered
design question.

Consequence, all intended: the policy control no longer decides whether
you can see your subject, only how the **rest of the scene relates to
it** — `real` = true ratios, `assisted` = sigma-0.35-compressed ratios,
`compensated` = today's equalized look (anchor = 1, byte-identical to
pre-2.4).

### The Sun is not a subject

`resolveAnchorDistanceAU` falls back to the 1 AU reference for: no
focus, an id outside the curated catalog (HYG star focus arrives as
`hyg:<index>`; `resolveHeliocentricDistanceAU` throws on unknown ids by
design), and any body inside `SOLAR_IRRADIANCE_MIN_AU`. The last case
is the Sun and only the Sun (Mercury's perihelion is 0.3077 AU). Its
heliocentric distance is 0 and `solarIrradianceAtAU` clamps that to
0.05 AU purely as a division-by-zero guard _for the material path_ —
that module's own docstring calls it "not a photometric statement".
Reading it as an anchor would darken the whole scene 400× on
`focusHome()` and promote a defensive bound to a claim; the Sun does
not _receive_ sunlight, so the quantity is undefined, not small.

### The ramp: log-space, time-based — and why not flight progress

Log2 (stop) space, `stepExposureLogTowards`, tau = 1.5 s. Log space is
non-negotiable: the anchor crosses ~10 stops Earth to Neptune, and a
linear lerp would spend ~97 % of its duration inside the last stop —
a hard cut followed by a crawl. Tests pin monotonicity in both
directions, continuity as delta-t goes to 0, frame-rate independence,
and exact settling.

**Flight progress was NOT used, deliberately.** The only
flight-progress scalar this repo exports is `hygFlightPosProgress`,
which covers HYG _star_ flights — the one focus class that has no
heliocentric distance and therefore never moves the anchor at all. The
curated-body fly-to (`CameraController.tsx`'s `CameraTransition`) keeps
its progress in a component-local ref with no exported surface, and the
bodies whose exposure actually swings (Jupiter, Saturn, Neptune) are
all on that path. Publishing it means either a 60 Hz store write (a
React re-render per frame) or a second camera-to-photometry singleton,
to buy a difference the eye cannot resolve: the fly-to is
duration-clamped to 1.5–4 s, and at tau = 1.5 s the ramp has covered
63 % of its stops by the end of the shortest flight and >93 % by the
end of the longest. This is the documented fallback the brief allows,
taken knowingly.

### Interplay 1 — eye adaptation: bounded refinement, not a second writer

`EyeAdaptationBridge` (1d) used to write the WHOLE registry via
`setSceneExposure`, mapping measured luminance to an ABSOLUTE exposure
in `[0.165, 1]`. Left alone it would have destroyed the anchor within
one adaptation time constant — two absolute writers on one scalar is
the "dois multiplicadores empilhados que depois brigam" failure mode
the plan names, the same law `solarIrradiance.ts` obeys by fusing
irradiance and assist gain before either reaches a shader.

**Chosen: option (a), bounded refinement multiplier — kept, not
disabled.** Evidence for keeping it: `exposureFromAdaptedLuminance`
returns `TARGET / max(L, TARGET)`, which is 1.0 (neutral,
byte-identical to pre-1d) for the overwhelming majority of frames — a
mostly-black solar-system frame averages far below the 0.165 floor in
the library's 1×1 mip — and only dips when something genuinely blows
the frame out, i.e. the Sun in view. Its real contribution today is
_glare protection_, which is orthogonal to exposure placement and
worth having. As a multiplier it also reads the way a biological eye
actually behaves: trimming around a scene it is already adapted to.

**The composition is structural, not conventional.** The registry now
holds two private factors and derives the product:

```
sceneExposure = anchor × adaptation
setExposureAnchor()      <- AutoExposureBridge, exclusively
setExposureAdaptation()  <- EyeAdaptationBridge, exclusively
```

`setSceneExposure` is **gone**; there is no API by which either driver
can reach the other's factor or the product. `exposureRegistry.test.ts`
pins that writing one factor leaves the other bit-identical.

Bound: ±1 stop (`EXPOSURE_ADAPTATION_MIN/MAX = 0.5 / 2.0`). One stop is
the largest trim that cannot reorder which body reads brighter than
which — the ordering claim `assisted`/`real` make is that irradiance
RATIOS survive, and the smallest ratio between adjacent catalog bodies
is well over 2:1. The raw measurement is deliberately NOT pre-clamped
in `eyeAdaptation.ts`; the honest measured value goes in and the bound
is applied in the one place that owns the composition.

Not a feedback loop: `AdaptiveLuminancePass` samples the composer's HDR
**input** buffer, upstream of the `ToneMappingEffect` that consumes
`toneMappingExposure`, so raising the anchor does not change what gets
measured.

### Interplay 2 — Bloom threshold: VERIFIED unaffected

Two independent reasons, both read out of
`node_modules/postprocessing/build/index.js@6.38.0` and three's
`tonemapping_pars_fragment.glsl.js`, not assumed:

1. **Ordering.** `PostProcessingPipeline.tsx` mounts
   `Bloom -> ToneMapping -> HueSaturation -> BrightnessContrast`. Bloom
   reads the raw HDR buffer before any tone-mapping stage runs.
2. **Uniform reach.** `toneMappingExposure` appears in exactly one
   shader in the whole pipeline: `tone_mapping_default` (index.js:13282)
   is the only string in the package that includes
   `<tonemapping_pars_fragment>`. Bloom's threshold material is
   `LuminanceMaterial` (index.js:3368-3396) — its fragment source
   declares only `inputBuffer`, `threshold`, `smoothing`/`range`, and
   computes `mask = smoothstep(threshold, threshold + smoothing,
luminance(texel.rgb))`. No exposure term, no chunk include.

Corollary also verified: `Scene.tsx` sets
`gl.toneMapping = NoToneMapping`, and three only emits the chunk into
scene materials when `toneMapping !== NoToneMapping`, so the registry
cannot leak into planet/star materials either. It reaches exactly one
place — the AgX EffectPass (three's AgX branch multiplies by it at
`tonemapping_pars_fragment.glsl.js:135`).

**Therefore no change to `luminanceThreshold = 1.0` was needed and none
was made.** `SUNLIGHT_UNMAPPED_CEILING` (the "gain > 1 needs a mounted
operator" guard from §6 item 4) is likewise untouched and still correct:
where no operator is mounted, `gl.toneMappingExposure` is a structural
no-op, which is also why the headless boot pixel baseline is immune to
everything in this Onda.

### Interplay 3 — what does and does not follow the anchor

- **Sun disc** — `toneMapped: false`, bypasses exposure entirely, stays
  saturated at any anchor. Physically right and deliberately kept: an
  adapted eye still cannot look at the Sun from Neptune. Documented in
  `exposureRegistry.ts` and in the new Credits entry.
- **Starfield, night lights, atmosphere, ring emissive** — all scale
  with the global exposure (via `toneMappingExposure` on the composed
  buffer). At Neptune-real (×906) the sky lifts dramatically. This is a
  dark-adapted observer's sky and AgX rolls the top, so it is
  physically defensible — **captured in the screenshots and left
  uncapped, owed to the owner's aesthetic judgment.** See "Owed" below.
- **Ring emissive specifically** — Saturn's rings are still an
  emissive constant, so at anchor 89 they lift by 89× while the
  planet's own surface stays at reference. Visible in
  `saturn-real-after.png`. Owed to the rings wave (W5-B), which runs
  after this one; not touched here.

### Registry bound: 16 to 1e6, structurally derived

The old ceiling of 16 was chosen when the only writer produced values in
`[0.165, 1]`. The anchor asks for d² in AU: Jupiter ~27, Saturn ~89,
Neptune ~906, Pluto ~1560, Eris at aphelion ~9525, Sedna at aphelion
~941 000. A ceiling of 16 would have clipped everything from Jupiter
outward — i.e. silently reproduced the exact defect this Onda fixes.

The new ceiling is **not a round taste number**: it is exactly
`SOLAR_IRRADIANCE_MAX_AU²` = 1000² = 1e6, the reciprocal of the
smallest irradiance `solarIrradiance.ts` can produce, pinned to that
identity by test. Any round replacement (4096, 65536) still clips SOME
catalog body and therefore still breaks `fused × exposure = 1` for that
body alone — correct almost everywhere and silently wrong at the edge,
the worst kind of bound. Tying it to the irradiance module's own
distance clamp makes the invariant hold for every body the catalog can
ever hold, by construction. `SCENE_EXPOSURE_MIN` is unchanged at 1e-6.

Safety: `gl.toneMappingExposure` is consumed only by the ToneMapping
fragment shader, which three compiles at `precision highp float`
(WebGL2 mandates highp in fragment shaders), so `color *= 1e6` cannot
overflow; AgX then clamps `log2(color)` into its `[-12.47, 4.026]` EV
window before the sigmoid, so even a zero-luminance pixel resolves to
the operator's black rather than a NaN.

### Disclosure changes

- **FidelityBadge, both locales.** The old `real` line ("A luz solar cai
  com a distância real, sem correção — os mundos externos são mesmo
  assim tão escuros") had become a lie and was the copy the owner was
  reading. Now: _"Razões de brilho verdadeiras entre os mundos. A
  exposição se adapta ao corpo focado, como um observador no local
  estaria adaptado."_ / _"True brightness ratios between worlds.
  Exposure adapts to the world you focus, the way an observer standing
  there would be adapted."_ The `assisted` line was also rewritten —
  its old "range compressed so distant worlds stay visible" sold
  visibility, which is now the anchor's job, not the assist's; it now
  names what the assist actually does (compresses the gaps _between_
  worlds) and keeps the ordering claim.
- **Credits.** New entry _"Exposure — an observer adapted to the world
  you are looking at"_: the formula in words, the 1500-lux Saturn
  argument, the unfocused 1 AU anchor, the log-space ramp, and both
  named consequences (Sun disc exempt; starfield not exempt). The
  existing sunlight entry dropped its now-obsolete "the 1 AU reference
  point is itself provisional / no absolute radiometric claim" tail,
  which moved into the new entry in its answered form.

### Files

- `src/lib/graphics/autoExposure.ts` (new, pure) — formula, subject
  rules, log ramp.
- `src/lib/graphics/exposureRegistry.ts` — two-factor composition,
  new bound, `setSceneExposure` removed.
- `src/components/canvas/scene/AutoExposureBridge.tsx` (new) — the
  three lines of glue the pure module cannot own (focus id, clock,
  frame delta), with the same 1 s bucket cache
  `useBodySunlightScalar.ts` uses, keyed additionally on focus id.
- `src/components/canvas/scene/EyeAdaptationBridge.tsx` — writes
  `setExposureAdaptation`.
- `src/components/canvas/Scene.tsx` — mounts the new bridge.
- `src/lib/graphics/autoExposure.test.ts`,
  `src/lib/graphics/exposureRegistry.test.ts` (new).
- `src/components/ui/CreditsModal.tsx`, both `common.json` locales,
  `FidelityBadge.test.tsx` (copy pin updated to a line that survived
  the rewrite).
- `src/lib/zodiacalLightLut.ts` — a doc comment quoted the old
  `SCENE_EXPOSURE_MAX = 16`; reworded so its argument no longer depends
  on the ceiling.

### Verification

- `npm run test:run` — **2573 passed / 126 files** (+32 new: 20
  `autoExposure`, 12 `exposureRegistry`). No test deleted; one copy pin
  in `FidelityBadge.test.tsx` retargeted to surviving copy.
- `npx tsc -b`, `npm run lint`, `npm run docs:check`, `npm run build` —
  all clean.
- `npx playwright test e2e/` — 13/13 passed. **Boot pixel baseline
  unchanged and NOT re-blessed**: no focus at boot means anchor exactly
  1, and headless resolves to `constrained` where no ToneMapping pass
  mounts at all, so the registry is a structural no-op there.
- **Forced-ultra headless A/B** (the technique committed as
  `e2e/ultra-shaders.spec.ts`, driven here by a throwaway spec that was
  deleted before the commit): `__ATLAS_TEST_STORE__` then
  `setGraphicsAutoMode(false)` + `setGraphicsPreset("ultra")`, policy
  driven through the real FidelityBadge UI, focus via `setFocusId`.
  BEFORE captured by stashing this change and rebuilding, so the two
  frames differ only by this commit.
  - `saturn-real-before.png` — Saturn is an invisible black disc; only
    the constant ring emissive is faintly present. The owner's report,
    reproduced exactly.
  - `saturn-real-after.png` — banded disc, terminator, lit rings, at
    anchor ~89.
  - `neptune-assisted-after.png` — lit blue disc with cloud structure
    at anchor ~10.8.

### Owed

1. **Aesthetics of the high-anchor sky.** At Neptune-real (×906) and
   even at Saturn-real (×89) the starfield lifts hard —
   `saturn-real-after.png` shows a dense, bright star field and a
   large solar glow. This is physically defensible (dark adaptation)
   and was left uncapped on purpose rather than silently clipped, but
   it is a look decision the owner has not seen yet. If he wants it
   damped, the honest lever is a per-family registry subscription
   (starfield `u_exposure` taking a sub-linear share of the anchor),
   not a cap on the anchor itself.
2. ~~Ring emissive detaches under a high anchor — W5-B.~~ **CLOSED
   2026-07-29, `ef09f13`.** The ring material's constant `emissive` /
   `emissiveMap` / `emissiveIntensity` (`RING_EMISSIVE_POWER`) is deleted.
   The ring now joins this Onda's own per-body law directly:
   `ringLightingPatch.ts` wraps `RE_Direct` with the SAME
   `u_solarIrradiance` uniform the planet surfaces read, written by the
   same per-frame call in `Planet.tsx` — one resolver call feeds both
   materials. Front (sunlit) face gets the full scaled response; the far
   face mirrors the light direction and dims by a fixed
   `RING_TRANSMISSION_FRACTION`, approximating the light a real,
   optically-thin ring transmits (not a per-ring optical-depth model —
   that is W9's job). Verified across all three policies at Saturn focus;
   see `tasks/waves/fidelity-honesty-2026-07-26.md`'s W5 section for the
   full account and screenshot paths.
3. **Atmosphere shell + cloud COLOR blend** still do not follow the
   registry (pre-existing, `exposureRegistry.ts`); bounded today
   because Earth is the only body with either and sits at anchor 1.
4. Bodies rendered via `PlanetModel.tsx` (haumea, vesta, pallas,
   hygiea) still skip every per-material mechanism, so they do not get
   the irradiance scalar and now sit at whatever the anchor leaves them
   — pre-existing §5 item 5, unchanged by this Onda.
