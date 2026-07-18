/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9ecff',
          200: '#bcdeff',
          300: '#8ec8ff',
          400: '#59a8ff',
          500: '#3186ff',
          600: '#1a67f5',
          700: '#1552e1',
          800: '#1843b6',
          900: '#193c8f',
        },
      },
    },
  },
  plugins: [],
};
