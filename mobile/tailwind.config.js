/** @type {import('tailwindcss').Config} */
// Mirrors the web app palette (loan-amortization-app/src/index.css @theme block)
// so both clients share the exact same navy/gold brand colors.
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f4fa',
          100: '#dce5f2',
          200: '#bccde4',
          300: '#8eabd0',
          400: '#5a83b8',
          500: '#38659e',
          600: '#2a5085',
          700: '#24416c',
          800: '#1e3a8a',
          900: '#172b54',
          950: '#0f172a',
        },
        gold: {
          400: '#e0af34',
          500: '#ca8a04',
          600: '#a16207',
        },
      },
      // RN cannot synthesize font weights — each weight is its own family.
      fontFamily: {
        sans: ['IBMPlexSans_400Regular'],
        'sans-light': ['IBMPlexSans_300Light'],
        'sans-medium': ['IBMPlexSans_500Medium'],
        'sans-semibold': ['IBMPlexSans_600SemiBold'],
        'sans-bold': ['IBMPlexSans_700Bold'],
        mono: ['IBMPlexMono_400Regular'],
        'mono-medium': ['IBMPlexMono_500Medium'],
        'mono-semibold': ['IBMPlexMono_600SemiBold'],
      },
    },
  },
  plugins: [],
}
