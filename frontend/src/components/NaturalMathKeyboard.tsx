/**
 * src/components/NaturalMathKeyboard.tsx — teclado para NaturalMathField.
 * Inserta LaTeX vía `MathfieldElement.insert()` con plantillas `#0`/`#1`
 * (MathLive mueve el cursor ahí automáticamente).
 *
 * Fase A (spec UX estilo ClassCalc): reemplaza las capas SHIFT/ALPHA de
 * la Fase 1/2 por el patrón real de ClassCalc — rejilla base fija (más
 * usados) + pestañas Trig/Stat que abren un menú flotante con más
 * funciones (sin ocultar la rejilla base), placeholders de caja vacía □
 * en vez de letras, glifos matemáticos reales en cada tecla.
 *
 * Rediseño (pedido de Carlos, con capturas de referencia de ClassCalc,
 * idéntico al de precision-lab-lite/src/components/MathKeyboard.tsx):
 * - ∫/Σ/d/dx/Lim vuelven, ahora en una tira de Cálculo de 2 renglones
 *   debajo de los 3 íconos de resolución — antes se habían quitado
 *   ("Fase 0 v2, Fase 10") porque no había forma segura de resolverlas.
 *   Ahora SÍ hay: calculusIntent.ts (Fase 2) detecta derivada/integral
 *   en notación natural en Básico y manda solo la sub-expresión limpia a
 *   /derivative // /integral — por eso estas teclas ya no necesitan
 *   "onGoToDerivative" para funcionar ahí, a diferencia de antes.
 * - Límite YA es funcional para punto finito e infinito (patch de
 *   Carlos: LimitMode.tsx + detectLimit() en calculusIntent.ts, /limit
 *   ya funcionaba en el backend, solo faltaba el frontend). Lateral
 *   (x\to0^+/0^-) queda marcado `unavailable` — Compute Engine 0.58.0 da
 *   MathJSON sin sentido para esa notación (confirmado por el propio
 *   patch), detectLimit() devuelve null y cae al flujo normal, que el
 *   backend rechaza (Limit sigue bloqueado en ast_validator.py fuera de
 *   /limit) — mejor un aviso claro que ese error confuso. Para lateral,
 *   la única vía es el formulario dedicado LimitMode.tsx (sin pestaña
 *   visible, mismo criterio que Derivada/Integral/Ecuación/Sistema).
 * - ∬/∭ y variantes con límites de integración: quitadas, no solo
 *   visuales (decisión de Carlos).
 * - d²/dx² y órdenes mayores SÍ están cubiertas por calculusIntent
 *   (backend admite order 1-5) — la tecla de "orden n" inserta un "3"
 *   literal editable (no "n"), para no caer en silencio a orden 1 si el
 *   usuario no lo cambia (mismo criterio que en Lite).
 * - Se quita la pestaña "Alg": mod/GCD/LCM se reubican en "Stat".
 * - Multiplicación inserta \cdot (punto) en vez de \times.
 * - ÷ inserta directamente la plantilla de fracción.
 * - Se agrega un renglón de operadores relacionales (<, >, ≤, ≥).
 * - La tira de Cálculo solo tiene sentido donde el campo es "una
 *   expresión libre que puede llevar notación de cálculo" (Básico, vía
 *   calculusIntent) — en Gráfica/Sistema/etc. el campo tiene otro
 *   significado (y=f(x), una ecuación del sistema) y no aplica; se
 *   controla con la prop `showCalculusStrip` (default false).
 *
 * P3 (spec v2 §4, teclado redistribuido, migración completa) — mismo
 * cambio que en precision-lab-lite/.../MathKeyboard.tsx: BASE_GRID+
 * NUMPAD se reemplazan por CORE_GRID (núcleo fijo 7×4, §4.5) +
 * SYMBOLS_ROW_1/2 (dentro de la pestaña nueva "Símbolos", §4.4).
 * CATEGORY_MENUS gana "Logarítmicas"/"Constantes" (contenido AMBIGUO,
 * ver comentario junto a CATEGORY_MENUS) y "Trig" se renombra a
 * "Trigonométricas"; "Stat" se conserva temporalmente. CALCULUS_ROW_1
 * gana Π(unavailable)/LCM/GCD. CALCULUS_ROW_2 gana lim_{x→a}/lim_{x→∞}/
 * lim_{x→a±}, todas unavailable — AMBIGUO documentado junto a
 * CALCULUS_ROW_2: §4 exige "mismas teclas en ambos" pero este repo nunca
 * tuvo límite (decisión deliberada de arriba); se resuelve con el mismo
 * patrón unavailable que ya usa ∂/∂x, sin construir un motor de límites.
 */

import type { MathfieldElement } from "mathlive";
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { KeyGlyph, type Glyph, BOX } from "./KeyGlyph";
import { triggerKeyFeedback } from "../utils/keyFeedback";
import { useUIStore } from "../store/useUIStore";
import { useKeyboardPanelStore } from "../store/useKeyboardPanelStore";
import { useRecentKeysStore } from "../store/useRecentKeysStore";

/** Acción de long-press (Módulo 0) — mismo campo que en Lite (paridad),
 * ver comentario completo en MathKeyboard.tsx de precision-lab-lite. Sin
 * consumidores todavía en este archivo. */
export type KeySecondaryAction = { type: "glyph"; value: Glyph } | { type: "template"; latex: string };

export interface KeyDef {
  glyph: Glyph;
  insertLatex: string;
  ariaLabel: string;
  /** Sin cómputo real detrás (∂/∂x) — presionarla muestra un aviso en
   * vez de insertar algo que el backend no puede resolver. */
  unavailable?: boolean;
  /** Módulo 0: campo nuevo, opcional, sin consumidores todavía. */
  secondaryAction?: KeySecondaryAction;
  /** Fase H (spec_edo_complejos_tooltips.md §5.2, Módulo H0/H1): texto
   * del tooltip, DELIBERADAMENTE separado de `ariaLabel` -- decisión
   * confirmada por el usuario (no reutilizar ariaLabel), porque el
   * texto de accesibilidad debe seguir siendo corto ("menor que") y el
   * de tooltip puede ser una explicación ("compara si el valor de la
   * izquierda es menor que el de la derecha"). Opcional: una tecla sin
   * `description` simplemente no muestra tooltip (retrocompatible con
   * cualquier `key()` que no la pase todavía). */
  description?: string;
}

export const key = (
  glyph: Glyph,
  insertLatex: string,
  ariaLabel: string,
  unavailable?: boolean,
  secondaryAction?: KeySecondaryAction,
  description?: string,
): KeyDef => ({
  glyph,
  insertLatex,
  ariaLabel,
  unavailable,
  secondaryAction,
  description,
});

export { BOX };

// MÓDULO 1 (paridad con precision-lab-lite): CORE_GRID/RELATIONAL_ROW/
// SYMBOLS_ROW_2 se DEJAN INTACTOS aquí (no se borran) porque este mismo
// componente lo usa GraphMode.tsx (spec §11: "Gráficas sin tocar"),
// alcanzable y en producción — a diferencia de precision-lab-lite, donde
// los únicos otros consumidores eran código muerto. Se agrega un prop
// nuevo `hideCoreGrid` (default false): BasicMode lo activa para no
// duplicar lo que ahora vive en KeyboardBasicPanel/dock; GraphMode no lo
// pasa, así que sigue viendo exactamente el mismo teclado de siempre.


// ---- P3 (spec v2 §4.5): núcleo fijo, siempre visible, 7 columnas × 4
// filas. Reemplaza a BASE_GRID+NUMPAD. Mismas plantillas de inserción que
// antes — solo cambia posición/agrupación (§10: nada de lógica nueva
// aquí, salvo lo explícitamente permitido para límites laterales).
const CORE_GRID: KeyDef[][] = [
  [
    key("7", "7", "7"),
    key("8", "8", "8"),
    key("9", "9", "9"),
    key("sin", "\\sin\\left(#0\\right)", "seno"),
    key("log", "\\log\\left(#0\\right)", "logaritmo base 10"),
    key("(", "(", "paréntesis izquierdo"),
    key("×", "\\cdot", "multiplicar"),
  ],
  [
    key("4", "4", "4"),
    key("5", "5", "5"),
    key("6", "6", "6"),
    key("cos", "\\cos\\left(#0\\right)", "coseno"),
    key("ln", "\\ln\\left(#0\\right)", "logaritmo natural"),
    key(")", ")", "paréntesis derecho"),
    key("−", "-", "restar"),
  ],
  [
    key("1", "1", "1"),
    key("2", "2", "2"),
    key("3", "3", "3"),
    key("tan", "\\tan\\left(#0\\right)", "tangente"),
    key({ sub: BOX, base: "log" }, "\\log_{#0}\\left(#1\\right)", "logaritmo con base"),
    // Sin precedente en el motor (ni Algebrite ni SymPy) — plantilla
    // simple, mismo patrón que cualquier símbolo existente. Riesgo menor
    // documentado en el cierre del P3.
    key("±()", "\\pm\\left(#0\\right)", "más/menos"),
    key("+", "+", "sumar"),
  ],
  [
    key("0", "0", "0"),
    key(".", ".", "punto"),
    key("%", "\\%", "porcentaje"),
    key({ sup: "x", base: "e" }, "e^{#0}", "e a la x"),
    key("=", "=", "igual"),
    key("⏎", "", "calcular"),
    key("÷", "\\frac{#0}{#1}", "dividir"),
  ],
];

// ---- P3 (spec v2 §4.4): grid contextual bajo pestañas, dentro de la
// pestaña "Símbolos". Fila 1 sin cambios de contenido (ya insertaban lo
// mismo en la vieja BASE_GRID); fila 2 agrega "z" (variable nueva,
// inserción trivial igual que x/y) y ⌫ (reemplaza a ÷, que se mudó al
// núcleo).
const SYMBOLS_ROW_1: KeyDef[] = [
  key({ sup: "2", base: BOX }, "#0^2", "al cuadrado", false, undefined, "un valor multiplicado por sí mismo"),
  key({ sup: "y", base: BOX }, "#0^{#1}", "potencia general", false, undefined, "un valor elevado a cualquier exponente editable"),
  key({ sqrt: BOX }, "\\sqrt{#0}", "raíz cuadrada", false, undefined, "raíz cuadrada de un valor"),
  key({ sqrt: BOX, index: "3" }, "\\sqrt[3]{#0}", "raíz cúbica", false, undefined, "raíz de índice 3 de un valor"),
  key({ sup: "x", base: "10" }, "10^{#0}", "10 a la x", false, undefined, "10 elevado a un exponente"),
  key("exp", "\\exp\\left(#0\\right)", "exponencial", false, undefined, "e elevado al valor ingresado"),
  key("|x|", "\\left|#0\\right|", "valor absoluto", false, undefined, "distancia de un número a cero (siempre positiva)"),
  key("n!", "#0!", "factorial", false, undefined, "producto de todos los enteros positivos hasta n"),
  key("DEL", "", "borrar todo el campo", false, undefined, "borra todo lo escrito en el campo actual"),
];

// Módulo 3 (spec §5.2): para BasicMode (hideCoreGrid=true), x²/xʸ/√/∛/
// 10ˣ/exp/|x|/n! se reubican a Álgebra — SYMBOLS_ROW_1 completa queda
// SOLO para GraphMode (spec §11, sin tocar), que sigue viendo la fila de
// siempre. Mismo criterio que CORE_GRID en el Módulo 1: no se borra
// nada del archivo, se selecciona cuál fila renderizar según el modo.
const SYMBOLS_ROW_1_BASIC_MODE: KeyDef[] = [
  key("DEL", "", "borrar todo el campo", false, undefined, "borra todo lo escrito en el campo actual"),
];

const SYMBOLS_ROW_2: KeyDef[] = [
  key({ italic: "i" }, "i", "número imaginario", false, undefined, "unidad imaginaria (raíz cuadrada de -1)"),
  key("π", "\\pi", "pi", false, undefined, "constante pi (≈3.14159)"),
  key("e", "e", "e", false, undefined, "constante de Euler (≈2.71828)"),
  key("∞", "\\infty", "infinito", false, undefined, "símbolo de infinito, para límites y sumatorias"),
  key({ italic: "x" }, "x", "variable x", false, undefined, "variable x"),
  key({ italic: "y" }, "y", "variable y", false, undefined, "variable y"),
  key({ italic: "z" }, "z", "variable z", false, undefined, "variable z"),
  key("θ", "\\theta", "theta", false, undefined, "letra griega theta, usada para ángulos"),
  // Fase E (spec_edo_complejos_tooltips.md §2.3): prima suelta, sin
  // plantilla de argumento -- combinada con la 'y' de arriba (o
  // presionada varias veces) forma y'/y''/... que calculusIntent.ts
  // (detectODE) reconoce contando primas dinámicamente.
  key(
    "'",
    "'",
    "prima (derivada en notación de ecuaciones diferenciales)",
    false,
    undefined,
    "agrega una prima después de y para escribir una ecuación diferencial (y', y'', ...)",
  ),
  key("⌫", "", "borrar", false, undefined, "borra el último carácter escrito"),
];

/**
 * Fase X, Módulo X0 (spec_rediseno_visual.md sección 10 — Smart Docks):
 * clasificación DEDUCIBLE de "variable/constante" vs. "operación", para
 * separar las teclas en los dos historiales recientes. Se deriva de
 * `SYMBOLS_ROW_2` (única fila que ya agrupa exactamente ese conjunto —
 * i/π/e/∞/x/y/z/θ) en vez de mantener una lista aparte que pudiera
 * desincronizarse. Se identifica por `insertLatex` exacto (no por
 * glyph) porque es el campo estable entre invocaciones de `key()`.
 * Prima (') y ⌫ se excluyen a propósito: la prima es notación de
 * derivada, no una variable/constante, y ⌫ nunca llega a `press()`
 * (interceptada antes, en `pressSymbol`).
 */
const VARIABLE_CONSTANT_LATEX = new Set(
  SYMBOLS_ROW_2.filter((k) => k.insertLatex !== "'" && k.insertLatex !== "").map((k) => k.insertLatex),
);

export function isVariableOrConstantKey(k: KeyDef): boolean {
  return VARIABLE_CONSTANT_LATEX.has(k.insertLatex);
}

const RELATIONAL_ROW: KeyDef[] = [
  key("<", "<", "menor que"),
  key(">", ">", "mayor que"),
  key("≤", "\\le", "menor o igual que"),
  key("≥", "\\ge", "mayor o igual que"),
];

// ---- Tira de Cálculo (2 renglones). ∫/Σ/derivada resueltas de verdad
// vía calculusIntent.ts en Básico (o backend nativo para Σ/∫). Lim se
// agrega aquí SOLO como icono — Carlos está armando aparte el patch que
// las hace funcionales (no hay LimitMode ni detección de límite en
// calculusIntent.ts todavía, ver cabecera del archivo) — marcadas
// `unavailable` por honestidad mientras tanto: sin esto, presionarlas
// insertaría \lim_{...} que el backend rechaza (Limit sigue bloqueado en
// ast_validator.py) con un error confuso, no un aviso claro. Quitar el
// `unavailable`/agregar la 4ta insertLatex cuando ese patch aterrice. ----
// P3 §4.2: se agrega Π (sin cómputo real en ningún motor — unavailable,
// mismo patrón que ∂/∂x) y LCM/GCD, mudadas aquí desde el menú flotante
// "Stat".
const CALCULUS_ROW_1: KeyDef[] = [
  key("∫", "\\int #0\\,dx", "integral indefinida", false, undefined, "antiderivada de una expresión respecto a x"),
  key(
    { base: "∫", sub: BOX, sup: BOX },
    "\\int_{#0}^{#1}#2\\,dx",
    "integral definida",
    false,
    undefined,
    "área bajo la curva entre dos límites (edita los cuadros de límite inferior y superior)",
  ),
  key("Σ", "\\sum_{#0}^{#1}#2", "sumatoria", false, undefined, "suma de una expresión repetida según un índice, entre un valor inicial y uno final"),
  key("Π", "", "productoria", true),
  key(
    "LCM",
    "\\mathrm{lcm}\\left(#0,#1\\right)",
    "mínimo común múltiplo",
    false,
    undefined,
    "el menor número que es múltiplo de ambos valores a la vez",
  ),
  key(
    "GCD",
    "\\gcd\\left(#0,#1\\right)",
    "máximo común divisor",
    false,
    undefined,
    "el mayor número que divide a ambos valores sin dejar residuo",
  ),
];

// P3 §4.3: agrega un límite lateral COMBINADO lim_{x→a±} (tecla nueva).
// AJUSTE FRENTE AL PARCHE ORIGINAL (baseline desactualizado): este repo ya
// tenía lim_{x→a} y lim_{x→∞} con cómputo real (LimitMode + endpoint
// /limit, agregados después de que se generó este parche) — se conservan
// intactos, no se degradan a "unavailable". Las dos teclas laterales que
// SÍ estaban unavailable (x→a+ / x→a- por separado) se reemplazan por la
// única tecla combinada que pide la spec; sigue unavailable porque no hay
// soporte confirmado de sintaxis "±" en el parser de Python (el fix de
// normalize.ts de este parche solo se aplicó en Lite).
const CALCULUS_ROW_2: KeyDef[] = [
  key(
    { frac: ["d", "dx"] },
    "\\frac{d}{dx}\\left(#0\\right)",
    "derivada",
    false,
    undefined,
    "razón de cambio instantánea de una expresión respecto a x",
  ),
  key(
    { frac: ["d²", "dx²"] },
    "\\frac{d^2}{dx^2}\\left(#0\\right)",
    "derivada segunda",
    false,
    undefined,
    "derivada de la derivada -- mide cómo cambia la pendiente",
  ),
  key(
    { frac: ["dⁿ", "dxⁿ"] },
    "\\frac{d^3}{dx^3}\\left(#0\\right)",
    "derivada de orden n (edita el 3 por el orden que quieras, hasta 5)",
    false,
    undefined,
    "deriva la expresión repetidamente -- edita el número de orden en la plantilla",
  ),
  key({ frac: ["∂", "∂x"] }, "", "derivada parcial", true),
  key(
    { base: "lim", sub: "x→a" },
    "\\lim_{#0\\to#1}#2",
    "límite",
    false,
    undefined,
    "valor al que se aproxima una expresión cuando la variable se acerca a un punto",
  ),
  key(
    { base: "lim", sub: "x→∞" },
    "\\lim_{#0\\to\\infty}#1",
    "límite al infinito",
    false,
    undefined,
    "valor al que se aproxima una expresión cuando la variable crece sin límite",
  ),
  // Corrección post-auditoría (hallazgo de paridad Lite/Full): ya no
  // `unavailable` — calculusIntent.ts ahora reconoce esta notación con un
  // escáner propio (ver detectLateralLimit), mismo template que Lite.
  key(
    { base: "lim", sub: "x→a±" },
    "\\lim_{#0\\to#1^{#2}}#3",
    "límite lateral (edita + o - en el exponente)",
    false,
    undefined,
    "límite acercándose solo por la derecha (+) o solo por la izquierda (-) de un punto",
  ),
];

// Decisión final de Carlos (post-P6/P7): "Logarítmicas" y "Constantes" se
// eliminan (accesos duplicados a botones que ya existen en el núcleo/
// Símbolos). "Stat" también se elimina: ya existe el modo Estadística
// completo (P6), sus teclas son redundantes.
// Fase H (spec_edo_complejos_tooltips.md §5.1/5.3, Módulo H1): texto de
// tooltip para las funciones trigonométricas generadas por .map() abajo
// -- una sola entrada por nombre de función cubre las 3 filas (directa/
// inversa/hiperbólica), el sufijo se arma en el propio .map().
const TRIG_DESCRIPTIONS: Record<string, string> = {
  sin: "seno de un ángulo",
  cos: "coseno de un ángulo",
  tan: "tangente de un ángulo",
  csc: "cosecante de un ángulo (recíproco del seno)",
  sec: "secante de un ángulo (recíproco del coseno)",
  cot: "cotangente de un ángulo (recíproco de la tangente)",
  sinh: "seno hiperbólico",
  cosh: "coseno hiperbólico",
  tanh: "tangente hiperbólica",
  csch: "cosecante hiperbólica",
  sech: "secante hiperbólica",
  coth: "cotangente hiperbólica",
};

const CATEGORY_MENUS: Record<string, { section: string; keys: KeyDef[] }[]> = {
  Trigonométricas: [
    {
      section: "Directas",
      keys: ["sin", "cos", "tan", "csc", "sec", "cot"].map((f) =>
        key(f, `\\${f}\\left(#0\\right)`, f, false, undefined, TRIG_DESCRIPTIONS[f]),
      ),
    },
    {
      section: "Inversas",
      keys: ["sin", "cos", "tan", "csc", "sec", "cot"].map((f) =>
        key(
          { sup: "-1", base: f },
          `\\${f}^{-1}\\left(#0\\right)`,
          `${f} inversa`,
          false,
          undefined,
          `función inversa de la ${TRIG_DESCRIPTIONS[f]} -- da el ángulo cuyo/a ${f} es el valor ingresado`,
        ),
      ),
    },
    {
      section: "Hiperbólicas",
      keys: ["sinh", "cosh", "tanh", "csch", "sech", "coth"].map((f) =>
        key(f, `${f}\\left(#0\\right)`, f, false, undefined, TRIG_DESCRIPTIONS[f]),
      ),
    },
    // Módulo A (spec_motor_matematico_pendiente.md §2, activación pedida
    // por el usuario): las 6 ya están en ALLOWED_FUNCTIONS del backend
    // (agregado en el cierre del Módulo A, verificado con ejecución real
    // en Python). Lo que NO pude verificar acá (nivel 3, sin mathlive
    // real instalado en este entorno): qué texto ASCII exacto produce
    // `convertLatexToAsciiMath` para "sinh^{-1}(...)" — no hay ninguna
    // capa de conversión propia para esto en NaturalMathField.tsx (grep
    // confirmado, cero coincidencias de "^{-1}" ahí). Activo las 6 con el
    // mismo criterio que ya usa "Inversas" (sin⁻¹ etc., que sí está en
    // producción sin conversión propia) — mismo mecanismo, mismo nivel de
    // riesgo heredado, no uno nuevo que yo introduzca.
    {
      section: "Hiperbólicas inversas",
      keys: ["sinh", "cosh", "tanh", "csch", "sech", "coth"].map((f) =>
        key(
          { sup: "-1", base: f },
          `${f}^{-1}\\left(#0\\right)`,
          `${f} inversa`,
          false,
          undefined,
          `función inversa de la ${TRIG_DESCRIPTIONS[f]}`,
        ),
      ),
    },
  ],
};

// "Símbolos" no usa el formato de secciones agrupadas (arriba) — spec
// §4.4 la define como 2 filas planas de 9 columnas (SYMBOLS_ROW_1/2),
// con su propio render especial (ver JSX más abajo).
//
// P4 (spec v2 §5, Complejos): pestaña nueva. |z| reutiliza LITERALMENTE
// la misma plantilla que |x| (SYMBOLS_ROW_1) — no se duplica la tecla.
// "⇄ Polar" inserta topolar(#0) — ver comentario junto a "topolar" en
// backend/app/services/parsing.py sobre el riesgo no verificado
// empíricamente en este entorno.
CATEGORY_MENUS.Complejos = [
  {
    section: "Funciones",
    keys: [
      key("Re()", "\\mathrm{re}\\left(#0\\right)", "parte real", false, undefined, "componente real de un número complejo"),
      key("Im()", "\\mathrm{im}\\left(#0\\right)", "parte imaginaria", false, undefined, "componente imaginaria de un número complejo"),
      key("arg()", "\\mathrm{arg}\\left(#0\\right)", "argumento", false, undefined, "ángulo del número complejo respecto al eje real positivo"),
      key("conj()", "\\mathrm{conj}\\left(#0\\right)", "conjugado", false, undefined, "el mismo número complejo con la parte imaginaria de signo opuesto"),
      key("|z|", "\\left|#0\\right|", "módulo", false, undefined, "distancia del número complejo al origen"),
      key(
        "⇄ Polar",
        "\\mathrm{topolar}\\left(#0\\right)",
        "convertir a forma polar",
        false,
        undefined,
        "reescribe el número complejo como módulo y ángulo en vez de parte real e imaginaria",
      ),
    ],
  },
  // Fase F (spec_edo_complejos_tooltips.md §3.3, Módulo F2): sección
  // nueva, "Funciones" arriba queda intacta (spec 3.1, "no tocar").
  // Log/zⁿ/ⁿ√z/Res/Sing: todas verificadas y activas (F0/F1, ejecución
  // real). "Graficar" queda unavailable -- acción pendiente de F3
  // (cambio de contrato Trace.type), que todavía no corrió.
  {
    section: "Avanzado",
    keys: [
      key(
        "Log(z)",
        "\\mathrm{log}\\left(#0\\right)",
        "logaritmo complejo (rama principal)",
        false,
        undefined,
        "extensión del logaritmo a números complejos -- usa el módulo y el argumento del número",
      ),
      key({ sup: "n", base: "z" }, "#0^{#1}", "potencia compleja", false, undefined, "un número complejo elevado a cualquier exponente"),
      key(
        { sqrt: "z", index: "n" },
        "\\mathrm{root}\\left(#0,#1\\right)",
        "raíz n-ésima compleja (rama principal)",
        false,
        undefined,
        "raíz de cualquier índice de un número complejo -- edita el número (base) y el índice (n)",
      ),
      key(
        "cosθ+i·sinθ",
        "\\cos\\left(\\theta\\right)+i\\cdot\\sin\\left(\\theta\\right)",
        "identidad de Euler expandida",
        false,
        undefined,
        "plantilla de referencia: forma trigonométrica de un número complejo de módulo 1",
      ),
      key(
        "r·e^{iθ}",
        "#0\\cdot e^{i\\cdot#1}",
        "forma polar de un número complejo",
        false,
        undefined,
        "escribe un número complejo a partir de su módulo (r) y su ángulo (θ)",
      ),
      key(
        { sup: "iθ", base: "e" },
        "e^{i\\theta}",
        "exponencial compleja",
        false,
        undefined,
        "forma exponencial de un número complejo de módulo 1 (equivalente a cosθ+i·sinθ)",
      ),
      key(
        "Res(□,z=□)",
        "\\mathrm{Res}\\left(#0,z=#1\\right)",
        "residuo en un polo (funciones racionales)",
        false,
        undefined,
        "coeficiente clave del comportamiento de una función racional cerca de un polo -- edita la expresión y el punto z",
      ),
      key(
        "Sing(□)",
        "\\mathrm{Sing}\\left(#0\\right)",
        "singularidades (funciones racionales)",
        false,
        undefined,
        "lista los puntos donde una función racional no está definida",
      ),
      key(
        "Graficar",
        "",
        "graficar en el plano de Argand",
        false,
        undefined,
        "muestra el número complejo ya evaluado como un punto en el plano (eje real / eje imaginario)",
      ),
    ],
  },
];

// Módulo 3 (spec §5.2 / log §3.2 y §5): categoría Álgebra, 5 secciones —
// reemplaza a la pestaña temporal "Funciones" del Módulo 1. Mismo
// contenido y misma colocación provisional de ±() que en Lite (paridad
// obligatoria) — ver el comentario completo en MathKeyboard.tsx de ese
// repo. Diferencia real: aquí NO verifiqué la conversión LaTeX→backend
// de \log_{2}(...) con ejecución real (no hay mathlive/compute-engine
// instalados, y convertLatexToAsciiMath es una caja negra de esa
// librería) — pero \log_{#0}\left(#1\right) (log con base variable) ya
// existía en el código ANTES de este módulo (vivía en CORE_GRID), así
// que log₂ hereda el mismo camino de conversión que ya estaba en
// producción, con una base fija "2" en vez de un placeholder editable —
// no es un riesgo nuevo introducido por este módulo.
CATEGORY_MENUS.Álgebra = [
  {
    section: "Logaritmos",
    keys: [
      key("ln", "\\ln\\left(#0\\right)", "logaritmo natural", false, undefined, "logaritmo en base e (≈2.718)"),
      key("log", "\\log\\left(#0\\right)", "logaritmo base 10", false, undefined, "logaritmo en base 10"),
      key(
        { sub: BOX, base: "log" },
        "\\log_{#0}\\left(#1\\right)",
        "logaritmo con base",
        false,
        undefined,
        "logaritmo con una base elegida por vos (edita el subíndice)",
      ),
      key("log₂", "\\log_{2}\\left(#0\\right)", "logaritmo base 2", false, undefined, "logaritmo en base 2"),
    ],
  },
  {
    section: "Exponenciales",
    keys: [
      key({ sup: "n", base: "e" }, "e^{#0}", "e a la n", false, undefined, "el número e elevado a un exponente"),
      key({ sup: "n", base: "10" }, "10^{#0}", "10 a la n", false, undefined, "10 elevado a un exponente"),
      key({ sup: "2", base: BOX }, "#0^2", "a al cuadrado", false, undefined, "un valor multiplicado por sí mismo"),
      key({ sup: "n", base: BOX }, "#0^{#1}", "a a la n", false, undefined, "un valor elevado a cualquier exponente editable"),
      key("exp", "\\exp\\left(#0\\right)", "exponencial", false, undefined, "e elevado al valor ingresado (equivalente a e^x)"),
    ],
  },
  {
    section: "Radicales",
    keys: [
      key({ sqrt: BOX }, "\\sqrt{#0}", "raíz cuadrada de a", false, undefined, "raíz cuadrada de un valor"),
      key(
        { sqrt: BOX, index: BOX },
        "\\sqrt[#0]{#1}",
        "raíz de índice n editable",
        false,
        undefined,
        "raíz de cualquier índice (edita el índice pequeño de la esquina)",
      ),
    ],
  },
  {
    section: "Generales",
    keys: [
      key("|a|", "\\left|#0\\right|", "valor absoluto de a", false, undefined, "distancia de un número a cero (siempre positiva)"),
      key("a!", "#0!", "factorial de a", false, undefined, "producto de todos los enteros positivos hasta a"),
    ],
  },
  {
    // Renderizado aparte — ver "openCategory === Álgebra" en el JSX.
    section: "Ecuaciones",
    keys: [],
  },
];

// Fase E (spec_edo_complejos_tooltips.md §2.3): sección nueva dentro de
// Cálculo, NO una pestaña nueva. Auditoría real (Módulo E1) confirmó que
// SymPy dsolve() resuelve los 3 casos -- separable/lineal 1er orden,
// homogénea y no homogénea de 2º orden con coef. constantes -- así que
// las 3 plantillas de ecuación se montan ACTIVAS (no unavailable) en
// este repo: "teclas activas coinciden exactamente con lo que el motor
// puede resolver verificado", spec sección 7. y(□)=□ y dy/dx no dependen
// de ningún caso específico (la primera es solo una condición inicial en
// texto, la segunda es notación alternativa), también activas.
const ODE_ROW: KeyDef[] = [
  key(
    "y'=□",
    "y'=#0",
    "ecuación diferencial de primer orden",
    false,
    undefined,
    "relaciona la razón de cambio de y con x -- se resuelve integrando",
  ),
  key(
    "y''+ay'+by=0",
    "y''+#0\\cdot y'+#1\\cdot y=0",
    "ecuación diferencial lineal homogénea de segundo orden",
    false,
    undefined,
    "ecuación con segunda derivada y coeficientes constantes, igualada a cero",
  ),
  key(
    "y''+ay'+by=c",
    "y''+#0\\cdot y'+#1\\cdot y=#2",
    "ecuación diferencial lineal no homogénea de segundo orden",
    false,
    undefined,
    "igual que la anterior, pero igualada a un valor constante c en vez de cero",
  ),
  key(
    "y(a)=b",
    "y(#0)=#1",
    "condición inicial (se escribe junto a la ecuación diferencial)",
    false,
    undefined,
    "fija el valor de y en un punto específico, separada de la ecuación por una coma",
  ),
  key(
    "dy/dx",
    "\\frac{dy}{dx}",
    "notación alternativa de derivada para ecuaciones diferenciales",
    false,
    undefined,
    "otra forma de escribir y' (misma derivada de y respecto a x)",
  ),
];

// Módulo 4 (spec §5.3 / log §3.3): categoría Cálculo, 4 secciones — todo
// contenido YA existente (CALCULUS_ROW_1/2), solo reagrupado como
// pestaña propia. Mismas teclas, sin reescribir plantillas. LCM/GCD NO
// se repiten aquí (ya viven en Álgebra > Ecuaciones, Módulo 3).
CATEGORY_MENUS.Cálculo = [
  { section: "Integrales", keys: CALCULUS_ROW_1.slice(0, 2) },
  { section: "Sumas y productos", keys: CALCULUS_ROW_1.slice(2, 4) },
  { section: "Derivadas", keys: CALCULUS_ROW_2.slice(0, 4) },
  { section: "Límites", keys: CALCULUS_ROW_2.slice(4, 7) },
  // Fase E: 5ª sección, spec 2.3 ("NO es una pestaña nueva").
  { section: "Ecuaciones diferenciales", keys: ODE_ROW },
];

const CATEGORIES_FULL = ["Trigonométricas", "Símbolos", "Complejos"] as const;
const CATEGORIES_BASIC_MODE = ["Símbolos", "Álgebra", "Trigonométricas", "Cálculo", "Complejos"] as const;

interface NaturalMathKeyboardProps {
  field: MathfieldElement | null;
  onSubmit?: () => void;
  onClearField?: () => void;
  onSolveEquation?: () => void;
  /** Pendiente #2 (revisión post-Módulo D): recibe la cantidad de
   * ecuaciones elegida en el selector 2-5 que se abre al tocar
   * "Sistema" (mismo criterio que Lite, paridad). */
  onSolveSystem?: (rows?: number) => void;
  onSimplify?: () => void;
  // Fase F (spec_edo_complejos_tooltips.md §3.4, Módulo F3): "Graficar"
  // es una acción sobre el resultado ya evaluado, no una plantilla --
  // mismo patrón ya establecido acá para "=" (onSubmit) y "f(x)=0"
  // (onSolveEquation): glyph reservado + insertLatex vacío, interceptado
  // en press() antes de la inserción genérica.
  onGraphComplex?: () => void;
  /** Fase 0 v2 (decisión de Carlos), ya no necesaria para la tira de
   * Cálculo (ver cabecera del archivo) — se deja como prop opcional por
   * si algún consumidor todavía la usa. */
  onGoToDerivative?: () => void;
  /** La tira de Cálculo solo tiene sentido donde el campo es una
   * expresión libre resuelta vía calculusIntent (Básico). Default false. */
  showCalculusStrip?: boolean;
  /** Módulo 1: true para BasicMode — oculta CORE_GRID/RELATIONAL_ROW/
   * SYMBOLS_ROW_2 (ya viven en KeyboardBasicPanel, dentro del dock) y
   * agrega la pestaña temporal "Funciones". Default false — GraphMode
   * (spec §11, sin tocar) no lo pasa, ve el teclado completo de siempre. */
  hideCoreGrid?: boolean;
}

/** Cuántas filas puede pedir el selector de "Sistema" — spec §6 (5×5 ya
 * verificado en el Módulo B del motor). Paridad con Lite. */
const SYSTEM_ROW_OPTIONS = [2, 3, 4, 5];

export function NaturalMathKeyboard({
  field,
  onSubmit,
  onClearField,
  onSolveEquation,
  onSolveSystem,
  onSimplify,
  onGraphComplex,
  onGoToDerivative: _onGoToDerivative,
  showCalculusStrip = false,
  hideCoreGrid = false,
}: NaturalMathKeyboardProps) {
  const CATEGORIES = hideCoreGrid ? CATEGORIES_BASIC_MODE : CATEGORIES_FULL;
  const [openCategory, setOpenCategory] = useState<(typeof CATEGORIES)[number] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Pendiente #2: menú chico "¿cuántas ecuaciones?" al tocar "Sistema".
  const [showSystemSizeMenu, setShowSystemSizeMenu] = useState(false);

  // Fase X, Módulo X0 (Smart Docks) — alcance confirmado por Carlos:
  // separado por modo (Científica/Matrices/Estadística/etc.).
  const activeMode = useUIStore((s) => s.activeMode);
  const recordKey = useRecentKeysStore((s) => s.recordKey);

  function press(k: KeyDef): void {
    if (k.unavailable) {
      setNotice(`${k.ariaLabel}: todavía no disponible.`);
      window.setTimeout(() => setNotice(null), 2500);
      return;
    }
    // Fase F (Módulo F3): mismo patrón que "=" (onSubmit) más abajo en
    // pressBase -- glyph reservado + insertLatex vacío, interceptado
    // ANTES de la inserción genérica.
    if (k.glyph === "Graficar" && k.insertLatex === "") return onGraphComplex?.();
    field?.focus();
    if (k.insertLatex) {
      field?.insert(k.insertLatex);
      // Fase X, Módulo X0: solo se registran teclas que insertan
      // contenido real (excluye "=", "f(x)=0", DEL/⌫, "Graficar" —
      // todas con insertLatex vacío o interceptadas antes de llegar
      // aquí) — no tiene sentido "reusar" una acción de UI desde el
      // dock de recientes.
      recordKey(activeMode, k, isVariableOrConstantKey(k) ? "variable" : "operation");
    }
    setOpenCategory(null);
  }

  // Fase X, Módulo X0: registra `press` como el manejador de inserción
  // del modo activo, para que RecentKeysBar.tsx (montado aparte, sin
  // acceso a `field`/handlers de este modo) pueda reinsertar una tecla
  // reciente. PATRÓN OBLIGATORIO (ver cabecera de useKeyboardPanelStore.ts):
  // efecto separado del de limpieza, para no cerrar nada mientras se
  // escribe (mismo bug ya documentado con `content`/`compactActions`).
  const setInsertHandler = useKeyboardPanelStore((s) => s.setInsertHandler);
  useEffect(() => {
    setInsertHandler(press);
  });
  const clearInsertHandler = useKeyboardPanelStore((s) => s.clearInsertHandler);
  useEffect(() => {
    return () => clearInsertHandler();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  function pressBase(k: KeyDef): void {
    if (k.glyph === "=" && k.insertLatex === "") return onSubmit?.();
    if (k.glyph === "f(x)=0") return onSolveEquation ? onSolveEquation() : press(k);
    press(k);
  }

  // P3 §4.4: DEL/⌫ viven ahora dentro del flyout "Símbolos", no en la
  // rejilla siempre visible — dispatcher análogo a pressBase.
  function pressSymbol(k: KeyDef): void {
    if (k.glyph === "⌫") {
      field?.focus();
      field?.executeCommand("deleteBackward");
      return;
    }
    if (k.glyph === "DEL") return onClearField?.();
    press(k);
  }

  // Fase V, Módulo V0: un solo punto de entrada por delegación de
  // eventos en vez de tocar cada `onClick={() => press(k)}` (hay más de
  // 10 en este archivo, repartidos en pressBase/pressSymbol/onClick
  // directos) — cualquier botón dentro del teclado dispara el feedback,
  // sin depender de qué función de despacho use cada uno.
  function handleKeyboardClickCapture(e: ReactMouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) triggerKeyFeedback();
  }

  return (
    <div className="relative rounded-xl bg-chrome p-3" onClickCapture={handleKeyboardClickCapture}>
      {notice && (
        <div className="absolute bottom-full left-3 right-3 mb-1.5 rounded-lg bg-chrome-soft px-3 py-2 text-center text-xs text-bone shadow-lg">
          {notice}
        </div>
      )}

      {openCategory && (
        <div className="absolute bottom-full left-3 right-3 mb-1.5 rounded-lg bg-chrome-soft p-3 shadow-lg">
          {openCategory === "Símbolos" ? (
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-9 gap-1">
                {(hideCoreGrid ? SYMBOLS_ROW_1_BASIC_MODE : SYMBOLS_ROW_1).map((k, i) => (
                  <button
                    key={`sym1-${i}`}
                    type="button"
                    onClick={() => pressSymbol(k)}
                    aria-label={k.ariaLabel}
                    title={k.description}
                    className="rounded-md bg-chrome py-2 text-[11px] text-bone hover:bg-chrome/70"
                  >
                    <KeyGlyph glyph={k.glyph} />
                  </button>
                ))}
              </div>
              {/* SYMBOLS_ROW_2 solo cuando NO se ocultó el núcleo — en
                  BasicMode ya no tiene contenido relevante (todo
                  reubicado al panel básico, Módulo 1). */}
              {!hideCoreGrid && (
                <div className="grid grid-cols-9 gap-1">
                  {SYMBOLS_ROW_2.map((k, i) => (
                    <button
                      key={`sym2-${i}`}
                      type="button"
                      onClick={() => pressSymbol(k)}
                      aria-label={k.ariaLabel}
                    title={k.description}
                      className="rounded-md bg-chrome py-2 text-[11px] text-bone hover:bg-chrome/70"
                    >
                      <KeyGlyph glyph={k.glyph} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            CATEGORY_MENUS[openCategory].map((group) =>
              group.section === "Ecuaciones" ? (
                <div key={group.section} className="mb-2 last:mb-0">
                  <div className="mb-1.5 text-[9px] uppercase tracking-wide text-bone/50">{group.section}</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onSolveEquation?.();
                        setOpenCategory(null);
                      }}
                      aria-label="Resolver ecuación"
                      className="rounded-md bg-marker-soft/10 py-2 text-xs text-marker hover:bg-marker-soft/20"
                    >
                      f(x)=0
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSolveEquation?.();
                        setOpenCategory(null);
                      }}
                      aria-label="Resolver inecuación"
                      className="rounded-md bg-marker-soft/10 py-2 text-xs text-marker hover:bg-marker-soft/20"
                    >
                      f(x)&gt;0
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenCategory(null);
                        setShowSystemSizeMenu(true);
                      }}
                      aria-label="Resolver sistema de ecuaciones"
                      className="rounded-md bg-alpha-soft py-2 text-xs text-alpha hover:bg-alpha-soft/80"
                    >
                      Sistema
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Corrección post-auditoría (Módulo C): BasicMode.tsx
                        // ya detecta solo si un \begin{cases} es de ecuaciones
                        // o de inecuaciones (ver submitSystem) — esta tecla usa
                        // la MISMA plantilla/selector que "Sistema", solo con
                        // un rótulo que deja claro que también acepta <, >, ≤, ≥.
                        setOpenCategory(null);
                        setShowSystemSizeMenu(true);
                      }}
                      aria-label="Sistema de inecuaciones de 2 variables — escribe inecuaciones dentro de las llaves"
                      className="relative rounded-md bg-alpha-soft py-2 text-[10px] text-alpha hover:bg-alpha-soft/80"
                    >
                      Sist. inecuaciones
                      {/* Módulo de cierre (honestidad de alcance): el motor
                          (linear_inequality_system.py) solo resuelve EXACTAMENTE
                          2 variables — este botón es funcional (no unavailable),
                          pero no comunicaba esa limitación real antes de tocarlo. */}
                      <span className="absolute -bottom-1 right-1 rounded-sm bg-alpha/20 px-1 text-[7px] font-medium leading-tight text-alpha">
                        2 var.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSimplify?.();
                        setOpenCategory(null);
                      }}
                      aria-label="Simplificar expresión"
                      className="rounded-md bg-graph/15 py-2 text-xs text-graph hover:bg-graph/25"
                    >
                      a+a → 2a
                    </button>
                    <button
                      type="button"
                      onClick={() => press(key("LCM", "\\mathrm{lcm}\\left(#0,#1\\right)", "mínimo común múltiplo"))}
                      aria-label="Mínimo común múltiplo"
                      className="rounded-md border border-marker bg-marker-soft/10 py-2 text-xs font-medium text-marker hover:bg-marker-soft/20"
                    >
                      LCM
                    </button>
                    <button
                      type="button"
                      onClick={() => press(key("GCD", "\\gcd\\left(#0,#1\\right)", "máximo común divisor"))}
                      aria-label="Máximo común divisor"
                      className="rounded-md border border-marker bg-marker-soft/10 py-2 text-xs font-medium text-marker hover:bg-marker-soft/20"
                    >
                      GCD
                    </button>
                  </div>
                </div>
              ) : (
                <div key={group.section} className="mb-2 last:mb-0">
                  <div className="mb-1.5 text-[9px] uppercase tracking-wide text-bone/50">{group.section}</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {group.keys.map((k, i) => (
                      <button
                        key={`${group.section}-${i}`}
                        type="button"
                        onClick={() => press(k)}
                        aria-label={k.ariaLabel}
                    title={k.description}
                        className={
                          // Módulo de cierre (honestidad visual): mismo patrón
                          // gris/borde punteado que ya usa KeyboardBasicPanel.tsx
                          // (este mismo repo) para "°" — antes esta tecla se
                          // veía idéntica a una activa aunque k.unavailable
                          // fuera true.
                          k.unavailable
                            ? "rounded-md border border-dashed border-bone/30 bg-chrome-soft/40 py-2 text-sm text-bone/40"
                            : "rounded-md bg-marker-soft/10 py-2 text-sm text-marker hover:bg-marker-soft/20"
                        }
                      >
                        <KeyGlyph glyph={k.glyph} />
                      </button>
                    ))}
                  </div>
                </div>
              ),
            )
          )}
        </div>
      )}

      <div className="relative mb-1.5 grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={onSolveEquation}
          aria-label="Resolver ecuación"
          className="rounded-md bg-marker-soft/15 py-2 text-[11px] font-medium text-marker hover:bg-marker-soft/25"
        >
          f(x)=0
        </button>
        <button
          type="button"
          onClick={() => setShowSystemSizeMenu((v) => !v)}
          aria-expanded={showSystemSizeMenu}
          aria-label="Resolver sistema de ecuaciones — elegir cantidad"
          className="flex items-center justify-center gap-1 rounded-md bg-alpha-soft py-2 text-[10px] font-medium text-alpha hover:bg-alpha-soft/80"
        >
          <span className="text-base font-light">{"{"}</span>
          <span className="text-left leading-tight">
            f(x)=0
            <br />
            g(x)=0
          </span>
        </button>
        {showSystemSizeMenu && (
          <div className="absolute left-1/3 top-full z-10 mt-1 flex gap-1 rounded-md bg-chrome-soft p-1.5 shadow-lg">
            <span className="self-center px-1 text-[10px] text-bone/60">Ecuaciones:</span>
            {SYSTEM_ROW_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  onSolveSystem?.(n);
                  setShowSystemSizeMenu(false);
                }}
                aria-label={`Sistema de ${n} ecuaciones`}
                className="h-6 w-6 rounded bg-alpha-soft text-xs font-medium text-alpha hover:bg-alpha-soft/70"
              >
                {n}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onSimplify}
          aria-label="Simplificar expresión"
          className="rounded-md bg-graph/15 py-2 text-[11px] font-medium text-graph hover:bg-graph/25"
        >
          a+a → 2a
        </button>
      </div>

      {/* Módulo 4: además de showCalculusStrip (ya existía, GraphMode
          nunca lo pasa), ahora también se apaga con hideCoreGrid=true
          (BasicMode) — su contenido (menos LCM/GCD, ya en Álgebra >
          Ecuaciones) vive en la pestaña "Cálculo" nueva. */}
      {showCalculusStrip && !hideCoreGrid && (
        <div className="relative mb-1.5 rounded-lg bg-chrome-soft/60 p-1.5">
          <div className="mb-1 grid grid-cols-6 gap-1">
            {CALCULUS_ROW_1.map((k, i) => (
              <button
                key={i}
                type="button"
                onClick={() => press(k)}
                aria-label={k.ariaLabel}
                    title={k.description}
                className={
                  k.unavailable
                    ? "rounded-md bg-chrome-soft py-1.5 text-[11px] text-bone/40 hover:bg-chrome-soft/70"
                    : ["LCM", "GCD"].includes(String(k.glyph))
                      ? "rounded-md border border-marker bg-chrome-soft py-1.5 text-[11px] font-medium text-marker hover:bg-chrome-soft/70"
                      : "rounded-md bg-chrome-soft py-1.5 text-[11px] text-bone hover:bg-chrome-soft/70"
                }
              >
                <KeyGlyph glyph={k.glyph} />
              </button>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {CALCULUS_ROW_2.map((k, i) => (
              <button
                key={i}
                type="button"
                onClick={() => press(k)}
                aria-label={k.ariaLabel}
                    title={k.description}
                className={
                  k.unavailable
                    ? "rounded-md bg-chrome-soft py-1.5 text-[10px] text-bone/40 hover:bg-chrome-soft/70"
                    : "rounded-md bg-chrome-soft py-1.5 text-[10px] text-bone hover:bg-chrome-soft/70"
                }
              >
                <KeyGlyph glyph={k.glyph} />
              </button>
            ))}
          </div>
          {onClearField && (
            <button
              type="button"
              onClick={onClearField}
              aria-label="Borrar todo el campo"
              title="Borrar todo"
              className="absolute -right-1 -top-1 rounded-md bg-chrome p-1.5 text-bone/70 hover:text-bone"
            >
              🗑
            </button>
          )}
        </div>
      )}

      <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1 px-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setOpenCategory((c) => (c === cat ? null : cat))}
            aria-expanded={openCategory === cat}
            className={openCategory === cat ? "text-xs font-semibold text-marker" : "text-xs text-bone/70"}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Núcleo fijo + relacionales — ocultos cuando hideCoreGrid=true
          (BasicMode: viven en KeyboardBasicPanel/dock). GraphMode nunca
          pasa este prop, así que sigue viendo exactamente esto. */}
      {!hideCoreGrid && (
        <>
          {CORE_GRID.map((row, i) => (
            <div key={i} className="mb-1.5 grid grid-cols-7 gap-1">
              {row.map((k, j) => {
                const glyphStr = String(k.glyph);
                const isDigit = /^[0-9.%]$/.test(glyphStr);
                const isOperator = ["×", "−", "+", "÷"].includes(glyphStr);
                const isEquals = glyphStr === "=";
                const isEnter = glyphStr === "⏎";
                const className = isEnter
                  ? "rounded-md bg-graph py-2.5 text-sm font-semibold text-paper hover:bg-graph/90"
                  : isEquals
                    ? "rounded-md border border-marker py-2.5 text-sm font-medium text-marker hover:bg-marker-soft/10"
                    : isOperator
                      ? "rounded-md bg-marker py-2.5 text-base font-semibold text-chrome hover:bg-marker/90"
                      : isDigit
                        ? "rounded-md bg-chrome-soft/80 py-2.5 text-sm font-medium text-bone hover:bg-chrome-soft/60"
                        : "rounded-md bg-chrome-soft py-2.5 text-[11px] text-marker hover:bg-chrome-soft/70";
                return (
                  <button key={j} type="button" onClick={() => pressBase(k)} aria-label={k.ariaLabel}
                    title={k.description} className={className}>
                    <KeyGlyph glyph={k.glyph} />
                  </button>
                );
              })}
            </div>
          ))}

          <div className="grid grid-cols-4 gap-1">
            {RELATIONAL_ROW.map((k, i) => (
              <button
                key={i}
                type="button"
                onClick={() => press(k)}
                aria-label={k.ariaLabel}
                    title={k.description}
                className="rounded-md bg-paper-soft py-1.5 text-sm text-ink hover:bg-paper-line/60"
              >
                <KeyGlyph glyph={k.glyph} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
