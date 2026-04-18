/**
 * telemetry
 *
 * Thin facade over `console.*` that gives us four named channels
 * (`boot`, `asset`, `perf`, `error`) and three levels (`info`, `warn`,
 * `error`). This is intentionally NOT a telemetry SDK: there is no
 * buffering, no transport, no sinks. The facade exists so that:
 *
 * 1. Callers write `telemetry.info("boot", "...", { ... })` instead of
 *    reinventing a `[prefix]` convention at every call site.
 * 2. Dev-only diagnostics (`info`, `warn`) compile to no-ops in
 *    production. Under Vite, `import.meta.env.DEV` is a literal boolean
 *    constant, so the inner `console.*` call is dead-code-eliminated in
 *    the prod bundle.
 * 3. `error` ALWAYS forwards to `console.error` — even in production.
 *    Uncaught exceptions and "the provider blew up mid-render" are the
 *    exact events that host pages may want to capture via an error
 *    reporter (Sentry, a `window.onerror` hook, browser devtools).
 *    Silencing those in prod would regress debuggability.
 *
 * If we ever add a real sink (remote logging, ring buffer for a debug
 * HUD, IndexedDB trail), it plugs in HERE and every call site gets it
 * for free. That's the only reason this module exists; keep it small.
 */

export type TelemetryChannel = "boot" | "asset" | "perf" | "error";
export type TelemetryLevel = "info" | "warn" | "error";

export interface TelemetryEvent {
  channel: TelemetryChannel;
  level: TelemetryLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

// `import.meta.env.DEV` is a Vite-injected literal boolean. We read it
// ONCE, into a module-level const, so the resulting `if (IS_DEV)`
// checks dead-code-eliminate under terser minification: in the prod
// bundle the entire `info` / `warn` body disappears.
//
// Tests override this via `__setIsDevForTesting`, which writes to a
// SECOND, mutable flag that is only consulted in dev builds (where
// terser hasn't already stripped that branch). In prod the test flag
// is irrelevant — the whole override path is eliminated together with
// the `info` / `warn` emitters.
const IS_DEV: boolean = import.meta.env.DEV;
let devOverride: boolean | null = null;

/**
 * Test-only hook. Pass `true`/`false` to force dev vs. prod behavior
 * inside unit tests, or `null` to restore the build-time
 * `import.meta.env.DEV` value. Not part of the public API.
 *
 * In a production bundle this function exists but has no effect on
 * `info`/`warn` because those branches are gone entirely.
 */
export const __setIsDevForTesting = (value: boolean | null): void => {
  devOverride = value;
};

const formatPrefix = (channel: TelemetryChannel, message: string): string =>
  `[${channel}] ${message}`;

const logError = (
  channel: TelemetryChannel,
  message: string,
  data?: Record<string, unknown>
): void => {
  if (data !== undefined) {
    console.error(formatPrefix(channel, message), data);
  } else {
    console.error(formatPrefix(channel, message));
  }
};

const logDev = (
  level: "info" | "warn",
  channel: TelemetryChannel,
  message: string,
  data?: Record<string, unknown>
): void => {
  if (!IS_DEV) return;
  // `devOverride` is only reachable in a dev build (terser has
  // eliminated this whole function in prod). Safe to consult freely.
  if (devOverride === false) return;

  const sink = level === "warn" ? console.warn : console.info;
  if (data !== undefined) {
    sink(formatPrefix(channel, message), data);
  } else {
    sink(formatPrefix(channel, message));
  }
};

// `error` always forwards, even in prod, so host-page error reporters
// still see it. In tests, `devOverride = false` must NOT suppress
// `error` — we only gate `info`/`warn`.
export const telemetry = {
  info: (
    channel: TelemetryChannel,
    message: string,
    data?: Record<string, unknown>
  ): void => logDev("info", channel, message, data),
  warn: (
    channel: TelemetryChannel,
    message: string,
    data?: Record<string, unknown>
  ): void => logDev("warn", channel, message, data),
  error: (
    channel: TelemetryChannel,
    message: string,
    data?: Record<string, unknown>
  ): void => logError(channel, message, data),
};
