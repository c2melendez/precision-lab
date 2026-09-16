import { useEffect, useRef, useState } from "react";
import { useLayoutModeStore } from "../store/useLayoutModeStore";

/**
 * AjustesPopover.tsx — Módulo 6 (hoja-de-ruta-visual.md §6 / log §7 /
 * spec §7). Reemplaza a ThemeToggle.tsx (ciclo de 3 estados) por un
 * popover de engranaje con selección directa entre 4 temas + el toggle
 * Fusionada/Separada. ThemeToggle.tsx se deja en el repo sin usar (no se
 * borra) por si hace falta su lógica de ciclo más adelante.
 *
 * Temas: mismo mecanismo que ThemeToggle (atributo `data-theme` en
 * <html>, persistido en localStorage con la MISMA clave que ya usaba
 * ThemeToggle — así una preferencia guardada antes de este módulo sigue
 * siendo válida). Azul SaaS es el 4º tema, tokens confirmados en
 * design-tokens.css.
 *
 * Sistema de temas preparado para crecer (log §7, "10 temas propuestos"):
 * agregar uno nuevo es un bloque en design-tokens.css + una línea en
 * THEMES de abajo. Corrección post-auditoría: los 9 que quedaban
 * pendientes ya están implementados (colores elegidos por criterio propio,
 * ver comentario de cabecera en design-tokens.css) — quedan agrupados por
 * familia visual (oscuros / claros / alto contraste) en el propio array,
 * no en el orden en que se propusieron en el log.
 */

type Theme =
  | "dark"
  | "light"
  | "high-contrast"
  | "saas-blue"
  | "mint"
  | "sepia"
  | "midnight-purple"
  | "coral"
  | "graphite"
  | "amber-light"
  | "cyan-tech"
  | "deep-forest"
  | "high-contrast-blue";
const THEME_STORAGE_KEY = "precision-lab-theme";

const THEMES: { id: Theme; label: string }[] = [
  { id: "dark", label: "Oscuro" },
  { id: "light", label: "Claro" },
  { id: "high-contrast", label: "Alto contraste" },
  { id: "saas-blue", label: "Azul SaaS" },
  { id: "midnight-purple", label: "Medianoche Púrpura" },
  { id: "graphite", label: "Grafito Monocromo" },
  { id: "cyan-tech", label: "Cian Tecnológico" },
  { id: "deep-forest", label: "Bosque Profundo" },
  { id: "mint", label: "Menta" },
  { id: "sepia", label: "Sepia Cuaderno" },
  { id: "coral", label: "Coral" },
  { id: "amber-light", label: "Ámbar Claro" },
  { id: "high-contrast-blue", label: "Alto Contraste Azul" },
];

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function readInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
  return stored && THEMES.some((t) => t.id === stored) ? stored : "dark";
}

export function AjustesPopover() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const layoutMode = useLayoutModeStore((s) => s.layoutMode);
  const setLayoutMode = useLayoutModeStore((s) => s.setLayoutMode);

  useEffect(() => {
    const initial = readInitialTheme();
    setTheme(initial);
    applyTheme(initial);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function pickTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Ajustes"
        aria-expanded={open}
        className="rounded-md bg-chrome-soft p-1.5 text-bone hover:bg-chrome-soft/70"
      >
        <span aria-hidden="true">⚙</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 w-56 rounded-lg border border-chrome-soft bg-chrome p-3 shadow-xl"
        >
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-bone/50">Tema</div>
            {/* Corrección post-auditoría: con 13 temas (antes 4) la lista ya
             * no entra siempre en la altura del viewport en móvil dentro
             * de un popover anclado al header — se agrega scroll propio
             * para no empujar "Vista de resultado" fuera de pantalla. */}
            <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTheme(t.id)}
                  aria-pressed={theme === t.id}
                  className={
                    theme === t.id
                      ? "rounded px-2 py-1 text-left text-xs font-medium text-marker"
                      : "rounded px-2 py-1 text-left text-xs text-bone/80 hover:bg-chrome-soft"
                  }
                >
                  {theme === t.id ? "✓ " : ""}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-bone/50">Vista de resultado</div>
            <div className="flex gap-1 rounded-md bg-chrome-soft p-0.5">
              <button
                type="button"
                onClick={() => setLayoutMode("fused")}
                aria-pressed={layoutMode === "fused"}
                className={
                  layoutMode === "fused"
                    ? "flex-1 rounded bg-marker py-1 text-xs font-medium text-chrome"
                    : "flex-1 rounded py-1 text-xs text-bone/70 hover:bg-chrome/40"
                }
              >
                Fusionada
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("separated")}
                aria-pressed={layoutMode === "separated"}
                className={
                  layoutMode === "separated"
                    ? "flex-1 rounded bg-marker py-1 text-xs font-medium text-chrome"
                    : "flex-1 rounded py-1 text-xs text-bone/70 hover:bg-chrome/40"
                }
              >
                Separada
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
