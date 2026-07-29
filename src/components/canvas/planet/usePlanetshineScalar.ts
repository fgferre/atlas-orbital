/**
 * The 1-second-bucket cache in front of {@link resolvePlanetshineScalar},
 * copying `useBodySunlightScalar.ts`'s idiom exactly (same cache shape,
 * same reasoning: no body's heliocentric distance — or, for the Moon, phase
 * — drifts measurably inside one wall-clock second).
 *
 * Only three bodies (Io, Europa, the Moon) ever read a nonzero value from
 * this; `resolvePlanetshineScalar` returns 0 immediately for anything else,
 * so it is safe — and cheap — to call this hook unconditionally from
 * `Planet.tsx`'s single shared component, mirroring how
 * `useBodySunlightScalar` is itself called for every body including ones
 * whose uniform lookup later no-ops (the Sun).
 */

import { useCallback, useRef } from "react";

import { simulationClock } from "../../../lib/simulationClock";
import {
  getSunlightAssistPolicy,
  getSunlightToneMappingMounted,
  type SunlightAssistPolicy,
} from "../../../lib/graphics/solarIrradiance";
import { resolvePlanetshineScalar } from "../../../lib/graphics/planetshine";

/**
 * Returns a stable getter for `bodyId`'s fused planetshine scalar (0 for a
 * non-recipient or a missing `parentId`). Safe to call every frame.
 */
export const usePlanetshineScalar = (
  bodyId: string,
  parentId: string | undefined
): (() => number) => {
  const cacheRef = useRef<{
    bucket: number;
    policy: SunlightAssistPolicy | null;
    toneMapped: boolean | null;
    value: number;
  }>({ bucket: -1, policy: null, toneMapped: null, value: 0 });

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
      cache.value = resolvePlanetshineScalar(
        bodyId,
        parentId,
        simulationClock.getNow(),
        policy,
        toneMapped
      );
    }

    return cache.value;
  }, [bodyId, parentId]);
};
