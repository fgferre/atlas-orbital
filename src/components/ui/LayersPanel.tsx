import { useStore } from '../../store';

export const LayersPanel = () => {
    const { showLabels, toggleLabels, showOrbits, toggleOrbits, scaleMode, toggleScaleMode } = useStore();
    return (
        <div className="absolute bottom-24 right-4 w-48 bg-nasa-panel backdrop-blur-md rounded-lg p-4 z-10 pointer-events-auto border border-white/10">
            <div className="flex items-center justify-between mb-3 cursor-pointer text-sm text-gray-300 font-semibold"><span>View Options &gt;</span></div>
            <div className="mb-4">
                <div className="text-[10px] text-nasa-dim uppercase tracking-widest mb-2">Scale Mode</div>
                <button onClick={toggleScaleMode} className={`w-full py-1.5 px-3 text-xs font-bold rounded border transition-all ${scaleMode === 'didactic' ? 'bg-nasa-accent text-black border-nasa-accent' : 'bg-transparent text-white border-gray-600 hover:border-white'}`}>
                    {scaleMode === 'didactic' ? 'DIDACTIC' : 'REAL 1:1'}
                </button>
            </div>
            <div className="space-y-2 border-t border-white/10 pt-3">
                <label className="flex items-center gap-2 cursor-pointer hover:text-white text-gray-400 text-xs"><input type="checkbox" checked={showLabels} onChange={toggleLabels} className="accent-nasa-accent"/> Labels</label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-white text-gray-400 text-xs"><input type="checkbox" checked={showOrbits} onChange={toggleOrbits} className="accent-nasa-accent"/> Orbits</label>
            </div>
        </div>
    )
}
