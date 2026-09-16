/** @type {import('tailwindcss').Config} */
// Precision Lab — tokens de diseño compartidos con Precision Lab (Python).
// Los colores leen variables CSS (definidas en design-tokens.css) en vez de
// hex fijos, para soportar todos los temas ([data-theme]: uno por bloque en
// design-tokens.css, hoy 13 en total tras la corrección post-auditoría que
// completó los 9 que quedaban pendientes del log de decisiones §7)
// sin duplicar componentes. Cambios aquí deben reflejarse también en el
// tailwind.config.js del proyecto Python para mantener paridad visual.
import defaultTheme from "tailwindcss/defaultTheme";

function withOpacity(varName) {
  return ({ opacityValue }) =>
    opacityValue === undefined
      ? `rgb(var(${varName}))`
      : `rgb(var(${varName}) / ${opacityValue})`;
}

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // spec v2 §2: breakpoint dt agregado porque 1440px no coincide con
      // ningún breakpoint por defecto de Tailwind. Spread explícito de
      // defaultTheme.screens para no perder sm/md/lg/xl existentes.
      screens: {
        ...defaultTheme.screens,
        dt: "1440px",
      },
      colors: {
        chrome: {
          DEFAULT: withOpacity("--color-chrome"),
          soft: withOpacity("--color-chrome-soft"),
        },
        paper: {
          DEFAULT: withOpacity("--color-paper"),
          soft: withOpacity("--color-paper-soft"),
          line: withOpacity("--color-paper-line"),
        },
        ink: withOpacity("--color-ink"),
        bone: withOpacity("--color-bone"),
        marker: {
          DEFAULT: withOpacity("--color-marker"),
          soft: withOpacity("--color-marker-soft"),
          text: withOpacity("--color-marker-text"),
        },
        graph: {
          DEFAULT: withOpacity("--color-graph"),
          soft: withOpacity("--color-graph-soft"),
        },
        alpha: {
          DEFAULT: withOpacity("--color-alpha"),
          soft: withOpacity("--color-alpha-soft"),
        },
        muted: withOpacity("--color-muted"),
      },
      fontFamily: {
        display: ['"Space Grotesk"', "sans-serif"],
        sans: ["Inter", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
