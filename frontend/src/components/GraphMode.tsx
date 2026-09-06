/**
 * src/components/GraphMode.tsx — modo Gráficas (spec, sección 11): tres
 * submodos (2D / 3D / Paramétrico), cada uno con su propio formulario,
 * conectados a `POST /graph/2d`, `POST /graph/3d` y `POST /graph/parametric`
 * respectivamente. `GraphViewer` se carga vía `React.lazy` (import
 * dinámico real de Plotly — nunca en el bundle principal, Módulo 12)
 * solo cuando hay `graph_data` que mostrar; distingue superficie 3D de
 * curva 2D/paramétrica por el `trace.type` que ya trae la respuesta.
 */

import { lazy, Suspense, useRef, useState, type FormEvent } from "react";
import type { MathfieldElement } from "mathlive";

import type { MathResponse } from "../api/client";
import { submitAndRecord } from "../api/submitWithHistory";
import { useUIStore } from "../store/useUIStore";
import { latexToBackendSyntax, NaturalMathField } from "./NaturalMathField";
import { NaturalMathKeyboard } from "./NaturalMathKeyboard";
import { ResultPanel } from "./ResultPanel";

const GraphViewer = lazy(() => import("./GraphViewer"));

// Fase D (spec UX estilo ClassCalc §6): mismos colores que
// GraphViewer.CURVE_COLORS, duplicados aquí a propósito — importar el
// export nombrado desde GraphViewer.tsx forzaría a que ese archivo se
// incluya en el bundle principal en vez de cargarse solo vía
// React.lazy() cuando el componente realmente se monta (Módulo 12).

const MAX_EXPRESSIONS = 5;

type GraphKind = "2d" | "3d" | "parametric";

const GRAPH_KIND_LABELS: Record<GraphKind, string> = {
  "2d": "2D",
  "3d": "3D",
  parametric: "Paramétrica",
};

const CURVE_COLORS = ["#E8A33D", "#3E7C74", "#9B7FD6", "#D97757", "#5B94C9"];

function AnalysisPanel({ result }: { result: MathResponse }) {
  if (!result.graph_data?.analysis) return null;
  return (
    <div className="space-y-3">
      {result.graph_data.analysis.map((analysis, index) => (
        <div key={index} className="rounded border border-paper-line bg-paper p-3 text-sm">
          <p className="mb-2 font-medium text-ink">
            {result.graph_data!.traces[index]?.name ?? `Expresión ${index + 1}`}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted sm:grid-cols-3">
            <dt className="text-muted">Dominio</dt>
            <dd className="col-span-1 sm:col-span-2">{analysis.domain_text ?? "—"}</dd>
            <dt className="text-muted">Rango</dt>
            <dd className="col-span-1 sm:col-span-2">{analysis.range_text ?? "—"}</dd>
            <dt className="text-muted">Corte en y</dt>
            <dd className="col-span-1 sm:col-span-2">{analysis.y_intercept ?? "—"}</dd>
            <dt className="text-muted">Cortes en x</dt>
            <dd className="col-span-1 sm:col-span-2">
              {analysis.x_intercepts && analysis.x_intercepts.length > 0
                ? analysis.x_intercepts.join(", ")
                : "—"}
            </dd>
            <dt className="text-muted">Máximos locales</dt>
            <dd className="col-span-1 sm:col-span-2">
              {analysis.local_maxima && analysis.local_maxima.length > 0
                ? analysis.local_maxima.join(", ")
                : "—"}
            </dd>
            <dt className="text-muted">Mínimos locales</dt>
            <dd className="col-span-1 sm:col-span-2">
              {analysis.local_minima && analysis.local_minima.length > 0
                ? analysis.local_minima.join(", ")
                : "—"}
            </dd>
            <dt className="text-muted">Puntos de inflexión</dt>
            <dd className="col-span-1 sm:col-span-2">
              {analysis.inflection_points && analysis.inflection_points.length > 0
                ? analysis.inflection_points.join(", ")
                : "—"}
            </dd>
          </dl>
        </div>
      ))}
    </div>
  );
}

function ResultArea({
  result,
  isLoading,
  colors,
}: {
  result: MathResponse | null;
  isLoading: boolean;
  colors?: string[];
}) {
  if (!isLoading && result?.success && result.graph_data) {
    return (
      <div className="space-y-4">
        <Suspense fallback={<p className="text-sm text-muted">Cargando visor de gráficas…</p>}>
          <GraphViewer data={result.graph_data} colors={colors} />
        </Suspense>
        <AnalysisPanel result={result} />
      </div>
    );
  }
  return <ResultPanel result={result} isLoading={isLoading} />;
}

function Graph2DForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [latexRows, setLatexRows] = useState<string[]>([""]);
  const [mathFields, setMathFields] = useState<(MathfieldElement | null)[]>([null]);
  const [activeRow, setActiveRow] = useState(0);
  const [variable, setVariable] = useState("x");
  const [xMin, setXMin] = useState("");
  const [xMax, setXMax] = useState("");
  const [samples, setSamples] = useState("");
  const [angleUnit, setAngleUnit] = useState<"rad" | "deg">("rad");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<MathResponse | null>(null);

  const setLoading = useUIStore((state) => state.setLoading);
  const setErrorMessage = useUIStore((state) => state.setErrorMessage);
  const isLoading = useUIStore((state) => state.isLoading);
  const setActiveMode = useUIStore((state) => state.setActiveMode);

  // Fix: bug real preexistente (ver informe a Carlos) — pasar
  // `fieldRef={(el) => setMathFields(...)}` inline en el JSX de abajo
  // crea una función nueva en cada render. React invoca las callback
  // refs cada vez que cambia su identidad, y como `.map()` siempre
  // devuelve un array nuevo, cada invocación disparaba un re-render →
  // nueva función → se invoca de nuevo → bucle infinito ("Maximum
  // update depth exceeded", React error #185), atrapado por el
  // ErrorBoundary como "No se pudo mostrar el resultado." apenas se
  // entra al modo Gráficas (submodo 2D, el que abre por defecto).
  //
  // Fix: una función estable por índice, cacheada en un ref (no en
  // estado) para que su identidad no cambie entre renders, y que evite
  // el setState si el elemento no cambió realmente.
  const fieldRefCallbacks = useRef<Map<number, (el: MathfieldElement | null) => void>>(new Map());
  function getFieldRef(index: number): (el: MathfieldElement | null) => void {
    let cached = fieldRefCallbacks.current.get(index);
    if (!cached) {
      cached = (el: MathfieldElement | null) => {
        setMathFields((current) => {
          if (current[index] === el) return current;
          const next = current.slice();
          next[index] = el;
          return next;
        });
      };
      fieldRefCallbacks.current.set(index, cached);
    }
    return cached;
  }

  function updateExpression(index: number, value: string): void {
    setLatexRows((current) => current.map((expr, i) => (i === index ? value : expr)));
  }

  function addExpressionField(): void {
    if (latexRows.length >= MAX_EXPRESSIONS) return;
    setLatexRows((current) => [...current, ""]);
    setMathFields((current) => [...current, null]);
  }

  function removeExpressionField(index: number): void {
    setLatexRows((current) => current.filter((_, i) => i !== index));
    setMathFields((current) => current.filter((_, i) => i !== index));
    setActiveRow((current) => Math.min(current, latexRows.length - 2));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedExpressions = latexRows.map((row) => latexToBackendSyntax(row)).filter(Boolean);

    if (trimmedExpressions.length === 0) {
      setValidationError("Debes ingresar al menos una expresión.");
      return;
    }
    const trimmedXMin = xMin.trim();
    const trimmedXMax = xMax.trim();
    if ((trimmedXMin === "") !== (trimmedXMax === "")) {
      setValidationError("x_min y x_max deben especificarse juntos o ninguno.");
      return;
    }
    setValidationError(null);

    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await submitAndRecord(
        "/graph/2d",
        {
          expressions: trimmedExpressions,
          variable: variable.trim() || "x",
          angle_unit: angleUnit,
          ...(trimmedXMin !== "" ? { x_min: Number(trimmedXMin), x_max: Number(trimmedXMax) } : {}),
          ...(samples.trim() !== "" ? { samples: Number(samples.trim()) } : {}),
        },
        trimmedExpressions.join(", "),
      );
      setLastResult(result);
      if (!result.success) {
        setErrorMessage(result.error_message ?? "Ocurrió un error.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <span className="block text-sm text-muted">Expresiones (hasta {MAX_EXPRESSIONS})</span>
        {latexRows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: CURVE_COLORS[index % CURVE_COLORS.length] }}
              aria-hidden="true"
            />
            <div className="flex-1">
              <NaturalMathField
                latex={row}
                onLatexChange={(value) => updateExpression(index, value)}
                ariaLabel={`Expresión ${index + 1}`}
                placeholder="x^2"
                fieldRef={getFieldRef(index)}
              />
            </div>
            {latexRows.length > 1 && (
              <button
                type="button"
                onClick={() => removeExpressionField(index)}
                aria-label={`Eliminar expresión ${index + 1}`}
                className="text-sm text-muted hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {latexRows.length < MAX_EXPRESSIONS && (
          <button
            type="button"
            onClick={addExpressionField}
            className="text-sm text-marker hover:text-marker-text"
          >
            + Añadir expresión
          </button>
        )}
      </div>

      <div className="space-y-1">
        {latexRows.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <span className="pt-1 text-xs font-medium text-muted">Teclado para:</span>
            {latexRows.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setActiveRow(index)}
                aria-pressed={activeRow === index}
                className={`rounded px-2 py-1 text-xs ${
                  activeRow === index
                    ? "bg-graph text-white"
                    : "border border-paper-line text-muted hover:bg-paper"
                }`}
              >
                #{index + 1}
              </button>
            ))}
          </div>
        )}
        <NaturalMathKeyboard
          field={mathFields[activeRow] ?? null}
          onSubmit={() => formRef.current?.requestSubmit()}
          onGoToDerivative={() => setActiveMode("derivative")}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <label htmlFor="graph-variable" className="block text-sm text-muted">
            Variable
          </label>
          <input
            id="graph-variable"
            type="text"
            value={variable}
            onChange={(e) => setVariable(e.target.value)}
            className="w-20 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="graph-x-min" className="block text-sm text-muted">
            x mínimo (opcional)
          </label>
          <input
            id="graph-x-min"
            type="text"
            value={xMin}
            onChange={(e) => setXMin(e.target.value)}
            className="w-24 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="graph-x-max" className="block text-sm text-muted">
            x máximo (opcional)
          </label>
          <input
            id="graph-x-max"
            type="text"
            value={xMax}
            onChange={(e) => setXMax(e.target.value)}
            className="w-24 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="graph-samples" className="block text-sm text-muted">
            Muestras (opcional)
          </label>
          <input
            id="graph-samples"
            type="text"
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
            className="w-24 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="graph-angle-unit" className="block text-sm text-muted">
            Unidad angular
          </label>
          <select
            id="graph-angle-unit"
            value={angleUnit}
            onChange={(e) => setAngleUnit(e.target.value as "rad" | "deg")}
            className="rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          >
            <option value="rad">Radianes</option>
            <option value="deg">Grados</option>
          </select>
        </div>
      </div>

      {validationError && (
        <p role="alert" className="text-sm text-red-600">
          {validationError}
        </p>
      )}

      <button
        type="submit"
        className="rounded bg-graph px-4 py-2 text-sm font-medium text-white hover:bg-graph/90"
      >
        Graficar
      </button>

      <div className="border-t border-paper-line pt-4">
        <ResultArea result={lastResult} isLoading={isLoading} colors={CURVE_COLORS} />
      </div>
    </form>
  );
}

function Graph3DForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [latex, setLatex] = useState("");
  const [mathField, setMathField] = useState<MathfieldElement | null>(null);
  const [xVar, setXVar] = useState("x");
  const [yVar, setYVar] = useState("y");
  const [xMin, setXMin] = useState("-10");
  const [xMax, setXMax] = useState("10");
  const [yMin, setYMin] = useState("-10");
  const [yMax, setYMax] = useState("10");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<MathResponse | null>(null);

  const setLoading = useUIStore((state) => state.setLoading);
  const setErrorMessage = useUIStore((state) => state.setErrorMessage);
  const isLoading = useUIStore((state) => state.isLoading);
  const setActiveMode = useUIStore((state) => state.setActiveMode);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedExpression = latexToBackendSyntax(latex);
    if (!trimmedExpression) {
      setValidationError("La expresión no puede estar vacía.");
      return;
    }
    const parsedRanges = [xMin, xMax, yMin, yMax].map(Number);
    if (parsedRanges.some((n) => Number.isNaN(n))) {
      setValidationError("Los rangos de x e y deben ser números.");
      return;
    }
    setValidationError(null);

    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await submitAndRecord(
        "/graph/3d",
        {
          expression: trimmedExpression,
          variables: [xVar.trim() || "x", yVar.trim() || "y"],
          x_range: [Number(xMin), Number(xMax)],
          y_range: [Number(yMin), Number(yMax)],
        },
        `z = ${trimmedExpression}`,
      );
      setLastResult(result);
      if (!result.success) {
        setErrorMessage(result.error_message ?? "Ocurrió un error.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <NaturalMathField
          latex={latex}
          onLatexChange={setLatex}
          ariaLabel="Expresión"
          placeholder="x^2+y^2"
          fieldRef={setMathField}
        />
        <NaturalMathKeyboard
          field={mathField}
          onSubmit={() => formRef.current?.requestSubmit()}
          onGoToDerivative={() => setActiveMode("derivative")}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <label htmlFor="graph3d-xvar" className="block text-sm text-muted">
            Variable x
          </label>
          <input
            id="graph3d-xvar"
            type="text"
            value={xVar}
            onChange={(e) => setXVar(e.target.value)}
            className="w-16 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="graph3d-yvar" className="block text-sm text-muted">
            Variable y
          </label>
          <input
            id="graph3d-yvar"
            type="text"
            value={yVar}
            onChange={(e) => setYVar(e.target.value)}
            className="w-16 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="graph3d-xmin" className="block text-sm text-muted">
            x mínimo
          </label>
          <input
            id="graph3d-xmin"
            type="text"
            value={xMin}
            onChange={(e) => setXMin(e.target.value)}
            className="w-20 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="graph3d-xmax" className="block text-sm text-muted">
            x máximo
          </label>
          <input
            id="graph3d-xmax"
            type="text"
            value={xMax}
            onChange={(e) => setXMax(e.target.value)}
            className="w-20 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="graph3d-ymin" className="block text-sm text-muted">
            y mínimo
          </label>
          <input
            id="graph3d-ymin"
            type="text"
            value={yMin}
            onChange={(e) => setYMin(e.target.value)}
            className="w-20 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="graph3d-ymax" className="block text-sm text-muted">
            y máximo
          </label>
          <input
            id="graph3d-ymax"
            type="text"
            value={yMax}
            onChange={(e) => setYMax(e.target.value)}
            className="w-20 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
      </div>

      {validationError && (
        <p role="alert" className="text-sm text-red-600">
          {validationError}
        </p>
      )}

      <button
        type="submit"
        className="rounded bg-graph px-4 py-2 text-sm font-medium text-white hover:bg-graph/90"
      >
        Graficar superficie
      </button>

      <div className="border-t border-paper-line pt-4">
        <ResultArea result={lastResult} isLoading={isLoading} />
      </div>
    </form>
  );
}

function GraphParametricForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [xLatex, setXLatex] = useState("");
  const [yLatex, setYLatex] = useState("");
  const [xMathField, setXMathField] = useState<MathfieldElement | null>(null);
  const [yMathField, setYMathField] = useState<MathfieldElement | null>(null);
  const [activeField, setActiveField] = useState<"x" | "y">("x");
  const [parameter, setParameter] = useState("t");
  const [tMin, setTMin] = useState("0");
  const [tMax, setTMax] = useState("6.283185307179586");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<MathResponse | null>(null);

  const setLoading = useUIStore((state) => state.setLoading);
  const setErrorMessage = useUIStore((state) => state.setErrorMessage);
  const isLoading = useUIStore((state) => state.isLoading);
  const setActiveMode = useUIStore((state) => state.setActiveMode);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedX = latexToBackendSyntax(xLatex);
    const trimmedY = latexToBackendSyntax(yLatex);
    if (!trimmedX || !trimmedY) {
      setValidationError("Ambas componentes x(t) e y(t) deben tener contenido.");
      return;
    }
    const parsedTMin = Number(tMin);
    const parsedTMax = Number(tMax);
    if (Number.isNaN(parsedTMin) || Number.isNaN(parsedTMax)) {
      setValidationError("t mínimo y t máximo deben ser números.");
      return;
    }
    setValidationError(null);

    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await submitAndRecord(
        "/graph/parametric",
        {
          x_expression: trimmedX,
          y_expression: trimmedY,
          parameter: parameter.trim() || "t",
          t_min: parsedTMin,
          t_max: parsedTMax,
        },
        `(${trimmedX}, ${trimmedY})`,
      );
      setLastResult(result);
      if (!result.success) {
        setErrorMessage(result.error_message ?? "Ocurrió un error.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <span className="block text-sm text-muted">x(t)</span>
        <NaturalMathField
          latex={xLatex}
          onLatexChange={setXLatex}
          ariaLabel="x(t)"
          placeholder="cos(t)"
          fieldRef={setXMathField}
        />
      </div>
      <div className="space-y-1">
        <span className="block text-sm text-muted">y(t)</span>
        <NaturalMathField
          latex={yLatex}
          onLatexChange={setYLatex}
          ariaLabel="y(t)"
          placeholder="sin(t)"
          fieldRef={setYMathField}
        />
      </div>

      <div className="space-y-1">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveField("x")}
            aria-pressed={activeField === "x"}
            className={`rounded px-2 py-1 text-xs ${
              activeField === "x"
                ? "bg-graph text-white"
                : "border border-paper-line text-muted hover:bg-paper"
            }`}
          >
            Teclado para x(t)
          </button>
          <button
            type="button"
            onClick={() => setActiveField("y")}
            aria-pressed={activeField === "y"}
            className={`rounded px-2 py-1 text-xs ${
              activeField === "y"
                ? "bg-graph text-white"
                : "border border-paper-line text-muted hover:bg-paper"
            }`}
          >
            Teclado para y(t)
          </button>
        </div>
        <NaturalMathKeyboard
          field={activeField === "x" ? xMathField : yMathField}
          onSubmit={() => formRef.current?.requestSubmit()}
          onGoToDerivative={() => setActiveMode("derivative")}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <label htmlFor="param-parameter" className="block text-sm text-muted">
            Parámetro
          </label>
          <input
            id="param-parameter"
            type="text"
            value={parameter}
            onChange={(e) => setParameter(e.target.value)}
            className="w-16 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="param-tmin" className="block text-sm text-muted">
            t mínimo
          </label>
          <input
            id="param-tmin"
            type="text"
            value={tMin}
            onChange={(e) => setTMin(e.target.value)}
            className="w-28 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="param-tmax" className="block text-sm text-muted">
            t máximo
          </label>
          <input
            id="param-tmax"
            type="text"
            value={tMax}
            onChange={(e) => setTMax(e.target.value)}
            className="w-28 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          />
        </div>
      </div>

      {validationError && (
        <p role="alert" className="text-sm text-red-600">
          {validationError}
        </p>
      )}

      <button
        type="submit"
        className="rounded bg-graph px-4 py-2 text-sm font-medium text-white hover:bg-graph/90"
      >
        Graficar curva
      </button>

      <div className="border-t border-paper-line pt-4">
        <ResultArea result={lastResult} isLoading={isLoading} />
      </div>
    </form>
  );
}

export function GraphMode() {
  const [kind, setKind] = useState<GraphKind>("2d");

  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-lg border border-paper-line bg-paper-soft p-5 shadow-sm lg:max-w-3xl dt:max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">Gráficas</h2>
        <div className="flex gap-1" role="tablist" aria-label="Tipo de gráfica">
          {(Object.keys(GRAPH_KIND_LABELS) as GraphKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`rounded px-3 py-1 text-xs font-medium ${
                kind === k ? "bg-graph text-white" : "text-muted hover:bg-paper-line/40"
              }`}
            >
              {GRAPH_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {kind === "2d" && <Graph2DForm />}
      {kind === "3d" && <Graph3DForm />}
      {kind === "parametric" && <GraphParametricForm />}
    </div>
  );
}
