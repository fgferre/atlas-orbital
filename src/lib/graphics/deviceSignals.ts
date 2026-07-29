/**
 * Device-signal surface for the graphics resolver.
 *
 * This module is a thin re-export of the signal-collection and scoring
 * helpers that already live in `src/lib/qualityProfile.ts`. Keeping it
 * here matches the architecture in `tasks/graphics-settings-design.md`
 * (§7 resolver + §9 auto-downgrade) and lets downstream code import a
 * single concern from a single path — once the Wave 6 cleanup retires
 * the qualityProfile compat shim, those helpers move into this file
 * literally and the re-export becomes the definition.
 */

export {
  collectDeviceSignals,
  resolveQualityTierFromSignals,
  type DeviceConnectionLike,
  type DeviceSignals,
  type GpuCapabilitySignals,
  type NavigatorLike,
  type WindowLike,
} from "../qualityProfile";
