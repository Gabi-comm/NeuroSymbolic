import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",      // Scans your pages
    "./components/**/*.{js,ts,jsx,tsx,mdx}", // Scans your LoginModal/Nav
  ],
  theme: {
    extend: {
      colors: {
        oasysBlue: "#3b82f6", // Matches the primary blue in your design
      },
      borderRadius: {
        '4xl': '40px', // Matches the heavy rounding in your Figma
      }
    },
  },
  plugins: [],
};
export default config;