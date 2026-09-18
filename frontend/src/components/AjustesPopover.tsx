import { useEffect, useRef, useState } from "react";
import { useLayoutModeStore } from "../store/useLayoutModeStore";
import { GRAPH_COLOR_PALETTES, useGraphColorPaletteStore } from "../store/useGraphColorPaletteStore";
import {
  readSoundEnabled,
  readVibrationEnabled,
  setSoundEnabled as persistSoundEnabled,
  setVibrationEnabled as persistVibrationEnabled,
} from "../utils/keyFeedback";

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

type ConcreteTheme =
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

/**
 * Fase U, Módulo U0 — Tema automático. "auto" es una SELECCIÓN, no un
 * tema concreto: nunca se escribe tal cual en `data-theme` (design-tokens.css
 * no tiene bloque para "auto"). Se resuelve siempre a "dark" o "light"
 * según `prefers-color-scheme` del sistema — Alto Contraste y los 9 temas
 * adicionales quedan fuera del modo automático a propósito (spec Fase U:
 * "quedan como elección manual exclusivamente").
 */
type Theme = ConcreteTheme | "auto";
const THEME_STORAGE_KEY = "precision-lab-theme";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(selection: Theme): ConcreteTheme {
  if (selection === "auto") return systemPrefersDark() ? "dark" : "light";
  return selection;
}

/**
 * Fase Q, Módulo Q0 — Densidad de interfaz. Mismo mecanismo que el tema
 * (atributo en <html>, persistido en localStorage) pero con
 * `data-density` en vez de `data-theme` — ver design-tokens.css para el
 * porqué de por qué esto alcanza sin tocar componentes individuales.
 * Independiente de tema y de layoutMode (Fase P) — combinable con
 * cualquiera de los dos sin conflicto, porque no comparte ningún
 * selector CSS con ellos.
 */
type Density = "compact" | "comfortable";
const DENSITY_STORAGE_KEY = "precision-lab-density";

function applyDensity(density: Density) {
  document.documentElement.setAttribute("data-density", density);
  localStorage.setItem(DENSITY_STORAGE_KEY, density);
}

function readInitialDensity(): Density {
  const stored = localStorage.getItem(DENSITY_STORAGE_KEY);
  return stored === "compact" ? "compact" : "comfortable";
}

/**
 * Fase R, Módulo R0 — Accesibilidad tipográfica. Mismo mecanismo
 * (atributo en <html> + localStorage) que tema/densidad.
 */
type TextSize = "normal" | "large" | "xlarge";
const TEXT_SIZE_STORAGE_KEY = "precision-lab-text-size";
const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "large", label: "Grande" },
  { id: "xlarge", label: "Muy grande" },
];

function applyTextSize(size: TextSize) {
  document.documentElement.setAttribute("data-text-size", size);
  localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
}

function readInitialTextSize(): TextSize {
  const stored = localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
  return TEXT_SIZES.some((t) => t.id === stored) ? (stored as TextSize) : "normal";
}

const DYSLEXIA_STORAGE_KEY = "precision-lab-dyslexia-friendly";

function applyDyslexiaFriendly(enabled: boolean) {
  document.documentElement.setAttribute("data-dyslexia-friendly", String(enabled));
  localStorage.setItem(DYSLEXIA_STORAGE_KEY, String(enabled));
}

function readInitialDyslexiaFriendly(): boolean {
  return localStorage.getItem(DYSLEXIA_STORAGE_KEY) === "true";
}

/**
 * Fase S, Módulo S0 — Reducir movimiento.
 *
 * Tres estados posibles en localStorage, no dos: ausente (el usuario
 * nunca tocó el toggle → seguir `prefers-reduced-motion` del sistema,
 * y seguir escuchando sus cambios), "true" (forzado, manual), "false"
 * (forzado, manual). Una vez el usuario toca el toggle, pasa a "true" u
 * "false" para siempre — deja de escuchar el sistema, como pide el spec
 * ("el toggle manual, una vez usado, tiene prioridad").
 */
const REDUCED_MOTION_STORAGE_KEY = "precision-lab-reduced-motion";

function systemPrefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hasManualReducedMotionOverride(): boolean {
  const stored = localStorage.getItem(REDUCED_MOTION_STORAGE_KEY);
  return stored === "true" || stored === "false";
}

function computeReducedMotion(): boolean {
  const stored = localStorage.getItem(REDUCED_MOTION_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return systemPrefersReducedMotion();
}

function applyReducedMotion(enabled: boolean) {
  document.documentElement.setAttribute("data-reduced-motion", String(enabled));
}

const THEMES: { id: Theme; label: string }[] = [
  { id: "auto", label: "Automático (sistema)" },
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

function applyTheme(selection: Theme) {
  // Persistimos la SELECCIÓN ("auto" incluido), pero `data-theme` siempre
  // lleva el tema concreto resuelto — así design-tokens.css no necesita
  // saber que "auto" existe.
  document.documentElement.setAttribute("data-theme", resolveTheme(selection));
  localStorage.setItem(THEME_STORAGE_KEY, selection);
}

function readInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
  return stored && THEMES.some((t) => t.id === stored) ? stored : "dark";
}

export function AjustesPopover() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [density, setDensity] = useState<Density>("comfortable");
  const [textSize, setTextSize] = useState<TextSize>("normal");
  const [dyslexiaFriendly, setDyslexiaFriendly] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const layoutMode = useLayoutModeStore((s) => s.layoutMode);
  const setLayoutMode = useLayoutModeStore((s) => s.setLayoutMode);
  const graphPaletteId = useGraphColorPaletteStore((s) => s.paletteId);
  const setGraphPaletteId = useGraphColorPaletteStore((s) => s.setPaletteId);

  useEffect(() => {
    const initial = readInitialTheme();
    setTheme(initial);
    applyTheme(initial);
    const initialDensity = readInitialDensity();
    setDensity(initialDensity);
    applyDensity(initialDensity);
    const initialTextSize = readInitialTextSize();
    setTextSize(initialTextSize);
    applyTextSize(initialTextSize);
    const initialDyslexiaFriendly = readInitialDyslexiaFriendly();
    setDyslexiaFriendly(initialDyslexiaFriendly);
    applyDyslexiaFriendly(initialDyslexiaFriendly);
    const initialReducedMotion = computeReducedMotion();
    setReducedMotion(initialReducedMotion);
    applyReducedMotion(initialReducedMotion);
    // Módulo V0: sin `applyX` propio — estas dos no escriben ningún
    // atributo en <html>, `triggerKeyFeedback()` lee `localStorage`
    // directamente en cada pulsación (ver utils/keyFeedback.ts).
    setVibrationEnabled(readVibrationEnabled());
    setSoundEnabled(readSoundEnabled());
  }, []);

  useEffect(() => {
    // Módulo S0: mientras el usuario NUNCA haya tocado el toggle, seguir
    // los cambios en vivo de prefers-reduced-motion del sistema (ej. lo
    // activa en las preferencias del SO sin recargar la página). En
    // cuanto exista un override manual, este listener deja de aplicar
    // cambios — el toggle manual manda, como pide el spec.
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    function onSystemChange() {
      if (hasManualReducedMotionOverride()) return;
      setReducedMotion(mql.matches);
      applyReducedMotion(mql.matches);
    }
    mql.addEventListener("change", onSystemChange);
    return () => mql.removeEventListener("change", onSystemChange);
  }, []);

  useEffect(() => {
    // Módulo U0: si la selección actual es "auto", seguir en vivo los
    // cambios de prefers-color-scheme del sistema (ej. el usuario cambia
    // de claro a oscuro en el SO sin recargar). No usamos el `theme` del
    // closure para decidir si aplica — leemos el valor guardado en cada
    // evento, igual que el listener de reducir movimiento, para no
    // depender de reordenar efectos.
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystemThemeChange() {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored !== "auto") return;
      document.documentElement.setAttribute("data-theme", resolveTheme("auto"));
    }
    mql.addEventListener("change", onSystemThemeChange);
    return () => mql.removeEventListener("change", onSystemThemeChange);
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

  function pickDensity(next: Density) {
    setDensity(next);
    applyDensity(next);
  }

  function pickTextSize(next: TextSize) {
    setTextSize(next);
    applyTextSize(next);
  }

  function toggleDyslexiaFriendly() {
    const next = !dyslexiaFriendly;
    setDyslexiaFriendly(next);
    applyDyslexiaFriendly(next);
  }

  function toggleReducedMotion() {
    const next = !reducedMotion;
    setReducedMotion(next);
    applyReducedMotion(next);
    // A partir de aquí queda como override manual permanente — "false"
    // explícito, no ausente, para que el listener del sistema de arriba
    // deje de tocarlo (hasManualReducedMotionOverride() ahora es true).
    localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, String(next));
  }

  function toggleVibration() {
    const next = !vibrationEnabled;
    setVibrationEnabled(next);
    persistVibrationEnabled(next);
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    persistSoundEnabled(next);
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
            {/* Fase P: grilla de 6 disposiciones, todas con render propio
                desde el Módulo P4 (Fusionada/Separada preexistentes;
                Dividida P1, Enfoque P2, Apilado P3, Flotante P4). */}
            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-bone/50">Disposición de pantalla</div>
            <div className="grid grid-cols-3 gap-1 rounded-md bg-chrome-soft p-0.5">
              <button
                type="button"
                onClick={() => setLayoutMode("fused")}
                aria-pressed={layoutMode === "fused"}
                className={
                  layoutMode === "fused"
                    ? "rounded bg-marker py-1 text-xs font-medium text-chrome"
                    : "rounded py-1 text-xs text-bone/70 hover:bg-chrome/40"
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
                    ? "rounded bg-marker py-1 text-xs font-medium text-chrome"
                    : "rounded py-1 text-xs text-bone/70 hover:bg-chrome/40"
                }
              >
                Separada
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("split")}
                aria-pressed={layoutMode === "split"}
                className={
                  layoutMode === "split"
                    ? "rounded bg-marker py-1 text-xs font-medium text-chrome"
                    : "rounded py-1 text-xs text-bone/70 hover:bg-chrome/40"
                }
              >
                Dividida
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("focus")}
                aria-pressed={layoutMode === "focus"}
                className={
                  layoutMode === "focus"
                    ? "rounded bg-marker py-1 text-xs font-medium text-chrome"
                    : "rounded py-1 text-xs text-bone/70 hover:bg-chrome/40"
                }
              >
                Enfoque
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("stacked")}
                aria-pressed={layoutMode === "stacked"}
                className={
                  layoutMode === "stacked"
                    ? "rounded bg-marker py-1 text-xs font-medium text-chrome"
                    : "rounded py-1 text-xs text-bone/70 hover:bg-chrome/40"
                }
              >
                Apilado
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("floating")}
                aria-pressed={layoutMode === "floating"}
                className={
                  layoutMode === "floating"
                    ? "rounded bg-marker py-1 text-xs font-medium text-chrome"
                    : "rounded py-1 text-xs text-bone/70 hover:bg-chrome/40"
                }
              >
                Flotante
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-bone/50">Densidad</div>
            <div className="flex gap-1 rounded-md bg-chrome-soft p-0.5">
              <button
                type="button"
                onClick={() => pickDensity("comfortable")}
                aria-pressed={density === "comfortable"}
                className={
                  density === "comfortable"
                    ? "flex-1 rounded bg-marker py-1 text-xs font-medium text-chrome"
                    : "flex-1 rounded py-1 text-xs text-bone/70 hover:bg-chrome/40"
                }
              >
                Cómoda
              </button>
              <button
                type="button"
                onClick={() => pickDensity("compact")}
                aria-pressed={density === "compact"}
                className={
                  density === "compact"
                    ? "flex-1 rounded bg-marker py-1 text-xs font-medium text-chrome"
                    : "flex-1 rounded py-1 text-xs text-bone/70 hover:bg-chrome/40"
                }
              >
                Compacta
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-bone/50">
              Tamaño de texto (números y teclado)
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-md bg-chrome-soft p-0.5">
              {TEXT_SIZES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTextSize(t.id)}
                  aria-pressed={textSize === t.id}
                  className={
                    textSize === t.id
                      ? "rounded bg-marker py-1 text-xs font-medium text-chrome"
                      : "rounded py-1 text-xs text-bone/70 hover:bg-chrome/40"
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-bone/50">Espaciado amigable con dislexia</span>
            <button
              type="button"
              onClick={toggleDyslexiaFriendly}
              aria-pressed={dyslexiaFriendly}
              className={
                dyslexiaFriendly
                  ? "rounded bg-marker px-2.5 py-1 text-xs font-medium text-chrome"
                  : "rounded bg-chrome-soft px-2.5 py-1 text-xs text-bone/70 hover:bg-chrome/40"
              }
            >
              {dyslexiaFriendly ? "Activado" : "Desactivado"}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-bone/50">Reducir movimiento</span>
            <button
              type="button"
              onClick={toggleReducedMotion}
              aria-pressed={reducedMotion}
              className={
                reducedMotion
                  ? "rounded bg-marker px-2.5 py-1 text-xs font-medium text-chrome"
                  : "rounded bg-chrome-soft px-2.5 py-1 text-xs text-bone/70 hover:bg-chrome/40"
              }
            >
              {reducedMotion ? "Activado" : "Desactivado"}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-bone/50">Vibración al presionar tecla</span>
            <button
              type="button"
              onClick={toggleVibration}
              aria-pressed={vibrationEnabled}
              className={
                vibrationEnabled
                  ? "rounded bg-marker px-2.5 py-1 text-xs font-medium text-chrome"
                  : "rounded bg-chrome-soft px-2.5 py-1 text-xs text-bone/70 hover:bg-chrome/40"
              }
            >
              {vibrationEnabled ? "Activado" : "Desactivado"}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-bone/50">Sonido de clic</span>
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundEnabled}
              className={
                soundEnabled
                  ? "rounded bg-marker px-2.5 py-1 text-xs font-medium text-chrome"
                  : "rounded bg-chrome-soft px-2.5 py-1 text-xs text-bone/70 hover:bg-chrome/40"
              }
            >
              {soundEnabled ? "Activado" : "Desactivado"}
            </button>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-bone/50">Color de la gráfica</div>
            <div className="flex flex-col gap-1">
              {GRAPH_COLOR_PALETTES.map((palette) => (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => setGraphPaletteId(palette.id)}
                  aria-pressed={graphPaletteId === palette.id}
                  className={
                    graphPaletteId === palette.id
                      ? "flex items-center gap-2 rounded-md bg-marker-soft px-2 py-1.5 text-left"
                      : "flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-chrome-soft"
                  }
                >
                  <span className="flex shrink-0 gap-0.5">
                    {palette.colors.map((c, i) => (
                      <span key={i} className="h-3 w-3 rounded-full" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                  <span className="text-xs text-bone/80">{palette.label}</span>
                  {palette.colorBlindSafe && <span className="ml-auto text-[10px] text-bone/40">daltonismo</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
