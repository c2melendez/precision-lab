/**
 * src/components/NaturalMathField.tsx — campo de entrada matemática
 * "natural" (fracciones, raíces y exponentes se ven mientras se escriben,
 * como en GeoGebra/Desmos), envolviendo el <math-field> de MathLive.
 *
 * MathLive nunca se muestra al backend: internamente guarda LaTeX, y este
 * componente lo convierte a la sintaxis ASCII que `parsing.py` espera
 * (implicit_multiplication_application + convert_xor, sección 5) antes de
 * llamarlo. Ver `latexToBackendSyntax` para los ajustes puntuales sobre lo
 * que produce `convertLatexToAsciiMath` por defecto.
 *
 * Re-vestido con los tokens Precision Lab (Fase 1/2): el campo vive sobre
 * el panel "paper", así que usa paper-soft/paper-line/ink, con el caret y
 * el resaltado de selección de MathLive en marker (vía sus custom
 * properties --caret-color / --selection-background-color).
 */

import "mathlive";
import { convertLatexToAsciiMath } from "mathlive/ssr";
import { useCallback, useEffect, useId, useRef } from "react";
import type { MathfieldElement, MathfieldElementAttributes } from "mathlive";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<
        React.HTMLAttributes<MathfieldElement> & Partial<MathfieldElementAttributes>,
        MathfieldElement
      >;
    }
  }
}

/**
 * `convertLatexToAsciiMath` deja `root(n)(x)` para `\sqrt[n]{x}`, pero el
 * backend no tiene una función `root` (solo `sqrt`, ver
 * `matrix_service`/`parsing.py`) — se reescribe como `(x)**(1/(n))`, que
 * SÍ entiende (`convert_xor`/`**` ambos soportados).
 */
function rewriteNthRoot(ascii: string): string {
  const pattern = /root\(([^()]+)\)\(([^()]+)\)/g;
  let result = ascii;
  // Se repite porque una raíz puede anidar otra en el índice o el radicando.
  for (let i = 0; i < 5 && pattern.test(result); i++) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, (_match, n: string, x: string) => `(${x})**(1/(${n}))`);
  }
  return result;
}

/**
 * Fase 10 (auditoría Fase 0 v2): `convertLatexToAsciiMath` no colapsa
 * \mathrm{nombre} en un solo identificador — lo deletrea como letras
 * sueltas separadas por espacio (ej. \mathrm{mean} -> "m e a n"), que es
 * exactamente como LaTeX trata cualquier secuencia de letras en modo
 * matemático sin \mathrm/\operatorname (variables itálicas individuales
 * multiplicándose entre sí) — confirmado que ni \mathrm ni \operatorname
 * evitan esto en esta librería. Antes de este fix, cualquier tecla del
 * teclado que usa \mathrm{...} (mean/median/mode/stdev/var/mad/sort/mod/
 * lcm/nCr/nPr — el menú "Stat" casi completo) llegaba al backend como
 * variables sueltas sin sentido, no como el nombre de función esperado.
 *
 * Se recolapsan aquí, por nombre exacto y con case sensitivity (por eso
 * "nCr"/"nPr" van explícitos, no derivados de un patrón genérico) —
 * deliberadamente NO se usa un regex genérico de "letras sueltas seguidas
 * de paréntesis" porque eso colapsaría también multiplicación implícita
 * legítima entre variables de una letra (ej. "x y(z)").
 */
const KNOWN_MULTI_LETTER_FUNCTION_NAMES = [
  "median",
  "stdev",
  "mean",
  "mode",
  "sort",
  "mad",
  "mod",
  "lcm",
  "nCr",
  "nPr",
  "var",
  // P4 (spec v2 §5, Complejos) — mismo bug, mismo fix: sin esto "re(2+3i)"
  // llegaría al backend como "r e ( 2 + 3 i )" (variables sueltas).
  "re",
  "im",
  "arg",
  "conj",
  "topolar",
  // P6 (spec v2 §7.1): variantes poblacionales — mismo motivo.
  "stdevpop",
  "variancepop",
];

function collapseKnownFunctionNames(ascii: string): string {
  let result = ascii;
  for (const name of KNOWN_MULTI_LETTER_FUNCTION_NAMES) {
    const spelled = name.split("").join("\\s+");
    const pattern = new RegExp(`\\b${spelled}\\s*\\(`, "g");
    result = result.replace(pattern, `${name}(`);
  }
  return result;
}

export function latexToBackendSyntax(latex: string): string {
  if (latex.trim() === "") return "";
  const ascii = convertLatexToAsciiMath(latex);
  return collapseKnownFunctionNames(rewriteNthRoot(ascii)).trim();
}

interface NaturalMathFieldProps {
  latex: string;
  onLatexChange: (latex: string) => void;
  ariaLabel: string;
  placeholder?: string;
  fieldRef?: (el: MathfieldElement | null) => void;
  /** Fase E: quita fondo/borde/sombra propios cuando el campo vive
   * anidado dentro de CalculatorScreen.tsx, que ya provee el contenedor
   * "pantalla" único (mismo criterio que NaturalInput.tsx en Lite). El
   * uso standalone original (con su propia píldora) se conserva cuando
   * `bare` no se pasa. */
  bare?: boolean;
}

export function NaturalMathField({
  latex,
  onLatexChange,
  ariaLabel,
  placeholder,
  fieldRef,
  bare = false,
}: NaturalMathFieldProps) {
  const elRef = useRef<MathfieldElement | null>(null);
  const fieldId = useId();

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    function handleInput(): void {
      if (el && el.getValue("latex-unstyled") !== latex) {
        onLatexChange(el.getValue("latex-unstyled"));
      }
    }

    el.addEventListener("input", handleInput);
    return () => el.removeEventListener("input", handleInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLatexChange]);

  useEffect(() => {
    const el = elRef.current;
    if (el && el.getValue("latex-unstyled") !== latex) {
      el.setValue(latex);
    }
  }, [latex]);

  // Fix (ver informe del bug de Gráficas a Carlos): el `ref` de abajo NO
  // puede ser una función inline — React reinvoca las callback refs cada
  // vez que su identidad cambia, y una función inline es una identidad
  // nueva en cada render. Cuando el `fieldRef` que pasa el padre también
  // dispara un `setState` (como en Graph2DForm, que guarda un array de
  // campos), eso generaba un bucle infinito de renders ("Maximum update
  // depth exceeded", React error #185). `useCallback` la mantiene
  // estable mientras `fieldRef` (la prop) no cambie de identidad.
  const setRef = useCallback(
    (el: MathfieldElement | null) => {
      elRef.current = el;
      fieldRef?.(el);
    },
    [fieldRef],
  );

  return (
    <math-field
      id={fieldId}
      ref={setRef}
      math-virtual-keyboard-policy="manual"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={
        bare
          ? "w-full bg-transparent px-0 py-1 pr-10 text-right text-2xl text-ink"
          : "w-full rounded-full border border-paper-line bg-paper-soft px-5 py-2.5 text-base text-ink shadow-sm"
      }
      style={
        {
          display: "block",
          width: "100%",
          "--caret-color": "#E8A33D",
          "--selection-background-color": "#FBEFDA",
          "--selection-color": "#8A5A0E",
        } as React.CSSProperties
      }
    />
  );
}
