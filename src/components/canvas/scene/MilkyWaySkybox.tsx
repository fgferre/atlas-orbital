import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../../../store";
import { useQualityProfile } from "../../../hooks/useQualityProfile";
import { useDeferredTexture } from "../../../hooks/useDeferredTexture";
import {
  MILKY_WAY_BRIGHTNESS_MULTIPLIER,
  MILKY_WAY_ORIENTATION_GLSL,
} from "../../../lib/milkyWayOrientation";

const BASE_URL = import.meta.env.BASE_URL || "/";

/**
 * The shipped panorama: NASA SVS "Deep Star Maps 2020", the
 * `milkyway_2020` layer (Gaia DR2 diffuse synthesis with the catalogued
 * Hipparcos/Tycho stars OMITTED — see the module doc for why this exact
 * layer, not `starmap_2020`, is the honest choice), galactic-coordinate
 * projection, re-encoded from the source EXR to an 8-bit sRGB JPEG. See
 * `MilkyWaySkybox`'s doc comment for the full asset + encoding trail.
 */
const MILKY_WAY_TEXTURE_URL = `${BASE_URL}textures/4k_milkyway_2020_gal.jpg`;

/**
 * Milky Way panorama skybox (#4) — NASA SVS "Deep Star Maps 2020",
 * `milkyway_2020` diffuse layer, camera-centered and additively
 * composited behind the star catalogue.
 *
 * ## Asset: why `milkyway_2020`, not `starmap_2020`
 *
 * SVS publishes two related layers from the same Gaia DR2 render: the
 * catalogued Hipparcos/Tycho stars (`starmap_2020`) and the diffuse
 * background WITHOUT those stars (`milkyway_2020` — "This is a version
 * of the star map that omits the bright (Hipparcos and Tycho) stars",
 * per svs.gsfc.nasa.gov/4851). Atlas already renders every HYG-catalogue
 * star individually (`Starfield.tsx`). Using `starmap_2020` here would
 * draw the same bright stars TWICE — once as this skybox's baked pixels,
 * once as the catalogue's own analytically-positioned point. The diffuse
 * `milkyway_2020` layer is the ONLY one of the two that composes with
 * the star catalogue without double-counting; that is a fidelity
 * argument, not an aesthetic preference (see the wave file).
 *
 * Downloaded: `milkyway_2020_4k_gal.exr` (galactic-coordinate projection,
 * 4096×2048, OpenEXR half-float linear, 33.2 MB —
 * https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_4k_gal.exr).
 * The galactic-projection variant is used directly (no extra rotation
 * layered on a celestial-frame image); this skybox's own rotation still
 * has to carry galactic → scene (ecliptic Y-up), which is what
 * `milkyWayOrientation.ts` derives and pins.
 *
 * ## Encoding: why an 8-bit JPEG, not the raw EXR or KTX2
 *
 * `deferredTextureCache.ts` wraps `THREE.TextureLoader` only — it has no
 * EXR or KTX2/basis-universal decode path, and this component
 * deliberately reuses that EXISTING deferred-loading contract (so the
 * panorama never blocks boot) rather than adding a second loader
 * branch to a shared cache used by every other texture in the app. KTX2
 * encoding was evaluated and rejected: no npm devDependency in this repo
 * can ENCODE UASTC (the bundled `three/examples/jsm/loaders/KTX2Loader`
 * can only DECODE an already-built `.ktx2`), and reaching for one was
 * judged out of scope for this change — see the wave file's "encoding
 * tradeoff" note.
 *
 * The source EXR was therefore re-encoded once, offline, to
 * `public/textures/4k_milkyway_2020_gal.jpg` (sRGB 8-bit, ~3.6 MB):
 * linear radiance normalised by a measured 99.9th-percentile ceiling,
 * clamped to [0,1], sRGB-encoded. Full derivation and the exact
 * numbers are in `milkyWayOrientation.ts`'s calibration doc comment.
 * This keeps VRAM small and predictable: 4096×2048 RGB8 with mipmaps is
 * ≈33 MB, versus ≈134 MB for an uncompressed 8k RGB8 texture or ≈340 MB
 * for an 8k half-float EXR loaded directly — both were rejected against
 * the tiled-streaming wave's measured admission-control budgets (ultra
 * 512 MB / high 256 MB / balanced 64 MB). KTX2/UASTC remains the
 * documented upgrade path if/when an encoder becomes available.
 *
 * ## Colour space: decided once, here
 *
 * The JPEG is display-referred sRGB (that is what the bake produced).
 * `useDeferredTexture`'s `colorSpace: THREE.SRGBColorSpace` (its own
 * default, passed explicitly below for the record) makes three.js
 * upload the GPU texture with an sRGB internal format, so ANY
 * `texture2D()` sample of it — including from this component's raw
 * `ShaderMaterial`, not just three.js's built-in material maps — comes
 * back already linear (hardware sRGB decode on sample is part of the
 * WebGL2/OpenGL ES 3.0 spec for sRGB internal formats, not
 * three.js-specific shader-chunk magic). No manual `pow()` decode is
 * written in the fragment shader below; this is the ONE place that
 * decision is made.
 *
 * ## Orientation
 *
 * The map is in GALACTIC coordinates; the scene is ecliptic (+Y = north
 * ecliptic pole). `milkyWayOrientation.ts` derives and pins the
 * galactic→ecliptic→scene rotation (Gram-Schmidt construction from the
 * cited R/Q/P Euler angles, cross-checked against the published
 * ICRS↔Galactic matrix to 1e-12) and the panorama's own equirect UV
 * convention (longitude direction from NASA's documentation, latitude
 * polarity determined empirically against the real downloaded pixels
 * via the LMC/SMC brightness check — see that module's doc comment for
 * the full trail). `MILKY_WAY_ORIENTATION_GLSL` is generated from the
 * SAME TypeScript constants the pin test checks, so the shader and the
 * test cannot drift apart.
 *
 * ## Brightness
 *
 * `MILKY_WAY_BRIGHTNESS_MULTIPLIER` is derived (not hand-tuned) from
 * measured brightness anchors in the source image, mapped into the
 * graded pipeline's visible window the same way
 * `zodiacalLightLut.ts`'s `ZODIACAL_S10_TO_LINEAR` is — see that
 * constant's doc comment in `milkyWayOrientation.ts` for the full
 * arithmetic. By construction, the disk's own brightest latitude band
 * sits right at the bloom gate (not far past it, unlike zodiacal's
 * near-Sun cone) and stays clearly subordinate to the zodiacal band's
 * peak — a fixed, camera-distance-independent backdrop rather than the
 * live "you are moving through the dust cloud" cue zodiacal light gives.
 *
 * ## Tier gate
 *
 * Composer tiers only (mirrors `ZodiacalLightSkybox`): `constrained` has
 * no HalfFloat composer buffer to additively blend into, so the layer
 * self-unmounts there rather than adding a second non-composited path.
 *
 * ## Render order
 *
 * Between the zodiacal band (furthest back, `renderOrder = -100`) and
 * the star catalogue (`renderOrder = -2`): `renderOrder = -50`. All
 * three use `depthTest: false` / `depthWrite: false` with additive
 * blending, so relative draw order does not change the composited
 * result — it documents the conceptual layering (deep-sky backdrop,
 * then the Milky Way panorama, then individually-resolved stars) rather
 * than gating visibility.
 */
export const MilkyWaySkybox = () => {
  const qualityMode = useStore((state) => state.qualityMode);
  const qualityProfile = useQualityProfile(qualityMode);
  const camera = useThree((state) => state.camera);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  // Constrained tier: no composer = no Milky Way layer. See component JSDoc.
  const enabled = qualityProfile.name !== "constrained";

  const { texture } = useDeferredTexture(
    enabled ? MILKY_WAY_TEXTURE_URL : null,
    {
      // Always-resident backdrop for the lifetime of the mount, not a
      // per-focus asset -- pin so it is never evicted by the budget
      // gate while a composer tier is active.
      pin: true,
      // Explicit for the record -- see the "Colour space" section above.
      colorSpace: THREE.SRGBColorSpace,
      // Lowest priority: never contends with a focused body's texture.
      priority: 3,
    }
  );

  // Equirect wrap: seamless at the +-180 deg meridian (u wraps 0/1),
  // clamped at the poles (v does not wrap). Not set by the shared cache
  // -- each consumer owns wrap semantics for its own UV usage, same as
  // `lensFlareSprites.ts`'s `applyLensFilter`/starburst helpers.
  /* eslint-disable react-hooks/immutability --
   * three.js textures are mutable GPU-resource handles by design (same
   * rationale Planet.tsx documents for material uniform writes); this
   * component is the sole owner of wrap mode for this URL, and
   * `deferredTextureCache` deliberately leaves wrap semantics to the
   * consumer (see its own doc comment) rather than guessing a default
   * that would be wrong for a non-equirect consumer of the same cache. */
  useEffect(() => {
    if (!texture) return;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }, [texture]);
  /* eslint-enable react-hooks/immutability */

  const uniforms = useMemo(
    () => ({
      u_milkyWayMap: { value: texture },
      u_brightnessMul: { value: MILKY_WAY_BRIGHTNESS_MULTIPLIER },
    }),
    [texture]
  );

  const material = useMemo(() => {
    if (!texture) return null;
    return new THREE.ShaderMaterial({
      uniforms,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      vertexShader: [
        "varying vec3 v_dir;",
        "void main() {",
        "  // Sphere is re-centered on the camera every frame (see",
        "  // useFrame below), so local 'position' is already the raw",
        "  // unrotated world-space look direction.",
        "  v_dir = position;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
        "}",
      ].join("\n"),
      fragmentShader: [
        "precision highp float;",
        "varying vec3 v_dir;",
        "uniform sampler2D u_milkyWayMap;",
        "uniform float u_brightnessMul;",
        MILKY_WAY_ORIENTATION_GLSL,
        "void main() {",
        "  vec3 dir = normalize(v_dir);",
        "  vec2 uv = milkyWayUv(dir);",
        "  // texture2D already returns LINEAR radiance -- the texture's",
        "  // sRGB colorSpace triggers hardware decode on sample. See the",
        "  // 'Colour space' section of this file's module doc.",
        "  vec3 color = texture2D(u_milkyWayMap, uv).rgb * u_brightnessMul;",
        "  gl_FragColor = vec4(color, 1.0);",
        "  #include <colorspace_fragment>",
        "}",
      ].join("\n"),
    });
  }, [uniforms, texture]);

  // Sync materialRef so useFrame below can read the live material
  // without tripping react-hooks/immutability on the memoised value.
  useEffect(() => {
    materialRef.current = material;
  }, [material]);

  // Skybox follow: re-center on the camera every frame, same idiom as
  // ZodiacalLightSkybox. No per-frame uniform updates are needed here --
  // unlike the zodiacal band, the Milky Way backdrop does not change
  // with heliocentric distance.
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.copy(camera.position);
    }
  });

  // Dispose the material on unmount / texture change. The texture itself
  // is owned by deferredTextureCache (pinned above) -- this component
  // must NOT dispose it; `useDeferredTexture`'s cleanup releases the pin
  // instead.
  useEffect(() => {
    return () => {
      material?.dispose();
    };
  }, [material]);

  if (!enabled || !material) return null;

  return (
    <mesh
      ref={meshRef}
      name="atlas-milky-way"
      material={material}
      frustumCulled={false}
      renderOrder={-50}
    >
      <icosahedronGeometry args={[1e8, 3]} />
    </mesh>
  );
};
