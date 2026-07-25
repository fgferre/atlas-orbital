import { useMemo } from "react";

import { useStore } from "../../store";
import { BODIES_BY_ID } from "../../data/celestialBodies";
import { AstroPhysics, AU_IN_KM } from "../../lib/astrophysics";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  useOrbitalCalculation,
  useOrbitalProvenance,
} from "../../hooks/useOrbitalEngine";

const VISUAL_FIDELITY_LABELS = {
  measured: "Measured Asset",
  "observational-model": "Observational Model",
  interpretive: "Interpretive Visual",
  procedural: "Procedural Visual",
} as const;

export const Sidebar = () => {
  const selectedId = useStore((state) => state.selectedId);
  const setSelectedId = useStore((state) => state.setSelectedId);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const b = selectedId ? BODIES_BY_ID.get(selectedId) : undefined;
  // T6.4 post-audit (Codex): only feed the orbital engine known
  // curated body IDs. For HYG focus IDs (`hyg:K`) or any
  // selectedId that BODIES_BY_ID doesn't carry, fall back to
  // "sun" — otherwise `orbitalEngine.calculatePosition` throws
  // "No orbital provider available" → telemetry.error →
  // `console.error` on every Sidebar render. The Sidebar is
  // already invisible for non-curated `selectedId` (see
  // `isVisible` below), but the orbital call still ran.
  const orbitalBodyId = b && selectedId ? selectedId : "sun";
  const orbitalResult = useOrbitalCalculation(orbitalBodyId, b?.parentId);
  const orbitalCalculation =
    orbitalResult.state === "ready" ? orbitalResult.data : null;

  // Real-time Calculations
  const stats = useMemo(() => {
    if (!b || !orbitalCalculation) return null;

    const distAU = orbitalCalculation.distanceAU;
    const distKm = distAU * AU_IN_KM;

    let parentMass = 1.989e30; // Default Sun
    if (b.parentId) {
      const parent = b.parentId ? BODIES_BY_ID.get(b.parentId) : undefined;
      if (parent) parentMass = AstroPhysics.parseScientificValue(parent.mass);
    }

    const velocity = orbitalCalculation.velocity
      ? (orbitalCalculation.velocity.length() * AU_IN_KM) / 86400
      : AstroPhysics.calculateOrbitalVelocity(b.orbit, distAU, parentMass);

    const myMass = AstroPhysics.parseScientificValue(b.mass);
    const escape = AstroPhysics.calculateEscapeVelocity(myMass, b.radiusKm);

    return { distAU, distKm, velocity, escape };
  }, [b, orbitalCalculation]);

  // Comparators
  const getEarthComparison = (
    val: number,
    earthVal: number,
    suffix = "Earth"
  ) => {
    if (!Number.isFinite(val) || !Number.isFinite(earthVal) || !earthVal) {
      return null;
    }
    const ratio = val / earthVal;
    if (ratio >= 0.99 && ratio <= 1.01) return `1.00× ${suffix}`;
    return `${ratio.toFixed(2)}× ${suffix}`;
  };

  const formatTelemetryValue = (value: number, unit: string) => {
    if (!Number.isFinite(value)) return "N/A";
    return `${value.toFixed(1)} ${unit}`;
  };

  // Even if no body is selected, we render the container but translate it off-screen
  // This allows for smooth CSS transitions
  const isVisible = !!b;
  const parentBody = b?.parentId ? BODIES_BY_ID.get(b.parentId) : undefined;
  const panelClassName = isMobile
    ? `fixed left-3 right-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] h-[min(58dvh,34rem)] w-auto ${
        isVisible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-[110%] opacity-0 pointer-events-none"
      }`
    : `absolute left-4 top-20 w-[min(22rem,calc(100vw-2rem))] xl:w-[min(24rem,calc(100vw-2rem))] ${
        isVisible
          ? "translate-x-0 opacity-100 pointer-events-auto"
          : "-translate-x-[120%] opacity-0 pointer-events-none"
      }`;

  // The mobile chrome (`command-shell` / `panel-scan` / `tech-corners`)
  // declares `position: relative` in `src/index.css` outside any
  // `@layer`, so it outranks Tailwind v4's `fixed` utility (which lives
  // in `@layer utilities`) no matter the specificity. Applied to the
  // framing element itself it silently downgraded the sheet to
  // `position: relative`, and `bottom-[…]` then pushed the header —
  // body name included — above the top edge of the viewport.
  // The chrome therefore rides on a child that fills the framing box,
  // the same split SearchBar/GearPopover/LayersPanel already use.
  // Desktop keeps its exact box: `glass-panel` declares no `position`,
  // so it stays on the framing element and the child collapses to
  // `display: contents`, leaving that layout untouched.
  const surfaceClassName = isMobile
    ? "command-shell panel-scan tech-corners ghost-border flex h-full min-h-0 flex-col overflow-hidden"
    : "contents";

  return (
    <div
      data-ui-framing="sidebar"
      className={`${isMobile ? "" : "glass-panel"} z-30 flex flex-col overflow-hidden transition-[opacity,transform] duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${panelClassName}`}
      data-tutorial-target="info-panel"
      style={
        isMobile
          ? undefined
          : {
              maxHeight: "calc(100vh - 120px)",
              clipPath:
                "polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%)",
            }
      }
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className={surfaceClassName}>
        {/* Tech Border Decoration */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-nasa-accent to-transparent opacity-50"></div>

        {/* Close Button */}
        <button
          onClick={() => setSelectedId(null)}
          aria-label="Close selected body panel"
          className="absolute right-3 top-3 z-10 rounded border border-white/10 p-1.5 text-nasa-dim transition-colors hover:text-nasa-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
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
            <div className="shrink-0 border-b border-white/10 p-5 pb-4">
              <div className="min-w-0">
                <div className="mb-1 text-[10px] font-rajdhani font-bold uppercase tracking-[0.2em] text-nasa-accent">
                  Selected Body
                </div>
                <h1 className="mb-1 text-2xl font-orbitron uppercase tracking-wide text-white">
                  {b.name.en}
                </h1>
                {b.name.pt !== b.name.en && (
                  <div className="mb-2 text-sm uppercase tracking-[0.18em] text-white/55">
                    {b.name.pt}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]`}
                    style={{ background: b.color }}
                  ></span>
                  <span className="text-[10px] font-rajdhani uppercase tracking-wider text-nasa-dim">
                    {b.classification || b.type}
                  </span>
                  <span className="text-[10px] font-rajdhani uppercase tracking-wider text-white/35">
                    {b.id.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <HeaderChip label={b.type.toUpperCase()} />
                {parentBody && (
                  <HeaderChip label={`ORBITING ${parentBody.name.en}`} />
                )}
                {b.group && (
                  <HeaderChip label={`${b.group.toUpperCase()} SYSTEM`} />
                )}
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 pt-4">
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
                      value={formatTelemetryValue(stats.velocity, "km/s")}
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
                            AstroPhysics.parseScientificValue(b.gravity),
                            9.8,
                            "g"
                          )
                        : undefined
                    }
                  />
                  <StatBox
                    label="Escape Vel."
                    value={formatTelemetryValue(
                      stats?.escape ?? Number.NaN,
                      "km/s"
                    )}
                  />
                  <StatBox label="Mass" value={b.mass} fullWidth />
                  <StatBox
                    label="Composition"
                    value={b.composition}
                    fullWidth
                  />
                  {b.spectralClass && (
                    <StatBox
                      label="Spectral Class"
                      value={b.spectralClass}
                      fullWidth
                    />
                  )}
                </div>
              </div>

              {/* Description.
                  Below the live and physical data on purpose. This panel
                  used to open with the encyclopedia paragraph, which is the
                  least time-sensitive thing on screen and the only part a
                  learner could read anywhere else, while the readouts that
                  exist ONLY because a simulation is running sat below the
                  fold. Live state first, reference after. */}
              <div className="space-y-2">
                <h2 className="text-[10px] font-orbitron uppercase tracking-[0.22em] text-nasa-accent">
                  Quick Context
                </h2>
                <p className="text-sm leading-relaxed text-gray-300">
                  {b.description || b.info}
                </p>
              </div>

              {b.visualProvenance && (
                <div>
                  <h3 className="text-nasa-accent text-[10px] uppercase tracking-widest mb-2 font-bold border-b border-white/5 pb-1">
                    Visual Fidelity
                  </h3>
                  <div className="bg-black/20 p-3 rounded border border-white/5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] text-nasa-dim uppercase tracking-wider">
                        Source Type
                      </span>
                      <span className="text-[9px] bg-white/10 px-2 py-1 rounded text-nasa-accent font-mono uppercase tracking-wide">
                        {VISUAL_FIDELITY_LABELS[b.visualProvenance.fidelity]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 font-rajdhani">
                      {b.visualProvenance.summary}
                    </p>
                    {b.visualProvenance.limitationReason && (
                      <p className="text-xs text-gray-400 font-rajdhani">
                        {b.visualProvenance.limitationReason}
                      </p>
                    )}
                    {b.visualProvenance.sources &&
                      b.visualProvenance.sources.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {b.visualProvenance.sources
                            .slice(0, 2)
                            .map((source) => (
                              <a
                                key={source.url}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-nasa-accent underline underline-offset-2 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent"
                              >
                                {source.label}
                              </a>
                            ))}
                        </div>
                      )}
                  </div>
                </div>
              )}

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
                        className="flex items-start gap-2 rounded border border-yellow-500/20 bg-yellow-500/10 p-2"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                        ></span>
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

              {/* Orbital Model */}
              <OrbitalProvenanceDisplay bodyId={b.id} />

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
    </div>
  );
};

const HeaderChip = ({ label }: { label: string }) => (
  <span className="border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-orbitron uppercase tracking-[0.16em] text-white/70">
    {label}
  </span>
);

const OrbitalProvenanceDisplay = ({ bodyId }: { bodyId: string }) => {
  const provenance = useOrbitalProvenance(bodyId);

  return (
    <div>
      <h3 className="text-nasa-accent text-[10px] uppercase tracking-widest mb-2 font-bold border-b border-white/5 pb-1">
        Orbit Model
      </h3>
      <div className="bg-black/20 p-2 rounded border border-white/5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400 font-rajdhani">
            Current Method
          </span>
          <span className="text-xs text-nasa-accent font-mono">
            {provenance.isFallback ? "Kepler" : provenance.model}
          </span>
        </div>
        {provenance.isFallback && (
          <div className="mt-1.5 flex items-start gap-1.5">
            <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
              Fallback
            </span>
            <span className="text-[9px] text-amber-400/70 font-rajdhani">
              {provenance.plannedModel
                ? `${provenance.plannedModel} planned`
                : "Analytical provider planned"}
            </span>
          </div>
        )}
        <div className="mt-1.5 text-[9px] text-gray-500 font-rajdhani">
          {provenance.isFallback
            ? `Using Keplerian elements for the live calculation.${provenance.plannedModel ? ` ${provenance.plannedModel} remains planned and is not active yet.` : ""}`
            : `Using ${provenance.model} for the live orbital calculation.`}
        </div>
        {provenance.validityNote && (
          <div className="mt-1 text-[9px] text-gray-500 font-rajdhani">
            {provenance.validityNote}
          </div>
        )}
      </div>
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
