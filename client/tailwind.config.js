/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Шрифт выбирается в настройках оформления (--app-font)
        sans: ['var(--app-font, "Nunito Variable")', 'Nunito', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Цвета темы — CSS-переменные (src/theme.ts), прозрачность tailwind (/50 и т. п.) работает
        brand: {
          deep: 'rgb(var(--brand-deep-rgb, 5 24 36) / <alpha-value>)',
          night: 'rgb(var(--brand-night-rgb, 22 41 54) / <alpha-value>)',
          slate: 'rgb(var(--brand-slate-rgb, 59 82 101) / <alpha-value>)',
          mint: 'rgb(var(--brand-mint-rgb, 39 233 181) / <alpha-value>)',
        },
      },
      boxShadow: {
        'brand-glow': '0 24px 60px rgb(var(--brand-mint-rgb, 39 233 181) / 0.18)',
        'brand-soft': '0 18px 50px rgba(5, 24, 36, 0.55)',
      },
      backgroundImage: {
        'brand-gradient':
          'radial-gradient(circle at 20% 20%, rgb(var(--brand-mint-rgb, 39 233 181) / 0.25) 0%, rgb(var(--brand-mint-rgb, 39 233 181) / 0) 40%), linear-gradient(160deg, rgb(var(--brand-deep-rgb, 5 24 36)) 0%, rgb(var(--brand-night-rgb, 22 41 54)) 45%, rgb(var(--brand-slate-rgb, 59 82 101)) 100%)',
      },
      // Скругления масштабируются ползунком «Скругление углов» (--radius-scale)
      borderRadius: {
        sm: 'calc(0.125rem * var(--radius-scale, 1))',
        DEFAULT: 'calc(0.25rem * var(--radius-scale, 1))',
        md: 'calc(0.375rem * var(--radius-scale, 1))',
        lg: 'calc(0.5rem * var(--radius-scale, 1))',
        xl: 'calc(0.75rem * var(--radius-scale, 1))',
        '2xl': 'calc(1rem * var(--radius-scale, 1))',
        '3xl': 'calc(1.75rem * var(--radius-scale, 1))',
      },
    },
  },
  plugins: [],
}
