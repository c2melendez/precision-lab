/**
 * src/components/SimpleKeyboard.tsx — teclado reducido para el modo
 * Basic simplificado (Fase B, spec UX estilo ClassCalc §5). Sin trig,
 * log, ni cálculo. Mismo mecanismo de inserción que NaturalMathKeyboard
 * (field.insert() con plantillas #0).
 */

import type { MathfieldElement } from "mathlive";
import type { MouseEvent as ReactMouseEvent } from "react";
import { KeyGlyph, BOX } from "./KeyGlyph";
import { triggerKeyFeedback } from "../utils/keyFeedback";

interface Cell {
  label: React.ReactNode;
  insert?: string;
  action?: "backspace" | "clear" | "submit";
}

const ROWS: Cell[][] = [
  [{ label: "(", insert: "(" }, { label: ")", insert: ")" }, { label: "AC", action: "clear" }, { label: "⌫", action: "backspace" }],
  [
    { label: "%", insert: "\\%" },
    { label: <KeyGlyph glyph={{ sup: "2", base: BOX }} />, insert: "#0^2" },
    { label: <KeyGlyph glyph={{ sqrt: BOX }} />, insert: "\\sqrt{#0}" },
    { label: "÷", insert: "\\div" },
  ],
  [{ label: "7", insert: "7" }, { label: "8", insert: "8" }, { label: "9", insert: "9" }, { label: "×", insert: "\\times" }],
  [{ label: "4", insert: "4" }, { label: "5", insert: "5" }, { label: "6", insert: "6" }, { label: "−", insert: "-" }],
  [{ label: "1", insert: "1" }, { label: "2", insert: "2" }, { label: "3", insert: "3" }, { label: "+", insert: "+" }],
  [{ label: "0", insert: "0" }, { label: ".", insert: "." }, { label: "⏎", action: "submit" }],
];

interface SimpleKeyboardProps {
  field: MathfieldElement | null;
  onSubmit?: () => void;
}

export function SimpleKeyboard({ field, onSubmit }: SimpleKeyboardProps) {
  function press(cell: Cell): void {
    if (cell.action === "backspace") {
      field?.focus();
      field?.executeCommand("deleteBackward");
      return;
    }
    if (cell.action === "clear") {
      field?.focus();
      field?.setValue("");
      return;
    }
    if (cell.action === "submit") return onSubmit?.();
    field?.focus();
    if (cell.insert) field?.insert(cell.insert);
  }

  // Fase V, Módulo V0: mismo patrón de delegación que NaturalMathKeyboard.
  function handleKeyboardClickCapture(e: ReactMouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) triggerKeyFeedback();
  }

  return (
    <div className="rounded-lg bg-chrome p-3" onClickCapture={handleKeyboardClickCapture}>
      {ROWS.map((row, i) => (
        <div key={i} className="mb-1.5 grid grid-cols-4 gap-1.5 last:mb-0">
          {row.map((cell, j) => (
            <button
              key={j}
              type="button"
              onClick={() => press(cell)}
              className={
                cell.action === "submit"
                  ? "col-span-2 rounded-md bg-graph py-2.5 text-base font-semibold text-paper hover:bg-graph/90"
                  : /^[0-9.]$/.test(String(cell.label))
                    ? "rounded-md bg-chrome-soft/80 py-2.5 text-base font-medium text-bone hover:bg-chrome-soft/60"
                    : "rounded-md bg-chrome-soft py-2.5 text-sm text-bone hover:bg-chrome-soft/70"
              }
            >
              {cell.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
