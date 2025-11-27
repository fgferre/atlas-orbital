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
}
