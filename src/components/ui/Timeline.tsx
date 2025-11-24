import { useEffect, useRef } from 'react';
import { useStore } from '../../store';

export const Timeline = () => {
    const { datetime, isPlaying, setIsPlaying, speed } = useStore();
    const requestRef = useRef<number | undefined>(undefined);
    const previousTimeRef = useRef<number | undefined>(undefined);

    const animate = (time: number) => {
        if (previousTimeRef.current !== undefined) {
            const deltaTime = time - previousTimeRef.current;
            // Update time in store if playing
            // Note: Updating store every frame might be heavy if not optimized.
            // But since we use transient updates in R3F, here we update the React state for UI.
            // Actually, for the physics, we read from store.
            // If we update store every frame, it triggers re-renders of components subscribed to 'datetime'.
            // Planet.tsx subscribes to 'datetime' via useStore.getState() inside useFrame, so it doesn't re-render React component, which is good.
            // But Timeline component itself displays the date, so it needs to re-render.
            // That's fine for 60fps? Maybe.
            
            if (useStore.getState().isPlaying) {
                 useStore.getState().setDatetime((prev) => new Date(prev.getTime() + (speed * deltaTime/1000)*86400000));
            }
        }
        previousTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current!);
    }, []); // Run once, the loop reads from store ref

    return (
        <div className="absolute bottom-0 left-0 md:left-80 right-0 h-20 bg-nasa-panel backdrop-blur-md border-t border-white/10 flex flex-col justify-center items-center px-10 z-10 pointer-events-auto">
            <div className="flex items-center gap-4 w-full max-w-2xl mb-2">
                <span className="text-nasa-dim text-xs font-mono">NOV. 24, 2025</span>
                <div className="flex-1 h-[1px] bg-gray-700 relative"><div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-nasa-accent rounded-full shadow-[0_0_10px_#ff9d00]"></div></div>
                <span className="text-nasa-dim text-xs font-mono">10:06:00 AM</span>
            </div>
            <div className="flex items-center gap-4">
                 <button onClick={() => setIsPlaying(!isPlaying)} className="text-nasa-accent font-bold text-xs uppercase tracking-widest hover:text-white transition-colors">{isPlaying ? 'PAUSE' : 'LIVE'}</button>
                 <div className="text-white font-light text-sm font-mono tracking-widest">{datetime.toDateString().toUpperCase()}</div>
            </div>
        </div>
    )
}
