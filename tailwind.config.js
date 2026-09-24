/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        kawaii: {
          bg: '#f5f4f2',         // Calm warm neutral stone/linen canvas (soothing, zero glare, not pink)
          card: '#ffffff',       // Crisp clean neutral card
          cardSoft: '#faf8f9',   // Gentle soft neutral-blush surface
          border: '#e4e0e2',     // Subtle calm neutral border
          borderDark: '#d1cbce',
          deep: '#7d3c4c',       // Signature deep mauve/burgundy header
          mauve: '#934b5c',
          rose: '#e11d48',
          blush: '#fdf6f8',      // Very subtle, gentle alternating row tint
          highlight: '#f8d5db',  // Total summary highlight (exact spreadsheet match)
          text: '#1f242e',       // Crisp, sharp high-contrast slate text
          textMuted: '#64748b',  // Calm slate muted text
          mint: '#059669',
          mintBg: '#ecfdf5',
        },
      },
      fontFamily: {
        sans: ['Nunito', 'Comfortaa', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        cute: ['Comfortaa', 'Nunito', 'sans-serif'],
      },
      boxShadow: {
        'kawaii': '0 2px 12px -1px rgba(0, 0, 0, 0.05), 0 1px 3px 0 rgba(0, 0, 0, 0.03)',
        'kawaii-lg': '0 8px 24px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
      },
      borderRadius: {
        '3xl': '1.75rem',
      }
    },
  },
  plugins: [],
};
