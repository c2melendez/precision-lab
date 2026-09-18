"""
app/routers/complex_analysis.py — Fase F, spec_edo_complejos_tooltips.md
sección 3.2. Ver nota de diseño en app/services/complex_service.py sobre
por qué esto no pasa por la ruta general /evaluate.
"""

import time

import sympy
from fastapi import APIRouter, Request

from app.core.logging import log_request_event
from app.schemas.requests import ResidueRequest, SingularitiesRequest
from app.schemas.responses import ErrorCode, MathResponse, OperationType, ResultType
from app.services import complex_service

router = APIRouter(tags=["complex"])


def _duration_ms(request: Request) -> float:
    return (time.perf_counter() - request.state.start_time) * 1000


@router.post("/complex/residue", response_model=MathResponse)
async def residue(payload: ResidueRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "residue_request", input_text=payload.expression)
    try:
        result = complex_service.residue_at(payload.expression, payload.point)
    except complex_service.ComplexAnalysisParseError as exc:
        return MathResponse(
            success=False,
            operation=OperationType.COMPLEX_RESIDUE,
            request_id=request.state.request_id,
            has_detailed_steps=False,
            error_code=ErrorCode.PARSE_ERROR,
            error_message=str(exc),
            duration_ms=_duration_ms(request),
        )
    except complex_service.ComplexAnalysisUnsupportedError as exc:
        return MathResponse(
            success=False,
            operation=OperationType.COMPLEX_RESIDUE,
            request_id=request.state.request_id,
            has_detailed_steps=False,
            error_code=ErrorCode.UNSUPPORTED_OPERATION,
            error_message=str(exc),
            duration_ms=_duration_ms(request),
        )

    return MathResponse(
        success=True,
        operation=OperationType.COMPLEX_RESIDUE,
        request_id=request.state.request_id,
        result_type=ResultType.COMPLEX_RESIDUE,
        input_text=payload.expression,
        result_text=str(result.residue),
        result_latex=sympy.latex(result.residue),
        has_detailed_steps=False,
        duration_ms=_duration_ms(request),
    )


@router.post("/complex/singularities", response_model=MathResponse)
async def singularities(payload: SingularitiesRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "singularities_request", input_text=payload.expression)
    try:
        result = complex_service.singularities_of(payload.expression)
    except complex_service.ComplexAnalysisParseError as exc:
        return MathResponse(
            success=False,
            operation=OperationType.COMPLEX_SINGULARITIES,
            request_id=request.state.request_id,
            has_detailed_steps=False,
            error_code=ErrorCode.PARSE_ERROR,
            error_message=str(exc),
            duration_ms=_duration_ms(request),
        )
    except complex_service.ComplexAnalysisUnsupportedError as exc:
        return MathResponse(
            success=False,
            operation=OperationType.COMPLEX_SINGULARITIES,
            request_id=request.state.request_id,
            has_detailed_steps=False,
            error_code=ErrorCode.UNSUPPORTED_OPERATION,
            error_message=str(exc),
            duration_ms=_duration_ms(request),
        )

    points_text = ", ".join(str(p) for p in result.points)
    points_latex = ", ".join(sympy.latex(p) for p in result.points)
    return MathResponse(
        success=True,
        operation=OperationType.COMPLEX_SINGULARITIES,
        request_id=request.state.request_id,
        result_type=ResultType.COMPLEX_SINGULARITIES,
        input_text=payload.expression,
        result_text=f"{{{points_text}}}",
        result_latex=f"\\{{{points_latex}\\}}",
        has_detailed_steps=False,
        duration_ms=_duration_ms(request),
    )
