"""
app/routers/phase2.py — Fase 2 (spec, sección 2 completa, sección 9).

`/limit`, `/series`, `/solve/system`, `/inequality`, `/integral/improper`,
`/derivative/partial` y `/derivative/implicit` tienen passthrough real
(llaman a `phase2_service`, que ejecuta SymPy de verdad). `/graph/3d` y
`/graph/parametric` siguen respondiendo `UNSUPPORTED_IN_PHASE_1`
INMEDIATAMENTE — sin parsear expresiones, sin instanciar ningún objeto de
SymPy — porque además de la lógica simbólica requieren visualización 3D
nueva en el frontend (alcance mayor, sección 2, "sin ejecutar lógica de
SymPy" sigue aplicando para estos dos).
"""

import time

import sympy
from fastapi import APIRouter, Request

from app.core.logging import log_request_event
from app.schemas.requests import (
    Graph3DRequest,
    GraphParametricRequest,
    ImplicitDerivativeRequest,
    ImproperIntegralRequest,
    InequalityRequest,
    LimitRequest,
    PartialDerivativeRequest,
    SeriesRequest,
    SolveSystemRequest,
)
from app.schemas.responses import ErrorCode, MathResponse, OperationType, ResultType
from app.services import graph_service, parsing, phase2_service
from app.services.ast_validator import ComplexityLimitError

router = APIRouter(tags=["phase2"])

_STUB_MESSAGE = (
    "Esta funcionalidad está planificada para una fase futura del proyecto "
    "y todavía no está disponible."
)


def _duration_ms(request: Request) -> float:
    return (time.perf_counter() - request.state.start_time) * 1000


def _error(request: Request, operation: OperationType, error_code: ErrorCode, message: str):
    return MathResponse(
        success=False,
        operation=operation,
        request_id=request.state.request_id,
        has_detailed_steps=False,
        error_code=error_code,
        error_message=message,
        duration_ms=_duration_ms(request),
    )


def _stub_response(request: Request, operation: OperationType) -> MathResponse:
    return _error(request, operation, ErrorCode.UNSUPPORTED_IN_PHASE_1, _STUB_MESSAGE)


# ---------------------------------------------------------------------------
# Passthrough trivial REAL
# ---------------------------------------------------------------------------


@router.post("/limit", response_model=MathResponse)
async def limit(payload: LimitRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "limit_request", input_text=payload.expression)
    try:
        result = phase2_service.compute_limit(
            payload.expression, payload.variable, payload.point, payload.direction
        )
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.LIMIT, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, OperationType.LIMIT, ErrorCode.COMPLEXITY_LIMIT, str(exc))

    if result.dne:
        return MathResponse(
            success=True,
            operation=OperationType.LIMIT,
            request_id=request.state.request_id,
            result_type=ResultType.SCALAR,
            input_text=payload.expression,
            result_text="DNE",
            result_latex=r"\text{No existe (límite izquierdo } "
            + sympy.latex(result.left_value)
            + r" \neq \text{ límite derecho } "
            + sympy.latex(result.right_value)
            + ")",
            has_detailed_steps=False,
            duration_ms=_duration_ms(request),
        )

    return MathResponse(
        success=True,
        operation=OperationType.LIMIT,
        request_id=request.state.request_id,
        result_type=ResultType.SCALAR,
        input_text=payload.expression,
        result_text=str(result.value),
        result_latex=sympy.latex(result.value),
        has_detailed_steps=False,
        duration_ms=_duration_ms(request),
    )


@router.post("/series", response_model=MathResponse)
async def series(payload: SeriesRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "series_request", input_text=payload.expression)
    try:
        result = phase2_service.compute_series(
            payload.expression, payload.variable, payload.point, payload.order
        )
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.SERIES, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, OperationType.SERIES, ErrorCode.COMPLEXITY_LIMIT, str(exc))

    return MathResponse(
        success=True,
        operation=OperationType.SERIES,
        request_id=request.state.request_id,
        result_type=ResultType.SCALAR,
        input_text=payload.expression,
        result_text=str(result.value),
        result_latex=sympy.latex(result.value),
        has_detailed_steps=False,
        duration_ms=_duration_ms(request),
    )


@router.post("/solve/system", response_model=MathResponse)
async def solve_system(payload: SolveSystemRequest, request: Request) -> MathResponse:
    """Passthrough real (dejó de ser stub): sistemas lineales vía
    `sympy.linsolve`, no lineales vía `sympy.solve` — ver
    `phase2_service.compute_solve_system`."""
    log_request_event(request.state.request_id, "solve_system_request")

    try:
        result = phase2_service.compute_solve_system(payload.equations, payload.variables)
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.SOLVE_SYSTEM, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, OperationType.SOLVE_SYSTEM, ErrorCode.COMPLEXITY_LIMIT, str(exc))
    except phase2_service.InconsistentVariablesError as exc:
        return _error(request, OperationType.SOLVE_SYSTEM, ErrorCode.VALIDATION_ERROR, str(exc))

    return MathResponse(
        success=True,
        operation=OperationType.SOLVE_SYSTEM,
        request_id=request.state.request_id,
        result_type=ResultType.EQUATION_SOLUTIONS,
        result_data=result.solutions,
        has_detailed_steps=False,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


# ---------------------------------------------------------------------------
# Passthrough real (Fase 2, destrabado tras Fase 1)
# ---------------------------------------------------------------------------


@router.post("/inequality", response_model=MathResponse)
async def inequality(payload: InequalityRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "inequality_request")

    try:
        parsed = parsing.parse_inequality_tree(payload.inequality)
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.INEQUALITY, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, OperationType.INEQUALITY, ErrorCode.COMPLEXITY_LIMIT, str(exc))

    variable = payload.variable
    if variable is None:
        free_symbols = parsed.free_symbols
        if len(free_symbols) != 1:
            return _error(
                request,
                OperationType.INEQUALITY,
                ErrorCode.VALIDATION_ERROR,
                "No se pudo inferir la variable automáticamente (la desigualdad debe "
                "tener exactamente una variable libre, o especificarla explícitamente).",
            )
        variable = str(next(iter(free_symbols)))

    try:
        result = phase2_service.compute_inequality(parsed, variable)
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.INEQUALITY, ErrorCode.PARSE_ERROR, str(exc))

    return MathResponse(
        success=True,
        operation=OperationType.INEQUALITY,
        request_id=request.state.request_id,
        result_type=ResultType.SCALAR,
        input_text=payload.inequality,
        result_text=str(result.solution_set),
        result_latex=sympy.latex(result.solution_set),
        has_detailed_steps=False,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/integral/improper", response_model=MathResponse)
async def integral_improper(payload: ImproperIntegralRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "integral_improper_request")

    try:
        result = phase2_service.compute_improper_integral(
            payload.expression, payload.variable, payload.lower_bound, payload.upper_bound
        )
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.INTEGRAL_IMPROPER, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(
            request, OperationType.INTEGRAL_IMPROPER, ErrorCode.COMPLEXITY_LIMIT, str(exc)
        )

    return MathResponse(
        success=True,
        operation=OperationType.INTEGRAL_IMPROPER,
        request_id=request.state.request_id,
        result_type=ResultType.SCALAR,
        input_text=payload.expression,
        result_text=str(result.value),
        result_latex=sympy.latex(result.value),
        has_detailed_steps=False,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/graph/3d", response_model=MathResponse)
async def graph_3d(payload: Graph3DRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "graph_3d_request")

    try:
        result = graph_service.compute_graph_3d(
            payload.expression, payload.variables, payload.x_range, payload.y_range
        )
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.GRAPH_3D, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, OperationType.GRAPH_3D, ErrorCode.COMPLEXITY_LIMIT, str(exc))
    except graph_service.InvalidVariableError as exc:
        return _error(request, OperationType.GRAPH_3D, ErrorCode.INVALID_VARIABLE, str(exc))

    return MathResponse(
        success=True,
        operation=OperationType.GRAPH_3D,
        request_id=request.state.request_id,
        result_type=ResultType.GRAPH,
        graph_data=result.graph_data,
        has_detailed_steps=False,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/graph/parametric", response_model=MathResponse)
async def graph_parametric(payload: GraphParametricRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "graph_parametric_request")

    try:
        result = graph_service.compute_graph_parametric(
            payload.x_expression, payload.y_expression, payload.parameter, payload.t_min, payload.t_max
        )
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.GRAPH_PARAMETRIC, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(
            request, OperationType.GRAPH_PARAMETRIC, ErrorCode.COMPLEXITY_LIMIT, str(exc)
        )
    except graph_service.InvalidVariableError as exc:
        return _error(
            request, OperationType.GRAPH_PARAMETRIC, ErrorCode.INVALID_VARIABLE, str(exc)
        )

    return MathResponse(
        success=True,
        operation=OperationType.GRAPH_PARAMETRIC,
        request_id=request.state.request_id,
        result_type=ResultType.GRAPH,
        graph_data=result.graph_data,
        has_detailed_steps=False,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/derivative/partial", response_model=MathResponse)
async def derivative_partial(payload: PartialDerivativeRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "derivative_partial_request")

    try:
        result = phase2_service.compute_partial_derivative(
            payload.expression, payload.variable, payload.order
        )
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.DERIVATIVE_PARTIAL, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(
            request, OperationType.DERIVATIVE_PARTIAL, ErrorCode.COMPLEXITY_LIMIT, str(exc)
        )

    return MathResponse(
        success=True,
        operation=OperationType.DERIVATIVE_PARTIAL,
        request_id=request.state.request_id,
        result_type=ResultType.SCALAR,
        input_text=payload.expression,
        result_text=str(result.value),
        result_latex=sympy.latex(result.value),
        has_detailed_steps=False,
        duration_ms=_duration_ms(request),
    )


@router.post("/derivative/implicit", response_model=MathResponse)
async def derivative_implicit(payload: ImplicitDerivativeRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "derivative_implicit_request")

    try:
        result = phase2_service.compute_implicit_derivative(
            payload.equation, payload.dependent_variable, payload.independent_variable
        )
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.DERIVATIVE_IMPLICIT, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(
            request, OperationType.DERIVATIVE_IMPLICIT, ErrorCode.COMPLEXITY_LIMIT, str(exc)
        )
    except phase2_service.InconsistentVariablesError as exc:
        return _error(
            request, OperationType.DERIVATIVE_IMPLICIT, ErrorCode.VALIDATION_ERROR, str(exc)
        )
    except phase2_service.ImplicitDerivativeUnsolvableError as exc:
        return _error(request, OperationType.DERIVATIVE_IMPLICIT, ErrorCode.PARSE_ERROR, str(exc))

    return MathResponse(
        success=True,
        operation=OperationType.DERIVATIVE_IMPLICIT,
        request_id=request.state.request_id,
        result_type=ResultType.SCALAR,
        input_text=payload.equation,
        result_text=str(result.value),
        result_latex=sympy.latex(result.value),
        has_detailed_steps=False,
        duration_ms=_duration_ms(request),
    )
