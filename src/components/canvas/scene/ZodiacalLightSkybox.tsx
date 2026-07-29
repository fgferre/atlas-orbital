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
 * The material is a `ShaderMaterial` that:
 *   • Computes the fragment's world direction `dir`.
 *   • Decides ecliptic latitude β = asin(dir.y) directly — the scene
 *     frame's Y axis is the ecliptic pole.
 *   • Computes solar elongation λ-λ_sun as `acos(dot(dir, sunDir))`.
 *   • Looks up the Leinert S10 value in `u_zodiacalLut` and scales by
 *     `pow(u_cameraR_AU, -2.5)` (Dumont distance law) and
 *     `ZODIACAL_S10_TO_LINEAR` (photometric unit — see zodiacalLightLut.ts).
 *
 * The output is a vec3 with the band brightness in linear scene
 * radiance units, added into the HalfFloat composer buffer via
 * `BlendingEq: ADD`. Paste-white near the Sun is correct: Leinert's
 * table values trend to 9000 S10 near elongation 15° (β=15), which
 * is real and goes through bloom's luminanceThreshold=1.0 gate
 * (sub-pull 1b) so it reads as over-bright scatter, not a flat disk.
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
      // a sensible boot seed.
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
          "  // Ecliptic latitude is the elevation above the XZ plane.",
          "  float betaDeg = degrees(asin(clamp(dir.y, -1.0, 1.0)));",
          "  // Solar elongation: angle between the fragment direction",
          "  // and the Sun direction. acos orientation is the canonical",
          "  // elongation measure used by Leinert.",
          "  vec3 sunDir = normalize(u_sunDir);",
          "  float cosE = clamp(dot(dir, sunDir), -1.0, 1.0);",
          "  float lambdaDeg = degrees(acos(cosE));",
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
  });

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
