"""
app/routers/matrices.py — `POST /matrix/operations` (spec, secciones 4, 5,
8.6, 9).
"""

import time

import sympy
from fastapi import APIRouter, Request

from app.core.logging import log_request_event
from app.schemas.requests import (
    MatrixEigenRequest,
    MatrixOperationRequest,
    MatrixPowerRequest,
    MatrixSingleRequest,
)
from app.schemas.responses import ErrorCode, MathResponse, MatrixOpKind, OperationType, ResultType
from app.services import matrix_service, parsing
from app.services.ast_validator import ComplexityLimitError

router = APIRouter(tags=["matrices"])


def _duration_ms(request: Request) -> float:
    return (time.perf_counter() - request.state.start_time) * 1000


def _error(
    request: Request, operation: OperationType, error_code: ErrorCode, message: str
) -> MathResponse:
    return MathResponse(
        success=False,
        operation=operation,
        request_id=request.state.request_id,
        has_detailed_steps=False,
        error_code=error_code,
        error_message=message,
        duration_ms=_duration_ms(request),
    )


@router.post("/matrix/operations", response_model=MathResponse)
async def matrix_operations(payload: MatrixOperationRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "matrix_operations_request")

    try:
        matrix_a = matrix_service.parse_matrix(payload.matrix_a)
        matrix_b = matrix_service.parse_matrix(payload.matrix_b)
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.MATRIX_OPERATION, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, OperationType.MATRIX_OPERATION, ErrorCode.COMPLEXITY_LIMIT, str(exc))

    try:
        if payload.operation in (MatrixOpKind.ADD, MatrixOpKind.SUBTRACT):
            result = matrix_service.add_or_subtract(matrix_a, matrix_b, payload.operation)
        elif payload.operation == MatrixOpKind.KRONECKER:
            result = matrix_service.kronecker(matrix_a, matrix_b)
        elif payload.operation == MatrixOpKind.CROSS:
            result = matrix_service.cross(matrix_a, matrix_b)
        elif payload.operation == MatrixOpKind.DOT:
            # P5 (spec v2 §6): dot devuelve un escalar (ScalarStepResult),
            # no una matriz — se arma la respuesta aparte, no puede pasar
            # por el "return MathResponse(...)" genérico de abajo (que
            # asume result.result_matrix).
            dot_result = matrix_service.dot(matrix_a, matrix_b)
            return MathResponse(
                success=True,
                operation=OperationType.MATRIX_OPERATION,
                request_id=request.state.request_id,
                result_type=ResultType.SCALAR,
                result_text=str(dot_result.value),
                result_latex=sympy.latex(dot_result.value),
                result_approx=float(dot_result.value) if dot_result.value.is_real else None,
                steps=dot_result.steps,
                has_detailed_steps=dot_result.has_detailed_steps,
                warnings=dot_result.warnings,
                duration_ms=_duration_ms(request),
            )
        else:
            result = matrix_service.multiply(matrix_a, matrix_b)
    except matrix_service.DimensionMismatchError as exc:
        return _error(
            request, OperationType.MATRIX_OPERATION, ErrorCode.DIMENSION_MISMATCH, str(exc)
        )

    return MathResponse(
        success=True,
        operation=OperationType.MATRIX_OPERATION,
        request_id=request.state.request_id,
        result_type=ResultType.MATRIX,
        result_data=matrix_service.matrix_to_result_data(result.result_matrix),
        steps=result.steps,
        has_detailed_steps=result.has_detailed_steps,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/matrix/ref", response_model=MathResponse)
async def matrix_ref(payload: MatrixSingleRequest, request: Request) -> MathResponse:
    """Fase C (spec UX estilo ClassCalc, sección 4)."""
    log_request_event(request.state.request_id, "matrix_ref_request")

    try:
        matrix = matrix_service.parse_matrix(payload.matrix)
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.MATRIX_REF, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, OperationType.MATRIX_REF, ErrorCode.COMPLEXITY_LIMIT, str(exc))

    result = matrix_service.ref(matrix)

    return MathResponse(
        success=True,
        operation=OperationType.MATRIX_REF,
        request_id=request.state.request_id,
        result_type=ResultType.MATRIX,
        result_data=matrix_service.matrix_to_result_data(result.result_matrix),
        steps=result.steps,
        has_detailed_steps=result.has_detailed_steps,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/matrix/rref", response_model=MathResponse)
async def matrix_rref(payload: MatrixSingleRequest, request: Request) -> MathResponse:
    """Fase C (spec UX estilo ClassCalc, sección 4)."""
    log_request_event(request.state.request_id, "matrix_rref_request")

    try:
        matrix = matrix_service.parse_matrix(payload.matrix)
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.MATRIX_RREF, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, OperationType.MATRIX_RREF, ErrorCode.COMPLEXITY_LIMIT, str(exc))

    result = matrix_service.rref(matrix)

    return MathResponse(
        success=True,
        operation=OperationType.MATRIX_RREF,
        request_id=request.state.request_id,
        result_type=ResultType.MATRIX,
        result_data=matrix_service.matrix_to_result_data(result.result_matrix),
        steps=result.steps,
        has_detailed_steps=result.has_detailed_steps,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/matrix/determinant", response_model=MathResponse)
async def matrix_determinant(payload: MatrixSingleRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "matrix_determinant_request")

    try:
        matrix = matrix_service.parse_matrix(payload.matrix)
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.MATRIX_DETERMINANT, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(
            request, OperationType.MATRIX_DETERMINANT, ErrorCode.COMPLEXITY_LIMIT, str(exc)
        )

    try:
        result = matrix_service.determinant(matrix)
    except matrix_service.DimensionMismatchError as exc:
        return _error(
            request, OperationType.MATRIX_DETERMINANT, ErrorCode.DIMENSION_MISMATCH, str(exc)
        )

    return MathResponse(
        success=True,
        operation=OperationType.MATRIX_DETERMINANT,
        request_id=request.state.request_id,
        result_type=ResultType.SCALAR,
        result_text=str(result.value),
        result_latex=sympy.latex(result.value),
        result_approx=float(result.value) if result.value.is_real else None,
        steps=result.steps,
        has_detailed_steps=result.has_detailed_steps,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/matrix/inverse", response_model=MathResponse)
async def matrix_inverse(payload: MatrixSingleRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "matrix_inverse_request")

    try:
        matrix = matrix_service.parse_matrix(payload.matrix)
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.MATRIX_INVERSE, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, OperationType.MATRIX_INVERSE, ErrorCode.COMPLEXITY_LIMIT, str(exc))

    try:
        result = matrix_service.inverse(matrix)
    except matrix_service.DimensionMismatchError as exc:
        return _error(request, OperationType.MATRIX_INVERSE, ErrorCode.DIMENSION_MISMATCH, str(exc))
    except matrix_service.SingularMatrixError as exc:
        return _error(request, OperationType.MATRIX_INVERSE, ErrorCode.SINGULAR_MATRIX, str(exc))

    return MathResponse(
        success=True,
        operation=OperationType.MATRIX_INVERSE,
        request_id=request.state.request_id,
        result_type=ResultType.MATRIX,
        result_data=matrix_service.matrix_to_result_data(result.result_matrix),
        steps=result.steps,
        has_detailed_steps=result.has_detailed_steps,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/matrix/transpose", response_model=MathResponse)
async def matrix_transpose(payload: MatrixSingleRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "matrix_transpose_request")

    try:
        matrix = matrix_service.parse_matrix(payload.matrix)
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.MATRIX_TRANSPOSE, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(
            request, OperationType.MATRIX_TRANSPOSE, ErrorCode.COMPLEXITY_LIMIT, str(exc)
        )

    result = matrix_service.transpose(matrix)

    return MathResponse(
        success=True,
        operation=OperationType.MATRIX_TRANSPOSE,
        request_id=request.state.request_id,
        result_type=ResultType.MATRIX,
        result_data=matrix_service.matrix_to_result_data(result.result_matrix),
        steps=result.steps,
        has_detailed_steps=result.has_detailed_steps,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/matrix/power", response_model=MathResponse)
async def matrix_power(payload: MatrixPowerRequest, request: Request) -> MathResponse:
    log_request_event(request.state.request_id, "matrix_power_request")

    try:
        matrix = matrix_service.parse_matrix(payload.matrix)
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.MATRIX_POWER, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, OperationType.MATRIX_POWER, ErrorCode.COMPLEXITY_LIMIT, str(exc))

    try:
        result = matrix_service.power(matrix, payload.exponent)
    except matrix_service.DimensionMismatchError as exc:
        return _error(request, OperationType.MATRIX_POWER, ErrorCode.DIMENSION_MISMATCH, str(exc))
    except matrix_service.SingularMatrixError as exc:
        return _error(request, OperationType.MATRIX_POWER, ErrorCode.SINGULAR_MATRIX, str(exc))

    return MathResponse(
        success=True,
        operation=OperationType.MATRIX_POWER,
        request_id=request.state.request_id,
        result_type=ResultType.MATRIX,
        result_data=matrix_service.matrix_to_result_data(result.result_matrix),
        steps=result.steps,
        has_detailed_steps=result.has_detailed_steps,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/matrix/norm", response_model=MathResponse)
async def matrix_norm(payload: MatrixSingleRequest, request: Request) -> MathResponse:
    """P5 (spec v2 §6) — mismo patrón que /matrix/determinant: escalar,
    no matriz, con result_approx además de la forma exacta."""
    log_request_event(request.state.request_id, "matrix_norm_request")

    try:
        matrix = matrix_service.parse_matrix(payload.matrix)
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.MATRIX_NORM, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, OperationType.MATRIX_NORM, ErrorCode.COMPLEXITY_LIMIT, str(exc))

    try:
        result = matrix_service.norm(matrix)
    except matrix_service.DimensionMismatchError as exc:
        return _error(request, OperationType.MATRIX_NORM, ErrorCode.DIMENSION_MISMATCH, str(exc))

    return MathResponse(
        success=True,
        operation=OperationType.MATRIX_NORM,
        request_id=request.state.request_id,
        result_type=ResultType.SCALAR,
        result_text=str(result.value),
        result_latex=sympy.latex(result.value),
        result_approx=float(result.value) if result.value.is_real else None,
        steps=result.steps,
        has_detailed_steps=result.has_detailed_steps,
        warnings=result.warnings,
        duration_ms=_duration_ms(request),
    )


@router.post("/matrix/eigen", response_model=MathResponse)
async def matrix_eigen(payload: MatrixEigenRequest, request: Request) -> MathResponse:
    """Fase 2 — passthrough trivial real (sección 2)."""
    log_request_event(request.state.request_id, "matrix_eigen_request")

    try:
        matrix = matrix_service.parse_matrix(payload.matrix)
    except parsing.ParseSecurityError as exc:
        return _error(request, OperationType.MATRIX_EIGEN, ErrorCode.PARSE_ERROR, str(exc))
    except ComplexityLimitError as exc:
        return _error(request, OperationType.MATRIX_EIGEN, ErrorCode.COMPLEXITY_LIMIT, str(exc))

    try:
        eigen_text = matrix_service.eigen(matrix)
    except matrix_service.DimensionMismatchError as exc:
        return _error(request, OperationType.MATRIX_EIGEN, ErrorCode.DIMENSION_MISMATCH, str(exc))

    return MathResponse(
        success=True,
        operation=OperationType.MATRIX_EIGEN,
        request_id=request.state.request_id,
        result_text=eigen_text,
        has_detailed_steps=False,
        duration_ms=_duration_ms(request),
    )
