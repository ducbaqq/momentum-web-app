/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0b0e11",
        card: "#151a21",
        border: "#20252b",
        text: "#e6e6e6",
        sub: "#9aa0a6",
        pill: "#1f2833",
        pillBorder: "#2b3642",
        good: "#22c55e",
        bad: "#ef4444"
      }
    }
  },
  plugins: []
};