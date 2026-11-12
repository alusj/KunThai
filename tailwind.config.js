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

      // Settings > Appearance > Text size scales text only (appearance.css sets
      // --kt-text-scale): spacing, buttons and icons keep their size, so a
      // bigger text never crowds the headers. Line heights follow the text.
      fontSize: {
        xs: ["calc(0.75rem * var(--kt-text-scale, 1))", { lineHeight: "calc(1rem * var(--kt-text-scale, 1))" }],
        sm: ["calc(0.875rem * var(--kt-text-scale, 1))", { lineHeight: "calc(1.25rem * var(--kt-text-scale, 1))" }],
        base: ["calc(1rem * var(--kt-text-scale, 1))", { lineHeight: "calc(1.5rem * var(--kt-text-scale, 1))" }],
        lg: ["calc(1.125rem * var(--kt-text-scale, 1))", { lineHeight: "calc(1.75rem * var(--kt-text-scale, 1))" }],
        xl: ["calc(1.25rem * var(--kt-text-scale, 1))", { lineHeight: "calc(1.75rem * var(--kt-text-scale, 1))" }],
        "2xl": ["calc(1.5rem * var(--kt-text-scale, 1))", { lineHeight: "calc(2rem * var(--kt-text-scale, 1))" }],
        "3xl": ["calc(1.875rem * var(--kt-text-scale, 1))", { lineHeight: "calc(2.25rem * var(--kt-text-scale, 1))" }],
        "4xl": ["calc(2.25rem * var(--kt-text-scale, 1))", { lineHeight: "calc(2.5rem * var(--kt-text-scale, 1))" }],
        "5xl": ["calc(3rem * var(--kt-text-scale, 1))", { lineHeight: "1" }],
        "6xl": ["calc(3.75rem * var(--kt-text-scale, 1))", { lineHeight: "1" }],
      },

      // One step heavier everywhere, like Facebook's app: body text is never
      // thin, and the order (normal < medium < semibold < bold < black) stays.
      fontWeight: {
        normal: "500",
        medium: "600",
        semibold: "700",
        bold: "800",
        extrabold: "800",
        black: "900",
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
