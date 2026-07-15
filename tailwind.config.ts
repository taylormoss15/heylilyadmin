import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f7ff",
          100: "#e0ecff",
          500: "#3b6fe0",
          600: "#2f57b8",
          700: "#264690",
        },
      },
    },
  },
  plugins: [],
};

export default config;
