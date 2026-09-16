import { create } from "zustand";
import type { ReactNode } from "react";

/**
 * useKeyboardPanelStore.ts — Módulo 0.
 *
 * Mismo store que su equivalente en precision-lab-lite (paridad
 * obligatoria). La hoja de ruta pide montar <KeyboardDock> "a nivel raíz
 * en App.tsx... para que persista entre modos", pero cada modo
 * (BasicMode, etc.) es dueño de su propio `mathField` y de sus propios
 * handlers (onSubmit/onSolveEquation/...), que hoy se pasan como props
 * directas a <NaturalMathKeyboard>. Un <KeyboardDock> verdaderamente
 * global en App.tsx no tiene forma de acceder a ese estado local del modo
 * activo sin algún canal compartido.
 *
 * Se resuelve con este store efímero (mismo patrón zustand ya usado en
 * useUIStore/useHistoryStore de este mismo repo, nunca persistido): cada
 * modo con teclado registra su contenido (el <NaturalMathKeyboard .../>
 * ya armado con sus props) al montar, y lo limpia al desmontar.
 * KeyboardDock/KeyboardPanel, montados una sola vez en App.tsx, solo leen
 * `content` e `isOpen` — no conocen la lógica de ningún modo. Alternativa
 * descartada: React Context con el mismo propósito — se prefirió zustand
 * por consistencia con el store ya existente en ambos repos, no por
 * necesidad técnica.
 *
 * PATRÓN OBLIGATORIO PARA QUIEN CONSUMA ESTE STORE (documentado tras un
 * bug real encontrado en el cierre de ese módulo): `setContent` y
 * `clearContent` deben ir en efectos SEPARADOS. Si un mismo useEffect
 * hace setContent() y devuelve clearContent() como cleanup, cada cambio
 * de dependencia (ej. el usuario escribiendo, que cambia `latex`)
 * dispara el cleanup antes de re-ejecutar el efecto — y clearContent()
 * pone isOpen:false, cerrando el panel solo mientras se escribe. Patrón
 * correcto: un efecto con dependencias reales que solo llama setContent
 * (nunca toca isOpen), y un efecto aparte con deps `[]` cuyo cleanup
 * llama clearContent (se dispara una sola vez, al desmontar).
 *
 * CORRECCIÓN post-Módulo 7 (paridad con Lite): en <768px el dock ya NO
 * muestra el grid completo de basicContent — se oculta con CSS y
 * aparece una fila compacta (Calcular/⌫/Expandir). Esa fila necesita
 * los mismos callbacks por separado — de ahí `compactActions`. El grid
 * completo se sigue renderizando en móvil, pero dentro del panel
 * expandido. Mismo patrón de dos-efectos aplica a
 * setCompactActions/clearCompactActions.
 */

interface KeyboardPanelState {
  isOpen: boolean;
  /** Contenido actual del panel expandido — normalmente un <NaturalMathKeyboard
   * .../> ya configurado por el modo activo.
   * `null` cuando el modo activo no usa teclado matemático (ej. Matrices,
   * Estadística, Unidades — spec §11, fuera de alcance de este track). */
  content: ReactNode | null;
  /** Contenido del panel básico (dígitos/operadores/relacionales/
   * variables/constantes). Visible SIEMPRE en el dock a partir de
   * tablet (md, ≥768px); en móvil se oculta ahí y se muestra dentro del
   * panel expandido en su lugar (ver corrección arriba). */
  basicContent: ReactNode | null;
  /** Acciones de la fila compacta del dock en móvil (Calcular/⌫). */
  compactActions: { onEnter: () => void; onBackspace: () => void } | null;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setContent: (content: ReactNode) => void;
  clearContent: () => void;
  setBasicContent: (content: ReactNode) => void;
  clearBasicContent: () => void;
  setCompactActions: (actions: { onEnter: () => void; onBackspace: () => void }) => void;
  clearCompactActions: () => void;
}

export const useKeyboardPanelStore = create<KeyboardPanelState>((set) => ({
  isOpen: false,
  content: null,
  basicContent: null,
  compactActions: null,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s: KeyboardPanelState) => ({ isOpen: !s.isOpen })),
  setContent: (content) => set({ content }),
  clearContent: () => set({ content: null, isOpen: false }),
  setBasicContent: (basicContent) => set({ basicContent }),
  clearBasicContent: () => set({ basicContent: null }),
  setCompactActions: (compactActions) => set({ compactActions }),
  clearCompactActions: () => set({ compactActions: null }),
}));
