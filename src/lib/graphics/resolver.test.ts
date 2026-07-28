import { describe, expect, it } from "vitest";

import {
  getResolvedQualityProfileOptions,
  type DeviceSignals,
} from "../qualityProfile";
import {
  autoResolvePreset,
  mapPresetToTier,
  mapTierToPreset,
  PRESET_DEFAULTS,
  projectToLegacyShape,
  resolveActivePreset,
  resolveEffectiveGraphics,
  type GraphicsOverrides,
  type GraphicsStateLike,
} from "./resolver";

const NO_SIGNALS: DeviceSignals = {};

const stateFor = (
  preset: GraphicsStateLike["graphicsPreset"],
  overrides: GraphicsOverrides = {},
  auto = false,
  customBase: GraphicsStateLike["customBase"] = "high"
): GraphicsStateLike => ({
  graphicsPreset: preset,
  graphicsAutoMode: auto,
  graphicsOverrides: overrides,
  customBase,
});

describe("PRESET_DEFAULTS — byte-match to qualityProfile RESOLVED_PROFILES", () => {
  // Verification Gate #2 from graphics-settings-design.md §9:
  // "PRESET_DEFAULTS Rendering block byte-matches `RESOLVED_PROFILES` at
  // `qualityProfile.ts:73-104`." Below we assert every rendering-block
  // field on both sides produces byte-identical numbers for every tier,
  // so an accidental numeric drift fails CI on the spot.

  const legacy = getResolvedQualityProfileOptions();

  it.each([
    ["ultra", "ultra"],
    ["high", "high"],
    ["medium", "balanced"],
    ["low", "constrained"],
  ] as const)("preset %s matches legacy tier %s", (preset, tier) => {
    const p = PRESET_DEFAULTS[preset];
    const l = legacy[tier];
    expect(p.resolutionScale).toBe(l.dprMax);
    expect(p.antialias).toBe(l.antialias);
    expect(p.shadowMapSize).toBe(l.shadowMapSize);
    expect(p.environmentResolution).toBe(l.environmentResolution);
    expect(p.bloomEnabled).toBe(l.bloomEnabled);
    expect(p.bloomIntensityMul).toBe(l.bloomIntensityMultiplier);
    expect(p.vfxHdrGain).toBe(l.vfxHdrGain);
  });

  it("every *Mul field defaults to 1 in identity positions", () => {
    // bloomIntensityMul is the only Mul field where a preset CAN deviate
    // from 1 (it carries the quality-gate multiplier). All others must
    // be 1 on every preset so overrides compose cleanly.
    for (const preset of ["ultra", "high", "medium", "low"] as const) {
      const p = PRESET_DEFAULTS[preset];
      expect(p.saturationMul).toBe(1);
      expect(p.ambientIntensityMul).toBe(1);
      expect(p.sunIntensityMul).toBe(1);
      expect(p.shadowIntensityMul).toBe(1);
      expect(p.envMapIntensityMul).toBe(1);
    }
  });

  it("every *Delta field defaults to 0", () => {
    for (const preset of ["ultra", "high", "medium", "low"] as const) {
      const p = PRESET_DEFAULTS[preset];
      expect(p.contrastDelta).toBe(0);
      expect(p.brightnessDelta).toBe(0);
    }
  });

  it("filmic display transform defaults: AgX on composer tiers, none on constrained floor", () => {
    // AgX replaced "none" as the default on ultra/high/medium in 1a — see
    // resolver.ts:144 comment + tasks/archive/sweeps/opportunity-sweep-findings-v2-2026-06-16.md §127.
    // Why "none" stays on constrained: Scene.tsx unmounts the EffectComposer
    // entirely on that tier so a ToneMapping pass never runs anyway. Asserting the
    // differential instead of a uniform value makes the contract self-documenting
    // and means a regression on either side (composer on low, none on composer tiers)
    // fails here on the spot.
    expect(PRESET_DEFAULTS.ultra.toneMapping).toBe("agx");
    expect(PRESET_DEFAULTS.high.toneMapping).toBe("agx");
    expect(PRESET_DEFAULTS.medium.toneMapping).toBe("agx");
    expect(PRESET_DEFAULTS.low.toneMapping).toBe("none");
  });
});

describe("mapTierToPreset / mapPresetToTier — round-trip", () => {
  it.each([
    ["ultra", "ultra"],
    ["high", "high"],
    ["balanced", "medium"],
    ["constrained", "low"],
  ] as const)("tier %s ↔ preset %s", (tier, preset) => {
    expect(mapTierToPreset(tier)).toBe(preset);
    expect(mapPresetToTier(preset)).toBe(tier);
  });
});

describe("resolveEffectiveGraphics — preset selection", () => {
  it("returns the named preset base when not auto / not custom", () => {
    const result = resolveEffectiveGraphics(stateFor("high"), NO_SIGNALS);
    expect(result).toEqual(PRESET_DEFAULTS.high);
  });

  it("returns customBase preset when graphicsPreset === 'custom'", () => {
    const result = resolveEffectiveGraphics(
      stateFor("custom", {}, false, "medium"),
      NO_SIGNALS
    );
    expect(result.resolutionScale).toBe(PRESET_DEFAULTS.medium.resolutionScale);
    expect(result.antialias).toBe(PRESET_DEFAULTS.medium.antialias);
    expect(result.bloomIntensityMul).toBe(
      PRESET_DEFAULTS.medium.bloomIntensityMul
    );
  });

  it("ignores named preset when graphicsAutoMode is true", () => {
    // Heavy device — score ≥ 4 → ultra.
    const signals: DeviceSignals = {
      deviceMemory: 32,
      hardwareConcurrency: 16,
      viewportWidth: 2560,
      viewportHeight: 1440,
      devicePixelRatio: 1,
    };
    const result = resolveEffectiveGraphics(stateFor("low", {}, true), signals);
    expect(result).toEqual(PRESET_DEFAULTS.ultra);
  });

  it("auto-mode with empty signals scores 0 → medium preset", () => {
    const result = resolveEffectiveGraphics(
      stateFor("ultra", {}, true),
      NO_SIGNALS
    );
    expect(result).toEqual(PRESET_DEFAULTS.medium);
  });
});

describe("autoResolvePreset — scoring thresholds", () => {
  it("score ≥ 4 → ultra", () => {
    expect(
      autoResolvePreset({
        deviceMemory: 16,
        hardwareConcurrency: 12,
        viewportWidth: 1920,
        viewportHeight: 1080,
      })
    ).toBe("ultra");
  });

  it("score in [2,4) → high", () => {
    expect(
      autoResolvePreset({
        deviceMemory: 8,
        hardwareConcurrency: 8,
        viewportWidth: 1920,
        viewportHeight: 1080,
      })
    ).toBe("high");
  });

  it("score in [-1,2) → medium", () => {
    // deviceMemory 4 = -1; viewport 1440 = +1 → score 0 → medium.
    expect(
      autoResolvePreset({
        deviceMemory: 4,
        viewportWidth: 1440,
        viewportHeight: 900,
      })
    ).toBe("medium");
  });

  it("score < -1 → low", () => {
    expect(
      autoResolvePreset({
        deviceMemory: 2,
        hardwareConcurrency: 2,
        effectiveType: "2g",
        viewportWidth: 800,
        viewportHeight: 600,
        devicePixelRatio: 3,
      })
    ).toBe("low");
  });
});

describe("resolveEffectiveGraphics — overrides", () => {
  it("empty overrides is identity (preset === result)", () => {
    const result = resolveEffectiveGraphics(stateFor("ultra"), NO_SIGNALS);
    expect(result).toEqual(PRESET_DEFAULTS.ultra);
  });

  it("absolute override replaces preset value (bloomEnabled)", () => {
    const result = resolveEffectiveGraphics(
      stateFor("high", { bloomEnabled: false }),
      NO_SIGNALS
    );
    expect(result.bloomEnabled).toBe(false);
    // Other rendering fields stay at the preset base.
    expect(result.resolutionScale).toBe(PRESET_DEFAULTS.high.resolutionScale);
  });

  it("bloomIntensityMul composes multiplicatively with preset base", () => {
    // medium preset has bloomIntensityMul 0.75 → with override 2× → 1.5.
    const result = resolveEffectiveGraphics(
      stateFor("medium", { bloomIntensityMul: 2 }),
      NO_SIGNALS
    );
    expect(result.bloomIntensityMul).toBeCloseTo(0.75 * 2, 10);
  });

  it("bloomIntensity override is absolute and can opt into bloom over Gaia default", () => {
    const result = resolveEffectiveGraphics(
      stateFor("high", { bloomIntensity: 0.8 }),
      NO_SIGNALS
    );
    expect(result.bloomIntensity).toBe(0.8);
  });

  it("bloomThreshold override leaks through as absolute (preset base irrelevant)", () => {
    const result = resolveEffectiveGraphics(
      stateFor("ultra", { bloomThreshold: 0.42 }),
      NO_SIGNALS
    );
    expect(result.bloomThreshold).toBe(0.42);
  });

  it("saturationMul composes with preset (preset base 1)", () => {
    const result = resolveEffectiveGraphics(
      stateFor("ultra", { saturationMul: 1.5 }),
      NO_SIGNALS
    );
    expect(result.saturationMul).toBeCloseTo(1.5, 10);
  });

  it("contrastDelta composes additively with preset (preset base 0)", () => {
    const result = resolveEffectiveGraphics(
      stateFor("ultra", { contrastDelta: 0.2 }),
      NO_SIGNALS
    );
    expect(result.contrastDelta).toBeCloseTo(0.2, 10);
  });

  it("toneMapping override replaces preset default", () => {
    const result = resolveEffectiveGraphics(
      stateFor("high", { toneMapping: "aces" }),
      NO_SIGNALS
    );
    expect(result.toneMapping).toBe("aces");
  });

  it("vfxHdrGain absolute override replaces the tier default", () => {
    const result = resolveEffectiveGraphics(
      stateFor("ultra", { vfxHdrGain: 1.2 }),
      NO_SIGNALS
    );
    expect(result.vfxHdrGain).toBe(1.2);
  });
});

describe("resolveActivePreset", () => {
  it("returns named preset when not auto / not custom", () => {
    expect(resolveActivePreset(stateFor("high"), NO_SIGNALS)).toBe("high");
  });

  it("returns customBase when preset is custom", () => {
    expect(
      resolveActivePreset(stateFor("custom", {}, false, "medium"), NO_SIGNALS)
    ).toBe("medium");
  });

  it("returns auto-resolved when autoMode is true", () => {
    expect(
      resolveActivePreset(stateFor("low", {}, true), {
        deviceMemory: 16,
        hardwareConcurrency: 12,
      })
    ).toBe("ultra");
  });
});

describe("projectToLegacyShape — compat-shim invariant", () => {
  it("projects ultra effective to matching legacy profile", () => {
    const effective = resolveEffectiveGraphics(stateFor("ultra"), NO_SIGNALS);
    const legacy = projectToLegacyShape(effective, "ultra");
    const originalUltra = getResolvedQualityProfileOptions().ultra;
    expect(legacy).toEqual(originalUltra);
  });

  it("projects medium effective to balanced-tier legacy shape", () => {
    const effective = resolveEffectiveGraphics(stateFor("medium"), NO_SIGNALS);
    const legacy = projectToLegacyShape(effective, "medium");
    expect(legacy.name).toBe("balanced");
    expect(legacy.bloomIntensityMultiplier).toBe(0.75);
    expect(legacy.bloomEnabled).toBe(true);
    expect(legacy.vfxHdrGain).toBe(2.5);
  });

  it("projects low effective to constrained-tier legacy shape", () => {
    const effective = resolveEffectiveGraphics(stateFor("low"), NO_SIGNALS);
    const legacy = projectToLegacyShape(effective, "low");
    expect(legacy.name).toBe("constrained");
    expect(legacy.bloomEnabled).toBe(false);
    expect(legacy.bloomIntensityMultiplier).toBe(0);
    expect(legacy.vfxHdrGain).toBe(1.0);
  });

  it("projects user-override-mutated effective correctly", () => {
    const effective = resolveEffectiveGraphics(
      stateFor("high", { bloomEnabled: false, vfxHdrGain: 2.5 }),
      NO_SIGNALS
    );
    const legacy = projectToLegacyShape(effective, "high");
    expect(legacy.bloomEnabled).toBe(false);
    expect(legacy.vfxHdrGain).toBe(2.5);
    expect(legacy.dprMax).toBe(1.75);
  });
});
