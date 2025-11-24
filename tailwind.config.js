/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'nasa-black': '#000000',
        'nasa-panel': 'rgba(20, 20, 20, 0.9)',
        'nasa-accent': '#ff9d00',
        'nasa-blue': '#4facfe',
        'nasa-text': '#eeeeee',
        'nasa-dim': '#888888'
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
