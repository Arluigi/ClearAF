/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'media',
    content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      borderRadius: { lg: 'var(--radius)', md: 'var(--radius)', sm: '0px' },
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

        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: { DEFAULT: 'rgb(var(--card) / <alpha-value>)', foreground: 'rgb(var(--card-foreground) / <alpha-value>)' },
        popover: { DEFAULT: 'rgb(var(--popover) / <alpha-value>)', foreground: 'rgb(var(--popover-foreground) / <alpha-value>)' },
        primary: { DEFAULT: 'rgb(var(--primary) / <alpha-value>)', foreground: 'rgb(var(--primary-foreground) / <alpha-value>)' },
        secondary: { DEFAULT: 'rgb(var(--secondary) / <alpha-value>)', foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)' },
        muted: { DEFAULT: 'rgb(var(--muted) / <alpha-value>)', foreground: 'rgb(var(--muted-foreground) / <alpha-value>)' },
        accent: { DEFAULT: 'rgb(var(--ink) / 0.08)', foreground: 'rgb(var(--accent-foreground) / <alpha-value>)' },
        destructive: { DEFAULT: 'rgb(var(--destructive) / <alpha-value>)', foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)' },
        border: 'rgb(var(--ink) / 0.13)',
        input: 'rgb(var(--ink) / 0.5)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
