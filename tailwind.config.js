/** @type {import('tailwindcss').Config} */
// Mismos tokens que Codara (https://github.com/edison-enriquez/Codara) + colores de tipos de dato.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"JetBrains Mono"', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        mono: ['"JetBrains Mono"', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      colors: {
        base: 'rgb(var(--c-base) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        elevated: 'rgb(var(--c-elevated) / <alpha-value>)',
        border: 'rgb(var(--c-border) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        text: 'rgb(var(--c-text) / <alpha-value>)',
        blue: 'rgb(var(--c-blue) / <alpha-value>)',
        green: 'rgb(var(--c-green) / <alpha-value>)',
        red: 'rgb(var(--c-red) / <alpha-value>)',
        yellow: 'rgb(var(--c-yellow) / <alpha-value>)',
        purple: 'rgb(var(--c-purple) / <alpha-value>)',
        orange: 'rgb(var(--c-orange) / <alpha-value>)',
        cyan: 'rgb(var(--c-cyan) / <alpha-value>)',
        pink: 'rgb(var(--c-pink) / <alpha-value>)',
        ok: 'rgb(var(--c-ok) / <alpha-value>)',
        tstr: 'rgb(var(--c-tstr) / <alpha-value>)',
        tbuf: 'rgb(var(--c-tbuf) / <alpha-value>)',
        tjson: 'rgb(var(--c-tjson) / <alpha-value>)',
        tnum: 'rgb(var(--c-tnum) / <alpha-value>)',
      },
      animation: { 'fade-in': 'fadeIn 0.15s ease-out' },
      keyframes: { fadeIn: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } } },
    },
  },
  plugins: [],
}
