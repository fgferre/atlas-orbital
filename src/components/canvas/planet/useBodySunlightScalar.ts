/**
 * The 1-second-bucket cache in front of {@link resolveBodySunlightScalar},
 * shared by the two render paths that carry `u_solarIrradiance`.
 *
 * ## Why a cache
 *
 * No body's heliocentric distance drifts measurably over a wall-clock second,
 * while `resolveHeliocentricDistanceAU` walks a `parentId` chain and
 * allocates a `Vector3` per level — at 60 Hz across the catalogue that is
 * thousands of compositions per second for a number whose 6th decimal never
 * moves. Same bucket shape `useVisualPresetLerp.ts` already uses for the same
 * resolver.
 *
 * ## Why the policy and the tone-mapping flag are part of the key
 *
 * Both change the answer and both are user-visible switches. Keying on them
 * means flipping the assist position, or switching the Tone Mapping operator
 * to "None" (which arms the unmapped ceiling — see `SUNLIGHT_UNMAPPED_CEILING`),
 * takes effect on the NEXT frame instead of up to a second later.
 *
 * ## Why a hook returning a getter, rather than a hook returning the value
 *
 * The consumers are `useFrame` callbacks writing a uniform. Returning the
 * number would mean re-rendering React at 1 Hz per body to deliver a value
 * only the render loop reads; returning a stable getter keeps the whole path
 * imperative and allocation-free after the first call in each bucket.
 */

import { useCallback, useRef } from "react";

import { simulationClock } from "../../../lib/simulationClock";
import {
  getSunlightAssistPolicy,
  getSunlightToneMappingMounted,
  resolveBodySunlightScalar,
  type SunlightAssistPolicy,
} from "../../../lib/graphics/solarIrradiance";

/**
 * Returns a stable getter for `body`'s fused sunlight scalar
 * (`irradiance × assistGain`, capped when unmapped). Safe to call every frame.
 */
export const useBodySunlightScalar = (bodyId: string): (() => number) => {
  const cacheRef = useRef<{
    bucket: number;
    policy: SunlightAssistPolicy | null;
    toneMapped: boolean | null;
    value: number;
  }>({ bucket: -1, policy: null, toneMapped: null, value: 1 });

  return useCallback(() => {
    const bucket = Math.floor(Date.now() / 1000);
    const policy = getSunlightAssistPolicy();
    const toneMapped = getSunlightToneMappingMounted();
    const cache = cacheRef.current;

    if (
      cache.bucket !== bucket ||
      cache.policy !== policy ||
      cache.toneMapped !== toneMapped
    ) {
      cache.bucket = bucket;
      cache.policy = policy;
      cache.toneMapped = toneMapped;
      cache.value = resolveBodySunlightScalar(
        bodyId,
        simulationClock.getNow(),
        policy,
        toneMapped
      );
    }

    return cache.value;
  }, [bodyId]);
};
