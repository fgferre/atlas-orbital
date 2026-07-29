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
                  title={STARFIELD_SOURCE_METADATA.hyg.creditsTitle}
                  description={STARFIELD_SOURCE_METADATA.hyg.creditsDescription}
                  link={STARFIELD_SOURCE_METADATA.hyg.creditsLink}
                />
                <CreditItem
                  title="Star rendering — what is measured, what is not"
                  description="Star brightness is measured: apparent magnitude follows Pogson's ratio from the catalog's absolute magnitude and the live distance, so a star's screen flux is its real flux. Colour is derived from the catalog's B−V index through Ballesteros' temperature fit and CIE chromaticity, with a fixed +0.16 HSV saturation lift carried over from Gaia Sky — a deliberate, disclosed exaggeration, since true stellar colours are far paler than most renderings suggest. The rest is display, not sky: stars are drawn with a 0.62-pixel Gaussian point-spread function, which is a rendering choice and NOT the star's angular size, and stars bright enough to clip the display gain a halo modelled on the human eye's own scattering (the ciliary-corona r⁻³ lobe of Spencer et al., SIGGRAPH 1995). That halo is an observer artefact — the star has none. Diffraction spikes are off by default because they belong to a telescope's support vanes, never to a star; the Display panel's Star Optics control names the aperture being simulated when you turn them on."
                />
                <CreditItem
                  title="Display transform — AgX tone mapping"
                  description="HDR scene light is mapped to the screen through the AgX display transform (Troy Sobotka's AgX, as implemented in the postprocessing library), enabled by default on composer-capable hardware tiers. AgX is a rendering choice, not a physical claim: it compresses real high-dynamic-range values the display cannot show. The Display panel's Tone Mapping control can switch operators or disable it entirely."
                />
                <CreditItem
                  title="Sunlight brightness — three positions, one of them assisted by default"
                  description="Each world's sunlight is scaled by the inverse square of its REAL heliocentric distance from the ephemeris, in both scale modes — so brightness always tells the true story even when the didactic scale mode does not. How much of that range you actually see is a choice, named in the fidelity badge at the top-left. True brightness applies it uncorrected (Mercury ~10× Earth's, Neptune ~1/900) — physically faithful, and it spends the whole display range on whichever world you are exposed for. Assisted, the default, raises the irradiance to the power 0.35: a compression exponent that is a chosen display constant with no physical derivation, disclosed here as such. It preserves the real ORDERING and direction of every brightness change while compressing a ~9400:1 range into ~25:1 that a screen can show. Equalized lights every world as if it sat at Earth's distance, which is the pre-2026 behaviour and tells you nothing about distance."
                />
                <CreditItem
                  title="Exposure — an observer adapted to the world you are looking at"
                  description="Brightness on screen is irradiance times exposure, and this app sets exposure analytically rather than by measuring the frame: it is the reciprocal of the sunlight falling on the FOCUSED body, so that body always lands at reference display brightness and everything else is placed relative to it. That is what a camera does for its subject, and what an eye does for the scene it is standing in — Saturn receives about 1.1% of Earth's sunlight, but 1% of sunlight is still roughly the illumination of an overcast afternoon, which is why Cassini's images of Saturn are not black. Holding exposure at Earth's 1 AU instead, as this app did before, showed the outer planets as unlit discs and that was a rendering artefact, not a fact about the Solar System. With nothing focused — the system overview, and the view you start in — the anchor is Earth's 1 AU and exposure is exactly 1. Focus changes ramp the exposure in log (stop) space over about 1.5 seconds. Two consequences are deliberate and worth naming: the Sun's disc is exempt from exposure entirely, so it stays saturated no matter how dim the world you are exposed for (an adapted eye still cannot look at the Sun from Neptune); and the starfield is NOT exempt, so exposing for a distant world lifts the whole sky, exactly as dark adaptation does. This answers 'what does 0 EV mean' with an observer's adaptation state, not with an absolute radiometric claim — no W/m² or photometric EV figure is asserted anywhere."
                />
                <CreditItem
                  title="Planetshine & earthshine — a second, much fainter light"
                  description="Io and Europa also receive sunlight reflected off Jupiter ('Jupiter-shine'); the Moon receives the equivalent from Earth ('earthshine') — the only planetshine bright enough to see with the naked eye, filling in the dark part of a crescent Moon. Each is expressed as a fraction of the recipient's own local solar irradiance (Mergny & Schmidt 2024: Io 9.0×10⁻³, Europa 3.6×10⁻³ — Io is ~2.5× brighter, so shipping Europa alone would have cherry-picked the dimmer number). Ganymede's measured 2.2×10⁻³ sits below the 3.0×10⁻³ threshold used to decide which bodies are worth the extra shader work, so it is excluded and documented, not silently dropped; Callisto and the Pluto-Charon mutual shine Lauer et al. (2021) measured are outside this wave's scope for the same reason. Earthshine's peak brightness is derived from Earth's own geometric albedo and size rather than asserted (Glenar et al. 2019 characterise its spectrum, not a single ratio), and fades with the Moon's phase following the same (1 − phase)² shape Stellarium uses for its earthshine term. No new light source was added to the scene — both effects ride the same per-light photometry the Sun already uses, as CPU-computed values."
                />
                <CreditItem
                  title="Ambient light — a display floor, not physics"
                  description="The only physical light source in the scene is a single Sun point light with zero falloff exponent, so an unassisted render leaves every shadowed surface true black. A small ambient floor (0.02 by default) is added on top so dark terrain stays readable off a phone or projector — the same assist every comparable solar-system app ships: NASA Eyes on the Solar System defaults to 0.005, Stellarium hard-codes 0.02, OpenSpace defaults to 0.05. The Display panel's Ambient Floor × control scales it to 0 for the unassisted render."
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
