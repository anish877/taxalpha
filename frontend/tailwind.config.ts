import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'SF Pro Display',
          'Helvetica Neue',
          'sans-serif'
        ]
      },
      colors: {
        ink: '#111111',
        fog: '#f5f5f7',
        paper: '#ffffff',
        mute: '#6e6e73',
        line: '#d2d2d7',
        accent: '#1d4ed8',
        accentSoft: '#dbeafe'
      },
      boxShadow: {
        hairline: '0 0 0 1px rgba(17, 17, 17, 0.08)',
        panel: '0 20px 50px rgba(0, 0, 0, 0.08)'
      }
    }
  },
  plugins: []
};

export default config;
