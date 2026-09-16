# Calculadora Científica Web (SymPy)

Calculadora científica y gráfica web que resuelve operaciones matemáticas
avanzadas y muestra el procedimiento paso a paso. Inspirada en Symbolab /
Wolfram Alpha en UX, sin pretender su cobertura completa desde esta entrega.

> Este README es el documento **final** del proyecto (Módulos 1-12
> completos). Se escribió incrementalmente, un módulo a la vez, y se cierra
> aquí contra el checklist completo de la sección 16 de la spec.

## Alcance actual del motor (verificado, auditoría de septiembre 2026)

Motor: SymPy, backend FastAPI (`backend/app/services/`). Auditado contra `spec_motor_matematico_pendiente.md` y `spec_teclado_virtual.md` con `pytest`, `tsc --noEmit`, `npx vitest run` y `npm run build` reales (backend y frontend), y llamadas en vivo al servidor — no solo lectura de código.

- **Hiperbólicas inversas recíprocas** (`asech`, `acsch`, `acoth`) — nativas de SymPy, agregadas a `ALLOWED_FUNCTIONS` (`app/services/parsing.py`) junto con `asinh/acosh/atanh`. Paridad numérica verificada en vivo contra `precision-lab-lite` para los mismos inputs (coincide hasta ~15 cifras).
- **Sistema de ecuaciones lineales, hasta 5×5** (`/solve/system`) — verificado en vivo: único, compatible indeterminado (solución paramétrica con variable libre) e incompatible (`result_data: []` + warning explícito) se distinguen correctamente, nunca un "no resuelto" genérico.
- **Sistema de inecuaciones lineales** (`/inequality/system`, `app/services/linear_inequality_system.py`) — mismo diseño que Lite: exactamente 2 variables, vértices del polígono factible, 3 estados (`bounded`/`unbounded`/`empty`). Sistemas no lineales o de 3+ variables se rechazan con `VALIDATION_ERROR` explícito.
  - **Corrección de auditoría** (mismo bug, mismo fix que en Lite, para mantener paridad): el diseño original confundía una región **vacía** (rectas paralelas sin intersección factible) con una región **no acotada** (franja infinita) cuando ambas dan 0 vértices, porque el chequeo de acotación original no verificaba la factibilidad real, solo el cono de recesión. Reemplazado por recorte de semiplanos (Sutherland-Hodgman) contra una caja grande. Ver `backend/tests/test_modulos_abc_auditoria.py`.
- **Notación de grados D°M′S″** — el backend no parsea `°` directamente; el frontend (`NaturalMathField.tsx`) convierte `D°M′S″`/`°` a `(...)*pi/180` (mismo criterio que Lite) antes de enviar la expresión a `/evaluate`. Verificado en vivo contra valores conocidos (`90° = π/2 rad`, `45°30′ = 45.5°`).

**Pendiente de confirmación con el usuario:** igual que en Lite, el diseño de la Fase C (vértices, 2 variables, steps en dos niveles) se documenta en el código como "confirmado explícitamente" sin que se pueda verificar esa confirmación desde el código en sí.

**Hallazgos de calidad de test corregidos en esta auditoría:**
- `tests/test_phase2.py` tenía 2 aserciones obsoletas (`test_solve_system_is_unsupported_stub`, `test_inequality_is_unsupported_stub`) que asumían que `/solve/system` e `/inequality` seguían siendo stubs "no soportado" — ya son funcionalidad real desde antes de esta auditoría. Actualizadas para reflejar el comportamiento actual sin perder su verificación original (que una inyección tipo `eval(1)=0` se rechaza con `PARSE_ERROR`).
- `frontend/src/types/api.ts` (generado desde el OpenAPI del backend) estaba desactualizado — no incluía `inequality_system`, rompiendo el `typecheck` del frontend. Regenerado contra el backend real.
- `frontend/src/api/client.ts` — `ENDPOINT_TO_OPERATION` no tenía la entrada para `/inequality/system`.
- Un test de `BasicMode.test.tsx` (clic en la tecla "derivada") no se había actualizado tras el rediseño del teclado (la tecla ahora vive en un store compartido, no inline en el modo) — actualizado para reflejar la arquitectura nueva.

**Estado verificado al cierre de esta auditoría:** backend `pytest` 189/194 (5 fallas preexistentes, fuera de alcance — `integral/improper`, `graph/3d`, `graph/parametric`, `derivative/partial`, `derivative/implicit`, todavía sin implementar); frontend `tsc --noEmit` limpio, `npx vitest run` 150/150, `npm run build` limpio (mismo warning preexistente de tamaño de chunk).

## Módulo de cierre — honestidad visual de teclas no disponibles y de alcance limitado

Cierre pequeño, deliberadamente acotado, previo a correr las tandas de EDO/variable compleja/reordenamiento/tooltips, rediseño visual y graficación/matrices/estadística/unidades. No adelanta ninguna fase de esas specs. Mismo cambio aplicado en paralelo a `precision-lab-lite` (paridad verificada con capturas de Chromium real en ambos repos).

- **Teclas `unavailable` en el panel de categorías** (`NaturalMathKeyboard.tsx`, renderizador genérico de `CATEGORY_MENUS`): antes se veían idénticas a una tecla activa — la única señal de que no funcionan (`Π`, `∂/∂x`) era un aviso emergente después de tocarlas. Ahora usan el mismo patrón gris/borde punteado que ya usaba `KeyboardBasicPanel.tsx` para `°` antes del Módulo D (`border-dashed border-bone/30 bg-chrome-soft/40 text-bone/40`).
- **"Sist. inecuaciones" (2 variables):** el botón es funcional (no `unavailable`) pero no comunicaba que el motor solo resuelve exactamente 2 variables (`linear_inequality_system.py`). Se agregó una etiqueta "2 var." en el propio botón y se amplió el texto del `aria-label` para que la limitación también llegue a lectores de pantalla — sin tocar `KeyDef` ni agregar campos nuevos, dejando esa decisión para `spec_edo_complejos_tooltips.md` Fase H.
- `CATEGORIES_BASIC_MODE`/`CATEGORIES_FULL` verificados sin cambios (Fase G de `spec_edo_complejos_tooltips.md` parte de ese estado exacto para su propio reordenamiento).
- Verificado: `tsc --noEmit` limpio, `npx vitest run` 150/150, `npm run build` limpio, capturas reales con Chromium (mobile) confirmando el resultado visual.

## Correcciones post-entrega

Aplicadas sobre el paquete final tras una auditoría de conformidad contra la
spec, antes de la primera puesta en marcha:

1. **`app/main.py`**: se fija `openapi_url="/api/v1/openapi.json"` (y
   `docs_url`/`redoc_url` bajo el mismo prefijo) para que
   `npm run generate-types` funcione tal como está escrito en
   `frontend/package.json`, sin dar `404`.
2. **`backend/tests/`**: se renombran `test_derivative.py` →
   `test_derivatives.py`, `test_integral.py` → `test_integrals.py`,
   `test_graph.py` → `test_graphing.py`, y se fusionan `test_matrix.py` +
   `test_matrix_determinant_inverse.py` en `test_matrices.py` — para
   coincidir exactamente con los nombres de archivo de la sección 12 de la
   spec. Ningún test se modificó en su contenido ni se perdió cobertura
   (19 casos de matrices preservados).

## Estado del proyecto

- [x] Módulo 1 — Estructura base, configuración, health, README skeleton
- [x] Módulo 2A — Schemas + skeleton de parsing + funciones de verificación
- [x] Módulo 2B — Parsing seguro + `/evaluate`
- [x] Módulo 3 — `/simplify`, `/factor`, `/expand`
- [x] Módulo 4 — Derivadas
- [x] Módulo 5 — Integrales
- [x] Módulo 6 — Ecuaciones (`solve`)
- [x] Módulo 7A — Matrices: operaciones básicas
- [x] Módulo 7B — Matrices: determinante e inversa
- [x] Módulo 8 — Graficación 2D
- [x] Módulo 9 — Stubs de Fase 2
- [x] Módulo 10 — Frontend: base, cliente API, stores
- [x] Módulo 11A — Frontend: modos de entrada
- [x] Módulo 11B — Frontend: panel de resultado, pasos, teclado
- [x] Módulo 12 — Frontend: gráficas, historial, E2E y cierre

## Requisitos previos

- Python 3.11+ (backend)
- Node.js 18+ (frontend — a partir del Módulo 10)

## Backend — instalación y ejecución

```bash
cd backend
pip install -r requirements.txt --break-system-packages   # o dentro de un venv, sin la flag
cp .env.example .env
uvicorn app.main:app --reload
```

`GET http://localhost:8000/api/v1/health` debe responder `{"status": "ok"}`.

## Frontend — instalación y ejecución

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Para regenerar `src/types/api.ts` desde el backend real:

```bash
# 1. Levantar el backend (ver arriba)
# 2. Desde frontend/:
npm run generate-types
```

> **Nota (corregido post-entrega)**: `app/main.py` ahora fija
> `openapi_url="/api/v1/openapi.json"` explícitamente en el constructor de
> `FastAPI(...)`, así que el esquema vive donde la spec (sección 9) y este
> script ya esperaban. Antes de esta corrección, FastAPI servía el OpenAPI
> en la raíz (`/openapi.json`) por defecto y el comando de arriba daba
> `404` — quedaba documentado como limitación conocida. `src/types/api.ts`
> se puede regenerar tal cual con el backend corriendo.

### Modos de entrada (Módulo 11A)

Seis componentes en `src/components/`, cada uno un formulario controlado
conectado a su endpoint real vía `callApi` (`src/api/client.ts`), con
validación de payload en cliente (no llama a la API si el payload sería
inválido) y la ayuda de multiplicación implícita visible en todos:

- `BasicMode` -> `POST /evaluate` (expresión, sustituciones, `angle_unit`).
- `DerivativeMode` -> `POST /derivative` (expresión, variable, orden 1-5).
- `IntegralMode` -> `POST /integral` (expresión, variable, límites —
  juntos o ninguno).
- `EquationMode` -> `POST /solve` (ecuación, variable opcional con ayuda
  sobre inferencia automática, `angle_unit`).
- `MatrixMode` -> `POST /matrix/operations` (operación, dimensión NxM
  seleccionable 1-6, todas las celdas requeridas).
- `GraphMode` -> `POST /graph/2d` (hasta 5 expresiones, dominio, muestreo,
  `angle_unit`); `GraphViewer` (Plotly, lazy) llegó en el Módulo 12 — ver
  más abajo.

`ResultPanel`/`StepList`/`MathKeyboard` llegan en el Módulo 11B — por ahora
cada modo muestra su `MathResponse` crudo como JSON.

**Hallazgo real del Módulo 11A**: en este entorno (jsdom 25 + Testing
Library), `fireEvent.click` sobre un `<button type="submit">` NO dispara
el evento `submit` del `<form>` que lo contiene — hay que usar
`fireEvent.submit(form)` directamente. Confirmado con un test de
depuración aislado antes de corregir los 6 archivos de test (16 llamadas
corregidas). Ver el cierre del Módulo 11A para el detalle.

### Panel de resultado, pasos y teclado (Módulo 11B)

- `ResultPanel` — reemplaza el JSON crudo del Módulo 11A en los 6 modos:
  estados carga/vacío/error/éxito, notación científica para
  `result_approx` extremo, `"Procedimiento resumido"` visible cuando
  `has_detailed_steps: false` (nunca como ausencia de resultado),
  `warnings` siempre visibles, botones "Copiar resultado"/"Copiar como
  LaTeX" (deshabilitado si `result_latex` es `null`).
- `StepList` — renderiza `MathResponse.steps` con `MathRenderer` para cada
  `latex_before`/`latex_after`.
- `MathKeyboard` — inserta texto ASCII (la sintaxis real que el backend
  parsea) en el campo enlazado; vista previa KaTeX best-effort con
  debounce de 300ms (conversión LOCAL aproximada, no un parser LaTeX
  completo — el backend sigue siendo la única fuente de verdad
  matemática). Integrado en `BasicMode`.
- `MathRenderer` — KaTeX SOLO vía su API segura (`katex.renderToString`);
  el texto nunca llega a `dangerouslySetInnerHTML` sin pasar antes por
  KaTeX (que sanea su propia salida). Fallback a texto plano si KaTeX no
  puede parsear el input.

**Hallazgo real del Módulo 11B**: en JSX, un atributo de string LITERAL
(`latex="\\left("`) **no** procesa secuencias de escape como un string JS
normal — queda como caracteres literales, no como el string con un solo
backslash que parece a simple vista. Hay que envolverlo en `{}` para que
se evalúe como expresión JS (`latex={"\\left("}`). Encontrado al depurar
por qué `MathRenderer` no caía a texto de respaldo con un LaTeX inválido —
KaTeX en realidad SÍ lanzaba error, pero para un string distinto
(doblemente escapado) al que yo creía estar probando. Documentado en el
propio test.

### Gráficas, historial, E2E y cierre (Módulo 12)

- `GraphViewer` — import **dinámico** real de `plotly.js-dist-min` (nunca
  en el bundle principal; confirmado en el build de producción: queda en
  un chunk JS separado, ~4.8MB, cargado solo cuando `GraphMode` recibe
  `graph_data`). `React.lazy` + `Suspense` en `GraphMode`. Botón
  "Descargar PNG" vía `Plotly.toImage()`. `null` en `y` (discontinuidades)
  corta la línea (`connectgaps: false`).
- `History` — conectado a `useHistoryStore`; cada submit exitoso o fallido
  de los 6 modos se registra vía `submitAndRecord` (`src/api/
  submitWithHistory.ts`, helper compartido). "Reusar" pasa por
  `reuseEntry` (valida `endpointUrl` contra `KNOWN_ENDPOINTS` antes de
  reejecutar — una entrada con un endpoint no reconocido muestra un error
  y NUNCA llama a la API).
- Accesibilidad final: skip-link al contenido principal, `aria-current` en
  el modo activo, `aria-expanded`/`aria-controls` en el toggle de
  historial, foco visible (`focus-visible:outline`) en todos los
  controles nuevos, `role="img"` con `aria-label` en el contenedor de
  Plotly.
- **Prueba E2E mínima** (`src/__tests__/e2e.test.tsx`, sección 15): `x**2`
  en modo Derivada → petición real (mock en la frontera de `fetch`, no de
  `callApi`) → `MathResponse` real → `steps` renderizados → guardado en
  historial (confirmado también en `localStorage`, no solo en memoria) →
  `reuseEntry` reconstruye el payload exacto y reejecuta la llamada.
  **Alcance**: E2E de integración de componentes React con `fetch`
  mockeado, no un E2E de navegador real vía Playwright/Cypress contra el
  backend en ejecución — no había mandato explícito de instalar esas
  herramientas y el flujo completo (parsing → derivada → verificación →
  HTTP → render → KaTeX → historial → reuse) sí se ejercita de punta a
  punta.

## Endpoints

### Fase 1

- `POST /api/v1/evaluate` — evalúa una expresión (numérico si no quedan
  variables libres tras `substitutions`, simbólico si quedan). Soporta
  `angle_unit` (`rad`/`deg`, limitado a funciones trig directas) y
  `substitutions` (deben parsear a valores puramente numéricos). Sin pasos
  detallados (`has_detailed_steps: false` siempre — `/evaluate` no genera
  procedimiento, sección 8).
- `POST /api/v1/simplify` — `sympy.simplify()`, un paso resumen,
  `has_detailed_steps: false` siempre.
- `POST /api/v1/expand` — `sympy.expand()`, un paso resumen,
  `has_detailed_steps: false` siempre. Reutiliza el límite de nodos de la
  etapa 9 (`check_complexity_limits`) sobre el resultado expandido ->
  `COMPLEXITY_LIMIT` si lo excede (ej. `(x+1)**60`, 298 nodos).
- `POST /api/v1/factor` — `sympy.factor()` + reconocimiento de patrón
  ("Diferencia de cuadrados", "Factor común", "Factorización de trinomio",
  `has_detailed_steps: true`) o resumen (`false`) si no encaja ninguno. Todo
  paso verificado con `verify_step_equivalence` antes de exponerse.
- `POST /api/v1/derivative` — `DerivativeStepEngine`: `ConstantRule`,
  `SumRule`, `PowerRule`, `ProductRule`, `QuotientRule`, `ChainRule`,
  `ElementaryFunctionRule` (tabla de 15 funciones: sin/cos/tan/sec/csc/cot,
  asin/acos/atan, sinh/cosh/tanh, log/exp/sqrt). `order` 1-5. Colapsa a
  cálculo directo (`has_detailed_steps: false` + warning) si se superan
  ~30 pasos acumulados o el presupuesto de tiempo. Verificación holística
  final contra `sympy.diff()` antes de exponer el procedimiento.
- `POST /api/v1/integral` — `manualintegrate` primero, mapeo de reglas a
  `Step` (potencia, exponencial, trigonométrica, sustitución u,
  integración por partes, suma término a término); regla no mapeada ->
  resumen; sin ninguna técnica reconocida -> fallback a `integrate()`
  directo con warning. Indefinidas incluyen `+ C` explícito en
  `result_latex`/`result_text`. Definidas: mínimo 3 pasos (antiderivada +
  Teorema Fundamental + sustitución de límites). Límites `oo`/`-oo` ->
  `UNSUPPORTED_IN_PHASE_1` con mensaje exacto que NO promete
  `/integral/improper` como alternativa (también es Fase 2).
- `POST /api/v1/solve` — sin variables libres -> `identity`/`contradiction`;
  variable inferida si es única (con warning) o `AMBIGUOUS_VARIABLE` si hay
  más de una; pasos verificados con `verify_equation_step_equivalence`
  (conjuntos solución, NUNCA la verificación escalar) para ecuaciones
  lineales y cuadráticas (fórmula general + discriminante); fallback a
  `solve()` directo en el resto. `angle_unit=deg`: conversión FINAL de las
  soluciones (radianes -> grados), acotada a ecuaciones con funciones trig
  directas de la variable.
- `POST /api/v1/matrix/operations` — suma/resta/multiplicación, un `Step`
  por celda hasta 4x4 (5x5/6x6: resultado directo, `has_detailed_steps:
  false`). Parser de celda restringido (sección 3): sin variables libres,
  solo `sqrt`/`abs` como funciones, `sympy.Rational` siempre. Dimensiones
  validadas ANTES de calcular (`DIMENSION_MISMATCH`). Pasos verificados con
  `verify_matrix_step_equivalence` (nunca la escalar).
- `POST /api/v1/matrix/determinant` — eliminación por filas con pivoteo
  parcial, un `Step` por operación de fila hasta 4x4 (5x5/6x6: resultado
  directo). `DIMENSION_MISMATCH` si no es cuadrada.
- `POST /api/v1/matrix/inverse` — Gauss-Jordan explícito sobre `[A|I] →
  [I|A⁻¹]`, un `Step` por operación elemental hasta 4x4. `DIMENSION_MISMATCH`
  si no es cuadrada, `SINGULAR_MATRIX` si el determinante es 0. Ambos
  endpoints colapsan a resultado directo con warning si el presupuesto de
  pasos/tiempo se excede (sección 6).
- `POST /api/v1/graph/2d` — hasta 5 expresiones, muestreo con `samples` o
  `GRAPH_2D_DEFAULT_POINTS`, dominio por defecto según `angle_unit` (rad:
  `[-10,10]`; deg: `[-360,360]`). `None` en `y` para discontinuidades/no
  reales (warning si >20%). `y_range`: percentiles 5-95, `None` si todos
  `None`, fallback `[-0.1,0.1]` si el rango es <1e-10. Solo un `x_min`/
  `x_max` especificado -> se ignoran ambos con warning explícito, dominio
  por defecto. `INVALID_VARIABLE` si una expresión usa una variable
  distinta de la de graficación. Funciones constantes válidas.

### Fase 2

Los 10 request schemas completos desde el Módulo 1 (`app/schemas/requests.py`).
Passthrough trivial REAL (`has_detailed_steps: false`, sin pasos):
- `POST /api/v1/matrix/eigen` — `Matrix.eigenvals()`/`eigenvects()`.
- `POST /api/v1/limit` — `sympy.limit()`.
- `POST /api/v1/series` — `sympy.series()` (incluye el término `O(...)` tal
  cual lo da SymPy).

El resto responde `success: false`, `error_code: UNSUPPORTED_IN_PHASE_1`,
**sin parsear ni ejecutar ninguna lógica de SymPy sobre el contenido de la
petición** (validado por test: una ecuación con una inyección obvia en
`/solve/system` devuelve `UNSUPPORTED_IN_PHASE_1`, no `PARSE_ERROR`):
`POST /api/v1/solve/system`, `/inequality`, `/integral/improper`,
`/graph/3d`, `/graph/parametric`, `/derivative/partial`,
`/derivative/implicit`.

### Ejemplos

```bash
curl -X POST http://localhost:8000/api/v1/evaluate \
  -H "Content-Type: application/json" \
  -d '{"expression": "√4+1"}'
# {"success": true, "result_approx": 3.0, "result_text": "1 + sqrt(4)", ...}

curl -X POST http://localhost:8000/api/v1/derivative \
  -H "Content-Type: application/json" \
  -d '{"expression": "x**2", "variable": "x", "order": 1}'
# {"success": true, "result_text": "2*x", "has_detailed_steps": true,
#  "steps": [{"title": "Regla de la potencia", "rule": "PowerRule", ...}]}

curl -X POST http://localhost:8000/api/v1/solve \
  -H "Content-Type: application/json" \
  -d '{"equation": "2*x+4=0"}'
# {"success": true, "result_type": "equation_solutions",
#  "result_data": [{"text": "-2", "latex": "-2", "is_complex": false}],
#  "warnings": ["Variable inferida automáticamente: 'x'."]}

curl -X POST http://localhost:8000/api/v1/integral/improper \
  -H "Content-Type: application/json" \
  -d '{"expression": "exp(-x)", "variable": "x", "lower_bound": "0", "upper_bound": "oo"}'
# {"success": false, "error_code": "UNSUPPORTED_IN_PHASE_1",
#  "error_message": "Esta funcionalidad está planificada para una fase
#  futura del proyecto y todavía no está disponible."}
```

## Procedimiento detallado vs. resultado directo

| Operación | Procedimiento detallado (`has_detailed_steps: true`) | Resultado directo (`false`) |
|---|---|---|
| `/evaluate` | Nunca — no genera pasos por diseño (sección 8) | Siempre |
| `/simplify` | Nunca — un paso resumen siempre | Siempre |
| `/expand` | Nunca — un paso resumen siempre | Siempre (o `COMPLEXITY_LIMIT` si excede nodos) |
| `/factor` | Si reconoce diferencia de cuadrados, factor común o trinomio, y verifica | Si no reconoce el patrón, o la verificación no da `VERIFIED` |
| `/derivative` | Si el árbol de reglas se ensambla y verifica contra `sympy.diff()`, y no excede ~30 pasos/tiempo | Si colapsa por presupuesto, o la verificación falla |
| `/integral` | Si `manualintegrate` mapea alguna regla y verifica | Si `DontKnowRule` (sin técnica) o la verificación falla |
| `/solve` | Ecuaciones lineales y cuadráticas, si verifica | Identity/contradiction, grado ≥3, no polinómicas, o verificación fallida |
| `/matrix/operations` | Hasta 4x4, si verifica | 5x5/6x6, o verificación fallida |
| `/matrix/determinant` | Hasta 4x4, si verifica | 5x5/6x6, o verificación fallida |
| `/matrix/inverse` | Hasta 4x4, si verifica | 5x5/6x6, o verificación fallida |
| `/graph/2d` | Nunca — no genera pasos | Siempre |
| Fase 2 (los 10 endpoints) | Nunca | Siempre (passthrough o stub) |

## Notas de contrato

- Todo endpoint (salvo `/health`) responde `200 OK` con un `MathResponse`
  cuyo campo `success` indica si la operación fue exitosa — un `200` **no**
  implica éxito; hay que revisar `success`/`error_code`.
- `angle_unit`: alcance limitado a `/evaluate`, `/solve`, `/graph/2d`, y
  dentro de estos, solo a funciones trigonométricas directas. Ver sección 3
  de la spec para el detalle completo.

## Validation

```bash
cd backend
pytest -v --tb=short
```

```bash
cd frontend
npm run test
npm run build       # incluye typecheck
npm run typecheck
npm run lint
```

Versión de SymPy usada: `1.13.3` (fijada, ver `backend/requirements.txt`).

## Verificación de pasos

Tres funciones distintas en `backend/app/services/step_verification.py`
(implementación completa desde el Módulo 2A), una por tipo de dato:
`verify_step_equivalence` (escalar), `verify_matrix_step_equivalence`
(matriz, celda a celda), `verify_equation_step_equivalence` (ecuación,
conjunto solución). Cada una devuelve `VERIFIED`/`REJECTED`/`INCONCLUSIVE`;
solo `VERIFIED` se expone al cliente como paso — el resto cae al resultado
resumen de la operación correspondiente.

## Limitaciones conocidas

- Multiplicación implícita entre variables multi-letra: `xy` (sin separador)
  se interpreta como un único identificador de 3+ letras, no como `x*y`. Usa
  espacio o `*` explícito entre variables (`x*y`). Ver sección 3 de la spec.
- La blocklist de identificadores del parser (basada en `dir(builtins)` de
  Python) bloquea nombres de variable razonables como `sum`, `max`, `min`,
  `type`, `id` — trade-off de seguridad consciente (Módulo 2B).
- `points_truncated: true` en `/graph/2d` (tope de 2500 puntos totales) y el
  colapso por presupuesto de tiempo en `/matrix/determinant`/`/inverse` no
  tienen un test que los dispare realmente — cubiertos por revisión de
  código y por el mismo patrón ya probado en `/derivative` (Módulos 7B, 8).
- La prueba E2E (Módulo 12) es de integración de componentes React con
  `fetch` mockeado, no de navegador real contra un backend en ejecución
  (no hay Playwright/Cypress instalado).

## Fuera de alcance (mejoras opcionales)

`docker-compose`, caché, i18n, worker pool con cancelación real, notación
científica en el parser, métricas, matriz de trazabilidad completa.
