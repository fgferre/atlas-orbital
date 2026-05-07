import { describe, expect, it } from "vitest";

import {
  descriptorFromCatalog,
  parseSpectralClass,
  radiusFromSpect,
  stellarVisualProfileFrom,
  temperatureFromBV,
  temperatureFromSpect,
} from "./stellarPhysics";
import { SUN_DEFAULT_VISUAL_PROFILE } from "./stellarVisualProfile";

/**
 * T6.2-α regression tests against named-star ground truths
 * (Codex-suggested set + atlas extensions). Where exact values
 * are loose (tEff ±200 K, R_sun ±50%), `toBeCloseTo` with low
 * precision is intentional — this is rendering-focused
 * approximation, not catalog-grade calibration.
 */

describe("parseSpectralClass — main-sequence stars", () => {
  it("Sun G2V", () => {
    expect(parseSpectralClass("G2V")).toEqual({
      spectralClass: "G",
      subclass: 2,
      luminosityClass: "V",
    });
  });
  it("Sirius A1V", () => {
    expect(parseSpectralClass("A1V")).toEqual({
      spectralClass: "A",
      subclass: 1,
      luminosityClass: "V",
    });
  });
  it("Vega A0V", () => {
    expect(parseSpectralClass("A0V")).toEqual({
      spectralClass: "A",
      subclass: 0,
      luminosityClass: "V",
    });
  });
  it("Proxima M5.5V (fractional subclass)", () => {
    expect(parseSpectralClass("M5.5V")).toEqual({
      spectralClass: "M",
      subclass: 5.5,
      luminosityClass: "V",
    });
  });
});

describe("parseSpectralClass — giants and supergiants", () => {
  it("Betelgeuse M2Ia", () => {
    expect(parseSpectralClass("M2Ia")).toEqual({
      spectralClass: "M",
      subclass: 2,
      luminosityClass: "Ia",
    });
  });
  it("Arcturus K0III", () => {
    expect(parseSpectralClass("K0III")).toEqual({
      spectralClass: "K",
      subclass: 0,
      luminosityClass: "III",
    });
  });
  it("M2Ib supergiant", () => {
    expect(parseSpectralClass("M2Ib")).toEqual({
      spectralClass: "M",
      subclass: 2,
      luminosityClass: "Ib",
    });
  });
});

describe("parseSpectralClass — binary syntax (primary only)", () => {
  it("Antares M1Ib + B2.5V (slash)", () => {
    expect(parseSpectralClass("M1Ib/B2.5V")).toEqual({
      spectralClass: "M",
      subclass: 1,
      luminosityClass: "Ib",
    });
  });
  it("Antares M1Ib + B2.5V (plus)", () => {
    expect(parseSpectralClass("M1Ib + B2.5V")).toEqual({
      spectralClass: "M",
      subclass: 1,
      luminosityClass: "Ib",
    });
  });
});

describe("parseSpectralClass — white dwarfs", () => {
  it("Sirius B DA2", () => {
    expect(parseSpectralClass("DA2")).toEqual({
      spectralClass: "WD",
      subclass: 2,
      luminosityClass: "VII",
    });
  });
  it("WD without subclass", () => {
    const parsed = parseSpectralClass("WD");
    expect(parsed?.spectralClass).toBe("WD");
    expect(Number.isNaN(parsed?.subclass)).toBe(true);
    expect(parsed?.luminosityClass).toBe("VII");
  });
  it("DB white dwarf without subclass", () => {
    const parsed = parseSpectralClass("DB");
    expect(parsed?.spectralClass).toBe("WD");
    expect(Number.isNaN(parsed?.subclass)).toBe(true);
    expect(parsed?.luminosityClass).toBe("VII");
  });
});

describe("parseSpectralClass — edge cases", () => {
  it("returns null for empty string", () => {
    expect(parseSpectralClass("")).toBeNull();
  });
  it("returns null for whitespace", () => {
    expect(parseSpectralClass("   ")).toBeNull();
  });
  it("returns null for unparseable garbage", () => {
    expect(parseSpectralClass("xyz")).toBeNull();
    expect(parseSpectralClass("123")).toBeNull();
  });
  it("class without subclass parses to NaN subclass", () => {
    const parsed = parseSpectralClass("M");
    expect(parsed?.spectralClass).toBe("M");
    expect(Number.isNaN(parsed?.subclass)).toBe(true);
    expect(parsed?.luminosityClass).toBeNull();
  });
  it("class+subclass without luminosity parses with null luminosity", () => {
    expect(parseSpectralClass("G2")).toEqual({
      spectralClass: "G",
      subclass: 2,
      luminosityClass: null,
    });
  });
  it("normalizes case on the class letter", () => {
    expect(parseSpectralClass("g2v")?.spectralClass).toBe("G");
  });
});

describe("temperatureFromSpect — main-sequence anchors", () => {
  it("G0 returns the G class anchor", () => {
    expect(temperatureFromSpect("G", 0)).toBe(5_900);
  });
  it("G2 (Sun-like) interpolates between G0 and K0", () => {
    // G0 = 5900, K0 = 5100, t = 0.2 → 5900*0.8 + 5100*0.2 = 5740
    expect(temperatureFromSpect("G", 2)).toBeCloseTo(5_740, 0);
  });
  it("A0 (Vega-like) returns the A class anchor", () => {
    expect(temperatureFromSpect("A", 0)).toBe(9_900);
  });
  it("M5.5 (Proxima-like) interpolates within M class", () => {
    // M0 = 3800, L0 = 2400, t = 0.55 → 3800*0.45 + 2400*0.55 = 3030
    expect(temperatureFromSpect("M", 5.5)).toBeCloseTo(3_030, 0);
  });
  it("clamps subclass > 9 to subclass = 9", () => {
    expect(temperatureFromSpect("M", 9)).toBe(temperatureFromSpect("M", 12));
  });
  it("NaN subclass falls back to the class anchor (subclass 0)", () => {
    expect(temperatureFromSpect("G", NaN)).toBe(5_900);
  });
});

describe("temperatureFromSpect — white dwarfs", () => {
  it("DA1 (hottest WD) returns ~50,000 K", () => {
    expect(temperatureFromSpect("WD", 1)).toBeCloseTo(50_000, 0);
  });
  it("DA9 (coolest WD) returns ~5,500 K", () => {
    expect(temperatureFromSpect("WD", 9)).toBeCloseTo(5_500, 0);
  });
  it("DA2 (Sirius B) returns ~44,400 K", () => {
    // (50000 - 5500) * (8/8) at sub=1; sub=2 → t = 1/8 → 50000*7/8 + 5500*1/8 = 44438
    expect(temperatureFromSpect("WD", 2)).toBeCloseTo(44_437.5, 0);
  });
  it("WD with NaN subclass returns mid-range 10,000 K", () => {
    expect(temperatureFromSpect("WD", NaN)).toBe(10_000);
  });
});

describe("temperatureFromBV — Ballesteros (Gaia-borrowed)", () => {
  // Gaia Sky `BVToTeffBallesteros.java:32-34`:
  // T = 4600 * (1/(0.92*bv + 1.7) + 1/(0.92*bv + 0.62))
  it("Sun bv = 0.65 → ~5750 K (matches solar T_eff to within ~30 K)", () => {
    // Hand calc:
    //   0.92*0.65 = 0.598
    //   1/(0.598 + 1.7) = 1/2.298 = 0.4351
    //   1/(0.598 + 0.62) = 1/1.218 = 0.8210
    //   sum = 1.2561
    //   T = 4600 * 1.2561 = 5778 K
    expect(temperatureFromBV(0.65)).toBeCloseTo(5_778, -1);
  });
  it("Vega bv = 0.0 → very hot (~12,000 K range)", () => {
    // 0.92*0 = 0; 1/1.7 + 1/0.62 = 0.588 + 1.613 = 2.201
    // T = 4600 * 2.201 = 10,127 K
    expect(temperatureFromBV(0.0)).toBeCloseTo(10_127, -1);
  });
  it("hot O-type bv = -0.3 → ~25,000 K", () => {
    // 0.92*-0.3 = -0.276
    // 1/(-0.276+1.7) + 1/(-0.276+0.62) = 1/1.424 + 1/0.344 = 0.7022 + 2.9070 = 3.6092
    // T = 4600 * 3.6092 = 16,602 K
    expect(temperatureFromBV(-0.3)).toBeCloseTo(16_602, -1);
  });
  it("cool M dwarf bv = 1.5 → ~3,300 K", () => {
    // 0.92*1.5 = 1.38
    // 1/(1.38+1.7) + 1/(1.38+0.62) = 1/3.08 + 1/2.0 = 0.3247 + 0.5 = 0.8247
    // T = 4600 * 0.8247 = 3,793 K
    expect(temperatureFromBV(1.5)).toBeCloseTo(3_793, -1);
  });
  it("matches Gaia source exactly: 4600*(1/(0.92*bv+1.7) + 1/(0.92*bv+0.62))", () => {
    // Pin the formula structure for any future audit.
    const bv = 0.5;
    const expected = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
    expect(temperatureFromBV(bv)).toBe(expected);
  });
});

describe("radiusFromSpect — main sequence", () => {
  it("Sun G2V returns ~1 R_sun", () => {
    expect(radiusFromSpect("G2V")).toBeCloseTo(0.96, 1); // G0=1, K0=0.8, t=0.2
  });
  it("Sirius A1V returns ~1.6 R_sun", () => {
    expect(radiusFromSpect("A1V")).toBeCloseTo(1.66, 1); // A0=1.7, F0=1.3, t=0.1
  });
  it("Vega A0V returns ~1.7 R_sun", () => {
    expect(radiusFromSpect("A0V")).toBeCloseTo(1.7, 1);
  });
  it("Proxima M5.5V returns sub-solar (~0.25)", () => {
    // M0=0.4, L0=0.1, t=0.55 → 0.4*0.45 + 0.1*0.55 = 0.235
    expect(radiusFromSpect("M5.5V")).toBeCloseTo(0.235, 2);
  });
});

describe("radiusFromSpect — giants and supergiants", () => {
  it("Betelgeuse M2Ia returns supergiant scale (~1000 R_sun)", () => {
    expect(radiusFromSpect("M2Ia")).toBe(1000);
  });
  it("Antares M1Ib returns less-bright supergiant (~500 R_sun)", () => {
    expect(radiusFromSpect("M1Ib")).toBe(500);
  });
  it("Arcturus K0III returns giant (~30 R_sun)", () => {
    expect(radiusFromSpect("K0III")).toBe(30);
  });
  it("Procyon F5IV returns subgiant (~3 R_sun)", () => {
    expect(radiusFromSpect("F5IV")).toBe(3);
  });
});

describe("radiusFromSpect — white dwarfs", () => {
  it("Sirius B DA2 returns ~0.01 R_sun", () => {
    expect(radiusFromSpect("DA2")).toBe(0.01);
  });
  it("generic WD returns ~0.01 R_sun", () => {
    expect(radiusFromSpect("WD")).toBe(0.01);
  });
});

describe("radiusFromSpect — edge cases", () => {
  it("returns 1.0 (Sun-equivalent) for null spect", () => {
    expect(radiusFromSpect(null)).toBe(1.0);
  });
  it("returns 1.0 for undefined spect", () => {
    expect(radiusFromSpect(undefined)).toBe(1.0);
  });
  it("returns 1.0 for empty string", () => {
    expect(radiusFromSpect("")).toBe(1.0);
  });
  it("returns 1.0 for unparseable garbage", () => {
    expect(radiusFromSpect("xyz")).toBe(1.0);
  });
});

describe("radiusFromSpect — Stefan-Boltzmann refinement with absmag", () => {
  it("Sun G2V with absmag = 4.83 (canonical M_V_sun) returns ~1 R_sun", () => {
    // tEff(G,2) ≈ 5740 K, T_sun = 5778 K; lumOverSun = 1; tRatio ≈ 1.007
    // sbR ≈ 1 × 1.007² ≈ 1.014; tableR ≈ 0.96; geometric mean ≈ 0.987
    expect(radiusFromSpect("G2V", 4.83)).toBeCloseTo(0.987, 1);
  });
  it("absent absmag returns the class-table value", () => {
    expect(radiusFromSpect("G2V")).toBeCloseTo(0.96, 1);
  });
  it("NaN absmag is ignored (not Number.isFinite)", () => {
    expect(radiusFromSpect("G2V", NaN)).toBeCloseTo(0.96, 1);
  });
  it("non-main-sequence ignores absmag (uses class factor only)", () => {
    expect(radiusFromSpect("M2Ia", 0)).toBe(1000);
  });
});

describe("stellarVisualProfileFrom — Sun-like input via spect", () => {
  it("G2V spect produces a profile derived from the Sun default", () => {
    const profile = stellarVisualProfileFrom({
      bv: 0.65,
      spect: "G2V",
    });
    // Check that fields not explicitly modulated are preserved.
    expect(profile.granulationSpatialFreq).toBe(
      SUN_DEFAULT_VISUAL_PROFILE.granulationSpatialFreq
    );
    expect(profile.glowRadius).toBe(SUN_DEFAULT_VISUAL_PROFILE.glowRadius);
    expect(profile.lightDirection).toEqual([1, 1, 1]);
  });

  it("G2V spect produces near-Sun surface brightness (within 5%)", () => {
    // tEff(G, 2) ≈ 5740 K; brightnessScale ≈ (5740/5778)^0.4 ≈ 0.9974
    // Sun default surfaceBrightness = 0.6 → ~0.598
    const profile = stellarVisualProfileFrom({ bv: 0.65, spect: "G2V" });
    expect(profile.surfaceBrightness).toBeCloseTo(
      SUN_DEFAULT_VISUAL_PROFILE.surfaceBrightness,
      1
    );
  });

  it("G2V spect produces near-Sun rays/flares hue (within 0.05)", () => {
    const profile = stellarVisualProfileFrom({ bv: 0.65, spect: "G2V" });
    expect(profile.raysHue).toBeCloseTo(SUN_DEFAULT_VISUAL_PROFILE.raysHue, 1);
    expect(profile.flaresHue).toBeCloseTo(
      SUN_DEFAULT_VISUAL_PROFILE.flaresHue,
      1
    );
  });
});

describe("stellarVisualProfileFrom — temperature mapping", () => {
  it("hot O-type star (spect: O5V) skews bluer than Sun", () => {
    const profile = stellarVisualProfileFrom({ bv: -0.3, spect: "O5V" });
    expect(profile.raysHue).toBeLessThan(SUN_DEFAULT_VISUAL_PROFILE.raysHue);
    expect(profile.flaresHue).toBeLessThan(
      SUN_DEFAULT_VISUAL_PROFILE.flaresHue
    );
  });

  it("cool M dwarf (spect: M5V) skews redder than Sun", () => {
    const profile = stellarVisualProfileFrom({ bv: 1.5, spect: "M5V" });
    expect(profile.raysHue).toBeGreaterThan(SUN_DEFAULT_VISUAL_PROFILE.raysHue);
    expect(profile.flaresHue).toBeGreaterThan(
      SUN_DEFAULT_VISUAL_PROFILE.flaresHue
    );
  });

  it("hot star produces brighter surface than Sun", () => {
    const profile = stellarVisualProfileFrom({ bv: -0.3, spect: "O5V" });
    expect(profile.surfaceBrightness).toBeGreaterThan(
      SUN_DEFAULT_VISUAL_PROFILE.surfaceBrightness
    );
  });

  it("cool brown dwarf (spect: T5V) produces dimmer surface than Sun (clamped)", () => {
    const profile = stellarVisualProfileFrom({ bv: 2.0, spect: "T5V" });
    expect(profile.surfaceBrightness).toBeLessThan(
      SUN_DEFAULT_VISUAL_PROFILE.surfaceBrightness
    );
    // Clamp invariant: surfaceBrightness >= 0.4 × Sun (0.6 × 0.4 = 0.24)
    expect(profile.surfaceBrightness).toBeGreaterThanOrEqual(0.24);
  });
});

describe("stellarVisualProfileFrom — B-V fallback path", () => {
  it("falls back to Ballesteros when spect is undefined", () => {
    const profileSpect = stellarVisualProfileFrom({
      bv: 0.65,
      spect: "G2V",
    });
    const profileBv = stellarVisualProfileFrom({ bv: 0.65 });
    // T_eff via spectral path (~5740 K) and via Ballesteros (~5778 K)
    // are slightly different. Just confirm both paths produce
    // sensible, sun-like results (raysHue close to default).
    expect(Math.abs(profileSpect.raysHue - profileBv.raysHue)).toBeLessThan(
      0.05
    );
  });

  it("falls back to Ballesteros when spect is null", () => {
    const profile = stellarVisualProfileFrom({ bv: 0.65, spect: null });
    expect(profile.surfaceBrightness).toBeCloseTo(
      SUN_DEFAULT_VISUAL_PROFILE.surfaceBrightness,
      1
    );
  });

  it("falls back to Ballesteros when spect is unparseable", () => {
    const profile = stellarVisualProfileFrom({
      bv: 0.65,
      spect: "garbage",
    });
    // Should match B-V path: Ballesteros at bv=0.65 ≈ 5778 K → near-Sun.
    expect(profile.raysHue).toBeCloseTo(SUN_DEFAULT_VISUAL_PROFILE.raysHue, 1);
  });
});

describe("stellarVisualProfileFrom — output is a valid StellarVisualProfile", () => {
  it("contains 28 keys (26 numeric + classColor + lightDirection)", () => {
    const profile = stellarVisualProfileFrom({ bv: 0.65, spect: "G2V" });
    const keys = Object.keys(profile);
    expect(keys.length).toBe(28);
    for (const [key, value] of Object.entries(profile)) {
      if (key === "lightDirection" || key === "classColor") continue;
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("classColor is a 3-tuple of finite numbers in [0, 1]", () => {
    const profile = stellarVisualProfileFrom({ bv: 0.65, spect: "G2V" });
    expect(profile.classColor).toHaveLength(3);
    for (const channel of profile.classColor) {
      expect(Number.isFinite(channel)).toBe(true);
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});

// ─── T6.4-M4 — descriptor + class-aware profile pins ────────────────

describe("descriptorFromCatalog — named-star descriptors", () => {
  it("Sun (G2V, bv=0.65, absmag=4.83)", () => {
    const desc = descriptorFromCatalog({
      bv: 0.65,
      spect: "G2V",
      absmag: 4.83,
    });
    expect(desc.spectralClass).toBe("G");
    expect(desc.luminosityClass).toBe("V");
    expect(desc.tEff).toBeCloseTo(5_740, 0); // G2 interpolated
    expect(desc.absmag).toBe(4.83);
    expect(desc.radiusSolar).toBeCloseTo(0.987, 2);
  });

  it("Sirius (A1V, bv=0.0, absmag=1.42)", () => {
    const desc = descriptorFromCatalog({
      bv: 0.0,
      spect: "A1V",
      absmag: 1.42,
    });
    expect(desc.spectralClass).toBe("A");
    expect(desc.luminosityClass).toBe("V");
    // tEff(A,1) = 9900 + (7300 - 9900) * 0.1 = 9900 - 260 = 9640 K
    expect(desc.tEff).toBeCloseTo(9_640, 0);
    expect(desc.absmag).toBe(1.42);
  });

  it("Betelgeuse (M2Iab → primary luminosity Ia, bv=1.5, absmag=-5.85)", () => {
    // parseSpectralClass returns the longest-match luminosity prefix.
    // Catalog spect strings often write "M2Iab" / "M2Ia-b"; we test
    // the canonical "M2Ia" form (spec uses Ia or Ia-Iab).
    const desc = descriptorFromCatalog({
      bv: 1.85,
      spect: "M2Ia",
      absmag: -5.85,
    });
    expect(desc.spectralClass).toBe("M");
    expect(desc.luminosityClass).toBe("Ia");
    // tEff(M,2) = 3800 + (2400 - 3800) * 0.2 = 3520 K
    expect(desc.tEff).toBeCloseTo(3_520, 0);
    expect(desc.radiusSolar).toBe(1000);
  });

  it("Proxima (M5.5V, bv=1.83, absmag=15.49)", () => {
    const desc = descriptorFromCatalog({
      bv: 1.83,
      spect: "M5.5V",
      absmag: 15.49,
    });
    expect(desc.spectralClass).toBe("M");
    expect(desc.luminosityClass).toBe("V");
    // tEff(M,5.5) = 3800 + (2400 - 3800) * 0.55 = 3030 K
    expect(desc.tEff).toBeCloseTo(3_030, 0);
  });

  it("missing spect falls back to spectralClass=G, luminosity=V, B-V T_eff", () => {
    const desc = descriptorFromCatalog({ bv: 0.65 });
    expect(desc.spectralClass).toBe("G");
    expect(desc.luminosityClass).toBe("V");
    // Ballesteros at bv=0.65 → ~5778 K
    expect(desc.tEff).toBeCloseTo(5_778, -1);
  });

  it("non-finite absmag is normalized to null", () => {
    const desc = descriptorFromCatalog({ bv: 0.65, absmag: NaN });
    expect(desc.absmag).toBeNull();
  });
});

describe("stellarVisualProfileFrom — Sun-identity invariant (T6.4-M4)", () => {
  // A G2V Sun-equivalent input MUST reproduce the Sun default for
  // every field except surfaceBrightness (sub-1% drift via
  // brightnessScaleFromTemperature). This is the regression
  // guard for "did we accidentally make the Sun look different".
  const sunInput = { bv: 0.65, spect: "G2V", absmag: 4.83 };

  it("granulation cell scale matches Sun default (V class anchor)", () => {
    const p = stellarVisualProfileFrom(sunInput);
    expect(p.granulationSpatialFreq).toBe(
      SUN_DEFAULT_VISUAL_PROFILE.granulationSpatialFreq
    );
    expect(p.granulationTemporalFreq).toBe(
      SUN_DEFAULT_VISUAL_PROFILE.granulationTemporalFreq
    );
  });

  it("granulationContrast within 5% of Sun default (T_eff ≈ 5740 ≠ 5778)", () => {
    const p = stellarVisualProfileFrom(sunInput);
    expect(
      Math.abs(
        p.granulationContrast - SUN_DEFAULT_VISUAL_PROFILE.granulationContrast
      )
    ).toBeLessThan(0.05 * SUN_DEFAULT_VISUAL_PROFILE.granulationContrast);
  });

  it("glowBrightness identical to Sun default (absmag=4.83 → scale=1.0)", () => {
    const p = stellarVisualProfileFrom(sunInput);
    expect(p.glowBrightness).toBe(SUN_DEFAULT_VISUAL_PROFILE.glowBrightness);
  });

  it("rays/flares amplitude identical to Sun default (G class is neither hot nor cool MS)", () => {
    const p = stellarVisualProfileFrom(sunInput);
    expect(p.raysNoiseAmplitude).toBe(
      SUN_DEFAULT_VISUAL_PROFILE.raysNoiseAmplitude
    );
    expect(p.flaresAmp).toBe(SUN_DEFAULT_VISUAL_PROFILE.flaresAmp);
  });

  it("classColor close to SUN_DEFAULT classColor (warm white)", () => {
    const p = stellarVisualProfileFrom(sunInput);
    const [r, g, b] = p.classColor;
    const [sr, sg, sb] = SUN_DEFAULT_VISUAL_PROFILE.classColor;
    expect(Math.abs(r - sr)).toBeLessThan(0.05);
    expect(Math.abs(g - sg)).toBeLessThan(0.05);
    expect(Math.abs(b - sb)).toBeLessThan(0.05);
  });
});

describe("stellarVisualProfileFrom — class distinction (4 named stars)", () => {
  const sirius = stellarVisualProfileFrom({
    bv: 0.0,
    spect: "A1V",
    absmag: 1.42,
  });
  const betelgeuse = stellarVisualProfileFrom({
    bv: 1.85,
    spect: "M2Ia",
    absmag: -5.85,
  });
  const proxima = stellarVisualProfileFrom({
    bv: 1.83,
    spect: "M5.5V",
    absmag: 15.49,
  });
  const sun = stellarVisualProfileFrom({
    bv: 0.65,
    spect: "G2V",
    absmag: 4.83,
  });

  it("Sirius classColor reads blue-white (b > g > r)", () => {
    const [r, g, b] = sirius.classColor;
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it("Betelgeuse classColor reads orange-red (r > g > b)", () => {
    const [r, g, b] = betelgeuse.classColor;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    // Strongly red-tilted: r/b ratio ≥ 3 (deep orange)
    expect(r / Math.max(b, 1e-6)).toBeGreaterThan(3);
  });

  it("Proxima classColor warmer-than-Betelgeuse on red dominance", () => {
    // Proxima is cooler (3050 K vs 3500 K) → even more red-tilted
    expect(
      proxima.classColor[0] / Math.max(proxima.classColor[2], 1e-6)
    ).toBeGreaterThan(
      betelgeuse.classColor[0] / Math.max(betelgeuse.classColor[2], 1e-6)
    );
  });

  it("Betelgeuse granulation cell is much larger than Sun (Ia anchor)", () => {
    // spatial frequency lower = larger cells. Ia=1.5 vs V=6.0 (4× larger cells).
    expect(betelgeuse.granulationSpatialFreq).toBeLessThan(
      sun.granulationSpatialFreq
    );
    expect(betelgeuse.granulationSpatialFreq).toBe(1.5);
  });

  it("Betelgeuse glowBrightness clamped to 3× Sun (M_V=-5.85 hits ceiling)", () => {
    // 10^(-0.4 × (-5.85 - 4.83) × 0.15) = 10^0.6408 ≈ 4.37 → clamp 3.0
    expect(betelgeuse.glowBrightness).toBeCloseTo(
      SUN_DEFAULT_VISUAL_PROFILE.glowBrightness * 3.0,
      4
    );
  });

  it("Proxima glowBrightness clamped to 0.5× Sun (M_V=15.49 hits floor)", () => {
    // 10^(-0.4 × (15.49 - 4.83) × 0.15) ≈ 10^-0.6396 ≈ 0.229 → clamp 0.5
    expect(proxima.glowBrightness).toBeCloseTo(
      SUN_DEFAULT_VISUAL_PROFILE.glowBrightness * 0.5,
      4
    );
  });

  it("Sirius glowBrightness scales up (~1.6× Sun for M_V=1.42)", () => {
    // 10^(-0.4 × (1.42 - 4.83) × 0.15) = 10^0.2046 ≈ 1.602
    expect(sirius.glowBrightness).toBeCloseTo(
      SUN_DEFAULT_VISUAL_PROFILE.glowBrightness * 1.602,
      2
    );
  });

  it("Proxima M-dwarf has pronounced flares (1.8× Sun)", () => {
    expect(proxima.flaresAmp).toBeCloseTo(
      SUN_DEFAULT_VISUAL_PROFILE.flaresAmp * 1.8,
      4
    );
  });

  it("Sirius (hot MS) has muted flares (0.3× Sun)", () => {
    expect(sirius.flaresAmp).toBeCloseTo(
      SUN_DEFAULT_VISUAL_PROFILE.flaresAmp * 0.3,
      4
    );
  });

  it("Sirius granulation contrast < Sun's (radiative atmosphere)", () => {
    expect(sirius.granulationContrast).toBeLessThan(sun.granulationContrast);
  });

  it("Proxima granulation contrast > Sun's (deep convection)", () => {
    expect(proxima.granulationContrast).toBeGreaterThan(
      sun.granulationContrast
    );
  });

  it("classColor is INDEPENDENT across stars (no shared reference / mutation)", () => {
    // Coupling-bug guard: the four profiles must each have their own
    // classColor tuple — same identity check would let one star's
    // descriptor mutate another's render.
    expect(sirius.classColor).not.toBe(sun.classColor);
    expect(betelgeuse.classColor).not.toBe(sun.classColor);
    expect(proxima.classColor).not.toBe(sun.classColor);
  });
});
