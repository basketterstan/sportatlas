
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./components/**/*.{ts,tsx}",
    "./contexts/**/*.{ts,tsx}",
    "./data/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./utils/**/*.{ts,tsx}",
    "./types.ts",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          '950': '#020617',
        },
        ha: {
          bg:        '#0E1013',
          surface:   '#16191F',
          surface2:  '#1E222A',
          line:      '#272C35',
          line2:     '#343A45',
          textHi:    '#F4F5F7',
          textMid:   '#A8ADB8',
          textLow:   '#6B7280',
          brand:     '#E8743C',
          brandDim:  '#B25A2C',
          brandSoft: 'rgba(232,116,60,0.12)',
          success:   '#34C27A',
          warning:   '#F0B429',
          danger:    '#E5484D',
          info:      '#4CC2E0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        tactical: ['JetBrains Mono', 'monospace'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'ha-sm': '8px',
        'ha-md': '12px',
        'ha-lg': '16px',
        'ha-xl': '24px',
      },
    },
  },
  plugins: [],
}
