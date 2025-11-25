import { useStore } from "../../store";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";

export const Sidebar = () => {
  const { selectedId, setSelectedId } = useStore();
  const b = SOLAR_SYSTEM_BODIES.find((x) => x.id === selectedId);

  // Even if no body is selected, we render the container but translate it off-screen
  // This allows for smooth CSS transitions
  const isVisible = !!b;

  return (
    <div
      className={`absolute top-20 left-4 w-80 glass-panel p-6 flex flex-col z-30 transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
        isVisible ? "translate-x-0" : "-translate-x-[120%]"
      }`}
      style={{
        clipPath:
          "polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%)",
      }}
    >
      {/* Tech Border Decoration */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-nasa-accent to-transparent opacity-50"></div>

      {/* Close Button */}
      <button
        onClick={() => setSelectedId(null)}
        className="absolute top-4 right-4 text-nasa-dim hover:text-nasa-accent transition-colors"
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
        <>
          <div className="text-[10px] text-nasa-accent uppercase tracking-[0.2em] mb-2 font-rajdhani font-bold">
            Target Locked
          </div>
          <h1 className="text-3xl font-orbitron text-white mb-2 tracking-wide uppercase">
            {b.name.en}
          </h1>

          <div className="flex items-center gap-2 mb-6">
            <span
              className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]`}
              style={{ background: b.color }}
            ></span>
            <span className="text-nasa-dim text-xs font-rajdhani uppercase tracking-wider">
              {b.type} Class
            </span>
          </div>

          <div className="text-sm text-gray-300 leading-relaxed font-rajdhani font-light border-t border-white/10 pt-4">
            <p className="mb-6">{b.info}</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/20 p-3 rounded border border-white/5">
                <div className="text-[10px] text-nasa-dim uppercase tracking-wider mb-1">
                  Radius
                </div>
                <div className="text-nasa-accent font-mono text-lg">
                  {b.radiusKm.toLocaleString()}{" "}
                  <span className="text-xs text-gray-500">km</span>
                </div>
              </div>
              <div className="bg-black/20 p-3 rounded border border-white/5">
                <div className="text-[10px] text-nasa-dim uppercase tracking-wider mb-1">
                  Orbit
                </div>
                <div className="text-nasa-accent font-mono text-lg">
                  {b.orbit.a} <span className="text-xs text-gray-500">AU</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
