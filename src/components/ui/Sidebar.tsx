import { useStore } from '../../store';
import { SOLAR_SYSTEM_BODIES } from '../../lib/astrophysics';

export const Sidebar = () => {
    const { selectedId } = useStore();
    const b = SOLAR_SYSTEM_BODIES.find(x => x.id === selectedId);
    
    if (!b) return null;

    return (
        <div className="absolute top-0 left-0 h-full w-80 bg-nasa-panel backdrop-blur-md p-6 flex flex-col z-10 border-r border-white/10 pointer-events-auto transition-transform duration-300">
            <div className="text-xs text-nasa-dim uppercase tracking-widest mb-1">Eyes on the Solar System</div>
            <h1 className="text-4xl font-light text-white mb-1 tracking-tight">{b.name.en}</h1>
            <div className="flex items-center gap-2 mb-6">
                    <span className={`w-2 h-2 rounded-full`} style={{background: b.color}}></span>
                    <span className="text-nasa-accent text-sm font-bold uppercase">{b.type}</span>
            </div>
            <div className="text-sm text-gray-300 leading-relaxed font-light">
                <p className="mb-4">{b.info}</p>
                <div className="grid grid-cols-2 gap-4 mt-6">
                    <div><div className="text-xs text-nasa-dim uppercase">Radius</div><div className="text-white font-mono">{b.radiusKm.toLocaleString()} km</div></div>
                    <div><div className="text-xs text-nasa-dim uppercase">Dist. from Sun</div><div className="text-white font-mono">{b.orbit.a} AU</div></div>
                </div>
            </div>
        </div>
    )
}
