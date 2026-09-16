import { describe, expect, it } from "vitest";
import { detectCalculusIntent } from "../components/calculusIntent";

describe("detectCalculusIntent (Fase 2 — fusión de modos, proyecto con backend Python)", () => {
  describe("derivada (escáner propio — nunca toca el validador de AST del backend)", () => {
    it("detecta el template de orden 1 que inserta el teclado", () => {
      expect(detectCalculusIntent("\\frac{d}{dx}\\left(x^2+3x\\right)")).toEqual({
        kind: "derivative",
        variable: "x",
        order: 1,
        innerLatex: "x^2+3x",
      });
    });

    it("detecta orden 2 (d^2/dx^2) — el caso donde Compute Engine falla en esta versión", () => {
      expect(detectCalculusIntent("\\frac{d^2}{dx^2}\\left(x^3\\right)")).toEqual({
        kind: "derivative",
        variable: "x",
        order: 2,
        innerLatex: "x^3",
      });
    });

    it("respeta paréntesis anidados dentro del argumento", () => {
      expect(detectCalculusIntent("\\frac{d}{dt}\\left(\\sin\\left(t\\right)+t^2\\right)")).toEqual({
        kind: "derivative",
        variable: "t",
        order: 1,
        innerLatex: "\\sin\\left(t\\right)+t^2",
      });
    });

    it("NO matchea si la derivada es solo parte de una expresión más grande", () => {
      expect(detectCalculusIntent("2+\\frac{d}{dx}\\left(x^2\\right)")).toBeNull();
      expect(detectCalculusIntent("\\frac{d}{dx}\\left(x^2\\right)+1")).toBeNull();
    });

    it("devuelve null con la plantilla recién insertada sin completar", () => {
      expect(detectCalculusIntent("\\frac{d}{dx}\\left(\\right)")).toBeNull();
    });

    it("no detecta una fracción normal como derivada", () => {
      expect(detectCalculusIntent("\\frac{a}{b}")).toBeNull();
    });

    it("no detecta la fracción-trampa d/2 (denominador no empieza con la variable)", () => {
      expect(detectCalculusIntent("\\frac{d}{2}\\left(x\\right)")).toBeNull();
    });
  });

  describe("integral (Compute Engine — extrae solo el integrando limpio)", () => {
    it("detecta integral indefinida", () => {
      expect(detectCalculusIntent("\\int x^2+3x\\,dx")).toEqual({
        kind: "integral",
        variable: "x",
        lowerBound: null,
        upperBound: null,
        innerLatex: "x^2+3x",
      });
    });

    it("detecta integral definida con límites numéricos", () => {
      expect(detectCalculusIntent("\\int_{0}^{1} x^2\\,dx")).toEqual({
        kind: "integral",
        variable: "x",
        lowerBound: "0",
        upperBound: "1",
        innerLatex: "x^2",
      });
    });
  });

  describe("límite (Compute Engine — finito e infinito; lateral queda fuera, ver cabecera)", () => {
    it("detecta un límite con punto finito", () => {
      expect(detectCalculusIntent("\\lim_{x\\to 2} \\frac{x^2-4}{x-2}")).toEqual({
        kind: "limit",
        variable: "x",
        point: "2",
        innerLatex: "\\frac{x^2-4}{x-2}",
        direction: "both",
      });
    });

    it("detecta un límite al +infinito (PositiveInfinity -> \"oo\")", () => {
      expect(detectCalculusIntent("\\lim_{x\\to \\infty} \\frac{1}{x}")).toEqual({
        kind: "limit",
        variable: "x",
        point: "oo",
        innerLatex: "\\frac{1}{x}",
        direction: "both",
      });
    });

    it("detecta un límite al -infinito (NegativeInfinity -> \"-oo\")", () => {
      expect(detectCalculusIntent("\\lim_{x\\to -\\infty} \\frac{1}{x}")).toEqual({
        kind: "limit",
        variable: "x",
        point: "-oo",
        innerLatex: "\\frac{1}{x}",
        direction: "both",
      });
    });

    // Bug real encontrado al verificar contra el paquete instalado
    // (0.58.0): la notación lateral da MathJSON sin sentido
    // (PseudoInverse/Superminus de un Error), no un punto+dirección
    // utilizable. Se verifica que NO se detecte como límite en vez de
    // fabricar un resultado con datos rotos — cae al flujo normal
    // (probablemente /evaluate, que fallará con un error claro).
    it("NO detecta límite lateral escrito a mano sin llaves en el exponente (notación rota en Compute Engine 0.58.0 para esta forma)", () => {
      expect(detectCalculusIntent("\\lim_{x\\to 0^+} \\frac{1}{x}")).toBeNull();
    });

    // Corrección post-auditoría (hallazgo de paridad Lite/Full): la tecla
    // "lim x→a±" del teclado SIEMPRE inserta el signo entre llaves
    // (\lim_{#0\to#1^{#2}}#3, ver NaturalMathKeyboard.tsx) — esa forma
    // exacta ya no depende de Compute Engine, la reconoce
    // detectLateralLimit() con su propio escáner (mismo criterio que
    // detectDerivative arriba).
    it("detecta límite lateral derecho con el signo entre llaves (forma exacta que inserta el teclado)", () => {
      expect(detectCalculusIntent("\\lim_{x\\to0^{+}}\\frac{1}{x}")).toEqual({
        kind: "limit",
        variable: "x",
        point: "0",
        innerLatex: "\\frac{1}{x}",
        direction: "right",
      });
    });

    it("detecta límite lateral izquierdo con el signo entre llaves", () => {
      expect(detectCalculusIntent("\\lim_{x\\to0^{-}}\\frac{1}{x}")).toEqual({
        kind: "limit",
        variable: "x",
        point: "0",
        innerLatex: "\\frac{1}{x}",
        direction: "left",
      });
    });

    it("NO detecta límite lateral izquierdo (notación rota en esta versión del motor)", () => {
      expect(detectCalculusIntent("\\lim_{x\\to 0^-} \\frac{1}{x}")).toBeNull();
    });
  });

  describe("controles negativos", () => {
    it("una ecuación simple no es cálculo", () => {
      expect(detectCalculusIntent("2x+3=7")).toBeNull();
    });

    it("una expresión trigonométrica simple no es cálculo", () => {
      expect(detectCalculusIntent("\\sin\\left(\\frac{\\pi}{4}\\right)")).toBeNull();
    });

    it("un sistema no es cálculo", () => {
      expect(detectCalculusIntent("\\begin{cases}x=1\\\\y=2\\end{cases}")).toBeNull();
    });
  });
});
