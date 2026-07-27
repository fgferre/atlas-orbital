import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useStore } from "../../store";
import { BODIES_BY_ID } from "../../data/celestialBodies";
import { AstroPhysics, AU_IN_KM } from "../../lib/astrophysics";
import { resolveBodyIauOrientation } from "../../lib/bodyOrientation";
import type { CelestialBody } from "../../lib/astrophysics";
import { resolveHeliocentricPositionAU } from "../../lib/orbital/heliocentric";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { resolveBodyName } from "../../lib/bodyName";
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
  const { i18n } = useTranslation();
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

  const displayedDatetime = useStore((state) => state.displayedDatetime);

  // Where this body sits relative to the Sun, seen from Earth. Scope is
  // sun-orbiting bodies plus the Moon: for the Moon the parent IS Earth, so the
  // composed heliocentric difference already IS the geocentric vector and the
  // result is the lunar phase. Other satellites are omitted — their elongation
  // sits within a degree of their parent's and adds no signal.
  const skyGeometry = useMemo(() => {
    if (!b || b.id === "sun" || b.id === "earth") return null;
    if (b.parentId && b.id !== "moon") return null;
    try {
      const earth = resolveHeliocentricPositionAU("earth", displayedDatetime);
      const body = resolveHeliocentricPositionAU(b.id, displayedDatetime);
      return AstroPhysics.resolveSkyGeometry(body, earth);
    } catch {
      return null;
    }
  }, [b, displayedDatetime]);

  // Earth's own catalog record is the comparison baseline, so the badges cannot
  // drift from the value the Earth panel itself prints.
  const earthBaseline = useMemo(() => {
    const earth = BODIES_BY_ID.get("earth");
    if (!earth) return null;
    const mass = AstroPhysics.parseScientificValue(earth.mass);
    return {
      radiusKm: earth.radiusKm,
      gravity: AstroPhysics.parseScientificValue(earth.gravity),
      mass,
      escape: AstroPhysics.calculateEscapeVelocity(mass, earth.radiusKm),
    };
  }, []);

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
    // Below 1e-3 the badge stops carrying information at any sane width —
    // Mimas is 6.3e-6 of Earth's mass — and a two-decimal render would state
    // "0.00× Earth" for a body that plainly has mass. No badge is honest; a
    // rounded-to-nothing one is not.
    if (ratio < 1e-3) return null;
    // Magnitude-aware: two decimals suit ratios around and above 1, but they
    // flatten Io's 0.015 mass ratio to 0.01. Significant figures keep small
    // bodies readable without padding large ones.
    const formatted =
      ratio >= 1 ? ratio.toFixed(2) : Number(ratio.toPrecision(2)).toString();
    return `${formatted}× ${suffix}`;
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
                {/* Both names on purpose — a bilingual affordance, not an
                    untranslated string. The ACTIVE language leads; the other
                    follows as the secondary line. */}
                <h1 className="mb-1 text-2xl font-orbitron uppercase tracking-wide text-white">
                  {resolveBodyName(b.name, i18n.language)}
                </h1>
                {b.name.pt !== b.name.en && (
                  <div className="mb-2 text-sm uppercase tracking-[0.18em] text-white/55">
                    {resolveBodyName(b.name, i18n.language) === b.name.pt
                      ? b.name.en
                      : b.name.pt}
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
                  {/* The catalog id is worth showing only when it carries
                      something the display name does not. For most bodies it
                      is the name again in lower case, i.e. a fourth
                      restatement before the reader reaches a single datum. */}
                  {b.id.toUpperCase() !== b.name.en.toUpperCase() && (
                    <span className="text-[10px] font-rajdhani uppercase tracking-wider text-white/35">
                      {b.id.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {/* Same rule for the type chip: "PLANET" under a
                    classification that already reads "TERRESTRIAL PLANET"
                    adds nothing, but a moon whose classification is
                    "NATURAL SATELLITE" still needs its type shown. */}
                {!(b.classification ?? "")
                  .toUpperCase()
                  .includes(b.type.toUpperCase()) && (
                  <HeaderChip label={b.type.toUpperCase()} />
                )}
                {parentBody && (
                  <HeaderChip label={`ORBITING ${parentBody.name.en}`} />
                )}
                {b.group && (
                  <HeaderChip label={`${b.group.toUpperCase()} SYSTEM`} />
                )}
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="custom-scrollbar scroll-fade-bottom flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 pt-4">
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
                    badge={
                      earthBaseline
                        ? getEarthComparison(b.radiusKm, earthBaseline.radiusKm)
                        : undefined
                    }
                  />
                  <StatBox
                    label="Gravity"
                    value={b.gravity}
                    badge={
                      b.gravity && earthBaseline
                        ? getEarthComparison(
                            AstroPhysics.parseScientificValue(b.gravity),
                            earthBaseline.gravity,
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
                    badge={
                      stats && earthBaseline
                        ? getEarthComparison(stats.escape, earthBaseline.escape)
                        : undefined
                    }
                  />
                  <StatBox
                    label="Mass"
                    value={b.mass}
                    badge={
                      b.mass && earthBaseline
                        ? getEarthComparison(
                            AstroPhysics.parseScientificValue(b.mass),
                            earthBaseline.mass
                          )
                        : undefined
                    }
                    fullWidth
                  />
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
                  <StatBox label="Rotation Period" value={b.dayLength} />
                  <StatBox
                    label="Orbital Period"
                    value={orbitalPeriod(b)?.value}
                    subLabel={orbitalPeriod(b)?.subLabel}
                  />
                  <StatBox
                    label="Distance"
                    value={b.distanceFromParent || `${b.orbit.a} AU`}
                    subLabel={
                      !b.distanceFromParent ? "(Avg from Sun)" : undefined
                    }
                  />
                  <StatBox label="Axial Tilt" value={axialTiltLabel(b)} />
                  <StatBox
                    label="Eccentricity"
                    value={b.orbit.e.toFixed(3)}
                    subLabel={b.orbit.e < 0.01 ? "Near-circular" : undefined}
                  />
                  <StatBox
                    label="Inclination"
                    value={inclinationToEcliptic(b)}
                    subLabel={
                      inclinationToEcliptic(b) ? "to ecliptic" : undefined
                    }
                  />
                  <StatBox
                    label={
                      b.parentId
                        ? "Periapsis / Apoapsis"
                        : "Perihelion / Aphelion"
                    }
                    value={orbitDistanceRange(b)}
                    fullWidth
                  />
                </div>
              </div>

              {/* Sky Geometry */}
              {skyGeometry && (
                <div>
                  <h3 className="text-nasa-accent text-[10px] uppercase tracking-widest mb-2 font-bold border-b border-white/5 pb-1">
                    Sky Geometry
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <StatBox
                      label="Elongation"
                      value={`${skyGeometry.elongationDeg.toFixed(1)}°`}
                      subLabel="from the Sun"
                    />
                    <StatBox
                      label="Illuminated"
                      value={`${(skyGeometry.illuminatedFraction * 100).toFixed(0)}%`}
                      subLabel="of the disc"
                    />
                  </div>
                  <p className="mt-1.5 text-[9px] text-gray-500 font-rajdhani">
                    Geometric, from body centres as seen from Earth&apos;s
                    centre. Says where the body is relative to the Sun, not
                    whether you could see it — there is no observer location,
                    atmosphere or twilight in this model.
                  </p>
                </div>
              )}

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

/**
 * The time for one orbit around the parent, and where the number came from.
 *
 * Twenty moons used to ship `yearLength: "Unknown"` while carrying `orbit.n`
 * in the same record — Io declared ignorance of a 1.77-day period it already
 * printed nine lines later as its rotation. The catalog string wins where it
 * exists; otherwise 360/n is the period, and it is labelled as derived rather
 * than passed off as a quoted value.
 *
 * The satellite validity window (2020-2030) deliberately does NOT appear here:
 * it bounds the *position* accuracy of the two-body propagation, while the
 * period is a time-independent constant of the record. Attaching it would be a
 * new false disclosure.
 */
const orbitalPeriod = (
  b: CelestialBody
): { value: string; subLabel?: string } | undefined => {
  if (b.yearLength) return { value: b.yearLength };
  const n = b.orbit?.n;
  if (!n) return undefined;
  return {
    value: `${(360 / n).toFixed(2)} days`,
    subLabel: "Derived from mean motion",
  };
};

/** Same <0.1 AU switch to km the Current Dist. box uses, so one body never
 *  reads in two units across the same panel. */
const formatDistance = (au: number): string =>
  au < 0.1
    ? `${(au * AU_IN_KM).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`
    : `${au.toFixed(2)} AU`;

/**
 * Inclination is only honest for sun-orbiting bodies.
 *
 * Catalog inclination for MOONS is measured against a mix of reference planes
 * — Triton's 156.8° is to Neptune's equator, Iapetus's 15.47° to its Laplace
 * plane, Io's 0.05° to Jupiter's equator — and no field records which. Printing
 * "Inclination 15.47°" with no plane named would be invented precision, so the
 * cell is omitted rather than qualified with a guess.
 *
 * Ω, ω and M are never rendered at all: five TNOs (Gonggong, Quaoar, Orcus,
 * Sedna, Salacia) carry fabricated zeros for them, and a panel that shows them
 * would present placeholders as measurements.
 */
const inclinationToEcliptic = (b: CelestialBody): string | undefined =>
  b.parentId ? undefined : `${b.orbit.i.toFixed(2)}°`;

/**
 * Obliquity, or nothing.
 *
 * Twenty-seven records carry `axialTilt: 0` as a placeholder rather than a
 * measurement — no moon in the catalog has a measured obliquity — and the cell
 * used to print all of them as a confident "0°", claiming every moon spins bolt
 * upright. A placeholder zero now renders N/A.
 *
 * The template is also guarded: `${b.axialTilt}°` on an absent field produces
 * the string "undefined°", which is truthy and sails straight past StatBox's
 * `value || "N/A"` fallback. W6 made the field optional, so the guard is now
 * load-bearing rather than defensive.
 *
 * "Does this body have a measured spin axis" is asked through
 * `resolveBodyIauOrientation` and not by sniffing `poleRA`: W6 moved nine
 * bodies up to a full `iauOrientation` record and off that field, and a stale
 * check here would have started hiding a real 0° as if it were a placeholder.
 */
const axialTiltLabel = (b: CelestialBody): string | undefined => {
  if (b.axialTilt === undefined || !Number.isFinite(b.axialTilt)) {
    return undefined;
  }
  if (b.axialTilt === 0 && resolveBodyIauOrientation(b) === null) {
    return undefined;
  }
  return `${b.axialTilt}°`;
};

/** Closest and farthest approach. A circular orbit collapses to one value
 *  rather than printing the same number on both sides of a dash. */
const orbitDistanceRange = (b: CelestialBody): string => {
  const { minAU, maxAU } = AstroPhysics.resolveOrbitDistanceBoundsAU(b.orbit);
  const near = formatDistance(minAU);
  const far = formatDistance(maxAU);
  return near === far ? near : `${near} – ${far}`;
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
