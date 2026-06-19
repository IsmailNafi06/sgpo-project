/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 24px 70px -32px rgba(15, 23, 42, 0.38)',
        card: '0 18px 45px -28px rgba(15, 23, 42, 0.32)',
      },
      colors: {
        brand: {
          blue: '#3246b5',
          blueDark: '#27368f',
          blueSoft: '#eef3ff',
          navy: '#1f2937',
          muted: '#5f6675',
          green: '#5ac18a',
          greenDark: '#3c9f6c',
          mint: '#eefaf5',
          panel: '#edf5f7',
        },
      },
    },
  },
  plugins: [],
}
