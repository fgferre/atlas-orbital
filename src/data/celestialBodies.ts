import { type CelestialBody } from "../lib/astrophysics";

/**
 * ## Provenance of every `iauOrientation` record below
 *
 * Source: **NAIF/JPL generic planetary constants kernel `pck00011.tpc`**
 * (https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/), whose own header
 * cites Archinal, B.A. et al., "Report of the IAU Working Group on
 * Cartographic Coordinates and Rotational Elements: 2015", *Celestial
 * Mechanics and Dynamical Astronomy* **130**, 22 (2018),
 * DOI 10.1007/s10569-017-9805-5, **together with its published "Correction
 * to:"** — the erratum matters, since it revised table entries, so citing a
 * bare "IAU/WGCCRE 2015" would name the wrong document.
 *
 * The kernel is the transcription source rather than the paper because it is
 * machine-readable: `BODY<n>_POLE_RA`, `_POLE_DEC` and `_PM` map one-to-one
 * onto `poleRaDeg`/`poleDecDeg`/`primeMeridianDeg` plus their rates, which
 * removes the "read a number out of a PDF table" step that this wave's risk
 * section is entirely about.
 *
 * **The satellite records below were not typed by a human at all.** W6 stage B
 * added twenty-two bodies carrying up to twenty-six periodic terms each,
 * indexed *positionally* into a shared angle table, and at that size reading
 * by eye is how one amplitude ends up on the wrong argument. They are emitted
 * by `scripts/derive-iau-orientation.js`, which parses the kernel. That script
 * also re-emits the nine bodies stage A transcribed by hand, and reproduces
 * all 54 of their secular coefficients exactly — two independent routes to the
 * same numbers, which is what makes the other twenty-two trustworthy.
 *
 * **Periodic terms are transcribed in full for those twenty-two.** The draft
 * plan called for dropping them and disclosing each amplitude against a ~1°
 * budget; the parser made that unnecessary, and the measured amplitudes show
 * it would have been badly wrong — Mimas's prime meridian librates **44.85°**,
 * Triton's pole **32.35°**, Tethys 9.66°, Miranda 4.41°. The only truncations
 * left are the three stage A recorded (Mercury 0.012°, Jupiter 0.005°, and
 * Mars's M1–M5 terms at 0.0004°), each disclosed in its own record.
 */
const TEXTURE_PATH = (import.meta.env.BASE_URL || "/") + "textures/";
const MODEL_PATH = (import.meta.env.BASE_URL || "/") + "models/";
const VESTA_DAWN_TEXTURE = TEXTURE_PATH + "vesta_dawn_embedded.png";
const HYGIEA_VLT_TEXTURE = TEXTURE_PATH + "hygiea_vlt_2017_2018_map.png";

export const SOLAR_SYSTEM_BODIES: CelestialBody[] = [
  {
    id: "sun",
    type: "star",
    name: { en: "SUN", pt: "SOL" },
    radiusKm: 696340,
    color: "#FFFFAA",
    orbit: { a: 0, e: 0, i: 0, O: 0, w: 0, M0: 0, n: 0 },
    rotationPeriodHours: 600,
    axialTilt: 7.25,
    /** No periodic terms in the IAU model for the Sun. */
    iauOrientation: {
      poleRaDeg: 286.13,
      poleDecDeg: 63.87,
      primeMeridianDeg: 84.176,
      spinRateDegPerDay: 14.1844,
    },
    classification: "Star",
    mass: "1.989 × 10³⁰ kg",
    gravity: "274 m/s²",
    composition: "73% hydrogen, 25% helium, 2% heavier elements",
    atmosphere: "Photosphere, chromosphere, corona",
    dayLength: "~24.47 days (equator), ~34 days (poles)",
    yearLength: "Not applicable (central point of the system)",
    curiosity:
      "The Sun accounts for 99.86% of the total mass of the entire Solar System. It consumes about 600 million tons of hydrogen every second.",
    facts: [
      "Light from the Sun takes 8 minutes and 20 seconds to reach Earth.",
      "The Sun's core temperature is about 15 million degrees Celsius.",
      "It rotates faster at its equator than at its poles (differential rotation).",
      "Solar flares can disrupt communications and power grids on Earth.",
    ],
    records: [
      "Most massive object in the system",
      "Hottest surface in the system",
    ],
    explorationMilestone: {
      year: 2018,
      description: "Parker Solar Probe launched to touch the Sun",
    },
    spectralClass: "G2V",
    description:
      "The Sun is the star at the center of our Solar System. It is a nearly perfect sphere of hot plasma, heated to incandescence by nuclear fusion reactions in its core. Radiating the energy mainly as visible light and infrared radiation, it is by far the most important source of energy for life on Earth. Its diameter is about 1.39 million kilometers, or 109 times that of Earth.",
    distanceFromParent: "149,600,000 km (1 AU)",
    info: "The heart of our solar system.",
    textures: {
      map: TEXTURE_PATH + "8k_sun.jpg",
    },
  },
  {
    id: "mercury",
    group: "inner",
    type: "planet",
    name: { en: "MERCURY", pt: "MERCÚRIO" },
    radiusKm: 2439,
    color: "#A5A5A5",
    airlessRegolith: true,
    orbit: {
      a: 0.387,
      e: 0.205,
      i: 7.0,
      O: 48.3,
      w: 29.1,
      M0: 174.7,
      n: 4.092,
    },
    rotationPeriodHours: 1407.6,
    axialTilt: 0.03,
    /**
     * Drops the five libration terms on W (arguments M1–M5), whose amplitudes
     * sum to 0.012°. That is two orders below the ~1° budget any check in this
     * wave uses, and it does not touch the 3:2 spin–orbit resonance itself,
     * which lives in the 6.1385108°/day rate.
     */
    iauOrientation: {
      poleRaDeg: 281.0103,
      poleRaRateDegPerCentury: -0.0328,
      poleDecDeg: 61.4155,
      poleDecRateDegPerCentury: -0.0049,
      primeMeridianDeg: 329.5988,
      spinRateDegPerDay: 6.1385108,
    },
    classification: "Terrestrial Planet",
    mass: "3.301 × 10²³ kg",
    gravity: "3.7 m/s²",
    composition: "Rock and iron",
    atmosphere:
      "Very tenuous, composed of traces of sodium, potassium, oxygen, helium",
    dayLength: "58.6 Earth days",
    yearLength: "87.97 Earth days",
    curiosity:
      "Despite being closest to the Sun, Mercury is not the hottest planet—Venus is. Mercury has no atmosphere to trap heat, leading to extreme temperature swings.",
    facts: [
      "Mercury has a huge metallic core, comprising about 85% of its radius.",
      "A day on Mercury (sunrise to sunrise) lasts 176 Earth days.",
      "It has the most eccentric orbit of all the planets.",
      "Temperatures range from -173°C at night to 427°C during the day.",
    ],
    records: ["Smallest planet", "Most cratered planet"],
    explorationMilestone: {
      year: 2011,
      description: "MESSENGER became the first spacecraft to orbit Mercury",
    },
    description:
      "Mercury is the smallest planet in the Solar System and the closest to the Sun. Its orbit around the Sun takes 87.97 Earth days, the shortest of all the Sun's planets. It is named after the Roman deity Mercury, the messenger of the gods. Like Venus, Mercury orbits the Sun within Earth's orbit as an inferior planet, and its apparent distance from the Sun as viewed from Earth never exceeds 28°.",
    distanceFromParent: "57,910,000 km",
    info: "Smallest planet.",
    textures: { map: TEXTURE_PATH + "8k_mercury.jpg" },
  },
  {
    id: "venus",
    group: "inner",
    type: "planet",
    name: { en: "VENUS", pt: "VÊNUS" },
    radiusKm: 6051,
    color: "#E3BB76",
    orbit: {
      a: 0.723,
      e: 0.006,
      i: 3.39,
      O: 76.6,
      w: 54.8,
      M0: 50.1,
      n: 1.602,
    },
    rotationPeriodHours: -5832.5,
    axialTilt: 177.3,
    /** No periodic terms; W is negative because Venus rotates retrograde. */
    iauOrientation: {
      poleRaDeg: 272.76,
      poleDecDeg: 67.16,
      primeMeridianDeg: 160.2,
      spinRateDegPerDay: -1.4813688,
    },
    classification: "Terrestrial Planet",
    mass: "4.867 × 10²⁴ kg",
    gravity: "8.87 m/s²",
    composition: "Silicate rocks",
    atmosphere: "96% carbon dioxide, clouds of sulfuric acid",
    dayLength: "243 Earth days (retrograde rotation)",
    yearLength: "224.7 Earth days",
    curiosity:
      "Venus spins in the opposite direction to most other planets (retrograde rotation). This means the Sun rises in the west and sets in the east.",
    facts: [
      "Its thick atmosphere traps heat, making it the hottest planet (462°C).",
      "Atmospheric pressure is 92 times greater than Earth's.",
      "Venus turns once every 243 days — longer than its 225-day year — but it spins backwards, so sunrise to sunrise takes only about 117 days.",
      "It is the brightest natural object in Earth's night sky after the Moon.",
    ],
    records: ["Hottest planet", "Slowest rotation"],
    explorationMilestone: {
      year: 1970,
      description:
        "Venera 7 became the first spacecraft to land on another planet",
    },
    description:
      "Venus is the second planet from the Sun. It is named after the Roman goddess of love and beauty. As the brightest natural object in Earth's night sky after the Moon, Venus can cast shadows and can be visible to the naked eye in broad daylight. Venus is a terrestrial planet and is sometimes called Earth's 'sister planet' because of their similar size, mass, proximity to the Sun, and bulk composition.",
    distanceFromParent: "108,200,000 km",
    info: "Thick atmosphere.",
    textures: {
      map: TEXTURE_PATH + "8k_venus_surface.jpg",
      atmosphere: TEXTURE_PATH + "4k_venus_atmosphere.jpg",
    },
  },
  {
    id: "earth",
    group: "inner",
    type: "planet",
    name: { en: "EARTH", pt: "TERRA" },
    radiusKm: 6371,
    color: "#4facfe",
    orbit: { a: 1.0, e: 0.016, i: 0.0, O: 0.0, w: 102.9, M0: 357.5, n: 0.985 },
    rotationPeriodHours: 23.93,
    axialTilt: 23.44,
    /**
     * The one body whose phase origin is independently falsifiable, and the
     * reason this record replaced a hand-tuned constant: the field that used
     * to sit here was `rotationOffsetDegrees: 140`, whose own comment admitted
     * it was "adjusted to align Brazil with late afternoon sun". W₀ = 190.147°
     * is measured, and `bodyOrientation.test.ts` checks it against Greenwich
     * mean sidereal time — a quantity from the IERS Earth-rotation
     * convention that shares no constant with Archinal's tables.
     *
     * No periodic terms in the IAU model. Note this is a deliberately coarse
     * Earth-rotation model (the report says so): it drifts a few tenths of a
     * degree per century against the full IERS series, which is why the gate
     * measures ~0.06° rather than ~0.
     */
    iauOrientation: {
      poleRaDeg: 0.0,
      poleRaRateDegPerCentury: -0.641,
      poleDecDeg: 90.0,
      poleDecRateDegPerCentury: -0.557,
      primeMeridianDeg: 190.147,
      spinRateDegPerDay: 360.9856235,
    },
    classification: "Terrestrial Planet",
    mass: "5.972 × 10²⁴ kg",
    gravity: "9.8 m/s²",
    composition: "Rocks, iron, water, varied atmosphere",
    atmosphere: "78% nitrogen, 21% oxygen, 1% other gases",
    dayLength: "23h 56min (sidereal)",
    yearLength: "365.25 days",
    curiosity:
      "Earth is the only planet not named after a Greek or Roman god. The name comes from Old English and Germanic words meaning 'ground'.",
    facts: [
      "Earth's atmosphere is 78% nitrogen and 21% oxygen.",
      "It has a powerful magnetic field that protects us from solar wind.",
      "The planet is actually an oblate spheroid, bulging at the equator.",
      "71% of the surface is covered by water.",
    ],
    records: ["Densest planet", "Only known life"],
    explorationMilestone: {
      year: 1961,
      description: "Yuri Gagarin became the first human in space",
    },
    description:
      "Earth is the third planet from the Sun and the only astronomical object known to harbor life. About 29% of Earth's surface is land consisting of continents and islands. The remaining 71% is covered with water, mostly by oceans, seas, gulfs, and other salt-water bodies, but also by lakes, rivers, and other freshwater, which together constitute the hydrosphere.",
    distanceFromParent: "149,600,000 km",
    info: "Our home.",
    textures: {
      map: TEXTURE_PATH + "8k_earth_daymap.jpg",
      night: TEXTURE_PATH + "8k_earth_nightmap.jpg",
      clouds: TEXTURE_PATH + "8k_earth_clouds.jpg",
      normal: TEXTURE_PATH + "8k_earth_normal_map.jpg",
      roughness: TEXTURE_PATH + "8k_earth_roughness_map.jpg",
    },
    // Rayleigh+Mie atmospheric scattering (θ.5b-d). Opting Earth in;
    // optional fields fall through to Gaia's `AtmosphereComponent`
    // class-level defaults (eSun=10, mieAsymmetryG=+0.76,
    // sampleCount=23, scaleDepth=0.25, outerRadiusRatio=1.025).
    // Required trio: Nishita Earth literature values — no Gaia source
    // ground truth (Gaia loads Earth's Kr/Km/wavelengths from
    // `$GS_DATA`, not from the MPL-licensed repo).
    atmosphereScattering: {
      kRayleigh: 0.0025,
      kMie: 0.0015,
      wavelengthsUm: [0.65, 0.57, 0.475],
    },
    // W7 eclipse: the Moon occludes the Sun for Earth during solar
    // eclipses — real umbra/penumbra cone from `eclipseGeometry.ts`
    // (anchored to 2024-04-08, which renders total, and 2023-10-14,
    // which renders annular), shader patch in `usePlanetMaterials`,
    // per-frame uniforms in `Planet.tsx`.
    eclipsingBodyId: "moon",
  },
  {
    id: "mars",
    group: "inner",
    type: "planet",
    name: { en: "MARS", pt: "MARTE" },
    radiusKm: 3389,
    flattening: 0.0058979,
    color: "#DD4422",
    orbit: {
      a: 1.523,
      e: 0.093,
      i: 1.85,
      O: 49.5,
      w: 286.5,
      M0: 19.4,
      n: 0.524,
    },
    rotationPeriodHours: 24.62,
    axialTilt: 25.19,
    /**
     * Mars is the one body here where the periodic terms are **not** optional.
     * Three of them carry amplitudes of 0.419° (α₀), 1.591° (δ₀) and 0.585°
     * (W) on arguments whose rate is 0.5042615°/century — a ~71 000-year
     * period, so over any date this app renders they act as near-constant
     * offsets rather than as a wobble. Dropping them would bias the pole by
     * 1.6°, past the ~1° budget, and would look like a correct model.
     *
     * Independent confirmation that the sign convention here is right (sin for
     * α₀/W, cos for δ₀): evaluating this record at J2000 reproduces 317.68° /
     * 52.89°, the rounded pole this catalog previously carried from an
     * unrelated source. The remaining M1–M5-driven terms are dropped; their
     * amplitudes peak at 0.0004°.
     */
    iauOrientation: {
      poleRaDeg: 317.269202,
      poleRaRateDegPerCentury: -0.10927547,
      poleDecDeg: 54.432516,
      poleDecRateDegPerCentury: -0.05827105,
      primeMeridianDeg: 176.049863,
      spinRateDegPerDay: 350.891982443297,
      nutPrec: [
        {
          phaseDeg: 79.398797,
          rateDegPerCentury: 0.5042615,
          raAmpDeg: 0.419057,
        },
        {
          phaseDeg: 166.325722,
          rateDegPerCentury: 0.5042615,
          decAmpDeg: 1.591274,
        },
        {
          phaseDeg: 95.391654,
          rateDegPerCentury: 0.5042615,
          pmAmpDeg: 0.584542,
        },
      ],
    },
    classification: "Terrestrial Planet",
    mass: "6.417 × 10²³ kg",
    gravity: "3.71 m/s²",
    composition: "Rocks, oxidized iron, basalts",
    atmosphere: "95% carbon dioxide, 3% nitrogen, traces of argon and oxygen",
    dayLength: "24h 37min",
    yearLength: "687 Earth days",
    curiosity:
      "Mars is home to Olympus Mons, the largest volcano in the solar system, and Valles Marineris, one of the largest canyons.",
    facts: [
      "Mars has two small moons, Phobos and Deimos.",
      "There is strong evidence that Mars once had liquid water on its surface.",
      "Dust storms can cover the entire planet and last for months.",
      "A year on Mars is 687 Earth days - nearly twice as long.",
    ],
    records: [
      "Tallest mountain (Olympus Mons)",
      "Largest canyon (Valles Marineris)",
    ],
    explorationMilestone: {
      year: 2021,
      description:
        "Perseverance rover landed and deployed the Ingenuity helicopter",
    },
    description:
      "Mars is the fourth planet from the Sun and the second-smallest planet in the Solar System, being larger than only Mercury. In English, Mars carries the name of the Roman god of war and is often referred to as the 'Red Planet'. The latter refers to the effect of the iron oxide prevalent on Mars's surface, which gives it a reddish appearance distinctive among the astronomical bodies visible to the naked eye.",
    distanceFromParent: "227,940,000 km",
    info: "Red planet.",
    textures: { map: TEXTURE_PATH + "8k_mars.jpg" },
  },
  {
    id: "phobos",
    parentId: "mars",
    type: "moon",
    name: { en: "PHOBOS", pt: "FOBOS" },
    radiusKm: 11,
    color: "#B0A090",
    orbit: { a: 0.0000627, e: 0.0151, i: 1.093, O: 0, w: 0, M0: 0, n: 1128.8 },
    rotationPeriodHours: 7.65,
    iauOrientation: {
      poleRaDeg: 317.67071657,
      poleRaRateDegPerCentury: -0.10844326,
      poleDecDeg: 52.88627266,
      poleDecRateDegPerCentury: -0.06134706,
      primeMeridianDeg: 35.1877444,
      spinRateDegPerDay: 1128.84475928,
      spinAccelDegPerDay2: 9.536137031212154e-9,
      nutPrec: [
        {
          phaseDeg: 190.72646643,
          rateDegPerCentury: 15917.10818695,
          raAmpDeg: -1.78428399,
          decAmpDeg: -1.07516537,
          pmAmpDeg: 1.42421769,
        },
        {
          phaseDeg: 21.4689247,
          rateDegPerCentury: 31834.27934054,
          raAmpDeg: 0.02212824,
          decAmpDeg: 0.00668626,
          pmAmpDeg: -0.02273783,
        },
        {
          phaseDeg: 332.86082793,
          rateDegPerCentury: 19139.89694742,
          raAmpDeg: -0.01028251,
          decAmpDeg: -0.0064874,
          pmAmpDeg: 0.00410711,
        },
        {
          phaseDeg: 394.93256437,
          rateDegPerCentury: 38280.79631835,
          raAmpDeg: -0.00475595,
          decAmpDeg: 0.00281576,
          pmAmpDeg: 0.00631964,
        },
        {
          phaseDeg: 189.6327156,
          rateDegPerCentury: 41215158.1842005,
          rateDegPerCentury2: 12.711923222,
          pmAmpDeg: -1.143,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "1.06 × 10¹⁶ kg",
    gravity: "0.0057 m/s²",
    composition: "Rock, dust",
    atmosphere: "None",
    dayLength: "7.65 hours",
    yearLength: "0.32 days",
    curiosity:
      "Phobos is spiraling inward at a rate of 2 meters every century. In about 50 million years, it will either crash into Mars or break up into a ring.",
    facts: [
      "It is named after the Greek god Phobos, a son of Ares (Mars) and Aphrodite (Venus).",
      "Its surface is covered in regolith and has a large impact crater named Stickney.",
      "Phobos is likely a captured asteroid.",
    ],
    records: ["Closest orbiting moon", "Shortest orbital period for a moon"],
    explorationMilestone: {
      year: 1971,
      description: "Mariner 9 provided the first close-up images",
    },
    description:
      "Phobos is the larger and closer of the two natural satellites of Mars. It is a small, irregularly shaped object with a mean radius of 11 km. Phobos orbits Mars much closer than any other major moon orbits its planet, completing an orbit in just 7 hours and 39 minutes. As a result, it rises in the west, moves across the sky in 4 hours and 15 minutes, and sets in the east, twice each Martian day.",
    distanceFromParent: "9,376 km",
    info: "Mars moon.",
    textures: { map: TEXTURE_PATH + "phobos_nasa_3d_resource.jpg" },
  },
  {
    id: "deimos",
    parentId: "mars",
    type: "moon",
    name: { en: "DEIMOS", pt: "DEIMOS" },
    radiusKm: 6,
    color: "#C0B0A0",
    orbit: { a: 0.000156, e: 0.0002, i: 0.93, O: 0, w: 0, M0: 0, n: 285.1 },
    rotationPeriodHours: 30.3,
    iauOrientation: {
      poleRaDeg: 316.65705808,
      poleRaRateDegPerCentury: -0.10518014,
      poleDecDeg: 53.50992033,
      poleDecRateDegPerCentury: -0.05979094,
      primeMeridianDeg: 79.39932954,
      spinRateDegPerDay: 285.16188899,
      nutPrec: [
        {
          phaseDeg: 121.46893664,
          rateDegPerCentury: 660.22803474,
          raAmpDeg: 3.09217726,
          decAmpDeg: 1.83936004,
          pmAmpDeg: -2.73954829,
        },
        {
          phaseDeg: 231.05028581,
          rateDegPerCentury: 660.9912354,
          raAmpDeg: 0.22980637,
          decAmpDeg: 0.1432532,
          pmAmpDeg: -0.39968606,
        },
        {
          phaseDeg: 251.37314025,
          rateDegPerCentury: 1320.50145245,
          raAmpDeg: 0.06418655,
          decAmpDeg: 0.01911409,
          pmAmpDeg: -0.06563259,
        },
        {
          phaseDeg: 217.98635955,
          rateDegPerCentury: 38279.9612555,
          raAmpDeg: 0.02533537,
          decAmpDeg: -0.0148259,
          pmAmpDeg: -0.0291294,
        },
        {
          phaseDeg: 196.19729402,
          rateDegPerCentury: 19139.83628608,
          raAmpDeg: 0.00778695,
          decAmpDeg: 0.0019243,
          pmAmpDeg: 0.0169916,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "1.48 × 10¹⁵ kg",
    gravity: "0.003 m/s²",
    composition: "Rock, dust",
    atmosphere: "None",
    dayLength: "30.3 hours",
    yearLength: "1.26 days",
    curiosity:
      "From Mars, Deimos would appear as a bright star-like object, slightly larger than Venus appears from Earth. It would not be large enough to cause a total solar eclipse.",
    facts: [
      "Deimos is gradually moving away from Mars.",
      "It is named after Deimos, the Greek god of dread and terror.",
      "Its escape velocity is only 5.6 m/s - you could jump off it with a bike.",
    ],
    records: ["Smallest major moon", "Smoothest surface among small moons"],
    explorationMilestone: {
      year: 1977,
      description: "Viking orbiters provided detailed imagery",
    },
    description:
      "Deimos is the smaller and outer of the two natural satellites of Mars. It has a mean radius of 6.2 km and takes 30.3 hours to orbit Mars. Like Phobos, Deimos has a lumpy, non-spherical shape and is heavily cratered, though its craters are generally smaller and filled with regolith, giving it a smoother appearance.",
    distanceFromParent: "23,463 km",
    info: "Mars moon.",
    textures: { map: TEXTURE_PATH + "deimos_nasa_3d_resource.jpg" },
  },
  {
    id: "jupiter",
    group: "outer",
    type: "planet",
    name: { en: "JUPITER", pt: "JÚPITER" },
    radiusKm: 69911,
    flattening: 0.064887,
    color: "#D9A066",
    orbit: {
      a: 5.204,
      e: 0.048,
      i: 1.3,
      O: 100.5,
      w: 273.8,
      M0: 20.0,
      n: 0.083,
    },
    rotationPeriodHours: 9.93,
    axialTilt: 3.13,
    /**
     * W is System III (the magnetic-field rotation), which is what "Jupiter's
     * rotation period" conventionally means for a body with no surface.
     * Drops the Ja–Je periodic terms: 0.005° peak on α₀, 0.002° on δ₀, and
     * exactly zero on W.
     */
    iauOrientation: {
      poleRaDeg: 268.056595,
      poleRaRateDegPerCentury: -0.006499,
      poleDecDeg: 64.495303,
      poleDecRateDegPerCentury: 0.002413,
      primeMeridianDeg: 284.95,
      spinRateDegPerDay: 870.536,
    },
    classification: "Gas Giant",
    mass: "1.898 × 10²⁷ kg",
    gravity: "24.7 m/s²",
    composition: "Hydrogen, helium",
    atmosphere:
      "Predominantly hydrogen and helium; traces of methane, ammonia, water vapor",
    dayLength: "9h 56min",
    yearLength: "11.86 Earth years",
    curiosity:
      "Jupiter has the shortest day of all the planets, rotating once every 9 hours and 55 minutes. This rapid rotation creates its strong magnetic field.",
    facts: [
      "The Great Red Spot is a storm larger than Earth that has raged for centuries.",
      "Jupiter has a faint ring system, discovered by Voyager 1 in 1979.",
      "Its magnetic field is 20,000 times stronger than Earth's.",
      "It acts as a 'vacuum cleaner', protecting inner planets from comets.",
    ],
    records: ["Largest planet", "Shortest day", "Strongest magnetic field"],
    explorationMilestone: {
      year: 1973,
      description: "Pioneer 10 became the first spacecraft to visit Jupiter",
    },
    description:
      "Jupiter is the largest planet in the Solar System, with a mass more than two and a half times that of all the other planets combined. It is a gas giant with a mass one-thousandth that of the Sun. Jupiter is primarily composed of hydrogen with a quarter of its mass being helium. It lacks a well-defined solid surface. Because of its rapid rotation, the planet's shape is that of an oblate spheroid.",
    distanceFromParent: "778,330,000 km",
    info: "Gas giant.",
    textures: { map: TEXTURE_PATH + "jupiter_vgr1_2025.jpg" },
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "Jupiter's belts, zones and Great Red Spot follow Voyager imagery, but this is a processed 7200x3600 map whose exact origin is unresolved, so treat the fine cloud structure as illustrative rather than a measured epoch.",
      limitationReason:
        "The shipped file's source and licence are recorded as 'not documented in repo' in VISUAL_ASSET_MANIFEST (jupiter-map-active). The 2026-07-27 sweep found no better replacement: NASA's own Jupiter texture is 720x360, a hundredth of the pixel count.",
      sources: [
        {
          label: "NASA Science - Jupiter",
          url: "https://science.nasa.gov/jupiter/",
        },
      ],
    },
  },
  {
    id: "saturn",
    group: "outer",
    type: "planet",
    name: { en: "SATURN", pt: "SATURNO" },
    radiusKm: 58232,
    flattening: 0.097962,
    color: "#EBD795",
    orbit: {
      a: 9.582,
      e: 0.056,
      i: 2.48,
      O: 113.7,
      w: 339.3,
      M0: 317.0,
      n: 0.033,
    },
    rotationPeriodHours: 10.7,
    axialTilt: 26.73,
    /** No periodic terms. W is System III, as for Jupiter. */
    iauOrientation: {
      poleRaDeg: 40.589,
      poleRaRateDegPerCentury: -0.036,
      poleDecDeg: 83.537,
      poleDecRateDegPerCentury: -0.004,
      primeMeridianDeg: 38.9,
      spinRateDegPerDay: 810.7939024,
    },
    classification: "Gas Giant",
    mass: "5.683 × 10²⁶ kg",
    gravity: "10.4 m/s²",
    composition: "Hydrogen, helium",
    atmosphere: "Hydrogen and helium; traces of methane, ammonia",
    dayLength: "10h 33min",
    yearLength: "29.45 Earth years",
    curiosity:
      "Saturn is the only planet in the Solar System that is less dense than water. If there were a bathtub large enough to hold it, Saturn would float.",
    facts: [
      "Saturn's rings are incredibly thin, estimated to be less than 1 km thick.",
      "Winds in its upper atmosphere can reach 1,800 km/h.",
      "It radiates 2.5 times more energy into space than it receives from the Sun.",
      "The hexagon-shaped storm at its north pole is a unique atmospheric feature.",
    ],
    records: ["Most extensive rings", "Least dense planet"],
    explorationMilestone: {
      year: 2004,
      description:
        "Cassini-Huygens entered orbit and studied the system for 13 years",
    },
    description:
      "Saturn is the sixth planet from the Sun and the second-largest in the Solar System, after Jupiter. It is a gas giant with an average radius of about nine and a half times that of Earth. It has only one-eighth the average density of Earth; however, with its larger volume, Saturn is over 95 times more massive. Saturn is famous for its prominent ring system, which is composed mainly of ice particles, with a smaller amount of rocky debris and dust.",
    distanceFromParent: "1,429,400,000 km",
    info: "Ring system.",
    textures: {
      map: TEXTURE_PATH + "2k_saturn.jpg",
      ring: TEXTURE_PATH + "8k_saturn_ring_alpha.png",
    },
    ringSystem: {
      // F-09 — ring ratios are published radii divided by the IAU
      // EQUATORIAL radius, 60 268 km. That is now the object-space unit:
      // `resolveSemanticBodyRadius` returns the largest semi-axis, so a
      // flattened body's unit sphere is its equator. Before W5 stage B the
      // unit was the mean radius (58 232 km) and the drawn rings fell ~3.2%
      // short of the published reach. Settled invariant, not a conditional:
      // ratios stay against the equatorial radius and the unit stays
      // equatorial. D-ring inner 66 900 km / 60 268 = 1.110;
      // F-ring outer 140 180 km / 60 268 = 2.326.
      innerRadius: 1.11, // D ring inner edge
      outerRadius: 2.326, // F ring outer edge
    },
  },
  {
    id: "uranus",
    group: "outer",
    type: "planet",
    name: { en: "URANUS", pt: "URANO" },
    radiusKm: 25362,
    flattening: 0.022945,
    color: "#99FFFF",
    orbit: {
      a: 19.21,
      e: 0.046,
      i: 0.77,
      O: 74.0,
      w: 96.9,
      M0: 142.2,
      n: 0.011,
    },
    rotationPeriodHours: -17.24,
    axialTilt: 97.77,
    /**
     * No periodic terms, and no pole rates — Uranus's 97.77° obliquity is
     * carried entirely by δ₀ = −15.175°, not by `axialTilt`. W is negative:
     * Uranus rotates retrograde with respect to its orbit.
     */
    iauOrientation: {
      poleRaDeg: 257.311,
      poleDecDeg: -15.175,
      primeMeridianDeg: 203.81,
      spinRateDegPerDay: -501.1600928,
    },
    classification: "Gas Giant",
    mass: "8.681 × 10²⁵ kg",
    gravity: "8.87 m/s²",
    composition: "Hydrogen, helium, methane",
    atmosphere: "Hydrogen, helium, 2% methane",
    dayLength: "17h 14min",
    yearLength: "84.05 Earth years",
    curiosity:
      "Uranus rotates on its side, with an axial tilt of 98 degrees. This unique tilt causes the most extreme seasons in the solar system, with each pole getting 42 years of continuous sunlight followed by 42 years of darkness.",
    facts: [
      "It was the first planet found with the aid of a telescope (1781).",
      "Its blue-green color comes from methane gas in its atmosphere.",
      "It is often called an 'Ice Giant' because of its icy mantle.",
      "Uranus has the coldest planetary atmosphere, with a minimum temperature of -224°C.",
    ],
    records: ["Coldest atmosphere", "Most extreme axial tilt"],
    explorationMilestone: {
      year: 1986,
      description: "Voyager 2 is the only spacecraft to have visited Uranus",
    },
    description:
      "Uranus is the seventh planet from the Sun. It is named after the Greek god of the sky. It has the third-largest planetary radius and fourth-largest planetary mass in the Solar System. Uranus is similar in composition to Neptune, and both have bulk chemical compositions which differ from that of the larger gas giants Jupiter and Saturn.",
    distanceFromParent: "2,870,990,000 km",
    info: "Ice giant.",
    textures: {
      map:
        TEXTURE_PATH + "uranus_texture_map_8k_by_floridaemojicat_dj4s9vd.jpg",
    },
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "Uranus is rendered from a community-authored 8k map. Voyager 2 saw an almost featureless disc, so the banding and pole detail in this map are artistic extrapolation, not measured cloud structure.",
      limitationReason:
        "No public spacecraft or telescope global mosaic of Uranus exists at this resolution; the shipped file's licence is recorded as 'not documented in repo' in VISUAL_ASSET_MANIFEST (uranus-map-active).",
      sources: [
        {
          label: "NASA Science - Uranus (Voyager 2 imagery)",
          url: "https://science.nasa.gov/uranus/",
        },
      ],
    },
  },
  {
    id: "neptune",
    group: "outer",
    type: "planet",
    name: { en: "NEPTUNE", pt: "NETUNO" },
    radiusKm: 24622,
    flattening: 0.017104,
    color: "#3333FF",
    orbit: {
      a: 30.11,
      e: 0.009,
      i: 1.76,
      O: 131.7,
      w: 276.3,
      M0: 256.2,
      n: 0.005,
    },
    rotationPeriodHours: 16.11,
    axialTilt: 28.32,
    /**
     * The single periodic argument N = 357.85° + 52.316°·T is transcribed
     * rather than dropped: at 0.70° / 0.51° / 0.48° it is the largest
     * correction on any body in this file, and it is one term.
     *
     * Independent confirmation of the sin/cos convention, same as Mars:
     * evaluated at J2000 this record gives δ₀ = 42.950°, reproducing the
     * rounded pole the catalog previously carried from an unrelated source.
     */
    iauOrientation: {
      poleRaDeg: 299.36,
      poleDecDeg: 43.46,
      primeMeridianDeg: 249.978,
      spinRateDegPerDay: 541.1397757,
      nutPrec: [
        {
          phaseDeg: 357.85,
          rateDegPerCentury: 52.316,
          raAmpDeg: 0.7,
          decAmpDeg: -0.51,
          pmAmpDeg: -0.48,
        },
      ],
    },
    classification: "Gas Giant",
    mass: "1.024 × 10²⁶ kg",
    gravity: "11.15 m/s²",
    composition: "Hydrogen, helium, methane",
    atmosphere: "Hydrogen, helium, methane",
    dayLength: "16h 6min",
    yearLength: "164.8 Earth years",
    curiosity:
      "Neptune was the first planet located through mathematical calculations rather than empirical observation. Irregularities in the orbit of Uranus led astronomers to predict Neptune's existence.",
    facts: [
      "Winds on Neptune are the fastest in the solar system, reaching 2,100 km/h.",
      "It has a 'Great Dark Spot' similar to Jupiter's Red Spot.",
      "Neptune takes 165 Earth years to orbit the Sun.",
      "Its moon Triton orbits in the opposite direction to the planet's rotation.",
    ],
    records: ["Farthest planet", "Fastest winds"],
    explorationMilestone: {
      year: 1989,
      description:
        "Voyager 2 passed by Neptune, confirming its rings and moons",
    },
    description:
      "Neptune is the eighth and farthest-known Solar planet from the Sun. In the Solar System, it is the fourth-largest planet by diameter, the third-most-massive planet, and the densest giant planet. It is 17 times the mass of Earth, slightly more massive than its near-twin Uranus. Neptune is denser and physically smaller than Uranus because its greater mass causes more gravitational compression of its atmosphere.",
    distanceFromParent: "4,498,250,000 km",
    info: "Winds.",
    textures: { map: TEXTURE_PATH + "2k_neptune.jpg" },
  },
  {
    id: "moon",
    parentId: "earth",
    type: "moon",
    name: { en: "MOON", pt: "LUA" },
    radiusKm: 1737,
    color: "#CCCCCC",
    airlessRegolith: true,
    orbit: { a: 0.00257, e: 0.055, i: 5.14, O: 0, w: 0, M0: 0, n: 13.176 },
    rotationPeriodHours: 655.7,
    axialTilt: 6.68,
    iauOrientation: {
      poleRaDeg: 269.9949,
      poleRaRateDegPerCentury: 0.0031,
      poleDecDeg: 66.5392,
      poleDecRateDegPerCentury: 0.013,
      primeMeridianDeg: 38.3213,
      spinRateDegPerDay: 13.17635815,
      spinAccelDegPerDay2: -1.4e-12,
      nutPrec: [
        {
          phaseDeg: 125.045,
          rateDegPerCentury: -1935.5364525,
          raAmpDeg: -3.8787,
          decAmpDeg: 1.5419,
          pmAmpDeg: 3.561,
        },
        {
          phaseDeg: 250.089,
          rateDegPerCentury: -3871.072905,
          raAmpDeg: -0.1204,
          decAmpDeg: 0.0239,
          pmAmpDeg: 0.1208,
        },
        {
          phaseDeg: 260.008,
          rateDegPerCentury: 475263.3328725,
          raAmpDeg: 0.07,
          decAmpDeg: -0.0278,
          pmAmpDeg: -0.0642,
        },
        {
          phaseDeg: 176.625,
          rateDegPerCentury: 487269.629985,
          raAmpDeg: -0.0172,
          decAmpDeg: 0.0068,
          pmAmpDeg: 0.0158,
        },
        {
          phaseDeg: 357.529,
          rateDegPerCentury: 35999.0509575,
          pmAmpDeg: 0.0252,
        },
        {
          phaseDeg: 311.589,
          rateDegPerCentury: 964468.49931,
          raAmpDeg: 0.0072,
          decAmpDeg: -0.0029,
          pmAmpDeg: -0.0066,
        },
        {
          phaseDeg: 134.963,
          rateDegPerCentury: 477198.869325,
          decAmpDeg: 0.0009,
          pmAmpDeg: -0.0047,
        },
        {
          phaseDeg: 276.617,
          rateDegPerCentury: 12006.300765,
          pmAmpDeg: -0.0046,
        },
        {
          phaseDeg: 34.226,
          rateDegPerCentury: 63863.5132425,
          pmAmpDeg: 0.0028,
        },
        {
          phaseDeg: 15.134,
          rateDegPerCentury: -5806.6093575,
          raAmpDeg: -0.0052,
          decAmpDeg: 0.0008,
          pmAmpDeg: 0.0052,
        },
        {
          phaseDeg: 119.743,
          rateDegPerCentury: 131.84064,
          pmAmpDeg: 0.004,
        },
        {
          phaseDeg: 239.961,
          rateDegPerCentury: 6003.1503825,
          pmAmpDeg: 0.0019,
        },
        {
          phaseDeg: 25.053,
          rateDegPerCentury: 473327.79642,
          raAmpDeg: 0.0043,
          decAmpDeg: -0.0009,
          pmAmpDeg: -0.0044,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "7.35 × 10²² kg",
    gravity: "1.62 m/s²",
    composition: "Silicate rock, basalt, anorthosite",
    atmosphere: "Very tenuous exosphere",
    dayLength: "27.32 days (synchronous rotation)",
    yearLength: "27.32 days (orbits around Earth)",
    curiosity:
      "The Moon is in synchronous rotation with Earth, which means it always shows the same face to us. The 'dark side' is not actually dark, just never visible from Earth.",
    facts: [
      "The Moon is drifting away from Earth at a rate of 3.8 cm per year.",
      "It turns once every 27.3 days but takes 29.5 days to run through its phases, because Earth keeps moving along its own orbit meanwhile.",
      "Temperatures on the surface range from 127°C in sunlight to -173°C in shadow.",
      "There is water ice at the poles in permanently shadowed craters.",
      "It is the fifth-largest satellite in the Solar System.",
    ],
    records: [
      "Largest satellite relative to parent",
      "Only celestial body visited by humans",
    ],
    explorationMilestone: {
      year: 1969,
      description: "Apollo 11 landed the first humans on the surface",
    },
    description:
      "The Moon is Earth's only natural satellite. It is the fifth-largest satellite in the Solar System and the largest among planetary satellites relative to the size of the planet that it orbits. The Moon is a rocky body with a surface cratered by asteroid impacts and covered in regolith. Its gravitational influence produces the ocean tides, body tides, and the slight lengthening of the day.",
    distanceFromParent: "384,400 km",
    info: "Earth satellite.",
    textures: { map: TEXTURE_PATH + "8k_moon.jpg" },
    // W7 eclipse: Earth casts a shadow on the Moon during lunar
    // eclipses, from the real umbra/penumbra cone in
    // `eclipseGeometry.ts` (Earth's umbra at lunar distance is
    // ~2.6 R_moon, so totality covers the whole disc). The signature
    // blood-moon copper comes from the lunar refraction floor in
    // `eclipseShaderPatch.ts` — sunlight bent through Earth's limb
    // atmosphere — with its honesty disclosure in `eclipseMath.ts`.
    eclipsingBodyId: "earth",
  },
  // Galilean Moons (Jupiter)
  {
    id: "ganymede",
    parentId: "jupiter",
    type: "moon",
    name: { en: "GANYMEDE", pt: "GANIMEDES" },
    radiusKm: 2634,
    color: "#C0A080",
    airlessRegolith: true,
    orbit: { a: 0.007155, e: 0.0013, i: 0.2, O: 0, w: 0, M0: 0, n: 50.317 },
    rotationPeriodHours: 171.7,
    axialTilt: 0.33,
    iauOrientation: {
      poleRaDeg: 268.2,
      poleRaRateDegPerCentury: -0.009,
      poleDecDeg: 64.57,
      poleDecRateDegPerCentury: 0.003,
      primeMeridianDeg: 44.064,
      spinRateDegPerDay: 50.3176081,
      nutPrec: [
        {
          phaseDeg: 355.8,
          rateDegPerCentury: 1191.3,
          raAmpDeg: -0.037,
          decAmpDeg: -0.016,
          pmAmpDeg: 0.033,
        },
        {
          phaseDeg: 119.9,
          rateDegPerCentury: 262.1,
          raAmpDeg: 0.431,
          decAmpDeg: 0.186,
          pmAmpDeg: -0.389,
        },
        {
          phaseDeg: 229.8,
          rateDegPerCentury: 64.3,
          raAmpDeg: 0.091,
          decAmpDeg: 0.039,
          pmAmpDeg: -0.082,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "1.48 × 10²³ kg",
    gravity: "1.428 m/s²",
    composition: "Water ice and rocks",
    atmosphere: "Tenuous, molecular oxygen",
    dayLength: "7.15 days",
    curiosity:
      "Ganymede is the only moon in the Solar System known to have a substantial magnetosphere, likely created by convection within its liquid iron core.",
    facts: [
      "It has a thin oxygen atmosphere.",
      "Its surface is a mix of two types of terrain: dark, cratered regions and lighter, grooved regions.",
      "It participates in a 1:2:4 orbital resonance with Europa and Io.",
    ],
    records: ["Largest moon in Solar System", "Only moon with magnetic field"],
    explorationMilestone: {
      year: 1996,
      description: "Galileo spacecraft made multiple close flybys",
    },
    description:
      "Ganymede is a satellite of Jupiter and the largest and most massive of the Solar System's moons. It is the ninth-largest object in the Solar System and is larger than the planet Mercury, though only about half as massive. Ganymede is composed of approximately equal amounts of silicate rock and water ice. It is a fully differentiated body with an iron-rich, liquid core, and an internal ocean that may contain more water than all of Earth's oceans combined.",
    distanceFromParent: "1,070,400 km",
    info: "Largest moon in solar system.",
    textures: { map: TEXTURE_PATH + "4k_ganymede.jpg" },
  },
  {
    id: "callisto",
    parentId: "jupiter",
    type: "moon",
    name: { en: "CALLISTO", pt: "CALISTO" },
    radiusKm: 2410,
    color: "#908070",
    airlessRegolith: true,
    orbit: { a: 0.012585, e: 0.0074, i: 0.2, O: 0, w: 0, M0: 0, n: 21.57 },
    rotationPeriodHours: 400.5,
    iauOrientation: {
      poleRaDeg: 268.72,
      poleRaRateDegPerCentury: -0.009,
      poleDecDeg: 64.83,
      poleDecRateDegPerCentury: 0.003,
      primeMeridianDeg: 259.51,
      spinRateDegPerDay: 21.5710715,
      nutPrec: [
        {
          phaseDeg: 119.9,
          rateDegPerCentury: 262.1,
          raAmpDeg: -0.068,
          decAmpDeg: -0.029,
          pmAmpDeg: 0.061,
        },
        {
          phaseDeg: 229.8,
          rateDegPerCentury: 64.3,
          raAmpDeg: 0.59,
          decAmpDeg: 0.254,
          pmAmpDeg: -0.533,
        },
        {
          phaseDeg: 113.35,
          rateDegPerCentury: 6070,
          raAmpDeg: 0.01,
          decAmpDeg: -0.004,
          pmAmpDeg: -0.009,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "1.08 × 10²³ kg",
    gravity: "1.235 m/s²",
    composition: "Ice, rocks",
    atmosphere: "Very tenuous, carbon dioxide",
    dayLength: "16.69 days",
    curiosity:
      "Callisto is often considered the most 'boring' of the Galilean moons due to its lack of activity, but it is a prime candidate for human exploration due to low radiation levels.",
    facts: [
      "It has a very tenuous atmosphere of carbon dioxide.",
      "Valhalla is the largest multi-ring impact crater on Callisto.",
      "It may have a subsurface ocean of liquid water.",
    ],
    records: ["Most cratered object", "Oldest surface"],
    explorationMilestone: {
      year: 1979,
      description: "Voyager missions provided first detailed maps",
    },
    description:
      "Callisto is the second-largest moon of Jupiter and the third-largest moon in the Solar System. It is not in an orbital resonance like the other three Galilean moons, so it is not subject to significant tidal heating. Callisto is composed of approximately equal amounts of rock and ices. Its surface is the most heavily cratered in the Solar System, suggesting a very old surface with no geological activity for billions of years.",
    distanceFromParent: "1,882,700 km",
    info: "Heavily cratered.",
    textures: { map: TEXTURE_PATH + "4k_callisto.jpg" },
  },
  {
    id: "io",
    parentId: "jupiter",
    type: "moon",
    name: { en: "IO", pt: "IO" },
    radiusKm: 1821,
    color: "#F0E070",
    airlessRegolith: true,
    orbit: { a: 0.002819, e: 0.0041, i: 0.05, O: 0, w: 0, M0: 0, n: 203.48 },
    rotationPeriodHours: 42.5,
    iauOrientation: {
      poleRaDeg: 268.05,
      poleRaRateDegPerCentury: -0.009,
      poleDecDeg: 64.5,
      poleDecRateDegPerCentury: 0.003,
      primeMeridianDeg: 200.39,
      spinRateDegPerDay: 203.4889538,
      nutPrec: [
        {
          phaseDeg: 283.9,
          rateDegPerCentury: 4850.7,
          raAmpDeg: 0.094,
          decAmpDeg: 0.04,
          pmAmpDeg: -0.085,
        },
        {
          phaseDeg: 355.8,
          rateDegPerCentury: 1191.3,
          raAmpDeg: 0.024,
          decAmpDeg: 0.011,
          pmAmpDeg: -0.022,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "8.93 × 10²² kg",
    gravity: "1.796 m/s²",
    composition: "Silicate rock, sulfur",
    atmosphere: "Sulfur dioxide",
    dayLength: "1.77 days",
    curiosity:
      "Io's extreme volcanic activity is the result of tidal heating from friction generated within Io's interior as it is pulled between Jupiter and the other Galilean moons.",
    facts: [
      "Plumes of sulfur and sulfur dioxide climb as high as 500 km above the surface.",
      "Its surface is constantly being renewed by lava flows, erasing any impact craters.",
      "Io cuts across Jupiter's magnetic field lines, generating a powerful electric current.",
    ],
    records: ["Most volcanically active body", "Driest object in Solar System"],
    explorationMilestone: {
      year: 1979,
      description: "Voyager 1 discovered active volcanism",
    },
    description:
      "Io is the innermost and third-largest of the four Galilean moons of the planet Jupiter. It is the fourth-largest moon in the Solar System, has the highest density of all the moons, and has the lowest amount of water (by atomic ratio) of any known astronomical object in the Solar System. With over 400 active volcanoes, Io is the most geologically active object in the Solar System.",
    distanceFromParent: "421,800 km",
    info: "Volcanic world.",
    textures: { map: TEXTURE_PATH + "jupiter_nasa_io_b_3d_resource.jpg" },
  },
  {
    id: "europa",
    parentId: "jupiter",
    type: "moon",
    name: { en: "EUROPA", pt: "EUROPA" },
    radiusKm: 1560,
    color: "#C0C0C0",
    airlessRegolith: true,
    orbit: { a: 0.004486, e: 0.0094, i: 0.47, O: 0, w: 0, M0: 0, n: 101.37 },
    rotationPeriodHours: 85.2,
    axialTilt: 0.1,
    iauOrientation: {
      poleRaDeg: 268.08,
      poleRaRateDegPerCentury: -0.009,
      poleDecDeg: 64.51,
      poleDecRateDegPerCentury: 0.003,
      primeMeridianDeg: 36.022,
      spinRateDegPerDay: 101.3747235,
      nutPrec: [
        {
          phaseDeg: 355.8,
          rateDegPerCentury: 1191.3,
          raAmpDeg: 1.086,
          decAmpDeg: 0.468,
          pmAmpDeg: -0.98,
        },
        {
          phaseDeg: 119.9,
          rateDegPerCentury: 262.1,
          raAmpDeg: 0.06,
          decAmpDeg: 0.026,
          pmAmpDeg: -0.054,
        },
        {
          phaseDeg: 229.8,
          rateDegPerCentury: 64.3,
          raAmpDeg: 0.015,
          decAmpDeg: 0.007,
          pmAmpDeg: -0.014,
        },
        {
          phaseDeg: 352.25,
          rateDegPerCentury: 2382.6,
          raAmpDeg: 0.009,
          decAmpDeg: 0.002,
          pmAmpDeg: -0.008,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "4.80 × 10²² kg",
    gravity: "1.314 m/s²",
    composition: "Water ice",
    atmosphere: "Tenuous, molecular oxygen",
    dayLength: "3.55 days",
    curiosity:
      "Europa is one of the most promising places in the solar system to look for extraterrestrial life. Its subsurface ocean is kept liquid by tidal heating.",
    facts: [
      "Its surface is crisscrossed by long, linear fractures called lineae.",
      "There are very few craters, indicating a young surface (20-180 million years old).",
      "Water vapor plumes have been detected erupting from the surface.",
    ],
    records: ["Smoothest surface", "Most likely to harbor life"],
    explorationMilestone: {
      year: 1995,
      description: "Galileo mission provided evidence of subsurface ocean",
    },
    description:
      "Europa is the smallest of the four Galilean moons orbiting Jupiter, and the sixth-closest to the planet of all the 95 known moons of Jupiter. It is also the sixth-largest moon in the Solar System. Europa has the smoothest surface of any known solid object in the Solar System. The apparent youth and smoothness of the surface have led to the hypothesis that a water ocean exists beneath the surface.",
    distanceFromParent: "670,900 km",
    info: "Subsurface ocean.",
    // The USGS Voyager/Galileo mosaic is on disk and is the better *data*, but
    // it cannot be the render map as shipped: it is single-channel and carries
    // a 68 px (3.3%) solid-black no-data gore at the south pole, which maps to
    // a black hole over Europa's south polar cap on a UV sphere. Recorded as
    // `europa-mosaic-reference`; promoting it needs the gore filled first.
    textures: {
      map: TEXTURE_PATH + "2k_europa.jpg",
    },
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "Europa's surface here is a colourised repo-local map. The lineae pattern follows the Voyager/Galileo mosaic, but the colour and the polar fill are artistic, not measured radiometry.",
      limitationReason:
        "The official USGS Voyager/Galileo global mosaic shipped alongside it is monochrome and has a solid no-data gore at the south pole, so it is kept as a documented reference (europa-mosaic-reference) rather than rendered.",
      sources: [
        {
          label: "USGS Astrogeology - Europa Voyager/Galileo SSI global mosaic",
          url: "https://astrogeology.usgs.gov/search/map/europa_voyager_galileo_ssi_global_mosaic_500m",
        },
      ],
    },
  },
  // Saturn's Major Moons
  {
    id: "titan",
    parentId: "saturn",
    type: "moon",
    name: { en: "TITAN", pt: "TITÃ" },
    radiusKm: 2575,
    color: "#E0C060",
    orbit: { a: 0.008168, e: 0.0288, i: 0.348, O: 0, w: 0, M0: 0, n: 22.577 },
    rotationPeriodHours: 382.7,
    iauOrientation: {
      poleRaDeg: 39.4827,
      poleDecDeg: 83.4279,
      primeMeridianDeg: 186.5855,
      spinRateDegPerDay: 22.5769768,
    },
    classification: "Natural Satellite",
    mass: "1.35 × 10²³ kg",
    gravity: "1.352 m/s²",
    composition: "Ice, rocks, hydrocarbons",
    atmosphere: "Nitrogen, methane",
    dayLength: "15.95 days",
    curiosity:
      "Titan has lakes and seas of liquid methane and ethane. The largest, Kraken Mare, is larger than the Caspian Sea on Earth.",
    facts: [
      "Its atmosphere is 98% nitrogen, similar to Earth's.",
      "The surface pressure is 1.45 times that of Earth's.",
      "It rains liquid methane on Titan.",
      "It is the only moon known to have a dense atmosphere.",
    ],
    records: [
      "Only moon with dense atmosphere",
      "Only extraterrestrial liquid seas",
    ],
    explorationMilestone: {
      year: 2005,
      description: "Huygens probe landed on the surface",
    },
    description:
      "Titan is the largest moon of Saturn and the second-largest natural satellite in the Solar System. It is the only moon known to have a dense atmosphere, and the only known body in space, other than Earth, where clear evidence of stable bodies of surface liquid has been found. Titan is 50% larger (in diameter) than Earth's Moon and 80% more massive.",
    distanceFromParent: "1,222,000 km",
    info: "Thick atmosphere.",
    // Cassini's ISS mosaic images the surface *through* the methane window;
    // it is monochrome and its tile seams are plainly visible on a sphere.
    // Titan seen from space is an orange haze ball, which is what this map
    // shows, so the mosaic stays a documented reference (titan-mosaic-reference)
    // instead of the render map.
    textures: {
      map: TEXTURE_PATH + "2k_titan.jpg",
    },
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "Titan is rendered from a repo-local haze map. The overall colour and the smooth, featureless disc are right - Titan's surface is not visible through its atmosphere - but the cloud detail is artistic, not measured.",
      limitationReason:
        "The official Cassini ISS / USGS global mosaic shipped alongside it is a single-channel surface product with visible mosaic seams; it shows what lies under the haze, not what Titan looks like, so it is kept as a documented reference (titan-mosaic-reference) rather than rendered.",
      sources: [
        {
          label: "USGS Astrogeology - Titan Cassini ISS global mosaic",
          url: "https://astrogeology.usgs.gov/search/map/titan_cassini_iss_global_mosaic_4005m",
        },
      ],
    },
  },
  {
    id: "rhea",
    parentId: "saturn",
    type: "moon",
    name: { en: "RHEA", pt: "REIA" },
    radiusKm: 764,
    color: "#C0C0C0",
    orbit: {
      a: 0.003525,
      e: 0.001,
      i: 0.345,
      O: 357.9,
      w: 259.6,
      M0: 340.5,
      n: 79.69,
    },
    rotationPeriodHours: 108.4,
    iauOrientation: {
      poleRaDeg: 40.38,
      poleRaRateDegPerCentury: -0.036,
      poleDecDeg: 83.55,
      poleDecRateDegPerCentury: -0.004,
      primeMeridianDeg: 235.16,
      spinRateDegPerDay: 79.6900478,
      nutPrec: [
        {
          phaseDeg: 345.2,
          rateDegPerCentury: -1016.3,
          raAmpDeg: 3.1,
          decAmpDeg: -0.35,
          pmAmpDeg: -3.08,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "2.31 × 10²¹ kg",
    gravity: "0.264 m/s²",
    composition: "Water ice and rocks",
    atmosphere: "Tenuous (oxygen, carbon dioxide)",
    dayLength: "4.52 days",
    curiosity:
      "Rhea may have a tenuous ring system of its own, although this has not been definitively confirmed.",
    facts: [
      "It has a very thin atmosphere containing oxygen and carbon dioxide.",
      "The surface is divided into two geologically different areas based on crater density.",
      "It is named after the Titan Rhea, mother of the gods.",
    ],
    records: ["Second largest Saturn moon", "Possible ring system"],
    explorationMilestone: {
      year: 1980,
      description: "Voyager 1 confirmed its icy nature",
    },
    description:
      "Rhea is the second-largest moon of Saturn and the ninth-largest moon in the Solar System. It is an icy body with a density of about 1.236 g/cm³, suggesting it is composed of about 25% rock and 75% water ice. Rhea's surface is heavily cratered and resembles Dione's, with bright wispy terrain on its trailing hemisphere.",
    distanceFromParent: "527,000 km",
    info: "Icy body.",
    textures: { map: TEXTURE_PATH + "2k_rhea.jpg" },
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "Placeholder map. The cratering follows Cassini imagery, but the file's origin is not documented and its colour balance is not measured.",
      limitationReason:
        "The 2026-07-27 source sweep found no better shippable map: NASA's Rhea texture is greyscale and visibly flatter than this one, and the licence on the best community maps forbids redistribution.",
      sources: [
        {
          label: "NASA 3D Resources - textures collection",
          url: "https://github.com/nasa/NASA-3D-Resources/tree/master/Images%20and%20Textures",
        },
      ],
    },
  },
  {
    id: "iapetus",
    parentId: "saturn",
    type: "moon",
    name: { en: "IAPETUS", pt: "JÁPETO" },
    radiusKm: 734,
    color: "#807060",
    orbit: { a: 0.02381, e: 0.0283, i: 15.47, O: 0, w: 0, M0: 0, n: 4.538 },
    rotationPeriodHours: 1903.9,
    iauOrientation: {
      poleRaDeg: 318.16,
      poleRaRateDegPerCentury: -3.949,
      poleDecDeg: 75.03,
      poleDecRateDegPerCentury: -1.143,
      primeMeridianDeg: 355.2,
      spinRateDegPerDay: 4.5379572,
    },
    classification: "Natural Satellite",
    mass: "1.81 × 10²¹ kg",
    gravity: "0.223 m/s²",
    composition: "Ice, rocks",
    atmosphere: "Not detected",
    dayLength: "79.33 days",
    curiosity:
      "Iapetus has a massive equatorial ridge running three-quarters of the way around the moon, making it look like a walnut.",
    facts: [
      "The dark material is believed to be dust from another moon, Phoebe.",
      "It orbits much farther from Saturn than the other major moons.",
      "Its orbit is significantly inclined to Saturn's equator.",
    ],
    records: ["Highest contrast surface", "Walnut shape"],
    explorationMilestone: {
      year: 2007,
      description: "Cassini flyby revealed the equatorial ridge",
    },
    description:
      "Iapetus is the third-largest natural satellite of Saturn. It is famous for its dramatic two-tone coloration; one hemisphere is bright as snow, while the other is dark as coal. Iapetus has a low density, indicating it is composed mostly of ice with a small amount of rocky materials.",
    distanceFromParent: "3,560,820 km",
    info: "Two-tone moon.",
    textures: { map: TEXTURE_PATH + "8k_iapetus.jpg" },
  },
  {
    id: "dione",
    parentId: "saturn",
    type: "moon",
    name: { en: "DIONE", pt: "DIONE" },
    radiusKm: 561,
    color: "#D0D0D0",
    orbit: {
      a: 0.002523,
      e: 0.0022,
      i: 0.019,
      O: 168.9, // Longitude of Ascending Node
      w: 249.7, // Argument of Periapsis
      M0: 200.6, // Mean Anomaly at J2000
      n: 131.53,
    },
    rotationPeriodHours: 65.7,
    iauOrientation: {
      poleRaDeg: 40.66,
      poleRaRateDegPerCentury: -0.036,
      poleDecDeg: 83.52,
      poleDecRateDegPerCentury: -0.004,
      primeMeridianDeg: 357.6,
      spinRateDegPerDay: 131.5349316,
    },
    classification: "Natural Satellite",
    mass: "1.10 × 10²¹ kg",
    gravity: "0.232 m/s²",
    composition: "Water ice and rocks",
    atmosphere: "Tenuous (oxygen)",
    dayLength: "2.74 days",
    curiosity:
      "Dione shares its orbit with two small co-orbital moons, Helene and Polydeuces, which sit at its Lagrangian points.",
    facts: [
      "It has a subsurface ocean of liquid water.",
      "Oxygen ions have been detected in its exosphere.",
      "The 'wisps' are actually bright ice cliffs created by tectonic fractures.",
    ],
    records: ["Co-orbital moons", "Ice cliffs"],
    explorationMilestone: {
      year: 1980,
      description: "Voyager 1 imaged the wispy terrain",
    },
    description:
      "Dione is the fourth-largest moon of Saturn. It consists of about two-thirds water ice and one-third dense rock. Its leading hemisphere is heavily cratered and uniformly bright, while its trailing hemisphere contains a network of bright ice cliffs (chasmata) creating a wispy appearance.",
    distanceFromParent: "377,400 km",
    info: "Cratered ice.",
    textures: { map: TEXTURE_PATH + "2k_dione.jpg" },
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "Placeholder map. The wispy fault terrain follows Cassini imagery, but the file's origin is not documented and its colour balance is not measured.",
      limitationReason:
        "The 2026-07-27 source sweep found no better shippable map: NASA's Dione texture is greyscale and carries less surface detail than this one.",
      sources: [
        {
          label: "NASA 3D Resources - textures collection",
          url: "https://github.com/nasa/NASA-3D-Resources/tree/master/Images%20and%20Textures",
        },
      ],
    },
  },
  {
    id: "tethys",
    parentId: "saturn",
    type: "moon",
    name: { en: "TETHYS", pt: "TÉTIS" },
    radiusKm: 531,
    color: "#E0E0E0",
    orbit: {
      a: 0.001971,
      e: 0.0001,
      i: 1.12,
      O: 289.8,
      w: 330.1,
      M0: 255.4,
      n: 190.7,
    },
    rotationPeriodHours: 45.3,
    iauOrientation: {
      poleRaDeg: 40.66,
      poleRaRateDegPerCentury: -0.036,
      poleDecDeg: 83.52,
      poleDecRateDegPerCentury: -0.004,
      primeMeridianDeg: 8.95,
      spinRateDegPerDay: 190.6979085,
      nutPrec: [
        {
          phaseDeg: 300,
          rateDegPerCentury: -7225.9,
          raAmpDeg: 9.66,
          decAmpDeg: -1.09,
          pmAmpDeg: -9.6,
        },
        {
          phaseDeg: 316.45,
          rateDegPerCentury: 506.2,
          pmAmpDeg: 2.23,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "6.17 × 10²⁰ kg",
    gravity: "0.146 m/s²",
    composition: "Water ice",
    atmosphere: "Not detected",
    dayLength: "1.89 days",
    curiosity:
      "A huge valley called Ithaca Chasma runs about 2,000 km long, covering three-quarters of Tethys' circumference.",
    facts: [
      "It has two co-orbital moons, Telesto and Calypso.",
      "The surface is very bright, second only to Enceladus.",
      "Odysseus crater flattened out due to the relaxation of the icy crust.",
    ],
    records: ["Huge rift valley", "Trojan moons"],
    explorationMilestone: {
      year: 1981,
      description: "Voyager 2 provided high-resolution images",
    },
    description:
      "Tethys is the fifth-largest moon of Saturn. It is a mid-sized moon composed almost entirely of water ice, as indicated by its low density. Tethys is heavily cratered and cut by a number of large faults/grabens. The largest impact crater, Odysseus, is about 400 km in diameter, nearly 2/5 of Tethys's diameter.",
    distanceFromParent: "294,670 km",
    info: "Huge canyon.",
    textures: { map: TEXTURE_PATH + "8k_tethys.jpg" },
  },
  {
    id: "enceladus",
    parentId: "saturn",
    type: "moon",
    name: { en: "ENCELADUS", pt: "ENCÉLADO" },
    radiusKm: 252,
    color: "#FFFFFF",
    airlessRegolith: true,
    orbit: {
      a: 0.001591,
      e: 0.0047,
      i: 0.019,
      O: 336.2,
      w: 186.5,
      M0: 197.3,
      n: 262.73,
    },
    rotationPeriodHours: 32.9,
    iauOrientation: {
      poleRaDeg: 40.66,
      poleRaRateDegPerCentury: -0.036,
      poleDecDeg: 83.52,
      poleDecRateDegPerCentury: -0.004,
      primeMeridianDeg: 6.32,
      spinRateDegPerDay: 262.7318996,
    },
    classification: "Natural Satellite",
    mass: "1.08 × 10²⁰ kg",
    gravity: "0.113 m/s²",
    composition: "Water ice and rocks",
    atmosphere: "Water vapor (caused by cryovolcanic jets)",
    dayLength: "1.37 days",
    curiosity:
      "Enceladus has cryovolcanoes near the south pole which shoot geyser-like jets of water vapor, molecular hydrogen, other volatiles, and solid material, including sodium chloride crystals and ice particles, into space.",
    facts: [
      "It is the source of Saturn's E ring.",
      "It has a global subsurface ocean of liquid water.",
      "Hydrothermal vents at the ocean floor could support life.",
    ],
    records: ["Most reflective body", "Active cryovolcanism"],
    explorationMilestone: {
      year: 2005,
      description: "Cassini discovered the water plumes",
    },
    description:
      "Enceladus is the sixth-largest moon of Saturn. It is about 500 kilometers in diameter, about a tenth of that of Saturn's largest moon, Titan. Enceladus is covered by fresh, clean ice, making it one of the most reflective bodies of the Solar System. Consequently, its surface temperature at noon only reaches −198 °C.",
    distanceFromParent: "238,020 km",
    info: "Ice geysers.",
    textures: { map: TEXTURE_PATH + "8k_enceladus.jpg" },
  },
  {
    id: "mimas",
    parentId: "saturn",
    type: "moon",
    name: { en: "MIMAS", pt: "MIMAS" },
    radiusKm: 198,
    color: "#B0B0B0",
    orbit: {
      a: 0.00124,
      e: 0.0202,
      i: 1.51,
      O: 151.4,
      w: 357.3,
      M0: 320.1,
      n: 381.99,
    },
    rotationPeriodHours: 22.6,
    iauOrientation: {
      poleRaDeg: 40.66,
      poleRaRateDegPerCentury: -0.036,
      poleDecDeg: 83.52,
      poleDecRateDegPerCentury: -0.004,
      primeMeridianDeg: 333.46,
      spinRateDegPerDay: 381.994555,
      nutPrec: [
        {
          phaseDeg: 177.4,
          rateDegPerCentury: -36505.5,
          raAmpDeg: 13.56,
          decAmpDeg: -1.53,
          pmAmpDeg: -13.48,
        },
        {
          phaseDeg: 316.45,
          rateDegPerCentury: 506.2,
          pmAmpDeg: -44.85,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "3.75 × 10¹⁹ kg",
    gravity: "0.064 m/s²",
    composition: "Water ice",
    atmosphere: "Not detected",
    dayLength: "0.94 days",
    curiosity:
      "Mimas is dominated by the Herschel crater, which is so large that the impact nearly shattered the moon. This gives it a striking resemblance to the Death Star from Star Wars.",
    facts: [
      "The impact that created Herschel caused fractures on the opposite side of the moon.",
      "It is responsible for clearing the Cassini Division in Saturn's rings.",
      "It is composed mostly of water ice with a small amount of rock.",
    ],
    records: ["Smallest rounded body", "Death Star lookalike"],
    explorationMilestone: {
      year: 1980,
      description: "Voyager 1 revealed the giant crater",
    },
    description:
      "Mimas is a moon of Saturn which was discovered in 1789 by William Herschel. It is named after Mimas, a son of Gaia in Greek mythology. With a diameter of 396 kilometres, it is the smallest astronomical body that is known to be rounded in shape because of self-gravitation.",
    distanceFromParent: "185,540 km",
    info: "Death Star lookalike.",
    textures: { map: TEXTURE_PATH + "4k_mimas.jpg" },
  },
  // Ice Giant Moons (Uranus & Neptune)
  {
    id: "triton",
    parentId: "neptune",
    type: "moon",
    name: { en: "TRITON", pt: "TRITÃO" },
    radiusKm: 1353,
    color: "#D0E0E0",
    /**
     * Ecliptic J2000, inverted from the Horizons vector and re-referenced to
     * J2000 — see Charon's record. Triton's old `i: 156.8` was its inclination
     * to **Neptune's equator** and its `Ω` was fabricated: the pair behind the
     * disclosed ~150° envelope W6 stage B retired.
     */
    orbit: {
      a: 0.002371478,
      e: 0.000027,
      i: 129.170264,
      O: 222.392859,
      w: 340.984172,
      M0: 98.867312,
      n: 61.2572637,
    },
    rotationPeriodHours: -141,
    iauOrientation: {
      poleRaDeg: 299.36,
      poleDecDeg: 41.17,
      primeMeridianDeg: 296.53,
      spinRateDegPerDay: -61.2572637,
      nutPrec: [
        {
          phaseDeg: 177.85,
          rateDegPerCentury: 52.316,
          raAmpDeg: -32.35,
          decAmpDeg: 22.55,
          pmAmpDeg: 22.25,
        },
        {
          phaseDeg: 355.7,
          rateDegPerCentury: 104.632,
          raAmpDeg: -6.28,
          decAmpDeg: 2.1,
          pmAmpDeg: 6.73,
        },
        {
          phaseDeg: 533.55,
          rateDegPerCentury: 156.948,
          raAmpDeg: -2.08,
          decAmpDeg: 0.55,
          pmAmpDeg: 2.05,
        },
        {
          phaseDeg: 711.4,
          rateDegPerCentury: 209.264,
          raAmpDeg: -0.74,
          decAmpDeg: 0.16,
          pmAmpDeg: 0.74,
        },
        {
          phaseDeg: 889.25,
          rateDegPerCentury: 261.58,
          raAmpDeg: -0.28,
          decAmpDeg: 0.05,
          pmAmpDeg: 0.28,
        },
        {
          phaseDeg: 1067.1,
          rateDegPerCentury: 313.896,
          raAmpDeg: -0.11,
          decAmpDeg: 0.02,
          pmAmpDeg: 0.11,
        },
        {
          phaseDeg: 1244.95,
          rateDegPerCentury: 366.212,
          raAmpDeg: -0.07,
          decAmpDeg: 0.01,
          pmAmpDeg: 0.05,
        },
        {
          phaseDeg: 1422.8,
          rateDegPerCentury: 418.528,
          raAmpDeg: -0.02,
          pmAmpDeg: 0.02,
        },
        {
          phaseDeg: 1600.65,
          rateDegPerCentury: 470.844,
          raAmpDeg: -0.01,
          pmAmpDeg: 0.01,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "2.14 × 10²² kg",
    gravity: "0.779 m/s²",
    composition: "Nitrogen ice, methane, water",
    atmosphere: "Nitrogen, methane",
    dayLength: "5.88 days",
    curiosity:
      "Triton is geologically active; its surface is young and has few impact craters. Complex cryovolcanic and tectonic terrains suggest a complex geological history.",
    facts: [
      "It has a tenuous nitrogen atmosphere.",
      "Geysers erupt nitrogen gas and dust up to 8 km high.",
      "It is gradually spiraling toward Neptune and will eventually be torn apart.",
      "It is the only large moon in the Solar System with a retrograde orbit.",
    ],
    records: ["Only large retrograde moon", "Captured Kuiper Belt Object"],
    explorationMilestone: {
      year: 1989,
      description: "Voyager 2 provided the only close-up data",
    },
    description:
      "Triton is the largest natural satellite of the planet Neptune, and the first Neptunian moon to be discovered. It is the only large moon in the Solar System with a retrograde orbit, an orbit in the direction opposite to its planet's rotation. At 2,710 kilometers in diameter, it is the seventh-largest moon in the Solar System. Because of its retrograde orbit and composition similar to Pluto, Triton is thought to have been a dwarf planet captured from the Kuiper belt.",
    distanceFromParent: "354,800 km",
    info: "Retrograde orbit.",
    textures: { map: TEXTURE_PATH + "4k_triton.png" },
  },
  {
    id: "titania",
    parentId: "uranus",
    type: "moon",
    name: { en: "TITANIA", pt: "TITÂNIA" },
    radiusKm: 788,
    color: "#E0E0E0",
    orbit: { a: 0.00292, e: 0.0011, i: 0.34, O: 0, w: 0, M0: 0, n: 41.35 },
    rotationPeriodHours: 208.9,
    iauOrientation: {
      poleRaDeg: 257.43,
      poleDecDeg: -15.1,
      primeMeridianDeg: 77.74,
      spinRateDegPerDay: -41.3514316,
      nutPrec: [
        {
          phaseDeg: 340.82,
          rateDegPerCentury: -75.32,
          raAmpDeg: 0.29,
          decAmpDeg: 0.28,
          pmAmpDeg: 0.08,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "3.53 × 10²¹ kg",
    gravity: "0.379 m/s²",
    composition: "Ice and rocks",
    atmosphere: "Not detected",
    dayLength: "8.71 days",
    curiosity:
      "Titania is marked by a massive canyon system that dwarfs the Grand Canyon on Earth, indicating past tectonic activity.",
    facts: [
      "It has a relatively dark, slightly red surface.",
      "Impact craters reaching 326 km in diameter have been found.",
      "Infrared spectroscopy revealed the presence of water ice and carbon dioxide.",
    ],
    records: ["Largest Uranus moon", "Massive canyon system"],
    explorationMilestone: {
      year: 1986,
      description: "Voyager 2 imaged about 40% of the surface",
    },
    description:
      "Titania is the largest of the moons of Uranus and the eighth largest moon in the Solar System at a diameter of 1,578 kilometres. It was discovered by William Herschel in 1787. Titania consists of approximately equal amounts of ice and rock, and is likely differentiated into a rocky core and an icy mantle.",
    distanceFromParent: "436,300 km",
    info: "Largest Uranus moon.",
    textures: { map: TEXTURE_PATH + "4k_titania.png" },
  },
  {
    id: "oberon",
    parentId: "uranus",
    type: "moon",
    name: { en: "OBERON", pt: "OBERON" },
    radiusKm: 761,
    color: "#D0C0C0",
    orbit: { a: 0.0039, e: 0.0014, i: 0.058, O: 0, w: 0, M0: 0, n: 26.75 },
    rotationPeriodHours: 323.1,
    iauOrientation: {
      poleRaDeg: 257.43,
      poleDecDeg: -15.1,
      primeMeridianDeg: 6.77,
      spinRateDegPerDay: -26.7394932,
      nutPrec: [
        {
          phaseDeg: 259.14,
          rateDegPerCentury: -504.81,
          raAmpDeg: 0.16,
          decAmpDeg: 0.16,
          pmAmpDeg: 0.04,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "3.01 × 10²¹ kg",
    gravity: "0.346 m/s²",
    composition: "Ice and rocks",
    atmosphere: "Not detected",
    dayLength: "13.46 days",
    curiosity:
      "Oberon has the reddest surface among the major Uranian moons. Its surface is heavily cratered, suggesting it has been stable since the early history of the solar system.",
    facts: [
      "It has high mountains, including one that rises 11 km.",
      "Dark material covers the floors of many craters.",
      "It is named after the King of the Fairies in Shakespeare's Midsummer Night's Dream.",
    ],
    records: ["Outermost major moon", "Highest peak on Uranian moons"],
    explorationMilestone: {
      year: 1986,
      description: "Voyager 2 imaged about 40% of the surface",
    },
    description:
      "Oberon is the outermost major moon of the planet Uranus. It is the second-largest and second most massive of the Uranian moons, and the ninth most massive moon in the Solar System. Consisting of approximately equal amounts of ice and rock, Oberon is likely differentiated into a rocky core and an icy mantle.",
    distanceFromParent: "583,500 km",
    info: "Outermost major moon.",
    textures: { map: TEXTURE_PATH + "4k_oberon.png" },
  },
  {
    id: "umbriel",
    parentId: "uranus",
    type: "moon",
    name: { en: "UMBRIEL", pt: "UMBRIEL" },
    radiusKm: 585,
    color: "#808080",
    orbit: { a: 0.00178, e: 0.0039, i: 0.128, O: 0, w: 0, M0: 0, n: 86.86 },
    rotationPeriodHours: 99.5,
    iauOrientation: {
      poleRaDeg: 257.43,
      poleDecDeg: -15.1,
      primeMeridianDeg: 108.05,
      spinRateDegPerDay: -86.8688923,
      nutPrec: [
        {
          phaseDeg: 316.41,
          rateDegPerCentury: 2863.96,
          pmAmpDeg: -0.09,
        },
        {
          phaseDeg: 308.71,
          rateDegPerCentury: -93.17,
          raAmpDeg: 0.21,
          decAmpDeg: 0.2,
          pmAmpDeg: 0.06,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "1.17 × 10²¹ kg",
    // Derived from the catalog GM/R²; the mass + mean radius pair here
    // reproduces the published 1.39 g/cm³ density, so gravity was the
    // stale field (was 0.203, an older rounded value). 2026-07-23.
    gravity: "0.228 m/s²",
    composition: "Ice, rocks",
    atmosphere: "Not detected",
    dayLength: "4.14 days",
    curiosity:
      "Umbriel is the darkest of Uranus's major moons, reflecting only about half as much light as Ariel. Its surface is old and heavily cratered.",
    facts: [
      "The Wunda crater has a mysterious bright ring of material on its floor.",
      "It has very few geological features other than craters.",
      "It is about the same size as Ariel.",
    ],
    records: ["Darkest Uranian moon", "Mysterious bright ring"],
    explorationMilestone: {
      year: 1986,
      description: "Voyager 2 imaged about 40% of the surface",
    },
    description:
      "Umbriel is a moon of Uranus discovered on October 24, 1851, by William Lassell. It was discovered at the same time as Ariel and named after a character in Alexander Pope's poem The Rape of the Lock. Umbriel consists mainly of ice with a substantial fraction of rock, and may be differentiated into a rocky core and an icy mantle.",
    distanceFromParent: "266,000 km",
    info: "Darkest moon.",
    textures: { map: TEXTURE_PATH + "4k_umbriel.png" },
  },
  {
    id: "ariel",
    parentId: "uranus",
    type: "moon",
    name: { en: "ARIEL", pt: "ARIEL" },
    radiusKm: 579,
    color: "#E0E0E0",
    orbit: { a: 0.00128, e: 0.0012, i: 0.26, O: 0, w: 0, M0: 0, n: 142.8 },
    rotationPeriodHours: 60.5,
    iauOrientation: {
      poleRaDeg: 257.43,
      poleDecDeg: -15.1,
      primeMeridianDeg: 156.22,
      spinRateDegPerDay: -142.8356681,
      nutPrec: [
        {
          phaseDeg: 316.41,
          rateDegPerCentury: 2863.96,
          pmAmpDeg: 0.05,
        },
        {
          phaseDeg: 304.01,
          rateDegPerCentury: -51.94,
          raAmpDeg: 0.29,
          decAmpDeg: 0.28,
          pmAmpDeg: 0.08,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "1.35 × 10²¹ kg",
    gravity: "0.266 m/s²",
    composition: "Ice, rocks",
    atmosphere: "Not detected",
    dayLength: "2.52 days",
    curiosity:
      "Ariel has the youngest surface of all Uranian moons, with few large craters and many extensive interconnected rift valleys (canyons).",
    facts: [
      "Evidence suggests recent geological activity.",
      "Its surface is crisscrossed by scarps and ridges.",
      "Flow-like features suggest past cryovolcanism.",
    ],
    records: ["Brightest Uranian moon", "Youngest surface among Uranian moons"],
    explorationMilestone: {
      year: 1986,
      description: "Voyager 2 imaged about 35% of the surface",
    },
    description:
      "Ariel is the fourth-largest of the 27 known moons of Uranus. Ariel orbits and rotates in the equatorial plane of Uranus, which is almost perpendicular to the orbit of Uranus and so has an extreme seasonal cycle. It is the brightest of Uranus's major moons.",
    distanceFromParent: "191,000 km",
    info: "Brightest moon.",
    textures: { map: TEXTURE_PATH + "4k_ariel.png" },
  },
  {
    id: "miranda",
    parentId: "uranus",
    type: "moon",
    name: { en: "MIRANDA", pt: "MIRANDA" },
    radiusKm: 236,
    color: "#D0D0D0",
    orbit: { a: 0.00086, e: 0.0013, i: 4.23, O: 0, w: 0, M0: 0, n: 254.69 },
    rotationPeriodHours: 33.9,
    iauOrientation: {
      poleRaDeg: 257.43,
      poleDecDeg: -15.08,
      primeMeridianDeg: 30.7,
      spinRateDegPerDay: -254.6906892,
      nutPrec: [
        {
          phaseDeg: 102.23,
          rateDegPerCentury: -2024.22,
          raAmpDeg: 4.41,
          decAmpDeg: 4.25,
          pmAmpDeg: 1.15,
        },
        {
          phaseDeg: 316.41,
          rateDegPerCentury: 2863.96,
          pmAmpDeg: -1.27,
        },
        {
          phaseDeg: 204.46,
          rateDegPerCentury: -4048.44,
          raAmpDeg: -0.04,
          decAmpDeg: -0.02,
          pmAmpDeg: -0.09,
        },
        {
          phaseDeg: 632.82,
          rateDegPerCentury: 5727.92,
          pmAmpDeg: 0.15,
        },
      ],
    },
    classification: "Natural Satellite",
    mass: "6.59 × 10¹⁹ kg",
    gravity: "0.079 m/s²",
    composition: "Ice, rocks",
    atmosphere: "Not detected",
    dayLength: "1.41 days",
    curiosity:
      "It has “Frankenstein conditions”, a landscape composed of distinct patches.",
    facts: ["Deep fissures and regions of unusual relief."],
    description: "Miranda has mixed terrains, mountains, and faults.",
    distanceFromParent: "129,900 km",
    info: "Jumbled terrain.",
    textures: { map: TEXTURE_PATH + "4k_miranda.png" },
  },
  {
    id: "pluto",
    group: "other",
    type: "dwarf",
    name: { en: "PLUTO", pt: "PLUTÃO" },
    radiusKm: 1188,
    color: "#CCC",
    orbit: {
      a: 39.48,
      e: 0.248,
      i: 17.16,
      O: 110.3,
      w: 113.7,
      M0: 14.8,
      n: 0.003,
    },
    rotationPeriodHours: -153.3,
    /**
     * Obliquity **to the orbit**, 119.59°, which is the quantity every other
     * body in this catalog carries and the one `resolveObliquityDeg`
     * reproduces from the IAU pole.
     *
     * It read 122.53° until W6 stage B, which is Pluto's tilt to the
     * **ecliptic** — a real published number for a different quantity. Nothing
     * could catch the mix-up while Pluto had no pole: the obliquity
     * cross-check skipped it for want of a rotation solution, and 122.53°
     * beside 119.59° looks like a rounding difference rather than a change of
     * reference plane.
     */
    axialTilt: 119.59,
    iauOrientation: {
      poleRaDeg: 132.993,
      poleDecDeg: -6.163,
      primeMeridianDeg: 302.695,
      spinRateDegPerDay: 56.3625225,
    },
    classification: "Dwarf Planet",
    mass: "1.303 × 10²² kg",
    gravity: "0.62 m/s²",
    composition: "Nitrogen ice, methane, rocks",
    atmosphere: "Nitrogen, methane (rarefied)",
    dayLength: "6.39 Earth days",
    yearLength: "248 Earth years",
    curiosity:
      "Pluto has a 'heart' on its surface, a vast nitrogen-ice plain named Sputnik Planitia. It is constantly renewing itself through convection currents.",
    facts: [
      "Pluto is smaller than Earth's moon.",
      "Its orbit is so eccentric that it sometimes comes closer to the Sun than Neptune.",
      "It has five moons: Charon, Styx, Nix, Kerberos, and Hydra.",
      "A day on Pluto lasts 153 hours.",
    ],
    records: ["Largest dwarf planet", "Most complex binary system"],
    explorationMilestone: {
      year: 2015,
      description: "New Horizons performed the first historic flyby",
    },
    description:
      "Pluto is a dwarf planet in the Kuiper belt, a ring of bodies beyond the orbit of Neptune. It was the first and the largest Kuiper belt object to be discovered. Pluto is primarily made of ice and rock and is relatively small—about one-sixth the mass of the Moon and one-third its volume. It has a moderately eccentric and inclined orbit during which it ranges from 30 to 49 astronomical units or AU from the Sun.",
    distanceFromParent: "5,906,380,000 km",
    info: "Dwarf planet.",
    textures: { map: TEXTURE_PATH + "8k_pluto.jpg" },
  },
  {
    id: "ceres",
    group: "inner",
    type: "dwarf",
    name: { en: "CERES", pt: "CERES" },
    radiusKm: 473,
    color: "#B8A998",
    orbit: {
      a: 2.768,
      e: 0.076,
      i: 10.59,
      O: 80.3,
      w: 73.0,
      M0: 153.9,
      n: 0.214,
    },
    rotationPeriodHours: 9.07,
    axialTilt: 4,
    classification: "Dwarf Planet",
    mass: "9.39 × 10²⁰ kg",
    gravity: "0.27 m/s²",
    composition: "Silicates, carbonates, frozen water",
    atmosphere: "Tenuous exosphere formed mainly by water vapor",
    dayLength: "9h 4min",
    yearLength: "4.60 Earth years",
    curiosity:
      "Ceres is the only dwarf planet located in the inner solar system. It comprises 25% of the asteroid belt's total mass.",
    facts: [
      "Bright spots on its surface are deposits of sodium carbonate (salt).",
      "It releases water vapor into space, creating a temporary atmosphere.",
      "Ahuna Mons is a cryovolcano that erupts salty water instead of lava.",
    ],
    records: ["Largest asteroid", "Only dwarf planet in inner solar system"],
    explorationMilestone: {
      year: 2015,
      description: "Dawn spacecraft entered orbit and mapped the surface",
    },
    description:
      "Ceres is the largest object in the main asteroid belt that lies between the orbits of Mars and Jupiter. With a diameter of 940 km, Ceres is both the largest of the asteroids and the only dwarf planet in the inner Solar System. It is the 25th-largest body in the Solar System within the orbit of Neptune.",
    distanceFromParent: "413,700,000 km",
    info: "Asteroid belt.",
    textures: { map: TEXTURE_PATH + "2k_ceres.jpg" },
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "Placeholder map. The crater pattern follows Dawn Framing Camera imagery, but the file's origin is not documented and its colour balance is not measured.",
      limitationReason:
        "The measured upgrade is the DLR/Dawn controlled global mosaic at USGS Astrogeology; it has not been integrated yet.",
      sources: [
        {
          label: "USGS Astrogeology - Ceres Dawn FC global mosaic",
          url: "https://astrogeology.usgs.gov/search/map/ceres_dawn_fc_global_mosaic_140m",
        },
      ],
    },
  },
  {
    id: "haumea",
    group: "other",
    type: "dwarf",
    name: { en: "HAUMEA", pt: "HAUMEA" },
    radiusKm: 816,
    color: "#E8D5C4",
    orbit: {
      a: 43.218,
      e: 0.188,
      i: 28.19,
      O: 121.9,
      w: 240.2,
      M0: 217.7,
      // Kepler-routed: n must be the two-body mean motion for a = 43.218 AU
      // (360 / (365.256 · a^1.5)). The old 0.003 ran the orbit ~16% fast.
      n: 0.0034689,
    },
    rotationPeriodHours: 3.9,
    axialTilt: 28,
    classification: "Dwarf Planet",
    mass: "~4.01 × 10²¹ kg",
    gravity: "~0.44 m/s²",
    composition: "Water ice and rocks",
    atmosphere: "Not detected",
    dayLength: "3.92 hours (fastest rotation among dwarf planets)",
    yearLength: "284 Earth years",
    curiosity:
      "Haumea spins so fast that it has been pulled into the shape of a rugby ball. It completes a rotation in less than 4 hours.",
    facts: [
      "It is the only known trans-Neptunian object with a ring system.",
      "Its surface is covered in crystalline water ice.",
      "It has two moons, Hi'iaka and Namaka.",
    ],
    records: ["Fastest rotating large object", "Only TNO with rings"],
    explorationMilestone: {
      year: 2004,
      description: "Discovered by teams from Caltech and Sierra Nevada",
    },
    description:
      "Haumea is a dwarf planet located beyond Neptune's orbit. It was discovered in 2004 by a team headed by Mike Brown of Caltech at the Palomar Observatory. Haumea's mass is about one-third that of Pluto, and 1/1400 that of Earth. Although its shape has not been directly observed, calculations from its light curve are consistent with it being a Jacobi ellipsoid (the shape it would be if it were a dwarf planet), with major axes twice as long as its minor axes.",
    distanceFromParent: "6,452,000,000 km",
    info: "Fast spinner.",
    textures: { map: TEXTURE_PATH + "4k_haumea_fictional.jpg" },
    model: {
      path: MODEL_PATH + "Haumea_1_1000.glb",
      scale: 1.2, // Adjusted for ellipsoid shape (1960km max vs 816km mean)
    },
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "Geometry is the NASA Science Haumea shape model, but the diffuse map is Solar System Scope's explicitly fictional Haumea texture — the mottled surface detail is invented, not observed.",
      limitationReason:
        "Haumea has never been resolved into a surface map; only its elongated shape, fast spin and crystalline-water-ice spectrum are measured.",
      sources: [
        {
          label: "NASA Science Haumea 3D model",
          url: "https://science.nasa.gov/resource/haumea-3d-model/",
        },
        {
          label: "Solar System Scope textures (CC BY 4.0, fictional set)",
          url: "https://www.solarsystemscope.com/textures/",
        },
      ],
    },
  },
  {
    id: "makemake",
    group: "other",
    type: "dwarf",
    name: { en: "MAKEMAKE", pt: "MAKEMAKE" },
    radiusKm: 715,
    color: "#D4A574",
    orbit: {
      a: 45.715,
      e: 0.159,
      i: 29.0,
      O: 79.4,
      w: 298.4,
      M0: 165.5,
      // Kepler-routed: two-body mean motion for a = 45.715 AU.
      n: 0.0031891,
    },
    rotationPeriodHours: 7.77,
    axialTilt: 0,
    classification: "Dwarf Planet",
    mass: "~3.1 × 10²¹ kg",
    // Mass (from MK 2's orbit) and radius (2011 occultation) are both
    // measured, so gravity is the derived field: GM/R² = 0.405 m/s².
    // Was 0.5 (+24%). 2026-07-23.
    gravity: "~0.4 m/s²",
    composition: "Methane ice, rocks",
    atmosphere: "Possible temporary methane exosphere",
    dayLength: "~7.7 hours",
    yearLength: "305 Earth years",
    curiosity:
      "Makemake is the second-brightest object in the Kuiper Belt as seen from Earth (after Pluto). It is covered in methane and ethane ice.",
    facts: [
      "It lacks a significant atmosphere, unlike Pluto.",
      "Its surface is extremely cold, around -243°C.",
      "It was discovered shortly after Easter, hence the code name 'Easterbunny'.",
    ],
    records: ["Second brightest TNO", "Classic Kuiper Belt Object"],
    explorationMilestone: {
      year: 2005,
      description:
        "Discovery led to the creation of the 'dwarf planet' category",
    },
    description:
      "Makemake is a dwarf planet and perhaps the second-largest Kuiper belt object in the classical population, with a diameter approximately two-thirds that of Pluto. Makemake has one known satellite, S/2015 (136472) 1, nicknamed MK 2. Its extremely low average temperature, about 30 K (−243.2 °C), means its surface is covered with methane, ethane, and possibly nitrogen ices.",
    distanceFromParent: "6,850,000,000 km",
    info: "Dwarf planet.",
    textures: { map: TEXTURE_PATH + "4k_makemake_fictional.jpg" },
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "The diffuse map is Solar System Scope's explicitly fictional Makemake texture; only the reddish methane-ice tone is observationally grounded.",
      limitationReason:
        "Makemake has never been resolved beyond a point source, so every surface feature in the shipped map is invented.",
      sources: [
        {
          label: "Solar System Scope textures (CC BY 4.0, fictional set)",
          url: "https://www.solarsystemscope.com/textures/",
        },
        {
          label: "NASA Science - Makemake",
          url: "https://science.nasa.gov/dwarf-planets/makemake/",
        },
      ],
    },
  },
  {
    id: "eris",
    group: "other",
    type: "dwarf",
    name: { en: "ERIS", pt: "ÉRIS" },
    radiusKm: 1163,
    color: "#F0E6D2",
    orbit: {
      a: 67.781,
      e: 0.44,
      i: 44.04,
      O: 35.8,
      w: 151.4,
      M0: 205.9,
      // Kepler-routed: two-body mean motion for a = 67.781 AU.
      // The old 0.001 ran the orbit 1.77x too slow.
      n: 0.0017663,
    },
    rotationPeriodHours: 25.9,
    axialTilt: 0,
    classification: "Dwarf Planet",
    mass: "1.66 × 10²² kg",
    gravity: "~0.8 m/s²",
    composition: "Methane ice, nitrogen, rocks",
    atmosphere: "Possible methane atmosphere (temporary)",
    dayLength: "~25.9 hours",
    yearLength: "558 Earth years",
    curiosity:
      "Eris is more massive than Pluto but slightly smaller in diameter. Its discovery was the final straw that led to Pluto's demotion.",
    facts: [
      "It takes 558 Earth years to orbit the Sun.",
      "Its surface is highly reflective, suggesting a fresh coating of methane ice.",
      "It has one moon, Dysnomia.",
    ],
    records: ["Most massive dwarf planet", "Farthest dwarf planet"],
    explorationMilestone: {
      year: 2005,
      description:
        "Discovery by Mike Brown, Chad Trujillo, and David Rabinowitz",
    },
    description:
      "Eris is the most massive and second-largest known dwarf planet in the Solar System. It is a trans-Neptunian object (TNO) in the scattered disk and has a high-eccentricity orbit. Eris was discovered in January 2005 by a Palomar Observatory-based team led by Mike Brown and verified later that year.",
    distanceFromParent: "10,120,000,000 km",
    info: "Massive dwarf.",
    textures: { map: TEXTURE_PATH + "4k_eris_fictional.jpg" },
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "The shipped map is explicitly fictional at its source - Solar System Scope publish it as an imagined Eris. Only the very high albedo and the methane-ice colour are observationally grounded; every surface feature is invented.",
      limitationReason:
        "Eris has only ever been observed as a point source plus stellar occultations, so no measured global surface map exists and none can until a spacecraft or a far larger telescope resolves it. Licensed CC BY 4.0 (eris-map-active).",
      sources: [
        {
          label: "NASA Science - Eris",
          url: "https://science.nasa.gov/dwarf-planets/eris/",
        },
      ],
    },
  },
  // Dwarf Planets & TNOs
  {
    id: "gonggong",
    group: "other",
    type: "tno",
    name: { en: "GONGGONG", pt: "GONGGONG" },
    radiusKm: 615,
    color: "#A03020",
    orbit: { a: 67.5, e: 0.5, i: 30.7, O: 0, w: 0, M0: 0, n: 0.0018 },
    rotationPeriodHours: 22.4,
    axialTilt: 0,
    classification: "Trans-Neptunian Object (candidate Dwarf Planet)",
    mass: "~1.75 × 10²¹ kg",
    // Mass comes from Xiangliu's orbit and the radius from the 2016
    // occultation; both are measured, so gravity is derived: GM/R².
    // Was 0.24 (-22%). 2026-07-23.
    gravity: "~0.31 m/s² (estimated)",
    composition: "Water ice, methane, rocks",
    atmosphere: "Not detected",
    dayLength: "~22 hours",
    yearLength: "~554 Earth years",
    curiosity:
      "Gonggong is named after a Chinese water god responsible for floods and chaos. It is likely a dwarf planet, though not yet officially recognized.",
    facts: [
      "It has a small moon named Xiangliu.",
      "Its surface is very red, likely due to tholins (organic compounds).",
      "It has a highly eccentric orbit, taking it far from the Sun.",
    ],
    records: ["Reddest TNO", "Largest unnamed dwarf planet candidate"],
    explorationMilestone: {
      year: 2007,
      description:
        "Discovered by Megan Schwamb, Mike Brown, and David Rabinowitz",
    },
    description:
      "Gonggong is a trans-Neptunian object in the scattered disc, orbiting the Sun. It is the fifth-largest known trans-Neptunian object (not counting Charon). Gonggong is red in color, likely due to the presence of organic compounds called tholins on its surface. It has a rotation period of roughly 22 hours.",
    distanceFromParent: "~10,000,000,000 km",
    info: "Reddish surface.",
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "No resolved global surface map exists; this visualization is interpretive and guided by Gonggong's very red observed color.",
      limitationReason:
        "Gonggong has only been observed remotely, without a reusable global map from spacecraft or resolved telescopic imaging.",
      sources: [
        {
          label: "Planetary Society reference",
          url: "https://www.planetary.org/space-images/2007-or10",
        },
      ],
    },
  },
  {
    id: "quaoar",
    group: "other",
    type: "tno",
    name: { en: "QUAOAR", pt: "QUAOAR" },
    radiusKm: 555,
    color: "#806050",
    orbit: { a: 43.7, e: 0.038, i: 8.0, O: 0, w: 0, M0: 0, n: 0.0035 },
    // Double-peaked lightcurve solution (17.6788 h), which is the one
    // Kiss et al. 2024 adopt and the one `dayLength` already quotes.
    // The old 8.84 h was the single-peaked half-period. 2026-07-23.
    rotationPeriodHours: 17.68,
    axialTilt: 0,
    classification: "Trans-Neptunian Object",
    // Kiss et al. 2024 system mass from Weywot's orbit. Replaces the
    // older 1.4 × 10²¹ estimate; also what makes Weywot's 12.43 d
    // period come out right under two-body propagation.
    mass: "~1.2 × 10²¹ kg",
    gravity: "~0.26 m/s²",
    composition: "Water ice, rocks, methane",
    atmosphere: "Not detected",
    dayLength: "~17.7 hours",
    yearLength: "~287 Earth years",
    curiosity:
      "Quaoar has a ring system that orbits much further out than the Roche limit, challenging current theories of ring formation.",
    facts: [
      "It was named after the creator god of the Tongva people.",
      "It has a small moon named Weywot.",
      "Crystalline water ice has been detected on its surface, suggesting cryovolcanism.",
    ],
    records: ["Ring beyond Roche limit", "Dense TNO"],
    explorationMilestone: {
      year: 2002,
      description: "Discovered by Chad Trujillo and Mike Brown",
    },
    description:
      "Quaoar is a dwarf planet candidate in the Kuiper belt. It was discovered in 2002. Quaoar is about half the size of Pluto. It has one known moon, Weywot. Signs of water ice have been found on the surface, which suggests that cryovolcanism may be occurring. A small amount of methane is present on its surface, which can only be retained by the largest Kuiper belt objects.",
    distanceFromParent: "~6.4 billion km",
    info: "Has rings.",
    shapeScale: [1.18, 0.99, 0.86],
    visualProvenance: {
      fidelity: "observational-model",
      summary:
        "Shape is approximated as an observation-based ellipsoid rather than a perfect sphere.",
      limitationReason:
        "No resolved global texture map exists, so the surface remains interpretive even though the geometry reflects recent occultation-based constraints.",
      sources: [
        {
          label: "Kiss et al. 2024",
          url: "https://arxiv.org/abs/2401.12679",
        },
      ],
    },
  },
  {
    id: "orcus",
    group: "other",
    type: "tno",
    name: { en: "ORCUS", pt: "ORCUS" },
    radiusKm: 458,
    color: "#909090",
    orbit: { a: 39.4, e: 0.22, i: 20.6, O: 0, w: 0, M0: 0, n: 0.004 },
    // Double-peaked solution (13.19 h, Thirouin et al. 2010), matching
    // what `dayLength` already quotes. The old 10 h was the
    // single-peaked half-period from Ortiz et al. 2006. 2026-07-23.
    rotationPeriodHours: 13.19,
    axialTilt: 0,
    classification: "Trans-Neptunian Object",
    // The 6.32 × 10²⁰ kg figure measured from Vanth's orbit is the
    // SYSTEM mass. Split here on the 1:12 Orcus:Vanth mass ratio the
    // description quotes, so primary + moon sum back to the measured
    // system mass and both bodies land at sane densities
    // (Orcus 1.45 g/cm³, Vanth 1.08 g/cm³). 2026-07-23.
    mass: "~5.84 × 10²⁰ kg",
    gravity: "~0.186 m/s²",
    composition: "Water ice, rocks, ammonia",
    atmosphere: "Not detected",
    dayLength: "~13.2 hours",
    yearLength: "~247 Earth years",
    curiosity:
      "Orcus is often called the 'anti-Pluto' because its orbit is almost a mirror image of Pluto's. When Pluto is at perihelion (closest to Sun), Orcus is at aphelion (farthest).",
    facts: [
      "It has a large moon, Vanth, making it a binary system like Pluto-Charon.",
      "Its surface is covered in crystalline water ice and ammonia.",
      "It is named after the Etruscan god of the underworld.",
    ],
    records: ["Anti-Pluto orbit", "Ammonia-rich surface"],
    explorationMilestone: {
      year: 2004,
      description:
        "Discovered by Mike Brown, Chad Trujillo, and David Rabinowitz",
    },
    description:
      "Orcus is a trans-Neptunian object in the Kuiper belt. It has a large moon, Vanth. Orcus is a plutino, meaning it is locked in a 2:3 orbital resonance with Neptune, like Pluto. However, its orbit is oriented opposite to Pluto's, earning it the nickname 'anti-Pluto'.",
    distanceFromParent: "~6.2 billion km",
    info: "Anti-Pluto.",
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "This surface is an observation-guided interpretation based on Orcus' broadly neutral icy appearance.",
      limitationReason:
        "No resolved global photographic map exists for Orcus, so the current look should not be read as a measured texture.",
      sources: [
        {
          label: "HST reference",
          url: "https://upload.wikimedia.org/wikipedia/commons/6/6b/Orcus_HST.jpg",
        },
      ],
    },
  },
  {
    id: "sedna",
    group: "other",
    type: "tno",
    name: { en: "SEDNA", pt: "SEDNA" },
    radiusKm: 500,
    color: "#B04030",
    orbit: { a: 524.4, e: 0.85, i: 11.9, O: 0, w: 0, M0: 0, n: 0.00008 },
    rotationPeriodHours: 10.3,
    axialTilt: 0,
    classification: "Trans-Neptunian Object (Scattered Disk region)",
    mass: "~1.0 × 10²¹ kg (estimated)",
    // Both mass and radius are estimates, but they must at least be
    // mutually consistent: GM/R² = 0.267. Was 0.18 (-33%). 2026-07-23.
    gravity: "~0.267 m/s² (estimated)",
    composition: "Methane ice, rocks, organic compounds",
    atmosphere: "Not detected",
    dayLength: "~10 hours",
    yearLength: "~11,400 Earth years",
    curiosity:
      "Sedna's orbit is exceptionally long and elliptical, taking about 11,400 years to complete one trip around the Sun.",
    facts: [
      "It is one of the reddest objects in the Solar System.",
      "It never comes close enough to the Sun to be affected by Neptune's gravity.",
      "Its origin is a mystery; it may have been captured from another star system.",
    ],
    records: ["Longest orbital period (major body)", "Most distant perihelion"],
    explorationMilestone: {
      year: 2003,
      description:
        "Discovered by Mike Brown, Chad Trujillo, and David Rabinowitz",
    },
    description:
      "Sedna is a large trans-Neptunian object, which as of 2024 is about 84 AU from the Sun, about three times as far as Neptune. Spectroscopy has revealed that Sedna's surface composition is similar to that of some other trans-Neptunian objects, being largely a mixture of water, methane, and nitrogen ices with tholins.",
    distanceFromParent:
      "~12 billion km (ultra eccentric: goes beyond 86 billion km)",
    info: "Far distant object.",
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "The current visual is interpretive, inspired by Sedna's observed red coloration and inferred icy-organic composition.",
      limitationReason:
        "There is no resolved spacecraft or telescope surface map for Sedna, only remote measurements and artist references.",
      sources: [
        {
          label: "Sedna reference",
          url: "https://upload.wikimedia.org/wikipedia/commons/6/68/Artist%27s_conception_of_Sedna.jpg",
        },
      ],
    },
  },
  {
    id: "salacia",
    group: "other",
    type: "tno",
    name: { en: "SALACIA", pt: "SALÁCIA" },
    radiusKm: 423,
    color: "#606060",
    orbit: { a: 42.2, e: 0.11, i: 23.9, O: 0, w: 0, M0: 0, n: 0.0036 },
    rotationPeriodHours: 6.09,
    axialTilt: 0,
    classification: "Trans-Neptunian Object",
    mass: "~4.38 × 10²⁰ kg",
    // Mass from Actaea's orbit and radius from the 2022 occultation are
    // the measured pair (density 1.38 g/cm³ matches the published
    // value); gravity is derived. Was 0.12 (-27%). 2026-07-23.
    gravity: "~0.163 m/s² (estimated)",
    composition: "Water ice, rocks",
    atmosphere: "Not detected",
    dayLength: "~6.09 hours",
    yearLength: "~271 Earth years",
    curiosity:
      "Salacia has a very low albedo (reflectivity) compared to other large TNOs, meaning its surface is quite dark.",
    facts: [
      "It orbits the Sun at an average distance of 42 AU.",
      "It has a moon named Actaea.",
      "Its density is low, suggesting it is composed mostly of water ice.",
    ],
    records: ["Darkest large TNO", "Low density"],
    explorationMilestone: {
      year: 2004,
      description:
        "Discovered by Henry Roe, Michael Brown, and Kristina Barkume",
    },
    description:
      "Salacia is a large trans-Neptunian object in the Kuiper belt. It is approximately 850 kilometers in diameter. Salacia has one known moon, Actaea. Both are named after Roman sea deities. Salacia's low density implies that it is composed primarily of water ice.",
    distanceFromParent: "~6.4 billion km",
    info: "Dark surface.",
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "This appearance is a simple interpretive material tuned to Salacia's dark, low-albedo character.",
      limitationReason:
        "Current observations do not provide a resolved global surface map, so detailed terrain would be speculative.",
      sources: [
        {
          label: "Keck reference",
          url: "https://commons.wikimedia.org/wiki/File:Salacia_and_Actaea_Keck-NIRC2.jpg",
        },
      ],
    },
  },
  // Moons of Dwarfs
  {
    id: "charon",
    parentId: "pluto",
    type: "moon",
    name: { en: "CHARON", pt: "CARONTE" },
    radiusKm: 606,
    color: "#A09080",
    /**
     * Ecliptic J2000. This record read `{ i: 0, O: 0, w: 0, M0: 0, n: 56.3 }`
     * until W6 stage B — parent-EQUATORIAL elements with a fabricated phase,
     * which only ever worked because the mount tilted them into place. The
     * values below are inverted from the same Horizons vector
     * `analytical/satellites.ts` uses, re-referenced to J2000.
     *
     * Nothing reads the orientation fields any more: `setup.ts` registers the
     * Kepler fallback from the analytical block directly, for the reasons
     * documented there. What survives here is the panel's display source.
     */
    orbit: {
      a: 0.00013098,
      e: 0.000096,
      i: 112.887853,
      O: 227.39293,
      w: 154.718896,
      M0: 166.600514,
      n: 56.3625225,
    },
    rotationPeriodHours: 153.3,
    iauOrientation: {
      poleRaDeg: 132.993,
      poleDecDeg: -6.163,
      primeMeridianDeg: 122.695,
      spinRateDegPerDay: 56.3625225,
    },
    classification: "Natural Satellite",
    mass: "1.59 × 10²¹ kg",
    gravity: "0.288 m/s²",
    composition: "Water ice, ammonia, rocks",
    atmosphere: "Not detected",
    dayLength: "6.39 days (synchronized with Pluto)",
    curiosity:
      "Charon is so large relative to Pluto that the two bodies orbit a common center of gravity outside of Pluto, making them a binary dwarf planet system.",
    facts: [
      "Its north pole is covered in reddish tholins, nicknamed 'Mordor Macula'.",
      "It has canyons deeper than the Grand Canyon.",
      "Charon does not have a significant atmosphere.",
    ],
    records: ["Largest moon relative to parent", "Binary dwarf planet"],
    explorationMilestone: {
      year: 2015,
      description: "New Horizons provided the first detailed images",
    },
    description:
      "Charon is the largest of the five known moons of the dwarf planet Pluto. With a mean radius of 606 km, Charon is the sixth-largest trans-Neptunian object after Pluto, Eris, Haumea, Makemake, and Gonggong. It was discovered in 1978 at the United States Naval Observatory in Washington, D.C., using photographic plates taken at the United States Naval Observatory Flagstaff Station (NOFS).",
    distanceFromParent: "19,570 km",
    info: "Binary partner.",
    textures: { map: TEXTURE_PATH + "4k_charon.png" },
  },
  {
    id: "vanth",
    parentId: "orcus",
    type: "moon",
    name: { en: "VANTH", pt: "VANTH" },
    radiusKm: 221,
    color: "#808080",
    // Measured orbit: a = 9030 km (6.04e-5 AU), P = 9.5393 d
    // (Brown & Butler 2018 / Sickafoose et al. 2019 occultation).
    // n was 90 deg/day (P = 4 d), i.e. 2.4x too fast on screen.
    orbit: { a: 0.0000604, e: 0.0, i: 0.0, O: 0, w: 0, M0: 0, n: 37.74 },
    // Tidally locked, so the rotation period IS the 9.5393 d orbital
    // period. The old 9.5 was the day count entered into an HOURS
    // field, spinning Vanth 24x too fast. 2026-07-23.
    rotationPeriodHours: 228.94,
    axialTilt: 0,
    classification: "Natural Satellite",
    // Vanth's share of the 6.32 × 10²⁰ kg Orcus-Vanth system mass under
    // the 1:12 ratio quoted in `description`. The old 7.5 × 10²⁰ made
    // the moon heavier than its primary and implied a 16.6 g/cm³
    // density — denser than any known Solar System body. 2026-07-23.
    mass: "~4.87 × 10¹⁹ kg (estimated)",
    gravity: "~0.067 m/s² (estimated)",
    composition: "Ice, rocks",
    atmosphere: "Not detected",
    dayLength: "Synchronized (~9.54 days)",
    curiosity:
      "Vanth is remarkably large compared to Orcus; if Orcus were a planet, Vanth would be the third largest moon relative to its planet in the Solar System.",
    facts: [
      "It orbits Orcus in a nearly perfect circle.",
      "Its surface is much darker than Orcus, suggesting a different composition.",
      "It is likely a captured object or formed from a giant impact.",
    ],
    records: ["Large moon relative to parent", "Dark surface"],
    explorationMilestone: {
      year: 2005,
      description: "Discovered by Mike Brown using the Hubble Space Telescope",
    },
    description:
      "Vanth is the single known natural satellite of the plutino and likely dwarf planet Orcus. It was discovered by Mike Brown in imagery taken by the Hubble Space Telescope on November 13, 2005. Vanth is massive compared to Orcus, with a mass ratio of about 1:12.",
    distanceFromParent: "~9,000 km",
    info: "Moon of Orcus.",
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "Vanth is shown with a simplified interpretive surface rather than a resolved moon map.",
      limitationReason:
        "No global texture exists for Vanth; observations only constrain brightness and broad color differences relative to Orcus.",
      sources: [
        {
          label: "Vanth reference",
          url: "https://upload.wikimedia.org/wikipedia/commons/e/e6/Vanth.png",
        },
      ],
    },
  },
  {
    id: "weywot",
    parentId: "quaoar",
    type: "moon",
    name: { en: "WEYWOT", pt: "WEYWOT" },
    radiusKm: 85,
    color: "#706050",
    // Measured orbit: a = 13,289 km (8.88e-5 AU), P = 12.431 d
    // (Vachier et al. 2012 / Kiss et al. 2024).
    orbit: { a: 0.0000888, e: 0.14, i: 0.0, O: 0, w: 0, M0: 0, n: 28.96 },
    // Tidally locked, so rotation = the 12.431 d orbital period. A
    // literal 0 was falsy at `Planet.tsx`'s `if (body.rotationPeriodHours)`
    // guard, so Weywot never rotated at all. 2026-07-23.
    rotationPeriodHours: 298.34,
    axialTilt: 0,
    classification: "Natural Satellite",
    // Exponent was written "10¹8" (superscript 1 + ASCII 8), which
    // `parseScientificValue` salvages but no renderer should have to.
    mass: "~3.3 × 10¹⁸ kg (estimated)",
    gravity: "~0.0305 m/s² (estimated)",
    composition: "Ice, rocks",
    atmosphere: "Not detected",
    dayLength: "Synchronized (~12.43 days)",
    curiosity:
      "Weywot is named after the Tongva sky father, the son of Quaoar. It was discovered in images taken to search for a ring system around Quaoar.",
    facts: [
      "It is estimated to be only about 80 km in diameter.",
      "It orbits Quaoar every 12.4 days.",
      "Its formation was likely due to a collision event.",
    ],
    records: ["Moon of a ringed TNO", "Collision fragment"],
    explorationMilestone: {
      year: 2007,
      description: "Discovered by Michael Brown",
    },
    description:
      "Weywot is the only known moon of the trans-Neptunian object Quaoar. It was discovered by Michael Brown in images acquired on February 14, 2006, by the Hubble Space Telescope. Weywot is estimated to be about 81 km in diameter.",
    distanceFromParent: "~13,300 km",
    info: "Moon of Quaoar.",
    visualProvenance: {
      fidelity: "interpretive",
      summary:
        "Weywot uses a simplified interpretive moon surface because it has only been observed in a very limited way.",
      limitationReason:
        "No resolved global asset exists for Weywot, so any detailed texture would be fabricated.",
      sources: [
        {
          label: "Weywot reference",
          url: "https://commons.wikimedia.org/wiki/File:Weywot_hst.jpg",
        },
      ],
    },
  },
  // Major Asteroids
  {
    id: "vesta",
    group: "inner",
    type: "asteroid",
    name: { en: "VESTA", pt: "VESTA" },
    radiusKm: 263,
    color: "#C0B0A0",
    orbit: { a: 2.36, e: 0.089, i: 7.14, O: 103.8, w: 151.2, M0: 20, n: 0.27 },
    rotationPeriodHours: 5.34,
    axialTilt: 29,
    classification: "Asteroid (Main Belt)",
    mass: "2.59 × 10²⁰ kg",
    gravity: "0.25 m/s²",
    composition: "Basalt, iron, nickel",
    atmosphere: "Not detected",
    dayLength: "5.34 hours",
    yearLength: "3.63 Earth years",
    curiosity:
      "Vesta is the brightest asteroid visible from Earth. It is the only main-belt asteroid visible to the naked eye.",
    facts: [
      "It has a giant mountain at its south pole, Rheasilvia, which is 22 km high.",
      "Vesta is responsible for about 6% of all meteorites found on Earth (HED meteorites).",
      "It has a differentiated interior with a crust, mantle, and core.",
    ],
    records: ["Brightest asteroid", "Tallest mountain in asteroid belt"],
    explorationMilestone: {
      year: 2011,
      description: "Dawn spacecraft orbited Vesta for over a year",
    },
    description:
      "Vesta is one of the largest objects in the asteroid belt, with a mean diameter of 525 kilometers. It was discovered by the German astronomer Heinrich Wilhelm Matthias Olbers on 29 March 1807 and is named after Vesta, the virgin goddess of home and hearth from Roman mythology. Vesta is the second-most-massive and second-largest body in the asteroid belt after the dwarf planet Ceres.",
    distanceFromParent: "353,400,000 km",
    info: "Brightest asteroid.",
    textures: { map: VESTA_DAWN_TEXTURE },
    model: {
      path: MODEL_PATH + "Vesta_1_100.glb",
      scale: 1, // Will be adjusted in component
    },
    visualProvenance: {
      fidelity: "measured",
      summary:
        "Shape and surface are based on Dawn mission products, with a NASA-provided 3D model used in the scene.",
      limitationReason:
        "This is one of the highest-fidelity minor bodies in the app, but fallback rendering may still use a simplified texture path if the 3D model cannot load.",
      sources: [
        {
          label: "NASA Vesta 3D model",
          url: "https://science.nasa.gov/resource/vesta-3d-model/",
        },
        {
          label: "USGS Dawn mosaic",
          url: "https://planetarymaps.usgs.gov/mosaic/Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif",
        },
      ],
    },
  },
  {
    id: "pallas",
    group: "inner",
    type: "asteroid",
    name: { en: "PALLAS", pt: "PALAS" },
    radiusKm: 256,
    color: "#8C8578",
    orbit: { a: 2.77, e: 0.23, i: 34.8, O: 173, w: 310, M0: 50, n: 0.213 },
    rotationPeriodHours: 7.81,
    axialTilt: 84,
    classification: "Asteroid (Main Belt)",
    mass: "2.11 × 10²⁰ kg",
    gravity: "~0.23 m/s²",
    composition: "Silicates, water ice",
    atmosphere: "Not detected",
    dayLength: "7.8 hours",
    yearLength: "4.62 Earth years",
    curiosity:
      "Pallas has a highly inclined orbit of 34.8 degrees, which is unusually steep for a large asteroid. This makes it difficult to reach with spacecraft.",
    facts: [
      "It is the third-largest asteroid by volume.",
      "Its surface is likely composed of silicate minerals.",
      "Pallas was the second asteroid to be discovered.",
    ],
    records: ["Most inclined major asteroid", "Second discovered asteroid"],
    explorationMilestone: {
      year: 1802,
      description: "Discovered by Heinrich Wilhelm Olbers",
    },
    description:
      "Pallas is the second asteroid to have been discovered (after Ceres), and it is one of the largest asteroids in the Solar System. It is estimated to comprise 7% of the mass of the asteroid belt, and its diameter of 512 km makes it the third-largest asteroid, slightly smaller than Vesta. It is likely a remnant protoplanet.",
    distanceFromParent: "414,500,000 km",
    info: "High inclination.",
    model: {
      path: MODEL_PATH + "Pallas_DAMIT_101.obj",
      scale: 1,
    },
    visualProvenance: {
      fidelity: "observational-model",
      summary:
        "The overall form comes from an observation-based DAMIT shape model rather than a perfect sphere.",
      limitationReason:
        "No spacecraft-style global photographic texture exists for Pallas, so the surface is intentionally kept as a simple material.",
      sources: [
        {
          label: "DAMIT model 101",
          url: "https://damit.cuni.cz/projects/damit/asteroid_models/view/101",
        },
      ],
    },
  },
  {
    id: "hygiea",
    group: "inner",
    type: "asteroid",
    name: { en: "HYGIEA", pt: "HÍGIA" },
    radiusKm: 217,
    color: "#404040",
    orbit: { a: 3.14, e: 0.11, i: 3.8, O: 283, w: 313, M0: 100, n: 0.176 },
    rotationPeriodHours: 13.8,
    axialTilt: 60,
    classification: "Asteroid (Main Belt)",
    mass: "8.32 × 10¹⁹ kg",
    gravity: "~0.12 m/s²",
    composition: "Silicates, carbon, water ice",
    atmosphere: "Not detected",
    dayLength: "13.8 hours",
    yearLength: "5.56 Earth years",
    curiosity:
      "Hygiea is the fourth-largest asteroid but was discovered much later than the others because of its dark surface. It is the main member of the Hygiea family of asteroids.",
    facts: [
      "It is nearly spherical, leading to debates about whether it should be a dwarf planet.",
      "Its surface is very dark, similar to Ceres.",
      "It contains water ice on its surface.",
    ],
    records: ["Largest dark asteroid", "Spherical asteroid candidate"],
    explorationMilestone: {
      year: 1849,
      description: "Discovered by Annibale de Gasparis",
    },
    description:
      "Hygiea is a major asteroid located in the main asteroid belt. With a diameter of 434 km, it is the fourth-largest asteroid in the Solar System by both volume and mass. Hygiea is the largest of the class of dark C-type asteroids with a carbonaceous surface that dominates the outer asteroid belt.",
    distanceFromParent: "470,000,000 km",
    info: "Carbonaceous.",
    textures: { map: HYGIEA_VLT_TEXTURE },
    model: {
      path: MODEL_PATH + "Hygiea_DAMIT_4392.obj",
      scale: 1,
    },
    visualProvenance: {
      fidelity: "observational-model",
      summary:
        "Shape comes from a DAMIT observation-based model, with a published VLT map kept as a candidate reference for surface appearance.",
      limitationReason:
        "The geometry is observation-based, but the remote VLT map is still under visual validation before it is promoted into the active diffuse render path.",
      sources: [
        {
          label: "DAMIT model 4392",
          url: "https://damit.cuni.cz/projects/damit/asteroid_models/view/4392",
        },
        {
          label: "VLT reference map",
          url: "https://commons.wikimedia.org/wiki/File:Hygiea_VLT_2017-2018_map.png",
        },
      ],
    },
  },
];

export const BODIES_BY_ID: ReadonlyMap<string, CelestialBody> = new Map(
  SOLAR_SYSTEM_BODIES.map((body) => [body.id, body])
);
