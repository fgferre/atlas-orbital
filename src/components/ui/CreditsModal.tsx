import { useRef } from "react";

import { useDialogFocus } from "../../hooks/useDialogFocus";
import { STARFIELD_SOURCE_METADATA } from "../../lib/starfield";
import { useStore } from "../../store";

export const CreditsModal = () => {
  const showCredits = useStore((state) => state.showCredits);
  const toggleCredits = useStore((state) => state.toggleCredits);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useDialogFocus({
    isOpen: showCredits,
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    onClose: toggleCredits,
  });

  if (!showCredits) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 text-left backdrop-blur-sm animate-fade-in"
      onClick={toggleCredits}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-title"
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-nasa-accent/30 bg-black/90 shadow-[0_0_50px_rgba(0,240,255,0.1)] focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
          <div>
            <div className="text-xs text-nasa-accent font-orbitron tracking-[0.2em] mb-1">
              MISSION REPORT
            </div>
            <h2
              id="credits-title"
              className="text-2xl text-white font-orbitron uppercase tracking-wider"
            >
              Acknowledgments
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            onClick={toggleCredits}
            aria-label="Close mission report"
            className="text-gray-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="custom-scrollbar space-y-8 overflow-y-auto overscroll-contain p-6">
          {/* Section: Project */}
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 border-l-2 border-nasa-accent pl-2">
              Atlas Orbital
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed font-rajdhani">
              An interactive 3D simulation of our solar system, designed to
              visualize celestial mechanics and scale. Built for educational
              purposes and "vibe coding" exploration.
            </p>
          </div>

          {/* Section: Data Sources */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Scientific Data
              </h3>
              <ul className="space-y-3">
                <CreditItem
                  title={STARFIELD_SOURCE_METADATA.nasa.creditsTitle}
                  description={
                    STARFIELD_SOURCE_METADATA.nasa.creditsDescription
                  }
                  link={STARFIELD_SOURCE_METADATA.nasa.creditsLink}
                />
                <CreditItem
                  title={STARFIELD_SOURCE_METADATA.hyg.creditsTitle}
                  description={STARFIELD_SOURCE_METADATA.hyg.creditsDescription}
                  link={STARFIELD_SOURCE_METADATA.hyg.creditsLink}
                />
                <CreditItem
                  title="NASA JPL Horizons"
                  description="Reference ephemeris for validation and fixture generation. Provides high-precision positions for comparison testing."
                  link="https://ssd.jpl.nasa.gov/horizons/"
                />
                <CreditItem
                  title="Orbital Calculation"
                  description="Offline analytical ephemerides: VSOP87D for the eight major planets, Meeus Ch. 37 theory for Pluto, ELP/MPP02 (truncated) for the Moon, and Horizons-derived osculating elements at epoch 2025-01-01 for the Galilean, Saturnian, Uranian and Martian satellites plus Ceres / Pallas / Vesta — propagated with a two-body Kepler step. Bodies without an analytical branch fall back transparently to Keplerian propagation, and every result is labelled with the model that actually ran."
                  link="https://github.com/commenthol/astronomia"
                />
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Visual Assets
              </h3>
              <ul className="space-y-3">
                <CreditItem
                  title="Solar System Scope"
                  description="High-resolution planetary surface textures."
                  link="https://www.solarsystemscope.com/"
                />
                <CreditItem
                  title="NASA Science / Dawn / USGS"
                  description="Observation-based Vesta model and Dawn-era surface products used for one of the app's highest-fidelity asteroid visuals."
                  link="https://science.nasa.gov/resource/vesta-3d-model/"
                />
                <CreditItem
                  title="DAMIT / Charles University"
                  description="Observation-derived shape models promoted for Pallas and Hygiea, replacing older local OBJ references."
                  link="https://damit.cuni.cz/projects/damit/"
                />
                <CreditItem
                  title="USGS Astrogeology / Voyager / Galileo / Cassini ISS"
                  description="Official global mosaics now used for Europa and Titan, based on Voyager, Galileo SSI, and Cassini ISS products."
                  link="https://astrogeology.usgs.gov/"
                />
                <CreditItem
                  title="ESO VLT / Wikimedia Commons"
                  description="Remote-observation reference maps kept for candidate review where no spacecraft-style global texture exists, including Hygiea."
                  link="https://commons.wikimedia.org/wiki/File:Hygiea_VLT_2017-2018_map.png"
                />
                <CreditItem
                  title="NASA Image and Video Library"
                  description="Official imagery for backgrounds and deep space objects."
                />
                <CreditItem
                  title="Community Artists"
                  description="Various textures adapted from DeviantArt space art community."
                />
              </ul>
            </div>
          </div>

          {/* Section: Development */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Development
            </h3>
            <div className="bg-white/5 p-4 rounded border border-white/5">
              <div className="flex items-center gap-3 mb-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full bg-nasa-accent shadow-[0_0_12px_rgba(0,240,255,0.45)]"
                ></span>
                <span className="text-nasa-accent font-bold font-orbitron">
                  AI-Assisted Development
                </span>
              </div>
              <p className="text-gray-400 text-xs font-mono mb-2">
                // This project was built using "Vibe Coding" techniques.
              </p>
              <p className="text-gray-300 text-sm font-rajdhani">
                Visual design, architecture, and implementation logic were
                heavily assisted by large language models, demonstrating the
                potential of AI in rapid prototyping and educational software
                development.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black/40 text-center">
          <p className="text-xs text-gray-500 font-mono">
            Developed by <strong>Felipe Ferreira</strong> (Brazil/SP) v0.1.0
          </p>
        </div>
      </div>
    </div>
  );
};

const CreditItem = ({
  title,
  description,
  link,
}: {
  title: string;
  description: string;
  link?: string;
}) => (
  <div className="group">
    <div className="flex items-center gap-2 mb-1">
      <h4 className="text-gray-200 font-bold text-sm font-rajdhani">{title}</h4>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-nasa-accent opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      )}
    </div>
    <p className="text-gray-500 text-xs leading-snug font-mono">
      {description}
    </p>
  </div>
);
