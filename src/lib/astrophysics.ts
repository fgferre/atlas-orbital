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
}

export class AstroPhysics {
  static calculateLocalPosition(
    orbitParams: OrbitParams,
    date: Date
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
    return new THREE.Vector3(
      x * AU_TO_3D_UNITS,
      z * AU_TO_3D_UNITS,
      -y * AU_TO_3D_UNITS
    );
  }

  // Increased from 180 to 4096 segments for ultra-smooth orbits
  static getRelativeOrbitPoints(
    orbitParams: OrbitParams,
    segments = 4096
  ): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const dummy = new Date("2000-01-01");
    const period = 360 / (orbitParams.n || 0.001);
    for (let j = 0; j <= segments; j++) {
      const t = new Date(dummy.getTime() + (j / segments) * period * 86400000);
      pts.push(this.calculateLocalPosition(orbitParams, t));
    }
    return pts;
  }
}
