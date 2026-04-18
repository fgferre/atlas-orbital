import { afterEach, describe, expect, it, vi } from "vitest";
import { SimulationClock } from "./simulationClock";

describe("SimulationClock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initialDate on getNow before any advance", () => {
    const initial = new Date("2030-01-01T00:00:00Z");
    const clock = new SimulationClock({
      initialDate: initial,
      initialIsLiveMode: false,
    });
    expect(clock.getNow().getTime()).toBe(initial.getTime());
  });

  it("advances simulated time by speed * delta while playing (non-live)", () => {
    const initial = new Date("2030-01-01T00:00:00Z");
    const clock = new SimulationClock({
      initialDate: initial,
      initialSpeed: 10,
      initialIsPlaying: true,
      initialIsLiveMode: false,
    });

    clock.advanceForTest(100);
    expect(clock.getNow().getTime()).toBe(initial.getTime() + 10 * 100);

    clock.advanceForTest(50);
    expect(clock.getNow().getTime()).toBe(initial.getTime() + 10 * 150);
  });

  it("does not advance while paused", () => {
    const initial = new Date("2030-01-01T00:00:00Z");
    const clock = new SimulationClock({
      initialDate: initial,
      initialSpeed: 100,
      initialIsPlaying: false,
      initialIsLiveMode: false,
    });

    clock.advanceForTest(500);
    expect(clock.getNow().getTime()).toBe(initial.getTime());
  });

  it("snaps to real wall clock on setIsLiveMode(true)", () => {
    const pastDate = new Date("2030-01-01T00:00:00Z");
    const clock = new SimulationClock({
      initialDate: pastDate,
      initialIsLiveMode: false,
      initialIsPlaying: false,
    });

    expect(clock.getNow().getTime()).toBe(pastDate.getTime());

    const realNow = Date.now();
    clock.setIsLiveMode(true);
    expect(clock.getNow().getTime()).toBeGreaterThanOrEqual(realNow);
    expect(clock.getNow().getTime()).toBeLessThan(realNow + 200);
  });

  it("emits a UI tick on seek and sends the new snapshot", () => {
    const clock = new SimulationClock({
      initialDate: new Date("2030-01-01T00:00:00Z"),
      initialIsLiveMode: false,
      initialIsPlaying: false,
    });

    const handler = vi.fn();
    clock.onUiTick(handler);

    const target = new Date("2040-06-15T12:00:00Z");
    clock.seek(target);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].getTime()).toBe(target.getTime());
    expect(clock.getNow().getTime()).toBe(target.getTime());
  });

  it("emits UI tick on pause and coalesces while paused", () => {
    const clock = new SimulationClock({
      initialDate: new Date("2030-01-01T00:00:00Z"),
      initialSpeed: 10,
      initialIsLiveMode: false,
      initialIsPlaying: true,
    });

    const handler = vi.fn();
    clock.onUiTick(handler);

    clock.setIsPlaying(false);
    expect(handler).toHaveBeenCalledTimes(1);

    clock.advanceForTest(10_000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("emits UI ticks at the configured cadence while playing (non-live)", () => {
    const clock = new SimulationClock({
      initialDate: new Date("2030-01-01T00:00:00Z"),
      initialSpeed: 1,
      initialIsPlaying: true,
      initialIsLiveMode: false,
      uiTickMs: 250,
    });

    const handler = vi.fn();
    clock.onUiTick(handler);

    clock.advanceForTest(100);
    clock.advanceForTest(100);
    expect(handler).toHaveBeenCalledTimes(0);

    clock.advanceForTest(100);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes cleanly via the returned function", () => {
    const clock = new SimulationClock({
      initialDate: new Date("2030-01-01T00:00:00Z"),
      initialIsLiveMode: false,
      initialIsPlaying: false,
    });

    const handler = vi.fn();
    const unsubscribe = clock.onUiTick(handler);

    clock.seek(new Date("2031-01-01T00:00:00Z"));
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    clock.seek(new Date("2032-01-01T00:00:00Z"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("syncFromState flips playing and picks up new speed", () => {
    const clock = new SimulationClock({
      initialDate: new Date("2030-01-01T00:00:00Z"),
      initialSpeed: 1,
      initialIsPlaying: false,
      initialIsLiveMode: false,
    });

    clock.syncFromState({ speed: 60, isPlaying: true, isLiveMode: false });
    clock.advanceForTest(100);
    expect(clock.getNow().getTime()).toBe(
      new Date("2030-01-01T00:00:00Z").getTime() + 60 * 100
    );
  });

  it("syncFromState with matching isPlaying=true still emits a UI tick (boot parity)", () => {
    // Regression: the default class `isPlaying` is `true`. The boot call
    // `syncFromState({ isPlaying: true, ... })` used to short-circuit
    // without emitting a tick, leaving store consumers with a stale
    // displayedDatetime until the first user interaction.
    const clock = new SimulationClock({
      initialDate: new Date("2030-01-01T00:00:00Z"),
      initialSpeed: 1,
      initialIsPlaying: true,
      initialIsLiveMode: false,
    });

    const handler = vi.fn();
    clock.onUiTick(handler);

    clock.syncFromState({ speed: 1, isPlaying: true, isLiveMode: false });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("setSpeed takes effect on subsequent advance", () => {
    const clock = new SimulationClock({
      initialDate: new Date("2030-01-01T00:00:00Z"),
      initialSpeed: 1,
      initialIsPlaying: true,
      initialIsLiveMode: false,
    });

    clock.advanceForTest(100);
    const after1x = clock.getNow().getTime();

    clock.setSpeed(10);
    clock.advanceForTest(100);
    expect(clock.getNow().getTime() - after1x).toBe(10 * 100);
  });
});
