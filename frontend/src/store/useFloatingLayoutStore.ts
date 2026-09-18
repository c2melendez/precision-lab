import { create } from "zustand";

/**
 * useFloatingLayoutStore.ts — Fase P, Módulo P4 ("Flotante").
 *
 * Arquitectura de estado confirmada en el Módulo P0 (posición/tamaño de
 * los paneles de Teclado y Gráfica cuando layoutMode === "floating").
 * Persistencia: **localStorage**, confirmado explícitamente por el
 * usuario en la sesión de diseño (P0 había propuesto sesión-only por el
 * riesgo de coordenadas obsoletas al cambiar de dispositivo/resolución;
 * el usuario prefirió persistir de todas formas — ver Cierre del
 * Módulo P0). Ese riesgo sigue existiendo y se mitiga aquí con
 * `clampToViewport`: al leer el valor guardado, y cada vez que cambia
 * el tamaño de la ventana, se recorta para que ninguna ventana quede
 * fuera del viewport visible — no se descarta el valor guardado, solo
 * se ajusta su posición/tamaño al espacio disponible.
 */

export interface FloatingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STORAGE_KEY = "precision-lab-floating-layout";

const DEFAULT_KEYBOARD_WINDOW: FloatingRect = { x: 24, y: 320, width: 300, height: 220 };
const DEFAULT_GRAPH_WINDOW: FloatingRect = { x: 360, y: 120, width: 340, height: 260 };

const MIN_WIDTH = 220;
const MIN_HEIGHT = 160;

/** Recorta un rect para que quepa dentro del viewport actual — nunca lo
 * descarta, solo ajusta x/y/width/height al espacio disponible. Esto es
 * lo que resuelve el riesgo de "coordenadas guardadas en un monitor
 * grande, abiertas en uno chico" señalado en el Módulo P0. */
export function clampToViewport(rect: FloatingRect, viewportWidth: number, viewportHeight: number): FloatingRect {
  const width = Math.min(Math.max(rect.width, MIN_WIDTH), Math.max(viewportWidth - 16, MIN_WIDTH));
  const height = Math.min(Math.max(rect.height, MIN_HEIGHT), Math.max(viewportHeight - 16, MIN_HEIGHT));
  const x = Math.min(Math.max(rect.x, 8), Math.max(viewportWidth - width - 8, 8));
  const y = Math.min(Math.max(rect.y, 8), Math.max(viewportHeight - height - 8, 8));
  return { x, y, width, height };
}

interface StoredShape {
  keyboardWindow?: Partial<FloatingRect>;
  graphWindow?: Partial<FloatingRect>;
}

function readInitial(): { keyboardWindow: FloatingRect; graphWindow: FloatingRect } {
  if (typeof localStorage === "undefined") {
    return { keyboardWindow: DEFAULT_KEYBOARD_WINDOW, graphWindow: DEFAULT_GRAPH_WINDOW };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { keyboardWindow: DEFAULT_KEYBOARD_WINDOW, graphWindow: DEFAULT_GRAPH_WINDOW };
    const parsed = JSON.parse(raw) as StoredShape;
    return {
      keyboardWindow: { ...DEFAULT_KEYBOARD_WINDOW, ...parsed.keyboardWindow },
      graphWindow: { ...DEFAULT_GRAPH_WINDOW, ...parsed.graphWindow },
    };
  } catch {
    // Valor corrupto o de una versión anterior incompatible — no romper
    // la app, volver a los defaults (no es una decisión de layoutMode,
    // es defensa ante localStorage con datos inválidos).
    return { keyboardWindow: DEFAULT_KEYBOARD_WINDOW, graphWindow: DEFAULT_GRAPH_WINDOW };
  }
}

interface FloatingLayoutState {
  keyboardWindow: FloatingRect;
  graphWindow: FloatingRect;
  setWindow: (which: "keyboard" | "graph", rect: FloatingRect) => void;
  clampAllToViewport: (viewportWidth: number, viewportHeight: number) => void;
  resetToDefault: () => void;
}

function persist(keyboardWindow: FloatingRect, graphWindow: FloatingRect) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ keyboardWindow, graphWindow }));
}

export const useFloatingLayoutStore = create<FloatingLayoutState>((set, get) => ({
  ...readInitial(),
  setWindow: (which, rect) => {
    const key = which === "keyboard" ? "keyboardWindow" : "graphWindow";
    const next = { ...get(), [key]: rect };
    persist(next.keyboardWindow, next.graphWindow);
    set({ [key]: rect } as Pick<FloatingLayoutState, "keyboardWindow" | "graphWindow">);
  },
  clampAllToViewport: (viewportWidth, viewportHeight) => {
    const { keyboardWindow, graphWindow } = get();
    const clampedKeyboard = clampToViewport(keyboardWindow, viewportWidth, viewportHeight);
    const clampedGraph = clampToViewport(graphWindow, viewportWidth, viewportHeight);
    persist(clampedKeyboard, clampedGraph);
    set({ keyboardWindow: clampedKeyboard, graphWindow: clampedGraph });
  },
  resetToDefault: () => {
    persist(DEFAULT_KEYBOARD_WINDOW, DEFAULT_GRAPH_WINDOW);
    set({ keyboardWindow: DEFAULT_KEYBOARD_WINDOW, graphWindow: DEFAULT_GRAPH_WINDOW });
  },
}));
