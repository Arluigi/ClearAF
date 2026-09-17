/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    // Letterpress radii (spec §3): 0 · 4 · 26 · 999. Replaces Tailwind's scale so nothing in between can be used.
    borderRadius: { none: '0px', DEFAULT: 'var(--radius)', sheet: '26px', full: '9999px' },
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        ui: ['var(--font-ui)'],
        data: ['var(--font-data)'],
      },
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        rail: 'rgb(var(--rail) / <alpha-value>)',
        sunk: 'rgb(var(--sunk) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          secondary: 'rgb(var(--ink-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--ink-tertiary) / <alpha-value>)',
          future: 'rgb(var(--ink-future) / <alpha-value>)',
        },
        attention: {
          mark: 'rgb(var(--attention-mark) / <alpha-value>)',
          text: 'rgb(var(--attention-text) / <alpha-value>)',
          wash: 'rgb(var(--attention-wash) / <alpha-value>)',
        },
        error: 'rgb(var(--error) / <alpha-value>)',
        rule: {
          DEFAULT: 'rgb(var(--ink) / 0.13)',
          strong: 'rgb(var(--ink) / <alpha-value>)',
          // Field boundary: ink at 50% is the lightest value that keeps 3:1 on every paper tone in both modes.
          field: 'rgb(var(--ink) / 0.5)',
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
