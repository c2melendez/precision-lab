import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import type { FloatingRect } from "../store/useFloatingLayoutStore";

/**
 * FloatingWindow.tsx — Fase P, Módulo P4 ("Flotante").
 *
 * Ventana movible/redimensionable, controlada por `rect`/`onChange` (no
 * guarda su propio estado — quien la usa decide dónde persiste el rect,
 * ver useFloatingLayoutStore.ts). Implementada con Pointer Events
 * nativos, sin ninguna librería de drag/resize nueva — no había forma de
 * instalar una (sin red, sin node_modules en el entorno de este
 * módulo), y esto evita la dependencia de todas formas.
 *
 * `position: fixed`, coordenadas en píxeles de viewport — coincide con
 * cómo `clampToViewport` (useFloatingLayoutStore.ts) razona los límites
 * con `window.innerWidth/innerHeight`.
 */

interface FloatingWindowProps {
  title: string;
  rect: FloatingRect;
  onChange: (rect: FloatingRect) => void;
  children: ReactNode;
}

const MIN_WIDTH = 220;
const MIN_HEIGHT = 160;

export function FloatingWindow({ title, rect, onChange, children }: FloatingWindowProps) {
  // Refs, no estado — el drag/resize no necesita re-render propio, solo
  // llamar a onChange con el rect actualizado (el padre es quien re-
  // renderiza vía el store).
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null);
  const resizeOrigin = useRef<{ pointerX: number; pointerY: number; startWidth: number; startHeight: number } | null>(
    null,
  );

  function onDragPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = { pointerX: event.clientX, pointerY: event.clientY, startX: rect.x, startY: rect.y };
  }

  function onDragPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragOrigin.current) return;
    const dx = event.clientX - dragOrigin.current.pointerX;
    const dy = event.clientY - dragOrigin.current.pointerY;
    const maxX = Math.max(window.innerWidth - rect.width - 8, 8);
    const maxY = Math.max(window.innerHeight - rect.height - 8, 8);
    onChange({
      ...rect,
      x: Math.min(Math.max(dragOrigin.current.startX + dx, 8), maxX),
      y: Math.min(Math.max(dragOrigin.current.startY + dy, 8), maxY),
    });
  }

  function onDragPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragOrigin.current = null;
  }

  function onResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeOrigin.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
  }

  function onResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resizeOrigin.current) return;
    const dx = event.clientX - resizeOrigin.current.pointerX;
    const dy = event.clientY - resizeOrigin.current.pointerY;
    const maxWidth = Math.max(window.innerWidth - rect.x - 8, MIN_WIDTH);
    const maxHeight = Math.max(window.innerHeight - rect.y - 8, MIN_HEIGHT);
    onChange({
      ...rect,
      width: Math.min(Math.max(resizeOrigin.current.startWidth + dx, MIN_WIDTH), maxWidth),
      height: Math.min(Math.max(resizeOrigin.current.startHeight + dy, MIN_HEIGHT), maxHeight),
    });
  }

  function onResizePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    resizeOrigin.current = null;
  }

  return (
    <div
      role="dialog"
      aria-label={title}
      style={{ position: "fixed", left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: 35 }}
      className="flex flex-col overflow-hidden rounded-lg border border-chrome-soft bg-paper shadow-2xl"
    >
      <div
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        className="flex shrink-0 cursor-move touch-none items-center justify-between bg-chrome px-2.5 py-1.5"
      >
        <span className="text-[11px] font-medium text-bone/80">{title}</span>
        <span aria-hidden="true" className="text-bone/40">
          ⠿
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">{children}</div>
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        role="separator"
        aria-label={`Redimensionar ${title}`}
        aria-orientation="horizontal"
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize touch-none"
      />
    </div>
  );
}
