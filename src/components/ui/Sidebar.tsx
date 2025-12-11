import { useStore } from "../../store";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { AstroPhysics, AU_IN_KM, AU_TO_3D_UNITS } from "../../lib/astrophysics";
import { useMemo } from "react";

export const Sidebar = () => {
  const { selectedId, setSelectedId, datetime } = useStore();
  const b = SOLAR_SYSTEM_BODIES.find((x) => x.id === selectedId);

  // Helper to parse mass string: "5.972 × 10²⁴ kg" -> 5.972e24
  const parseMass = (str?: string) => {
    if (!str) return 0;
    // Replace superscripts
    const supers: Record<string, string> = {
      "⁰": "0",
      "¹": "1",
      "²": "2",
      "³": "3",
      "⁴": "4",
      "⁵": "5",
      "⁶": "6",
      "⁷": "7",
      "⁸": "8",
      "⁹": "9",
    };
    let clean = str.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (m) => supers[m] || m);
    clean = clean
      .replace("× 10", "e")
      .replace(" kg", "")
      .replace(/,/g, "")
      .replace(/ /g, "");
    return parseFloat(clean);
  };

  // Real-time Calculations
  const stats = useMemo(() => {
    if (!b) return null;

    // 1. Distance (Relative to parent)
    // calculateLocalPosition returns scaled 3D units. Divide by AU_TO_3D_UNITS to get AU.
    const pos3D = AstroPhysics.calculateLocalPosition(
      b.orbit,
      datetime,
      "realistic"
    );
    const distAU = pos3D.length() / AU_TO_3D_UNITS;
    const distKm = distAU * AU_IN_KM;

    // 2. Velocity
    let parentMass = 1.989e30; // Default Sun
    if (b.parentId) {
      const parent = SOLAR_SYSTEM_BODIES.find((p) => p.id === b.parentId);
      if (parent) parentMass = parseMass(parent.mass);
    }
    const velocity = AstroPhysics.calculateOrbitalVelocity(
      b.orbit,
      distAU,
      parentMass
    );

    // 3. Escape Velocity
    const myMass = parseMass(b.mass);
    const escape = AstroPhysics.calculateEscapeVelocity(myMass, b.radiusKm);

    return { distAU, distKm, velocity, escape };
  }, [b, datetime]);

  // Comparators
  const getEarthComparison = (
    val: number,
    earthVal: number,
    suffix = "Earth"
  ) => {
    if (!val || !earthVal) return null;
    const ratio = val / earthVal;
    if (ratio >= 0.99 && ratio <= 1.01) return `1.00× ${suffix}`;
    return `${ratio.toFixed(2)}× ${suffix}`;
  };

  // Even if no body is selected, we render the container but translate it off-screen
  // This allows for smooth CSS transitions
  const isVisible = !!b;

  return (
    <div
      className={`absolute top-20 left-4 w-80 glass-panel flex flex-col z-30 transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) pointer-events-auto ${
        isVisible ? "translate-x-0" : "-translate-x-[120%]"
      }`}
      data-tutorial-target="info-panel"
      style={{
        maxHeight: "calc(100vh - 160px)",
        clipPath:
          "polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Tech Border Decoration */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-nasa-accent to-transparent opacity-50"></div>

      {/* Close Button */}
      <button
        onClick={() => setSelectedId(null)}
        className="absolute top-3 right-3 text-nasa-dim hover:text-nasa-accent transition-colors z-10"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {b && (
        <div className="flex flex-col h-full min-h-0">
          {/* Header Section (Fixed) */}
          <div className="p-5 pb-3 shrink-0">
            <div className="text-[10px] text-nasa-accent uppercase tracking-[0.2em] mb-1 font-rajdhani font-bold">
              Target Locked
            </div>
            <h1 className="text-2xl font-orbitron text-white mb-1 tracking-wide uppercase">
              {b.name.en}
            </h1>

            <div className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]`}
                style={{ background: b.color }}
              ></span>
              <span className="text-nasa-dim text-[10px] font-rajdhani uppercase tracking-wider">
                {b.classification || b.type} Class
              </span>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5 pt-0 custom-scrollbar space-y-4">
            {/* Description */}
            <p>{b.description || b.info}</p>

            {/* Live Data Grid */}
            {stats && b.id !== "sun" && (
              <div>
                <h3 className="text-nasa-accent text-[10px] uppercase tracking-widest mb-2 font-bold border-b border-white/5 pb-1 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  Real-time Telemetry
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <StatBox
                    label="Orbital Speed"
                    value={`${stats.velocity.toFixed(1)} km/s`}
                  />
                  <StatBox
                    label="Current Dist."
                    value={
                      stats.distAU < 0.1
                        ? `${stats.distKm.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })} km`
                        : `${stats.distAU.toFixed(3)} AU`
                    }
                    subLabel={`From ${
                      b.parentId
                        ? b.parentId.charAt(0).toUpperCase() +
                          b.parentId.slice(1)
                        : "Sun"
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Physical Stats Grid */}
            <div>
              <h3 className="text-nasa-accent text-[10px] uppercase tracking-widest mb-2 font-bold border-b border-white/5 pb-1">
                Physical Data
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <StatBox
                  label="Radius"
                  value={`${b.radiusKm.toLocaleString()} km`}
                  badge={getEarthComparison(b.radiusKm, 6371)}
                />
                <StatBox
                  label="Gravity"
                  value={b.gravity}
                  badge={
                    b.gravity
                      ? getEarthComparison(
                          parseFloat(b.gravity.split(" ")[0]),
                          9.8,
                          "g"
                        )
                      : undefined
                  }
                />
                <StatBox
                  label="Escape Vel."
                  value={`${stats?.escape.toFixed(1)} km/s`}
                />
                <StatBox label="Mass" value={b.mass} fullWidth />
                <StatBox label="Composition" value={b.composition} fullWidth />
                {b.spectralClass && (
                  <StatBox
                    label="Spectral Class"
                    value={b.spectralClass}
                    fullWidth
                  />
                )}
              </div>
            </div>

            {/* Records Section */}
            {b.records && b.records.length > 0 && (
              <div>
                <h3 className="text-nasa-accent text-[10px] uppercase tracking-widest mb-2 font-bold border-b border-white/5 pb-1">
                  Records
                </h3>
                <div className="space-y-1">
                  {b.records.map((rec, i) => (
                    <div
                      key={i}
                      className="bg-yellow-500/10 p-2 rounded border border-yellow-500/20 flex gap-2 items-start"
                    >
                      <span className="text-yellow-500 text-xs">🏆</span>
                      <p className="text-xs text-gray-300 font-rajdhani">
                        {rec}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Exploration Milestone */}
            {b.explorationMilestone && (
              <div>
                <h3 className="text-nasa-accent text-[10px] uppercase tracking-widest mb-2 font-bold border-b border-white/5 pb-1">
                  Exploration
                </h3>
                <div className="bg-purple-500/10 p-2 rounded border border-purple-500/20">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] text-purple-400 uppercase font-bold">
                      Major Milestone
                    </span>
                    <span className="text-[9px] text-purple-300 font-mono">
                      {b.explorationMilestone.year}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 font-rajdhani">
                    {b.explorationMilestone.description}
                  </p>
                </div>
              </div>
            )}

            {/* Orbital Stats Grid */}
            <div>
              <h3 className="text-nasa-accent text-[10px] uppercase tracking-widest mb-2 font-bold border-b border-white/5 pb-1">
                Orbital Data
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <StatBox label="Day Length" value={b.dayLength} />
                <StatBox label="Year Length" value={b.yearLength} />
                <StatBox
                  label="Distance"
                  value={b.distanceFromParent || `${b.orbit.a} AU`}
                  subLabel={
                    !b.distanceFromParent ? "(Avg from Sun)" : undefined
                  }
                />
                <StatBox label="Axial Tilt" value={`${b.axialTilt}°`} />
              </div>
            </div>

            {/* Atmosphere */}
            {b.atmosphere && b.atmosphere !== "Not detected" && (
              <div>
                <h3 className="text-nasa-accent text-[10px] uppercase tracking-widest mb-2 font-bold border-b border-white/5 pb-1">
                  Atmosphere
                </h3>
                <div className="bg-black/20 p-2 rounded border border-white/5">
                  <p className="text-xs text-gray-300 font-rajdhani">
                    {b.atmosphere}
                  </p>
                </div>
              </div>
            )}

            {/* Intel / Trivia */}
            {(b.curiosity || (b.facts && b.facts.length > 0)) && (
              <div>
                <h3 className="text-nasa-accent text-[10px] uppercase tracking-widest mb-2 font-bold border-b border-white/5 pb-1">
                  Intel
                </h3>
                <div className="space-y-2">
                  {b.curiosity && (
                    <div className="bg-nasa-accent/10 p-2 rounded border-l-2 border-nasa-accent">
                      <div className="text-[9px] text-nasa-accent uppercase mb-0.5 font-bold">
                        Curiosity
                      </div>
                      <p className="text-xs text-gray-300 font-rajdhani italic">
                        "{b.curiosity}"
                      </p>
                    </div>
                  )}
                  {b.facts &&
                    b.facts.map((fact, i) => (
                      <div
                        key={i}
                        className="bg-blue-500/10 p-2 rounded border-l-2 border-blue-400"
                      >
                        <div className="text-[9px] text-blue-400 uppercase mb-0.5 font-bold">
                          Fact {b.facts!.length > 1 ? i + 1 : ""}
                        </div>
                        <p className="text-xs text-gray-300 font-rajdhani">
                          {fact}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const StatBox = ({
  label,
  value,
  subLabel,
  fullWidth = false,
  badge,
}: {
  label: string;
  value?: string | number;
  subLabel?: string;
  fullWidth?: boolean;
  badge?: string | null;
}) => (
  <div
    className={`bg-black/20 p-2 rounded border border-white/5 ${
      fullWidth ? "col-span-2" : ""
    } relative overflow-hidden`}
  >
    <div className="flex justify-between items-start">
      <div className="text-[9px] text-nasa-dim uppercase tracking-wider mb-0.5">
        {label}
      </div>
      {badge && (
        <div className="text-[8px] bg-white/10 px-1 rounded text-nasa-accent font-mono">
          {badge}
        </div>
      )}
    </div>
    <div className="text-gray-200 font-mono text-xs leading-tight break-words">
      {value || "N/A"}
    </div>
    {subLabel && (
      <div className="text-[8px] text-gray-500 mt-0.5">{subLabel}</div>
    )}
  </div>
);
