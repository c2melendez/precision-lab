import { create } from "zustand";

/**
 * useLayoutModeStore.ts — Módulo 6 (hoja-de-ruta-visual.md §6 / spec §7),
 * extendido en Fase P (Rediseño visual, Módulo P0/P1 — spec_rediseno_visual.md
 * sección 2 y 15): de 2 a 6 disposiciones.
 *
 * - "fused" (default) / "separated": ya existían (Módulo 6).
 * - "split" (Pantalla dividida, P1), "focus" (Enfoque, P2), "stacked"
 *   (Apilado, P3): implementados.
 * - "floating" (Flotante): implementado en Módulo P4 — ver
 *   useFloatingLayoutStore.ts para el estado de posición/tamaño de sus
 *   paneles (persistencia en localStorage, confirmada explícitamente
 *   por el usuario en la sesión de diseño, con riesgo de coordenadas
 *   obsoletas entre dispositivos — ver Cierre del Módulo P4).
 *
 * Persistido en localStorage con el mismo criterio que el tema (ver
 * ThemeToggle.tsx / AjustesPopover.tsx) — se lee UNA vez al montar
 * AjustesPopover, no hace falta un useEffect en cada consumidor.
 * Retrocompatible: un valor guardado de antes de Fase P ("fused" o
 * "separated") sigue siendo válido sin migración.
 */

export type LayoutMode = "fused" | "separated" | "split" | "focus" | "floating" | "stacked";

const STORAGE_KEY = "precision-lab-layout-mode";
const VALID_LAYOUT_MODES: readonly LayoutMode[] = ["fused", "separated", "split", "focus", "floating", "stacked"];

function readInitialLayoutMode(): LayoutMode {
  if (typeof localStorage === "undefined") return "fused";
  const stored = localStorage.getItem(STORAGE_KEY);
  return (VALID_LAYOUT_MODES as readonly string[]).includes(stored ?? "") ? (stored as LayoutMode) : "fused";
}

interface LayoutModeState {
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
}

export const useLayoutModeStore = create<LayoutModeState>((set) => ({
  layoutMode: readInitialLayoutMode(),
  setLayoutMode: (layoutMode) => {
    localStorage.setItem(STORAGE_KEY, layoutMode);
    set({ layoutMode });
  },
}));
