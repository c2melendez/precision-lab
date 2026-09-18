/**
 * src/api/endpoints.ts — whitelist de endpoints (spec, sección 11).
 *
 * Sincronizada MANUALMENTE con el backend (Módulos 1-9) — no se genera
 * automáticamente. Cada entrada de `KNOWN_ENDPOINTS` es una ruta relativa a
 * `VITE_API_BASE_URL` (que ya incluye el prefijo `/api/v1`, sección 9).
 *
 * Confirmado contra el OpenAPI real del backend en ejecución (Módulo 10):
 * 22 endpoints — 12 de Fase 1 (incluye /health) + 10 de Fase 2 (Módulos 1-9).
 * P5 agregó /matrix/norm (23). P6 agregó las 4 rutas de /statistics/* (27)
 * — no re-verificado contra un backend en ejecución real en este entorno,
 * ver cierre de esos parches.
 */

export const KNOWN_ENDPOINTS = [
  // --- Fase 1 ---
  "/health",
  "/evaluate",
  "/simplify",
  "/factor",
  "/expand",
  "/solve",
  "/derivative",
  "/integral",
  "/matrix/operations",
  "/matrix/determinant",
  "/matrix/inverse",
  "/matrix/transpose",
  "/matrix/power",
  // --- Fase C (spec UX estilo ClassCalc §4) ---
  "/matrix/ref",
  "/matrix/rref",
  // P5 (spec v2 §6) — faltaba en el cierre original del Parche 5, la
  // agrego ahora al notar que esta whitelist es mantenida a mano (no
  // autogenerada, a diferencia de types/api.ts) y sí puedo/debo tocarla
  // yo mismo.
  "/matrix/norm",
  // Módulo L0 (spec_graficacion_matrices_estadistica_unidades.md, sección 5).
  "/matrix/trace",
  "/matrix/rank",
  "/graph/2d",
  // --- Fase 2 (passthrough trivial real o UNSUPPORTED_IN_PHASE_1) ---
  "/solve/system",
  "/inequality",
  // Corrección post-auditoría (Módulo C): el endpoint ya existía en el
  // backend (router phase2.py) pero faltaba en esta whitelist mantenida a
  // mano — sin esto, callApi() lo hubiera rechazado en runtime aunque el
  // resto del wiring de BasicMode.tsx estuviera correcto.
  "/inequality/system",
  "/limit",
  "/series",
  "/matrix/eigen",
  "/integral/improper",
  "/graph/3d",
  "/graph/parametric",
  // Módulo I0 (spec_graficacion_matrices_estadistica_unidades.md, Fase I).
  "/graph/polar",
  "/derivative/partial",
  "/derivative/implicit",
  // P6 (spec v2 §7)
  "/statistics/descriptive",
  // Módulo M1 (spec_graficacion_matrices_estadistica_unidades.md, sección 6.2).
  "/statistics/correlation",
  "/statistics/combinatorics",
  "/statistics/binomial",
  // Módulo N0 (spec_graficacion_matrices_estadistica_unidades.md, sección 7).
  "/statistics/poisson",
  "/statistics/uniform",
  "/statistics/exponential",
  "/statistics/normal",
  // Fase E (spec_edo_complejos_tooltips.md §2, Módulo E1/E3): whitelist
  // mantenida a mano (ver cabecera del archivo) -- sin esta línea,
  // callApi() habría rechazado /ode en runtime pese a que el router
  // (routers/ode.py) y el wiring de BasicMode.tsx ya estaban completos.
  // Encontrado con tsc real (TS2345), no solo por inspección.
  "/ode",
  // Fase F (Módulo F1): mismo criterio que /ode.
  "/complex/residue",
  "/complex/singularities",
  "/graph/complex_point",
] as const;

export type KnownEndpoint = (typeof KNOWN_ENDPOINTS)[number];

export function isKnownEndpoint(path: string): path is KnownEndpoint {
  return (KNOWN_ENDPOINTS as readonly string[]).includes(path);
}
