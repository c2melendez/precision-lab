/**
 * src/components/StepList.tsx — procedimiento paso a paso.
 * Mismo lenguaje visual que Precision Lab Lite (ficha tipo "margen de
 * cuaderno"), aprovechando aquí el modelo de datos completo (title, rule,
 * latex_before/after) que expone el backend SymPy. Ver auditoría Fase 0.
 *
 * Fase BB, Módulo BB0 (spec_rediseno_visual.md sección 14) — decisión
 * DEDUCIBLE registrada: `step.rule` (identificador técnico en inglés/
 * PascalCase, ej. "PowerRule", "ChainRule") dejó de renderizarse como
 * insignia junto al título. Se optó por la opción (b) del spec —dejar de
 * mostrarlo— y no (a) traducirlo ni (c) fusionarlo en `description`,
 * porque `title`/`description` ya están en español natural y cubren el
 * mismo propósito sin necesitar mantener un diccionario de traducción
 * para cada identificador que puedan emitir los distintos motores
 * (derivada, integral, límite, sistemas, EDO). El campo `rule` se
 * mantiene en el contrato de datos (`Step.rule`, sin cambios de tipo) por
 * si algún consumidor futuro lo necesita — solo se retiró su
 * visualización aquí, único punto donde se renderizaba (auditoría
 * confirmada: `grep` de `step.rule`/`.rule` en todo `src/` antes de este
 * cambio no encontró otro sitio).
 */

import type { components } from "../types/api";
import { MathRenderer } from "./MathRenderer";

type Step = components["schemas"]["Step"];

interface StepListProps {
  steps: Step[];
  activeIndex?: number;
}

export function StepList({ steps, activeIndex }: StepListProps) {
  if (steps.length === 0) return null;

  return (
    <ol className="relative flex flex-col gap-3.5 pl-5" aria-label="Procedimiento paso a paso">
      <div className="absolute bottom-1 left-[9px] top-1 w-px bg-paper-line" aria-hidden="true" />

      {steps.map((step, i) => {
        const isActive = activeIndex === i;
        return (
          <li key={step.index} className="relative fade-in">
            <span
              className={
                isActive
                  ? "absolute -left-5 top-0.5 h-3 w-3 rounded-full bg-marker ring-4 ring-marker-soft"
                  : "absolute -left-5 top-0.5 h-3 w-3 rounded-full border-2 border-paper-line bg-paper"
              }
              aria-hidden="true"
            />
            <div className={isActive ? "-mx-2.5 rounded-lg border-l-[3px] border-marker bg-marker-soft p-2.5" : ""}>
              <div className="flex items-center justify-between">
                <span className={isActive ? "text-sm font-medium text-marker-text" : "text-sm font-medium text-muted"}>
                  {step.title}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{step.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <MathRenderer latex={step.latex_before} className="text-muted" />
                <span className="text-muted">→</span>
                <MathRenderer latex={step.latex_after} className="text-ink" />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
