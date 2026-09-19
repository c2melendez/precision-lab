import { create } from "zustand";

import type { KeyDef } from "../components/NaturalMathKeyboard";

/**
 * useRecentKeysStore.ts — Fase X, Módulo X0 (spec_rediseno_visual.md
 * sección 10, "Smart Docks de uso reciente").
 *
 * Diseño confirmado por Carlos (respuestas al paso de diseño obligatorio
 * que el propio spec exige antes de programar esta fase):
 * - Ubicación: justo arriba de donde aparecerá el teclado (colapsado o
 *   no) en cada una de las 6 disposiciones — ver RecentKeysBar.tsx y sus
 *   3 puntos de montaje (KeyboardDock.tsx para fused/separated/split/
 *   focus/floating-degradado; CalculatorScreen.tsx para
 *   Apilado/Flotante-ancho).
 * - Persistencia: localStorage, entre sesiones (no solo la sesión activa).
 * - Alcance: separado POR MODO (Científica/Matrices/Estadística/etc.) —
 *   cada modo tiene su propio historial de 7+7, no uno global compartido.
 *
 * N = 7 elementos por dock — DETERMINADO en el spec, no es una decisión
 * pendiente.
 *
 * Comportamiento al reusar una tecla ya presente — DEDUCIBLE, decisión
 * registrada aquí: sube al frente (más recientemente usada primero), no
 * se duplica ni se cuenta como entrada separada. Identidad de una tecla
 * = su `insertLatex` (dos KeyDef distintos rara vez comparten
 * insertLatex; usar el objeto completo como clave sería frágil porque
 * `ariaLabel`/`description` pueden variar entre invocaciones del mismo
 * `key()` en distintos archivos).
 *
 * Persistido con el mismo criterio manual (JSON en localStorage, leído
 * una vez al crear el store) que useLayoutModeStore.ts/ThemeToggle.tsx —
 * no se usa el middleware `persist` de zustand para mantener consistencia
 * con el resto del proyecto.
 */

export type RecentKeyKind = "operation" | "variable";

interface ModeRecents {
  operations: KeyDef[];
  variables: KeyDef[];
}

const STORAGE_KEY = "precision-lab-recent-keys";
const MAX_ENTRIES_PER_DOCK = 7;

function isKeyDefLike(value: unknown): value is KeyDef {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.insertLatex === "string" && typeof v.ariaLabel === "string" && "glyph" in v;
}

function isModeRecentsLike(value: unknown): value is ModeRecents {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.operations) && Array.isArray(v.variables) && v.operations.every(isKeyDefLike) && v.variables.every(isKeyDefLike);
}

function readInitialState(): Record<string, ModeRecents> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const result: Record<string, ModeRecents> = {};
    for (const [mode, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (isModeRecentsLike(entry)) {
        result[mode] = {
          operations: entry.operations.slice(0, MAX_ENTRIES_PER_DOCK),
          variables: entry.variables.slice(0, MAX_ENTRIES_PER_DOCK),
        };
      }
    }
    return result;
    // Sin localStorage/JSON corrupto, la app arranca con historiales
    // vacíos en vez de romperse (mismo criterio de robustez que el resto
    // del proyecto ante almacenamiento no disponible/dañado).
  } catch {
    return {};
  }
}

function persist(state: Record<string, ModeRecents>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Almacenamiento lleno/no disponible: la sesión sigue funcionando,
    // solo no persiste entre recargas.
  }
}

function promoteToFront(list: KeyDef[], k: KeyDef): KeyDef[] {
  const withoutExisting = list.filter((existing) => existing.insertLatex !== k.insertLatex);
  return [k, ...withoutExisting].slice(0, MAX_ENTRIES_PER_DOCK);
}

interface RecentKeysState {
  recentByMode: Record<string, ModeRecents>;
  /** Últimas 7 teclas de cada tipo para `mode`, o listas vacías si el
   * modo todavía no tiene historial. */
  getRecents: (mode: string) => ModeRecents;
  recordKey: (mode: string, k: KeyDef, kind: RecentKeyKind) => void;
}

const EMPTY_RECENTS: ModeRecents = { operations: [], variables: [] };

export const useRecentKeysStore = create<RecentKeysState>((set, get) => ({
  recentByMode: readInitialState(),
  getRecents: (mode) => get().recentByMode[mode] ?? EMPTY_RECENTS,
  recordKey: (mode, k, kind) =>
    set((state) => {
      const current = state.recentByMode[mode] ?? { operations: [], variables: [] };
      const updated: ModeRecents =
        kind === "variable"
          ? { ...current, variables: promoteToFront(current.variables, k) }
          : { ...current, operations: promoteToFront(current.operations, k) };
      const recentByMode = { ...state.recentByMode, [mode]: updated };
      persist(recentByMode);
      return { recentByMode };
    }),
}));
