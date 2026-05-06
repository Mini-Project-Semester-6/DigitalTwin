/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono:  ['"JetBrains Mono"', 'monospace'],
        sans:  ['"DM Sans"', 'system-ui'],
        display: ['"Space Grotesk"', 'system-ui'],
      },
      colors: {
        deep:  '#050b14',
        panel: '#0a1628',
        card:  '#0f1f35',
        rim:   '#1a3050',
        cyan:  '#00d4e8',
        teal:  '#00b89f',
        coral: '#ff5c5c',
        amber: '#f5a623',
        lavender: '#9b8aff',
      },
    },
  },
  plugins: [],
}
