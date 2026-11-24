/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        brand: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
        },
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 4px 14px -2px rgba(14, 165, 233, 0.06)",
        elevated:
          "0 10px 30px -5px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(14, 165, 233, 0.08)",
      },
    },
  },
  plugins: [],
};
