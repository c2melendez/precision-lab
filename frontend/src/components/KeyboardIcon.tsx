/**
 * KeyboardIcon.tsx — Fase Y (spec_rediseno_visual.md sección 11):
 * "icono outline estilo Tabler ti-keyboard o equivalente, en el color de
 * acento del tema activo" (referencia visual adjunta por Carlos,
 * 1789545181788_image.png: cuadrado redondeado con borde de acento y
 * glifo de teclado).
 *
 * DEDUCIBLE registrado: el proyecto nunca instaló una librería de
 * íconos (todo el resto de la UI usa glifos Unicode planos — KeyGlyph.tsx
 * es el mismo criterio) — en vez de agregar una dependencia nueva solo
 * para un ícono, se dibuja a mano un SVG outline equivalente al de
 * Tabler `ti-keyboard`, con `currentColor` para heredar el color de
 * acento de quien lo use (mismo patrón que cualquier ícono outline:
 * el consumidor controla el color vía `className`/`text-*`).
 */
export function KeyboardIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <line x1="6" y1="10" x2="6" y2="10" />
      <line x1="9.5" y1="10" x2="9.5" y2="10" />
      <line x1="13" y1="10" x2="13" y2="10" />
      <line x1="16.5" y1="10" x2="16.5" y2="10" />
      <line x1="6" y1="13.5" x2="6" y2="13.5" />
      <line x1="18" y1="13.5" x2="18" y2="13.5" />
      <line x1="9" y1="15.5" x2="15" y2="15.5" />
    </svg>
  );
}
