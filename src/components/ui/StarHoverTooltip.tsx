/**
 * HTML tooltip for the HYG hover picker.
 *
 * Lives outside the R3F Canvas (mounted by `App.tsx`) and reads the
 * current hover from the store. Positions itself next to the cursor
 * using the pixel coordinates the picker wrote. Does not render
 * anything while `hoveredStar` is null, so the DOM stays clean when
 * the feature is idle.
 */

import { useStore } from "../../store";

const CONSTELLATION_NAMES: Record<string, string> = {
  And: "Andromeda",
  Ant: "Antlia",
  Aps: "Apus",
  Aqr: "Aquarius",
  Aql: "Aquila",
  Ara: "Ara",
  Ari: "Aries",
  Aur: "Auriga",
  Boo: "Boötes",
  Cae: "Caelum",
  Cam: "Camelopardalis",
  Cnc: "Cancer",
  CVn: "Canes Venatici",
  CMa: "Canis Major",
  CMi: "Canis Minor",
  Cap: "Capricornus",
  Car: "Carina",
  Cas: "Cassiopeia",
  Cen: "Centaurus",
  Cep: "Cepheus",
  Cet: "Cetus",
  Cha: "Chamaeleon",
  Cir: "Circinus",
  Col: "Columba",
  Com: "Coma Berenices",
  CrA: "Corona Australis",
  CrB: "Corona Borealis",
  Crv: "Corvus",
  Crt: "Crater",
  Cru: "Crux",
  Cyg: "Cygnus",
  Del: "Delphinus",
  Dor: "Dorado",
  Dra: "Draco",
  Equ: "Equuleus",
  Eri: "Eridanus",
  For: "Fornax",
  Gem: "Gemini",
  Gru: "Grus",
  Her: "Hercules",
  Hor: "Horologium",
  Hya: "Hydra",
  Hyi: "Hydrus",
  Ind: "Indus",
  Lac: "Lacerta",
  Leo: "Leo",
  LMi: "Leo Minor",
  Lep: "Lepus",
  Lib: "Libra",
  Lup: "Lupus",
  Lyn: "Lynx",
  Lyr: "Lyra",
  Men: "Mensa",
  Mic: "Microscopium",
  Mon: "Monoceros",
  Mus: "Musca",
  Nor: "Norma",
  Oct: "Octans",
  Oph: "Ophiuchus",
  Ori: "Orion",
  Pav: "Pavo",
  Peg: "Pegasus",
  Per: "Perseus",
  Phe: "Phoenix",
  Pic: "Pictor",
  Psc: "Pisces",
  PsA: "Piscis Austrinus",
  Pup: "Puppis",
  Pyx: "Pyxis",
  Ret: "Reticulum",
  Sge: "Sagitta",
  Sgr: "Sagittarius",
  Sco: "Scorpius",
  Scl: "Sculptor",
  Sct: "Scutum",
  Ser: "Serpens",
  Sex: "Sextans",
  Tau: "Taurus",
  Tel: "Telescopium",
  Tri: "Triangulum",
  TrA: "Triangulum Australe",
  Tuc: "Tucana",
  UMa: "Ursa Major",
  UMi: "Ursa Minor",
  Vel: "Vela",
  Vir: "Virgo",
  Vol: "Volans",
  Vul: "Vulpecula",
};

const formatDistance = (parsecs: number | null) => {
  if (parsecs == null || !Number.isFinite(parsecs)) return null;
  const lightYears = parsecs * 3.26156;
  if (lightYears < 100) return `${lightYears.toFixed(1)} ly`;
  if (lightYears < 10_000) return `${Math.round(lightYears)} ly`;
  return `${(lightYears / 1000).toFixed(1)} kly`;
};

export const StarHoverTooltip = () => {
  const hoveredStar = useStore((state) => state.hoveredStar);
  if (!hoveredStar) return null;

  const { entry, distanceParsecs, screenX, screenY } = hoveredStar;
  const primaryName = entry.proper ?? entry.bayer ?? entry.flam;
  if (!primaryName) return null;

  const constellation = entry.con
    ? (CONSTELLATION_NAMES[entry.con] ?? entry.con)
    : null;
  const distance = formatDistance(distanceParsecs);
  const secondary = entry.proper && entry.bayer ? entry.bayer : undefined;

  // Offset to the lower-right of the cursor so the tooltip does not
  // occlude the pointer; margin tuned empirically to clear the default
  // cursor glyph at 1x DPR.
  const offsetX = 14;
  const offsetY = 12;

  return (
    <div
      role="tooltip"
      aria-live="polite"
      style={{
        position: "fixed",
        left: screenX + offsetX,
        top: screenY + offsetY,
        pointerEvents: "none",
      }}
      className="z-40 max-w-[220px] rounded border border-nasa-accent/40 bg-black/85 px-3 py-2 text-left shadow-[0_0_20px_rgba(0,240,255,0.15)] backdrop-blur-sm"
    >
      <div className="text-sm font-orbitron text-white leading-tight">
        {primaryName}
      </div>
      {secondary && (
        <div className="text-[10px] uppercase tracking-wider text-nasa-accent mt-0.5">
          {secondary}
        </div>
      )}
      <div className="mt-1 space-y-0.5 text-[11px] font-rajdhani text-gray-300">
        {constellation && <div>{constellation}</div>}
        <div>mag {entry.mag.toFixed(2)}</div>
        {distance && <div>{distance}</div>}
      </div>
    </div>
  );
};
