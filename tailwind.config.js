/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],

  darkMode: "class", // REQUIRED for theme switching

  theme: {
    extend: {
      colors: {
        /* ===== BANK COLOR SYSTEM ===== */
        bank: {
          bg: "#0B0B0B",            // app background (dark)
          card: "#111111",          // card background
          surface: "#FFFFFF",       // light surfaces
          border: "#2A2A2A",         // subtle borders

          primary: "#16A34A",        // green (Cash In)
          accent: "#1E3A8A",         // blue (Cash Out)

          text: {
            primary: "#FFFFFF",
            secondary: "#A1A1AA",
            inverse: "#000000",
          },
        },
      },

      boxShadow: {
        soft: "0 4px 12px rgba(0,0,0,0.15)",
        card: "0 6px 20px rgba(0,0,0,0.25)",
      },

      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },

      screens: {
        xs: "375px",
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
      },
    },
  },

  plugins: [],
};
