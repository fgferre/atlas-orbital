import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../../../store";
import { AstroPhysics } from "../../../lib/astrophysics";
import { useQualityProfile } from "../../../hooks/useQualityProfile";
import {
  buildZodiacalLutTexture,
  ZODIACAL_FRAGMENT_GLSL,
} from "../../../lib/zodiacalLightLut";

/**
 * `useFrame` priority for the camera-recentre write below.
 *
 * Every camera-position writer in the tree (`CameraController`,
 * `SurfaceModeFirstPerson`, `NormalizedWheelZoom`, `DynamicZoom`, ...)
 * subscribes at the R3F default priority, `0` — none of them pass an
 * explicit priority argument to `useFrame`. The render pass
 * (`EffectComposer` via `PostProcessingPipeline`, or `DirectRenderPass`
 * on the `constrained` tier — see `Scene.tsx:163`) subscribes at `1`.
 * R3F executes same-priority subscribers in subscription order and
 * sorts ascending by priority (`react-three-fiber`'s `internal.subscribe`),
 * so a value strictly between `0` and `1` is the ONLY choice that
 * guarantees this component's recentre runs after every same-tick
 * camera write and before the frame is actually drawn — see the module
 * doc's "Renderer integration" section for why that ordering is what
 * makes the outrun bug structurally impossible instead of merely rare.
 */
export const ZODIACAL_RECENTER_PRIORITY = 0.5;

/**
 * Zodiacal Light skybox (#3) — Leinert et al. (1998) tabulated
 * brightness model, sampled analytically against the live camera's
 * heliocentric distance and elongation.
 *
 * ## What is zodiacal light
 *
 * Sunlight scattered by interplanetary dust grains along the ecliptic
 * plane. As bright as the Milky Way at 1 AU, but a diffuse band rather
 * than a resolved one. Its visibility at elongation > 30° is the most
 * prominent naked-eye astronomical feature after the Moon, the Sun,
 * Venus, Jupiter, and the Milky Way itself — and it is the SUBJECT
 * of this app, which is why it gets its own shader here.
 *
 * ## Why it matters here specifically
 *
 * As the camera flies outward in the didactic view, the local dust
 * density that produces the band's brightness drops as R⁻²·⁵ (Dumont
 * 1983 fan-cloud integral). The band dims visibly — a physically-
 * grounded "you have left the inner Solar System" signal that no
 * skybox static at any altitude can give. Reduced motion or pannable
 * space art cannot show this; only an analytic model driven by the
 * live camera heliocentric distance can.
 *
 * ## Renderer integration
 *
 * Single icosphere (radius 1e8 scene units) with `THREE.BackSide`
 * rendered behind everything (`renderOrder = -100`, no depth-write).
 * Re-centred on the camera every frame at `ZODIACAL_RECENTER_PRIORITY`
 * (see below) — deliberately AFTER every priority-0 camera-position
 * writer (`CameraController`, `SurfaceModeFirstPerson`,
 * `NormalizedWheelZoom`, ...) and before the render pass, so the shell
 * always uses this frame's FINAL camera position with zero lag. This
 * matters: at MAX_VELOCITY_FACTOR = 3.0 (`hygPhysicsFlight.ts`), the
 * HYG fly-to's per-frame stride is `distance / 20`, which exceeds the
 * shell radius past ~9.7 pc — with even a one-frame recentre lag, the
 * camera exits its own shell and the band vanishes for the whole
 * middle of the flight (2026-07-29 root cause, see
 * `tasks/waves/galaxy-volumetric-2026-07-29.md` §0.1). Recentring
 * strictly after all same-tick camera writes makes that structurally
 * impossible — the mesh is always exactly at camera.position for the
 * frame that gets rasterised, independent of how large the stride was.
 * The material is a `ShaderMaterial` that:
 *   • Computes the fragment's world direction `dir`.
 *   • Resolves the helioecliptic pair (β, |λ−λ☉|) via `zodiacalAngles`
 *     — the scene frame's Y axis is the ecliptic pole, so β is the
 *     elevation and λ−λ☉ is the angle between the XZ-plane projections
 *     of `dir` and `sunDir`. It is a LONGITUDE DIFFERENCE, not the 3D
 *     angular separation; the two agree only in the ecliptic plane.
 *   • Looks the pair up in `u_zodiacalLut` (a uniform 5° resampling of
 *     Leinert Table 16) and scales by `pow(max(R_AU, 1), -2.5)` (Dumont
 *     distance law, clamped flat inward of 1 AU — see
 *     `zodiacalHeliocentricFactor` in `zodiacalLightLut.ts` for why:
 *     unclamped, this scaling washed the whole screen white as the
 *     camera approached the Sun, fixed 2026-07-29) and
 *     `ZODIACAL_S10_TO_LINEAR` — a derived calibration, see the
 *     arithmetic in `zodiacalLightLut.ts`.
 *
 * The output is a vec3 with the band brightness in linear scene
 * radiance units, added into the HalfFloat composer buffer via
 * `BlendingEq: ADD`. Crossing bloom's `luminanceThreshold = 1.0` near
 * the Sun is intended and bounded — the calibration puts the peak at
 * 3.26× the gate, confined to roughly 26° of the Sun along the ecliptic
 * where the Sun's own disc and bloom already live. That ceiling is
 * derived, not eyeballed; `zodiacalLightLut.ts` states the whole window.
 *
 * ## Tier gate
 *
 * Constrained (`low`) unmounts: the OffscreenCanvas path renders
 * straight to the canvas via `DirectRenderPass` (no composer), so an
 * extra shader-fragment pass is not worth the frame budget there —
 * the empty black sky stays cleaner than a forced single-pass band.
 * All composer tiers (ultra/high/medium) mount it: a single textured
 * sphere is one fullscreen fragment overhead per frame. Bloom and AgX
 * take it from there. Reduced-motion users still see it — zodiacal
 * light has no temporal component, the dust cloud is static on a
 * human-fly time-scale.
 */
export const ZodiacalLightSkybox = () => {
  const qualityMode = useStore((state) => state.qualityMode);
  const qualityProfile = useQualityProfile(qualityMode);
  const camera = useThree((state) => state.camera);
  const scaleMode = useStore((state) => state.scaleMode);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  // Constrained tier: no composer = no zodiacal band. See component JSDoc.
  const enabled = qualityProfile.name !== "constrained";

  const lutTexture = useMemo(() => buildZodiacalLutTexture(), []);

  const uniforms = useMemo(
    () => ({
      u_zodiacalLut: { value: lutTexture },
      u_cameraR_AU: { value: 1.0 },
      // Modulated by 1 when on a composer tier; the constant is here so
      // a future DisplayPanel "coordinate-grid overlay" style toggle
      // (or the educational submenu) can dial the band without rebuilding
      // the material — see the Layers-Panel Columns preset convention.
      u_brightnessMul: { value: 1.0 },
      // Sun direction in world/ecliptic frame. Set per-frame; default is
      // (0,0,1) which would be invalid only if R never updates — keep
      // a sensible boot seed. Declared in `ZODIACAL_FRAGMENT_GLSL`
      // alongside the others: a ShaderMaterial's fragment prefix carries
      // only three.js built-ins, so an undeclared custom uniform is a
      // compile error, not a warning. This one WAS undeclared before
      // 2026-07-29, which is why the layer had never drawn a pixel —
      // the program failed to link on every tier that mounts it.
      u_sunDir: { value: new THREE.Vector3(0, 0, 1) },
    }),
    [lutTexture]
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        depthWrite: false,
        depthTest: false,
        // The mesh is drawn at renderOrder === -100 so it goes behind
        // everything (starfield, planets) - set on the mesh, not the material.
        side: THREE.BackSide,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        vertexShader: [
          "varying vec3 v_dir;",
          "void main() {",
          "  // World-space direction from camera (at scene origin of the",
          "  // sphere) to the fragment. The sphere is centered on the",
          "  // camera, so 'position' is already the raw unrotated",
          "  // direction and we just hand it through.",
          "  v_dir = position;",
          "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
          "}",
        ].join("\n"),
        fragmentShader: [
          "precision highp float;",
          "varying vec3 v_dir;",
          ZODIACAL_FRAGMENT_GLSL,
          "void main() {",
          "  // Need normalized rasterisable direction.",
          "  vec3 dir = normalize(v_dir);",
          "  // Helioecliptic coordinates of this fragment: ecliptic",
          "  // latitude and longitude difference from the Sun, which are",
          "  // exactly Leinert Table 16's two axes.",
          "  float betaDeg;",
          "  float lambdaDeg;",
          "  zodiacalAngles(dir, normalize(u_sunDir), betaDeg, lambdaDeg);",
          "  float zl = zodiacalBrightness(betaDeg, lambdaDeg);",
          "  // The scattered light has approximately solar colour",
          "  // (Leinert 3.3: solar spectrum reddened slightly at UV,",
          "  // but for our purposes treat as white). Linear sRGB 1.0",
          "  // equals Vega flux; the LUT is in linear scene radiance.",
          "  vec3 color = vec3(zl);",
          "  gl_FragColor = vec4(color, 1.0);",
          "  #include <colorspace_fragment>",
          "}",
        ].join("\n"),
      }),
    [uniforms]
  );

  // Sync materialRef so useFrame below can write uniforms without
  // tripping react-hooks/immutability on the memoised material.
  useEffect(() => {
    materialRef.current = material;
  }, [material]);

  // Per-frame uniforms: live heliocentric distance + Sun direction.
  //
  // Priority `ZODIACAL_RECENTER_PRIORITY` (see top of file) — NOT the
  // default 0 — is load-bearing. `<ZodiacalLightSkybox />` mounts
  // before `<CameraController />` in `Scene.tsx`, so at the default
  // priority this callback used to run BEFORE the camera's
  // position write for the frame, re-centring the shell on stale
  // (previous-frame) camera position. Combined with the HYG fly-to's
  // per-frame stride (`distance / 20` at MAX_VELOCITY_FACTOR = 3.0),
  // that one-frame lag let the camera outrun and exit its own 1e8 wu
  // shell past ~9.7 pc, blanking the band for the whole flight
  // (2026-07-29 root cause). Running strictly after every priority-0
  // camera writer deletes the lag outright: the copy below always
  // reads this frame's final camera.position.
  useFrame(() => {
    const mat = materialRef.current;
    if (!mat) return;
    // Skybox follow: re-center the sphere on the camera every frame so
    // it stays at "infinite" distance for the rasteriser (clamping
    // vertices back if the camera flies out past the radius).
    if (meshRef.current) {
      meshRef.current.position.copy(camera.position);
    }
    const u = mat.uniforms;
    // The Sun sits at the scene origin in the ecliptic frame, so the
    // direction from the camera to the Sun is just the negative
    // camera position normalised — independent of any focus body.
    const sunDir = u.u_sunDir.value as THREE.Vector3;
    sunDir.copy(camera.position).negate().normalize();

    // Heliocentric distance to AU: the scene frame uses atlas world
    // units, which change with scaleMode. `worldToAu` is the inverse
    // of the auToWorld compression curve — see astrophysics.ts.
    const worldR = camera.position.length();
    u.u_cameraR_AU.value = AstroPhysics.worldToAu(worldR, scaleMode);
  }, ZODIACAL_RECENTER_PRIORITY);

  // Dispose the LUT + material on unmount — R3F does NOT auto-dispose
  // objects created via useMemo (mirrors Starfield.tsx, ProceduralSun3D).
  useEffect(() => {
    return () => {
      material.dispose();
      lutTexture.dispose();
    };
  }, [material, lutTexture]);

  if (!enabled) return null;

  return (
    <mesh
      ref={meshRef}
      name="atlas-zodiacal-light"
      material={material}
      // Sphere centered on the camera via useFrame position copy above.
      // Rendered behind everything: starfield is -2, sunmesh around 0,
      // planets render order defaults; -100 puts the band behind all of
      // them. `frustumCulled={false}` so the sphere is never culled as
      // it follows the camera around.
      frustumCulled={false}
      renderOrder={-100}
    >
      <icosahedronGeometry args={[1e8, 3]} />
    </mesh>
  );
};
