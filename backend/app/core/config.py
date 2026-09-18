"""
Configuración de la aplicación (spec, sección 9).

Variables de entorno declaradas en la spec: CORS_ORIGINS, MATH_TIMEOUT_SECONDS,
GRAPH_2D_DEFAULT_POINTS. La spec no fija valores por defecto ni formato para
ninguna de las tres — decisión DEDUCIBLE tomada en este módulo (ver cierre):

- MATH_TIMEOUT_SECONDS: default 10 (coincide con el "timeout de 10s" que la
  sección 6 usa como referencia textual para MATH_TIMEOUT_SECONDS).
- GRAPH_2D_DEFAULT_POINTS: default 200 (valor intermedio razonable dentro del
  rango [50, 1000] permitido por `Graph2DRequest.samples`, sección 5).
- CORS_ORIGINS: sin default — lista separada por comas, obligatoria vía
  entorno/.env. No hay UI con credenciales/cookies en la spec, así que CORS
  se sirve con `allow_credentials=False` (ver main.py); aun así nunca se usa
  "*" como origen por defecto.

El "mapeo path->OperationType" que pide el Módulo 1 tampoco está anclado a
una sección numerada concreta de la spec — se adopta aquí (DEDUCIBLE) como un
diccionario estático que los routers de módulos futuros usarán para poblar
`MathResponse.operation` sin tener que hardcodear el enum en cada handler.
Solo se listan aquí las rutas de Fase 1 y Fase 2 ya fijadas por la sección 9;
no se anticipa lógica de negocio de módulos futuros.
"""

import os
from functools import lru_cache
from typing import Dict, List

from app.schemas.responses import OperationType

# Prefijo de la API (spec, sección 9).
API_V1_PREFIX = "/api/v1"

# Mapeo path (sin prefijo /api/v1) -> OperationType, según los endpoints
# enumerados en la spec, sección 9.
PATH_TO_OPERATION: Dict[str, OperationType] = {
    "/evaluate": OperationType.EVALUATE,
    "/simplify": OperationType.SIMPLIFY,
    "/factor": OperationType.FACTOR,
    "/expand": OperationType.EXPAND,
    "/solve": OperationType.SOLVE,
    "/derivative": OperationType.DERIVATIVE,
    "/integral": OperationType.INTEGRAL,
    "/matrix/operations": OperationType.MATRIX_OPERATION,
    "/matrix/determinant": OperationType.MATRIX_DETERMINANT,
    "/matrix/inverse": OperationType.MATRIX_INVERSE,
    "/graph/2d": OperationType.GRAPH_2D,
    "/solve/system": OperationType.SOLVE_SYSTEM,
    "/inequality": OperationType.INEQUALITY,
    "/limit": OperationType.LIMIT,
    "/series": OperationType.SERIES,
    "/matrix/eigen": OperationType.MATRIX_EIGEN,
    "/integral/improper": OperationType.INTEGRAL_IMPROPER,
    "/graph/3d": OperationType.GRAPH_3D,
    "/graph/parametric": OperationType.GRAPH_PARAMETRIC,
    "/graph/polar": OperationType.GRAPH_POLAR,
    "/derivative/partial": OperationType.DERIVATIVE_PARTIAL,
    "/derivative/implicit": OperationType.DERIVATIVE_IMPLICIT,
}


class Settings:
    """Configuración leída de variables de entorno.

    Se usa una clase simple en vez de `pydantic-settings` para el Módulo 1 —
    no hay ningún campo aquí con validación compleja que justifique la
    dependencia adicional todavía; si un módulo futuro la necesita, se añade
    y se justifica en su propio cierre (regla 5 del Mensaje 0).
    """

    def __init__(self) -> None:
        cors_origins_raw = os.environ.get("CORS_ORIGINS", "")
        self.cors_origins: List[str] = [
            origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()
        ]
        self.math_timeout_seconds: float = float(os.environ.get("MATH_TIMEOUT_SECONDS", "10"))
        self.graph_2d_default_points: int = int(os.environ.get("GRAPH_2D_DEFAULT_POINTS", "200"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
