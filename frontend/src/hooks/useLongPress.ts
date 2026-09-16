import { useCallback, useRef } from "react";

/**
 * useLongPress.ts — Módulo 0 (hoja-de-ruta-visual.md §0.6 / log §4).
 *
 * Hook nuevo: no existía ningún patrón de long-press en el teclado antes
 * de este track. Timer de ~400ms sobre onPointerDown, cancelado en
 * onPointerUp/onPointerLeave/onPointerCancel si no llegó a disparar.
 *
 * Devuelve los handlers de puntero listos para spread en una tecla
 * (`<button {...bind}>`). onLongPress se dispara UNA sola vez por
 * pulsación sostenida; si se dispara, se suprime el click normal
 * subsiguiente (para que un long-press no también inserte el glyph
 * primario) vía el flag `firedRef` leído en onPointerUp.
 *
 * Consumido recién en el Módulo 1 (teclas `<`/`>` → ≤/≥, tecla `°` →
 * plantilla D°M′S″). Este módulo solo construye el hook, sin usarlo
 * todavía en ninguna tecla real (regla de la hoja de ruta: "este módulo
 * solo mueve el contenedor, no reordena").
 */

const LONG_PRESS_MS = 400;

interface UseLongPressOptions {
  onLongPress: () => void;
  onPress?: () => void;
  disabled?: boolean;
}

interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

export function useLongPress({ onLongPress, onPress, disabled }: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(() => {
    if (disabled) return;
    firedRef.current = false;
    clear();
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }, [disabled, clear, onLongPress]);

  const onPointerUp = useCallback(() => {
    clear();
    // Si el long-press ya disparó, este pointerup es el "soltar" de esa
    // misma pulsación — no debe además contar como tap corto.
    if (!firedRef.current) {
      onPress?.();
    }
    firedRef.current = false;
  }, [clear, onPress]);

  const onPointerLeave = useCallback(() => {
    clear();
    firedRef.current = false;
  }, [clear]);

  const onPointerCancel = useCallback(() => {
    clear();
    firedRef.current = false;
  }, [clear]);

  return { onPointerDown, onPointerUp, onPointerLeave, onPointerCancel };
}
