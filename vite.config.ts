import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/atlas-orbital/",
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          // Check postfx FIRST — `@react-three/postprocessing` contains
          // the "three" substring used by the three-vendor rule below
          // (the "@react-three" path fragment itself matches). Without
          // this ordering the wrapper package would be claimed by
          // three-vendor and bumping postprocessing would invalidate the
          // long-term three-vendor cache (Codex P3).
          if (
            id.includes("@react-three/postprocessing") ||
            id.includes("/postprocessing/")
          ) {
            return "postfx";
          }
          // Keep three + fiber + drei together so they share module identity.
          // `/three/` anchors to the `three` package root rather than any
          // substring containing the word.
          if (
            id.includes("/three/") ||
            id.includes("@react-three/fiber") ||
            id.includes("@react-three/drei")
          ) {
            return "three-vendor";
          }
          // `astronomia` (VSOP87 planetary theory + ELP lunar theory +
          // Pluto/Meeus) is pulled eagerly by `src/main.tsx` →
          // `initializeOrbitalEngine()`. The package ships the VSOP87D
          // coefficient tables as separate data modules (vsop87Dmercury,
          // vsop87Dearth, etc) which together dominate the residual
          // `index` chunk. Isolating them into their own long-term-
          // cacheable chunk (`astronomy`) leaves `index` for app-level
          // code only.
          // Anchor to the package boundary so an unrelated path segment
          // named `astronomia` (unlikely but possible in nested monorepo
          // checkouts) doesn't accidentally claim other modules.
          if (id.includes("/node_modules/astronomia/")) {
            return "astronomy";
          }
          if (id.includes("framer-motion")) return "animation";
          if (id.includes("zustand")) return "state";
        },
      },
    },
  },
});
