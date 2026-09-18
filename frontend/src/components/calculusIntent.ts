/**
 * src/components/calculusIntent.ts
 *
 * Fase 2 (fusión de modos, plan de 3 fases): detecta si el campo único de
 * BasicMode contiene una derivada o integral en notación natural, para
 * resolverla sin salir de la pantalla — mismo espíritu que systemSplit.ts
 * (Fase 1), y mismo diseño ya construido y verificado en Precision Lab
 * Lite (src/engine/parsing/calculusIntent.ts).
 *
 * =====================================================================
 * POR QUÉ ESTO TOCA UNA DECISIÓN DE SEGURIDAD, Y POR QUÉ SE HACE IGUAL
 * =====================================================================
 *
 * El backend tiene un validador de AST deliberado (`ast_validator.py`,
 * `BLOCKED_NODE_TYPES`) que rechaza `sympy.Derivative`, `sympy.Integral`,
 * `sympy.Sum`, `sympy.Product`, `sympy.Limit`, `sympy.Lambda` y
 * `sympy.MatrixBase` en CUALQUIER expresión que se parsee de forma
 * general (ej. lo que llega a /evaluate) — parte de un endurecimiento de
 * seguridad más amplio (también limita nodos, profundidad, dígitos y
 * exponentes; todo apunta a prevenir cómputo arbitrario/DoS vía SymPy).
 *
 * Por eso mismo, el ícono "derivada" del teclado (NaturalMathKeyboard.tsx)
 * NO inserta \frac{d}{dx}(...) en Básico — navega a DerivativeMode
 * (decisión "Fase 0 v2" de Carlos), y las teclas ∫/Lim se quitaron
 * directamente ("Fase 0 v2, Fase 10") porque en ese momento no había
 * forma segura de resolverlas inline ni un modo dedicado a donde
 * redirigir para integral.
 *
 * Este archivo NO reabre esa vulnerabilidad. La técnica es: reconocer la
 * notación en el CLIENTE, extraer la sub-expresión limpia (el argumento
 * de la derivada, el integrando) y mandar SOLO eso — nunca el string
 * "\frac{d}{dx}(...)" ni "\int...dx" completo — a los mismos endpoints
 * dedicados (/derivative, /integral) que ya usan con éxito
 * DerivativeMode.tsx e IntegralMode.tsx hoy. El validador de AST bloquea
 * Derivative/Integral cuando aparecen DENTRO de una expresión que se
 * parsea de forma general (ej. alguien escribiendo "Integral(x**2,x)" a
 * mano para colarlo por /evaluate) — nunca se le manda algo así. Es
 * exactamente el mismo patrón que ya usan los modos dedicados: la
 * "envoltura" (d/dx, ∫...dx) se interpreta y se descarta ANTES de tocar
 * la red; solo el contenido interno, ya limpio, llega al backend.
 *
 * Aun así, esto toca una decisión de seguridad con nombre y apellido
 * ("decisión de Carlos"). Se implementa porque así se pidió
 * explícitamente, dejando esta explicación para que el equipo (Carlos
 * incluido) lo revise antes de que se use en producción — no se está
 * dando por sentado que esto reemplaza esa revisión.
 *
 * LÍMITE: desde que existe `LimitMode.tsx` (verificado en vivo contra el
 * backend real: limit(1/x,x→∞)=0, limit((x²-4)/(x-2),x→2)=4,
 * limit(1/x,x→0⁺)=∞), sí se detecta acá — con una limitación real
 * encontrada al verificar: la notación lateral (\lim_{x\to0^+}) NO se
 * parsea de forma confiable en Compute Engine 0.58.0 (da
 * ["PseudoInverse",["Error",...]] para "+" y ["Superminus",0] para "-" —
 * básicamente basura, no una dirección). Por eso la detección natural
 * SOLO cubre límite finito y al infinito (ambos lados, "both") — límite
 * LATERAL sigue necesitando el formulario dedicado de `LimitMode.tsx`,
 * que tiene un selector explícito en vez de depender de esta notación.
 *
 * =====================================================================
 * DOS TÉCNICAS DISTINTAS (mismo motivo que en Lite, reverificado acá)
 * =====================================================================
 *
 * Derivada: escáner propio (regex + balanceo de \left/\right) sobre el
 * patrón EXACTO que inserta el ícono del teclado — NO usa Compute
 * Engine. Se reverificó contra la versión de @cortex-js/compute-engine
 * instalada en ESTE proyecto (0.58.0, más nueva que la 0.24.1 de Lite):
 * \frac{d}{dx}(x^2) ahora sí da un operador D limpio, pero
 * \frac{d^2}{dx^2}(x^3) (orden 2) sigue fallando — vuelve a tratar "d"
 * como variable común. La inconsistencia entre órdenes confirma que
 * apoyarse en el motor externo para derivada sería frágil y dependiente
 * de versión; el escáner propio no tiene ese problema porque no le
 * importa qué hay adentro del paréntesis, solo la forma exacta del
 * template.
 *
 * Integral y límite: sí se usa Compute Engine (reconocimiento confiable
 * y consistente para estos dos, en ambas versiones probadas), pero la
 * forma del MathJSON cambió entre versiones — acá integral es
 * ["Integrate", ["Function", ["Block", <cuerpo>], var], ["Limits", var, lowerOrNothing, upperOrNothing]]
 * y límite es
 * ["Limit", ["Function", ["Block", <cuerpo>], var], puntoONumeroOSímboloInfinito]
 * — el punto puede ser un número, o los símbolos "PositiveInfinity"/
 * "NegativeInfinity" (mapeados a "oo"/"-oo", que el backend ya acepta
 * como constantes — ver ALLOWED_CONSTANTS en parsing.py). Verificado
 * directo contra el paquete real antes de escribir este archivo, no
 * asumido por similitud con Lite.
 */

import { ComputeEngine } from "@cortex-js/compute-engine";

export type CalculusIntent =
  | { kind: "derivative"; variable: string; order: 1 | 2 | 3 | 4 | 5; innerLatex: string }
  | { kind: "integral"; variable: string; lowerBound: string | null; upperBound: string | null; innerLatex: string }
  | { kind: "limit"; variable: string; point: string; innerLatex: string; direction: "both" | "left" | "right" }
  | { kind: "ode"; cleanedExpression: string }
  | { kind: "residue"; expressionLatex: string; pointLatex: string }
  | { kind: "singularities"; expressionLatex: string };

// ---------------------------------------------------------------------
// Fase F (spec_edo_complejos_tooltips.md §3.2, Módulo F1/F2): Res/Sing.
// Igual que EDO, esto no pasa por parse_expression_tree con la sintaxis
// "z=punto" incluida -- se extrae acá y se manda estructurado (dos
// campos separados) al backend, ver complex_service.py.
// ---------------------------------------------------------------------

/** Scanner de paréntesis balanceados, igual criterio que
 * rewriteBinaryFunction (index.ts, Lite) -- necesario porque el cuerpo
 * de Res()/Sing() puede contener sus propias llamadas a función con
 * comas internas (ej. "root(z,3)"), así que un split ingenuo por "," se
 * confundiría. */
function splitTopLevelComma(text: string): [string, string | null] {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      return [text.slice(0, i), text.slice(i + 1)];
    }
  }
  return [text, null];
}

function detectResidue(latex: string): Extract<CalculusIntent, { kind: "residue" }> | null {
  const trimmed = latex.trim();
  const match = trimmed.match(/^\\mathrm\{Res\}\\left\((.*)\\right\)$/s);
  if (!match) return null;
  const [exprPart, rest] = splitTopLevelComma(match[1]);
  if (rest === null) return null;
  const pointMatch = rest.trim().match(/^z\s*=\s*(.+)$/);
  if (!pointMatch) return null;
  return { kind: "residue", expressionLatex: exprPart.trim(), pointLatex: pointMatch[1].trim() };
}

function detectSingularities(latex: string): Extract<CalculusIntent, { kind: "singularities" }> | null {
  const trimmed = latex.trim();
  const match = trimmed.match(/^\\mathrm\{Sing\}\\left\((.*)\\right\)$/s);
  if (!match) return null;
  return { kind: "singularities", expressionLatex: match[1].trim() };
}


// ---------------------------------------------------------------------
// EDO (Fase E, spec_edo_complejos_tooltips.md §2.2) — notación prima
// (y', y'', ...), DELIBERADAMENTE distinta de \frac{d}{dx} para no
// colisionar con detectDerivative (que exige ese prefijo LaTeX exacto,
// nunca presente en notación prima). Verificado con los casos de la
// sección "Tests" del Módulo E3: ninguna expresión con \frac{d}{dx}
// dispara detectODE (no contiene el token "y'"), y ninguna EDO en
// notación prima dispara detectDerivative (no empieza con \frac{d...).
//
// A diferencia de derivada/integral/límite, acá no hay "envoltura" que
// desenvolver: la EDO completa (incluida la condición inicial opcional
// en el mismo campo, separada por coma — spec 2.2) ES el contenido que
// se manda tal cual a /ode. El backend (ode_service._substitute_
// derivatives) es quien cuenta las primas dinámicamente para determinar
// el orden — este detector solo reconoce la FORMA (¿hay un token y'+
// seguido, en algún punto, de un '='?), no valida la ecuación.
// ---------------------------------------------------------------------

// \b antes de 'y' exige que sea un identificador de una sola letra (no
// el final de otro nombre, ej. "xy'" NO debe matchear "y'" como si xy
// fuera la variable — el signo de derivada debe pegar a una 'y' sola).
const ODE_PRIME_TOKEN = /(?:^|[^a-zA-Z])y'+/;

// Tecla "dy/dx" (spec 2.3: "notación alternativa, mismo intent que y'").
// \frac{dy}{dx} NUNCA matchea DERIVATIVE_PREFIX (ese exige numerador
// exactamente "d", no "dy" -- verificado arriba con los regex reales) así
// que no hay colisión. Se normaliza a "y'" ANTES de mandar al backend,
// que solo entiende notación prima (ode_service.py) -- el backend no
// necesita saber que existe esta forma alternativa.
const DY_DX_TOKEN = /\\frac\{dy\}\{dx\}/g;

function detectODE(latex: string): Extract<CalculusIntent, { kind: "ode" }> | null {
  const trimmed = latex.trim();
  if (trimmed.length === 0) return null;
  const normalized = trimmed.replace(DY_DX_TOKEN, "y'");
  if (!ODE_PRIME_TOKEN.test(normalized)) return null;
  if (!normalized.includes("=")) return null;
  return { kind: "ode", cleanedExpression: normalized };
}

// ---------------------------------------------------------------------
// Derivada (escáner propio — ver explicación arriba)
// ---------------------------------------------------------------------

// DerivativeRequest.order admite 1-5 en este backend (Lite solo admite
// 1-3) — el regex y la validación de rango reflejan eso.
const DERIVATIVE_PREFIX = /^\\frac\{d(?:\^\{?(\d)\}?)?\}\{d([a-zA-Z])(?:\^\{?(\d)\}?)?\}\\left\(/;

function findMatchingRightDelimiter(latex: string, fromIndex: number): number | null {
  let depth = 1;
  let i = fromIndex;
  while (i < latex.length) {
    if (latex.startsWith("\\left", i)) {
      depth++;
      i += 5;
      continue;
    }
    if (latex.startsWith("\\right", i)) {
      depth--;
      i += 6;
      if (depth === 0) return i + 1;
      continue;
    }
    i++;
  }
  return null;
}

/**
 * Exige que el template sea la expresión COMPLETA (ancla inicio y final)
 * — igual que en Lite, "2+\frac{d}{dx}(x^2)" NO matchea a propósito, para
 * no descartar el "2+" en silencio.
 */
function detectDerivative(latex: string): Extract<CalculusIntent, { kind: "derivative" }> | null {
  const trimmed = latex.trim();
  const m = DERIVATIVE_PREFIX.exec(trimmed);
  if (!m) return null;

  const orderRaw = m[1] ?? m[3];
  const order = orderRaw ? Number(orderRaw) : 1;
  if (order < 1 || order > 5) return null; // fuera de rango de DerivativeRequest.order

  const variable = m[2];
  const innerStart = m[0].length;
  const end = findMatchingRightDelimiter(trimmed, innerStart);
  if (end === null || end !== trimmed.length) return null;

  const innerLatex = trimmed.slice(innerStart, end - 7).trim();
  if (innerLatex.length === 0) return null;

  return { kind: "derivative", variable, order: order as 1 | 2 | 3 | 4 | 5, innerLatex };
}

// ---------------------------------------------------------------------
// Integral (Compute Engine, solo para reconocer la forma — ver
// explicación arriba sobre por qué esto no viola BLOCKED_NODE_TYPES)
// ---------------------------------------------------------------------

let ce: ComputeEngine | null = null;
function getComputeEngine(): ComputeEngine {
  if (!ce) ce = new ComputeEngine();
  return ce;
}

function detectIntegral(latex: string): Extract<CalculusIntent, { kind: "integral" }> | null {
  const trimmed = latex.trim();
  if (trimmed.length === 0) return null;

  let expr;
  try {
    expr = getComputeEngine().parse(trimmed);
  } catch {
    return null;
  }
  if (!expr || !Array.isArray(expr.json) || expr.json[0] !== "Integrate") return null;

  // ["Integrate", ["Function", ["Block", <cuerpo>], var], ["Limits", var, lowerOrNothing, upperOrNothing]]
  // Se navega solo por .json (no por .ops — la interfaz `Expression` de
  // esta versión de @cortex-js/compute-engine, 0.58.0, no expone
  // operandos como propiedad; se probó y confirmó contra el paquete
  // real, ver comentario de cabecera). Para volver a obtener LaTeX de un
  // fragmento de JSON se usa ce.box(fragment).latex.
  const [, fnJson, limitsJson] = expr.json;
  if (!Array.isArray(fnJson) || fnJson[0] !== "Function") return null;
  let bodyJson = fnJson[1];
  if (Array.isArray(bodyJson) && bodyJson[0] === "Block") bodyJson = bodyJson[1];

  const innerLatex = getComputeEngine().box(bodyJson).latex;
  if (!innerLatex) return null;

  if (!Array.isArray(limitsJson) || limitsJson[0] !== "Limits") return null;
  const [, variable, lower, upper] = limitsJson;
  if (typeof variable !== "string") return null;

  const lowerIsNothing = lower === "Nothing";
  const upperIsNothing = upper === "Nothing";
  if (lowerIsNothing !== upperIsNothing) return null; // deben ir juntos o ninguno

  if (lowerIsNothing) {
    return { kind: "integral", variable, lowerBound: null, upperBound: null, innerLatex };
  }
  if (typeof lower !== "number" || typeof upper !== "number") return null; // ej. límites simbólicos/infinito: fuera de alcance
  return { kind: "integral", variable, lowerBound: String(lower), upperBound: String(upper), innerLatex };
}

/**
 * Corrección post-auditoría (Módulo 7 del teclado / spec_motor_matematico_
 * pendiente.md — hallazgo de paridad Lite/Full, no cubierto por ningún
 * módulo previo): el límite lateral estaba disponible en Lite pero
 * deshabilitado acá porque Compute Engine 0.58.0 no parsea de forma
 * confiable la notación \lim_{x\to a^{+/-}} (ver comentario de cabecera).
 * En vez de depender de Compute Engine para ESTE caso, se usa un escáner
 * propio sobre el LaTeX crudo — mismo criterio que ya usa detectDerivative
 * arriba (evitar el motor externo cuando es frágil para un patrón
 * puntual) y mismo patrón de reconocimiento que normalize.ts en Lite.
 * Solo reconoce la forma EXACTA que inserta la tecla del teclado
 * (\lim_{#0\to#1^{#2}}#3) — cualquier otra forma de escribir un límite
 * lateral a mano sigue cayendo a "no reconocido" y el usuario puede usar
 * LimitMode.tsx, que siempre soportó dirección vía su propio selector.
 */
const LATERAL_LIMIT = /^\\lim_\{\s*([a-zA-Z])\s*\\to\s*(.+?)\s*\^\{\s*([+-])\s*\}\s*\}(.+)$/s;

function detectLateralLimit(latex: string): Extract<CalculusIntent, { kind: "limit" }> | null {
  const trimmed = latex.trim();
  const m = LATERAL_LIMIT.exec(trimmed);
  if (!m) return null;
  const [, variable, pointLatex, sign, innerLatex] = m;
  if (innerLatex.trim().length === 0) return null;

  // El punto puede venir como número, o como \infty (mismo criterio que
  // el resto de este archivo: "oo"/"-oo" ya aceptados por el backend).
  const pointTrimmed = pointLatex.trim();
  const point =
    pointTrimmed === "\\infty"
      ? "oo"
      : pointTrimmed === "-\\infty"
        ? "-oo"
        : pointTrimmed;

  return {
    kind: "limit",
    variable,
    point,
    innerLatex: innerLatex.trim(),
    direction: sign === "+" ? "right" : "left",
  };
}

function detectLimit(latex: string): Extract<CalculusIntent, { kind: "limit" }> | null {
  const trimmed = latex.trim();
  if (trimmed.length === 0) return null;

  const lateral = detectLateralLimit(trimmed);
  if (lateral) return lateral;

  let expr;
  try {
    expr = getComputeEngine().parse(trimmed);
  } catch {
    return null;
  }
  if (!expr || !Array.isArray(expr.json) || expr.json[0] !== "Limit") return null;

  // ["Limit", ["Function", ["Block", <cuerpo>], var], puntoONúmeroOSímboloInfinito]
  const [, fnJson, pointJson] = expr.json;
  if (!Array.isArray(fnJson) || fnJson[0] !== "Function") return null;
  let bodyJson = fnJson[1];
  if (Array.isArray(bodyJson) && bodyJson[0] === "Block") bodyJson = bodyJson[1];
  const variable = fnJson[2];
  if (typeof variable !== "string") return null;

  const innerLatex = getComputeEngine().box(bodyJson).latex;
  if (!innerLatex) return null;

  // Solo se acepta un punto finito (número) o infinito (símbolos
  // reconocidos) — cualquier otra forma (ej. la notación lateral rota,
  // ver comentario de cabecera) devuelve null y cae al flujo normal.
  let point: string;
  if (typeof pointJson === "number") {
    point = String(pointJson);
  } else if (pointJson === "PositiveInfinity") {
    point = "oo";
  } else if (pointJson === "NegativeInfinity") {
    point = "-oo";
  } else {
    return null;
  }

  return { kind: "limit", variable, point, innerLatex, direction: "both" };
}

/** Punto de entrada único del router (BasicMode.tsx). Derivada primero
 * (más barato, solo regex); integral y límite comparten el mismo motor
 * de reconocimiento (Compute Engine). */
export function detectCalculusIntent(latex: string): CalculusIntent | null {
  return (
    detectDerivative(latex) ??
    detectODE(latex) ??
    detectResidue(latex) ??
    detectSingularities(latex) ??
    detectIntegral(latex) ??
    detectLimit(latex)
  );
}
