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
 *
 * Fase P (Rediseño visual, Módulo P1 — spec_rediseno_visual.md sección 2):
 * las 6 disposiciones reservan 4 cuadrantes (entrada, resultado, teclado
 * colapsado, gráfica) — instrucción explícita del usuario. El cuadrante
 * de teclado no se renderiza aquí (el dock vive montado en la raíz de la
 * app, independiente de layoutMode); el de gráfica es <GraphPlaceholder />
 * — ver ese archivo para la decisión pendiente de graficación real
 * (Track de Graficación). "focus"/"floating"/"stacked" todavía no tienen
 * render propio (P2/P3/P4 pendientes) — caen al comportamiento de
 * "fused" por ahora.
 */

import type { MathfieldElement } from "mathlive";
import { useEffect } from "react";
import type { ReactNode } from "react";

import type { MathResponse } from "../api/client";
import { useFloatingLayoutStore } from "../store/useFloatingLayoutStore";
import { useHistoryStore } from "../store/useHistoryStore";
import { useKeyboardPanelStore } from "../store/useKeyboardPanelStore";
import type { LayoutMode } from "../store/useLayoutModeStore";
import { FloatingWindow } from "./FloatingWindow";
import { GraphPlaceholder } from "./GraphPlaceholder";
import { MathRenderer } from "./MathRenderer";
import { NaturalMathField } from "./NaturalMathField";
import { RecentKeysBar } from "./RecentKeysBar";
import { ResultPanel } from "./ResultPanel";
import { useMinWidthMediaQuery, FLOATING_MIN_WIDTH_PX } from "../hooks/useMinWidthMediaQuery";

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
  /** Módulo 6 (spec §7) + Fase P (Módulo P0/P1, spec_rediseno_visual.md
   * sección 2/15): "fused" (default) y "separated" ya existían. "split"
   * (Pantalla dividida) implementado en este módulo. "focus"/"floating"/
   * "stacked" están en el tipo pero sin render propio todavía. Paridad
   * con Screen.tsx de Lite. */
  layoutMode?: LayoutMode;
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

  // "stacked" (Apilado, Módulo P3): una sola columna, teclado como
  // sección colapsada inline (no overlay). Ver Screen.tsx (Lite) para el
  // mismo criterio y por qué no usa <KeyboardPanel>.
  if (layoutMode === "stacked") {
    return (
      <div className="flex flex-col gap-3">
        {angleBadge}
        {historyRibbon && <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{historyRibbon}</div>}
        <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{inputField}</div>
        {resultBlock && <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{resultBlock}</div>}
        <GraphPlaceholder />
        <StackedKeyboardSection />
      </div>
    );
  }

  // "floating" (Flotante, Módulo P4 — mayor riesgo, confirmada por el
  // usuario). Degrada a Enfoque por debajo de lg (1024px), sin crear
  // estado de ventanas flotantes (P0). Ver Screen.tsx (Lite) para el
  // mismo criterio completo.
  if (layoutMode === "floating") {
    return <FloatingScreenContent angleBadge={angleBadge} inputField={inputField} resultBlock={resultBlock} />;
  }

  // "focus" (Enfoque, Módulo P2): sin historial, resultado destacado,
  // gráfica con más área. Factorizado en <FocusScreenContent> porque
  // Flotante degradado (arriba) reusa exactamente esta composición.
  if (layoutMode === "focus") {
    return <FocusScreenContent angleBadge={angleBadge} inputField={inputField} resultBlock={resultBlock} />;
  }

  if (layoutMode === "separated") {
    return (
      <div className="flex flex-col gap-3">
        {angleBadge}
        {historyRibbon && <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{historyRibbon}</div>}
        <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{inputField}</div>
        {resultBlock && <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{resultBlock}</div>}
        <GraphPlaceholder />
      </div>
    );
  }

  // "split" (Pantalla dividida, Módulo P1): dos columnas fijas desde dt
  // (≥1440px) — izquierda: historial + entrada; derecha: resultado +
  // gráfica, ambos visibles a la vez. Por debajo de dt colapsa a una sola
  // columna en el mismo orden (equivalente a la degradación a Apilado
  // acordada en P0, implementada solo con clases responsivas, sin
  // depender de que el Módulo P3 ya exista).
  if (layoutMode === "split") {
    return (
      <div className="flex flex-col gap-3">
        {angleBadge}
        <div className="flex flex-col gap-3 dt:grid dt:grid-cols-[1.2fr_1fr] dt:items-start dt:gap-4">
          <div className="flex flex-col gap-3">
            {historyRibbon && <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{historyRibbon}</div>}
            <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{inputField}</div>
          </div>
          <div className="flex flex-col gap-3">
            {resultBlock && <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{resultBlock}</div>}
            <GraphPlaceholder />
          </div>
        </div>
      </div>
    );
  }

  // "fused" (default) — todas las demás disposiciones ya tienen su
  // propia rama arriba (P1/P2/P3/P4).
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-inner shadow-black/10">
        {angleBadge && <div className="mb-1.5">{angleBadge}</div>}

        {historyRibbon && <div className="mb-2 border-b border-paper-line pb-2">{historyRibbon}</div>}

        {inputField}

        {resultBlock && <div className="mt-2 border-t border-paper-line pt-2">{resultBlock}</div>}
      </div>
      <GraphPlaceholder />
    </div>
  );
}

/**
 * StackedKeyboardSection — Fase P, Módulo P3 ("Apilado"). Idéntico en
 * intención y comportamiento a la versión en Screen.tsx (Lite) — ver ese
 * archivo para el comentario completo de por qué no usa <KeyboardPanel>.
 */
function StackedKeyboardSection() {
  const isOpen = useKeyboardPanelStore((s) => s.isOpen);
  const content = useKeyboardPanelStore((s) => s.content);
  const basicContent = useKeyboardPanelStore((s) => s.basicContent);
  const toggle = useKeyboardPanelStore((s) => s.toggle);

  const canExpand = content !== null || basicContent !== null;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Fase X, Módulo X0 — "justo arriba de donde aparecerá el
          teclado (colapsado o no)": en Apilado, la sección entera
          (colapsada o expandida) vive dentro de esta caja, así que el
          dock de recientes va fuera y encima de ella. */}
      <RecentKeysBar />
      <div className="rounded-xl border border-paper-line bg-paper-soft">
        <button
          type="button"
          onClick={toggle}
          disabled={!canExpand}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-ink disabled:text-muted/40"
        >
          <span>Teclado</span>
          <span aria-hidden="true">{isOpen ? "▾" : "▴"}</span>
        </button>
        {isOpen && canExpand && (
          <div className="border-t border-paper-line px-3 pb-3 pt-2">
            {basicContent}
            {content}
          </div>
        )}
      </div>
    </div>
  );
}

interface FocusLikeContentProps {
  angleBadge: ReactNode;
  inputField: ReactNode;
  resultBlock: ReactNode;
}

/** Módulo P2 ("Enfoque"). Reusado tal cual por Flotante cuando degrada
 * (P0/P4). Ver Screen.tsx (Lite) para el mismo criterio. */
function FocusScreenContent({ angleBadge, inputField, resultBlock }: FocusLikeContentProps) {
  return (
    <div className="flex flex-1 flex-col gap-3">
      {angleBadge}
      <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{inputField}</div>
      {resultBlock && <div className="rounded-xl bg-paper-soft px-5 py-4 text-center shadow-sm">{resultBlock}</div>}
      <GraphPlaceholder />
    </div>
  );
}

/**
 * Módulo P4 ("Flotante"). Idéntico en intención y comportamiento a
 * Screen.tsx (Lite) — ver ese archivo para el comentario completo sobre
 * el gating por breakpoint y la persistencia/clamp de las ventanas.
 */
function FloatingScreenContent({ angleBadge, inputField, resultBlock }: FocusLikeContentProps) {
  const isWideEnough = useMinWidthMediaQuery(FLOATING_MIN_WIDTH_PX);

  const keyboardWindow = useFloatingLayoutStore((s) => s.keyboardWindow);
  const graphWindow = useFloatingLayoutStore((s) => s.graphWindow);
  const setWindow = useFloatingLayoutStore((s) => s.setWindow);
  const clampAllToViewport = useFloatingLayoutStore((s) => s.clampAllToViewport);
  const resetToDefault = useFloatingLayoutStore((s) => s.resetToDefault);

  const basicContent = useKeyboardPanelStore((s) => s.basicContent);
  const content = useKeyboardPanelStore((s) => s.content);

  useEffect(() => {
    if (!isWideEnough) return;
    clampAllToViewport(window.innerWidth, window.innerHeight);
    function onResize() {
      clampAllToViewport(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isWideEnough, clampAllToViewport]);

  if (!isWideEnough) {
    return <FocusScreenContent angleBadge={angleBadge} inputField={inputField} resultBlock={resultBlock} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        {angleBadge}
        <button type="button" onClick={resetToDefault} className="text-[11px] text-muted underline">
          Restablecer posición de ventanas
        </button>
      </div>
      <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{inputField}</div>
      {resultBlock && <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-sm">{resultBlock}</div>}
      {/* Fase X, Módulo X0 — "justo arriba de donde aparecerá el
          teclado": aquí el teclado vive en su propia FloatingWindow, así
          que el dock de recientes va fuera de ella, inmediatamente
          encima. No entra DENTRO de FloatingWindow porque esa ventana es
          arrastrable/redimensionable de forma independiente (persistida
          en useFloatingLayoutStore) — el dock de recientes no forma
          parte de esa superficie, es un elemento fijo del layout. */}
      <RecentKeysBar />
      <FloatingWindow title="Teclado" rect={keyboardWindow} onChange={(rect) => setWindow("keyboard", rect)}>
        {basicContent}
        {content}
      </FloatingWindow>
      <FloatingWindow title="Gráfica" rect={graphWindow} onChange={(rect) => setWindow("graph", rect)}>
        <GraphPlaceholder />
      </FloatingWindow>
    </div>
  );
}
