/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          deep: '#051824',
          night: '#162936',
          slate: '#3b5265',
          mint: '#27e9b5',
        },
      },
      boxShadow: {
        'brand-glow': '0 24px 60px rgba(39, 233, 181, 0.18)',
        'brand-soft': '0 18px 50px rgba(5, 24, 36, 0.55)',
      },
      backgroundImage: {
        'brand-gradient':
          'radial-gradient(circle at 20% 20%, rgba(39, 233, 181, 0.25) 0%, rgba(39, 233, 181, 0) 40%), linear-gradient(160deg, #051824 0%, #162936 45%, #3b5265 100%)',
      },
      borderRadius: {
        '3xl': '1.75rem',
      },
    },
  },
  plugins: [],
}
