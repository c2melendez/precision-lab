"""
Auditoría de Módulos A/B/C (spec_motor_matematico_pendiente.md) contra el
backend real — no existían tests dedicados para estas rutas en el paquete
entregado (test_phase2.py solo verificaba que /solve/system e /inequality/
system fueran stubs, comportamiento que ya cambió).
"""

import os

os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Módulo A — hiperbólicas inversas recíprocas (paridad con Lite, ver
# tests/reciprocalHyperbolicInverses.test.ts en precision-lab-lite)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expr,expected",
    [
        ("asech(0.5)", 1.3169578969248166),
        ("acsch(2)", 0.48121182505960347),
        ("acoth(3)", 0.34657359027997264),
    ],
)
def test_reciprocal_inverse_hyperbolics(expr, expected):
    response = client.post("/api/v1/evaluate", json={"expression": expr})
    body = response.json()
    assert body["success"] is True
    assert body["result_approx"] == pytest.approx(expected, rel=1e-9)


# ---------------------------------------------------------------------------
# Módulo B — sistema lineal 5x5: único / indeterminado / incompatible
# distinguidos explícitamente (spec §3, DoD §7)
# ---------------------------------------------------------------------------


def test_5x5_unique_solution():
    response = client.post(
        "/api/v1/solve/system",
        json={
            "equations": ["x1=1", "x2=2", "x3=3", "x4=4", "x5=5"],
            "variables": ["x1", "x2", "x3", "x4", "x5"],
        },
    )
    body = response.json()
    assert body["success"] is True
    solutions = body["result_data"]
    assert len(solutions) == 1
    text = solutions[0]["text"]
    for i in range(1, 6):
        assert f"x{i}={i}" in text.replace(" ", "")


def test_5x5_infinite_solutions():
    response = client.post(
        "/api/v1/solve/system",
        json={
            "equations": ["x1-x2=0", "x2-x3=0", "x3-x4=0", "x4-x5=0", "2*x1-2*x2=0"],
            "variables": ["x1", "x2", "x3", "x4", "x5"],
        },
    )
    body = response.json()
    assert body["success"] is True
    assert len(body["result_data"]) == 1
    # Solución paramétrica (variable libre), no un único valor numérico por variable.
    assert "x5" in body["result_data"][0]["text"]


def test_5x5_inconsistent():
    response = client.post(
        "/api/v1/solve/system",
        json={
            "equations": ["x1=1", "x2=2", "x3=3", "x4=4", "x1=99"],
            "variables": ["x1", "x2", "x3", "x4", "x5"],
        },
    )
    body = response.json()
    assert body["success"] is True
    assert body["result_data"] == []
    assert any("inconsistente" in w.lower() or "no tiene solución" in w.lower() for w in body["warnings"])


# ---------------------------------------------------------------------------
# Módulo C — sistema de inecuaciones lineales, 2 variables, vértices
# (spec §4, diseño: opción "b" — vértices del polígono factible)
# ---------------------------------------------------------------------------


def test_inequality_system_bounded_triangle():
    response = client.post(
        "/api/v1/inequality/system",
        json={"inequalities": ["x>=0", "y>=0", "x+y<=4"], "variables": ["x", "y"]},
    )
    body = response.json()
    assert body["success"] is True
    assert body["result_text"] == "bounded"
    vertices = {tuple(v) for v in body["result_data"]}
    expected = {("0.0", "0.0"), ("4.0", "0.0"), ("0.0", "4.0")}
    assert vertices == expected


def test_inequality_system_rejects_nonlinear():
    response = client.post(
        "/api/v1/inequality/system",
        json={"inequalities": ["x*y<=4", "x>=0"], "variables": ["x", "y"]},
    )
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "VALIDATION_ERROR"


def test_inequality_system_rejects_three_variables():
    response = client.post(
        "/api/v1/inequality/system",
        json={"inequalities": ["x>=0", "y>=0", "z>=0"], "variables": ["x", "y", "z"]},
    )
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "VALIDATION_ERROR"


def test_inequality_system_empty_region_via_parallel_constraints():
    # Hallazgo de auditoría: x>=5 y x<=1 son paralelas (nunca se cruzan),
    # igual que un caso genuinamente no acotado (ver el siguiente test) —
    # el diseño original no distinguía "vacío" de "no acotado" aquí.
    response = client.post(
        "/api/v1/inequality/system",
        json={"inequalities": ["x>=5", "x<=1"], "variables": ["x", "y"]},
    )
    body = response.json()
    assert body["success"] is True
    assert body["result_text"] == "empty"


def test_inequality_system_unbounded_strip_not_confused_with_empty():
    # Misma estructura (2 rectas paralelas, 0 vértices) que el caso vacío
    # de arriba, pero esta vez SÍ factible (franja 0<=x<=1, y libre).
    response = client.post(
        "/api/v1/inequality/system",
        json={"inequalities": ["x>=0", "x<=1"], "variables": ["x", "y"]},
    )
    body = response.json()
    assert body["success"] is True
    assert body["result_text"] == "unbounded"


def test_inequality_system_unbounded_quadrant_one_finite_vertex():
    response = client.post(
        "/api/v1/inequality/system",
        json={"inequalities": ["x>=0", "y>=0"], "variables": ["x", "y"]},
    )
    body = response.json()
    assert body["success"] is True
    assert body["result_text"] == "unbounded"
    assert body["result_data"] == [["0.0", "0.0"]]
