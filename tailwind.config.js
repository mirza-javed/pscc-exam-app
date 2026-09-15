/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cadet: {
          900: "#0F172A",
          800: "#1E293B",
          700: "#334155",
          600: "#475569",
          500: "#64748B",
          navy: "#1E3A8A",
          royal: "#2563EB",
          electric: "#3B82F6",
          gold: "#D97706",
          goldLight: "#F59E0B"
        },
        surface: {
          light: "#FFFFFF",
          subtle: "#F8FAFC",
          dark: "#0B1120",
          darkCard: "#1E293B"
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Plus Jakarta Sans", "Outfit", "sans-serif"],
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.08)",
        "glass-dark": "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        card: "0 4px 20px -2px rgba(15, 23, 42, 0.08)",
        "card-hover": "0 12px 28px -4px rgba(37, 99, 235, 0.15)"
      }
    },
  },
  plugins: [],
};
