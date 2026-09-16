import { create } from "zustand";

/**
 * useLayoutModeStore.ts — Módulo 6 (hoja-de-ruta-visual.md §6 / spec §7).
 *
 * Toggle nuevo en Ajustes: Fusionada (default, `Screen.tsx` tal como
 * quedó en Fase E — historial/input/resultado en un solo contenedor) vs.
 * Separada (mismas piezas, cada una en su propia tarjeta, como se veía
 * antes de Fase E). Persistido en localStorage con el mismo criterio que
 * el tema (ver ThemeToggle.tsx / AjustesPopover.tsx) — se lee UNA vez al
 * montar AjustesPopover, no hace falta un useEffect en cada consumidor.
 */

export type LayoutMode = "fused" | "separated";

const STORAGE_KEY = "precision-lab-layout-mode";

function readInitialLayoutMode(): LayoutMode {
  if (typeof localStorage === "undefined") return "fused";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "separated" ? "separated" : "fused";
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
