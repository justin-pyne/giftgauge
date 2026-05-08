/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#f7f3ec',
        ink: '#1a1612',
        ash: '#7a736b',
        rust: '#b34a2c',
        rust2: '#d96b46',
        moss: '#3f5c3a',
        line: '#e6dfd2',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(26, 22, 18, 0.04), 0 8px 24px -16px rgba(26, 22, 18, 0.18)',
      },
    },
  },
  plugins: [],
};
