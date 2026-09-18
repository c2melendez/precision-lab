/**
 * components/StatisticsMode.tsx — P6 (spec v2 §7): Descriptiva /
 * Combinatoria / Distribución. A diferencia de MatrixMode.tsx, este
 * componente sí llama al backend (spec v2 §7.4: decisión deliberada de
 * mantener consistencia arquitectónica, distinto de Unidades/P7 que es
 * 100% frontend) — mismo patrón de submitAndRecord + ResultPanel que ya
 * usa MatrixMode.
 */

import { useState } from "react";
import { submitAndRecord } from "../api/submitWithHistory";
import type { MathResponse } from "../api/client";
import { ResultPanel } from "./ResultPanel";

type SubMode = "descriptive" | "combinatorics" | "distribution" | "correlation";
type VarianceKind = "population" | "sample";
type Distribution = "binomial" | "normal" | "poisson" | "uniform" | "exponential";

const TABS: { id: SubMode; label: string }[] = [
  { id: "descriptive", label: "Descriptiva" },
  { id: "combinatorics", label: "Combinatoria" },
  { id: "distribution", label: "Distribución" },
  // Módulo M1 (spec_graficacion_matrices_estadistica_unidades.md, sección
  // 6.2): pestaña propia — opera sobre pares (x,y), no la lista única de
  // "Descriptiva". Reutiliza el mismo patrón de input de texto separado
  // por comas dos veces (X, Y) en vez de tocar el input de "Descriptiva".
  { id: "correlation", label: "Correlación" },
];

function parseDataList(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number(s);
      if (!Number.isFinite(n)) throw new Error(`"${s}" no es un número válido.`);
      return n;
    });
}

export function StatisticsMode() {
  const [subMode, setSubMode] = useState<SubMode>("descriptive");

  // --- Descriptiva ---
  const [dataRaw, setDataRaw] = useState("");
  const [varianceKind, setVarianceKind] = useState<VarianceKind>("population");
  // Módulo M0 (spec_graficacion_matrices_estadistica_unidades.md, sección 6.1).
  const [percentileP, setPercentileP] = useState("90");
  const [descriptiveResult, setDescriptiveResult] = useState<MathResponse | null>(null);
  const [descriptiveLoading, setDescriptiveLoading] = useState(false);

  async function runDescriptive(stat: string, percentileP?: number) {
    let values: number[];
    try {
      values = parseDataList(dataRaw);
    } catch (e) {
      setDescriptiveResult({
        success: false,
        operation: "statistics_descriptive",
        request_id: "local",
        has_detailed_steps: false,
        error_message: e instanceof Error ? e.message : "Error desconocido.",
      } as MathResponse);
      return;
    }
    if (values.length === 0) {
      setDescriptiveResult({
        success: false,
        operation: "statistics_descriptive",
        request_id: "local",
        has_detailed_steps: false,
        error_message: "Agrega al menos un valor a la lista (separados por coma).",
      } as MathResponse);
      return;
    }
    setDescriptiveLoading(true);
    try {
      const result = await submitAndRecord(
        "/statistics/descriptive",
        { values, stat, variance_kind: varianceKind, percentile_p: percentileP },
        `Estadística descriptiva: ${stat}(${values.join(",")})`,
      );
      setDescriptiveResult(result);
    } finally {
      setDescriptiveLoading(false);
    }
  }

  // --- Combinatoria ---
  const [nStr, setNStr] = useState("8");
  const [rStr, setRStr] = useState("3");
  const [combinatoricsResult, setCombinatoricsResult] = useState<MathResponse | null>(null);
  const [combinatoricsLoading, setCombinatoricsLoading] = useState(false);

  async function runCombinatorics(fn: "nCr" | "nPr" | "factorial") {
    const n = Number(nStr);
    const r = Number(rStr);
    setCombinatoricsLoading(true);
    try {
      const result = await submitAndRecord(
        "/statistics/combinatorics",
        { n, r, fn },
        `Combinatoria: ${fn}(${n}${fn === "factorial" ? "" : `,${r}`})`,
      );
      setCombinatoricsResult(result);
    } finally {
      setCombinatoricsLoading(false);
    }
  }

  // --- Distribución ---
  const [distribution, setDistribution] = useState<Distribution>("binomial");
  const [binN, setBinN] = useState("10");
  const [binP, setBinP] = useState("0.3");
  const [binK, setBinK] = useState("3");
  const [mu, setMu] = useState("0");
  const [sigma, setSigma] = useState("1");
  const [normX, setNormX] = useState("0");
  const [normA, setNormA] = useState("-1");
  const [normB, setNormB] = useState("1");
  const [distributionResult, setDistributionResult] = useState<MathResponse | null>(null);
  const [distributionLoading, setDistributionLoading] = useState(false);

  async function runBinomial(query: "pmf" | "cdf" | "survival" | "mean" | "variance") {
    setDistributionLoading(true);
    try {
      const result = await submitAndRecord(
        "/statistics/binomial",
        { n: Number(binN), p: Number(binP), k: Number(binK), query },
        `Binomial(${binN},${binP}) ${query}`,
      );
      setDistributionResult(result);
    } finally {
      setDistributionLoading(false);
    }
  }

  async function runNormal(query: "cdf" | "range" | "zscore") {
    setDistributionLoading(true);
    try {
      const result = await submitAndRecord(
        "/statistics/normal",
        { mu: Number(mu), sigma: Number(sigma), x: Number(normX), a: Number(normA), b: Number(normB), query },
        `Normal(${mu},${sigma}) ${query}`,
      );
      setDistributionResult(result);
    } finally {
      setDistributionLoading(false);
    }
  }

  // Módulo N0 (spec_graficacion_matrices_estadistica_unidades.md, sección 7).
  const [poissonLam, setPoissonLam] = useState("4");
  const [poissonK, setPoissonK] = useState("2");
  const [uniformA, setUniformA] = useState("0");
  const [uniformB, setUniformB] = useState("10");
  const [uniformX, setUniformX] = useState("5");
  const [expLam, setExpLam] = useState("2");
  const [expX, setExpX] = useState("1");

  async function runPoisson(query: "pmf" | "cdf" | "mean" | "variance") {
    setDistributionLoading(true);
    try {
      const result = await submitAndRecord(
        "/statistics/poisson",
        { lam: Number(poissonLam), k: Number(poissonK), query },
        `Poisson(${poissonLam}) ${query}`,
      );
      setDistributionResult(result);
    } finally {
      setDistributionLoading(false);
    }
  }

  async function runUniform(query: "cdf" | "mean" | "variance") {
    setDistributionLoading(true);
    try {
      const result = await submitAndRecord(
        "/statistics/uniform",
        { a: Number(uniformA), b: Number(uniformB), x: Number(uniformX), query },
        `Uniforme(${uniformA},${uniformB}) ${query}`,
      );
      setDistributionResult(result);
    } finally {
      setDistributionLoading(false);
    }
  }

  async function runExponential(query: "cdf" | "mean" | "variance") {
    setDistributionLoading(true);
    try {
      const result = await submitAndRecord(
        "/statistics/exponential",
        { lam: Number(expLam), x: Number(expX), query },
        `Exponencial(${expLam}) ${query}`,
      );
      setDistributionResult(result);
    } finally {
      setDistributionLoading(false);
    }
  }

  // --- Correlación / regresión (Módulo M1) ---
  const [xRaw, setXRaw] = useState("");
  const [yRaw, setYRaw] = useState("");
  const [correlationResult, setCorrelationResult] = useState<MathResponse | null>(null);
  const [correlationLoading, setCorrelationLoading] = useState(false);

  async function runCorrelation(query: "correlation" | "slope" | "intercept") {
    let x: number[];
    let y: number[];
    try {
      x = parseDataList(xRaw);
      y = parseDataList(yRaw);
    } catch (e) {
      setCorrelationResult({
        success: false,
        operation: "statistics_correlation",
        request_id: "local",
        has_detailed_steps: false,
        error_message: e instanceof Error ? e.message : "Error desconocido.",
      } as MathResponse);
      return;
    }
    if (x.length !== y.length) {
      setCorrelationResult({
        success: false,
        operation: "statistics_correlation",
        request_id: "local",
        has_detailed_steps: false,
        error_message: `X tiene ${x.length} valores pero Y tiene ${y.length} — deben tener la misma cantidad.`,
      } as MathResponse);
      return;
    }
    setCorrelationLoading(true);
    try {
      const result = await submitAndRecord("/statistics/correlation", { x, y, query }, `Correlación: ${query}`);
      setCorrelationResult(result);
    } finally {
      setCorrelationLoading(false);
    }
  }

  const inputClass = "w-full rounded border border-paper-line bg-paper-soft px-2 py-1.5 text-sm";
  const btnClass = "rounded border border-paper-line py-2 text-xs text-ink hover:bg-paper";
  const btnPrimaryClass = "rounded bg-graph py-2 text-xs font-medium text-white hover:bg-graph/90";

  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-lg border border-paper-line bg-paper-soft p-5 shadow-sm lg:max-w-2xl dt:max-w-3xl">
      <div className="flex gap-1 rounded-lg border border-paper-line p-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubMode(t.id)}
            className={
              subMode === t.id
                ? "flex-1 rounded-md bg-graph py-1.5 text-white"
                : "flex-1 rounded-md py-1.5 text-muted hover:bg-paper"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {subMode === "descriptive" && (
        <div className="space-y-3">
          <label className="block text-sm text-muted">
            Datos (separados por coma)
            <input
              value={dataRaw}
              onChange={(e) => setDataRaw(e.target.value)}
              placeholder="7, 8, 9, 12, 15"
              className={`${inputClass} mt-1`}
            />
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" className={btnClass} onClick={() => runDescriptive("mean")}>x̄</button>
            <button type="button" className={btnClass} onClick={() => runDescriptive("median")}>Mediana</button>
            <button type="button" className={btnClass} onClick={() => runDescriptive("mode")}>Moda</button>
            <button type="button" className={btnClass} onClick={() => runDescriptive("sum")}>Σx</button>
            <button type="button" className={btnClass} onClick={() => runDescriptive("sumsq")}>Σx²</button>
            <button type="button" className={btnClass} onClick={() => runDescriptive("n")}>n</button>
            <button type="button" className={btnClass} onClick={() => runDescriptive("min")}>Min</button>
            <button type="button" className={btnClass} onClick={() => runDescriptive("max")}>Max</button>
            <button type="button" className={btnClass} onClick={() => runDescriptive("range")}>Rango</button>
            <button type="button" className={btnClass} onClick={() => runDescriptive("q1")}>Q1</button>
            <button type="button" className={btnClass} onClick={() => runDescriptive("q2")}>Q2 (mediana)</button>
            <button type="button" className={btnClass} onClick={() => runDescriptive("q3")}>Q3</button>
            <button type="button" className={btnClass} onClick={() => runDescriptive("iqr")}>RIQ</button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted">Percentil</span>
            <input
              value={percentileP}
              onChange={(e) => setPercentileP(e.target.value)}
              className="w-16 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
            />
            <button
              type="button"
              className={`${btnClass} flex-1`}
              onClick={() => runDescriptive("percentile", Number(percentileP))}
            >
              Calcular
            </button>
          </div>
          <div className="flex items-center justify-between rounded border border-paper-line px-2 py-1.5">
            <span className="text-sm text-ink">σ² / s²</span>
            <div className="flex gap-1 rounded bg-paper p-0.5">
              <button
                type="button"
                onClick={() => setVarianceKind("population")}
                className={
                  varianceKind === "population" ? "rounded bg-graph px-2 py-0.5 text-xs text-white" : "rounded px-2 py-0.5 text-xs text-muted"
                }
              >
                Poblac.
              </button>
              <button
                type="button"
                onClick={() => setVarianceKind("sample")}
                className={
                  varianceKind === "sample" ? "rounded bg-graph px-2 py-0.5 text-xs text-white" : "rounded px-2 py-0.5 text-xs text-muted"
                }
              >
                Muestral
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" className={btnPrimaryClass} onClick={() => runDescriptive("variance")}>σ²/s²</button>
            <button type="button" className={btnPrimaryClass} onClick={() => runDescriptive("stdev")}>σ/s</button>
          </div>
          <ResultPanel result={descriptiveResult} isLoading={descriptiveLoading} />
        </div>
      )}

      {subMode === "combinatorics" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <label className="flex-1 text-sm text-muted">
              n
              <input value={nStr} onChange={(e) => setNStr(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="flex-1 text-sm text-muted">
              r
              <input value={rStr} onChange={(e) => setRStr(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <button type="button" className={btnPrimaryClass} onClick={() => runCombinatorics("nCr")}>nCr</button>
            <button type="button" className={btnPrimaryClass} onClick={() => runCombinatorics("nPr")}>nPr</button>
            <button type="button" className={btnPrimaryClass} onClick={() => runCombinatorics("factorial")}>n!</button>
          </div>
          <ResultPanel result={combinatoricsResult} isLoading={combinatoricsLoading} />
        </div>
      )}

      {subMode === "distribution" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-paper-line p-1 text-sm">
            <button
              type="button"
              onClick={() => setDistribution("binomial")}
              className={distribution === "binomial" ? "flex-1 rounded-md bg-graph py-1.5 text-white" : "flex-1 rounded-md py-1.5 text-muted"}
            >
              Binomial
            </button>
            <button
              type="button"
              onClick={() => setDistribution("normal")}
              className={distribution === "normal" ? "flex-1 rounded-md bg-graph py-1.5 text-white" : "flex-1 rounded-md py-1.5 text-muted"}
            >
              Normal
            </button>
            {/* Módulo N0 (spec_graficacion_matrices_estadistica_unidades.md, sección 7). */}
            <button
              type="button"
              onClick={() => setDistribution("poisson")}
              className={distribution === "poisson" ? "flex-1 rounded-md bg-graph py-1.5 text-white" : "flex-1 rounded-md py-1.5 text-muted"}
            >
              Poisson
            </button>
            <button
              type="button"
              onClick={() => setDistribution("uniform")}
              className={distribution === "uniform" ? "flex-1 rounded-md bg-graph py-1.5 text-white" : "flex-1 rounded-md py-1.5 text-muted"}
            >
              Uniforme
            </button>
            <button
              type="button"
              onClick={() => setDistribution("exponential")}
              className={distribution === "exponential" ? "flex-1 rounded-md bg-graph py-1.5 text-white" : "flex-1 rounded-md py-1.5 text-muted"}
            >
              Exponencial
            </button>
          </div>

          {distribution === "binomial" && (
            <>
              <div className="flex gap-2">
                <label className="flex-1 text-sm text-muted">
                  n
                  <input value={binN} onChange={(e) => setBinN(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
                <label className="flex-1 text-sm text-muted">
                  p
                  <input value={binP} onChange={(e) => setBinP(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
                <label className="flex-1 text-sm text-muted">
                  k
                  <input value={binK} onChange={(e) => setBinK(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" className={btnClass} onClick={() => runBinomial("pmf")}>P(X=k)</button>
                <button type="button" className={btnClass} onClick={() => runBinomial("cdf")}>P(X≤k)</button>
                <button type="button" className={btnClass} onClick={() => runBinomial("survival")}>P(X≥k)</button>
                <button type="button" className={btnClass} onClick={() => runBinomial("mean")}>E[X]</button>
                <button type="button" className={`${btnClass} col-span-2`} onClick={() => runBinomial("variance")}>Var[X]</button>
              </div>
            </>
          )}
          {distribution === "normal" && (
            <>
              <div className="flex gap-2">
                <label className="flex-1 text-sm text-muted">
                  μ
                  <input value={mu} onChange={(e) => setMu(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
                <label className="flex-1 text-sm text-muted">
                  σ
                  <input value={sigma} onChange={(e) => setSigma(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
              </div>
              <label className="block text-sm text-muted">
                x
                <input value={normX} onChange={(e) => setNormX(e.target.value)} className={`${inputClass} mt-1`} />
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" className={btnClass} onClick={() => runNormal("cdf")}>P(X≤x)</button>
                <button type="button" className={btnClass} onClick={() => runNormal("zscore")}>z-score</button>
              </div>
              <div className="flex gap-2">
                <label className="flex-1 text-sm text-muted">
                  a
                  <input value={normA} onChange={(e) => setNormA(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
                <label className="flex-1 text-sm text-muted">
                  b
                  <input value={normB} onChange={(e) => setNormB(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
              </div>
              <button type="button" className={btnClass} onClick={() => runNormal("range")}>P(a≤X≤b)</button>
            </>
          )}
          {distribution === "poisson" && (
            <>
              <div className="flex gap-2">
                <label className="flex-1 text-sm text-muted">
                  λ
                  <input value={poissonLam} onChange={(e) => setPoissonLam(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
                <label className="flex-1 text-sm text-muted">
                  k
                  <input value={poissonK} onChange={(e) => setPoissonK(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" className={btnClass} onClick={() => runPoisson("pmf")}>P(X=k)</button>
                <button type="button" className={btnClass} onClick={() => runPoisson("cdf")}>P(X≤k)</button>
                <button type="button" className={btnClass} onClick={() => runPoisson("mean")}>E[X]</button>
                <button type="button" className={btnClass} onClick={() => runPoisson("variance")}>Var[X]</button>
              </div>
            </>
          )}
          {distribution === "uniform" && (
            <>
              <div className="flex gap-2">
                <label className="flex-1 text-sm text-muted">
                  a
                  <input value={uniformA} onChange={(e) => setUniformA(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
                <label className="flex-1 text-sm text-muted">
                  b
                  <input value={uniformB} onChange={(e) => setUniformB(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
                <label className="flex-1 text-sm text-muted">
                  x
                  <input value={uniformX} onChange={(e) => setUniformX(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" className={btnClass} onClick={() => runUniform("cdf")}>P(X≤x)</button>
                <button type="button" className={btnClass} onClick={() => runUniform("mean")}>E[X]</button>
                <button type="button" className={`${btnClass} col-span-2`} onClick={() => runUniform("variance")}>Var[X]</button>
              </div>
            </>
          )}
          {distribution === "exponential" && (
            <>
              <div className="flex gap-2">
                <label className="flex-1 text-sm text-muted">
                  λ
                  <input value={expLam} onChange={(e) => setExpLam(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
                <label className="flex-1 text-sm text-muted">
                  x
                  <input value={expX} onChange={(e) => setExpX(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" className={btnClass} onClick={() => runExponential("cdf")}>P(X≤x)</button>
                <button type="button" className={btnClass} onClick={() => runExponential("mean")}>E[X]</button>
                <button type="button" className={`${btnClass} col-span-2`} onClick={() => runExponential("variance")}>Var[X]</button>
              </div>
            </>
          )}
          <ResultPanel result={distributionResult} isLoading={distributionLoading} />
        </div>
      )}

      {subMode === "correlation" && (
        <div className="space-y-3">
          <label className="block text-sm text-muted">
            X (separados por coma)
            <input
              value={xRaw}
              onChange={(e) => setXRaw(e.target.value)}
              placeholder="1, 2, 3, 4"
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-sm text-muted">
            Y (separados por coma)
            <input
              value={yRaw}
              onChange={(e) => setYRaw(e.target.value)}
              placeholder="3, 5, 7, 9"
              className={`${inputClass} mt-1`}
            />
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" className={btnClass} onClick={() => runCorrelation("correlation")}>r</button>
            <button type="button" className={btnClass} onClick={() => runCorrelation("slope")}>Pendiente</button>
            <button type="button" className={btnClass} onClick={() => runCorrelation("intercept")}>Intercepto</button>
          </div>
          <ResultPanel result={correlationResult} isLoading={correlationLoading} />
        </div>
      )}
    </div>
  );
}
