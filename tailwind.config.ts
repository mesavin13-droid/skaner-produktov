import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Manrope', 'Inter', 'system-ui', 'sans-serif'] },
      boxShadow: { glass: '0 18px 46px rgba(70,77,141,.11), 0 1px 1px rgba(255,255,255,.8) inset' },
    },
  },
  plugins: [],
} satisfies Config;
