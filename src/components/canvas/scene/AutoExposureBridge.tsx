import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

import {
  AUTO_EXPOSURE_RAMP_TAU_S,
  resolveFocusExposure,
  stepExposureLogTowards,
} from "../../../lib/graphics/autoExposure";
import { setExposureAnchor } from "../../../lib/graphics/exposureRegistry";
import {
  getSunlightAssistPolicy,
  getSunlightToneMappingMounted,
  type SunlightAssistPolicy,
} from "../../../lib/graphics/solarIrradiance";
import { simulationClock } from "../../../lib/simulationClock";
import { useStore } from "../../../store";

/**
 * Onda 2.4 — analytical auto-exposure. Drives the ANCHOR factor of the
 * exposure registry from the focused body's heliocentric distance, and
 * nothing else.
 *
 * All of the radiometry lives in `lib/graphics/autoExposure.ts` (pure,
 * unit-tested without an R3F tree). This component is the three lines
 * of glue that pure module cannot own: which body is focused, what time
 * it is, and how much of a frame just elapsed.
 *
 * ## Why `getState()` instead of a `useStore` selector
 *
 * A selector subscription would be correct but pointless: the value is
 * only ever read from inside `useFrame`, so a React re-render on focus
 * change would produce a new closure that reads exactly the same thing
 * the old one would have read one frame later. `getState()` keeps the
 * component render-inert for the whole session — it renders once, at
 * mount, and never again — which matters because it sits inside
 * `<Canvas>`, where a re-render tears down and re-registers the frame
 * callback.
 *
 * ## Why the 1 s bucket cache
 *
 * `resolveFocusExposure` walks the ephemeris chain
 * (`resolveHeliocentricDistanceAU` composes parent-centered satellite
 * positions up to the Sun, allocating a `Vector3` per level). No body's
 * heliocentric distance moves measurably in a wall-clock second, so the
 * same bucket-plus-invalidation-keys shape `useBodySunlightScalar.ts`
 * uses for the same resolver applies here — keyed additionally on the
 * focus id so a fly-to retargets on the very next frame instead of up
 * to a second later.
 *
 * The RAMP still runs every frame; only the target is cached. That is
 * what keeps a policy flip or a focus change from reading as a step.
 *
 * ## Composition with eye adaptation
 *
 * This bridge owns `setExposureAnchor` exclusively; `EyeAdaptationBridge`
 * owns `setExposureAdaptation` exclusively; the registry multiplies
 * them. Neither can observe or overwrite the other's factor — see
 * `exposureRegistry.ts` for why the composition is structural rather
 * than a convention two components are trusted to honour.
 */
export const AutoExposureBridge = () => {
  const cacheRef = useRef<{
    bucket: number;
    focusId: string | null;
    policy: SunlightAssistPolicy | null;
    toneMapped: boolean | null;
    target: number;
  }>({
    bucket: -1,
    focusId: null,
    policy: null,
    toneMapped: null,
    target: 1,
  });
  // The live, ramping value. Starts neutral, which is also the settled
  // value of the unfocused boot frame — so the first frame writes the
  // same 1.0 the registry already holds.
  const currentRef = useRef(1);

  useFrame((_, delta) => {
    const focusId = useStore.getState().focusId;
    const policy = getSunlightAssistPolicy();
    const toneMapped = getSunlightToneMappingMounted();
    const bucket = Math.floor(Date.now() / 1000);
    const cache = cacheRef.current;

    if (
      cache.bucket !== bucket ||
      cache.focusId !== focusId ||
      cache.policy !== policy ||
      cache.toneMapped !== toneMapped
    ) {
      cache.bucket = bucket;
      cache.focusId = focusId;
      cache.policy = policy;
      cache.toneMapped = toneMapped;
      cache.target = resolveFocusExposure(
        focusId,
        simulationClock.getNow(),
        policy,
        toneMapped
      );
    }

    const next = stepExposureLogTowards(
      currentRef.current,
      cache.target,
      delta,
      AUTO_EXPOSURE_RAMP_TAU_S
    );
    if (next !== currentRef.current) {
      currentRef.current = next;
      setExposureAnchor(next);
    }
  });

  return null;
};
