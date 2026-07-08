/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        glow: "0 0 34px rgba(48, 231, 255, 0.22)",
        gold: "0 18px 45px rgba(212, 175, 55, 0.18)",
      },
      keyframes: {
        floatIn: {
          "0%": { opacity: "0", transform: "translateY(16px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        pulseLine: {
          "0%, 100%": { opacity: "0.35", transform: "scaleX(0.82)" },
          "50%": { opacity: "1", transform: "scaleX(1)" },
        },
        orbit: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        floatIn: "floatIn 500ms ease both",
        pulseLine: "pulseLine 2.4s ease-in-out infinite",
        orbit: "orbit 12s linear infinite",
      },
    },
  },
  plugins: [],
};
