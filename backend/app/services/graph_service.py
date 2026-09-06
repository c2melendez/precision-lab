"""
app/services/graph_service.py — `/graph/2d` (spec, sección 10, `Graph2DRequest`).
"""

from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from dataclasses import dataclass, field
from typing import List, Optional

import sympy
from sympy import S, cos, cot, csc, pi, sec, sin, tan
from sympy.calculus.util import continuous_domain, function_range

from app.core.config import get_settings
from app.schemas.responses import GraphAnalysis, GraphData, Trace
from app.services import parsing

_DIRECT_TRIG_FUNCTIONS = (sin, cos, tan, sec, csc, cot)

# Dominio por defecto según angle_unit (sección 10: "dominio por defecto
# según angle_unit"; la spec no fija los valores numéricos — decisión
# DEDUCIBLE, documentada en el cierre del Módulo 8): en radianes, [-10,10]
# (coincide con el default de Graph3DRequest, sección 2); en grados, un
# rango más amplio para cubrir al menos dos períodos completos de las
# funciones trig más comunes.
_DEFAULT_DOMAIN_RAD = (-10.0, 10.0)
_DEFAULT_DOMAIN_DEG = (-360.0, 360.0)

# Tope defensivo DEDUCIBLE (no fijado por la spec): evita que 5 expresiones
# a 1000 samples cada una (el máximo permitido por Graph2DRequest.samples)
# disparen 5000 evaluaciones numéricas por request. Si se excede, se reduce
# `samples` proporcionalmente y se marca `points_truncated: true`.
_MAX_TOTAL_POINTS = 2500

# Presupuesto de tiempo por cada sub-cálculo simbólico del análisis
# (dominio/rango/interceptos/extremos/inflexión) — cada uno es
# independiente, así que una expresión "difícil" para, digamos, `range`
# nunca bloquea `domain` ni la graficación numérica en sí (spec sección 6,
# mismo espíritu que el timeout de `step_verification`).
_ANALYSIS_TIMEOUT_S = 1.5
_MAX_INTERCEPTS_REPORTED = 8


def _run_with_timeout(func, timeout_s: float = _ANALYSIS_TIMEOUT_S):
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(func)
        try:
            return future.result(timeout=timeout_s)
        except FutureTimeoutError:
            return None
        except Exception:
            return None


def _format_real_roots(expr: sympy.Expr, var_symbol: sympy.Symbol) -> List[sympy.Expr]:
    """Raíces reales de `expr`, descartando complejas y duplicadas,
    limitadas a `_MAX_INTERCEPTS_REPORTED` (evita listas absurdas para
    expresiones periódicas sin acotar, p. ej. `sin(x)` tiene infinitas)."""
    solutions = sympy.solve(sympy.Eq(expr, 0), var_symbol)
    real_solutions = []
    for sol in solutions:
        if sol.is_real is False:
            continue
        try:
            if not sol.is_real and complex(sol.evalf()).imag != 0:
                continue
        except (TypeError, ValueError):
            continue
        real_solutions.append(sympy.nsimplify(sol) if sol.is_number else sol)
    # sympy.solve no garantiza orden; se ordena por valor numérico cuando es posible.
    try:
        real_solutions.sort(key=lambda s: float(s.evalf()))
    except (TypeError, ValueError):
        pass
    return real_solutions[:_MAX_INTERCEPTS_REPORTED]


def _classify_critical_points(
    expr: sympy.Expr, var_symbol: sympy.Symbol, x_min: float, x_max: float
) -> tuple[List[sympy.Expr], List[sympy.Expr]]:
    """Puntos críticos (derivada = 0) dentro de [x_min, x_max], clasificados
    por el signo de la segunda derivada (prueba de la segunda derivada
    estándar; si es 0/indeterminada, ese punto se omite en vez de
    adivinar)."""
    first_derivative = sympy.diff(expr, var_symbol)
    second_derivative = sympy.diff(expr, var_symbol, 2)
    critical_points = sympy.solve(sympy.Eq(first_derivative, 0), var_symbol)

    maxima, minima = [], []
    for point in critical_points:
        if not point.is_real:
            continue
        try:
            numeric_point = float(point.evalf())
        except (TypeError, ValueError):
            continue
        if not (x_min <= numeric_point <= x_max):
            continue
        second_at_point = second_derivative.subs(var_symbol, point)
        second_value = second_at_point.evalf()
        if not second_value.is_real:
            continue
        if second_value < 0:
            maxima.append(point)
        elif second_value > 0:
            minima.append(point)
    return maxima, minima


def _inflection_points(
    expr: sympy.Expr, var_symbol: sympy.Symbol, x_min: float, x_max: float
) -> List[sympy.Expr]:
    """Puntos donde la concavidad cambia: segunda derivada = 0 Y la
    tercera derivada es distinta de 0 ahí (confirma que SÍ hay cambio de
    signo, no solo un cero aislado de la segunda derivada)."""
    second_derivative = sympy.diff(expr, var_symbol, 2)
    third_derivative = sympy.diff(expr, var_symbol, 3)
    candidates = sympy.solve(sympy.Eq(second_derivative, 0), var_symbol)

    points = []
    for point in candidates:
        if not point.is_real:
            continue
        try:
            numeric_point = float(point.evalf())
        except (TypeError, ValueError):
            continue
        if not (x_min <= numeric_point <= x_max):
            continue
        third_value = third_derivative.subs(var_symbol, point).evalf()
        if third_value.is_real and third_value != 0:
            points.append(point)
    return points


def compute_analysis(
    expr: sympy.Expr, var_symbol: sympy.Symbol, x_min: float, x_max: float
) -> GraphAnalysis:
    """Análisis simbólico best-effort de una sola expresión (sección 8 del
    prompt de producto): dominio, rango, interceptos, máximos/mínimos
    locales, puntos de inflexión. Cada sub-cálculo tiene su propio
    presupuesto de tiempo independiente.

    `expr` llega con `evaluate=False` (mismo parser que usan los pasos
    detallados, sección 5) — eso deja coeficientes sin combinar
    (`x**2 - 1*4` en vez de `x**2 - 4`), lo que ensucia cualquier
    resultado que dependa de sustituir/evaluar (p. ej. "-1*4" en vez de
    "-4"). Se usa `sympy.expand()` para forzar la combinación antes de
    analizar — SOLO para este análisis, no afecta el resto del pipeline.
    """
    expr = sympy.expand(expr)
    analysis = GraphAnalysis()

    domain = _run_with_timeout(lambda: continuous_domain(expr, var_symbol, S.Reals))
    if domain is not None:
        analysis.domain_text = str(domain)
        analysis.domain_latex = sympy.latex(domain)

    range_result = _run_with_timeout(
        lambda: function_range(expr, var_symbol, domain if domain is not None else S.Reals)
    )
    if range_result is not None:
        analysis.range_text = str(range_result)
        analysis.range_latex = sympy.latex(range_result)

    y_intercept = _run_with_timeout(lambda: expr.subs(var_symbol, 0))
    if y_intercept is not None:
        evaluated = y_intercept.evalf()
        if evaluated.is_real and evaluated.is_finite:
            analysis.y_intercept = str(y_intercept)

    x_intercepts = _run_with_timeout(lambda: _format_real_roots(expr, var_symbol))
    if x_intercepts is not None:
        analysis.x_intercepts = [str(root) for root in x_intercepts]

    critical = _run_with_timeout(
        lambda: _classify_critical_points(expr, var_symbol, x_min, x_max)
    )
    if critical is not None:
        maxima, minima = critical
        analysis.local_maxima = [str(p) for p in maxima]
        analysis.local_minima = [str(p) for p in minima]

    inflection = _run_with_timeout(lambda: _inflection_points(expr, var_symbol, x_min, x_max))
    if inflection is not None:
        analysis.inflection_points = [str(p) for p in inflection]

    return analysis


class InvalidVariableError(ValueError):
    """La expresión contiene una variable libre distinta de la variable de
    graficación -> `ErrorCode.INVALID_VARIABLE`."""


@dataclass
class GraphResult:
    graph_data: GraphData
    warnings: List[str] = field(default_factory=list)


def _apply_degree_conversion(expr: sympy.Expr) -> sympy.Expr:
    """Igual que en `evaluate_service`/`solve_service`: grados -> radianes
    solo dentro de argumentos de funciones trig DIRECTAS."""

    def _is_direct_trig(node: sympy.Basic) -> bool:
        return isinstance(node, _DIRECT_TRIG_FUNCTIONS)

    def _convert(node: sympy.Basic) -> sympy.Basic:
        return node.func(node.args[0] * pi / 180)

    return expr.replace(_is_direct_trig, _convert)


def _validate_variable(variable: str) -> sympy.Symbol:
    candidates = parsing.extract_candidate_identifiers(variable)
    if candidates != [variable]:
        raise parsing.ParseSecurityError(f"Nombre de variable inválido: '{variable}'.")
    return sympy.Symbol(variable)


# Fix (suite de regresión, caso G007: 1/(x-2) da 7.27e+134 en vez de null
# justo en x=2). Al sustituir un float de Python en una expresión simbólica
# y hacer `.evalf()`, el denominador de una asíntota exacta no siempre da
# EXACTAMENTE 0 (representación interna de Float en SymPy) — así que
# `1/épsilon_diminuto` da un número gigante pero finito, que el chequeo de
# `zoo/oo/-oo/nan` no atrapa (esos son infinitos SIMBÓLICOS, no un float
# enorme). Cualquier valor por encima de este umbral es, para efectos de
# graficar, indistinguible de una asíntota real — se trata igual (`None`,
# corta la línea) en vez de mostrar un número sin sentido.
_ASYMPTOTE_MAGNITUDE_THRESHOLD = 1e10


def _evaluate_at(expr: sympy.Expr, var_symbol: sympy.Symbol, x_value: float) -> Optional[float]:
    try:
        value = expr.subs(var_symbol, x_value).evalf()
    except Exception:
        return None
    if value.has(sympy.zoo, sympy.oo, -sympy.oo, sympy.nan):
        return None
    if not value.is_real:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if result != result:  # NaN
        return None
    if abs(result) > _ASYMPTOTE_MAGNITUDE_THRESHOLD:
        return None
    return result


def _percentile(sorted_values: List[float], pct: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (pct / 100) * (len(sorted_values) - 1)
    lower = int(rank)
    upper = min(lower + 1, len(sorted_values) - 1)
    fraction = rank - lower
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * fraction


def _compute_y_range(y_values: List[Optional[float]]) -> Optional[List[float]]:
    finite_values = sorted(v for v in y_values if v is not None)
    if not finite_values:
        return None
    low = _percentile(finite_values, 5)
    high = _percentile(finite_values, 95)
    if (high - low) < 1e-10:
        return [-0.1, 0.1]
    return [low, high]


def _evaluate_at_2var(
    expr: sympy.Expr, x_symbol: sympy.Symbol, y_symbol: sympy.Symbol, x_value: float, y_value: float
) -> Optional[float]:
    """Igual que `_evaluate_at`, pero para superficies `f(x, y)` (2
    variables independientes en vez de 1)."""
    try:
        value = expr.subs({x_symbol: x_value, y_symbol: y_value}).evalf()
    except Exception:
        return None
    if value.has(sympy.zoo, sympy.oo, -sympy.oo, sympy.nan):
        return None
    if not value.is_real:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if result != result:  # NaN
        return None
    return result


_GRAPH_3D_GRID_SIZE = 40  # 40x40 = 1600 evaluaciones — tope defensivo fijo, análogo a _MAX_TOTAL_POINTS
_PARAMETRIC_SAMPLES = 300


class Graph3DResult:
    def __init__(self, graph_data: GraphData, warnings: List[str]):
        self.graph_data = graph_data
        self.warnings = warnings


def compute_graph_3d(
    expression: str,
    variables: List[str],
    x_range: List[float],
    y_range: List[float],
) -> Graph3DResult:
    """`/graph/3d` (spec, `Graph3DRequest`): superficie `z = f(x, y)`
    muestreada en una grilla fija (`_GRAPH_3D_GRID_SIZE` x
    `_GRAPH_3D_GRID_SIZE`) — a diferencia de `/graph/2d`, no hay parámetro
    `samples` en el request (superficie 3D siempre es más costosa que una
    curva 2D, así que el tamaño de grilla queda fijo en vez de
    configurable, para acotar el peor caso). Devuelve un único `Trace`
    `type="surface"` reutilizando el mismo `GraphData`/`Trace` que
    `/graph/2d` (el campo `z`, ya presente en el schema, estaba sin usar)."""
    x_symbol = _validate_variable(variables[0])
    y_symbol = _validate_variable(variables[1])
    warnings: List[str] = []

    expr = parsing.parse_expression_tree(expression, allow_equation=False)
    extra_symbols = expr.free_symbols - {x_symbol, y_symbol}
    if extra_symbols:
        raise InvalidVariableError(
            f"La expresión usa variables distintas de {variables}: "
            f"{sorted(str(s) for s in extra_symbols)}."
        )

    x_min, x_max = x_range
    y_min, y_max = y_range
    n = _GRAPH_3D_GRID_SIZE
    x_values = [x_min + i * (x_max - x_min) / (n - 1) for i in range(n)]
    y_values = [y_min + i * (y_max - y_min) / (n - 1) for i in range(n)]

    z_grid: List[List[Optional[float]]] = []
    none_count = 0
    for y_value in y_values:
        row = [_evaluate_at_2var(expr, x_symbol, y_symbol, x_value, y_value) for x_value in x_values]
        none_count += sum(1 for v in row if v is None)
        z_grid.append(row)

    if none_count / (n * n) > 0.2:
        warnings.append(
            "Más del 20% de la grilla no son puntos reales (discontinuidades, "
            "división por cero, o fuera de dominio)."
        )

    # Plotly no acepta `null` dentro de una superficie (a diferencia de una
    # línea 2D, donde corta el trazo): se sustituye por NaN, que Plotly sí
    # interpreta como hueco en la superficie.
    z_grid_safe = [[v if v is not None else float("nan") for v in row] for row in z_grid]

    trace = Trace(type="surface", name=expression, x=x_values, y=y_values, z=z_grid_safe)
    graph_data = GraphData(traces=[trace], x_range=list(x_range), y_range=list(y_range))
    return Graph3DResult(graph_data, warnings)


class GraphParametricResult:
    def __init__(self, graph_data: GraphData, warnings: List[str]):
        self.graph_data = graph_data
        self.warnings = warnings


def compute_graph_parametric(
    x_expression: str, y_expression: str, parameter: str, t_min: float, t_max: float
) -> GraphParametricResult:
    """`/graph/parametric` (spec, `GraphParametricRequest`): curva
    `(x(t), y(t))` — se reutiliza `_evaluate_at` (1 variable: el
    parámetro) para ambas componentes, y el mismo `Trace type="line"` que
    usa `/graph/2d` (Plotly grafica una curva paramétrica igual que una
    curva `y=f(x)`, solo cambian los valores x/y de entrada)."""
    t_symbol = _validate_variable(parameter)
    warnings: List[str] = []

    x_expr = parsing.parse_expression_tree(x_expression, allow_equation=False)
    y_expr = parsing.parse_expression_tree(y_expression, allow_equation=False)
    for expr, label in ((x_expr, "x(t)"), (y_expr, "y(t)")):
        extra_symbols = expr.free_symbols - {t_symbol}
        if extra_symbols:
            raise InvalidVariableError(
                f"La expresión {label} usa variables distintas de '{parameter}': "
                f"{sorted(str(s) for s in extra_symbols)}."
            )

    n = _PARAMETRIC_SAMPLES
    step = (t_max - t_min) / (n - 1) if n > 1 else 0.0
    t_values = [t_min + i * step for i in range(n)]

    x_values = [_evaluate_at(x_expr, t_symbol, t) for t in t_values]
    y_values = [_evaluate_at(y_expr, t_symbol, t) for t in t_values]

    # Una curva paramétrica no tiene "x independiente": si cualquiera de las
    # dos componentes es None en un instante t, el punto completo se
    # descarta (a diferencia de /graph/2d, donde y=None simplemente corta
    # la línea mantiendo el eje x fijo).
    paired = [(x, y) for x, y in zip(x_values, y_values) if x is not None and y is not None]
    none_ratio = 1 - (len(paired) / n)
    if none_ratio > 0.2:
        warnings.append(
            "Más del 20% de los puntos no son reales (discontinuidades, división "
            "por cero, o fuera de dominio)."
        )

    if not paired:
        x_plot: List[float] = []
        y_plot: List[Optional[float]] = []
        x_range = [0.0, 1.0]
        y_range = None
    else:
        x_plot = [p[0] for p in paired]
        y_plot = [p[1] for p in paired]
        x_range = [min(x_plot), max(x_plot)]
        y_range = _compute_y_range(y_plot)

    trace = Trace(
        type="line", name=f"({x_expression}, {y_expression})", x=x_plot, y=y_plot
    )
    graph_data = GraphData(traces=[trace], x_range=x_range, y_range=y_range)
    return GraphParametricResult(graph_data, warnings)


def compute_graph(
    expressions: List[str],
    variable: str,
    x_min: Optional[float],
    x_max: Optional[float],
    samples: Optional[int],
    angle_unit: str = "rad",
) -> GraphResult:
    var_symbol = _validate_variable(variable)
    warnings: List[str] = []

    if (x_min is None) != (x_max is None):
        # Sección 10: "si solo uno de x_min/x_max viene especificado, se
        # ignora con warning" — se usa el dominio completo por defecto.
        warnings.append(
            "Se ignoraron los límites parciales del dominio (x_min/x_max deben "
            "especificarse juntos); se usó el dominio por defecto."
        )
        x_min = x_max = None

    if x_min is None and x_max is None:
        x_min, x_max = _DEFAULT_DOMAIN_DEG if angle_unit == "deg" else _DEFAULT_DOMAIN_RAD

    settings = get_settings()
    requested_samples = samples or settings.graph_2d_default_points

    points_truncated = False
    total_points = requested_samples * len(expressions)
    if total_points > _MAX_TOTAL_POINTS:
        requested_samples = max(2, _MAX_TOTAL_POINTS // len(expressions))
        points_truncated = True
        warnings.append(
            "Se redujo la densidad de muestreo respecto a lo solicitado para "
            "mantener el tiempo de respuesta (sección 6)."
        )

    step = (x_max - x_min) / (requested_samples - 1) if requested_samples > 1 else 0.0
    x_values = [x_min + i * step for i in range(requested_samples)]

    traces: List[Trace] = []
    analyses: List[GraphAnalysis] = []
    for expression_text in expressions:
        expr = parsing.parse_expression_tree(expression_text, allow_equation=False)

        extra_symbols = expr.free_symbols - {var_symbol}
        if extra_symbols:
            raise InvalidVariableError(
                f"La expresión '{expression_text}' usa variables distintas de "
                f"'{variable}': {sorted(str(s) for s in extra_symbols)}."
            )

        working_expr = _apply_degree_conversion(expr) if angle_unit == "deg" else expr

        y_values = [_evaluate_at(working_expr, var_symbol, x) for x in x_values]

        none_ratio = sum(1 for y in y_values if y is None) / len(y_values)
        if none_ratio > 0.2:
            warnings.append(
                f"'{expression_text}': más del 20% de los puntos no son reales "
                "(discontinuidades, división por cero, o fuera de dominio)."
            )

        traces.append(Trace(type="line", name=expression_text, x=x_values, y=y_values))
        analyses.append(compute_analysis(working_expr, var_symbol, x_min, x_max))

    all_y_values = [y for trace in traces for y in trace.y]
    y_range = _compute_y_range(all_y_values)

    graph_data = GraphData(
        traces=traces,
        x_range=[x_min, x_max],
        y_range=y_range,
        points_truncated=points_truncated,
        analysis=analyses,
    )
    return GraphResult(graph_data, warnings)
