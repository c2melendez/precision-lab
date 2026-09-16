import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BasicMode } from "../components/BasicMode";

vi.mock("../api/client", () => ({
  callApi: vi.fn(),
}));

// MathLive define un custom element (<math-field>) que jsdom no soporta
// (no hay verdadero renderizado de fórmulas en un entorno de pruebas sin
// navegador). Se sustituye por un <input> accesible equivalente — la
// conversión LaTeX->ASCII real (`latexToBackendSyntax`) SÍ se prueba por
// separado en NaturalMathField.test.ts con casos concretos.
vi.mock("../components/NaturalMathField", () => ({
  NaturalMathField: ({
    latex,
    onLatexChange,
    ariaLabel,
  }: {
    latex: string;
    onLatexChange: (v: string) => void;
    ariaLabel: string;
  }) => (
    <input
      aria-label={ariaLabel}
      value={latex}
      onChange={(e) => onLatexChange(e.target.value)}
    />
  ),
  latexToBackendSyntax: (latex: string) => latex.trim(),
}));

import { callApi } from "../api/client";
import { useUIStore } from "../store/useUIStore";
import { useKeyboardPanelStore } from "../store/useKeyboardPanelStore";

// Corrección post-auditoría: desde el rediseño del teclado
// (spec_teclado_virtual.md), BasicMode ya no renderiza <NaturalMathKeyboard>
// inline — solo registra su contenido en useKeyboardPanelStore, que
// <KeyboardDock>/<KeyboardPanel> (montados en App.tsx, fuera de este test)
// leen y renderizan. Este test necesitaba el contenido del teclado en el
// DOM, así que se agrega un pequeño harness que simula ese consumidor.
function KeyboardStoreSubscriber() {
  const content = useKeyboardPanelStore((s) => s.content);
  return <>{content}</>;
}

const mockedCallApi = vi.mocked(callApi);

beforeEach(() => {
  mockedCallApi.mockReset();
  useUIStore.setState({ activeMode: "basic" });
  mockedCallApi.mockResolvedValue({
    success: true,
    operation: "evaluate",
    request_id: "id",
    steps: [],
    has_detailed_steps: false,
    warnings: [],
    duration_ms: 1,
  } as never);
});

describe("BasicMode", () => {
  it("arma el payload correcto contra /evaluate", async () => {
    render(<BasicMode />);
    fireEvent.change(screen.getByLabelText("Expresión"), { target: { value: "2+2" } });
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    await waitFor(() => expect(mockedCallApi).toHaveBeenCalled());

    expect(mockedCallApi).toHaveBeenCalledWith("/evaluate", {
      expression: "2+2",
      angle_unit: "rad",
    });
  });

  it("incluye substitutions cuando el usuario añade una fila", async () => {
    render(<BasicMode />);
    fireEvent.change(screen.getByLabelText("Expresión"), { target: { value: "x+1" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Añadir sustitución" }));
    fireEvent.change(screen.getByLabelText("Nombre de la variable 1"), {
      target: { value: "x" },
    });
    fireEvent.change(screen.getByLabelText("Valor de la variable 1"), {
      target: { value: "3" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    await waitFor(() => expect(mockedCallApi).toHaveBeenCalled());

    expect(mockedCallApi).toHaveBeenCalledWith("/evaluate", {
      expression: "x+1",
      angle_unit: "rad",
      substitutions: { x: "3" },
    });
  });

  it("no llama a la API con una expresión vacía (payload inválido)", () => {
    render(<BasicMode />);
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    expect(screen.getByRole("alert")).toHaveTextContent("no puede estar vacía");
    expect(mockedCallApi).not.toHaveBeenCalled();
  });

  // Fase 1 (fusión de modos): handleSubmit antes SIEMPRE llamaba a
  // /evaluate. Ahora enruta según el contenido — estos 3 tests cubren las
  // ramas nuevas, reusando el mismo mock de NaturalMathField (que ya deja
  // pasar el valor tal cual, sin convertir LaTeX real).
  it("enruta a /solve cuando el campo tiene un signo = (antes iba a /evaluate)", async () => {
    render(<BasicMode />);
    fireEvent.change(screen.getByLabelText("Expresión"), { target: { value: "2x+3=7" } });
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    await waitFor(() => expect(mockedCallApi).toHaveBeenCalled());

    expect(mockedCallApi).toHaveBeenCalledWith("/solve", {
      equation: "2x+3=7",
      angle_unit: "rad",
    });
  });

  it("enruta a /inequality cuando el campo tiene < o >", async () => {
    render(<BasicMode />);
    fireEvent.change(screen.getByLabelText("Expresión"), { target: { value: "x+3>0" } });
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    await waitFor(() => expect(mockedCallApi).toHaveBeenCalled());

    expect(mockedCallApi).toHaveBeenCalledWith("/inequality", { inequality: "x+3>0" });
  });

  it("enruta a /solve/system cuando el campo tiene un entorno \\begin{cases}", async () => {
    render(<BasicMode />);
    fireEvent.change(screen.getByLabelText("Expresión"), {
      target: { value: "\\begin{cases}2x+y=5\\\\x-y=1\\end{cases}" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    await waitFor(() => expect(mockedCallApi).toHaveBeenCalled());

    expect(mockedCallApi).toHaveBeenCalledWith("/solve/system", {
      equations: ["2x+y=5", "x-y=1"],
      variables: ["x", "y"],
    });
  });

  it("valida que el número de variables del sistema coincida con el de ecuaciones", async () => {
    render(<BasicMode />);
    fireEvent.change(screen.getByLabelText("Expresión"), {
      target: { value: "\\begin{cases}x+y+z=6\\\\x-y=0\\\\z=3\\end{cases}" },
    });
    // El valor por defecto del campo de variables es "x, y" (2), pero el
    // sistema tiene 3 ecuaciones.
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El número de variables (2) debe coincidir con el de ecuaciones (3)",
    );
    expect(mockedCallApi).not.toHaveBeenCalled();
  });

  // Corrección post-auditoría (Módulo C, spec_motor_matematico_pendiente.md
  // §4): antes CUALQUIER fila sin "=" hacía fallar el sistema entero con
  // "Cada ecuación del sistema debe incluir un signo =" — el endpoint
  // /inequality/system nunca se llamaba desde ningún flujo real pese a
  // existir y funcionar en el backend.
  it("enruta a /inequality/system cuando todas las filas del sistema son inecuaciones", async () => {
    render(<BasicMode />);
    // Variables del sistema por defecto es "x, y" (2), que ya coincide
    // con el alcance fijo de 2 variables del solver de inecuaciones —
    // no hace falta tocar ese campo.
    fireEvent.change(screen.getByLabelText("Expresión"), {
      target: { value: "\\begin{cases}x+y<=4\\\\x-y>=0\\end{cases}" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    await waitFor(() => expect(mockedCallApi).toHaveBeenCalled());

    expect(mockedCallApi).toHaveBeenCalledWith("/inequality/system", {
      inequalities: ["x+y<=4", "x-y>=0"],
      variables: ["x", "y"],
    });
  });

  it("rechaza un sistema de inecuaciones sin exactamente 2 variables, sin llamar a la API", async () => {
    render(<BasicMode />);
    fireEvent.change(screen.getByLabelText("Expresión"), {
      target: { value: "\\begin{cases}x<=4\\\\x>=0\\end{cases}" },
    });
    fireEvent.change(screen.getByLabelText(/Variables del sistema/), { target: { value: "x" } });
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Un sistema de inecuaciones lineales requiere exactamente 2 variables",
    );
    expect(mockedCallApi).not.toHaveBeenCalled();
  });

  it("rechaza un sistema que mezcla ecuaciones e inecuaciones, sin llamar a la API", async () => {
    render(<BasicMode />);
    fireEvent.change(screen.getByLabelText("Expresión"), {
      target: { value: "\\begin{cases}x+y=4\\\\x-y>=0\\end{cases}" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no se puede mezclar ambos tipos en el mismo sistema",
    );
    expect(mockedCallApi).not.toHaveBeenCalled();
  });

  // Fase 2: handleSubmit gana detección de derivada/integral en notación
  // natural — ver calculusIntent.ts para la explicación completa de por
  // qué esto toca (sin reabrir) la decisión de seguridad "Fase 0 v2".
  // Estos tests confirman que se llama al endpoint DEDICADO
  // (/derivative, /integral) con la sub-expresión LIMPIA — nunca el
  // string \frac{d}{dx}(...) / \int...dx completo, que es justo lo que
  // el validador de AST del backend bloquearía si llegara a /evaluate.
  it("enruta a /derivative con la sub-expresión limpia (no el template completo)", async () => {
    render(<BasicMode />);
    fireEvent.change(screen.getByLabelText("Expresión"), {
      target: { value: "\\frac{d}{dx}\\left(x^2+3x\\right)" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    await waitFor(() => expect(mockedCallApi).toHaveBeenCalled());

    expect(mockedCallApi).toHaveBeenCalledWith("/derivative", {
      expression: "x^2+3x",
      variable: "x",
      order: 1,
    });
  });

  it("enruta a /integral con la sub-expresión limpia y los límites como string", async () => {
    render(<BasicMode />);
    fireEvent.change(screen.getByLabelText("Expresión"), {
      target: { value: "\\int_{0}^{1} x^2\\,dx" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    await waitFor(() => expect(mockedCallApi).toHaveBeenCalled());

    expect(mockedCallApi).toHaveBeenCalledWith("/integral", {
      expression: "x^2",
      variable: "x",
      lower_bound: "0",
      upper_bound: "1",
    });
  });

  it("enruta a /limit con la sub-expresión limpia y direction: 'both' (notación natural, sin lateralidad)", async () => {
    render(<BasicMode />);
    fireEvent.change(screen.getByLabelText("Expresión"), {
      target: { value: "\\lim_{x\\to 2} \\frac{x^2-4}{x-2}" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    await waitFor(() => expect(mockedCallApi).toHaveBeenCalled());

    expect(mockedCallApi).toHaveBeenCalledWith("/limit", {
      expression: "\\frac{x^2-4}{x-2}",
      variable: "x",
      point: "2",
      direction: "both",
    });
  });

  it("enruta a /limit con punto 'oo' cuando la notación es al infinito", async () => {
    render(<BasicMode />);
    fireEvent.change(screen.getByLabelText("Expresión"), {
      target: { value: "\\lim_{x\\to \\infty} \\frac{1}{x}" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Evaluar" }).closest("form")!);

    await waitFor(() => expect(mockedCallApi).toHaveBeenCalled());

    expect(mockedCallApi).toHaveBeenCalledWith(
      "/limit",
      expect.objectContaining({ point: "oo", direction: "both" }),
    );
  });

  // Fase 0 v2 (histórico): d/dx no se resolvía inline en Básica —
  // Derivative estaba bloqueado a nivel de seguridad en el backend (antes
  // de ese fix, insertaba \frac{d}{dx}(...) que el backend interpretaba
  // como símbolos sueltos y daba una respuesta incorrecta SIN error), así
  // que la tecla navegaba al modo Derivada en vez de insertar nada.
  // Fase 2 + rediseño de teclado (decisión de Carlos): d/dx ya NO navega
  // a Derivada — calculusIntent.ts (Fase 2) resuelve la derivada inline
  // en Básico, mandando la sub-expresión limpia a /derivative. La tecla
  // ahora solo inserta la plantilla LaTeX, como cualquier otra tecla de
  // la tira de Cálculo.
  it('la tecla "derivada" del teclado inserta la plantilla LaTeX (Fase 2 la resuelve inline, ya no navega)', () => {
    render(
      <>
        <BasicMode />
        <KeyboardStoreSubscriber />
      </>,
    );

    expect(useUIStore.getState().activeMode).toBe("basic");
    // La tecla vive dentro de la categoría colapsable "Cálculo" (rediseño
    // de teclado) — hay que abrirla antes de que "derivada" esté en el DOM.
    fireEvent.click(screen.getByRole("button", { name: "Cálculo" }));
    fireEvent.click(screen.getByLabelText("derivada"));
    expect(useUIStore.getState().activeMode).toBe("basic");
  });
});
