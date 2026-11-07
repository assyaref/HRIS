/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./store/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      zIndex: {
        dropdown: "100",
        sticky: "200",
        fixed: "300",
        "modal-backdrop": "400",
        modal: "500",
        popover: "600",
        toast: "700",
      },
    },
  },
  plugins: [],
};

export default config;
