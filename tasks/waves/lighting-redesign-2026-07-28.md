# Wave — Lighting redesign (Onda 1, items 1 + 3)

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
  real irradiance.
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

1. Irradiance work first — inverse-square from ephemeris heliocentric
   distance (Onda 2's `resolveHeliocentricDistanceAU` pattern), applied in
   BOTH scale modes per decision 2, fused with the didactic content-assist
   gain into a single per-material uniform (handoff §4 Onda 2: "senão
   nascem dois multiplicadores empilhados que depois brigam").
2. Default-mode change — flip `store.ts`'s `scaleMode` default from
   `"didactic"` to `"realistic"`, now that irradiance no longer silently
   diverges from what the scale mode shows.
3. Unified badge + assist control — the single expandable fidelity badge
   (decision 1) replacing/absorbing `ScalePill`, plus the "assist" gain
   control from handoff §4 item 4 (now unblocked by decision 1 resolving
   §5.6).
4. Milky Way HDR panorama — NASA SVS Deep Star Maps 2020 (decision 3),
   licensing check owner-side before shipping.

---

## Item 7 — e2e baseline decision

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
4. Onda 2 (inverse-square irradiance, analytical auto-exposure, exposure
   registry audit, planetshine) is next per both the handoff's sequencing
   and the owner-decisions queue above — start with irradiance.
