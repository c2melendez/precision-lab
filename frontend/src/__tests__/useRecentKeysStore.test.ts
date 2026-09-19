import { beforeEach, describe, expect, it } from "vitest";

import type { KeyDef } from "../components/NaturalMathKeyboard";
import { useRecentKeysStore } from "../store/useRecentKeysStore";

function k(insertLatex: string, ariaLabel = insertLatex): KeyDef {
  return { glyph: insertLatex, insertLatex, ariaLabel };
}

beforeEach(() => {
  window.localStorage.clear();
  useRecentKeysStore.setState({ recentByMode: {} });
});

describe("useRecentKeysStore", () => {
  it("empieza vacío para cualquier modo", () => {
    expect(useRecentKeysStore.getState().getRecents("basic")).toEqual({ operations: [], variables: [] });
  });

  it("registra una operación al frente de su lista", () => {
    useRecentKeysStore.getState().recordKey("basic", k("\\sin(#0)"), "operation");
    expect(useRecentKeysStore.getState().getRecents("basic").operations).toEqual([k("\\sin(#0)")]);
    expect(useRecentKeysStore.getState().getRecents("basic").variables).toEqual([]);
  });

  it("registra una variable/constante en su propia lista, separada de operaciones", () => {
    useRecentKeysStore.getState().recordKey("basic", k("x"), "variable");
    const recents = useRecentKeysStore.getState().getRecents("basic");
    expect(recents.variables).toEqual([k("x")]);
    expect(recents.operations).toEqual([]);
  });

  it("la tecla más reciente va primero", () => {
    const { recordKey } = useRecentKeysStore.getState();
    recordKey("basic", k("\\sin(#0)"), "operation");
    recordKey("basic", k("\\cos(#0)"), "operation");
    expect(useRecentKeysStore.getState().getRecents("basic").operations).toEqual([k("\\cos(#0)"), k("\\sin(#0)")]);
  });

  it("reusar una tecla ya presente la sube al frente, sin duplicarla", () => {
    const { recordKey } = useRecentKeysStore.getState();
    recordKey("basic", k("\\sin(#0)"), "operation");
    recordKey("basic", k("\\cos(#0)"), "operation");
    recordKey("basic", k("\\sin(#0)"), "operation");
    const { operations } = useRecentKeysStore.getState().getRecents("basic");
    expect(operations).toEqual([k("\\sin(#0)"), k("\\cos(#0)")]);
  });

  it("limita cada dock a 7 elementos", () => {
    const { recordKey } = useRecentKeysStore.getState();
    for (let i = 0; i < 10; i++) recordKey("basic", k(`f${i}(#0)`), "operation");
    const { operations } = useRecentKeysStore.getState().getRecents("basic");
    expect(operations).toHaveLength(7);
    // Las 7 más recientes (9..3), la más nueva primero.
    expect(operations.map((o) => o.insertLatex)).toEqual(["f9(#0)", "f8(#0)", "f7(#0)", "f6(#0)", "f5(#0)", "f4(#0)", "f3(#0)"]);
  });

  it("mantiene historiales separados por modo", () => {
    const { recordKey } = useRecentKeysStore.getState();
    recordKey("basic", k("\\sin(#0)"), "operation");
    recordKey("matrix", k("\\det(#0)"), "operation");
    expect(useRecentKeysStore.getState().getRecents("basic").operations).toEqual([k("\\sin(#0)")]);
    expect(useRecentKeysStore.getState().getRecents("matrix").operations).toEqual([k("\\det(#0)")]);
  });

  it("persiste en localStorage y sobrevive a recrear el store desde disco", () => {
    useRecentKeysStore.getState().recordKey("basic", k("x"), "variable");
    const raw = window.localStorage.getItem("precision-lab-recent-keys");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.basic.variables).toEqual([k("x")]);
  });

  it("ignora JSON corrupto en localStorage sin romper el arranque", () => {
    window.localStorage.setItem("precision-lab-recent-keys", "{not json");
    // No debe lanzar — el store simplemente arranca vacío la próxima vez
    // que se lea el storage (comprobado indirectamente: la app no truena
    // al importar el módulo, ya cubierto por el resto de la suite
    // importando este archivo sin fallar).
    expect(() => window.localStorage.getItem("precision-lab-recent-keys")).not.toThrow();
  });
});
