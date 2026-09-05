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
import { useState } from "react";
import { KeyGlyph, type Glyph, BOX } from "./KeyGlyph";

interface KeyDef {
  glyph: Glyph;
  insertLatex: string;
  ariaLabel: string;
  /** Sin cómputo real detrás (∂/∂x) — presionarla muestra un aviso en
   * vez de insertar algo que el backend no puede resolver. */
  unavailable?: boolean;
}

const key = (glyph: Glyph, insertLatex: string, ariaLabel: string, unavailable?: boolean): KeyDef => ({
  glyph,
  insertLatex,
  ariaLabel,
  unavailable,
});

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
  key({ sup: "2", base: BOX }, "#0^2", "al cuadrado"),
  key({ sup: "y", base: BOX }, "#0^{#1}", "potencia general"),
  key({ sqrt: BOX }, "\\sqrt{#0}", "raíz cuadrada"),
  key({ sqrt: BOX, index: "3" }, "\\sqrt[3]{#0}", "raíz cúbica"),
  key({ sup: "x", base: "10" }, "10^{#0}", "10 a la x"),
  key("exp", "\\exp\\left(#0\\right)", "exponencial"),
  key("|x|", "\\left|#0\\right|", "valor absoluto"),
  key("n!", "#0!", "factorial"),
  key("DEL", "", "borrar todo el campo"),
];

const SYMBOLS_ROW_2: KeyDef[] = [
  key({ italic: "i" }, "i", "número imaginario"),
  key("π", "\\pi", "pi"),
  key("e", "e", "e"),
  key("∞", "\\infty", "infinito"),
  key({ italic: "x" }, "x", "variable x"),
  key({ italic: "y" }, "y", "variable y"),
  key({ italic: "z" }, "z", "variable z"),
  key("θ", "\\theta", "theta"),
  key("⌫", "", "borrar"),
];

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
  key("∫", "\\int #0\\,dx", "integral indefinida"),
  key({ base: "∫", sub: BOX, sup: BOX }, "\\int_{#0}^{#1}#2\\,dx", "integral definida"),
  key("Σ", "\\sum_{#0}^{#1}#2", "sumatoria"),
  key("Π", "", "productoria", true),
  key("LCM", "\\mathrm{lcm}\\left(#0,#1\\right)", "mínimo común múltiplo"),
  key("GCD", "\\gcd\\left(#0,#1\\right)", "máximo común divisor"),
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
  key({ frac: ["d", "dx"] }, "\\frac{d}{dx}\\left(#0\\right)", "derivada"),
  key({ frac: ["d²", "dx²"] }, "\\frac{d^2}{dx^2}\\left(#0\\right)", "derivada segunda"),
  key({ frac: ["dⁿ", "dxⁿ"] }, "\\frac{d^3}{dx^3}\\left(#0\\right)", "derivada de orden n (edita el 3 por el orden que quieras, hasta 5)"),
  key({ frac: ["∂", "∂x"] }, "", "derivada parcial", true),
  key({ base: "lim", sub: "x→a" }, "\\lim_{#0\\to#1}#2", "límite"),
  key({ base: "lim", sub: "x→∞" }, "\\lim_{#0\\to\\infty}#1", "límite al infinito"),
  key({ base: "lim", sub: "x→a±" }, "", "límite lateral (todavía no disponible en este backend)", true),
];

// Decisión final de Carlos (post-P6/P7): "Logarítmicas" y "Constantes" se
// eliminan (accesos duplicados a botones que ya existen en el núcleo/
// Símbolos). "Stat" también se elimina: ya existe el modo Estadística
// completo (P6), sus teclas son redundantes.
const CATEGORY_MENUS: Record<string, { section: string; keys: KeyDef[] }[]> = {
  Trigonométricas: [
    { section: "Directas", keys: ["sin", "cos", "tan", "csc", "sec", "cot"].map((f) => key(f, `\\${f}\\left(#0\\right)`, f)) },
    {
      section: "Inversas",
      keys: ["sin", "cos", "tan", "csc", "sec", "cot"].map((f) =>
        key({ sup: "-1", base: f }, `\\${f}^{-1}\\left(#0\\right)`, `${f} inversa`),
      ),
    },
    {
      section: "Hiperbólicas",
      keys: ["sinh", "cosh", "tanh", "csch", "sech", "coth"].map((f) => key(f, `${f}\\left(#0\\right)`, f)),
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
      key("Re()", "\\mathrm{re}\\left(#0\\right)", "parte real"),
      key("Im()", "\\mathrm{im}\\left(#0\\right)", "parte imaginaria"),
      key("arg()", "\\mathrm{arg}\\left(#0\\right)", "argumento"),
      key("conj()", "\\mathrm{conj}\\left(#0\\right)", "conjugado"),
      key("|z|", "\\left|#0\\right|", "módulo"),
      key("⇄ Polar", "\\mathrm{topolar}\\left(#0\\right)", "convertir a forma polar"),
    ],
  },
];

const CATEGORIES = ["Trigonométricas", "Símbolos", "Complejos"] as const;

interface NaturalMathKeyboardProps {
  field: MathfieldElement | null;
  onSubmit?: () => void;
  onClearField?: () => void;
  onSolveEquation?: () => void;
  onSolveSystem?: () => void;
  onSimplify?: () => void;
  /** Fase 0 v2 (decisión de Carlos), ya no necesaria para la tira de
   * Cálculo (ver cabecera del archivo) — se deja como prop opcional por
   * si algún consumidor todavía la usa. */
  onGoToDerivative?: () => void;
  /** La tira de Cálculo solo tiene sentido donde el campo es una
   * expresión libre resuelta vía calculusIntent (Básico). Default false. */
  showCalculusStrip?: boolean;
}

export function NaturalMathKeyboard({
  field,
  onSubmit,
  onClearField,
  onSolveEquation,
  onSolveSystem,
  onSimplify,
  onGoToDerivative: _onGoToDerivative,
  showCalculusStrip = false,
}: NaturalMathKeyboardProps) {
  const [openCategory, setOpenCategory] = useState<(typeof CATEGORIES)[number] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function press(k: KeyDef): void {
    if (k.unavailable) {
      setNotice(`${k.ariaLabel}: todavía no disponible.`);
      window.setTimeout(() => setNotice(null), 2500);
      return;
    }
    field?.focus();
    if (k.insertLatex) field?.insert(k.insertLatex);
    setOpenCategory(null);
  }

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

  return (
    <div className="relative rounded-xl bg-chrome p-3">
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
                {SYMBOLS_ROW_1.map((k, i) => (
                  <button
                    key={`sym1-${i}`}
                    type="button"
                    onClick={() => pressSymbol(k)}
                    aria-label={k.ariaLabel}
                    className="rounded-md bg-chrome py-2 text-[11px] text-bone hover:bg-chrome/70"
                  >
                    <KeyGlyph glyph={k.glyph} />
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-9 gap-1">
                {SYMBOLS_ROW_2.map((k, i) => (
                  <button
                    key={`sym2-${i}`}
                    type="button"
                    onClick={() => pressSymbol(k)}
                    aria-label={k.ariaLabel}
                    className="rounded-md bg-chrome py-2 text-[11px] text-bone hover:bg-chrome/70"
                  >
                    <KeyGlyph glyph={k.glyph} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            CATEGORY_MENUS[openCategory].map((group) => (
              <div key={group.section} className="mb-2 last:mb-0">
                <div className="mb-1.5 text-[9px] uppercase tracking-wide text-bone/50">{group.section}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {group.keys.map((k, i) => (
                    <button
                      key={`${group.section}-${i}`}
                      type="button"
                      onClick={() => press(k)}
                      aria-label={k.ariaLabel}
                      className="rounded-md bg-marker-soft/10 py-2 text-sm text-marker hover:bg-marker-soft/20"
                    >
                      <KeyGlyph glyph={k.glyph} />
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="mb-1.5 grid grid-cols-3 gap-1.5">
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
          onClick={onSolveSystem}
          aria-label="Resolver sistema de ecuaciones"
          className="flex items-center justify-center gap-1 rounded-md bg-alpha-soft py-2 text-[10px] font-medium text-alpha hover:bg-alpha-soft/80"
        >
          <span className="text-base font-light">{"{"}</span>
          <span className="text-left leading-tight">
            f(x)=0
            <br />
            g(x)=0
          </span>
        </button>
        <button
          type="button"
          onClick={onSimplify}
          aria-label="Simplificar expresión"
          className="rounded-md bg-graph/15 py-2 text-[11px] font-medium text-graph hover:bg-graph/25"
        >
          a+a → 2a
        </button>
      </div>

      {showCalculusStrip && (
        <div className="relative mb-1.5 rounded-lg bg-chrome-soft/60 p-1.5">
          <div className="mb-1 grid grid-cols-6 gap-1">
            {CALCULUS_ROW_1.map((k, i) => (
              <button
                key={i}
                type="button"
                onClick={() => press(k)}
                aria-label={k.ariaLabel}
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

      {/* Núcleo fijo (P3 §4.5): 7 columnas × 4 filas, siempre visible.
          Estilo §4.7: números (fondo neutro oscuro), funciones (mismo
          fondo, texto ámbar), operadores ×/−/+/÷ (fondo ámbar sólido),
          = (contorno ámbar), ↵ (fondo azul sólido). */}
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
              <button key={j} type="button" onClick={() => pressBase(k)} aria-label={k.ariaLabel} className={className}>
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
            className="rounded-md bg-paper-soft py-1.5 text-sm text-ink hover:bg-paper-line/60"
          >
            <KeyGlyph glyph={k.glyph} />
          </button>
        ))}
      </div>
    </div>
  );
}
