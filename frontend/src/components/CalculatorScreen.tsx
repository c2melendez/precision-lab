/**
 * src/components/CalculatorScreen.tsx
 *
 * Fase E (spec UX estilo ClassCalc — mockup confirmado con el usuario,
 * mismo patrón ya aplicado en Precision Lab Lite vía Screen.tsx): fusiona
 * el campo de entrada, el resultado y una mini-cinta de historial
 * reciente en un solo contenedor "pantalla", en vez de que el resultado
 * aparezca condicionalmente debajo del teclado tras enviar el
 * formulario.
 *
 * Diferencia importante con Screen.tsx de Lite: esta versión depende de
 * un backend (POST /evaluate, etc.), así que el resultado es un
 * MathResponse recién llegado de la red (o `null`/`isLoading`), no un
 * cálculo local instantáneo. Por eso el componente recibe `result` +
 * `isLoading` en vez de calcular nada por su cuenta.
 *
 * La mini-cinta usa `useHistoryStore` directamente (ya trae las últimas
 * entradas persistidas) — no duplica esa lógica. `entry.label`/
 * `entry.inputText` son la sintaxis ASCII que el backend espera (ver
 * `latexToBackendSyntax` en NaturalMathField.tsx), NO LaTeX, así que se
 * muestran como texto plano; solo `entry.resultLatex` es LaTeX real y
 * pasa por MathRenderer. History.tsx (el panel completo con "Reusar") no
 * cambia — sigue siendo la vista de historial persistente completo.
 */

import type { MathfieldElement } from "mathlive";

import type { MathResponse } from "../api/client";
import { useHistoryStore } from "../store/useHistoryStore";
import { MathRenderer } from "./MathRenderer";
import { NaturalMathField } from "./NaturalMathField";
import { ResultPanel } from "./ResultPanel";

interface CalculatorScreenProps {
  latex: string;
  onLatexChange: (latex: string) => void;
  ariaLabel: string;
  placeholder?: string;
  fieldRef?: (el: MathfieldElement | null) => void;
  /** Opcional: algunos backends (derivada, integral, sistemas, matrices)
   * no tienen concepto de unidad angular — omitir ambas props oculta el
   * badge en vez de mostrar un toggle que no afectaría nada real. */
  angleUnit?: "rad" | "deg";
  onToggleAngleUnit?: () => void;
  result: MathResponse | null;
  isLoading: boolean;
  /** Punto 7 del rediseño de teclado: botón "X" para vaciar el campo,
   * visible dentro del display cuando hay contenido. */
  onClearField?: () => void;
  /** Módulo 6 (spec §7): "fused" (default, Fase E de siempre) vs.
   * "separated" (3 tarjetas independientes, mismas piezas). Paridad con
   * Screen.tsx de Lite. */
  layoutMode?: "fused" | "separated";
}

export function CalculatorScreen({
  latex,
  onLatexChange,
  ariaLabel,
  placeholder,
  fieldRef,
  angleUnit,
  onToggleAngleUnit,
  result,
  isLoading,
  onClearField,
  layoutMode = "fused",
}: CalculatorScreenProps) {
  // Las entradas se guardan más-nuevo-primero (ver useHistoryStore.ts:
  // `[newEntry, ...get().entries]`) — se toman las 2 más recientes y se
  // invierten para que la cinta crezca hacia arriba, como en Lite.
  const recentEntries = useHistoryStore((state) => state.entries)
    .slice(0, 2)
    .reverse();

  const angleBadge = angleUnit && onToggleAngleUnit && (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onToggleAngleUnit}
        aria-label={`Unidad angular: ${angleUnit === "rad" ? "radianes" : "grados"}. Cambiar.`}
        className="rounded-md bg-marker-soft px-2 py-1 text-[10px] font-semibold text-marker-text hover:bg-marker-soft/70"
      >
        {angleUnit === "rad" ? "RAD" : "DEG"}
      </button>
    </div>
  );

  const historyRibbon = recentEntries.length > 0 && (
    <div className="flex max-h-24 flex-col gap-1.5 overflow-y-auto">
      {recentEntries.map((entry, i) => (
        <div key={entry.id} className={i === recentEntries.length - 1 ? "opacity-70" : "opacity-40"}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-mono text-sm text-muted">{entry.inputText ?? entry.label}</span>
            {entry.resultLatex ? (
              <MathRenderer
                latex={entry.resultLatex}
                fallbackText={entry.resultText}
                className="shrink-0 font-mono text-sm font-semibold text-marker-text"
              />
            ) : (
              <span className="shrink-0 font-mono text-sm font-semibold text-marker-text">
                {entry.resultText ?? "—"}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const inputField = (
    <div className="relative">
      <NaturalMathField
        latex={latex}
        onLatexChange={onLatexChange}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        fieldRef={fieldRef}
        bare
      />
      {onClearField && latex.length > 0 && (
        <button
          type="button"
          onClick={onClearField}
          aria-label="Borrar campo"
          title="clear field"
          className="absolute right-10 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
        >
          ✕
        </button>
      )}
      <button
        type="submit"
        aria-label="Evaluar"
        className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-graph text-white hover:bg-graph/90"
      >
        →
      </button>
    </div>
  );

  const resultBlock = (isLoading || result) && <ResultPanel result={result} isLoading={isLoading} />;

  if (layoutMode === "separated") {
    return (
      <div className="flex flex-col gap-3">
        {angleBadge}
        {historyRibbon && <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{historyRibbon}</div>}
        <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{inputField}</div>
        {resultBlock && <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{resultBlock}</div>}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-inner shadow-black/10">
      {angleBadge && <div className="mb-1.5">{angleBadge}</div>}

      {historyRibbon && <div className="mb-2 border-b border-paper-line pb-2">{historyRibbon}</div>}

      {inputField}

      {resultBlock && <div className="mt-2 border-t border-paper-line pt-2">{resultBlock}</div>}
    </div>
  );
}
