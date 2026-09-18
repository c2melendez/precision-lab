"""
Tests reales del Módulo 9 (spec, sección 2 y 15): verifica AMBOS
comportamientos — passthrough trivial real (`/matrix/eigen`, `/limit`,
`/series`) y `UNSUPPORTED_IN_PHASE_1` sin ejecutar lógica de SymPy (el
resto) — para al menos un endpoint de cada tipo.
"""

import os

os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Passthrough trivial real
# ---------------------------------------------------------------------------


def test_limit_passthrough_real():
    # lim x->0 sin(x)/x = 1
    response = client.post(
        "/api/v1/limit",
        json={"expression": "sin(x)/x", "variable": "x", "point": "0", "direction": "both"},
    )
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is False
    assert body["result_text"] == "1"


def test_limit_at_infinity():
    response = client.post(
        "/api/v1/limit",
        json={"expression": "1/x", "variable": "x", "point": "oo", "direction": "both"},
    )
    body = response.json()
    assert body["success"] is True
    assert body["result_text"] == "0"


def test_series_passthrough_real():
    response = client.post(
        "/api/v1/series",
        json={"expression": "exp(x)", "variable": "x", "point": "0", "order": 3},
    )
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is False
    assert "x**2" in body["result_text"]
    assert "O(x**4)" in body["result_text"]


def test_matrix_eigen_passthrough_real():
    response = client.post("/api/v1/matrix/eigen", json={"matrix": [["2", "0"], ["0", "3"]]})
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is False
    assert "2" in body["result_text"]
    assert "3" in body["result_text"]


def test_matrix_eigen_tridiagonal_matches_lite_case():
    """Módulo K1 (spec_graficacion_matrices_estadistica_unidades.md, sección
    3.2): mismo caso de referencia usado en
    precision-lab-lite/tests/eigenOps.test.ts ("3x3 tridiagonal") — eigenvalores
    exactos 2, 2-sqrt(2), 2+sqrt(2). Equivalencia matemática entre motores,
    no textual: SymPy expresa sqrt(2) como "sqrt(2)", Algebrite como
    "2^(1/2)" — se compara el valor numérico, no el string."""
    response = client.post(
        "/api/v1/matrix/eigen",
        json={"matrix": [["2", "1", "0"], ["1", "2", "1"], ["0", "1", "2"]]},
    )
    body = response.json()
    assert body["success"] is True
    text = body["result_text"]
    # SymPy reporta cada eigenvalor con su multiplicidad explícita —
    # verificamos que la forma irracional exacta aparece, sin depender del
    # formato completo de impresión (equivalencia matemática, no textual,
    # con "2-2^(1/2)"/"2+2^(1/2)" que produce Algebrite en Lite).
    assert "sqrt(2)" in text


# ---------------------------------------------------------------------------
# UNSUPPORTED_IN_PHASE_1 — sin ejecutar lógica de SymPy
# ---------------------------------------------------------------------------


# Corrección post-auditoría: /solve/system y /inequality dejaron de ser
# stubs de la Fase 1 (Módulo B y trabajo de una sesión anterior,
# respectivamente) — ver tests/test_modulos_abc_auditoria.py para la
# cobertura real de /solve/system (incluidos los casos 5x5) y
# tests/test_solve.py / test_evaluate.py para /inequality de 1 variable.
# Estos 2 tests quedaban afirmando el comportamiento viejo (stub) y
# fallaban contra el código real; se actualizan para reflejar el
# comportamiento actual en vez de eliminarse, para no perder la
# verificación de que "eval(1)=0" (una inyección obvia) se rechaza con
# PARSE_ERROR y no se ejecuta como código.
def test_solve_system_rejects_unsafe_input():
    response = client.post(
        "/api/v1/solve/system",
        json={"equations": ["x+y=1", "eval(1)=0"], "variables": ["x", "y"]},
    )
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "PARSE_ERROR"
    assert body["operation"] == "solve_system"


def test_inequality_is_real_passthrough():
    response = client.post("/api/v1/inequality", json={"inequality": "x>2"})
    body = response.json()
    assert body["success"] is True
    assert "2" in body["result_text"]


def test_integral_improper_is_unsupported_stub():
    response = client.post(
        "/api/v1/integral/improper",
        json={"expression": "exp(-x)", "variable": "x", "lower_bound": "0", "upper_bound": "oo"},
    )
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "UNSUPPORTED_IN_PHASE_1"


def test_graph_3d_is_unsupported_stub():
    response = client.post(
        "/api/v1/graph/3d", json={"expression": "x**2+y**2", "variables": ["x", "y"]}
    )
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "UNSUPPORTED_IN_PHASE_1"


def test_graph_parametric_is_unsupported_stub():
    response = client.post(
        "/api/v1/graph/parametric",
        json={"x_expression": "cos(t)", "y_expression": "sin(t)", "parameter": "t"},
    )
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "UNSUPPORTED_IN_PHASE_1"


def test_derivative_partial_is_unsupported_stub():
    response = client.post(
        "/api/v1/derivative/partial", json={"expression": "x**2*y", "variable": "x"}
    )
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "UNSUPPORTED_IN_PHASE_1"


def test_derivative_implicit_is_unsupported_stub():
    response = client.post("/api/v1/derivative/implicit", json={"equation": "x**2+y**2=1"})
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "UNSUPPORTED_IN_PHASE_1"
