import * as THREE from "three";

export const AU_IN_KM = 149597870.7;
export const AU_TO_3D_UNITS = 1000;
export const KM_TO_3D_UNITS = AU_TO_3D_UNITS / AU_IN_KM;

export type BodyType =
  | "star"
  | "planet"
  | "moon"
  | "dwarf"
  | "asteroid"
  | "comet"
  | "tno";

export interface OrbitParams {
  a: number; // Semi-major axis (AU)
  e: number; // Eccentricity
  i: number; // Inclination (deg)
  O: number; // Longitude of Ascending Node (deg)
  w: number; // Argument of Periapsis (deg)
  M0: number; // Mean Anomaly at Epoch (deg)
  n: number; // Mean Motion (deg/day)
}

export interface CelestialBody {
  id: string;
  parentId?: string;
  group?: "inner" | "outer" | "other";
  type: BodyType;
  name: { en: string; pt: string };
  radiusKm: number;
  color: string;
  orbit: OrbitParams;
  rotationPeriodHours: number; // Sidereal rotation period in hours (negative for retrograde)
  axialTilt: number; // Axial tilt in degrees
  rotationOffsetDegrees?: number; // Rotation offset at epoch for time synchronization (optional, default 0)
  rotationEpoch?: string; // ISO date for rotation reference (optional, default J2000.0)
  poleRA?: number; // Right Ascension of North Pole in degrees (IAU)
  poleDec?: number; // Declination of North Pole in degrees (IAU)

  // Enhanced Data Fields
  classification?: string; // e.g. "Terrestrial Planet", "Gas Giant"
  mass?: string;
  gravity?: string;
  composition?: string;
  atmosphere?: string;
  dayLength?: string;
  yearLength?: string;
  curiosity?: string;
  facts?: string[]; // Changed from single fact to array
  spectralClass?: string; // For stars
  description?: string;
  distanceFromParent?: string; // String from catalog (e.g. "57,910,000 km")

  // Legacy info field (keep for now or deprecate)
  info: string;

  textures?: {
    map?: string;
    bump?: string;
    atmosphere?: string;
    ring?: string;
    clouds?: string;
    night?: string;
  };

  // New Fields for Enhanced UI
  records?: string[]; // Superlatives/Records
  explorationMilestone?: {
    year: number;
    description: string;
  };

  ringSystem?: {
    innerRadius: number; // In planetary radii
    outerRadius: number; // In planetary radii
  };

  model?: {
    path: string;
    scale?: number;
    rotationOffset?: [number, number, number];
  };
}

export class AstroPhysics {
  static calculateLocalPosition(
    orbitParams: OrbitParams,
    date: Date,
    scaleMode: "didactic" | "realistic" = "realistic",
    systemMultiplier: number = 1
  ): THREE.Vector3 {
    const J2000 = new Date("2000-01-01T12:00:00Z").getTime();
    const d = (date.getTime() - J2000) / 86400000;
    const { a, e, i, O, w, M0, n } = orbitParams;
    let M = (M0 + n * d) % 360;
    const rad = Math.PI / 180;
    let E = M * rad;
    for (let k = 0; k < 5; k++)
      E = E - (E - e * Math.sin(E) - M * rad) / (1 - e * Math.cos(E));
    const P = a * (Math.cos(E) - e);
    const Q = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cosO = Math.cos(O * rad),
      sinO = Math.sin(O * rad);
    const cosw = Math.cos(w * rad),
      sinw = Math.sin(w * rad);
    const cosi = Math.cos(i * rad),
      sini = Math.sin(i * rad);
    const x =
      P * (cosw * cosO - sinw * sinO * cosi) -
      Q * (sinw * cosO + cosw * sinO * cosi);
    const y =
      P * (cosw * sinO + sinw * cosO * cosi) +
      Q * (cosw * cosO * cosi - sinw * sinO);
    const z = P * (sinw * sini) + Q * (cosw * sini);
    // Standard position in AU

    const posAU = new THREE.Vector3(x, z, -y);

    if (scaleMode === "didactic") {
      // Orrery Mode Scaling
      // Formula: r_visual = A * r_physical^B
      const distanceAU = posAU.length();

      // Avoid scaling 0 or very small distances
      if (distanceAU < 0.0001) return new THREE.Vector3(0, 0, 0);

      const exponent = 0.45;
      const scaleFactor = 300;

      let visualDistance = scaleFactor * Math.pow(distanceAU, exponent);

      // SYSTEM-WIDE RESCALING
      // Apply the multiplier calculated to preserve orbital ratios
      if (systemMultiplier > 1) {
        visualDistance *= systemMultiplier;
      }

      // Normalize direction and apply new magnitude
      return posAU.normalize().multiplyScalar(visualDistance);
    }

    // Realistic Mode: Linear scaling
    return posAU.multiplyScalar(AU_TO_3D_UNITS);
  }

  // Algorithmic Radius Calculation
  static calculateDidacticRadius(radiusKm: number): number {
    // Power Law: 0.3 * Radius^0.38
    // Sun (700k) -> ~50
    // Earth (6k) -> ~8
    // Moon (1.7k) -> ~5
    const val = 0.3 * Math.pow(radiusKm, 0.38);
    return Math.max(1.5, val);
  }

  // Calculate multipliers for each planetary system to ensure moons don't collide
  // while preserving their relative orbital ratios (resonances).
  static calculateSystemMultipliers(
    bodies: CelestialBody[]
  ): Record<string, number> {
    const multipliers: Record<string, number> = {};
    const systems: Record<string, CelestialBody[]> = {};

    // Group moons by parent
    bodies.forEach((body) => {
      if (body.parentId) {
        if (!systems[body.parentId]) systems[body.parentId] = [];
        systems[body.parentId].push(body);
      }
    });

    // Process each system
    Object.keys(systems).forEach((parentId) => {
      const parent = bodies.find((b) => b.id === parentId);
      if (!parent) return;

      const parentRadiusVis = this.calculateDidacticRadius(parent.radiusKm);
      let maxMultiplier = 1;

      // Ring System Logic
      let ringOuterVis = 0;
      let ringOuterPhys = 0;
      if (parent.ringSystem) {
        ringOuterVis = parentRadiusVis * parent.ringSystem.outerRadius;
        // Physical outer radius in AU (approximate for check)
        ringOuterPhys =
          (parent.radiusKm * parent.ringSystem.outerRadius) / AU_IN_KM;
      }

      // Check each moon in the system
      systems[parentId].forEach((moon) => {
        // Calculate algorithmic distance (without multiplier)
        const distAU = moon.orbit.a;
        if (distAU < 0.000001) return;

        const algoDist = 300 * Math.pow(distAU, 0.45);
        const moonRadiusVis = this.calculateDidacticRadius(moon.radiusKm);

        // Determine if moon is physically outside rings
        const isOutsideRings = ringOuterPhys > 0 && distAU > ringOuterPhys;

        // Required safe distance
        let safeDist = 0;

        if (isOutsideRings) {
          // If outside rings, must clear the rings + padding
          safeDist = ringOuterVis + moonRadiusVis + 2;
        } else {
          // If inside rings (or no rings), just clear the planet
          // (Inner moons like Pan might be inside rings, we let them be)
          safeDist = parentRadiusVis + moonRadiusVis + 2;
        }

        if (algoDist < safeDist) {
          const requiredMult = safeDist / algoDist;
          if (requiredMult > maxMultiplier) {
            maxMultiplier = requiredMult;
          }
        }
      });

      if (maxMultiplier > 1) {
        multipliers[parentId] = maxMultiplier;
      }
    });

    return multipliers;
  }

  // Default segments set to 1024 for sufficiently smooth orbits at typical zoom levels. Individual bodies may override this in Planet.tsx.
  static getRelativeOrbitPoints(
    orbitParams: OrbitParams,
    segments = 1024,
    scaleMode: "didactic" | "realistic" = "realistic",
    systemMultiplier: number = 1
  ): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const dummy = new Date("2000-01-01");
    const period = 360 / (orbitParams.n || 0.001);
    for (let j = 0; j <= segments; j++) {
      const t = new Date(dummy.getTime() + (j / segments) * period * 86400000);
      pts.push(
        this.calculateLocalPosition(orbitParams, t, scaleMode, systemMultiplier)
      );
    }
    return pts;
  }

  // Physics Helpers
  static calculateOrbitalVelocity(
    orbitParams: OrbitParams,
    currentDistanceAU: number,
    parentMassKg: number
  ): number {
    // Vis-viva equation: v = sqrt(GM * (2/r - 1/a))
    // G = 6.67430e-11 m^3 kg^-1 s^-2
    // But we can simplify for solar system relative to Earth/Sun if needed,
    // or use standard units. Let's use standard SI units.

    if (currentDistanceAU <= 0) return 0;

    const G = 6.6743e-11;
    const r = currentDistanceAU * AU_IN_KM * 1000; // meters
    const a = orbitParams.a * AU_IN_KM * 1000; // meters (semi-major axis)

    // If a is 0 (Sun), velocity is 0 (relative to itself)
    if (a === 0) return 0;

    // For circular approximation if e is small, v = sqrt(GM/r)
    // For elliptical: v = sqrt(GM * (2/r - 1/a))

    const v = Math.sqrt(G * parentMassKg * (2 / r - 1 / a));
    return v / 1000; // km/s
  }

  static calculateEscapeVelocity(massKg: number, radiusKm: number): number {
    // v_e = sqrt(2GM/r)
    const G = 6.6743e-11;
    const r = radiusKm * 1000; // meters
    const v = Math.sqrt((2 * G * massKg) / r);
    return v / 1000; // km/s
  }

  /**
   * Calculate rotation angle synchronized with real astronomical time
   * @param date Current date/time
   * @param rotationPeriodHours Sidereal rotation period in hours (negative for retrograde)
   * @param rotationOffsetDegrees Rotation offset at epoch in degrees (default 0)
   * @param rotationEpoch Reference date for the offset (default J2000.0)
   * @returns Rotation angle in radians
   */
  static calculateRotationAngle(
    date: Date,
    rotationPeriodHours: number,
    rotationOffsetDegrees: number = 0,
    rotationEpoch: Date = new Date("2000-01-01T12:00:00Z")
  ): number {
    const elapsed = date.getTime() - rotationEpoch.getTime();
    const elapsedHours = elapsed / 3600000;
    const rotations = elapsedHours / rotationPeriodHours;
    const angle = (rotations * 360 + rotationOffsetDegrees) % 360;
    return (angle * Math.PI) / 180; // Convert to radians
  }

  /**
   * Convert Equatorial Coordinates (RA, Dec) to Ecliptic Cartesian Vector
   * Used for orienting planetary poles correctly in the scene.
   * @param ra Right Ascension in degrees
   * @param dec Declination in degrees
   * @returns Normalized Vector3 representing the pole direction in Ecliptic space
   */
  static equatorialToEcliptic(ra: number, dec: number): THREE.Vector3 {
    const rad = Math.PI / 180;
    const alpha = ra * rad;
    const delta = dec * rad;

    // 1. Convert to Equatorial Cartesian (ICRF)
    // x points to Vernal Equinox
    // z points to Celestial North Pole
    const x = Math.cos(delta) * Math.cos(alpha);
    const y = Math.cos(delta) * Math.sin(alpha);
    const z = Math.sin(delta);

    // 2. Rotate to Ecliptic System
    // Rotate around X-axis by Earth's obliquity (epsilon)
    // epsilon ~ 23.43928 degrees
    const epsilon = 23.43928 * rad;
    const cosE = Math.cos(epsilon);
    const sinE = Math.sin(epsilon);

    // Rotation Matrix (X-axis rotation)
    // [ 1    0      0    ]
    // [ 0   cosE   sinE  ]
    // [ 0  -sinE   cosE  ]

    // However, we want to go from Equatorial TO Ecliptic.
    // The Ecliptic is tilted relative to Equatorial.
    // Usually, we define Ecliptic as the "flat" plane (XZ in our scene).
    // So we need to rotate the Equatorial vector by -epsilon (or +epsilon depending on definition).
    // Let's verify: North Celestial Pole (0, 0, 1) should become tilted by 23.44 deg.
    // If we rotate by -epsilon around X:
    // y' = y*cos(-e) - z*sin(-e) = y*cos(e) + z*sin(e)
    // z' = y*sin(-e) + z*cos(-e) = -y*sin(e) + z*cos(e)
    // For NCP (0,0,1): y'=sin(e), z'=cos(e). This tilts it "back" towards +Y.
    // Wait, in Three.js usually Y is up.
    // Let's assume our Scene: XZ is orbital plane (Ecliptic). Y is Ecliptic North.
    // So (0, 1, 0) is Ecliptic North Pole.
    // Earth's axis is tilted 23.44 deg from this.
    // The NCP (Equatorial North) is tilted 23.44 deg from Ecliptic North.

    // Let's stick to standard conversion:
    // Equatorial (x, y, z) -> Ecliptic (x', y', z')
    // x' = x
    // y' = y * cos(e) + z * sin(e)
    // z' = -y * sin(e) + z * cos(e)

    const y_ecl = y * cosE + z * sinE;
    const z_ecl = -y * sinE + z * cosE;

    // Now map to Three.js coordinates
    // Standard Astronomy: X=Vernal Equinox, Y=90deg East, Z=North Pole
    // Three.js Scene: X=Right, Y=Up, Z=Back (or similar)
    // In our app:
    // XZ plane is the orbit plane.
    // Y is Up (Ecliptic North).
    // So we map:
    // Astro X -> Three X
    // Astro Y -> Three -Z (since Z is usually "depth") or just Z?
    // Let's check calculateLocalPosition:
    // const posAU = new THREE.Vector3(x, z, -y);
    // It maps Astro X -> Three X
    // Astro Z (Up/North) -> Three Y
    // Astro Y -> Three -Z

    // So for our pole vector:
    // Astro x' -> Three X
    // Astro z' (Ecliptic North component) -> Three Y
    // Astro y' -> Three -Z

    return new THREE.Vector3(x, z_ecl, -y_ecl).normalize();
  }
}
