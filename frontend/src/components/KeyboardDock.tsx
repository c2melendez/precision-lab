import { useKeyboardPanelStore } from "../store/useKeyboardPanelStore";
import { useLayoutModeStore } from "../store/useLayoutModeStore";
import { useMinWidthMediaQuery, FLOATING_MIN_WIDTH_PX } from "../hooks/useMinWidthMediaQuery";
import { KeyboardIcon } from "./KeyboardIcon";
import { KeyboardPanel } from "./KeyboardPanel";
import { RecentKeysBar } from "./RecentKeysBar";

/**
 * KeyboardDock.tsx — Módulo 0 + Módulo 1 + corrección post-Módulo 7 (idéntico a Lite, paridad obligatoria).
 *
 * Barra fija al fondo del viewport, siempre visible, montada una sola
 * vez en App.tsx (raíz) — persiste entre cambios de modo.
 *
 * Responsive (spec §8, corregido tras la auditoría del Módulo 7): a
 * partir de tablet (md, ≥768px) el dock muestra `basicContent` completo,
 * igual que desde el Módulo 1. En móvil (<768px) eso se oculta y en su
 * lugar aparece una fila compacta — Calcular / ⌫ / Expandir — como pide
 * la spec ("dock reducido a lo esencial"). El grid completo de
 * basicContent NO desaparece en móvil: se renderiza también dentro de
 * KeyboardPanel (oculto con `md:hidden` ahí, para no duplicarlo visualmente
 * en pantallas donde ya está en el dock) — tocar "Expandir" es cómo se
 * llega a los dígitos en móvil.
 *
 * "Expandir" queda habilitado si hay basicContent O content — antes del
 * Módulo 1 solo dependía de `content` (categorías), pero ahora en móvil
 * también hace falta para llegar al grid básico.
 *
 * Fase P (Rediseño visual, Módulo P2 — spec_rediseno_visual.md sección 3,
 * fila "Enfoque"): en layoutMode "focus" se fuerza el mismo criterio de
 * "dock reducido a lo esencial" que ya existe para móvil, pero en
 * CUALQUIER breakpoint (dt/laptop/tablet incluidos) — para maximizar el
 * área de resultado/gráfica. Esto implica también que el grid básico
 * completo, que en breakpoints ≥md normalmente vive directamente en el
 * dock (visible sin abrir el panel), en Focus deja de estar ahí — así
 * que debe volver a aparecer dentro de KeyboardPanel en TODOS los
 * breakpoints en Focus (no solo <768px como hoy), o los dígitos
 * quedarían inalcanzables en desktop bajo Focus — violaría la
 * restricción dura de dock siempre alcanzable.
 * Fase P, Módulo P3 ("Apilado"): la spec exige que ahí el teclado quede
 * "colapsado dentro del mismo flujo, NO overlay/bottom sheet" — lo
 * opuesto a como funciona este componente (siempre `fixed`, incluso
 * `KeyboardPanel.tsx` es `fixed inset-x-0 bottom-0` en todo breakpoint).
 * Para no tocar `KeyboardPanel.tsx`/`CATEGORY_MENUS` (zona de fricción
 * marcada con Track A, mapa de coordinación sección 3.4), Apilado NO usa
 * este dock ni ese panel: `Screen.tsx`/`CalculatorScreen.tsx` renderizan
 * su propia sección inline colapsable, leyendo el mismo
 * `useKeyboardPanelStore` directamente. Por eso este componente
 * simplemente no se renderiza cuando `layoutMode === "stacked"` — evita
 * tener dos UIs de teclado a la vez.
 * Fase P, Módulo P3 ("Apilado"): la spec exige que ahí el teclado quede
 * "colapsado dentro del mismo flujo, NO overlay/bottom sheet" — lo
 * opuesto a como funciona este componente (siempre `fixed`, incluso
 * `KeyboardPanel.tsx` es `fixed inset-x-0 bottom-0` en todo breakpoint).
 * Para no tocar `KeyboardPanel.tsx`/`CATEGORY_MENUS` (zona de fricción
 * marcada con Track A, mapa de coordinación sección 3.4), Apilado NO usa
 * este dock ni ese panel: `Screen.tsx`/`CalculatorScreen.tsx` renderizan
 * su propia sección inline colapsable, leyendo el mismo
 * `useKeyboardPanelStore` directamente. Por eso este componente
 * simplemente no se renderiza cuando `layoutMode === "stacked"` — evita
 * tener dos UIs de teclado a la vez.
 *
 * Fase P, Módulo P4 ("Flotante"): mismo criterio — cuando Flotante está
 * REALMENTE activo (viewport ≥ 1024px, ver useMinWidthMediaQuery.ts), el
 * teclado vive dentro de un <FloatingWindow> que renderiza
 * Screen.tsx/CalculatorScreen.tsx, así que este dock tampoco se monta
 * ahí. Pero Flotante degrada a Enfoque por debajo de 1024px (P0) — en
 * ese caso este dock SÍ debe montarse y comportarse exactamente como en
 * Enfoque (fila compacta forzada), o el teclado quedaría inalcanzable
 * en tablet/móvil bajo Flotante. Por eso el gating usa el MISMO hook
 * (`useMinWidthMediaQuery`) que usa el componente de contenido — si cada
 * uno tuviera su propia detección de breakpoint podrían desincronizarse
 * por un frame.
 */

export function KeyboardDock() {
  const isOpen = useKeyboardPanelStore((s) => s.isOpen);
  const content = useKeyboardPanelStore((s) => s.content);
  const basicContent = useKeyboardPanelStore((s) => s.basicContent);
  const compactActions = useKeyboardPanelStore((s) => s.compactActions);
  const toggle = useKeyboardPanelStore((s) => s.toggle);
  const close = useKeyboardPanelStore((s) => s.close);
  const layoutMode = useLayoutModeStore((s) => s.layoutMode);
  const isFloatingWideEnough = useMinWidthMediaQuery(FLOATING_MIN_WIDTH_PX);

  // Módulo P3: Apilado maneja su propia sección de teclado inline (ver
  // comentario de cabecera) — este dock fijo se retira por completo.
  if (layoutMode === "stacked") return null;

  // Módulo P4: Flotante realmente activo (viewport ancho) — el teclado
  // vive en su propia FloatingWindow, este dock no se monta.
  if (layoutMode === "floating" && isFloatingWideEnough) return null;

  // Módulo P2: en Enfoque, la fila compacta reemplaza al grid completo
  // en TODO breakpoint, no solo en móvil. Módulo P4: Flotante degradado
  // (viewport angosto) se comporta EXACTAMENTE igual que Enfoque — ver
  // comentario de cabecera.
  const forceCompactDock = layoutMode === "focus" || (layoutMode === "floating" && !isFloatingWideEnough);

  const hasAdvancedContent = content !== null;
  const hasBasicContent = basicContent !== null;
  const canExpand = hasAdvancedContent || hasBasicContent;

  return (
    <>
      {(content || basicContent) && (
        <KeyboardPanel isOpen={isOpen} onClose={close}>
          {/* Grid básico completo — visible en móvil SIEMPRE, y en
              cualquier breakpoint cuando layoutMode es "focus" (Módulo
              P2): ahí el dock no lo muestra directamente, así que debe
              seguir siendo alcanzable aquí dentro. */}
          {basicContent && <div className={forceCompactDock ? "mb-3" : "mb-3 md:hidden"}>{basicContent}</div>}
          {content}
        </KeyboardPanel>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-chrome-soft bg-chrome px-3 pb-[env(safe-area-inset-bottom)] pt-2">
        {/* Fase X, Módulo X0 (Smart Docks) — "justo arriba de donde
            aparecerá el teclado (colapsado o no)", confirmado por Carlos.
            Primera fila del mismo contenedor fijo: queda por encima del
            grid básico Y de la fila compacta en cualquier estado. */}
        <RecentKeysBar />
        {basicContent ? (
          <div className={forceCompactDock ? "hidden" : "mx-auto hidden max-w-md md:block"}>{basicContent}</div>
        ) : (
          <div className={forceCompactDock ? "hidden" : "hidden py-2 text-center text-xs text-bone/40 md:block"}>
            Sin teclado en este modo
          </div>
        )}

        {/* Fila compacta — móvil siempre, y cualquier breakpoint en Focus. */}
        <div className={forceCompactDock ? "grid grid-cols-3 gap-1.5" : "grid grid-cols-3 gap-1.5 md:hidden"}>
          <button
            type="button"
            onClick={() => compactActions?.onEnter()}
            disabled={!compactActions}
            aria-label="Calcular"
            className={
              compactActions
                ? "rounded-md bg-graph py-2 text-sm font-semibold text-paper hover:bg-graph/90"
                : "rounded-md bg-chrome-soft py-2 text-sm font-semibold text-bone/30"
            }
          >
            Calcular
          </button>
          <button
            type="button"
            onClick={() => compactActions?.onBackspace()}
            disabled={!compactActions}
            aria-label="Borrar"
            className={
              compactActions
                ? "rounded-md bg-chrome-soft py-2 text-sm text-bone hover:bg-chrome-soft/70"
                : "rounded-md bg-chrome-soft py-2 text-sm text-bone/30"
            }
          >
            ⌫
          </button>
          <button
            type="button"
            onClick={toggle}
            disabled={!canExpand}
            aria-expanded={isOpen}
            aria-label={isOpen ? "Cerrar teclado" : "Expandir teclado"}
            className={
              canExpand
                ? "flex items-center justify-center gap-1 rounded-md bg-marker py-2 text-sm font-semibold text-chrome hover:bg-marker/90"
                : "flex items-center justify-center gap-1 rounded-md bg-chrome-soft py-2 text-sm text-bone/30"
            }
          >
            {/* Fase Y (spec_rediseno_visual.md sección 11): "botón
                dedicado de teclado" — ícono outline en color de acento
                (ver KeyboardIcon.tsx). Este botón, siempre visible en la
                fila compacta, es ese botón dedicado. */}
            <KeyboardIcon className="h-4 w-4" />
            {isOpen ? "Cerrar" : "Expandir"}
          </button>
        </div>

        {/* Botón "Más funciones" — tablet+ normalmente; oculto en Focus
            (ahí "Expandir" de la fila compacta cumple ese rol siempre). */}
        <div className={forceCompactDock ? "hidden" : "mt-1.5 hidden justify-center md:flex"}>
          <button
            type="button"
            onClick={toggle}
            disabled={!hasAdvancedContent}
            aria-expanded={isOpen}
            aria-label={isOpen ? "Cerrar más funciones" : "Abrir más funciones"}
            className={
              hasAdvancedContent
                ? "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium text-bone/70 hover:bg-chrome-soft hover:text-bone"
                : "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium text-bone/20"
            }
          >
            <KeyboardIcon className="h-3.5 w-3.5" />
            <span>Más funciones</span>
          </button>
        </div>
      </div>
    </>
  );
}
