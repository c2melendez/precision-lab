/**
 * src/App.tsx — layout base + selector de modos + historial (spec,
 * sección 11, Módulo 12).
 *
 * Accesibilidad final (Módulo 12): skip-link al contenido principal,
 * `aria-current` en el modo activo, `aria-expanded` en el toggle de
 * historial, foco visible (`focus-visible:outline`) en todos los
 * controles interactivos añadidos aquí.
 */

import { useState } from "react";

import { BasicMode } from "./components/BasicMode";
import { SimpleBasicMode } from "./components/SimpleBasicMode";
import { DerivativeMode } from "./components/DerivativeMode";
import { EquationMode } from "./components/EquationMode";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GraphMode } from "./components/GraphMode";
import { History } from "./components/History";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { IntegralMode } from "./components/IntegralMode";
import { LimitMode } from "./components/LimitMode";
import { MatrixMode } from "./components/MatrixMode";
import { StatisticsMode } from "./components/StatisticsMode";
import { SystemMode } from "./components/SystemMode";
import { UnitsMode } from "./components/UnitsMode";
import { ThemeToggle } from "./components/ThemeToggle";
import { useUIStore, type CalculatorMode } from "./store/useUIStore";

const MODE_LABELS: Record<CalculatorMode, string> = {
  basic: "Científica",
  simple: "Basic",
  derivative: "Derivada",
  integral: "Integral",
  equation: "Ecuación",
  system: "Sistemas",
  matrix: "Matrices",
  graph: "Gráficas",
  limit: "Límite",
  statistics: "Estadística",
  units: "Unidades",
};

// Punto 4 del rediseño de teclado (pedido de Carlos): Derivada/Integral/
// Ecuación/Sistema ya no deben verse en el frontend — su función quedó
// cubierta por el router de Fase 1/2 dentro de "Científica" (ecuación/
// sistema/derivada/integral, todo en una sola pantalla vía
// calculusIntent.ts + submitCalculus). Los modos en sí NO se eliminan
// (siguen existiendo, siguen siendo válidos si algo interno navega ahí,
// ej. antes onGoToDerivative), solo se les quita la pestaña visible.
// Límite sigue el mismo criterio desde que se creó: el router también lo
// detecta ahora (ver calculusIntent.ts), así que tampoco ocupa un lugar
// en la navegación principal.
//
// P6 (spec v2 §7): "statistics" nueva, visible.
// P7 (spec v2 §8): "units" nueva, visible — con esto queda el orden
// final de §9: Científica · Basic · Matrices · Gráficas · Estadística ·
// Unidades.
const VISIBLE_MODES: CalculatorMode[] = ["basic", "simple", "matrix", "graph", "statistics", "units"];

function ActiveModeForm({ mode }: { mode: CalculatorMode }) {
  switch (mode) {
    case "basic":
      return <BasicMode />;
    case "simple":
      return <SimpleBasicMode />;
    case "derivative":
      return <DerivativeMode />;
    case "integral":
      return <IntegralMode />;
    case "equation":
      return <EquationMode />;
    case "system":
      return <SystemMode />;
    case "matrix":
      return <MatrixMode />;
    case "graph":
      return <GraphMode />;
    case "statistics":
      return <StatisticsMode />;
    case "units":
      return <UnitsMode />;
    case "limit":
      return <LimitMode />;
  }
}

export default function App() {
  const activeMode = useUIStore((state) => state.activeMode);
  const setActiveMode = useUIStore((state) => state.setActiveMode);
  const lastErrorMessage = useUIStore((state) => state.lastErrorMessage);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-graph focus:px-3 focus:py-2 focus:text-white"
      >
        Saltar al contenido principal
      </a>

      <header className="border-b border-paper-line bg-paper-soft px-6 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between lg:max-w-5xl dt:max-w-[1440px]">
          <h1 className="text-lg font-semibold text-ink">
            Precision<span className="text-marker">Lab</span>
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHistory((current) => !current)}
              aria-expanded={showHistory}
              aria-controls="history-panel"
              className="rounded-full border border-paper-line px-3 py-1.5 text-sm text-ink hover:bg-paper-line/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marker"
            >
              Historial
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <nav aria-label="Modos de la calculadora" className="border-b border-paper-line bg-paper-soft px-6">
        <ul className="mx-auto flex max-w-3xl flex-wrap gap-6 lg:max-w-5xl dt:max-w-[1440px]">
          {VISIBLE_MODES.map((mode) => (
            <li key={mode}>
              <button
                type="button"
                onClick={() => setActiveMode(mode)}
                aria-current={activeMode === mode ? "page" : undefined}
                className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marker ${
                  activeMode === mode
                    ? "border-marker text-marker"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {MODE_LABELS[mode]}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex">
        <main id="main-content" className="mx-auto min-w-0 max-w-3xl flex-1 px-6 py-8 lg:max-w-5xl dt:max-w-[1440px] dt:px-10">
          {lastErrorMessage && (
            <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {lastErrorMessage}
            </p>
          )}

          <section aria-live="polite" aria-label="Resultado" className="mx-auto max-w-md lg:max-w-none">
            <ErrorBoundary fallbackLabel="No se pudo mostrar el resultado.">
              <ActiveModeForm mode={activeMode} />
            </ErrorBoundary>
          </section>
        </main>
        <HistoryDrawer isOpen={showHistory} onClose={() => setShowHistory(false)}>
          <ErrorBoundary fallbackLabel="No se pudo mostrar el historial.">
            <History />
          </ErrorBoundary>
        </HistoryDrawer>
      </div>
    </div>
  );
}
