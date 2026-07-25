import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

import { AstroPhysics } from "../../lib/astrophysics";
import { useStore } from "../../store";
import { GRID_RECURSIVE_CONFIG } from "./gridRecursiveConfig";
import { createGridFadeState, stepGridFade } from "./gridFade";
import { selectVisibleRegions } from "./gridRegions";
import { reserveLabelBox } from "./labelReservations";
import { computeViewExtentWorld } from "./shaders/gridRecScaling";

/**
 * Named regions on the ecliptic — "Asteroid belt", "Heliopause" — drawn
 * alongside the numeric AU ladder that `GridDecadeLabel` owns.
 *
 * **Why a separate component.** Same plane, different job. The AU ladder is
 * a measuring stick: evenly spaced decades, one dominant "current scale"
 * value, placed on the rings it names. Regions are landmarks: irregularly
 * spaced, tied to physical structure rather than to powers of ten, and they
 * must not steal emphasis from the scale reading. Folding them into the
 * ladder's pool would mean one declutter pass arbitrating two different
 * intents against each other.
 *
 * **Placed on the opposite side of the Sun** from the AU ladder (which
 * follows the camera's ground-forward heading). Landmarks and measurements
 * therefore occupy different radial lines and never queue up behind one
 * another, and both still publish into `labelReservations` so body labels
 * avoid them.
 *
 * **Honest under didactic compression.** The radius comes from
 * `AstroPhysics.auToWorld(au, scaleMode)` — the same mapping the planets
 * use — so "Asteroid belt" sits where the asteroids are in both scale
 * modes. Its dimmer styling is deliberate: the AU value is the checkable
 * quantity, the name is the intuition, and the name should not read as the
 * more authoritative of the two.
 */

const REGION_COLOR = "#8fb3c7";
const REGION_HALO = "#00060f";

/** Smaller than the AU ladder's 16 — landmarks sit behind measurements. */
const FONT_WORLD_BASE = 11;
const FONT_DISTANCE_DIVISOR = 1000;
const LABEL_SCALE_MAX_WORLD_UNITS = 1e12;

const ELEVATION_FADE_MIN_RAD = THREE.MathUtils.degToRad(6);
const ELEVATION_FADE_FULL_RAD = THREE.MathUtils.degToRad(18);

/** Regions are few; the pool covers the whole table with room to spare. */
const POOL_SIZE = 6;

const noopRaycast: THREE.Object3D["raycast"] = () => null;

const TMP_GROUND_HEADING = new THREE.Vector3();
const TMP_WORLD = new THREE.Vector3();

interface Slot {
  group: THREE.Group | null;
  text: THREE.Mesh | null;
  lastText: string;
}

export const GridRegionLabel = () => {
  const { camera } = useThree();
  const controls = useThree(
    (state) => state.controls
  ) as OrbitControlsImpl | null;
  const scaleMode = useStore((s) => s.scaleMode);
  const sceneReady = useStore((s) => s.isSceneReady);
  const introActive = useStore((s) => s.isIntroAnimating);
  const showGrid = useStore((s) => s.showEclipticGrid);
  const reducedMotion = useStore((s) => s.accessibility.reducedMotion);

  const slots = useRef<Slot[]>(
    Array.from({ length: POOL_SIZE }, () => ({
      group: null,
      text: null,
      lastText: "",
    }))
  );
  const fadeStateRef = useRef(createGridFadeState());
  const planeY = GRID_RECURSIVE_CONFIG.planeYOffset;

  useFrame((state, dt) => {
    const frame = state.gl.info.render.frame;
    const viewportHeight = state.size.height;
    const viewportWidth = state.size.width;
    const pixelsPerWorldUnitAtUnitDepth =
      viewportHeight /
      (2 *
        Math.tan(
          (((camera as THREE.PerspectiveCamera).fov ?? 45) * Math.PI) / 360
        ));

    // Rides the same fade as the rings and the AU ladder, so the whole grid
    // rises and falls as one element rather than in pieces.
    const gridFade = stepGridFade(
      fadeStateRef.current,
      { sceneReady, introActive, showGrid },
      scaleMode,
      dt,
      reducedMotion
    );

    const target = controls?.target ?? null;
    const viewExtentWorld = computeViewExtentWorld(camera, target);
    const viewExtentAU = AstroPhysics.worldToAu(viewExtentWorld, scaleMode);
    const regions = selectVisibleRegions(viewExtentAU);

    // Opposite the AU ladder's ground-forward heading.
    if (target) {
      TMP_GROUND_HEADING.set(target.x, 0, target.z);
    } else {
      TMP_GROUND_HEADING.set(0, 0, 0);
    }
    if (TMP_GROUND_HEADING.lengthSq() < 1e-6) {
      TMP_GROUND_HEADING.set(camera.position.x, 0, camera.position.z);
    }
    if (TMP_GROUND_HEADING.lengthSq() < 1e-6) {
      TMP_GROUND_HEADING.set(0, 0, 1);
    }
    TMP_GROUND_HEADING.normalize();
    // Azimuth comes from the FORWARD heading, the same one the AU ladder
    // spins its glyphs by, so the baselines run the same way across the
    // plane. Only the placement flips to the far side — negating the vector
    // before taking the azimuth spun the text 180° and rendered every
    // region name upside down.
    const azimuth = Math.atan2(TMP_GROUND_HEADING.x, TMP_GROUND_HEADING.z);
    TMP_GROUND_HEADING.negate();

    const horizDistToTarget = target
      ? Math.hypot(camera.position.x - target.x, camera.position.z - target.z)
      : Math.hypot(camera.position.x, camera.position.z);
    const elevation = Math.atan2(
      Math.abs(camera.position.y - planeY),
      Math.max(horizDistToTarget, 1e-6)
    );
    const elevationFade = THREE.MathUtils.clamp(
      (elevation - ELEVATION_FADE_MIN_RAD) /
        (ELEVATION_FADE_FULL_RAD - ELEVATION_FADE_MIN_RAD),
      0,
      1
    );
    const effectiveFade = elevationFade * gridFade;

    for (let i = 0; i < POOL_SIZE; i++) {
      const slot = slots.current[i]!;
      const group = slot.group;
      if (!group) continue;
      const region = regions[i];
      if (!region || effectiveFade <= 0.01) {
        group.visible = false;
        continue;
      }
      group.visible = true;

      const radius = AstroPhysics.auToWorld(region.au, scaleMode);
      group.position.set(
        TMP_GROUND_HEADING.x * radius,
        planeY,
        TMP_GROUND_HEADING.z * radius
      );
      group.rotation.order = "YXZ";
      group.rotation.set(-Math.PI / 2, azimuth, 0);

      const distance = group.position.distanceTo(camera.position);
      const rawScale = (distance / FONT_DISTANCE_DIVISOR) * FONT_WORLD_BASE;
      group.scale.setScalar(Math.min(rawScale, LABEL_SCALE_MAX_WORLD_UNITS));

      const textMesh = slot.text;
      if (textMesh) {
        if (region.label !== slot.lastText) {
          const troika = textMesh as unknown as {
            text?: string;
            sync?: () => void;
          };
          if ("text" in troika) {
            troika.text = region.label;
            troika.sync?.();
          }
          slot.lastText = region.label;
        }
        const material = textMesh.material as THREE.Material & {
          opacity?: number;
        };
        if (material) {
          material.transparent = true;
          material.opacity = effectiveFade * 0.75;
        }
      }

      if (effectiveFade > 0.35) {
        TMP_WORLD.copy(group.position).project(camera);
        const hPx =
          (FONT_WORLD_BASE / FONT_DISTANCE_DIVISOR) *
          pixelsPerWorldUnitAtUnitDepth;
        const wPx = region.label.length * hPx * 0.62;
        reserveLabelBox(frame, {
          x: ((TMP_WORLD.x + 1) / 2) * viewportWidth - wPx / 2,
          y: ((1 - TMP_WORLD.y) / 2) * viewportHeight - hPx / 2,
          w: wPx,
          h: hPx,
        });
      }
    }
  });

  return (
    <group raycast={noopRaycast}>
      {Array.from({ length: POOL_SIZE }, (_, i) => (
        <group
          key={i}
          ref={(g: THREE.Group | null) => {
            slots.current[i]!.group = g;
          }}
          visible={false}
          raycast={noopRaycast}
        >
          <Text
            ref={(t: THREE.Mesh | null) => {
              slots.current[i]!.text = t;
            }}
            fontSize={1}
            color={REGION_COLOR}
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.1}
            renderOrder={GRID_RECURSIVE_CONFIG.renderOrder + 2}
            outlineWidth="6%"
            outlineBlur="55%"
            outlineColor={REGION_HALO}
            outlineOpacity={0.85}
            raycast={noopRaycast}
          >
            {""}
          </Text>
        </group>
      ))}
    </group>
  );
};
