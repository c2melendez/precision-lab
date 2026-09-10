"""
app/services/phase2_service.py — passthrough trivial REAL para `/limit` y
`/series` (spec, sección 2: "Sí — sympy.limit()" / "Sí — sympy.series()"),
más `/solve/system`, `/inequality`, `/integral/improper`,
`/derivative/partial` y `/derivative/implicit` (destrabados después de la
Fase 1 — ver cada función para su técnica de SymPy específica).

`/graph/3d` y `/graph/parametric` siguen sin implementar (requieren además
una visualización nueva en el frontend, alcance mayor que el resto de este
módulo) — responden `UNSUPPORTED_IN_PHASE_1` directamente desde el router
(`app/routers/phase2.py`), sin pasar por este servicio.
"""

from dataclasses import dataclass
from typing import List

import sympy

from app.schemas.responses import EquationSolution
from app.services import parsing

_DIRECTION_MAP = {"both": "+-", "left": "-", "right": "+"}

MAX_SYSTEM_SOLUTIONS = 20  # tope defensivo (sección 7/9: mismo espíritu que otros límites)


@dataclass
class LimitResult:
    input_expr: sympy.Expr
    value: sympy.Expr
    # Fix (suite de regresión v1.1, caso L010: abs(x)/x en x=0 crasheaba
    # con INTERNAL_ERROR 500). sympy.limit() con dir="+-" (ambos lados)
    # LANZA una ValueError de Python cuando el límite lateral izquierdo y
    # derecho difieren — "no existe" es una respuesta matemática válida,
    # no un fallo del sistema, así que no debería tumbar el endpoint con
    # un 500. Este campo lo distingue para que el router lo formatee
    # como resultado (DNE), no como error.
    dne: bool = False
    left_value: sympy.Expr = None
    right_value: sympy.Expr = None


@dataclass
class SeriesResult:
    input_expr: sympy.Expr
    value: sympy.Expr


class InconsistentVariablesError(ValueError):
    """`equations`/`variables` de tamaños incompatibles, o un nombre de
    variable inválido -> `ErrorCode.VALIDATION_ERROR`."""


@dataclass
class SolveSystemResult:
    solutions: List[EquationSolution]
    has_solutions: bool
    warnings: List[str]


def _validate_variable(variable: str) -> sympy.Symbol:
    candidates = parsing.extract_candidate_identifiers(variable)
    if candidates != [variable]:
        raise parsing.ParseSecurityError(f"Nombre de variable inválido: '{variable}'.")
    return sympy.Symbol(variable)


def compute_limit(expression: str, variable: str, point: str, direction: str) -> LimitResult:
    """Passthrough trivial: `sympy.limit(expr, var, point, dir=...)` directo.

    Fix (suite de regresión v1.1, caso L010: abs(x)/x en x=0 crasheaba
    con INTERNAL_ERROR 500). Si dir="+-" y los límites laterales
    difieren, sympy.limit() lanza ValueError en vez de devolver algo —
    "el límite no existe" es una respuesta matemática válida, no un
    fallo del sistema. Se atrapa específicamente ESE mensaje (no
    cualquier ValueError, para no ocultar otros fallos genuinos) y se
    recalculan los dos límites laterales por separado para reportarlos.
    """
    input_expr = parsing.parse_expression_tree(expression, allow_equation=False)
    var_symbol = _validate_variable(variable)
    point_expr = parsing.parse_expression_tree(point, allow_equation=False)

    try:
        value = sympy.limit(input_expr, var_symbol, point_expr, dir=_DIRECTION_MAP[direction])
        return LimitResult(input_expr, value)
    except ValueError as exc:
        if "does not exist" not in str(exc) or direction != "both":
            raise
        left = sympy.limit(input_expr, var_symbol, point_expr, dir="-")
        right = sympy.limit(input_expr, var_symbol, point_expr, dir="+")
        return LimitResult(input_expr, sympy.nan, dne=True, left_value=left, right_value=right)


def compute_series(expression: str, variable: str, point: str, order: int) -> SeriesResult:
    """Passthrough trivial: `sympy.series(expr, var, point, n=order+1)` directo,
    sin remover el término `O(...)` — resultado de SymPy tal cual."""
    input_expr = parsing.parse_expression_tree(expression, allow_equation=False)
    var_symbol = _validate_variable(variable)
    point_expr = parsing.parse_expression_tree(point, allow_equation=False)

    value = sympy.series(input_expr, var_symbol, point_expr, n=order + 1)
    return SeriesResult(input_expr, value)


def _format_solution_tuple(
    var_symbols: List[sympy.Symbol], values: tuple
) -> EquationSolution:
    assignments_text = ", ".join(f"{v}={val}" for v, val in zip(var_symbols, values))
    assignments_latex = r",\ ".join(
        f"{sympy.latex(v)} = {sympy.latex(val)}" for v, val in zip(var_symbols, values)
    )
    is_complex = any(val.has(sympy.I) for val in values)
    return EquationSolution(text=assignments_text, latex=assignments_latex, is_complex=is_complex)


@dataclass
class InequalityResult:
    solution_set: sympy.Set
    warnings: List[str]


def compute_inequality(inequality: sympy.core.relational.Relational, variable: str) -> InequalityResult:
    """`/inequality` (spec, `InequalityRequest`). Usa
    `sympy.solve_univariate_inequality` (una sola variable, el caso común
    de "resuelve esta desigualdad") con `reduce_inequalities` como
    respaldo para casos que `solve_univariate_inequality` no cubre
    (p. ej. cuando el símbolo detectado en el request no coincide con el
    único símbolo libre de la expresión)."""
    var_symbol = _validate_variable(variable)
    warnings: List[str] = []

    try:
        solution_set = sympy.solve_univariate_inequality(inequality, var_symbol, relational=False)
    except (NotImplementedError, TypeError):
        result = sympy.reduce_inequalities([inequality], [var_symbol])
        if isinstance(result, sympy.logic.boolalg.BooleanFalse):
            solution_set = sympy.S.EmptySet
        elif isinstance(result, sympy.logic.boolalg.BooleanTrue):
            solution_set = sympy.S.Reals
        else:
            warnings.append(
                "No se pudo reducir a un único intervalo; el resultado puede requerir "
                "interpretación manual."
            )
            solution_set = result
    return InequalityResult(solution_set, warnings)


@dataclass
class PartialDerivativeResult:
    value: sympy.Expr


def compute_partial_derivative(expression: str, variable: str, order: int) -> PartialDerivativeResult:
    """`/derivative/partial` (spec, `PartialDerivativeRequest`). SymPy ya
    trata cualquier símbolo distinto al de derivación como constante por
    defecto (`sympy.diff(expr, var, order)`) — es exactamente la misma
    operación que la derivada "normal" de una sola variable, la única
    diferencia real es semántica (la expresión SUELE tener más de una
    variable libre, p. ej. `x**2*y` respecto a `x`). Sin pasos detallados
    (mismo patrón que `eigen`/`transpose`/`limit`)."""
    expr = parsing.parse_expression_tree(expression, allow_equation=False)
    var_symbol = _validate_variable(variable)
    value = sympy.diff(expr, var_symbol, order)
    return PartialDerivativeResult(value)


@dataclass
class ImplicitDerivativeResult:
    value: sympy.Expr


def compute_implicit_derivative(
    equation: str, dependent_variable: str, independent_variable: str
) -> ImplicitDerivativeResult:
    """`/derivative/implicit` (spec, `ImplicitDerivativeRequest`):
    diferenciación implícita clásica — se sustituye la variable
    dependiente (p. ej. `y`) por `Function('y')(x)`, se deriva ambos
    lados de la ecuación respecto a `x` (aplicando la regla de la
    cadena automáticamente vía SymPy), y se despeja `dy/dx`."""
    eq = parsing.parse_expression_tree(equation, allow_equation=True)
    x_symbol = _validate_variable(independent_variable)
    y_symbol = _validate_variable(dependent_variable)

    if x_symbol not in eq.free_symbols and y_symbol not in eq.free_symbols:
        raise InconsistentVariablesError(
            f"La ecuación no usa ninguna de las variables indicadas "
            f"('{independent_variable}', '{dependent_variable}')."
        )

    y_func = sympy.Function(str(y_symbol))(x_symbol)
    lhs_sub = eq.lhs.subs(y_symbol, y_func)
    rhs_sub = eq.rhs.subs(y_symbol, y_func)

    lhs_diff = sympy.diff(lhs_sub, x_symbol)
    rhs_diff = sympy.diff(rhs_sub, x_symbol)

    y_prime = sympy.diff(y_func, x_symbol)
    diff_equation = sympy.Eq(lhs_diff, rhs_diff)

    solutions = sympy.solve(diff_equation, y_prime)
    if not solutions:
        raise ImplicitDerivativeUnsolvableError(
            "No se pudo despejar dy/dx de forma cerrada para esta ecuación."
        )
    # Se sustituye y(x) de vuelta por el símbolo original ('y') para que el
    # resultado se muestre en términos de las variables que el usuario
    # escribió, no de la notación funcional interna de SymPy.
    value = solutions[0].subs(y_func, y_symbol)
    return ImplicitDerivativeResult(value)


class ImplicitDerivativeUnsolvableError(ValueError):
    """`sympy.solve` no encontró una forma cerrada para dy/dx ->
    `ErrorCode.PARSE_ERROR` (no es un error de validación del payload,
    sino de que la técnica simbólica no aplica a esta ecuación)."""


@dataclass
class ImproperIntegralResult:
    value: sympy.Expr
    warnings: List[str]


def compute_improper_integral(
    expression: str, variable: str, lower_bound: str, upper_bound: str
) -> ImproperIntegralResult:
    """`/integral/improper` (spec, `ImproperIntegralRequest`). A
    diferencia de `/integral` (que RECHAZA límites infinitos —
    `integral_service.UnsupportedInfiniteBoundsError` — porque su
    `manualintegrate` con pasos detallados no está pensado para eso),
    aquí se llama a `sympy.integrate()` directo con los límites que sea
    (incluye `oo`/`-oo`), sin desglose paso a paso: SymPy internamente ya
    resuelve el límite del área bajo la curva cuando la integral converge,
    y devuelve `zoo`/no converge cuando no."""
    expr = parsing.parse_expression_tree(expression, allow_equation=False)
    var_symbol = _validate_variable(variable)
    lower_expr = parsing.parse_expression_tree(lower_bound, allow_equation=False)
    upper_expr = parsing.parse_expression_tree(upper_bound, allow_equation=False)

    value = sympy.integrate(expr, (var_symbol, lower_expr, upper_expr))

    warnings: List[str] = []
    if value.has(sympy.Integral):
        warnings.append(
            "SymPy no pudo resolver esta integral impropia de forma cerrada; el "
            "resultado puede quedar parcialmente sin evaluar."
        )
    elif value in (sympy.oo, -sympy.oo, sympy.zoo, sympy.nan):
        warnings.append("La integral diverge (no converge a un valor finito).")

    return ImproperIntegralResult(value, warnings)


def compute_solve_system(equations: List[str], variables: List[str]) -> SolveSystemResult:
    """`/solve/system` (spec, `SolveSystemRequest`). Sistemas LINEALES ->
    `sympy.linsolve` (maneja de forma robusta sin solución / solución única /
    infinitas soluciones paramétricas). Cualquier ecuación no lineal en las
    variables pedidas -> `sympy.solve` (puede devolver 0, 1 o varias
    tuplas solución)."""
    if len(equations) != len(variables):
        raise InconsistentVariablesError(
            "El sistema necesita el mismo número de ecuaciones que de variables a resolver."
        )

    var_symbols = [_validate_variable(v) for v in variables]
    parsed_equations = [
        parsing.parse_expression_tree(eq, allow_equation=True) for eq in equations
    ]

    def _is_linear(eq: sympy.Eq) -> bool:
        try:
            poly = (eq.lhs - eq.rhs).as_poly(*var_symbols)
        except sympy.PolynomialError:
            return False
        return poly is not None and poly.total_degree() <= 1

    is_linear = all(_is_linear(eq) for eq in parsed_equations)

    if is_linear:
        solution_set = sympy.linsolve(parsed_equations, var_symbols)
        if not solution_set:
            return SolveSystemResult([], False, ["El sistema no tiene solución (inconsistente)."])
        solutions = [
            _format_solution_tuple(var_symbols, tuple(values))
            for values in list(solution_set)[:MAX_SYSTEM_SOLUTIONS]
        ]
        # linsolve deja cualquier parámetro libre (tau_i) visible directamente
        # en el texto/latex de la solución cuando el sistema es indeterminado.
        return SolveSystemResult(solutions, True, [])

    raw_solutions = sympy.solve(parsed_equations, var_symbols, dict=True)
    if not raw_solutions:
        return SolveSystemResult(
            [], False, ["No se encontraron soluciones para este sistema no lineal."]
        )
    solutions = [
        _format_solution_tuple(var_symbols, tuple(sol.get(v, v) for v in var_symbols))
        for sol in raw_solutions[:MAX_SYSTEM_SOLUTIONS]
    ]
    return SolveSystemResult(solutions, True, [])
