# LOG — Auditoría de Módulos A-D (motor matemático) + rediseño de teclado

Fecha: septiembre 2026. Alcance: auditar el trabajo entregado en
`precision-lab-main_CORREGIDO.zip` contra `spec_motor_matematico_pendiente.md`,
`plantilla_modulos_motor_matematico.md` y `spec_teclado_virtual.md`, verificar
con ejecución real (backend levantado, llamadas en vivo, `pytest`, y el
frontend con `tsc`/`vitest`/`build`) que no hay errores, corregir lo que se
encontró roto, y subir a GitHub. Se mantuvo paridad con la auditoría en
paralelo de `precision-lab-lite` (mismos módulos, mismos hallazgos donde
el diseño es compartido).

## Módulo A — Hiperbólicas inversas recíprocas

Correcto. Las 6 hiperbólicas inversas (`asinh, acosh, atanh, asech, acsch,
acoth`) están en `ALLOWED_FUNCTIONS` (`app/services/parsing.py`), nativas
de SymPy, sin necesidad de reescritura. Verificado en vivo contra el
servidor real: `asech(0.5)`, `acsch(2)`, `acoth(3)` dan resultados que
coinciden con Lite hasta ~15 cifras (paridad numérica confirmada, no solo
declarada).

Tests nuevos: `tests/test_modulos_abc_auditoria.py::test_reciprocal_inverse_hyperbolics`.

## Módulo B — Sistema de ecuaciones lineales 5×5

Correcto. Verificado en vivo contra `/solve/system`: sistema único
(`x1=1,...,x5=5`), compatible indeterminado (fila dependiente, da
solución paramétrica con variable libre) e incompatible (`success: true`,
`result_data: []`, warning explícito "inconsistente") — los 3 casos se
distinguen bien, sin un "no resuelto" genérico.

`tests/test_phase2.py::test_solve_system_is_unsupported_stub` estaba
**obsoleto** — asumía que el endpoint seguía siendo un stub "no
soportado" de la Fase 1, pero ya es funcionalidad real desde antes de
esta auditoría (o desde el propio Módulo B). Corregido para verificar el
comportamiento real (rechazo de una inyección tipo `eval(1)=0` con
`PARSE_ERROR`) en vez del comportamiento viejo.

Tests nuevos: `tests/test_modulos_abc_auditoria.py::test_5x5_unique_solution`,
`test_5x5_infinite_solutions`, `test_5x5_inconsistent`.

## Módulo C — Sistema de inecuaciones lineales

El backend replica el mismo diseño que Lite (exactamente 2 variables,
vértices del polígono factible, `/inequality/system`,
`app/services/linear_inequality_system.py`) — mismo comentario en el
código sobre "diseño confirmado explícitamente por el usuario", **sin
forma de verificar esa confirmación de manera independiente**; queda
anotado para que Carlos lo confirme si hace falta.

**Bug real encontrado y corregido (mismo bug, mismo motivo que en Lite —
el diseño se implementó de forma espejada en ambos motores, así que el
error también se replicó):** `_compute_vertices`/`_is_bounded` no
distinguía una región **vacía** (`x≥5, x≤1`, rectas paralelas sin
intersección factible) de una región **no acotada** (`x≥0, x≤1`, franja
infinita) — ambos casos dan 0 vértices, y `_is_bounded()` solo evaluaba
el cono de recesión (versión homogénea), nunca la factibilidad real del
sistema original.

Corregido reemplazando `_compute_vertices`/`_is_bounded` por un recorte
de semiplanos (Sutherland-Hodgman) contra una caja grande
(`_feasible_region()`): si el polígono resultante queda vacío → `empty`;
si toca el borde de la caja → `unbounded` (solo vértices finitos); si no
→ `bounded`. Mismo fix aplicado en paralelo en `precision-lab-lite`
(`linearInequalitySystem.ts`).

`tests/test_phase2.py::test_inequality_is_unsupported_stub` (endpoint de
1 variable, no el de sistema) también estaba obsoleto por el mismo
motivo — corregido.

Tests nuevos: `tests/test_modulos_abc_auditoria.py` — 6 casos, incluidos
los 2 que expusieron el bug (`test_inequality_system_empty_region_via_parallel_constraints`,
`test_inequality_system_unbounded_strip_not_confused_with_empty`).

## Módulo D — Notación de grados D°M′S″

El backend no parsea `°` directamente — decisión de arquitectura (no un
hueco): tanto `precision-lab-lite` (`normalize.ts`) como el frontend de
este proyecto (`frontend/src/components/NaturalMathField.tsx`) convierten
`D°M′S″`/`°` a `(...)*pi/180` del lado del cliente antes de enviar la
expresión a `/evaluate`. Verificado en vivo con la expresión ya
convertida: `(90)*pi/180 = π/2`, `(45+30/60)*pi/180 = 45.5°` en radianes.

## Hallazgos adicionales de esta auditoría (fuera de los 4 módulos, pero
## necesarios para que todo compile y funcione)

- `frontend/src/types/api.ts` (generado desde el OpenAPI del backend con
  `openapi-typescript`) estaba desactualizado — no incluía
  `inequality_system`, rompiendo `tsc --noEmit` del frontend. Regenerado
  contra el backend real corriendo (`npm run generate-types` apuntando a
  `http://127.0.0.1:8000/api/v1/openapi.json`).
- `frontend/src/api/client.ts` — el mapa `ENDPOINT_TO_OPERATION` no tenía
  la entrada `"/inequality/system": "inequality_system"`, a pesar de que
  `KnownEndpoint` (`endpoints.ts`) sí incluía la ruta — esto por sí solo
  ya rompía el typecheck (el tipo `Record<KnownEndpoint, ...>` exige
  ambos en sincronía).
- `frontend/src/__tests__/BasicMode.test.tsx` — un test que hacía clic en
  la tecla "derivada" del teclado quedó desactualizado tras el rediseño
  del teclado: `BasicMode` ya no renderiza `<NaturalMathKeyboard>` inline,
  solo registra su contenido en `useKeyboardPanelStore` para que
  `<KeyboardDock>`/`<KeyboardPanel>` (montados en `App.tsx`) lo rendericen.
  El test renderizaba `<BasicMode />` aislado, así que el teclado nunca
  llegaba al DOM. Corregido agregando un pequeño harness que suscribe el
  store y renderiza su contenido, más un clic previo para abrir la
  categoría colapsable "Cálculo" (donde vive la tecla "derivada" en el
  nuevo diseño).

## Estado final verificado

Backend: `pytest` 189/194 (5 fallas preexistentes y fuera de alcance de
esta auditoría: `integral/improper`, `graph/3d`, `graph/parametric`,
`derivative/partial`, `derivative/implicit` — endpoints todavía sin
implementar, documentado en auditorías anteriores).
Frontend: `tsc --noEmit` limpio, `npx vitest run` 150/150, `npm run build`
limpio (mismo warning preexistente de tamaño de chunk, no es error).

## Pendiente para una sesión futura

- Confirmar con Carlos que el diseño del Módulo C fue efectivamente
  aprobado antes de escribirse, en ambos motores.
- Las 5 fallas preexistentes de `test_phase2.py` (features todavía sin
  implementar) siguen ahí — no se tocaron, están fuera del alcance de
  esta auditoría (Módulos A-D del motor matemático).
