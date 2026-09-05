"""
Request schemas — Fase 1 (spec, sección 5) y Fase 2 (spec, sección 2).

Los schemas de Fase 2 se implementan completos (validación Pydantic real)
aunque el *servicio* detrás sea un stub en el Módulo 9 (spec, sección 2).

Regla de proyecto (Mensaje 0, punto 3): estos contratos no se redefinen en
otro archivo ni se rompen sin autorización explícita.
"""

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.responses import MatrixOpKind

# ---------------------------------------------------------------------------
# Fase 1 (spec, sección 5)
# ---------------------------------------------------------------------------


class ExpressionRequest(BaseModel):
    expression: str = Field(..., min_length=1, max_length=500)


class EvaluateRequest(BaseModel):
    expression: str = Field(..., min_length=1, max_length=500)
    angle_unit: Literal["rad", "deg"] = "rad"
    substitutions: Optional[Dict[str, str]] = None


class DerivativeRequest(BaseModel):
    expression: str = Field(..., min_length=1, max_length=500)
    variable: str = "x"
    order: int = Field(1, ge=1, le=5)


class IntegralRequest(BaseModel):
    expression: str = Field(..., min_length=1, max_length=500)
    variable: str = "x"
    lower_bound: Optional[str] = None
    upper_bound: Optional[str] = None
    # juntos o ninguno. "oo"/"-oo" -> error_code: UNSUPPORTED_IN_PHASE_1, con
    # error_message: "Los límites infinitos no están disponibles en esta fase."
    # NO mencionar /integral/improper como alternativa funcional — ese endpoint
    # también responde UNSUPPORTED_IN_PHASE_1 (sección 2); prometer una
    # alternativa que no funciona es peor que no ofrecer ninguna.


class SolveRequest(BaseModel):
    equation: str = Field(..., min_length=1, max_length=500)
    variable: Optional[str] = None
    angle_unit: Literal["rad", "deg"] = "rad"


class MatrixOperationRequest(BaseModel):
    operation: MatrixOpKind
    matrix_a: List[List[str]] = Field(..., min_length=1, max_length=6)
    matrix_b: List[List[str]] = Field(..., min_length=1, max_length=6)
    # ADD/SUBTRACT: requieren filas(A)==filas(B) Y columnas(A)==columnas(B).
    # MULTIPLY: requiere columnas(A)==filas(B). Cualquier incumplimiento ->
    # error_code: DIMENSION_MISMATCH, validado ANTES de intentar la operación.


class MatrixSingleRequest(BaseModel):
    matrix: List[List[str]] = Field(..., min_length=1, max_length=6)
    # /determinant y /inverse: validar cuadrada -> si no, DIMENSION_MISMATCH.


class MatrixPowerRequest(BaseModel):
    matrix: List[List[str]] = Field(..., min_length=1, max_length=6)
    exponent: int = Field(..., ge=-10, le=10)
    # Cuadrada obligatoria -> DIMENSION_MISMATCH si no. Exponente negativo
    # requiere matriz invertible -> SINGULAR_MATRIX si no. Rango acotado
    # (igual criterio que otros límites de complejidad, sección 7/9) para
    # evitar entradas de tamaño explosivo (A**10 en una matriz 6x6 ya es
    # bastante trabajo simbólico).


class Graph2DRequest(BaseModel):
    expressions: List[str] = Field(..., min_length=1, max_length=5)
    variable: str = "x"
    x_min: Optional[float] = Field(None, allow_inf_nan=False)
    x_max: Optional[float] = Field(None, allow_inf_nan=False)
    samples: Optional[int] = Field(None, ge=50, le=1000)
    angle_unit: Literal["rad", "deg"] = "rad"
    # Si SOLO uno de x_min/x_max viene especificado: se ignora, se usa el
    # dominio completo por defecto, con warning explícito. Si ambos vienen:
    # x_min < x_max.


# ---------------------------------------------------------------------------
# Fase 2 (spec, sección 2) — schemas completos aunque el servicio sea un stub
# ---------------------------------------------------------------------------


class SolveSystemRequest(BaseModel):
    equations: List[str] = Field(..., min_length=2, max_length=6)
    variables: List[str] = Field(..., min_length=2, max_length=6)


class InequalityRequest(BaseModel):
    inequality: str = Field(..., min_length=1, max_length=500)  # incluye <, >, <=, >=
    variable: Optional[str] = None


class LimitRequest(BaseModel):
    expression: str = Field(..., min_length=1, max_length=500)
    variable: str = "x"
    point: str = "0"  # puede ser "oo" o "-oo"
    direction: Literal["both", "left", "right"] = "both"


class SeriesRequest(BaseModel):
    expression: str = Field(..., min_length=1, max_length=500)
    variable: str = "x"
    point: str = "0"
    order: int = Field(6, ge=1, le=20)


class MatrixEigenRequest(BaseModel):
    matrix: List[List[str]] = Field(..., min_length=1, max_length=6)


class ImproperIntegralRequest(BaseModel):
    expression: str = Field(..., min_length=1, max_length=500)
    variable: str = "x"
    lower_bound: str  # admite "oo"/"-oo"
    upper_bound: str


class Graph3DRequest(BaseModel):
    expression: str = Field(..., min_length=1, max_length=500)
    variables: List[str] = Field(default_factory=lambda: ["x", "y"], min_length=2, max_length=2)
    x_range: List[float] = Field(default_factory=lambda: [-10, 10])
    y_range: List[float] = Field(default_factory=lambda: [-10, 10])


class GraphParametricRequest(BaseModel):
    x_expression: str
    y_expression: str
    parameter: str = "t"
    t_min: float = 0
    t_max: float = 6.283185307179586  # 2*pi


class PartialDerivativeRequest(BaseModel):
    expression: str = Field(..., min_length=1, max_length=500)
    variable: str
    order: int = Field(1, ge=1, le=3)


class ImplicitDerivativeRequest(BaseModel):
    equation: str = Field(..., min_length=1, max_length=500)  # debe contener "="
    dependent_variable: str = "y"
    independent_variable: str = "x"


# ---------------------------------------------------------------------------
# P6 (spec v2 §7.4): Estadística — StatisticsDescriptiveRequest,
# CombinatoricsRequest, BinomialRequest, NormalRequest.
# ---------------------------------------------------------------------------


class StatisticsDescriptiveRequest(BaseModel):
    values: List[float] = Field(..., min_length=1, max_length=200)
    stat: Literal["mean", "median", "mode", "sum", "sumsq", "n", "min", "max", "range", "mad", "variance", "stdev"]
    variance_kind: Literal["population", "sample"] = "population"


class CombinatoricsRequest(BaseModel):
    n: int = Field(..., ge=0, le=170)  # 170! es el límite antes de overflow en float
    r: int = Field(0, ge=0, le=170)
    fn: Literal["nCr", "nPr", "factorial"]


class BinomialRequest(BaseModel):
    n: int = Field(..., ge=0, le=1000)
    p: float = Field(..., ge=0, le=1)
    k: int = Field(0, ge=0)
    query: Literal["pmf", "cdf", "survival", "mean", "variance"]


class NormalRequest(BaseModel):
    mu: float = 0
    sigma: float = Field(1, gt=0)
    x: float = 0
    a: float = 0
    b: float = 0
    query: Literal["cdf", "range", "zscore"]
