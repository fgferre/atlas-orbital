# Atlas Orbital — AAA Lighting & VFX Benchmark Research

**Research window:** 2026-04-18. Version numbers and adoption claims verified
via npm / GitHub / upstream docs where possible. Items where the public
record is thin are flagged **`[unverified]`** inline rather than asserted.
This document is a reference for `lighting-backlog.md` — it is not
prescriptive on its own.

**Source delivery:** ~70 URLs total across Axes 1–3.

---

## Axis 1 — AAA space-game lighting breakdowns

### Elite Dangerous (base + Odyssey)

- **Tone mapping:** Hable filmic curve ("FTM"). `GraphicsConfiguration.xml`
  exposes `ShoulderStrength`, `LinearStrength`, `LinearAngle`, `ToeStrength`,
  `ToeNumerator`, `ToeDenominator`, `LinearWhite` — historically the
  "make space dark again" community tweak surface.
- **Exposure:** Histogram-based auto-exposure knobs
  (`HistogramSampleWidth`, `ExposureThreshold`, `Percentiles`,
  `ExposureType`, `HistogramMode`, `ManualExposure`).
- **Odyssey lighting rework (2021):** new stack partially bypasses legacy
  FTM; the historical XML tuning surface is largely inert post-v3.3.
  `[unverified]` on exactly which pieces still read the file.
- **Skybox / stars:** dynamically generated per-system skybox from real
  galaxy data (~160,000 catalogued systems). Six-sided cube with procedural
  fill — **not** a static HDRI.
- **HDR output:** NVIDIA TrueHDR discussed on community forums;
  `[unverified]` whether a first-party HDR10 pipeline ships today.
- **Lens flare / god rays:** visible in-game; exact technique (screen-space
  vs object-based) `[unverified]` in open documentation.

Sources:

- https://forums.frontier.co.uk/threads/tone-mapping-let-s-make-space-dark-again-mk-3.468293/
- https://forums.frontier.co.uk/threads/tone-mapping-lets-make-space-dark-again-mk-ii.417416/
- https://forums.frontier.co.uk/threads/nvidia-truehdr-and-elite.623292/
- https://forums-new.frontier.co.uk/threads/to-anybody-finding-it-difficult-to-adjust-to-the-new-lighting.463775/
- https://forum.unity.com/threads/how-elite-dangerous-skywanderer-starmade-render-the-skybox.621670/

### Star Citizen (Gen12 / Star Engine — CryEngine/Lumberyard fork)

- **Gen12 renderer:** multicore-parallel; DX12 Ultimate features (VRS,
  mesh shaders, RT) under evaluation; Vulkan backend in progress.
- **Volumetric clouds:** raymarched at reduced resolution with reprojection
  - filter chain; improved forward/backward-scatter blend and edge
    feathering across 3.17 / 3.23 PTU.
- **Atmospheric scattering:** planet passes being ported to Gen12; Mie
  forward/backward mix.
- **Lens flare:** per-color-channel physical lens distortions
  `[unverified]` on depth of model; community-reported "too strong" on some
  GPUs.
- **God rays:** exponential kernel weighted by light intensity
  `[unverified]`; referenced in community GPU-bug traces.
- **VFX legacy reference:** GDC 2015 "Advanced Visual Effects with DirectX
  11 & 12: Visual Effects in Star Citizen" — still the clearest public doc
  on the aesthetic even though stack has moved on.
- **Gas clouds / fog:** moving to Vulkan + Gen12 alongside volumetric fog.

Sources:

- https://www.spaceloop.it/en/star-citizen-gen12-progress-and-performance-improvements
- https://wccftech.com/star-citizen-gets-gorgeous-volumetric-clouds-but-squadron-42-is-still-mia/
- https://www.gdcvault.com/play/1021768/Advanced-Visual-Effects-With-DirectX
- https://starcitizen.tools/Star_Engine
- https://github.com/IGCIT/Intel-GPU-Community-Issue-Tracker-IGCIT/issues/355

### Starfield (Creation Engine 2, 2023)

- **Real-time GI:** confirmed by Digital Foundry — Bethesda's first true
  real-time GI pipeline.
- **Reflections:** real-time cubemaps rather than SSR / RT reflections (DF
  explicitly noted this as the deliberate tradeoff).
- **Volumetric lighting:** upgraded in CE2 vs Skyrim/Fallout 4.
- **Sky rendering:** per-planet procedural skies; `[unverified]` which
  model (Preetham / Hosek-Wilkie / custom).
- **HDR output:** **missing at launch** — no HDR10 pipeline, no gamma /
  contrast sliders, internal tone-map curve is fixed.
- **Post stack:** improved generally; specific bloom / exposure model
  `[unverified]`.

Sources:

- https://www.wepc.com/gaming/starfield-creation-engine-2/
- https://www.starfielddb.com/creation-engine-2/
- https://en.wikipedia.org/wiki/Creation_Engine
- https://www.neogaf.com/threads/digital-foundry-starfield-the-digital-foundry-tech-review.1660578/

### No Man's Sky

- **Atmospheric scattering:** proprietary; Hello Games **intentionally
  inverted** the atmospheric density gradient (denser at higher altitude)
  to exaggerate the launch/landing transition — contrary to Earth realism.
- **Exoplanet skies:** procedural chemistry tints from non-Earth element
  parameters feeding the shader.
- **Pipeline reference:** GDC 2017 "Continuous World Generation in No Man's
  Sky" (Innes McKendrick) documents the world pipeline but `[unverified]`
  for sky/lighting shader specifics.
- **Lens flare, god rays, stars:** visible but undocumented publicly —
  `[unverified]`.

Sources:

- https://www.gdcvault.com/play/1024265/Continuous-World-Generation-in-No
- https://www.gamedeveloper.com/programming/video-how-continuous-world-generation-works-in-i-no-man-s-sky-i-
- https://en.wikipedia.org/wiki/Development_of_No_Man's_Sky

### Universe Sandbox 2 — Update 35 "Space in a New Light" (March 2025)

- **Engine swap:** Unity URP replacing a ~10-year-old custom forward
  pipeline.
- **PBR lighting:** hot non-stellar bodies now emit light; per-object
  distance-attenuated illumination (previously camera-distance-based).
- **Realism toggles:** "Artificial Starlight" swaps between realistic
  (only hot sources emit) and enhanced modes — direct precedent for a
  preset / custom surface.
- **Tone mapping / HDR:** URP default stack (likely ACES or Neutral via
  Volume Profile — `[unverified]`).
- **Shader migration:** hand-written custom → URP ShaderLab / shader graph.

Sources:

- https://universesandbox.com/blog/2024/11/next-gen-graphics-update/comment-page-1/
- https://universesandbox.com/blog/2025/03/space-in-a-new-light-update-35/
- https://universesandbox.com/blog/2025/03/universe-sandbox-2025-roadmap/

### SpaceEngine

- **HDR pipeline:** genuine HDR scene rendering with autoexposure (analyzes
  central-screen brightness); user "Exposure Correction" slider.
- **Tone mapping:** multiple artistic curves; not a single academic model.
- **Volumetric nebulae:** full ray-marched volumetric with in-editor
  customizable shaders.
- **Procedural galaxies:** sprite-based dust bands keyed to textures;
  inside-galaxy camera gets improved sprite resolution.
- **Bloom:** "Smooth bloom" with tone-correct MSAA resolve (author's own
  phrasing).
- **HDR display output:** `[unverified]` for 2026; circa 2019 devblog
  explicitly tonemapped an SDR framebuffer.

Sources:

- https://spaceengine.org/news/blog170415/
- https://spaceengine.org/news/blog170312/
- https://spaceengine.org/news/blog190611/
- https://spaceengine.org/manual/user-manual

### Celestia (open-source, legacy)

- **Lighting:** basic Lambert + specular with "planetshine" (secondary
  reflected light from planets onto moons).
- **Atmospheres:** simple sunrise/sunset gradient; no scattering LUT.
- **No wavelength filtering**; human-vision approximation only.
- **No volumetrics, no HDR, no advanced post-stack.**
- Missing object types: no variable stars, supernovae, black holes,
  nebulae in stock distribution.
- Rendering distance: cull at 1 light-year from parent star.

Sources:

- https://en.wikipedia.org/wiki/Celestia
- https://github.com/CelestiaProject/Celestia
- https://github.com/CelestiaProject/Celestia/blob/master/ChangeLog

### Kerbal Space Program 2 (cancelled 2024)

- **Atmospheric scattering:** Bruneton-style precomputed LUTs — 4D
  scattering table packed into 3D textures, 16/32-bit float to avoid
  banding. Sample distribution reparameterized for critical-region
  resolution.
- **Aerial perspective:** integrated into terrain + cloud passes in
  0.1.5.0.
- **Terrain:** Blackrack (Scatterer mod author) joined Intercept / Private
  Division for KSP2 atmospherics — Scatterer's techniques (oceans, godrays,
  eclipse shadows) informed the native stack.
- Cancellation 2024 means future technical depth `[unverified]`.

Sources:

- https://github.com/LGhassen/Scatterer
- https://forum.kerbalspaceprogram.com/topic/103963-wip19x-112x-scatterer-atmospheric-scattering-00838-14082022-scattering-improvements-in-game-atmo-generation-and-multi-sun-support/
- https://spacedock.info/mod/141/scatterer
- https://kerbaldevteam.tumblr.com/post/183477269626/starmods-scatterer-v0052

### EVE Online / EVE Frontier

- **PBR transition (EVE Online):** migrated from 1973 Phong to full PBR —
  CCP's "PBR: Making EVE Look Real" post covers the material math change.
  Carbon / Trinity engine.
- **Nebulae:** 30 pre-rendered, artist-authored backdrops per
  constellation — **not** runtime volumetrics. Inspired by real imagery.
- **Dynamic lighting:** star position drives shadows on stations /
  planets / asteroids.
- **EVE Frontier:** same Carbon engine (CCP has said they intend to
  open-source Carbon).
- **EVE Vanguard:** separate product on **Unreal Engine 5** — Lumen /
  Nanite-class tech, distinct from Carbon. Do not conflate.
- **Trinity upgrade (March 2025):** mentioned in community coverage,
  specific deliverables `[unverified]`.

Sources:

- https://updates.eveonline.com/card/3vv4d/physically-based-rendering-pbr/
- https://www.eveonline.com/news/view/pbr-and-making-eve-look-real
- https://www.eveonline.com/news/view/introducing-new-nebulae-into-eve
- https://nosygamer.blogspot.com/2025/03/eve-onlines-trinity-graphics-engine.html
- https://www.pcgamer.com/games/sim/eve-frontier-is-not-really-a-blockchain-game-no-more-than-eve-is-a-database-game-ccp-hopes-youll-give-crypto-a-chance-for-a-space-sim-with-tactical-combat-bordering-on-survival-horror/

---

## Axis 2 — R3F / three.js ecosystem (April 2026 snapshot)

Version numbers verified via npm / GitHub Releases where possible. Stale
data flagged.

### `@react-three/drei`

- **Latest seen:** `10.7.7` (late 2025). Atlas currently on `^10.7.7`.
- Relevant exports: `<Environment>`, `<Sparkles>`, `<MeshReflectorMaterial>`,
  `<Stars>`, `<Sky>` (Preetham wrapper), `<Cloud>` / `<Clouds>`. **No
  built-in `<Lensflare>` component** — use external.
- Stability: very stable; large; tree-shake via deep imports
  (`@react-three/drei/core/Environment`).

Sources:

- https://www.npmjs.com/package/@react-three/drei
- https://github.com/pmndrs/drei
- https://drei.docs.pmnd.rs/shaders/mesh-reflector-material

### `@react-three/postprocessing` + `postprocessing`

- **`postprocessing` (pmndrs core):** stable at **`6.38.3`** (late 2025).
  **No v7** as of research window. ~100–150 KB min+gz.
- **`@react-three/postprocessing`:** Atlas currently on `^3.0.4`. React
  bindings; exports `<EffectComposer>`, `<Bloom>`, `<SSAO>`,
  `<ChromaticAberration>`, `<Vignette>`, `<DepthOfField>`, `<Noise>`,
  `<ToneMapping>`, `<LUT>`, `<SelectiveBloom>` (deprecated in favor of
  material-emissive approach), `<SMAA>`, `<FXAA>`, `<Scanline>`.
- Known issue: three.js native `Lensflare` object throws inside
  postprocessing passes (three.js#26330).

Sources:

- https://github.com/pmndrs/postprocessing
- https://www.npmjs.com/package/postprocessing
- https://react-postprocessing.docs.pmnd.rs/
- https://github.com/pmndrs/react-postprocessing

### `realism-effects` (0beqz)

- v1.x stable; **v2 branch** in active development (SSGI v2 rewrite).
- Offers: **SSGI**, **SSR**, **Motion Blur**, **TRAA** (temporal
  reprojection AA), **HBAO**, **SVGF** denoiser, temporal-reprojection
  primitive. SSAO attributed to N8Programs.
- R3F integration requires some wiring (open issue #5).
- Single-maintainer; cadence uneven — treat as research-grade.

Sources:

- https://github.com/0beqz/realism-effects
- https://github.com/0beqz/realism-effects/blob/main/readme.md
- https://www.npmjs.com/package/realism-effects/v/1.0.10

### `n8ao`

- Latest seen: `1.10.1` in Atlas's own `package-lock.json` (transitive —
  see audit §8). Version range `^1.7+` added three r158 support.
- API: `N8AOPass` (vanilla three EffectComposer) + `N8AOPostPass`
  (pmndrs/postprocessing-compatible). Quality presets Low/Medium/High/Ultra,
  `aoRadius`, `distanceFalloff`, `intensity`, `color`. Recommended with SMAA.
- Quality leader for WebGL SSAO.

Sources:

- https://github.com/N8python/n8ao
- https://www.npmjs.com/package/n8ao
- https://discourse.threejs.org/t/new-ambient-occlusion-example-hbao-vs-n8ao/58847
- https://x.com/N8Programs/status/1726660535804993613

### Env-map / atmosphere libraries

- **`@takram/three-atmosphere`** — production R3F Bruneton precomputed
  scattering with higher-order LUTs. Best turnkey option for physically-
  based planetary atmospheres in r3f today.
- **`THRASTRO/thrastro-shaders`** — custom astronomical shader collection.

Sources:

- https://www.npmjs.com/package/@takram/three-atmosphere
- https://github.com/THRASTRO/thrastro-shaders

### sbcode TSL starter

- https://sbcode.net/tsl/ + https://sbcode.net/tsl/getting-started/
- Vite + TypeScript boilerplate, TSL tutorials (basics, patterns, method
  examples, Mandelbulb). Renderer-agnostic (WebGL2 / WebGPU auto-select).
- Maintained through 2025.

Sources:

- https://sbcode.net/tsl/
- https://sbcode.net/tsl/getting-started/
- https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language
- https://discourse.threejs.org/t/get-to-grips-with-threejs-shading-language-tsl/75613

### Lens flare options

- **three native** `three/addons/objects/Lensflare.js` — scene-graph,
  classic ghost-chain. Incompatible with postprocessing composer
  (three.js#26330). `LensflareNode` is newer TSL/WebGPU variant.
- **ektogamat `R3F-Ultimate-Lens-Flare`** — modern screen-space shader:
  anamorphic mode, ghosts, star points, burst, glare; lens-dirt 16:9
  texture; integrates as postprocessing `Effect`.
- **`@andersonmancini/lens-flare`** — alternative npm.

Sources:

- https://threejs.org/docs/pages/Lensflare.html
- https://github.com/mrdoob/three.js/blob/master/examples/jsm/objects/Lensflare.js
- https://github.com/ektogamat/R3F-Ultimate-Lens-Flare
- https://github.com/ektogamat/lensflare-threejs-vanilla
- https://www.npmjs.com/package/@andersonmancini/lens-flare

### `pmndrs/lamina`

- **Archived April 2023**; repo read-only June 2025. Last npm `1.2.2`.
- Author cited "hacky internal processing" and need for rewrite.
- **Recommendation:** treat as legacy. 2026 layered-materials path is
  TSL nodes or ShaderMaterial / NodeMaterial composition.

Sources:

- https://github.com/pmndrs/lamina
- https://www.npmjs.com/package/lamina

### three/addons post stack

- `UnrealBloomPass` still ships in r172+. Not superseded inside three core
  — but pmndrs/postprocessing `BloomEffect` is preferred for r3f integration
  (mipmap blur, selective-by-material).
- `BokehPass`, `SSAOPass`, `FilmPass`, `OutlinePass`, `OutputPass` still
  present.
- New r3f projects: pmndrs/postprocessing or TSL post nodes.

Sources:

- https://threejs.org/docs/pages/UnrealBloomPass.html
- https://threejs.org/examples/webgl_postprocessing_unreal_bloom.html
- https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html

### three.js tone-mapping support (r164+, current r17x)

Built-in: `NoToneMapping`, `LinearToneMapping`, `ReinhardToneMapping`,
`CineonToneMapping`, `ACESFilmicToneMapping`, **`AgXToneMapping`**
(r164+), **`NeutralToneMapping`** (Khronos PBR Neutral, r163/164 era).
r164 release notes: "cleanup of tone mapping shaders". Neutral tends to
darken aggressively — confirmed issue in model-viewer discussions.

Sources:

- https://github.com/mrdoob/three.js/releases/tag/r164
- https://discourse.threejs.org/t/tone-mapping-overview/75204
- https://github.com/mrdoob/three.js/blob/dev/examples/webgl_tonemapping.html

---

## Axis 3 — Categorical deep dives

### HDR pipeline + tone mapping

- **ACES Filmic:** industry default; UE4/UE5 default, Unity HDRP default,
  many PS5 / Xbox Series titles `[unverified per-title beyond DF]`.
- **AgX:** Blender 4.x default; better fidelity at extremes than ACES,
  smoother hue skew. Three.js supports since r164.
- **Khronos PBR Neutral (2024):** product-accurate (e-commerce); preserves
  sRGB bases under neutral light. Darkens — use with care.
- **Cineon:** legacy filmic; rarely chosen new.
- **Three.js / R3F native:** set on `WebGLRenderer.toneMapping` +
  `toneMappingExposure`. All five curves above supported.

Sources:

- https://discourse.threejs.org/t/tone-mapping-overview/75204
- https://modelviewer.dev/examples/tone-mapping
- https://www.khronos.org/news/press/khronos-pbr-neutral-tone-mapper-released-for-true-to-life-color-rendering-of-3d-products
- https://juicybomb.com/2025/03/khronos-vs-aces-tone-mapper/
- https://cgmeerkat.github.io/blog/who-needs-a-tonemapper/

### Selective bloom

- **three.js selective example:** `webgl_postprocessing_unreal_bloom_selective.html`
  — two-pass with layer isolation.
- **pmndrs `BloomEffect`:** `luminanceThreshold ≥ 1.0` + HDR emissive
  (`color * intensity > 1`) is idiomatic — no extra passes.
- **UE5 convolution bloom:** FFT-convolved physical kernel; aspirational
  reference but not realistic for WebGL.

Sources:

- https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html
- https://waelyasmina.net/articles/unreal-bloom-selective-threejs-post-processing/
- https://react-postprocessing.docs.pmnd.rs/effects/bloom
- https://dev.epicgames.com/documentation/en-us/unreal-engine/bloom-in-unreal-engine
- https://www.froyok.fr/blog/2021-12-ue4-custom-bloom/
- https://github.com/pmndrs/postprocessing/issues/616

### Eye adaptation / auto-exposure

- **pmndrs `ToneMappingEffect`:** `adaptive` flag; configurable resolution
  (default 256), `middleGrey`, `maxLuminance`, `adaptationRate`. Adaptive
  mode requires `EXT_shader_texture_lod`.
- **Histogram approach (Bruno Opsenica / "BruOp"):** compute-shader
  256-bin luminance histogram → exponential smoothing. Canonical modern
  reference (Unity PostProcessing v2/v3). Compute shaders = WebGPU-only in
  three.js; WebGL2 path uses mipmap downsample reduction.

Sources:

- https://bruop.github.io/exposure/
- https://pmndrs.github.io/postprocessing/public/docs/class/src/effects/ToneMappingEffect.js~ToneMappingEffect.html
- https://react-postprocessing.docs.pmnd.rs/effects/tone-mapping
- https://github.com/Unity-Technologies/FPSSample/blob/master/Packages/com.unity.postprocessing/PostProcessing/Shaders/Builtins/ExposureHistogram.hlsl

### Per-light god rays

- **Screen-space radial blur (Mitchell, GPU Gems 3 Ch.13):** occlusion
  mask → radial blur from light screen pos → additive composite. The
  canonical cheap option.
- **Raymarched volumetric:** proper scattering through participating
  media; handles off-screen lights + 3D occluders; expensive.
- **three.js implementations:** `thefrontdev` layer-based radial blur
  tutorial; Godot 4.3 screen-space god-rays shader as a readable port.

Sources:

- https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process
- https://github.com/math-araujo/screen-space-godrays
- https://godotshaders.com/shader/screen-space-god-rays-godot-4-3/
- https://www.thefrontdev.co.uk/creating-volumetric-lights-with-radial-blur-in-three.js-using-layers/
- https://valeriomarty.medium.com/raymarched-volumetric-lighting-in-unity-urp-e7bc84d31604
- https://www.cyanilux.com/tutorials/god-rays-shader-breakdown/

### Atmospheric scattering

- **Bruneton 2008 "Precomputed Atmospheric Scattering":** 4D LUT packed
  into 3D texture; GPGPU precompute; baseline reference.
- **Hillaire 2020 "A Scalable and Production Ready Sky and Atmosphere
  Rendering Technique":** 0.31 ms at 1280×720; multi-scattering
  approximation without full 4D LUT; now the UE5 standard.
- **Preetham 1999:** analytical clear-sky; three.js `Sky` uses this; fast,
  less accurate.
- **Hosek-Wilkie 2012:** analytical successor with ground-albedo; more
  accurate for turbidity 1–10; no native three.js class (community ports).

Sources:

- https://ebruneton.github.io/precomputed_atmospheric_scattering/
- https://sebh.github.io/publications/egsr2020.pdf
- https://onlinelibrary.wiley.com/doi/full/10.1111/cgf.14050
- https://threejs.org/examples/webgl_shaders_sky.html
- https://www.shadertoy.com/view/wslfD7
- https://www.trist.am/blog/2024/atmosphere-rendering/
- https://github.com/diharaw/bruneton-sky-model
- https://renderwonk.com/publications/s2003-course/preetham/notes-preetham.pdf

### Lens flare

- **Classic ghost-chain (three.js native):** texture-based elements on a
  line through the light. Cheap; dated alone.
- **Screen-space from luminance buffer (John Chapman 2017):** extract
  bright pixels, blur, distort, chromatic offset. Modern default; handles
  "behind an object" organically.
- **Anamorphic (ektogamat Ultimate Lens Flare):** horizontal streak
  emphasis, ghosts, glare, starburst, dirt. Sci-fi aesthetic default.
- **UE5 custom lens flare (Froyok):** excellent compositing-flow blog.

Sources:

- https://john-chapman.github.io/2017/11/05/pseudo-lens-flare.html
- https://github.com/ektogamat/R3F-Ultimate-Lens-Flare
- https://www.froyok.fr/blog/2021-09-ue4-custom-lens-flare/
- https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/shared/lens-flare/Override-Screen-Space-Lens-Flare.html

### SSAO / SSR

- **n8ao:** WebGL quality leader; temporally stable; artist-friendly.
- **pmndrs `SSAOEffect`:** cheaper than n8ao, less temporally stable.
- **realism-effects `HBAO`:** higher-fidelity horizon-based AO; more
  expensive.
- **UE5 Lumen:** full real-time GI + reflections — different class; screen
  - world-space SDF + surface cache. WebGL doesn't reach Lumen in 2026.

Sources:

- https://github.com/N8python/n8ao
- https://react-postprocessing.docs.pmnd.rs/effects/ssao
- https://github.com/0beqz/realism-effects
- https://discourse.threejs.org/t/new-ambient-occlusion-example-hbao-vs-n8ao/58847

### Chromatic aberration / vignette / film grain

- **pmndrs:** `ChromaticAberrationEffect` (offset, radialModulation,
  modulationOffset), `VignetteEffect` (darkness, offset, Eskil / Default
  technique), `NoiseEffect` (premultiply alpha, blendFunction).
  Negligible cost; drop-in.

Sources:

- https://react-postprocessing.docs.pmnd.rs/effects/chromatic-aberration
- https://github.com/pmndrs/postprocessing

### Depth of field

- **Thin-lens (three `BokehPass`):** focus distance + aperture + maxBlur;
  uniform disc.
- **Bokeh hexagonal (DoF2 example, Martins Upitis shader):** proper
  aperture-shaped bokeh.
- **pmndrs `DepthOfFieldEffect`:** cone-of-confusion + bokeh blur; widely
  used in r3f.

Sources:

- https://threejs.org/examples/webgl_postprocessing_dof2.html
- https://threejs.org/docs/pages/BokehPass.html
- https://threejsdemos.com/demos/postfx/dof
- https://discourse.threejs.org/t/depth-of-field-pmndrs-post-processing/55849

### Motion blur

- **Per-object velocity buffer (John Chapman):** render world-space motion
  per pixel → directional blur. Correct for translation + rotation.
- **Camera-only matrix-diff:** reconstruct world from depth, transform by
  previous view-proj, diff. Cheaper; misses object motion.
- **realism-effects MotionBlur:** shares velocity-depth-normal pass with
  TRAA. Best r3f option today.

Sources:

- https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-27-motion-blur-post-processing-effect
- http://john-chapman-graphics.blogspot.com/2013/01/per-object-motion-blur.html
- https://github.com/0beqz/realism-effects
- https://mynameismjp.wordpress.com/the-museum/samples-tutorials-tools/motion-blur-sample/

### Volumetric fog / dust / zodiacal light

- **Froxel grid (Frostbite 2014):** three-pass — participating-media
  integration → light integration → final gather. Scales.
- **Screen-space raymarch (Ameobea `three-volumetric-pass`):**
  pmndrs/postprocessing-compatible.
- **Maxime Heckel cloudscape tutorial:** best accessible WebGL raymarch
  reference; blue-noise dithering to kill banding.

Sources:

- https://blog.maximeheckel.com/posts/real-time-cloudscapes-with-volumetric-raymarching/
- https://github.com/Ameobea/three-volumetric-pass
- https://davidpeicho.github.io/blog/cloud-raymarching-walkthrough-part1/
- https://discourse.threejs.org/t/volumetric-lighting-in-webgpu/87959

### Screen-space god rays

Same base as "per-light god rays" — occlusion radial blur is the cheapest
shippable option. GPU Gems 3 Ch.13 + Godot 4.3 port are canonical. In
three.js, build as a custom `Effect` in pmndrs/postprocessing.

### Lens dirt overlay

Sample a lens-dirt texture multiplied by bloom-buffer luminance before
final composite. ektogamat Ultimate Lens Flare exposes this as
`dirtTextureFile` (16:9). Froyok UE4 custom bloom post shows equivalent
compositing.

Sources:

- https://github.com/ektogamat/R3F-Ultimate-Lens-Flare
- https://www.froyok.fr/blog/2021-12-ue4-custom-bloom/

### Milky Way equirect layer

- **ESA Gaia EDR3 equirectangular** (CC BY-SA 3.0 IGO) — 1.7B stars;
  authoritative real-sky reference.
- **NASA SVS "An Elsewhere Starfield"** — OpenEXR half-float; HDR-ready.
- **HDRI Hub, Space Spheremaps, Kirriaa (DeviantArt)** — artist / procedural
  alternatives with baked nebulae.
- Render as inside-out sphere; **keep out of `Environment` / IBL** to
  prevent leaking into scene lighting.

Sources:

- https://sci.esa.int/web/gaia/-/60196-gaia-s-sky-in-colour-equirectangular-projection
- https://svs.gsfc.nasa.gov/4856/
- https://www.spacespheremaps.com/hdr-spheremaps/
- https://www.hdri-hub.com/hdrishop/hdri/space
- https://www.deviantart.com/kirriaa/art/Free-star-sky-HDRI-spherical-map-719281328

### Per-body atmospheric shell

- **Fresnel-glow (cheap):** `pow(1 - dot(N, V), k) * tint`. Stylized;
  Atlas's current Earth atmosphere follows this shape.
- **Scattering LUT (production):** `@takram/three-atmosphere` (R3F-native
  Bruneton).
- **Sebastian Lague / Maxime Heckel:** teaching-quality blog references.

Sources:

- https://www.npmjs.com/package/@takram/three-atmosphere
- https://discourse.threejs.org/t/how-to-create-an-atmospheric-glow-effect-on-surface-of-globe-sphere/32852
- https://discourse.threejs.org/t/creating-a-pseudo-realistic-planetary-atmosphere-on-the-cheap/40391
- https://blog.maximeheckel.com/posts/the-study-of-shaders-with-react-three-fiber/
- https://github.com/otanodesignco/Fresnel-Shader-Material

### Particle systems (thruster plumes)

- **three-nebula:** mature particle engine with JSON config; GPU-instanced
  renderer.
- **drei `<Sparkles>`:** shader-based GPU sprites; ambient motes; limited
  for directional thruster dynamics.
- **r3f-flow-field-particles (sebastien-lempens):** GPGPU; hero-grade
  plumes.
- **threeparticles (WebGPU):** new-gen WebGPU; track for 2026+.

Sources:

- https://three-nebula.org/
- https://github.com/creativelifeform/three-nebula
- https://three-nebula.org/examples/gpu-renderer
- https://github.com/sebastien-lempens/r3f-flow-field-particles
- https://docs.threeparticles.com/getting-started/r3f-quick-start
- https://discourse.threejs.org/t/nebula-a-fully-featured-particle-system-designer-for-three/21854

---

## Quick-reference recommendation matrix

| Need                  | 2026 best-fit (r3f)                                                 | Fallback                                  |
| --------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| Tone mapping          | `AgXToneMapping` (three r164+)                                      | `ACESFilmicToneMapping`                   |
| Bloom                 | pmndrs `<Bloom luminanceThreshold=1.0 mipmapBlur />` + HDR emissive | UnrealBloomPass                           |
| Auto-exposure         | pmndrs `<ToneMapping adaptive />`                                   | Manual exposure key                       |
| SSAO                  | `n8ao` (`N8AOPostPass`)                                             | pmndrs `<SSAO />`                         |
| Atmosphere (planets)  | `@takram/three-atmosphere`                                          | Fresnel-glow shell (current Atlas Earth)  |
| Stars / sky dome      | ESA Gaia equirect HDR + tone-mapped env                             | drei `<Stars />`                          |
| Lens flare            | ektogamat Ultimate Lens Flare                                       | three.js native `Lensflare` (no postproc) |
| Volumetrics           | `three-volumetric-pass` (Ameobea)                                   | Screen-space radial god rays              |
| Particles             | three-nebula GPU renderer                                           | drei `<Sparkles>` for ambient             |
| Reflections           | `MeshReflectorMaterial` (planar), realism-effects SSR               | Cubemap probes                            |
| Motion blur           | realism-effects MotionBlur                                          | Camera-only matrix-diff                   |
| DoF                   | pmndrs `<DepthOfField />`                                           | BokehPass (DoF2 hex bokeh)                |
| CA / vignette / grain | pmndrs built-ins                                                    | —                                         |
| Layered materials     | TSL nodes / custom ShaderMaterial                                   | **Not lamina** (archived)                 |

---

## Notes on 2026 currency

- **Lamina confirmed archived** April 2023, repo read-only June 2025 — do
  not adopt.
- **AgX + Neutral tone mapping confirmed** in three.js r164+; expected to
  stay standard in r17x.
- **KSP2** cancelled 2024 — references valid, no future updates.
- **Starfield** launched without HDR10 output; `[unverified]` whether
  post-launch updates added one.
- **EVE Vanguard on UE5** (distinct from EVE Online / EVE Frontier on
  Carbon) — don't conflate.
- **postprocessing library at 6.38.x** in late 2025 — no v7.
- **Star Citizen Gen12 / Vulkan** ongoing; specific shipped-feature status
  in 2026 `[unverified]`.
- **n8ao** already transitively resolved to `1.10.1` in Atlas's own
  `package-lock.json` — cost of adopting as a direct dep is pinning only.

---

_End of benchmark research._
