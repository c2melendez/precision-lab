/**
 * src/api/client.ts — cliente API centralizado (spec, sección 11).
 *
 * `AbortController` (~15s), validación OBLIGATORIA de `success`/
 * `error_code` en toda respuesta 2xx, whitelist de endpoints
 * (`KNOWN_ENDPOINTS`), y síntesis de un `MathResponse` de error para fallo
 * de red, timeout de cliente, o respuesta no-JSON (`INTERNAL_ERROR`,
 * `request_id` generado localmente si falta, `duration_ms` medido desde
 * el inicio de la llamada).
 */

import { isKnownEndpoint, type KnownEndpoint } from "./endpoints";
import type { components } from "../types/api";

export type MathResponse = components["schemas"]["MathResponse"];
export type OperationType = components["schemas"]["OperationType"];
export type ResultType = components["schemas"]["ResultType"];
export type EquationSolution = components["schemas"]["EquationSolution"];

const REQUEST_TIMEOUT_MS = 15_000;

const API_BASE_URL: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ??
  "http://localhost:8000";

// Mapeo endpoint -> OperationType, para poder sintetizar un MathResponse de
// error con un `operation` válido incluso cuando la respuesta real nunca
// llegó (fallo de red/timeout). Espejo intencional (y sincronizado
// manualmente, igual que KNOWN_ENDPOINTS) de `app/core/config.py:
// PATH_TO_OPERATION` en el backend — NO se genera automáticamente.
const ENDPOINT_TO_OPERATION: Record<KnownEndpoint, OperationType | null> = {
  "/health": null, // /health es la única excepción al contrato MathResponse (sección 4)
  "/evaluate": "evaluate",
  "/simplify": "simplify",
  "/factor": "factor",
  "/expand": "expand",
  "/solve": "solve",
  "/derivative": "derivative",
  "/integral": "integral",
  "/matrix/operations": "matrix_operation",
  "/matrix/determinant": "matrix_determinant",
  "/matrix/inverse": "matrix_inverse",
  "/matrix/transpose": "matrix_transpose",
  "/matrix/power": "matrix_power",
  "/matrix/ref": "matrix_ref",
  "/matrix/rref": "matrix_rref",
  "/graph/2d": "graph_2d",
  "/solve/system": "solve_system",
  "/inequality": "inequality",
  "/limit": "limit",
  "/series": "series",
  "/matrix/eigen": "matrix_eigen",
  "/integral/improper": "integral_improper",
  "/graph/3d": "graph_3d",
  "/graph/parametric": "graph_parametric",
  "/derivative/partial": "derivative_partial",
  "/derivative/implicit": "derivative_implicit",
  // P5 (spec v2 §6) — faltaba en el cierre original del Parche 5, mismo
  // motivo que en endpoints.ts.
  "/matrix/norm": "matrix_norm",
  // P6 (spec v2 §7)
  "/statistics/descriptive": "statistics_descriptive",
  "/statistics/combinatorics": "statistics_combinatorics",
  "/statistics/binomial": "statistics_binomial",
  "/statistics/normal": "statistics_normal",
};

function generateLocalRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function synthesizeErrorResponse(
  endpoint: KnownEndpoint,
  message: string,
  startTime: number,
): MathResponse {
  const operation = ENDPOINT_TO_OPERATION[endpoint];
  return {
    success: false,
    // "evaluate" como último recurso solo para /health (que no tiene una
    // OperationType real, sección 4) — nunca se expone como resultado
    // válido porque success siempre es false aquí. Decisión DEDUCIBLE
    // documentada en el cierre del Módulo 10.
    operation: operation ?? "evaluate",
    request_id: generateLocalRequestId(),
    steps: [],
    has_detailed_steps: false,
    warnings: [],
    error_code: "INTERNAL_ERROR",
    error_message: message,
    duration_ms: performance.now() - startTime,
  };
}

export class UnknownEndpointError extends Error {
  constructor(endpoint: string) {
    super(`Endpoint no reconocido (fuera de KNOWN_ENDPOINTS): '${endpoint}'.`);
    this.name = "UnknownEndpointError";
  }
}

function isValidMathResponseShape(body: unknown): body is MathResponse {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.success !== "boolean") return false;
  if (typeof candidate.request_id !== "string") return false;
  if (candidate.success === false && typeof candidate.error_code !== "string") return false;
  return true;
}

/**
 * Llama a un endpoint del backend. SIEMPRE resuelve (nunca rechaza) con un
 * `MathResponse` — los fallos de red/timeout/parseo se sintetizan como un
 * `MathResponse` de error, para que el resto de la app nunca tenga que
 * manejar dos formas distintas de fallo.
 *
 * Lanza `UnknownEndpointError` (síncrono, antes de cualquier fetch) si
 * `endpoint` no está en `KNOWN_ENDPOINTS` — un error de programación, no
 * un fallo de red, así que no se sintetiza como MathResponse.
 */
export async function callApi(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<MathResponse> {
  if (!isKnownEndpoint(endpoint)) {
    throw new UnknownEndpointError(endpoint);
  }

  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === "AbortError") {
      return synthesizeErrorResponse(
        endpoint,
        `La solicitud excedió el tiempo máximo de ${REQUEST_TIMEOUT_MS / 1000}s.`,
        startTime,
      );
    }
    return synthesizeErrorResponse(
      endpoint,
      "No se pudo conectar con el servidor (fallo de red).",
      startTime,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return synthesizeErrorResponse(
      endpoint,
      `El servidor respondió con contenido no-JSON (HTTP ${response.status}).`,
      startTime,
    );
  }

  if (!isValidMathResponseShape(body)) {
    return synthesizeErrorResponse(
      endpoint,
      "La respuesta del servidor no cumple el contrato MathResponse esperado.",
      startTime,
    );
  }

  return body;
}
