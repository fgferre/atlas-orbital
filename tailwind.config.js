/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "nasa-black": "#000000",
        "nasa-panel": "rgba(10, 15, 30, 0.8)",
        "nasa-accent": "#00f0ff",
        "nasa-alert": "#ff9d00",
        "nasa-text": "#eeeeee",
        "nasa-dim": "#8899aa",
        "nasa-border": "rgba(0, 240, 255, 0.3)",
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
