# Wave — Volumetric Milky Way (no skybox)

_2026-07-29. Research + feasibility + staged plan. **No implementation
in this document.** Written after the owner's eye pass pulled the NASA
SVS panorama skybox (`53ce720`, pulled same day) with the verdict
**"muito ruim, confuso e não integrado com o starfield. ele some nos
fly-bys"**, and after the owner independently researched the industry
approach (volumetric emissive/absorbing particle layers, floating
origin, log depth) and asked for it to be validated and planned._

Read [`../../AGENTS.md`](../../AGENTS.md) first. It is product law and
it is what forced several of the rejections below. The pull record this
document supersedes is
[`starfield-visual-upgrade-2026-07-28.md`](./starfield-visual-upgrade-2026-07-28.md)
§"#4 pulled (2026-07-29)".

---

## Feasibility verdict

**Yes — and the honest version is cheaper than the owner's version,
because most of the hard parts already exist in this repo.**

Atlas already has: `logarithmicDepthBuffer: true`
(`Scene.tsx:500`), a `far: 1e15` world-unit frustum
(`Scene.tsx:479`) that reaches 4.85 Mpc, a fixed linear parsec→world
map (`ATLAS_SCENE_UNITS_PER_PC = 2.06265e8`) that is **not** touched by
the didactic/realistic scale compression, a float64 camera-relative
bridge (`math/cameraRelative.ts`) already wired for the focused star,
an instanced-quad Pogson/PSF renderer with live inverse-square flux
(`Starfield.tsx`), a HalfFloat composer with bloom + AgX + eye
adaptation, a tier system, and a **1e-12-verified galactic→scene
rotation** (`milkyWayOrientation.ts`) that survived the pull.

What is genuinely missing is one thing: a particle set, and a renderer
for it that is one small variant of the star shader.

Three hard constraints came out of the analysis and they reshape the
owner's plan rather than confirm it:

1. **Fill-rate makes a half- or quarter-resolution offscreen pass
   mandatory, not an optimisation.** At ultra's `dprMax: 2` on a
   1920×1080 window the drawing buffer is 8.29 Mpx; a smooth haze needs
   ~15× screen overdraw; that is 126 M blended fp16 fragments per frame,
   which needs ~84 Gfrag/s to fit a 1.5 ms budget. No consumer GPU does
   that. Quarter-res needs 5.3 Gfrag/s and fits nearly everywhere.
   §5 has the table. This must be in M1.
2. **Particle COUNT is the wrong knob.** Fill cost depends on
   `Σ σ_ang²` (total covered solid angle), not on N. 7 000 two-degree
   particles and 110 000 half-degree particles cost the _same_ fill and
   differ only in vertex cost and detail. The owner's "20–60k" is not
   wrong, it is just not the number that decides anything. §5.
3. **The pulled panorama was ≈6× too bright at the band peak, against
   published surface-brightness values, and that is provably why it
   read as "not integrated".** It derived its own display constant
   independently of the zodiacal layer's, and two layers each
   independently normalised to the middle of the same display window
   are guaranteed to be wrong relative to each other. §4 is the fix and
   it is a one-constant change that also retro-fixes the shipped
   zodiacal layer's relationship to any future diffuse layer. Better
   still, Leinert et al. 1998 — the paper `zodiacalLightLut.ts`
   _already cites_ — tabulates integrated starlight with naked-eye
   stars removed, which is almost exactly this layer's quantity. One
   paper, two layers, one unit system, and a real absolute calibration
   gate (§4.3).

**No hard blockers.** One named external risk worth flagging up front:
three.js issue **#29841** — `logarithmicDepthBuffer` + a
post-processing `RenderPass` makes transparent-over-opaque geometry
disappear on some Intel UHD/Windows devices, **closed upstream as "not
planned"**. That is this layer's exact profile, so M1 carries a
mandatory Intel smoke check and three named fallbacks (§6/M1). The
version pair Atlas ships (three **0.181.2** + postprocessing
**6.38.0**) is otherwise verified-correct for log depth — and is on the
right side of a silent-failure boundary at three r180 (§2.4).

Everything else is bounded and in §5/§6.

**Degradation:** `constrained` does not mount it (same gate as
`ZodiacalLightSkybox` — no composer, no HalfFloat buffer). `balanced`
gets quarter-res + fewer overlapping layers. This is the existing
`qualityProfile` idiom, not a new mechanism.

---

## 0. Root-causing the two failures the owner saw

The wave file that recorded the pull listed hypotheses and explicitly
did not investigate them. Both are now root-caused, one of them with
arithmetic that is decisive.

### 0.1 "ele some nos fly-bys" — SOLVED, and it is not a texture problem

`MilkyWaySkybox` (and the still-shipping `ZodiacalLightSkybox`, which
has the identical latent defect) is a `BackSide` icosphere of radius
**1e8 world units** re-centred on the camera inside a `useFrame`
(`ZodiacalLightSkybox.tsx:171-173`, `icosahedronGeometry args={[1e8, 3]}`
at `:212`).

The HYG fly-to camera runs at `MAX_VELOCITY_FACTOR = 3.0`
(`lib/camera/hygPhysicsFlight.ts`), i.e. **v = 3 × remaining distance
per second**. At 60 fps that is a per-frame stride of `distance / 20`.

The camera leaves its own skybox whenever

```
distance / 20  >  1e8 wu        →        distance > 2e9 wu = 9.7 pc
```

Once the camera is _outside_ a `BackSide` shell, every face is
back-face-culled and **the layer draws nothing**.

Two independent things make this fire:

- **Ordering.** `<ZodiacalLightSkybox />` mounts at `Scene.tsx:767`,
  `<CameraController />` at `Scene.tsx:852`. Both subscribe `useFrame`
  at priority 0, and R3F runs same-priority subscribers in subscription
  order, which follows mount order. So the shell is re-centred on the
  **previous** frame's camera position, then the camera moves, then the
  frame renders. The lag is one full stride.
- **Magnitude.** Even with perfect ordering, one frame's stride can
  exceed the shell radius outright.

HYG has ~350 stars inside 9.7 pc out of 109 400. **More than 99.6 % of
fly-to targets put the camera outside the shell on the first frame of
the flight.** And because `distance(t) = D₀·e^(−3t)`, the camera
re-enters the shell only near arrival — so the band _vanishes at flight
start and returns as you arrive_. That is exactly the symptom the owner
reported, verbatim.

**How the new architecture prevents it structurally:** there is no
camera-attached proxy geometry at all. The galaxy is real geometry at
real galactocentric positions, in the same fixed parsec→world frame as
the HYG stars. There is no shell to fall out of, no per-frame
re-centring, no frame-ordering dependency. The failure mode is not
fixed, it is _unrepresentable_.

> **Spin-off, not this wave's scope:** `ZodiacalLightSkybox` still ships
> with this bug. It is masked because `R^-2.5` makes the band nearly
> invisible at the distances where fast flights happen, but it is the
> same defect. Fix is one line (grow the radius, or re-centre at a
> priority that runs after the camera integration, or drop `BackSide`
> for `DoubleSide`). See §7.

### 0.2 "não integrado com o starfield" — four causes, all fixable

1. **Photometric.** The panorama was a display-referred sRGB JPEG
   multiplied by a constant derived from _its own_ dynamic range, added
   on top of a Pogson/inverse-square star field. It did not share a
   radiometric scale with anything. §4 quantifies this at ~8× too
   bright and gives the single-constant fix.
2. **Parallax.** A skybox has none; stars have real parallax. The eye
   separates "painted backdrop" from "3D field" instantly. Real 3D
   particles fix this by construction, and the fix is _visible_: flying
   100 pc shifts haze at 150 pc by up to 34° and haze at 8 kpc by
   0.04°. That depth stratification is the wow.
3. **Angular resolution.** A 4096-wide equirect stretched over 360°
   gives 512 texels across a 45° FOV — 3.75× magnification at 1920 px.
   Soft and mushy is the _only_ thing it could have looked like. This
   is the most likely literal source of "muito ruim" and the pull
   record did not identify it. Particles have no such ceiling.
4. **Exposure coupling.** Zodiacal light responds to camera distance;
   the panorama did not. When 1d's eye adaptation moved exposure, one
   diffuse layer moved with the scene and the other sat still. Living
   inside the same scene pass, with the same `starExposure()` scale,
   downstream of the same Bloom → AgX → adaptation chain, is what
   "integrated" means operationally.

---

## 1. What Atlas already has (read this before re-planning anything)

The owner's plan proposes several things the repo already ships. Listed
so they are not rebuilt.

| Owner's item                                | Status in repo                       | Evidence                                                                 |
| ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Logarithmic depth buffer                    | **Already on**, all tiers            | `Scene.tsx:500` `logarithmicDepthBuffer: true`                           |
| Real catalog stars with true parallax       | **Already ships**                    | `Starfield.tsx`, 109 400 instances, `flux = a_lum*100/distPc²` at `:170` |
| Live inverse-square brightening on approach | **Already ships**                    | same line; `starfieldShaderMath.ts` §Photometry                          |
| Fly-to-star flights                         | **Already ships**                    | `lib/camera/hygPhysicsFlight.ts`, `StellarFlightTransition.ts`           |
| Sprite ↔ mesh crossfade at arrival         | **Already ships**                    | `HygStellarMesh.tsx`, `a_fadeAlpha` / `a_focusMask`                      |
| Float64 camera-relative upload              | **Already ships (1 star)**           | `math/cameraRelative.ts`, `u_focusedCamRel` at `Starfield.tsx:136-163`   |
| Frustum reaching galactic scale             | **Already ships**                    | `far: 1e15` wu = 4.85 Mpc (`Scene.tsx:479`)                              |
| Galactic → scene orientation                | **Already ships, verified to 1e-12** | `milkyWayOrientation.ts` + 16 passing tests                              |
| Tier-gated degradation                      | **Already ships**                    | `qualityProfile.ts`, `graphics/resolver.ts`                              |

**Genuinely missing:** the particle set, its baker, its renderer, and
the offscreen half-res composite. That is the whole delta.

### 1.1 Scale, precision, and where a kpc-scale layer lives

`AU_TO_3D_UNITS = 1000` (`astrophysics.ts:12`), so:

| Quantity                                                               | World units |
| ---------------------------------------------------------------------- | ----------- |
| 1 AU                                                                   | 1.0e3       |
| Didactic heliocentric cap (`DIDACTIC_HELIOCENTRIC_WORLD_CAP`, ≈323 AU) | 3.2e3       |
| 1 pc                                                                   | 2.06265e8   |
| 100 ly (30.7 pc)                                                       | 6.32e9      |
| 1000 ly (307 pc)                                                       | 6.32e10     |
| Sun→Galactic Centre, R₀ = 8.2 kpc                                      | 1.691e12    |
| Far edge of the disc, ~25 kpc                                          | 5.16e12     |
| Camera far plane                                                       | 1.0e15      |

**The scale-mode question resolves to "no work".** `Starfield.tsx`
never reads `scaleMode`; it uses the fixed
`DISTANCE_SCALE = ATLAS_SCENE_UNITS_PER_PC` (`:93`). The didactic
compression (`mapDidacticHeliocentricDistance`, cap 3200 wu at ≈323 AU)
applies **only to solar-system body placement**. So the interstellar
frame is scale-mode-invariant today, and a galaxy layer inherits that
for free. In didactic mode the entire solar system is a 3200 wu ball
sitting inside a 1.7e12 wu galaxy; in realistic mode Pluto is at
4.9e4 wu. Neither produces measurable galactic parallax, which is
correct.

**float32 survives it, with one named exception.** float32 relative
precision is 5.96e-8. At the far edge of the disc (5.16e12 wu) that is
3.1e5 wu absolute = 1.5e-3 pc. Viewed from 8 kpc that is 1.8e-7 rad =
0.038 arcsec, against ~7.3e-4 rad per pixel at 45° FOV / 1080p —
**four orders of magnitude below a pixel.** Static galaxy particles do
not need floating origin.

The exception is the `~1e7 wu` threshold `cameraRelative.ts` documents:
it bites when the camera itself is far from the origin and you need
_relative_ precision between camera and nearby geometry. That only
happens on a deep fly-out (M2). The idiomatic three.js fix needs **no
shader change at all**: chunk the particle buffer, store each chunk's
positions relative to its own centre, and put the centre in
`object.position`. three.js composes
`modelViewMatrix = camera.matrixWorldInverse · object.matrixWorld` on
the CPU in float64 and uploads the float32 _result_, so the large-number
cancellation happens in float64. Chunking is required for the M3 octree
anyway, so floating origin comes free with LOD. Do not build it earlier.

### 1.2 The depth interaction, answered from this repo rather than from the web

The question "does `logarithmicDepthBuffer` compose with the pmndrs
`EffectComposer` and our custom shaders" has an empirical answer here:
**it already does, and has shipped, because nothing in the mounted
chain reads depth.** The composer mounts `LightGlowSlot`, `Bloom`,
`ToneMapping`, `HueSaturation`, `BrightnessContrast`
(`PostProcessingPipeline.tsx:230-265`). None declares
`EffectAttribute.DEPTH`, so pmndrs never allocates a depth texture and
never linearises anything. Log depth is confined to the scene pass,
where three.js handles it.

§2.4 verifies the library side independently and finds Atlas's version
pair is the correct one — including a **silent** failure boundary at
three r180 that Atlas is on the right side of. Read §2.4 before
changing either dependency, and before adding any depth-reading effect.

Two concrete facts that constrain the design:

- **Custom `ShaderMaterial`s do not get log depth automatically.**
  `proceduralSunShaders.ts` includes `<logdepthbuf_vertex>` /
  `<logdepthbuf_fragment>` explicitly; `Starfield.tsx` deliberately does
  **not**.
- **Including the chunk writes `gl_FragDepth`** (three r181,
  `logdepthbuf_fragment.glsl.js` — `gl_FragDepth = ... log2(vFragDepth)
  - logDepthBufFC \* 0.5`), which **disables early-Z** for that material.
    For a heavy-overdraw additive layer that is a real cost.

**Decision: the haze layer follows `Starfield.tsx`, not the Sun
shaders — no log-depth chunks, `depthWrite: false`, `depthTest: true`.**
Justification, and it is exact rather than lucky: with `far = 1e15`, a
standard `z/w` for anything beyond ~1e7 wu is float-indistinguishable
from 1.0, the depth buffer clears to 1.0, and three.js defaults to
`LessEqualDepth`. So the layer passes against empty sky and fails
against any log-encoded planet depth (a planet at 1e3 wu encodes to
`log2(1001)/log2(1e15) ≈ 0.20`). This is correct for a
_background-only_ layer and would be wrong for anything that needs to
interleave in depth with scene geometry — which the galaxy never does.
It also preserves early-Z, which the fill budget needs. State this in
the module doc; it is exactly the kind of thing that looks like a bug to
the next reader.

**Corollary that shapes the whole architecture:** because the layer
must be _occluded by_ planets, it cannot be a post-process `Effect`
added after the scene (Jupiter's dark limb would glow). The half-res
result must be composited **inside** the scene pass, before opaque
geometry. §6/M1 specifies exactly that, and it happens to dodge every
log-depth hazard.

---

## 2. Industry check — what the claims actually hold up to

The design below does **not** depend on any of this being true. It is
used to sanity-check direction, not to authorise decisions —
AGENTS.md §"Gaia Sky is not a product rule" applies to SpaceEngine and
Elite Dangerous just as much. §2.5 lists what could not be established
and is therefore not leaned on.

### 2.1 SpaceEngine — the owner's claim is right, with two corrections

**Confirmed, from SpaceEngine's own dev blog and addon manual:**

- **Emission + absorption sprites, exactly as the owner described.**
  The galaxy sprite atlas has "8 tiles — 2 for emission sprites (glow)
  and 6 for absorption sprites (dust)"
  (spaceengine.org/news/blog121021). The addon manual exposes `em*`,
  `abs*`, `b*` (bulge) parameter families with independent colour,
  radial/vertical extent, size and brightness.
- **Dust is faked, and they say so.** It uses "negative brightness of
  dust sprites instead of multiplying the background color on
  absorption color" — additive emission plus _subtractive_ dust, not
  true volumetric transmittance. Directly relevant to §3.3(b).
- **The Milky Way specifically is tuned to the view from Earth.**
  "procedurally generated sprites that resemble the real dust band
  distribution as visible from Earth", and raising sprite count and
  texture resolution "improved fine details on the dust band while
  looking from inside the galaxy." **This is independently the same
  design principle §3.1 arrives at** — match the sky from home first.

**Correction 1 — the octree is over the SPRITES, not over an analytic
density field.** The manual literally exposes
`BBoxRes (8 8 8) // resolution of the octree for sprites`. Anyone
claiming SpaceEngine octree-LODs a procedural 3D density function is
speculating.

**Correction 2 — the density field is TEXTURE-driven, not analytic.**
`SpiralGalaxy` uses a "cylindrical" disc model where "the side texture
sets the density along the radius (R) and height (Z), the front texture
gives the density in the XY plane", with dust in the front texture's
alpha. That is _a texture used as a sampling PDF_ — structurally the
same move as §3.1's "importance-sample from the SVS map", arrived at
independently. Good corroboration that the approach is sound.

**The single most useful finding in this whole section — the impostor
fallback is keyed on CAMERA MOTION, not on distance.** SpaceEngine's
documented graphics settings split galaxy/nebula resolution into
"while moving" ("very large performance impact") and "while stationary"
— and in the stationary case "the object is rendered to a skybox
texture". The 2012 blog quantifies it: **125+ FPS with the skybox cache
on, 17 FPS with it off**, because transparency blending (overdraw)
dominates. A Full-HD cache costs ~337.5 MB VRAM there.

That is (a) empirical confirmation from a shipping engine that overdraw
is _the_ bottleneck for this exact workload — §5's whole thesis — and
(b) a mitigation Atlas can steal cheaply, because the Atlas camera is
stationary a great deal of the time. See §5.3 item 6.

**What Atlas should not take:** SpaceEngine is a native desktop app
with a VRAM and fill-rate budget a browser does not have. The
tiled-streaming wave already recorded this caution about Gaia Sky
(§"What does not transfer"); it applies again.

### 2.2 Elite Dangerous — the owner's claim is half right

The galaxy content is Stellar Forge (~400 bn systems, ~160 k from real
catalogues, the rest procedural). But the **in-cockpit background is a
pre-baked cubemap**: `GalaxyBackground → TextureSize` is a real
shipping graphics-config key (1024/2048/4096). That is hard evidence
for a baked texture, not a live point field.

The community-reverse-engineered mechanism — six faces rendered from
the player's actual galactic position during the FSD jump sequence,
from a region-subdivided density model, brightest-stars-first with a
display-count budget that produces visible seams at region boundaries —
is _consistent with_ the config key and the observed artefacts, but is
**not** first-party documented. Frontier's forums return 403 to
automated fetch and no dev post or GDC talk on this pipeline was found.

So: **point field → baked into a cubemap → displayed as a static
skybox, with no in-system parallax.** The galaxy map is a separate,
live renderer.

**What Atlas should take: nothing structural.** The lesson is negative
— a baked per-position backdrop with no parallax is precisely what
Atlas pulled on 2026-07-29.

### 2.3 Techniques worth stealing

- **Half-res particle rendering + upsample is a documented, standard
  technique** — NVIDIA's Particle Upsampling sample: half-resolution
  off-screen particle rendering, full-res UI, **cross-bilateral
  (depth-aware) upsample**, motivated explicitly by "lower the cost of
  the high depth complexity". A three.js maintainer confirms there is
  no single-pass shortcut: "You definitely need an additional pass"
  (`WebGLRenderTarget` + `DepthTexture`, the same mechanism three.js's
  own SSAO/SAO passes use).

  **Atlas can skip the depth-aware half.** The cross-bilateral filter
  exists to stop half-res particles bleeding across depth
  discontinuities in a scene where particles interleave with geometry.
  Atlas's haze is uniformly behind everything and is composited
  _before_ opaque geometry (§1.2), so there are no discontinuities to
  respect and a plain `LinearFilter` upsample is correct. That is a
  real simplification against the reference, not a corner cut.

- **Depth pre-pass does NOT help here.** Measured ~30 % gains in
  three.js for _opaque_ overdraw (Casey Primozic, with working pmndrs
  code), but it cannot reduce fill for large **additive**, unsorted,
  depth-write-off particles. Confirms §5's mitigation ladder is the
  right one and rules out an obvious-looking alternative.

- **Spiral structure without an arm model**, if M2 ever needs it:
  beltoforion's density-wave renderer derives arms from concentric
  Kepler ellipses whose tilt increases with semi-major axis — no
  explicit arm geometry — with de Vaucouleurs bulge + exponential disc,
  and **TypeScript source published**. The reference to use _if_ arms
  are ever rendered; §3.3(a) says M1 must not.

- **LOD pattern for M2**: Deepscatter's quadtree with on-demand tile
  loading on zoom is the published scaling answer past a resident point
  budget. Google's "Making 100,000 Stars" is the canonical tiering
  case study (real catalogue stars → sprite shells → skybox) and is
  effectively the shape Atlas already has minus the middle layer.

- **`postprocessing.Effect` signature order is
  `(inputColor, uv, outputColor)`** — swapped order gives a
  "no matching overloaded function" GLSL error and a black screen that
  no gate catches. Recorded because M2/M3 may add an Effect; M1
  deliberately does not.

- **pmndrs recursive depth-texture binding bug** (a pass reading the
  depth texture it is writing → `GL_INVALID_OPERATION` feedback loop)
  was fixed in **6.39.0**. Atlas is on **6.38.0**. Not hit today
  because nothing reads depth; relevant the moment something does.

### 2.4 `logarithmicDepthBuffer` × pmndrs — verdict: WORKS, four caveats

Verified against library source at tags, not inferred. **Atlas's exact
version pair is the good one.**

**The support landed in `postprocessing` 6.38.0** (commit `6b6a731`,
2025-09-28, "Support log and reversed depth" — touches `effect.frag`,
`ssao.frag`, `depth-comparison.frag`, `depth-mask.frag`,
`circle-of-confusion.frag`, `convolution.box.frag`, `DepthPass.js`).
Absent at 6.37.6, present at 6.38.0 and later. `readDepth()` now
inverts three.js's forward transform exactly:
`d = 2^(depth·log2(far+1)) − 1`, then the standard perspective
linearisation. Atlas ships `postprocessing@6.38.0` via
`@react-three/postprocessing@3.0.4`. ✅

> The pmndrs roadmap issue #279 ("Add support for
> `logarithmicDepthBuffer`", filed under "Into v7 (breaking)") is
> **stale** — it was backported into the v6 line. Do not be misled by
> it.

**Caveat 1 — the three.js define was RENAMED in r180.**
`USE_LOGDEPTHBUF` (r160–r179) → `USE_LOGARITHMIC_DEPTH_BUFFER` (r180+).
pmndrs's shaders test the _new_ name. So three ≤ r179 + pp ≥ 6.38.0
reads raw logarithmic depth **as if it were linear, silently, with no
error**. Atlas is on **three 0.181.2**, i.e. on the correct side. ✅
**This makes a three.js downgrade below r180 a correctness hazard, not
just a compatibility one** — worth a note wherever the version is
pinned. (Escape hatch if ever needed: `EffectPass` never sets pmndrs's
own `LOG_DEPTH` define — only `DepthOfFieldEffect` and `DepthMaskPass`
do — so a custom depth-reading Effect on an old three would need
`effectPass.fullscreenMaterial.defines.LOG_DEPTH = '1'` set by hand.)

**Caveat 2 — custom `ShaderMaterial`s get the define but NOT the
chunks.** Confirmed; matches what §1.2 already found in this repo
(`proceduralSunShaders.ts` includes them, `Starfield.tsx` does not).
`RawShaderMaterial` gets neither. §1.2's decision stands.

**Caveat 3 — log depth writes `gl_FragDepth` and therefore disables
early-Z**, confirmed by a three.js maintainer, who also notes reversed-Z
does not have this problem and that "if you have reverse-z, logarithmic
depth buffer is obsolete." This is exactly why §1.2 keeps the haze
material off the log-depth chunks.

**Caveat 4 — and this one is a named RISK for this wave.** three.js
issue **#29841**: with `logarithmicDepthBuffer: true` **and** a
post-processing `RenderPass`, **transparent objects drawn over opaque
geometry disappear** on some Intel UHD / Windows devices. Does not
reproduce rendering straight to screen. Milestoned r184, then **closed
as "not planned" — no fix.** That is precisely this wave's risk profile
(transparent additive layer + composer + log depth). **M1 must carry an
explicit Intel-integrated smoke check**; see §6/M1.

**Reversed-Z** (`WebGLRenderer({ reversedDepthBuffer: true })`, requires
`EXT_clip_control`) is strictly better where supported — preserves
early-Z, better precision, works with MSAA which log depth does not —
and pmndrs already handles it (`USE_REVERSED_DEPTH_BUFFER`). **But it
has open correctness bugs** (three.js #30808 broken since r170,
#31413 "not working correctly", shadow and VR regressions, no
WebGPURenderer support) and a naming trap
(`reverseDepthBuffer` vs `reversedDepthBuffer`). **Recommendation:
stay on `logarithmicDepthBuffer`.** Revisit when #31413 / #30808 close
— that would also retire Caveats 3 and 4 at once, which makes it worth
tracking.

### 2.5 Not established — do not lean on these

1. No first-party Frontier source on the Elite Dangerous background;
   §2.2's mechanism is community reverse-engineering corroborated by
   shipped config keys and observable artefacts.
2. No SpaceEngine statement supporting "octree LOD over a procedural
   density field"; the octree is over sprites, density comes from 2D
   textures.
3. Bland-Hawthorn & Gerhard 2016's disc scale lengths/heights (§3.2)
   were read from **secondary quotations**, consistent across multiple
   independent citers, not from the original PDF. Re-verify at
   implementation time.
4. No published three.js writeup of half-res soft particles + upsample
   _inside_ a pmndrs chain. The pieces exist separately; Atlas would be
   assembling them. (§2.3 argues Atlas needs a simpler assembly anyway.)
5. No three.js citation for nested-frustum / multi-camera depth-band
   rendering. Not used.
6. No published figure for the V < 6.5 light fraction _in the band
   specifically_ (§3.5).

**No milestone below is gated on anything in this list.**

---

## 3. Honesty — the data anchor, and what must be rejected

AGENTS.md §2: never invent detail and present it as measured. A
procedural exponential disc is a model. The following construction
makes the _appearance from Earth_ measured and confines the model to
the part that only becomes visible when you move.

### 3.1 The construction

**Ground truth:** `public/textures/4k_milkyway_2020_gal.jpg` — the
already-in-repo NASA SVS "Deep Star Maps 2020" `milkyway_2020` layer
(svs.gsfc.nasa.gov/4851), Gaia DR2-derived, galactic projection,
**starless** (SVS: the version "that omits the bright (Hipparcos and
Tycho) stars"). This is the same no-double-counting argument that
selected it originally, and it survives the pull intact.

**The sampling, in one sentence:** draw each particle's _direction_
from the map (importance-sampled by radiance × cos b), and its
_distance along that direction_ from a published disc density profile
weighted by how much of the light at that distance is actually below
the catalogue cut.

Concretely, per particle:

1. **Direction.** Invert the CDF of the map's radiance over the sphere,
   stratified over the map's own texels so the reconstruction is exact
   at map resolution and carries no clumping noise above a texel.
   Convert `(l, b)` → scene direction with
   `milkyWayOrientation.galacticToSceneDirection` (already verified).
2. **Distance.** Sample `s` with density
   `∝ ρ(R(s), z(s)) · w(s)`, where
   - `ρ(R,z) = exp(−R/R_d) · sech²(z/(2h_z))` — axisymmetric thin disc,
   - `R(s), z(s)` from the Sun at `R₀`, `z₀`,
   - `w(s)` is the **completeness weight** below.
3. **Colour.** From the map texel. Converted to linear once, then
   normalised so brightness is carried by flux and never by colour —
   the same discipline `starLinearRgbFromBv` enforces
   (`starfieldShaderMath.ts:259-268`).
4. **Flux.** `total_map_flux / N`, in the Vega-normalised
   `10^(-0.4·m)` units the star shader already uses. §4.

**The completeness weight is the elegant part and it is physics, not
taste.** The map contains only light from stars fainter than the
Hipparcos/Tycho cut (V ≈ 11). A star of apparent `V_cut` at distance
`d` has `M_cut(d) = V_cut − 5·log₁₀(d/10 pc)`. So the fraction of the
stellar luminosity at distance `d` that is _eligible_ to be in the map
is

```
w(d) = ∫_{M > M_cut(d)} φ(M)·L(M) dM  /  ∫ φ(M)·L(M) dM
```

for a published stellar luminosity function `φ`. Near the Sun `M_cut`
is ~6, so only faint dwarfs qualify and `w` is small; at 8 kpc
`M_cut ≈ −3.5` and `w → 1`. **The near field suppresses itself.** No
arbitrary inner cutoff, no artistic taper, and no hole in the sky when
you fly — and it is the same "don't double-count what the catalogue
already draws" argument, applied continuously instead of as a hard
edge.

**Why this is honest:** because the directions were drawn from the map,
the integrated radiance from the Sun's position _reproduces the map by
construction_, to Monte-Carlo noise. It is not "a procedural galaxy
that hopefully resembles ours" — it is the measured all-sky map,
deprojected by a published disc geometry. The disc model decides only
where along each sight-line the light sits, i.e. only the parallax.

### 3.2 Cited structural parameters

Real, published values with their uncertainties. Every one goes in a
`GALAXY_STRUCTURE` constants block with the citation inline, the same
way `zodiacalLightLut.ts` carries Leinert's table and
`milkyWayOrientation.ts` carries the NGP angles.

| Symbol                       | Adopted                               | Source                                       |
| ---------------------------- | ------------------------------------- | -------------------------------------------- |
| `R₀` (Sun → GC)              | 8.2 ± 0.1 kpc                         | Bland-Hawthorn & Gerhard 2016, ARA&A 54, 529 |
| `R₀` (independent, precise)  | 8178 ± 13(stat) ± 22(sys) pc          | GRAVITY Collab. 2019 (S2 orbit)              |
| `R₀` (revised)               | 8277 ± 9 ± 33 pc                      | GRAVITY Collab. 2021                         |
| `z₀` (Sun above plane)       | 25 ± 5 pc                             | BH&G 2016                                    |
| `R_d` thin disc scale length | 2.6 ± 0.5 kpc                         | BH&G 2016                                    |
| `h_z` thin disc scale height | ≈ 300 pc (±~20 %)                     | BH&G 2016                                    |
| Thick disc                   | `R_d ≈ 2.0 ± 0.2` kpc, `h_z ≈ 900` pc | BH&G 2016                                    |
| Bar angle to Sun–GC line     | 27° ± 2°                              | BH&G 2016                                    |
| Box/peanut bulge `h_z`       | ≈ 180 pc                              | BH&G 2016                                    |
| Stellar mass `M★`            | 5 ± 1 × 10¹⁰ M☉                       | BH&G 2016                                    |

**The uncertainty is the honest headline and it must be disclosed, not
buried in a `±`.** BH&G themselves flag the spread (scale length 2–4
kpc, scale height 150–375 pc) and independent methods disagree well
outside the quoted errors:

| Method                                      | `R_d`                                                | `h_z`                   |
| ------------------------------------------- | ---------------------------------------------------- | ----------------------- |
| BH&G 2016 (review-adopted)                  | 2.6 ± 0.5 kpc                                        | 300 pc                  |
| Natale et al. 2022 (optical RT)             | 3.10 kpc                                             | 300 pc                  |
| Mosenkov et al. 2021 (NIR)                  | 3.02–3.19 kpc                                        | 450–480 pc              |
| GaiaUnlimited 2025 (red clump, 2-component) | 4.24 ± 0.32 (flared, 34 % mass) / 2.66 ± 0.11 (66 %) | 180 ± 10 / 480 ± 110 pc |

So the disc scale length is uncertain at the **±30–50 %** level
depending on tracer and method. Adopt BH&G's review values, label them
as _review-adopted with a stated ±_, never as measured constants — and
note in the Credits that the deprojection's radial stratification
inherits that uncertainty. **Numbers must be re-verified against the
primary papers at implementation time** (§2.5 item 3).

### 3.3 What must be REJECTED from the owner's plan, and why

**(a) Spiral-arm modulation in the density field — reject for M1, and
the evidence for rejecting it is stronger than expected.**
The arms are already in the data: the map carries their projected
signature from the Sun, so importance-sampling reproduces them for
free. Adding an analytic arm term injects un-measured structure on top
of measured structure and double-counts it.

And the analytic term would be a fiction. Reid et al. 2019 (BeSSeL
maser parallaxes) had to introduce **kinks** — the pitch angle changes
with azimuth _within a single arm_. The **Sagittarius Arm alone runs
from ~1° in most of Quadrant 1 to ~17° in its Quadrant 4 extension.**
Perseus is 8.7°; the Local (Orion) Arm is 10.1°–11.6° and is an
"orphan segment", not a major arm at all. Vallée 2015's widely quoted
**13.1° is a fitted average, not a physical constant.** Rendering four
clean logarithmic spirals at 13° would be inventing detail and
presenting it as measured — the exact thing AGENTS.md §2 forbids.

Only a deep fly-out (M2) could ever require arms, and then the label
must say "illustrative" in the **UI**, not just in a comment. If it
happens, use beltoforion's density-wave construction (§2.3) so the arms
emerge from a stated orbital model rather than from painted geometry.

**(b) A separate absorbing dust-lane particle layer — reject as
specified; it double-counts extinction.** The SVS map is an _observed_
sky: extinction is already baked into it. Sight-lines through the
Coalsack are dark in the map _because_ of dust, so the deprojection
already places less emission there. Adding absorbing particles in front
of that makes the dark lanes doubly dark **from Earth** — i.e. it
breaks the one property that made the whole design honest.

The corrected version (M3) requires inverting the extinction first:
recover unextincted emission `j(s)` from `∫ j(s)·e^(−τ(s)) ds`, which
needs a **3D dust map**. Real ones exist and are citable — the
Gaia-based 3D dust maps (e.g. Edenhofer et al. 2023, ~1.25 kpc reach;
Green et al. Bayestar19; Lallement et al.) — but they reach ~1 kpc, not
25 kpc, and they are a substantial new data dependency. So M2 is
honestly scoped as **"dust within ~1 kpc, from a published 3D map, with
the emission layer re-derived consistently"**, and anything beyond
1 kpc keeps extinction baked in and says so. This makes the dust
milestone much larger than the owner's plan assumes; it is demoted
below LOD accordingly (it is **M3**, not M2).

SpaceEngine corroborates the difficulty rather than the ambition: even
there, dust is "negative brightness of dust sprites instead of
multiplying the background color on absorption color" (§2.1) — an
approximation they name as one. Atlas may reach the same place, but it
must arrive there by disclosure, not by accident.

**(c) "20–60k particles" as a budget — reject as the wrong
parameter.** See §5. The cost is `Σ σ_ang²`.

**(d) "Generate procedural glow on demand around the camera" —
reject.** On-demand generation around a moving camera is what produces
a layer that changes when you move, which is the swimming artefact the
owner already dislikes. The particle set is **static, baked once,
identical for every observer**, and streamed by chunk (M2) — never
regenerated. Determinism is also what makes the headless reconstruction
gate (§6/M1) possible at all.

### 3.4 The disclosure that must ship with M1

Verbatim-ish, for `CreditsModal.tsx`:

- **Measured:** sky brightness and colour in every direction, from NASA
  SVS "Deep Star Maps 2020" (`milkyway_2020` layer, Gaia DR2-derived,
  excluding Hipparcos/Tycho stars so it does not double-count the star
  catalogue Atlas draws separately).
- **Modelled:** the distribution of that light _along_ each sight-line,
  from an axisymmetric thin-disc profile with published `R_d`, `h_z`,
  `R₀`, `z₀` (cited), weighted by catalogue completeness.
- **Consequence, stated plainly:** the view from the Solar System
  reproduces the measured sky. Views from far outside it are a model —
  an axisymmetric disc cannot reproduce a non-axisymmetric sky, so the
  per-sight-line normalisation absorbs the difference, and structure is
  correct in projection from home and approximate everywhere else.
- **Also stated:** interstellar extinction is baked into the source map
  rather than modelled in 3D, so the disc mid-plane is
  under-represented when viewed from outside (M1 only).
- **Known under-count, now quantified:** SVS removed Tycho-2 stars
  (V ≲ 11) while HYG renders far fewer, so light from stars between
  HYG's practical limit and V ≈ 11 is drawn by neither layer. This
  under-states, never over-states — the same direction as the zodiacal
  blank-cell handling. §3.5 bounds the size of the gap.
- **Non-measured choices, each named with its value:** particle count,
  particle angular radius, the completeness `V_cut`, the luminosity
  function used for `w(d)`, and any display gain (§4).

### 3.5 How much light is actually ours to draw

This decides whether the whole no-double-counting argument holds, and
there are real numbers for it.

- **Roughly half of all integrated optical starlight is below the
  naked-eye cut.** ~9 000 stars brighter than V = 6.5 combine to
  magnitude ≈ −5; total visual starlight is ≈ −5.85 (Roach & Gordon,
  _The Light of the Night Sky_). That is a 0.85 mag difference ⇒
  **naked-eye ≈ 46 %, fainter ≈ 54 %**. (Arithmetic across two sources
  that may not share a basis — order of magnitude, not precise.) The
  classic statement of the same fact: extinguishing every naked-eye
  star would leave "nearly the same amount of starlight".
- **In the band the faint fraction is higher**, because that is where
  the faint-star column is deepest.
- **But it is not an infinite tail.** GAMBONS (Gaia DR2 + Hipparcos
  integrated-starlight model, arXiv:2101.01500) finds Hipparcos sources
  are **≈ 20 % of total integrated starlight**, and extending below
  Gaia's G = 20 limit to G = 27.5 adds **> 3 % only at a few points on
  the galactic plane and near the centre.** The light lives in the
  ~6.5 < G < 20 range.

**Consequence for Atlas:** the diffuse layer is carrying roughly half
the sky's starlight and most of the band's — it is not a garnish, it is
the larger half of the signal. And the HYG-to-Tycho gap (§3.4) is real
but bounded well under the ~20 % Hipparcos share, so the composite
under-states by a modest, disclosable amount rather than by a factor.

**This also yields a hard calibration anchor** — see §4.3.

---

## 4. Photometry — one sky, one constant (the headline finding)

### 4.1 The defect in what was pulled

`zodiacalLightLut.ts` derived its display constant as

```
k_zodiacal = √(0.165 × 1.0) / √(9000 × 140) = 3.618734e-4
```

— geometric mean of _its own_ range into the geometric mean of the
display window `[STAR_DISPLAY_BLACK_POINT, bloom threshold]`.

`milkyWayOrientation.ts:506` derived its own, the same way, from _its
own_ range:

```
MILKY_WAY_BRIGHTNESS_MULTIPLIER = √(0.165 × 1.0) / √(peakTex × edgeTex) = 3.20137
```

**Two layers each independently normalised to the middle of the same
window are guaranteed to be wrong relative to each other**, because
neither construction contains any information about the other. This is
a structural defect, not a tuning miss.

Quantified. Converting the panorama's shipped calibration back into
S10 units through the zodiacal constant, against the published values
in §4.3:

|               | shipped linear             | implied S10 | published S10 | error               |
| ------------- | -------------------------- | ----------- | ------------- | ------------------- |
| MW band peak  | 1.020 (= 6.2× black point) | ≈ 2 820     | ≈ 450         | **6.3× too bright** |
| MW band, ±20° | 0.162 (≈ 1.0× black point) | ≈ 450       | ≈ 100–150     | ~3–4× too bright    |

And the comparison the pull record made — "subordinate to the zodiacal
band" — was made against the zodiacal _peak_ (9000 S10, within 26° of
the Sun). Over most of the sky, where the Milky Way band actually is,
zodiacal light sits at ~202 S10 = **0.44× the black point, i.e. below
threshold**. So the panorama rendered roughly **14× brighter than the
zodiacal light across most of the sky**, when in reality the band is
only ~2.2× zodiacal-at-quadrature. A blaring band over an invisible one
is a complete, arithmetic explanation of "confuso e não integrado", and
it is a defect of the _calibration construction_, not of the asset.

### 4.2 The fix — and it is smaller than it looks

Promote `ZODIACAL_S10_TO_LINEAR` to a **layer-neutral
`SKY_S10_TO_LINEAR`**, in one module, imported by every diffuse sky
layer. Every diffuse layer then emits `brightness_S10 ×
SKY_S10_TO_LINEAR` and nothing else. One radiometric scale, one place,
one disclosure. No layer may derive its own.

**Cross-check, and it validates the existing constant.** There is a
first-principles bridge from S10 to linear scene radiance that uses
_only_ things already in the repo:

- 1 S10 = one 10th-mag star per deg² = `1e-4 / 3.0462e-4 = 0.3283`
  Vega-normalised flux per steradian.
- `starExposure() = (0.165 / gaussianPeak(0.62)) × 10^(0.4×8)`
  = `0.39851 × 1584.89` = **631.6**
  (`starfieldShaderMath.ts:473-478`).
- Pixel solid angle at 45° FOV, 1080p: `k = 1.207·H = 1303.6 px/rad`,
  `Ω_px = 1/k² = 5.885e-7 sr`.
- ⇒ `1 S10 → 0.3283 × 5.885e-7 × 631.6 = 1.2203e-4` linear.

Against the shipped `3.618734e-4`, that is a **factor of 2.97**. Two
completely independent derivations — one from a display-window
geometric mean, one from the star renderer's own Pogson exposure —
landing within 3× is strong evidence both are roughly right, and it
gives the constant a physical meaning it did not have before. The
residual 3× is a legitimate, disclosable _display gain_, not an error;
name it as such rather than folding it into a mystery number.

### 4.3 What the Milky Way should actually be — with citations

**The unit system already in the repo turns out to be exactly the right
one, and the same paper supplies both layers.** Leinert et al. 1998
(`zodiacalLightLut.ts` already cites it for Table 16) also defines S10
and, in **Table 34**, tabulates _integrated starlight with stars
brighter than m_V = 6.5 excluded_ — which is very nearly the quantity
this layer represents. One paper, two layers, one unit system.

Cited anchors (Leinert et al. 1998, V band):

| Quantity                                    | Value                           | Source                |
| ------------------------------------------- | ------------------------------- | --------------------- |
| 1 S10                                       | 27.78 mag/arcsec²               | Leinert 1998 Table 2  |
| 1 S10                                       | 1.18e-8 W m⁻² sr⁻¹ µm⁻¹         | Leinert 1998 Table 2  |
| 22 mag/arcsec²                              | 205 S10                         | Leinert 1998 Table 2  |
| ISL at North Galactic Pole (V<6.5 excluded) | 27–31 S10                       | Leinert 1998 Table 34 |
| ISL at South Galactic Pole                  | 26–36 S10                       | Leinert 1998 Table 34 |
| Brightest Milky Way band regions            | ≈ 450 S10 (≈ 21.15 mag/arcsec²) | Leinert 1998          |

Band-to-pole contrast is therefore **≈ 15×**, which is the number that
actually shapes the render.

At `SKY_S10_TO_LINEAR = 3.618734e-4`:

| Feature                           | S10       | linear      | × black point |
| --------------------------------- | --------- | ----------- | ------------- |
| MW band, brightest regions        | ≈ 450     | 0.163       | **0.99**      |
| MW band, ±20°                     | ≈ 100–150 | 0.036–0.054 | 0.22–0.33     |
| MW at the galactic poles          | ≈ 29      | 0.0105      | 0.064         |
| Zodiacal, quadrature (λ−λ☉ = 90°) | 202       | 0.073       | 0.44          |
| Zodiacal, peak (λ−λ☉ = 15°)       | 9000      | 3.257       | 19.7          |

**This is a good outcome, and better than expected.** Physically
calibrated, the band's brightest regions land at **0.99× the display
black point** — right at the visibility threshold, so the band appears
the moment eye adaptation lifts exposure at all, and the genuinely
bright knots (Carina) sit above it immediately. The band is 2.2×
zodiacal-at-quadrature, exactly as in reality. Nothing needs to be
invented to make it work.

**The residual factor of 3 from §4.2 is the display gain, and naming
it is the honest move.** The star-photometry bridge gives 1.2203e-4;
the shipped constant is 3.618734e-4. Under the _pure physical_ value
the band peak would sit at 0.33× the black point — invisible. So the
constant already in the tree is `physical × ≈ 3 display gain`, and it
is the display gain that lands the band at the threshold. Split it into
two named constants and disclose the second: _"diffuse sky layers are
rendered at ≈ 3× their true surface brightness so they are visible on a
typical display; their brightness relative to one another is
physical."_ Same class of disclosure as the "not to scale" toggle.

**A per-layer fudge is not available** — that is exactly the defect
§4.1 identifies. If the owner wants the sky brighter, the gain moves
and **every** diffuse layer moves with it.

> The ≈ 450 S10 band figure is reported in the literature partly in the
> U band, and other sources give the band as bright as 19.6 mag/arcsec²
> (≈ 1800 S10, US National Park Service) — a ~4× spread that plausibly
> reflects band differences, whether resolved stars are included, and
> how small a patch is sampled. **Cite the value actually used and
> state the spread.** The §4.1 discrepancy survives it: even at the
> brightest end of the range the pulled panorama was over-bright at the
> ±20° edge, and its _shape_ — a flat multiplier with no pole/band
> contrast anchor — was wrong regardless.

### 4.4 Making a haze particle _be_ a star, photometrically

This is the mechanism that makes "integrated with the starfield" a
structural property rather than a tuning goal. A haze particle is an
unresolved star cluster, so give it the star's own machinery:

- Per-instance `a_lum = 10^(−0.4·M)` and a physical radius `R_p` (pc).
- Vertex, **the identical line** to `Starfield.tsx:170`:
  `flux = a_lum * 100.0 / (distPc * distPc)`.
- `fluxScreen = flux * u_exposure` with the **same** `starExposure()`.
- Angular radius `θ = R_p / distPc`; screen `σ_ang_px = θ · pixelsPerRadian`
  (`computePixelsPerRadian` already exists,
  `starfieldShaderMath.ts:822`).
- **Convolve with the display PSF**: `σ_eff = √(σ_ang_px² + STAR_PSF_SIGMA_PX²)`.
- Fragment: the **same** erf-integrated, flux-conserving splat, with
  `σ_eff` instead of `STAR_PSF_SIGMA_PX`, and the same
  `starQuadEdgeWindow`.

Three properties fall out for free, and they are the whole argument:

1. **Surface brightness is distance-invariant.** `flux ∝ 1/d²` and
   `area ∝ σ² ∝ 1/d²`, so peak radiance is constant with distance —
   which is the correct physics for an optically-thin extended source
   and is what makes flying _through_ the haze look right instead of
   like a zoom.
2. **It degrades continuously to the star case.** As `σ_ang_px → 0`,
   `σ_eff → STAR_PSF_SIGMA_PX` and the particle becomes a point source
   with correct `1/d²` flux. Flying out of the galaxy condenses the
   haze into a point cloud **with no LOD switch and no correctness
   cliff**. LOD (M2) becomes a pure performance concern.
3. **No new photometric constants.** `starExposure()`,
   `STAR_PSF_SIGMA_PX`, `CORE_TRUNCATION_NORMALISATION`,
   `STAR_QUAD_EDGE_WINDOW`, `erfApprox` are all reused verbatim. The
   only new number is the total flux normalisation, and §4.2 pins that
   to `SKY_S10_TO_LINEAR`.

Do **not** give haze particles the `r⁻³` glare lobe or the diffraction
spikes — those are observer/instrument artefacts of _point_ sources
(`starfieldShaderMath.ts:539-570`, and the spike profile is explicitly
disclosed as an instrument artefact). An extended source does not
produce them.

---

## 5. Performance — the real cost knob, with the arithmetic

### 5.1 Fill cost depends on `Σ σ_ang²`, not on N

Let each particle have angular radius `σ_ang` and let `κ_band` be the
mean number of overlapping particles over the band. Sky = 4π sr; the
band (roughly 360° × 40°) is `f ≈ 0.15` of it and holds ~85 % of the
particles:

```
κ_band ≈ 0.85·N·π·σ_ang² / (4π·0.15) ≈ 1.42·N·σ_ang²
screen overdraw OD ≈ κ_band × 1.27      (square quad vs inscribed disc)
```

For a smooth haze, `κ_band ≈ 12` ⇒ `N·σ_ang² ≈ 8.45` ⇒ `OD ≈ 15.2`,
**for every one of these:**

| `σ_ang` | N       |
| ------- | ------- |
| 2°      | 6 900   |
| 1°      | 27 700  |
| 0.5°    | 110 900 |

Same fill cost in all three rows. `σ_ang` trades vertex cost and
download size against detail; it does not trade against fill. **The
owner's "20–60k particles" therefore does not constrain anything** —
`κ_band` does, and nobody has picked it yet.

### 5.2 The fill budget, per tier

Drawing buffers for a 1920×1080 CSS window at each tier's `dprMax`:

| Tier        | dprMax | Drawing buffer | Mpx                   |
| ----------- | ------ | -------------- | --------------------- |
| ultra       | 2.0    | 3840×2160      | 8.29                  |
| high        | 1.75   | 3360×1890      | 6.35                  |
| balanced    | 1.5    | 2880×1620      | 4.67                  |
| constrained | 1.0    | 1920×1080      | 2.07 (does not mount) |

At `OD = 15.2`, fragments per frame and the throughput needed to fit a
**1.5 ms** slice of a 16.67 ms frame:

| Tier     | Res               | Mfrag / frame | Gfrag/s needed | Verdict             |
| -------- | ----------------- | ------------- | -------------- | ------------------- |
| ultra    | full              | 126           | 84             | ✗ no consumer GPU   |
| ultra    | half (1920×1080)  | 31.5          | 21             | ~ mid discrete only |
| ultra    | quarter (960×540) | 7.9           | 5.3            | ✓ nearly everywhere |
| high     | half              | 24            | 16             | ~                   |
| high     | quarter           | 6.0           | 4.0            | ✓                   |
| balanced | quarter           | 4.4           | 2.9            | ✓ integrated-safe   |

Reference blended-fp16 fill throughput — **estimates, and the owner's
measurement supersedes them** (§8): discrete mid-range (RTX 3060 /
RX 6600 class) ~25–40 Gfrag/s; entry/laptop dGPU ~10–15; integrated
(Iris Xe, Radeon 780M) ~3–6. An fp16 render target roughly halves
ROP-bound throughput versus RGBA8.

**Conclusion: the offscreen reduced-resolution pass is mandatory and
belongs in M1.** Quarter-res is the safe default; ultra may use half.
The haze is a genuinely low-frequency signal, so reduced-resolution
sampling with `LinearFilter` upsampling costs almost nothing visually —
this is not a quality sacrifice, it is matching the sample rate to the
signal.

RT cost is negligible: half-res `1920×1080` RGBA16F = 16.6 MB,
quarter-res `960×540` = 4.15 MB, against the tiled-streaming wave's
measured ultra budget of 512 MB.

### 5.3 The mitigation ladder (all six, in order)

1. **Reduced-resolution offscreen RT + upsample composite** — 4× (half)
   or 16× (quarter) budget. M1.
2. **Completeness weight `w(d)`** (§3.1) — suppresses the near field
   where particles would be angularly huge, _as a side effect of the
   honesty model_. Free. M1.
3. **`σ_eff` convolution** (§4.4) — distant particles collapse to
   ~1 px, which is where most of them are. Free. M1.
4. **Per-particle screen-radius ceiling**, inverted into a flux ceiling
   exactly as `maxFluxScreenForViewport` already does for stars
   (`starfieldShaderMath.ts:635-647`). Reuse, do not re-derive. M1.
5. **Chunked geometry with `frustumCulled: true`** — a 45° FOV sees
   ~7 % of the sky; this cuts vertex/draw cost hard (not fill, which is
   already frustum-bounded) and is the same chunking floating origin
   needs. M2.
6. **Re-render the haze RT only when the camera has moved enough to
   change the perspective** — steal SpaceEngine's documented
   stationary-camera cache (§2.1), where it is worth **125 FPS vs 17
   FPS** on the same scene. Atlas's camera is stationary a large
   fraction of the time (reading labels, paused sim, overlay open), and
   the haze is at kpc distance so the motion threshold can be
   generous — a rotation of a fraction of a pixel or a translation of
   a fraction of a parsec changes nothing. Costs one extra RT to hold
   the cached frame (4–17 MB, §5.2) and a cheap per-frame test against
   the previous view matrix. **This is the single highest-leverage
   optimisation available and it is nearly free.** M2 — but design the
   M1 pass so the cache can drop in without restructuring.

Plus `κ_band` scaled per tier: ultra 12, high 9, balanced 6.

### 5.4 Download and VRAM

Per-particle: `pos` 3×f32 (12) + `a_lum` f32 (4) + `R_p` f32 (4) +
colour index u8 (1) = **21 bytes**. 27 700 particles = 582 KB raw,
~400 KB gzipped — the same order as `hyg-v1-medium.bin` (390 KB) and
loaded the same way (deferred, low priority, tiered `.bin` + `.bin.gz`).
Instance count is _below_ the starfield's 109 400, so the vertex side is
cheaper than what already ships.

---

## 6. Milestones

Each is independently shippable and independently revertible. Each has
its own gate. **M1 alone replaces the pulled skybox honestly** — the
rest are additive.

### M1 — Camera-relative glow-disc layer, calibrated to the SVS map

**Size:** large (the wave's centre of gravity — baker + renderer +
offscreen composite + calibration). Everything else is small by
comparison.

**Ships:**

- `scripts/build-galaxy-haze.js` — mirrors `scripts/build-hyg-binary.js`
  exactly. Reads `public/textures/4k_milkyway_2020_gal.jpg`, does the
  §3.1 sampling, emits
  `public/data/galaxy-haze/haze-v1-{low,medium,high,full}.bin(.gz)`.
  Deterministic (seeded), so the output is reproducible and testable.
- `src/lib/galaxyHaze.ts` — the model constants (§3.2) with citations,
  `w(d)`, the disc profile, the loader, and the **pure-TS mirror of the
  vertex math**, matching `starfieldShaderMath.ts`'s discipline.
- `src/components/canvas/scene/GalaxyHaze.tsx` — the renderer.
  Instanced quads, the §4.4 shader (a variant of `Starfield.tsx`'s, not
  a new photometric system), rendered into a reduced-resolution
  `HalfFloatType` RT by a `useFrame` at a priority that runs after the
  camera integration and before the composer's priority 1.
- The composite: a fullscreen quad **inside the scene**, `renderOrder`
  −200 (behind zodiacal's −100), `depthTest: false`,
  `depthWrite: false`, additive, sampling the RT with `LinearFilter`.
  Opaque planets then draw over it normally. §1.2 explains why this and
  not a pmndrs `Effect`.
- `SKY_S10_TO_LINEAR` promoted out of `zodiacalLightLut.ts` and shared
  (§4.2). `ZodiacalLightSkybox` re-points at it — **byte-identical
  behaviour**, it is a rename plus an import.
- `CreditsModal.tsx` disclosure per §3.4.

**Explicitly NOT in M1:** dust absorption, spiral-arm terms, octree,
floating origin, nebula sprites, any runtime use of the JPEG.

**Photometric calibration:** §4. One constant, shared, cross-checked
against `starExposure()` (§4.2), with the display gain named separately
from the physical scale.

**Performance budget:** §5.2. Quarter-res on high/balanced, half-res on
ultra, `κ_band` 12/9/6. Does not mount on `constrained`.

**Gates — headless-pinnable (pure TS, no GPU):**

1. **Reconstruction.** Integrate the baked particle flux into HEALPix-ish
   solid-angle bins as seen from `(0,0,0)`; compare against the SVS
   map's own binned radiance. Assert relative error under a stated
   tolerance for bins above a stated particle count. _This is the gate
   that proves the layer reproduces the measured sky, and it is the
   single most valuable test in the wave._
2. **No solar-system parallax.** Same integral from 50 AU — identical
   to < 1e-6.
3. **Real interstellar parallax.** Same integral from 100 pc toward
   `l = 90°` — measurably different, and in the correct direction.
4. **One photometric system.** `SKY_S10_TO_LINEAR` is imported, not
   duplicated, and the physical scale is separated from the named
   display gain (§4.3).
   4b. **Absolute photometric anchor — the strongest honesty gate
   available.** Integrate the baked layer's surface brightness at the
   **North Galactic Pole** and assert it is **at or below Leinert 1998
   Table 34's 27–31 S10** for integrated starlight with V < 6.5
   excluded — _at or below_, because our source map also excludes the
   Tycho range, so the layer must under-state that anchor by a bounded
   amount (§3.5). Same for the South pole (26–36 S10) and for the
   ≈ 15× band-to-pole contrast. This anchors the layer against a
   published measurement in the same units and the same paper the
   zodiacal layer already cites — not against its own dynamic range,
   which is the §4.1 defect.
5. **Radial distribution.** Sampled `s` along a test sight-line matches
   the `ρ·w` CDF (moment or KS check).
6. **Orientation.** Highest particle density lies along
   `galacticToSceneDirection(0, 0)` — reuses the already-verified
   transform, so this pins the _consumer_, not the math.
7. **Budget.** `Σ σ_ang²`, instance count, and buffer bytes all under
   the per-tier ceilings.
8. **Anti-regression for §0.1.** Pin that a HYG flight's per-frame
   stride (`MAX_VELOCITY_FACTOR / 60 × distance`) exceeds any fixed
   shell radius for targets beyond ~10 pc — a test that encodes _why_
   camera-attached shell geometry is banned, so nobody reintroduces one.

**Gates — e2e, and a finding that unblocks them.** Previous sessions
concluded that headless Playwright "structurally cannot" exercise
composer-tier layers because SwiftShader forces `constrained`. **That is
wrong.** `resolveActivePreset` (`graphics/resolver.ts:418-426`) consults
`autoResolvePreset(signals)` — and therefore
`resolveGlTierCeiling`'s software-renderer clamp — **only when
`state.graphicsAutoMode` is true.** Two calls through the already-exposed
`window.__ATLAS_TEST_STORE__`:

```js
store.getState().setGraphicsAutoMode(false);
store.getState().setGraphicsPreset("ultra");
```

force the ultra preset regardless of the GPU, and the `EffectComposer`,
`Bloom`, `ToneMapping`, `ZodiacalLightSkybox` and this layer all mount
under headless Chromium. Slow, but it renders and it pixel-diffs. **This
also unblocks the two items the starfield wave declared unverifiable**
(the zodiacal eye check and the 1d eye-adaptation check) and should be
reported to that line.

**Mandatory device smoke check — three.js #29841 (§2.4 Caveat 4).**
`logarithmicDepthBuffer: true` + a post-processing `RenderPass` makes
**transparent objects over opaque geometry vanish on some Intel UHD /
Windows devices**, upstream-closed as "not planned". That is this
layer's exact profile. Verify on Intel integrated graphics before
declaring M1 done. If it reproduces, the fallbacks in order are:
(i) composite the haze RT with `depthTest: false` _before_ anything
opaque draws — which M1's design already does, and which may sidestep
the bug entirely since the failing case is transparency drawn _over_
opaque; (ii) render the haze in a separate scene/camera pass with depth
off; (iii) tier-gate the layer off on affected devices. Record the
result either way — an upstream bug closed without a fix is exactly the
kind of thing the next session must not have to rediscover.

**Owed to the owner's eye (cannot be pinned):** whether it reads as the
Milky Way; whether the parallax during a fly-to reads as depth or as
swimming; the Monte-Carlo grain at the chosen `κ_band`; and the
frame-time delta per tier on his GPU. Ship a Display-panel toggle for
the layer — the `lightGlowEnabled` precedent (`resolver.ts`) — so the
measurement is something he can take rather than something we guess.

**Exit criteria:** the band is visible from the Solar System in the
right place relative to the ecliptic and the zodiacal band; it
parallaxes correctly on a star fly-by; it does not disappear at any
point of any flight; it sits in the same exposure response as
everything else; and gate 1 passes.

### M2 — LOD / chunking / floating origin for deep fly-outs

**Size:** medium. **Promoted above dust** because dust turned out to be
much harder than the owner's plan assumed (§3.3b) and because this is
what makes flying out of the galaxy possible at all.

- Chunk the baked set spatially (octree or a simple radial+angular
  grid). Each chunk is its own `InstancedBufferGeometry` with positions
  relative to the chunk centre, and the centre in `object.position` —
  **floating origin for free, no shader change** (§1.1).
- `frustumCulled: true` per chunk.
- Distance-based chunk merging: far chunks collapse to fewer, brighter
  particles conserving total flux. Correctness is already guaranteed by
  §4.4's continuous degradation, so this is purely a budget lever.
  Deepscatter's quadtree-with-on-demand-tiles (§2.3) is the published
  pattern if the resident budget is ever exceeded.
- **The stationary-camera RT cache** (§5.3 item 6, SpaceEngine's
  125-vs-17-FPS trick). Cheapest item in the milestone and probably the
  largest single win; it belongs here only because M1 should not carry
  a cache-invalidation bug on its first eye pass.

**Gates:** total flux conserved across every LOD level to a stated
tolerance (headless); chunk-boundary popping below a stated threshold
in a pixel-diff at a fixed fly-out pose; no jitter at 25 kpc from the
origin (the float64-composed matrix claim, verified rather than
assumed); the cache never shows a stale frame during a HYG flight —
which is the §0.1 failure mode wearing a different hat, so pin it.

### M3 — Dust, honestly, and only where the data reaches

**Size:** large, and larger than the owner's plan assumes. **Do not
start it before M1 has an eye pass.**

Per §3.3b: needs a published 3D dust map (Edenhofer et al. 2023 or
Bayestar19), reach ~1 kpc, and the M1 emission layer re-derived so that
`emission × extinction` still reproduces the SVS map from the Sun.
Beyond the dust map's reach, extinction stays baked in and the Credits
entry says so.

**Gate:** the M1 reconstruction gate must still pass _after_ the dust
layer is added — i.e. adding dust must not change the view from Earth.
That single assertion is what keeps this honest, and it is why the
naive version is rejected.

### M4 — Nebulae as points of interest

**Size:** small. A curated table of real objects (Orion, Carina,
Lagoon, …) at published distances, angular sizes and integrated
magnitudes, with citations — data, not invention.

**The trap, stated up front:** these objects are _already in the SVS
map_ (`milkyWayOrientation.ts` records Carina measured at 0.447 linear).
Adding them again double-counts. The correct job for M4 is therefore not
"add nebulae" but "let the brightest few **resolve** into their own
sprite at close range, with the haze locally suppressed" — a crossfade,
reusing the `a_fadeAlpha` / `a_focusMask` pattern `HygStellarMesh`
already implements for the sprite↔mesh handoff.

---

## 7. Parked assets — disposition

**`public/textures/4k_milkyway_2020_gal.jpg` (3.6 MB) — KEEP, and
promote it.** It stops being a runtime texture and becomes the
**build-time ground truth** for `scripts/build-galaxy-haze.js`, exactly
as `hyg-v1-*.bin` is generated from a downloaded catalogue. This is a
better role than it had: no runtime VRAM, no 3.75× magnification
artefact, and it becomes the thing the reconstruction gate (§6/M1 gate

1. asserts against. Its measured anchors
   (`MILKY_WAY_BAND_PEAK_LINEAR`, `MILKY_WAY_BAND_EDGE_LINEAR`,
   `MILKY_WAY_TEXTURE_CEILING`) stay as the calibration bridge, now
   cross-checked against §4.2 rather than trusted alone.

**`src/lib/milkyWayOrientation.ts` — KEEP, reuse wholesale, trim one
export.**

- `galacticToSceneDirection` — the baker's particle placement. Used.
- `galacticLonLatToEquirectUv` — the baker's map lookup, including the
  empirically-determined "row 0 = south galactic pole" polarity that
  cost real work to establish. Used.
- `GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR`, the Gram-Schmidt
  construction, and its 16 tests — unchanged, still the verified
  reference implementation, still the basis for the separate
  `gridOrientation.ts` audit.
- `MILKY_WAY_ORIENTATION_GLSL` — **becomes unused** at M1 close (the
  volumetric path samples no equirect at runtime). Delete it then
  unless M2's far-distance impostor wants it. Per AGENTS.md §12, do not
  leave it as a shim.
- `MILKY_WAY_BRIGHTNESS_MULTIPLIER` — **must not survive as-is.** It is
  the constant §4.1 shows is ~8× off. Either delete it with the
  panorama path, or keep it purely as the recorded derivation of the
  _texture-space_ anchors with a doc note that the display scale now
  comes from `SKY_S10_TO_LINEAR`.

**File-header note:** the module doc's "pulled, kept for a future
retry" paragraph should point at _this_ file once M1 lands.

**Spin-off (not this wave):** the `ZodiacalLightSkybox` camera-outruns-
its-own-shell defect from §0.1. It ships today.

---

## 8. Open questions — only the owner can answer these

1. **Frame-time floor on his GPU.** §5.2's throughput figures are
   estimates. What actually matters is the measured haze-on / haze-off
   frame-time delta at ultra on his machine. The Display-panel toggle in
   M1 is the instrument; the number decides `κ_band` and whether ultra
   gets half- or quarter-res. (Same shape as the still-open LightGlow
   audit, and the same reason it is owed to him rather than guessed.)
2. **Visibility vs. truth — softer than feared, but still his call.**
   §4.3: physically calibrated (with the ≈3× display gain already
   implicit in the shipped constant), the band's brightest regions land
   at **0.99× the display black point** — right at the threshold, so it
   appears as soon as eye adaptation lifts and the bright knots are
   visible immediately. That is probably the right answer. If he wants
   more, the lever is the **named** display gain applied to _every_
   diffuse layer, and the question is what number.
3. **Grain tolerance.** A Monte-Carlo haze is grainy at low `κ_band`
   and expensive at high. There is a real quality/perf knee here and
   only his eye can place it.
4. **Does he have an Intel integrated GPU to test on?** three.js
   #29841 (§2.4 Caveat 4) is device-specific, upstream-unfixed, and
   hits exactly this architecture. If he has no such device, the check
   has to be deferred and disclosed as an untested surface rather than
   silently assumed fine.
5. **Scope of M3 (dust).** Genuinely large and honestly reaches only
   ~1 kpc. Worth it, or is M1 + M2 the product?

---

## 9. Gate summary

Per AGENTS.md §7 ("smallest meaningful verification") and §6 ("tests
are a quality ratchet, not an implementation freeze"):

- **New tests are justified** for the reconstruction gate, the parallax
  invariants, the shared-constant assertion, and the anti-shell
  regression — these are honesty/product contracts, not coverage
  theatre.
- **No new tests** for shader internals, component structure, or "we
  wrote it so pin it". Experimental look work gets zero unit tests until
  the behaviour stabilises.
- `npm run test:run`, `npm run lint`, `npx tsc -b`, `npm run docs:check`
  on every milestone.
- `npm run test:e2e` with the **forced-preset unlock** from §6/M1 — and
  that unlock should be back-ported to the starfield wave's two stalled
  items.
