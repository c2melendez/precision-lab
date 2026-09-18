"""
Tests reales del Módulo 8 para `POST /api/v1/graph/2d` (spec, secciones 10
y 15): 1/x, sqrt(x) con dominio negativo, función constante, variable
incorrecta, modo grados, solo x_min especificado (warning).
"""

import os

os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

import math

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _graph(expressions, **kwargs):
    payload = {"expressions": expressions, **kwargs}
    return client.post("/api/v1/graph/2d", json=payload)


def test_one_over_x_has_none_near_asymptote():
    response = _graph(["1/x"], x_min=-5, x_max=5, samples=101)
    body = response.json()
    assert body["success"] is True
    trace = body["graph_data"]["traces"][0]
    # El punto más cercano a x=0 en una malla simétrica con 101 puntos entre
    # -5 y 5 cae exactamente en x=0 (paso 0.1) -> y debe ser None ahí.
    x_values = trace["x"]
    y_values = trace["y"]
    zero_index = min(range(len(x_values)), key=lambda i: abs(x_values[i]))
    assert abs(x_values[zero_index]) < 1e-9
    assert y_values[zero_index] is None


def test_sqrt_x_negative_domain_gives_none():
    response = _graph(["sqrt(x)"], x_min=-10, x_max=10, samples=50)
    body = response.json()
    assert body["success"] is True
    trace = body["graph_data"]["traces"][0]
    for x, y in zip(trace["x"], trace["y"], strict=True):
        if x < 0:
            assert y is None
        elif x > 0:
            assert y is not None
            assert y == pytest_approx(math.sqrt(x))


def pytest_approx(value, tol=1e-6):
    class _Approx:
        def __eq__(self, other):
            return abs(other - value) < tol

    return _Approx()


def test_constant_function_is_valid():
    response = _graph(["5"], x_min=-10, x_max=10, samples=50)
    body = response.json()
    assert body["success"] is True
    trace = body["graph_data"]["traces"][0]
    assert all(y == 5.0 for y in trace["y"])


def test_expression_with_wrong_variable_returns_invalid_variable():
    response = _graph(["y+1"], variable="x", x_min=-5, x_max=5)
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "INVALID_VARIABLE"


def test_degree_mode_sin_x():
    response = _graph(["sin(x)"], angle_unit="deg", x_min=0, x_max=360, samples=361)
    body = response.json()
    assert body["success"] is True
    trace = body["graph_data"]["traces"][0]
    # x=90 grados -> sin(90°) = 1
    for x, y in zip(trace["x"], trace["y"], strict=True):
        if abs(x - 90) < 1e-6:
            assert abs(y - 1.0) < 1e-6


def test_only_x_min_specified_triggers_warning_and_default_domain():
    response = _graph(["x"], x_min=2)
    body = response.json()
    assert body["success"] is True
    assert any("dominio" in w for w in body["warnings"])
    # Al ignorarse el límite parcial, se usa el dominio por defecto (más
    # amplio que [2, ...)).
    assert body["graph_data"]["x_range"][0] < 2


def test_graph_parse_error_propagates():
    response = _graph(["eval(1)"])
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "PARSE_ERROR"
    assert body["operation"] == "graph_2d"


# ---------------------------------------------------------------------------
# Módulo I0 (spec_graficacion_matrices_estadistica_unidades.md, Fase I):
# POST /graph/polar. r=1 debe trazar el círculo unitario completo; se
# verifica contra el caso conocido del spec (sección 10: "r=1 es un
# círculo unitario") y contra la regresión de /graph/2d y /graph/parametric.
# ---------------------------------------------------------------------------


def _polar(r_expression, **kwargs):
    payload = {"r_expression": r_expression, **kwargs}
    return client.post("/api/v1/graph/polar", json=payload)


def test_polar_unit_circle_r_equals_1():
    response = _polar("1")
    body = response.json()
    assert body["success"] is True
    assert body["operation"] == "graph_polar"
    trace = body["graph_data"]["traces"][0]
    for x, y in zip(trace["x"], trace["y"], strict=True):
        assert abs(math.hypot(x, y) - 1.0) < 1e-6


def test_polar_spiral_r_equals_theta_grows_with_theta():
    response = _polar("theta", theta_min=0, theta_max=4 * math.pi)
    body = response.json()
    assert body["success"] is True
    trace = body["graph_data"]["traces"][0]
    radii = [math.hypot(x, y) for x, y in zip(trace["x"], trace["y"], strict=True)]
    # r=theta es monótonamente creciente en [0, 4*pi) -> el radio en el
    # último punto debe ser mayor que en el primero.
    assert radii[-1] > radii[0]


def test_polar_wrong_variable_returns_invalid_variable():
    response = _polar("phi + 1", variable="theta")
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "INVALID_VARIABLE"


def test_polar_parse_error_propagates():
    response = _polar("eval(1)")
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "PARSE_ERROR"
    assert body["operation"] == "graph_polar"


def test_regression_graph_2d_and_parametric_unaffected_by_polar():
    response_2d = _graph(["x**2"], x_min=-3, x_max=3, samples=51)
    assert response_2d.json()["success"] is True

    response_param = client.post(
        "/api/v1/graph/parametric",
        json={"x_expression": "cos(t)", "y_expression": "sin(t)", "parameter": "t"},
    )
    body_param = response_param.json()
    assert body_param["success"] is True
    trace = body_param["graph_data"]["traces"][0]
    for x, y in zip(trace["x"], trace["y"], strict=True):
        assert abs(math.hypot(x, y) - 1.0) < 1e-6


# ---------------------------------------------------------------------------
# Módulo J2 (spec_graficacion_matrices_estadistica_unidades.md, sección
# 3.2): caso de referencia para /graph/3d usado también en Lite
# (tests/graphing.test.ts::analyzeGraphSurface3D, "z=x+y: cada punto de la
# grilla cumple z=x+y") — z=x+y es un plano, cada punto de la grilla debe
# cumplir z===x+y exactamente. Se agrega aquí porque /graph/3d todavía no
# tenía un test propio en esta suite (solo se ejercitaba indirectamente
# vía el router).
# ---------------------------------------------------------------------------


def test_graph_3d_plane_z_equals_x_plus_y_matches_every_grid_point():
    response = client.post(
        "/api/v1/graph/3d",
        json={"expression": "x+y", "variables": ["x", "y"], "x_range": [-3, 3], "y_range": [-3, 3]},
    )
    body = response.json()
    assert body["success"] is True
    trace = body["graph_data"]["traces"][0]
    assert trace["type"] == "surface"
    xs = trace["x"]
    ys = trace["y"]
    z_grid = trace["z"]
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            assert abs(z_grid[j][i] - (x + y)) < 1e-9


def test_graph_3d_paraboloid_minimum_near_origin():
    response = client.post(
        "/api/v1/graph/3d",
        json={"expression": "x**2+y**2", "variables": ["x", "y"], "x_range": [-2, 2], "y_range": [-2, 2]},
    )
    body = response.json()
    z_grid = body["graph_data"]["traces"][0]["z"]
    min_z = min(min(row) for row in z_grid)
    assert 0 <= min_z < 0.1
