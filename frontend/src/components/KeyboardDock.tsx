import { useKeyboardPanelStore } from "../store/useKeyboardPanelStore";
import { KeyboardPanel } from "./KeyboardPanel";

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
 */

export function KeyboardDock() {
  const isOpen = useKeyboardPanelStore((s) => s.isOpen);
  const content = useKeyboardPanelStore((s) => s.content);
  const basicContent = useKeyboardPanelStore((s) => s.basicContent);
  const compactActions = useKeyboardPanelStore((s) => s.compactActions);
  const toggle = useKeyboardPanelStore((s) => s.toggle);
  const close = useKeyboardPanelStore((s) => s.close);

  const hasAdvancedContent = content !== null;
  const hasBasicContent = basicContent !== null;
  const canExpand = hasAdvancedContent || hasBasicContent;

  return (
    <>
      {(content || basicContent) && (
        <KeyboardPanel isOpen={isOpen} onClose={close}>
          {/* Grid básico completo — visible SOLO en móvil dentro del
              panel (en tablet+ ya está en el dock, se ocultaría
              duplicado). */}
          {basicContent && <div className="mb-3 md:hidden">{basicContent}</div>}
          {content}
        </KeyboardPanel>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-chrome-soft bg-chrome px-3 pb-[env(safe-area-inset-bottom)] pt-2">
        {basicContent ? (
          <div className="mx-auto hidden max-w-md md:block">{basicContent}</div>
        ) : (
          <div className="hidden py-2 text-center text-xs text-bone/40 md:block">Sin teclado en este modo</div>
        )}

        {/* Fila compacta — solo móvil (<768px). */}
        <div className="grid grid-cols-3 gap-1.5 md:hidden">
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
                ? "rounded-md bg-marker py-2 text-sm font-semibold text-chrome hover:bg-marker/90"
                : "rounded-md bg-chrome-soft py-2 text-sm text-bone/30"
            }
          >
            {isOpen ? "Cerrar" : "Expandir"} {isOpen ? "▾" : "▴"}
          </button>
        </div>

        {/* Botón "Más funciones" — solo tablet+ (en móvil ese rol lo
            cumple "Expandir" de la fila compacta de arriba). */}
        <div className="mt-1.5 hidden justify-center md:flex">
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
            <span>Más funciones</span>
            <span aria-hidden="true">{isOpen ? "▾" : "▴"}</span>
          </button>
        </div>
      </div>
    </>
  );
}
