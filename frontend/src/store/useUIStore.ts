/**
 * src/store/useUIStore.ts — estado global EFÍMERO (spec, sección 11):
 * modo activo, tema, estado de carga/error de la operación en curso. Nunca
 * persistido (a diferencia de `useHistoryStore`).
 */

import { create } from "zustand";
import type { MathResponse } from "../api/client";

export type CalculatorMode = "basic" | "simple" | "derivative" | "integral" | "equation" | "system" | "matrix" | "graph" | "limit" | "statistics" | "units";
export type Theme = "dark" | "light";

interface UIState {
  activeMode: CalculatorMode;
  theme: Theme;
  isLoading: boolean;
  lastErrorMessage: string | null;
  // Fase F (spec_edo_complejos_tooltips.md §3.4, Módulo F3): el botón
  // "Graficar" (Básica, sección Complejos > Avanzado) evalúa un número
  // complejo y necesita mostrarlo en Graph Mode -- pero Graph2DForm
  // guarda su `lastResult` en estado LOCAL (useState), no en este store,
  // así que no hay forma directa de "empujarle" un resultado desde otro
  // componente. Este campo es el puente: BasicMode lo llena y cambia de
  // modo; Graph2DForm lo consume una vez (useEffect) y lo vacía.
  pendingGraphResult: MathResponse | null;
  setActiveMode: (mode: CalculatorMode) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLoading: (isLoading: boolean) => void;
  setErrorMessage: (message: string | null) => void;
  setPendingGraphResult: (result: MathResponse | null) => void;
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
  pendingGraphResult: null,
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
  setPendingGraphResult: (result) => set({ pendingGraphResult: result }),
}));
