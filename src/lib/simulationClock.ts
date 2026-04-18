/**
 * SimulationClock — owns the passage of simulated time independently
 * from React and Zustand.
 *
 * Before this module existed, `Timeline.tsx` advanced `store.datetime`
 * inside `requestAnimationFrame` every frame (~60 Hz). Every component
 * that subscribed to `state.datetime` (Planet, Starfield, SmartSunLight,
 * useOrbitalEngine hooks consumed by Sidebar, Timeline itself) therefore
 * re-rendered at 60 Hz while the simulation was playing. With ~45 Planet
 * instances in the tree that reached thousands of React reconciliations
 * per second for no user-visible gain. The engine cache in
 * `src/lib/orbital/engine.ts` also cannot help when its input `Date`
 * object changes identity 60 times a second.
 *
 * Design:
 *
 * - The clock holds the current simulated time in a private field
 *   (`nowMs`) and advances it inside its own `requestAnimationFrame`
 *   loop. It never writes to the Zustand store itself.
 * - In-canvas consumers (anything inside `useFrame`) read the current
 *   time by calling `simulationClock.getNow()` directly. No React
 *   subscription, no re-render.
 * - UI surfaces that need a readable clock (Timeline readout, Sidebar
 *   stats, TopBar date label) subscribe via `onUiTick`. The clock emits
 *   a UI tick every ~250 ms while playing and on each milestone (pause,
 *   seek, live-mode toggle). The store bridge installed in `store.ts`
 *   mirrors that tick into `displayedDatetime`, which is what UI
 *   components subscribe to.
 * - The clock observes `isPlaying`, `speed`, and `isLiveMode` from the
 *   store (the Zustand bridge is set up in `store.ts`). This keeps the
 *   public contract with Timeline unchanged: components still drive
 *   playback by calling `setIsPlaying`, `setSpeed`, and `setLiveMode`
 *   on the store.
 *
 * The class is exported so tests can instantiate isolated clocks; the
 * `simulationClock` singleton is what production code consumes.
 */

export type SimulationClockUiTickHandler = (now: Date) => void;

const DEFAULT_UI_TICK_MS = 250;

export class SimulationClock {
  private nowMs: number;
  private speed: number;
  private isPlaying: boolean;
  private isLiveMode: boolean;
  private rafId: number | null = null;
  private lastFrameMs: number | null = null;
  private lastUiEmitMs = 0;
  private handlers = new Set<SimulationClockUiTickHandler>();
  private readonly uiTickMs: number;

  constructor(
    options: {
      initialDate?: Date;
      initialSpeed?: number;
      initialIsPlaying?: boolean;
      initialIsLiveMode?: boolean;
      uiTickMs?: number;
    } = {}
  ) {
    this.nowMs = (options.initialDate ?? new Date()).getTime();
    this.speed = options.initialSpeed ?? 1;
    this.isPlaying = options.initialIsPlaying ?? true;
    this.isLiveMode = options.initialIsLiveMode ?? true;
    this.uiTickMs = options.uiTickMs ?? DEFAULT_UI_TICK_MS;
  }

  getNow(): Date {
    return new Date(this.nowMs);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  setIsLiveMode(isLive: boolean): void {
    if (this.isLiveMode === isLive) return;
    this.isLiveMode = isLive;
    if (isLive) this.nowMs = Date.now();
    this.emitUiTick();
  }

  setIsPlaying(playing: boolean): void {
    if (this.isPlaying === playing) return;
    this.isPlaying = playing;
    if (playing) {
      this.startLoop();
    } else {
      this.stopLoop();
      this.emitUiTick();
    }
  }

  seek(date: Date): void {
    this.nowMs = date.getTime();
    this.emitUiTick();
  }

  onUiTick(fn: SimulationClockUiTickHandler): () => void {
    this.handlers.add(fn);
    return () => {
      this.handlers.delete(fn);
    };
  }

  /**
   * Called by the store bridge at module init to line the clock up with
   * whatever the store's initial state claims, then kick off the loop
   * if the store says we should be playing.
   */
  syncFromState(state: {
    speed: number;
    isPlaying: boolean;
    isLiveMode: boolean;
  }): void {
    this.speed = state.speed;
    this.isLiveMode = state.isLiveMode;
    if (state.isLiveMode) this.nowMs = Date.now();
    this.isPlaying = state.isPlaying;
    // Drive the loop unconditionally from the intended state. `startLoop`
    // and `stopLoop` are idempotent so calling them on every sync is
    // safe, and calling `startLoop` here fixes the boot case where the
    // class default already has `isPlaying=true` but no rAF loop is
    // running yet.
    if (state.isPlaying) {
      this.startLoop();
    } else {
      this.stopLoop();
    }
    this.emitUiTick();
  }

  /**
   * Manually advance the simulated time without running the rAF loop.
   * Used by tests and by environments without `requestAnimationFrame`
   * available (Vitest in node environment).
   */
  advanceForTest(deltaMs: number): void {
    if (!this.isPlaying) return;
    if (this.isLiveMode) {
      this.nowMs = Date.now();
    } else {
      this.nowMs += this.speed * deltaMs;
    }
    this.lastUiEmitMs += deltaMs;
    if (this.lastUiEmitMs >= this.uiTickMs) {
      this.lastUiEmitMs = 0;
      this.emitUiTick();
    }
  }

  /**
   * Stops the internal loop and clears subscribers. Useful for test
   * teardown and hot-reload scenarios.
   */
  dispose(): void {
    this.stopLoop();
    this.handlers.clear();
  }

  private emitUiTick(): void {
    const snapshot = this.getNow();
    for (const fn of this.handlers) fn(snapshot);
  }

  private startLoop(): void {
    if (this.rafId !== null) return;
    if (typeof requestAnimationFrame === "undefined") return;
    this.lastFrameMs = null;
    this.rafId = requestAnimationFrame(this.loop);
  }

  private stopLoop(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.lastFrameMs = null;
  }

  private loop = (timestamp: number): void => {
    if (!this.isPlaying) {
      this.rafId = null;
      return;
    }

    if (this.lastFrameMs !== null) {
      const delta = timestamp - this.lastFrameMs;
      if (this.isLiveMode) {
        this.nowMs = Date.now();
      } else {
        this.nowMs += this.speed * delta;
      }

      if (timestamp - this.lastUiEmitMs >= this.uiTickMs) {
        this.lastUiEmitMs = timestamp;
        this.emitUiTick();
      }
    } else {
      this.lastUiEmitMs = timestamp;
    }

    this.lastFrameMs = timestamp;
    this.rafId = requestAnimationFrame(this.loop);
  };
}

export const simulationClock = new SimulationClock();
