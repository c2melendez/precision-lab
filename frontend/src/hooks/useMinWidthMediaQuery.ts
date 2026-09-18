import { useEffect, useState } from "react";

/**
 * useMinWidthMediaQuery.ts — Fase P, Módulo P4 ("Flotante").
 *
 * Único punto de verdad de "¿el viewport actual es lo bastante ancho
 * para Flotante?" (P0: umbral en `lg`, 1024px — confirmado en
 * tailwind.config.js, `lg` es el valor por defecto de Tailwind). Lo usan
 * TANTO KeyboardDock.tsx (para saber si debe ocultarse porque Flotante
 * está realmente activo) COMO Screen.tsx/CalculatorScreen.tsx (para
 * decidir si renderizar las ventanas flotantes o degradar a Enfoque) —
 * si cada uno tuviera su propio `matchMedia`, podrían desincronizarse
 * por un frame y mostrar el dock fijo Y las ventanas flotantes a la vez,
 * o ninguno de los dos (violaría la restricción dura de teclado siempre
 * alcanzable).
 */

export function useMinWidthMediaQuery(minWidthPx: number): boolean {
  const query = `(min-width: ${minWidthPx}px)`;

  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return matches;
}

/** Umbral de Flotante, confirmado en el Módulo P0 (breakpoint `lg`). */
export const FLOATING_MIN_WIDTH_PX = 1024;
