/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Modern trading app color scheme
        bg: "#0f172a", // slate-900
        card: "#1e293b", // slate-800
        cardHover: "#334155", // slate-700
        border: "#334155", // slate-700
        borderLight: "#475569", // slate-600
        text: "#f1f5f9", // slate-100
        textSecondary: "#cbd5e1", // slate-300
        sub: "#94a3b8", // slate-400
        accent: "#3b82f6", // blue-500
        accentHover: "#2563eb", // blue-600
        success: "#10b981", // emerald-500
        successLight: "#34d399", // emerald-400
        danger: "#ef4444", // red-500
        dangerLight: "#f87171", // red-400
        warning: "#f59e0b", // amber-500
        warningLight: "#fbbf24", // amber-400
        info: "#06b6d4", // cyan-500
        pill: "#0f172a", // slate-900
        pillBorder: "#334155", // slate-700
        good: "#10b981", // emerald-500
        bad: "#ef4444", // red-500
        gradient: {
          primary: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
          success: "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
          danger: "linear-gradient(135deg, #ef4444 0%, #f87171 100%)"
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        }
      },
      boxShadow: {
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 20px rgba(59, 130, 246, 0.15)',
        'glow-success': '0 0 20px rgba(16, 185, 129, 0.15)',
        'glow-danger': '0 0 20px rgba(239, 68, 68, 0.15)'
      }
    }
  },
  plugins: []
};