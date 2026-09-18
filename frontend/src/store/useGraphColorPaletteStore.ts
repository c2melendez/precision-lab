import { create } from "zustand";

/**
 * useGraphColorPaletteStore.ts — Fase T, Módulo T0.
 *
 * Fuente única de verdad para `CURVE_COLORS`, que antes vivía duplicado
 * a propósito en `GraphMode.tsx` y `GraphViewer.tsx` (comentario
 * original: importar el export nombrado desde `GraphViewer.tsx` forzaría
 * que ese archivo entrara al bundle principal en vez de cargarse solo
 * vía `React.lazy()`). Este archivo NO importa nada de `GraphViewer.tsx`
 * ni de ninguna librería pesada (Plotly, etc.) — así que tanto
 * `GraphMode.tsx` como `GraphViewer.tsx` pueden importar de AQUÍ sin
 * reintroducir el problema que la duplicación original evitaba. Unifica
 * la duplicación como autoriza explícitamente el spec, sin sacrificar el
 * code-splitting que la motivó en primer lugar.
 *
 * Paleta "Original" = los mismos 5 colores exactos que ya existían.
 * Hasta el Módulo T0 era también el default de esta store (regresión
 * bit-a-bit para quien no tocara Ajustes); el Módulo W0 cambió el
 * fallback a "Azul SaaS" — ver comentario junto a `DEFAULT_PALETTE_ID`
 * más abajo — así que "Original" sigue existiendo y seleccionable, pero
 * ya no es lo que ve un usuario nuevo que nunca abrió Ajustes.
 *
 * Ambigüedad del spec (sección 6, resuelta en T0): lo que estaba en duda
 * era el color de la curva en la imagen de referencia confirmada por el
 * usuario (azul, no el teal del tema Azul SaaS) — eso se refleja en la
 * paleta "Azul SaaS" en sí (azul, no teal), independientemente de cuál
 * paleta sea el default.
 */

export interface GraphColorPalette {
  id: string;
  label: string;
  colors: string[];
  /** Paleta pensada específicamente para daltonismo (Okabe-Ito) —
   * spec exige al menos una entre las opciones. */
  colorBlindSafe?: boolean;
}

export const GRAPH_COLOR_PALETTES: GraphColorPalette[] = [
  {
    id: "default",
    label: "Original",
    colors: ["#E8A33D", "#3E7C74", "#9B7FD6", "#D97757", "#5B94C9"],
  },
  {
    id: "saas-blue",
    label: "Azul SaaS",
    // Primer color: el azul confirmado por el usuario para la imagen de
    // referencia (#2563EB, el mismo `marker` del tema saas-blue), NO el
    // teal que el tema usa hoy para `--color-graph` (#0D9488) — esa era
    // la ambigüedad señalada en el spec, resuelta así.
    colors: ["#2563EB", "#0D9488", "#7C3AED", "#DC2626", "#D97706"],
  },
  {
    id: "colorblind-safe",
    label: "Apta para daltonismo",
    // Paleta Okabe-Ito, estándar de facto para accesibilidad de color
    // en gráficas (distinguible en las formas más comunes de daltonismo).
    colors: ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2"],
    colorBlindSafe: true,
  },
];

const STORAGE_KEY = "precision-lab-graph-palette";

/**
 * Fase W, Módulo W0 (spec_rediseno_visual.md §9) — resuelve la
 * ambigüedad que T0 había dejado abierta a propósito ("NO se cambia el
 * default — sigue siendo 'Original'"): el spec de la Fase W es
 * DETERMINADO y explícito en que el color de curva POR DEFECTO debe ser
 * azul (`marker:#2563EB`), no el teal de `--color-graph` ni el ámbar de
 * "Original". Se resuelve así, sin reabrir T0: el fallback de
 * `readInitialPaletteId()`/`colorsForPalette()` pasa de "default"
 * (Original/ámbar) a "saas-blue" — pero SOLO como fallback cuando no hay
 * nada guardado todavía. Quien ya haya elegido una paleta explícitamente
 * en Ajustes (incluida "Original") conserva su elección sin cambios; la
 * regresión que T0 quería evitar era para usuarios YA existentes con una
 * preferencia guardada, no para instalaciones nuevas — este cambio no la
 * rompe. "Original" sigue existiendo y seleccionable, solo deja de ser
 * el default automático.
 */
const DEFAULT_PALETTE_ID = "saas-blue";

function colorsForPalette(id: string): string[] {
  return (
    GRAPH_COLOR_PALETTES.find((p) => p.id === id) ??
    GRAPH_COLOR_PALETTES.find((p) => p.id === DEFAULT_PALETTE_ID) ??
    GRAPH_COLOR_PALETTES[0]
  ).colors;
}

function readInitialPaletteId(): string {
  if (typeof localStorage === "undefined") return DEFAULT_PALETTE_ID;
  const stored = localStorage.getItem(STORAGE_KEY);
  return GRAPH_COLOR_PALETTES.some((p) => p.id === stored) ? (stored as string) : DEFAULT_PALETTE_ID;
}

interface GraphColorPaletteState {
  paletteId: string;
  colors: string[];
  setPaletteId: (id: string) => void;
}

export const useGraphColorPaletteStore = create<GraphColorPaletteState>((set) => {
  const initialId = readInitialPaletteId();
  return {
    paletteId: initialId,
    colors: colorsForPalette(initialId),
    setPaletteId: (id) => {
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, id);
      set({ paletteId: id, colors: colorsForPalette(id) });
    },
  };
});
