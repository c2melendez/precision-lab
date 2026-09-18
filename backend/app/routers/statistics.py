"""
app/routers/statistics.py — P6 (spec v2 §7): `POST /statistics/descriptive`,
`/statistics/combinatorics`, `/statistics/binomial`, `/statistics/normal`.
Mismo patrón de `MathResponse` que el resto de endpoints Fase 1 (spec
v2 §7.4, decisión explícita de mantener consistencia arquitectónica con
el backend en vez de resolver esto 100% en frontend como Unidades/P7).
"""

import time

import sympy
from fastapi import APIRouter, Request

from app.core.logging import log_request_event
from app.schemas.requests import (
    BinomialRequest,
    CombinatoricsRequest,
    ExponentialRequest,
    NormalRequest,
    PoissonRequest,
    StatisticsCorrelationRequest,
    StatisticsDescriptiveRequest,
    UniformRequest,
)
from app.schemas.responses import ErrorCode, MathResponse, OperationType, ResultType
from app.services import stats_service

router = APIRouter(tags=["statistics"])


def _duration_ms(request: Request) -> float:
    return (time.perf_counter() - request.state.start_time) * 1000


def _error(request: Request, operation: OperationType, message: str) -> MathResponse:
    return MathResponse(
        success=False,
        operation=operation,
        request_id=request.state.request_id,
        has_detailed_steps=False,
        error_code=ErrorCode.DOMAIN_ERROR,
        error_message=message,
        duration_ms=_duration_ms(request),
    )


def _scalar_response(
    request: Request, operation: OperationType, result: stats_service.ScalarResult
) -> MathResponse:
    value = result.value
    return MathResponse(
        success=True,
        operation=operation,
        request_id=request.state.request_id,
        result_type=ResultType.SCALAR,
        result_text=str(value),
        result_latex=sympy.latex(value),
        result_approx=float(value) if value.is_real else None,
        has_detailed_steps=False,
        duration_ms=_duration_ms(request),
    )


@router.post("/statistics/descriptive", response_model=MathResponse)
async def statistics_descriptive(payload: StatisticsDescriptiveRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "statistics_descriptive_request")
    try:
        result = stats_service.descriptive_stat(payload.values, payload.stat, payload.variance_kind, payload.percentile_p)
    except ValueError as exc:
        return _error(request, OperationType.STATISTICS_DESCRIPTIVE, str(exc))
    return _scalar_response(request, OperationType.STATISTICS_DESCRIPTIVE, result)


@router.post("/statistics/correlation", response_model=MathResponse)
async def statistics_correlation(payload: StatisticsCorrelationRequest, request: Request) -> MathResponse:
    """Módulo M1 (spec_graficacion_matrices_estadistica_unidades.md,
    sección 6.2)."""
    log_request_event(request.state.request_id, "statistics_correlation_request")
    try:
        if payload.query == "correlation":
            result = stats_service.linear_correlation(payload.x, payload.y)
        elif payload.query == "slope":
            result = stats_service.linear_regression_slope(payload.x, payload.y)
        else:
            result = stats_service.linear_regression_intercept(payload.x, payload.y)
    except ValueError as exc:
        return _error(request, OperationType.STATISTICS_CORRELATION, str(exc))
    return _scalar_response(request, OperationType.STATISTICS_CORRELATION, result)


@router.post("/statistics/combinatorics", response_model=MathResponse)
async def statistics_combinatorics(payload: CombinatoricsRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "statistics_combinatorics_request")
    try:
        result = stats_service.combinatorics(payload.n, payload.r, payload.fn)
    except ValueError as exc:
        return _error(request, OperationType.STATISTICS_COMBINATORICS, str(exc))
    return _scalar_response(request, OperationType.STATISTICS_COMBINATORICS, result)


@router.post("/statistics/binomial", response_model=MathResponse)
async def statistics_binomial(payload: BinomialRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "statistics_binomial_request")
    try:
        if payload.query == "pmf":
            result = stats_service.binomial_pmf(payload.n, payload.p, payload.k)
        elif payload.query == "cdf":
            result = stats_service.binomial_cdf(payload.n, payload.p, payload.k)
        elif payload.query == "survival":
            result = stats_service.binomial_survival(payload.n, payload.p, payload.k)
        elif payload.query == "mean":
            result = stats_service.binomial_expected_value(payload.n, payload.p)
        else:
            result = stats_service.binomial_variance(payload.n, payload.p)
    except ValueError as exc:
        return _error(request, OperationType.STATISTICS_BINOMIAL, str(exc))
    return _scalar_response(request, OperationType.STATISTICS_BINOMIAL, result)


@router.post("/statistics/normal", response_model=MathResponse)
async def statistics_normal(payload: NormalRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "statistics_normal_request")
    try:
        if payload.query == "cdf":
            result = stats_service.normal_cdf(payload.mu, payload.sigma, payload.x)
        elif payload.query == "range":
            result = stats_service.normal_range(payload.mu, payload.sigma, payload.a, payload.b)
        else:
            result = stats_service.z_score(payload.mu, payload.sigma, payload.x)
    except ValueError as exc:
        return _error(request, OperationType.STATISTICS_NORMAL, str(exc))
    return _scalar_response(request, OperationType.STATISTICS_NORMAL, result)


@router.post("/statistics/poisson", response_model=MathResponse)
async def statistics_poisson(payload: PoissonRequest, request: Request) -> MathResponse:
    """Módulo N0 (spec_graficacion_matrices_estadistica_unidades.md, sección 7)."""
    log_request_event(request.state.request_id, "statistics_poisson_request")
    try:
        if payload.query == "pmf":
            result = stats_service.poisson_pmf(payload.lam, payload.k)
        elif payload.query == "cdf":
            result = stats_service.poisson_cdf(payload.lam, payload.k)
        elif payload.query == "mean":
            result = stats_service.poisson_expected_value(payload.lam)
        else:
            result = stats_service.poisson_variance(payload.lam)
    except ValueError as exc:
        return _error(request, OperationType.STATISTICS_POISSON, str(exc))
    return _scalar_response(request, OperationType.STATISTICS_POISSON, result)


@router.post("/statistics/uniform", response_model=MathResponse)
async def statistics_uniform(payload: UniformRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "statistics_uniform_request")
    try:
        if payload.query == "cdf":
            result = stats_service.uniform_cdf(payload.a, payload.b, payload.x)
        elif payload.query == "mean":
            result = stats_service.uniform_expected_value(payload.a, payload.b)
        else:
            result = stats_service.uniform_variance(payload.a, payload.b)
    except ValueError as exc:
        return _error(request, OperationType.STATISTICS_UNIFORM, str(exc))
    return _scalar_response(request, OperationType.STATISTICS_UNIFORM, result)


@router.post("/statistics/exponential", response_model=MathResponse)
async def statistics_exponential(payload: ExponentialRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "statistics_exponential_request")
    try:
        if payload.query == "cdf":
            result = stats_service.exponential_cdf(payload.lam, payload.x)
        elif payload.query == "mean":
            result = stats_service.exponential_expected_value(payload.lam)
        else:
            result = stats_service.exponential_variance(payload.lam)
    except ValueError as exc:
        return _error(request, OperationType.STATISTICS_EXPONENTIAL, str(exc))
    return _scalar_response(request, OperationType.STATISTICS_EXPONENTIAL, result)
