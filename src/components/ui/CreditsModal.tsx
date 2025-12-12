import { useStore } from "../../store";

export const CreditsModal = () => {
  const showCredits = useStore((state) => state.showCredits);
  const toggleCredits = useStore((state) => state.toggleCredits);

  if (!showCredits) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in text-left">
      <div
        className="w-full max-w-2xl bg-black/90 border border-nasa-accent/30 rounded-lg shadow-[0_0_50px_rgba(0,240,255,0.1)] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
          <div>
            <div className="text-xs text-nasa-accent font-orbitron tracking-[0.2em] mb-1">
              MISSION REPORT
            </div>
            <h2 className="text-2xl text-white font-orbitron uppercase tracking-wider">
              Acknowledgments
            </h2>
          </div>
          <button
            onClick={toggleCredits}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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
        <div className="p-6 overflow-y-auto space-y-8 custom-scrollbar">
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
                  title="NASA Eyes on the Solar System"
                  description="Primary source for orbital parameters and celestial body formatting."
                  link="https://eyes.nasa.gov/"
                />
                <CreditItem
                  title="Tycho-2 Star Catalog"
                  description="Astrometric data for the 2.5 million brightest stars."
                  link="https://www.cosmos.esa.int/web/hipparcos/tycho-2"
                />
                <CreditItem
                  title="NASA JPL Horizons"
                  description="Solar System Dynamics and ephemeris computation."
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
                <span className="text-2xl">🤖</span>
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
          className="text-nasa-accent opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
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
