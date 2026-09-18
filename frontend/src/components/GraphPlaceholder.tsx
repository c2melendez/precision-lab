/**
 * src/components/GraphPlaceholder.tsx — Fase P (Rediseño visual), Módulo P1.
 *
 * Cuadrante visual reservado para la gráfica. Instrucción explícita del
 * usuario (Track C, sesión de rediseño visual): las 6 disposiciones
 * (Fusionada, Separada, Pantalla dividida, Enfoque, Flotante, Apilado)
 * deben considerar 4 cuadrantes — entrada de datos, resultado, teclado
 * colapsado y gráfica — aunque hoy no exista graficación automática
 * fuera del modo Graficación.
 *
 * DECISIÓN PENDIENTE, registrada aquí a propósito, NO resuelta en este
 * módulo ni en este track: qué expresión se grafica, cuándo se considera
 * "graficable" y cómo se obtiene `graph_data` para resultados que vienen
 * de `/evaluate`, `/solve`, `/derivative`, `/integral` (estos endpoints
 * NO devuelven `graph_data` hoy — solo `/graph/2d`, `/graph/3d` y
 * `/graph/parametric` lo hacen, ver `graph_service.py`). Se resuelve
 * cuando el track de Graficación
 * (`spec_graficacion_matrices_estadistica_unidades.md`) esté implementado
 * e integrado aquí — ver `precision-lab-mapa-de-coordinacion.md`
 * sección 3.1/3.2 sobre la fricción esperada con `GraphViewer.tsx`/
 * `traceToPlotly()`.
 *
 * Este componente es SOLO el cuadrante visual: no hace ninguna llamada de
 * red, no decide qué graficar, no importa `GraphViewer`/`CURVE_COLORS`.
 * Cuando el track de Graficación esté listo, este archivo es el punto de
 * reemplazo (o de composición) para conectar la gráfica real.
 */

export function GraphPlaceholder() {
  return (
    <div
      role="note"
      aria-label="Gráfica: pendiente de integración con el track de Graficación"
      className="flex min-h-[110px] flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-paper-line bg-paper-soft/60 px-4 py-6 text-center"
    >
      <span className="text-xs font-medium text-muted">Gráfica</span>
      <span className="text-[11px] text-muted/70">Disponible cuando se integre el track de Graficación.</span>
    </div>
  );
}
