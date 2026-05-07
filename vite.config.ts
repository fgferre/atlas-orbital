import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Atlas baseline Content-Security-Policy (M6-H, 2026-05-06).
 *
 * Atlas had no CSP before this; M6-H introduces one via a meta-tag
 * injected at HTML transform time. Two modes:
 *
 * - **Production**: locked down. Scripts come from `'self'` only
 *   (Vite emits no inline scripts in prod builds), so `script-src
 *   'self'` is enough. Styles still need `'unsafe-inline'` because
 *   Tailwind v4 + many R3F / Drei components set style attributes
 *   on elements, and there's no practical hash-based path. Fonts
 *   come from Google Fonts (atlas's `index.css` `@import`s the
 *   Orbitron + Rajdhani CSS, which then loads woff2 from
 *   `fonts.gstatic.com`). Images from `'self'` + `data:` (favicon
 *   SVG, base64 textures) + `blob:` (R3F canvas snapshots) +
 *   `upload.wikimedia.org` (M6-D Wikipedia thumbnails). Network
 *   fetches from `'self'` + `https://*.wikipedia.org` (M6-E REST
 *   API).
 *
 * - **Development**: permissive enough for Vite HMR. Adds
 *   `'unsafe-eval'` to script-src (HMR's hot-update glue uses
 *   eval-like patterns) and `ws:` + `wss:` to connect-src
 *   (Vite's HMR WebSocket).
 *
 * Delivery is via `<meta http-equiv="Content-Security-Policy">`,
 * NOT HTTP headers. Atlas ships as a static-hosting bundle (no
 * server runtime to set per-route headers); meta-tag CSP is the
 * minimum-diff path. When atlas grows a server, this plugin can
 * be retired in favor of header injection (the policy strings
 * themselves transfer 1:1).
 */
function buildCspContent(mode: string): string {
  const isDev = mode === "development";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": isDev ? ["'self'", "'unsafe-eval'"] : ["'self'"],
    // Styles: 'unsafe-inline' is required for R3F + Drei +
    // Tailwind v4's runtime style attributes. fonts.googleapis.com
    // is the @import target.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "style-src-elem": [
      "'self'",
      "'unsafe-inline'",
      "https://fonts.googleapis.com",
    ],
    // Fonts: data: covers any base64-embedded glyphs; gstatic.com
    // is where the Google Fonts CSS resolves to.
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    // Images: data: for the favicon SVG + base64 textures, blob:
    // for canvas snapshots, upload.wikimedia.org for M6-D thumbs.
    "img-src": ["'self'", "data:", "blob:", "https://upload.wikimedia.org"],
    // Network fetches: 'self' for HYG binaries + same-origin XHRs,
    // *.wikipedia.org for M6-E REST API. Dev adds ws/wss for HMR.
    "connect-src": isDev
      ? ["'self'", "ws:", "wss:", "https://*.wikipedia.org"]
      : ["'self'", "https://*.wikipedia.org"],
    // Workers: same-origin only (R3F's worker-loader path uses
    // same-origin asset imports). blob: covers TextureLoader's
    // worker-style decoding paths.
    "worker-src": ["'self'", "blob:"],
    // Disallow object/embed entirely.
    "object-src": ["'none'"],
    // Pin base URI to same-origin so injected base tags can't
    // redirect resource resolution.
    "base-uri": ["'self'"],
    // Forbid form submissions (atlas has none) — defense in depth.
    "form-action": ["'none'"],
  };
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

function cspMetaTagPlugin(): Plugin {
  return {
    name: "atlas-csp-meta",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const csp = buildCspContent(ctx.server ? "development" : "production");
        const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
        return html.replace(
          /<meta charset="UTF-8" \/>/,
          (match) => `${match}\n    ${meta}`
        );
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [cspMetaTagPlugin(), react()],
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
