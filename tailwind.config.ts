import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./store/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#ffffff",
        panel: "#f8fafc",
        line: "#d7dee8",
        mint: "#43d39e",
        amber: "#f4b63f",
        danger: "#ff5c73"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(15,23,42,0.10)"
      }
    }
  },
  plugins: []
};

export default config;
