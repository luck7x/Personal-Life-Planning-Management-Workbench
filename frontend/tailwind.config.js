/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  safelist: ["accent-memo", "accent-today", "accent-future", "accent-idea", "accent-late"],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Source Han Serif SC"', '"Songti SC"', '"Microsoft YaHei"', "serif"],
        mono: ['"Courier New"', "monospace"]
      }
    }
  },
  plugins: []
};
