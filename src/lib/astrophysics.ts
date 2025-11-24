import * as THREE from "three";

export const AU_IN_KM = 149597870.7;
export const AU_TO_3D_UNITS = 1000;
export const KM_TO_3D_UNITS = AU_TO_3D_UNITS / AU_IN_KM;

export type BodyType = "star" | "planet" | "moon" | "dwarf";

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
  info: string;
  textures?: {
    map?: string;
    bump?: string;
    atmosphere?: string;
  };
}

const TEXTURE_PATH =
  "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/";

export const SOLAR_SYSTEM_BODIES: CelestialBody[] = [
  {
    id: "sun",
    type: "star",
    name: { en: "SUN", pt: "SOL" },
    radiusKm: 696340,
    color: "#FFFFAA",
    orbit: { a: 0, e: 0, i: 0, O: 0, w: 0, M0: 0, n: 0 },
    info: "The heart of our solar system.",
    textures: {
      map: "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/sprites/snowflake1.png",
    },
  },
  {
    id: "mercury",
    group: "inner",
    type: "planet",
    name: { en: "MERCURY", pt: "MERCÚRIO" },
    radiusKm: 2439,
    color: "#A5A5A5",
    orbit: {
      a: 0.387,
      e: 0.205,
      i: 7.0,
      O: 48.3,
      w: 29.1,
      M0: 174.7,
      n: 4.092,
    },
    info: "Smallest planet.",
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
    info: "Thick atmosphere.",
  },
  {
    id: "earth",
    group: "inner",
    type: "planet",
    name: { en: "EARTH", pt: "TERRA" },
    radiusKm: 6371,
    color: "#4facfe",
    orbit: { a: 1.0, e: 0.016, i: 0.0, O: 0.0, w: 102.9, M0: 357.5, n: 0.985 },
    info: "Our home.",
    textures: {
      map: TEXTURE_PATH + "earth_atmos_2048.jpg",
      bump: TEXTURE_PATH + "earth_normal_2048.jpg",
    },
  },
  {
    id: "mars",
    group: "inner",
    type: "planet",
    name: { en: "MARS", pt: "MARTE" },
    radiusKm: 3389,
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
    info: "Red planet.",
    textures: { map: TEXTURE_PATH + "mars_1k.jpg" },
  },
  {
    id: "jupiter",
    group: "outer",
    type: "planet",
    name: { en: "JUPITER", pt: "JÚPITER" },
    radiusKm: 69911,
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
    info: "Gas giant.",
  },
  {
    id: "saturn",
    group: "outer",
    type: "planet",
    name: { en: "SATURN", pt: "SATURNO" },
    radiusKm: 58232,
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
    info: "Ring system.",
  },
  {
    id: "uranus",
    group: "outer",
    type: "planet",
    name: { en: "URANUS", pt: "URANO" },
    radiusKm: 25362,
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
    info: "Ice giant.",
  },
  {
    id: "neptune",
    group: "outer",
    type: "planet",
    name: { en: "NEPTUNE", pt: "NETUNO" },
    radiusKm: 24622,
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
    info: "Winds.",
  },
  {
    id: "moon",
    parentId: "earth",
    type: "moon",
    name: { en: "MOON", pt: "LUA" },
    radiusKm: 1737,
    color: "#CCCCCC",
    orbit: { a: 0.00257, e: 0.055, i: 5.14, O: 0, w: 0, M0: 0, n: 13.176 },
    info: "Earth satellite.",
    textures: { map: TEXTURE_PATH + "moon_1024.jpg" },
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
    info: "Dwarf planet.",
  },
  {
    id: "ceres",
    group: "inner",
    type: "dwarf",
    name: { en: "CERES", pt: "CERES" },
    radiusKm: 473,
    color: "#AAA",
    orbit: {
      a: 2.768,
      e: 0.076,
      i: 10.59,
      O: 80.3,
      w: 73.0,
      M0: 153.9,
      n: 0.214,
    },
    info: "Asteroid belt.",
  },
];

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
