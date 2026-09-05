"""
Punto de entrada de la aplicación FastAPI (spec, sección 9):

- Middleware de request_id/start_time ANTES de cualquier validación.
- CORS desde CORS_ORIGINS (env), nunca "*" con allow_credentials=True.
- Prefijo /api/v1.
- GET /api/v1/health -> {"status": "ok"}.
"""

import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import API_V1_PREFIX, get_settings
from app.core.exception_handlers import (
    generic_exception_handler,
    timeout_exception_handler,
    validation_exception_handler,
)
from app.core.logging import configure_logging
from app.routers import algebra, calculus, evaluate, graphing, health, matrices, phase2, statistics

configure_logging()

app = FastAPI(
    title="Calculadora Científica Web",
    version="0.1.0",
    # FIX (post-entrega, corrige Módulo 1): por defecto FastAPI sirve el
    # esquema OpenAPI en "/openapi.json" (raíz), no bajo el prefijo /api/v1
    # de los routers. La spec (sección 9) y frontend/package.json
    # ("generate-types": openapi-typescript
    # http://localhost:8000/api/v1/openapi.json ...) asumen que vive en
    # /api/v1/openapi.json. Sin este parámetro, `npm run generate-types`
    # devolvía 404 (documentado en README como limitación conocida).
    # Se fija aquí para que la ruta real coincida con la que la spec y el
    # script del frontend ya esperaban.
    openapi_url=f"{API_V1_PREFIX}/openapi.json",
    docs_url=f"{API_V1_PREFIX}/docs",
    redoc_url=f"{API_V1_PREFIX}/redoc",
)

settings = get_settings()

# CORS: nunca "*" con credenciales. Esta app no usa cookies/autenticación de
# sesión, así que allow_credentials queda explícitamente en False (decisión
# DEDUCIBLE, sin sección numerada que lo determine — ver cierre del Módulo 1).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    """Genera request_id/start_time ANTES de cualquier validación posterior."""
    request.state.request_id = str(uuid.uuid4())
    request.state.start_time = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(TimeoutError, timeout_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

app.include_router(health.router, prefix=API_V1_PREFIX)
app.include_router(evaluate.router, prefix=API_V1_PREFIX)
app.include_router(algebra.router, prefix=API_V1_PREFIX)
app.include_router(calculus.router, prefix=API_V1_PREFIX)
app.include_router(matrices.router, prefix=API_V1_PREFIX)
app.include_router(graphing.router, prefix=API_V1_PREFIX)
app.include_router(phase2.router, prefix=API_V1_PREFIX)
app.include_router(statistics.router, prefix=API_V1_PREFIX)
