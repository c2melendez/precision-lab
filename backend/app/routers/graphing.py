"""
app/routers/graphing.py — `POST /graph/2d` (spec, secciones 4, 5, 9, 10).
"""

import time

from fastapi import APIRouter, Request

from app.core.logging import log_request_event
from app.schemas.requests import ComplexPointRequest, Graph2DRequest
from app.schemas.responses import ErrorCode, MathResponse, OperationType, ResultType
from app.services import graph_service, parsing
from app.services.ast_validator import ComplexityLimitError

router = APIRouter(tags=["graphing"])


def _duration_ms(request: Request) -> float:
    return (time.perf_counter() - request.state.start_time) * 1000


def _error(request: Request, error_code: ErrorCode, message: str) -> MathResponse:
    return MathResponse(
        success=False,
        operation=OperationType.GRAPH_2D,
        request_id=request.state.request_id,
        has_detailed_steps=False,
        error_code=error_code,
        error_message=message,
        duration_ms=_duration_ms(request),
    )


@router.post("/graph/2d", response_model=MathResponse)
async def graph_2d(payload: Graph2DRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "graph_2d_request")

    try:
        result = graph_service.compute_graph(
            payload.expressions,
            payload.variable,
            payload.x_min,
            payload.x_max,
            payload.samples,
            payload.angle_unit,
        )
    except parsing.ParseSecurityError as exc:
        return _error(request, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, ErrorCode.COMPLEXITY_LIMIT, str(exc))
    except graph_service.InvalidVariableError as exc:
        return _error(request, ErrorCode.INVALID_VARIABLE, str(exc))

    return MathResponse(
        success=True,
        operation=OperationType.GRAPH_2D,
        request_id=request.state.request_id,
        result_type=ResultType.GRAPH,
        graph_data=result.graph_data,
        has_detailed_steps=False,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/graph/complex_point", response_model=MathResponse)
async def graph_complex_point(payload: ComplexPointRequest, request: Request) -> MathResponse:
    """Fase F (Módulo F3): botón "Graficar" -- ver graph_service.graph_complex_point
    para la nota de cambio de contrato (`Trace.type="point"`)."""
    log_request_event(request.state.request_id, "graph_complex_point_request", input_text=payload.expression)
    try:
        result = graph_service.graph_complex_point(payload.expression)
    except parsing.ParseSecurityError as exc:
        return _error(request, ErrorCode.PARSE_ERROR, str(exc))
    except ValueError as exc:
        return _error(request, ErrorCode.DOMAIN_ERROR, str(exc))

    return MathResponse(
        success=True,
        operation=OperationType.GRAPH_2D,
        request_id=request.state.request_id,
        result_type=ResultType.GRAPH,
        graph_data=result.graph_data,
        has_detailed_steps=False,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )
