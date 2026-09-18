"""
app/routers/ode.py — Fase E (EDO), spec_edo_complejos_tooltips.md sección 2.

Único endpoint que invoca `ode_service.solve_ode()` (y, transitivamente,
`sympy.dsolve()`) en todo el backend — ver nota de seguridad en
`app/services/ode_service.py`.
"""

import time

import sympy
from fastapi import APIRouter, Request

from app.core.logging import log_request_event
from app.schemas.requests import ODERequest
from app.schemas.responses import ErrorCode, MathResponse, OperationType, ResultType
from app.services import ode_service

router = APIRouter(tags=["ode"])


def _duration_ms(request: Request) -> float:
    return (time.perf_counter() - request.state.start_time) * 1000


@router.post("/ode", response_model=MathResponse)
async def solve_ode(payload: ODERequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "ode_request", input_text=payload.expression)
    try:
        result = ode_service.solve_ode(payload.expression)
    except ode_service.ODEParseError as exc:
        return MathResponse(
            success=False,
            operation=OperationType.ODE,
            request_id=request.state.request_id,
            has_detailed_steps=False,
            error_code=ErrorCode.PARSE_ERROR,
            error_message=str(exc),
            duration_ms=_duration_ms(request),
        )
    except ode_service.ODEUnsupportedError as exc:
        return MathResponse(
            success=False,
            operation=OperationType.ODE,
            request_id=request.state.request_id,
            has_detailed_steps=False,
            error_code=ErrorCode.UNSUPPORTED_OPERATION,
            error_message=str(exc),
            duration_ms=_duration_ms(request),
        )

    # Constantes arbitrarias remanentes (C1, C2, ...) -- puede pasar aun
    # CON condición inicial si la EDO es de orden 2 y solo se dio UNA
    # condición y(x0)=y0 (el teclado, spec 2.3, solo monta esa plantilla,
    # no una segunda para y'(x0)) — encontrado con ejecución real en el
    # Módulo E1, no anticipado explícitamente en el spec. Se detecta
    # buscando símbolos Cn en la solución, no infiriendo por has_initial_
    # condition/order, para cubrir el caso real con precisión.
    remaining_constants = sorted(
        str(s) for s in result.solution.free_symbols if str(s).startswith("C") and str(s)[1:].isdigit()
    )
    warnings = (
        [
            f"La solución conserva constante(s) arbitraria(s) sin determinar "
            f"({', '.join(remaining_constants)}): esta EDO de orden "
            f"{result.order} necesita {result.order} condiciones iniciales "
            f"independientes para quedar completamente determinada."
        ]
        if remaining_constants
        else []
    )

    return MathResponse(
        success=True,
        operation=OperationType.ODE,
        request_id=request.state.request_id,
        result_type=ResultType.ODE_SOLUTION,
        input_text=payload.expression,
        result_text=str(result.solution),
        result_latex=sympy.latex(result.solution),
        warnings=warnings,
        has_detailed_steps=False,
        duration_ms=_duration_ms(request),
    )
