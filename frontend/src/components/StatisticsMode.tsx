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

type SubMode = "descriptive" | "combinatorics" | "distribution";
type VarianceKind = "population" | "sample";
type Distribution = "binomial" | "normal";

const TABS: { id: SubMode; label: string }[] = [
  { id: "descriptive", label: "Descriptiva" },
  { id: "combinatorics", label: "Combinatoria" },
  { id: "distribution", label: "Distribución" },
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
  const [descriptiveResult, setDescriptiveResult] = useState<MathResponse | null>(null);
  const [descriptiveLoading, setDescriptiveLoading] = useState(false);

  async function runDescriptive(stat: string) {
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
        { values, stat, variance_kind: varianceKind },
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
          <div className="flex gap-1 rounded-lg border border-paper-line p-1 text-sm">
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
          </div>

          {distribution === "binomial" ? (
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
          ) : (
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
          <ResultPanel result={distributionResult} isLoading={distributionLoading} />
        </div>
      )}
    </div>
  );
}
