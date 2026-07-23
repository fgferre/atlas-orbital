import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // AUTHORITATIVE DENOMINATOR. Without an explicit `include`, v8 only
      // reports files a test actually imported — so 58 never-imported modules
      // (CameraController, Planet, Scene, Starfield, InitialCameraAnimation, …
      // ~3391 statements) silently vanished from the denominator and inflated
      // the reported number from the real ~50% to ~80%. Everything that does
      // not count must be listed in `exclude` below, explicitly and with a
      // reason — never by omission.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Test code itself is not production surface.
        "src/**/*.test.{ts,tsx}",
        // Test-only fixtures and helpers.
        "src/test/**",
        // Ambient type declarations — erased at compile time, zero runtime code.
        "src/**/*.d.ts",
        // Trivial DOM bootstrap entrypoint: `createRoot(...).render(<App />)`.
        // No branching logic; only reachable in a real browser, not in the
        // `node` test environment.
        "src/main.tsx",
      ],
      // Ratchet floor, NOT a target. Measured 2026-07-23 against the full
      // `src/` denominator above: statements 50.15 / branches 45.96 /
      // functions 47.12 / lines 51.21. Floors sit ~2 pts under so a real
      // regression fails the run while today's honest number passes.
      // Intent is to raise these per subsystem as coverage is added — never
      // to lower them.
      thresholds: {
        statements: 48,
        branches: 43,
        functions: 45,
        lines: 49,
      },
    },
  },
});
