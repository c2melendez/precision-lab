/**
 * src/components/MatrixMode.tsx — modo Matrices (spec, sección 11):
 * selector de dimensión NxM para A y B, inputs de texto con validación,
 * conectado a `POST /matrix/operations`.
 */

import { useState, type FormEvent } from "react";

import type { MathResponse } from "../api/client";
import { submitAndRecord } from "../api/submitWithHistory";
import { useUIStore } from "../store/useUIStore";
import { ResultPanel } from "./ResultPanel";

type Operation =
  | "add"
  | "subtract"
  | "multiply"
  | "kronecker"
  | "transpose"
  | "determinant"
  | "inverse"
  | "power"
  | "eigen"
  | "ref"
  | "rref"
  | "dot"
  | "cross"
  | "norm";

const OPERATION_LABELS: Record<Operation, string> = {
  add: "Suma (A + B)",
  subtract: "Resta (A − B)",
  multiply: "Multiplicación (A × B)",
  kronecker: "Kronecker (A ⊗ B)",
  transpose: "Transposición (Aᵀ)",
  determinant: "Determinante (|A|)",
  inverse: "Inversa (A⁻¹)",
  power: "Potencia (Aⁿ)",
  eigen: "Eigenvalores y eigenvectores",
  ref: "Forma escalonada (ref)",
  rref: "Forma escalonada reducida (rref)",
  // P5 (spec v2 §6): A y B son vectores (matriz 1xn o nx1) en estas 3.
  dot: "Producto punto (A · B)",
  cross: "Producto cruz (A ⨯ B)",
  norm: "Norma / magnitud (‖A‖)",
};

const NEEDS_MATRIX_B: ReadonlySet<Operation> = new Set(["add", "subtract", "multiply", "kronecker", "dot", "cross"]);
const NEEDS_EXPONENT: ReadonlySet<Operation> = new Set(["power"]);

function emptyMatrix(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

function resizeMatrix(matrix: string[][], rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => matrix[r]?.[c] ?? ""),
  );
}

interface MatrixGridProps {
  label: string;
  matrix: string[][];
  rows: number;
  cols: number;
  onDimensionsChange: (rows: number, cols: number) => void;
  onCellChange: (row: number, col: number, value: string) => void;
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      {label}
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        aria-label={`Reducir ${label}`}
        className="h-5 w-5 rounded-full bg-paper-line/60 text-ink hover:bg-paper-line"
      >
        −
      </button>
      <span className="w-4 text-center font-mono text-ink">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(6, value + 1))}
        aria-label={`Aumentar ${label}`}
        className="h-5 w-5 rounded-full bg-paper-line/60 text-ink hover:bg-paper-line"
      >
        +
      </button>
    </label>
  );
}

function MatrixGrid({
  label,
  matrix,
  rows,
  cols,
  onDimensionsChange,
  onCellChange,
}: MatrixGridProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">{label}</span>
        <Stepper label="Filas" value={rows} onChange={(n) => onDimensionsChange(n, cols)} />
        <Stepper label="Col" value={cols} onChange={(n) => onDimensionsChange(rows, n)} />
      </div>
      <div
        role="group"
        aria-label={`Celdas de ${label}`}
        className="inline-grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {matrix.map((row, r) =>
          row.map((cell, c) => (
            <input
              key={`${r}-${c}`}
              aria-label={`${label} celda fila ${r + 1} columna ${c + 1}`}
              value={cell}
              onChange={(e) => onCellChange(r, c, e.target.value)}
              className="w-14 rounded border border-paper-line bg-paper-soft px-1 py-1 text-center text-sm"
            />
          )),
        )}
      </div>
    </div>
  );
}

export function MatrixMode() {
  const [operation, setOperation] = useState<Operation>("add");
  const [rowsA, setRowsA] = useState(2);
  const [colsA, setColsA] = useState(2);
  const [matrixA, setMatrixA] = useState<string[][]>(emptyMatrix(2, 2));
  const [rowsB, setRowsB] = useState(2);
  const [colsB, setColsB] = useState(2);
  const [matrixB, setMatrixB] = useState<string[][]>(emptyMatrix(2, 2));
  const [exponent, setExponent] = useState("2");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<MathResponse | null>(null);

  const setLoading = useUIStore((state) => state.setLoading);
  const setErrorMessage = useUIStore((state) => state.setErrorMessage);
  const isLoading = useUIStore((state) => state.isLoading);

  function handleDimensionsA(rows: number, cols: number): void {
    setRowsA(rows);
    setColsA(cols);
    setMatrixA((current) => resizeMatrix(current, rows, cols));
  }

  function handleDimensionsB(rows: number, cols: number): void {
    setRowsB(rows);
    setColsB(cols);
    setMatrixB((current) => resizeMatrix(current, rows, cols));
  }

  function hasEmptyCell(matrix: string[][]): boolean {
    return matrix.some((row) => row.some((cell) => cell.trim() === ""));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (hasEmptyCell(matrixA)) {
      setValidationError("Todas las celdas de la matriz A deben tener un valor.");
      return;
    }
    if (NEEDS_MATRIX_B.has(operation) && hasEmptyCell(matrixB)) {
      setValidationError("Todas las celdas de la matriz B deben tener un valor.");
      return;
    }
    if (NEEDS_EXPONENT.has(operation) && (exponent.trim() === "" || !/^-?\d+$/.test(exponent.trim()))) {
      setValidationError("El exponente debe ser un número entero.");
      return;
    }
    setValidationError(null);

    setLoading(true);
    setErrorMessage(null);
    try {
      let result: MathResponse;
      const label = `Matriz A ${rowsA}x${colsA} — ${OPERATION_LABELS[operation]}`;

      if (
        operation === "add" ||
        operation === "subtract" ||
        operation === "multiply" ||
        operation === "kronecker" ||
        operation === "dot" ||
        operation === "cross"
      ) {
        result = await submitAndRecord(
          "/matrix/operations",
          { operation, matrix_a: matrixA, matrix_b: matrixB },
          `Matrices ${rowsA}x${colsA} ${operation} ${rowsB}x${colsB}`,
        );
      } else if (operation === "transpose") {
        result = await submitAndRecord("/matrix/transpose", { matrix: matrixA }, label);
      } else if (operation === "determinant") {
        result = await submitAndRecord("/matrix/determinant", { matrix: matrixA }, label);
      } else if (operation === "inverse") {
        result = await submitAndRecord("/matrix/inverse", { matrix: matrixA }, label);
      } else if (operation === "ref") {
        result = await submitAndRecord("/matrix/ref", { matrix: matrixA }, label);
      } else if (operation === "rref") {
        result = await submitAndRecord("/matrix/rref", { matrix: matrixA }, label);
      } else if (operation === "norm") {
        result = await submitAndRecord("/matrix/norm", { matrix: matrixA }, label);
      } else if (operation === "power") {
        result = await submitAndRecord(
          "/matrix/power",
          { matrix: matrixA, exponent: Number(exponent) },
          `${label} (n=${exponent})`,
        );
      } else {
        result = await submitAndRecord("/matrix/eigen", { matrix: matrixA }, label);
      }

      setLastResult(result);
      if (!result.success) {
        setErrorMessage(result.error_message ?? "Ocurrió un error.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-labelledby="matrix-mode-heading" className="rounded-lg border border-paper-line p-5 shadow-sm lg:grid lg:max-w-4xl lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-6 dt:mx-auto dt:gap-10">
      <div className="space-y-4 lg:col-start-1">
        <h2 id="matrix-mode-heading" className="text-sm font-medium text-muted">
          Matrices
        </h2>

        <div className="space-y-1">
          <label htmlFor="matrix-operation" className="block text-sm text-muted">
            Operación
          </label>
          <select
            id="matrix-operation"
            value={operation}
            onChange={(e) => setOperation(e.target.value as Operation)}
            className="rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
          >
            {(Object.keys(OPERATION_LABELS) as Operation[]).map((op) => (
              <option key={op} value={op}>
                {OPERATION_LABELS[op]}
              </option>
            ))}
          </select>
        </div>

        <MatrixGrid
          label="Matriz A"
          matrix={matrixA}
          rows={rowsA}
          cols={colsA}
          onDimensionsChange={handleDimensionsA}
          onCellChange={(r, c, value) =>
            setMatrixA((current) =>
              current.map((row, i) =>
                i === r ? row.map((cell, j) => (j === c ? value : cell)) : row,
              ),
            )
          }
        />

        {NEEDS_EXPONENT.has(operation) && (
          <div className="space-y-1">
            <label htmlFor="matrix-exponent" className="block text-sm text-muted">
              Exponente (entero, de -10 a 10)
            </label>
            <input
              id="matrix-exponent"
              type="text"
              inputMode="numeric"
              value={exponent}
              onChange={(e) => setExponent(e.target.value)}
              className="w-24 rounded border border-paper-line bg-paper-soft px-2 py-1 text-sm"
            />
          </div>
        )}

        {NEEDS_MATRIX_B.has(operation) && (
          <MatrixGrid
            label="Matriz B"
            matrix={matrixB}
            rows={rowsB}
            cols={colsB}
            onDimensionsChange={handleDimensionsB}
            onCellChange={(r, c, value) =>
              setMatrixB((current) =>
                current.map((row, i) =>
                  i === r ? row.map((cell, j) => (j === c ? value : cell)) : row,
                ),
              )
            }
          />
        )}

        {validationError && (
          <p role="alert" className="text-sm text-red-600">
            {validationError}
          </p>
        )}

        <button
          type="submit"
          className="rounded bg-graph px-4 py-2 text-sm font-medium text-white hover:bg-graph/90"
        >
          Calcular
        </button>
      </div>

      <div className="mt-4 lg:col-start-2 lg:mt-0">
        <div className="rounded-xl bg-paper-soft px-4 py-3 shadow-inner shadow-black/10">
          <ResultPanel result={lastResult} isLoading={isLoading} />
        </div>
      </div>
    </form>
  );
}
