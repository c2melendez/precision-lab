import { KeyGlyph } from "./KeyGlyph";
import type { KeyDef } from "./NaturalMathKeyboard";
import { useKeyboardPanelStore } from "../store/useKeyboardPanelStore";
import { useRecentKeysStore } from "../store/useRecentKeysStore";
import { useUIStore } from "../store/useUIStore";
import { triggerKeyFeedback } from "../utils/keyFeedback";

/**
 * RecentKeysBar.tsx — Fase X, Módulo X0 (spec_rediseno_visual.md sección
 * 10, "Smart Docks de uso reciente").
 *
 * Ubicación confirmada por Carlos: "justo arriba de donde aparecerá el
 * teclado (colapsado o no) en cada interfaz" — se monta en los 3 puntos
 * donde "el teclado" realmente vive según la disposición activa:
 * - KeyboardDock.tsx (fused/separated/split/focus/floating-degradado):
 *   como primera fila dentro del mismo contenedor fijo, justo encima del
 *   grid básico/fila compacta.
 * - CalculatorScreen.tsx, StackedKeyboardSection (Apilado): justo encima
 *   de la sección colapsable.
 * - CalculatorScreen.tsx, FloatingScreenContent (Flotante, ancho real):
 *   justo encima de la FloatingWindow "Teclado".
 *
 * No se renderiza nada si el modo activo no tiene historial todavía en
 * ninguno de los dos docks (evita una barra vacía permanente para un
 * usuario nuevo) — reaparece sola en cuanto se presiona la primera
 * tecla calificante.
 */

function RecentKeyButton({ k }: { k: KeyDef }) {
  const insertHandler = useKeyboardPanelStore((s) => s.insertHandler);

  return (
    <button
      type="button"
      onClick={() => {
        triggerKeyFeedback();
        insertHandler?.(k);
      }}
      aria-label={k.ariaLabel}
      title={k.description ?? k.ariaLabel}
      className="flex h-8 min-w-[2rem] items-center justify-center rounded-md bg-chrome-soft px-2 text-sm text-bone hover:bg-chrome-soft/70"
    >
      <KeyGlyph glyph={k.glyph} />
    </button>
  );
}

function RecentKeysRow({ label, keys }: { label: string; keys: KeyDef[] }) {
  if (keys.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-bone/40">{label}</span>
      {keys.map((k, i) => (
        // insertLatex no es único entre modos/categorías distintas en teoría,
        // pero dentro de un mismo dock (ya deduplicado por el store) sí lo es.
        <RecentKeyButton key={`${k.insertLatex}-${i}`} k={k} />
      ))}
    </div>
  );
}

export function RecentKeysBar() {
  const activeMode = useUIStore((s) => s.activeMode);
  const recents = useRecentKeysStore((s) => s.getRecents(activeMode));

  if (recents.operations.length === 0 && recents.variables.length === 0) return null;

  return (
    <div className="mb-1.5 flex flex-col gap-1">
      <RecentKeysRow label="Recientes" keys={recents.operations} />
      <RecentKeysRow label="Var./const." keys={recents.variables} />
    </div>
  );
}
