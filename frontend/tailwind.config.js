/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        body: ['Instrument Sans', 'sans-serif'],
      },
      colors: {
        void: '#050810',
        panel: '#0a0f1e',
        border: '#1a2240',
        accent: '#00d4ff',
        pulse: '#ff3366',
        safe: '#00ff88',
        warn: '#ffaa00',
        dim: '#3a4a6b',
        text: '#c8d4f0',
      },
      // animation: {
      //   'scan-line': 'scanLine 3s linear infinite',
      //   'pulse-ring': 'pulseRing 2s ease-out infinite',
      //   'data-flow': 'dataFlow 4s linear infinite',
      //   'glow': 'glow 2s ease-in-out infinite alternate',
      // },
      keyframes: {
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        dataFlow: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px #00d4ff40' },
          '100%': { boxShadow: '0 0 20px #00d4ff80, 0 0 40px #00d4ff20' },
        },
      },
    },
  },
  plugins: [],
}
