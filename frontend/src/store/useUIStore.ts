/**
 * src/store/useUIStore.ts — estado global EFÍMERO (spec, sección 11):
 * modo activo, tema, estado de carga/error de la operación en curso. Nunca
 * persistido (a diferencia de `useHistoryStore`).
 */

import { create } from "zustand";

export type CalculatorMode = "basic" | "simple" | "derivative" | "integral" | "equation" | "system" | "matrix" | "graph" | "limit" | "statistics" | "units";
export type Theme = "dark" | "light";

interface UIState {
  activeMode: CalculatorMode;
  theme: Theme;
  isLoading: boolean;
  lastErrorMessage: string | null;
  setActiveMode: (mode: CalculatorMode) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLoading: (isLoading: boolean) => void;
  setErrorMessage: (message: string | null) => void;
}

function readPersistedTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem("theme");
    return stored === "light" ? "light" : "dark";
  } catch {
    // Sin localStorage, la app sigue funcionando (sección 11) — se usa el
    // valor por defecto (modo oscuro) sin persistencia.
    return "dark";
  }
}

function persistTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("theme", theme);
  } catch {
    // Ignorado a propósito — persistencia best-effort (sección 11).
  }
}

export const useUIStore = create<UIState>((set, get) => ({
  activeMode: "basic",
  theme: readPersistedTheme(),
  isLoading: false,
  lastErrorMessage: null,
  setActiveMode: (mode) => set({ activeMode: mode }),
  setTheme: (theme) => {
    persistTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    persistTheme(next);
    set({ theme: next });
  },
  setLoading: (isLoading) => set({ isLoading }),
  setErrorMessage: (message) => set({ lastErrorMessage: message }),
}));
