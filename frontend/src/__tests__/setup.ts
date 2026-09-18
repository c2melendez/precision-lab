import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { useHistoryStore } from "../store/useHistoryStore";

// jsdom no implementa window.matchMedia (usado por useMinWidthMediaQuery,
// Fase P/Módulo P4 — detección de umbral "Flotante"). Sin este polyfill,
// cualquier test que monte un árbol que llegue a KeyboardDock.tsx o
// Screen.tsx/CalculatorScreen.tsx (p.ej. renderizar <App /> completo, como
// hace e2e.test.tsx) falla con "window.matchMedia is not a function" antes
// de que el propio test tenga oportunidad de correr. Se recrea antes de
// cada test (no solo una vez a nivel de módulo) para que cada test reciba
// un mock limpio, sin listeners acumulados de tests anteriores.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(), // deprecado, algunos polyfills/libs viejas aún lo llaman
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  // Evita contaminación entre tests: submitAndRecord (Módulo 12) escribe
  // en useHistoryStore/localStorage en cada submit exitoso o fallido.
  window.localStorage.clear();
  useHistoryStore.setState({ entries: [] });
});
