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
          if (id.includes("node_modules")) {
            // Keep three + fiber + drei together so they share module identity.
            if (
              id.includes("three") ||
              id.includes("@react-three/fiber") ||
              id.includes("@react-three/drei")
            ) {
              return "three-vendor";
            }
            if (
              id.includes("@react-three/postprocessing") ||
              id.includes("postprocessing")
            ) {
              return "postfx";
            }
            if (id.includes("framer-motion")) return "animation";
            if (id.includes("zustand")) return "state";
          }
        },
      },
    },
  },
});
