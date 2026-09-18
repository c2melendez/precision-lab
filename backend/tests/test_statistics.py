"""
tests/test_statistics.py — Módulo M0 (spec_graficacion_matrices_estadistica_unidades.md,
sección 6.1): cuartiles/percentiles/RIQ. /statistics/descriptive no tenía
ningún test en esta suite todavía (confirmado buscando en todo tests/ antes
de escribir este archivo) — se agrega cobertura de M0 y, como regresión
real (no solo "no debería haber cambiado"), de las estadísticas existentes
también, ya que no había una base previa de la que apoyarse.
"""

import os

os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# Caso de referencia calculado a mano y verificado contra el endpoint real:
# [2,4,4,4,5,5,7,9], n=8, interpolación lineal (convención numpy.percentile
# default / Excel PERCENTILE.INC):
#   Q1 (p=25): index=1.75 -> entre values[1]=4 y values[2]=4 -> 4
#   Q2 (p=50): index=3.5  -> entre values[3]=4 y values[4]=5 -> 4.5
#   Q3 (p=75): index=5.25 -> entre values[5]=5 y values[6]=7 -> 5.5
#   IQR = Q3-Q1 = 1.5
#   P90: index=6.3 -> entre values[6]=7 y values[7]=9 -> 7.6
KNOWN_DATASET = [2, 4, 4, 4, 5, 5, 7, 9]


def _descriptive(stat, values=None, percentile_p=None, variance_kind=None):
    payload = {"values": values if values is not None else KNOWN_DATASET, "stat": stat}
    if percentile_p is not None:
        payload["percentile_p"] = percentile_p
    if variance_kind is not None:
        payload["variance_kind"] = variance_kind
    return client.post("/api/v1/statistics/descriptive", json=payload)


def test_q1_known_dataset():
    body = _descriptive("q1").json()
    assert body["success"] is True
    assert body["result_approx"] == 4.0


def test_q2_equals_median_known_dataset():
    body = _descriptive("q2").json()
    assert body["success"] is True
    assert body["result_approx"] == 4.5
    # Q2 debe coincidir exactamente con "median" -- misma definición.
    median_body = _descriptive("median").json()
    assert body["result_text"] == median_body["result_text"]


def test_q3_known_dataset():
    body = _descriptive("q3").json()
    assert body["success"] is True
    assert body["result_approx"] == 5.5


def test_iqr_known_dataset():
    body = _descriptive("iqr").json()
    assert body["success"] is True
    assert body["result_approx"] == 1.5


def test_percentile_arbitrary_p90_known_dataset():
    body = _descriptive("percentile", percentile_p=90).json()
    assert body["success"] is True
    assert body["result_approx"] == 7.6


def test_percentile_without_p_is_domain_error():
    body = _descriptive("percentile").json()
    assert body["success"] is False


def test_percentile_out_of_range_rejected():
    response = _descriptive("percentile", percentile_p=150)
    assert response.status_code == 422  # validación de Pydantic (le=100)


def test_percentile_exact_rational_result_not_float_rounded():
    # El resultado exacto de P90 es 38/5 -- confirma que la aritmética se
    # mantuvo en Rational de SymPy hasta el final, no que cayó a float en
    # algún punto intermedio (el bug que se corrigió con
    # sympy.Rational(p)/100 en vez de p/100).
    body = _descriptive("percentile", percentile_p=90).json()
    assert body["result_text"] == "38/5"


# ---------------------------------------------------------------------------
# Regresión: mean/median/mode/stdev/variance/mad existentes no cambian.
# Sin tests previos de /statistics/descriptive en esta suite, así que se
# verifican contra valores calculados a mano, no solo "no lanzó excepción".
# ---------------------------------------------------------------------------


def test_regression_mean_unaffected():
    body = _descriptive("mean", values=[2, 4, 4, 4, 5, 5, 7, 9]).json()
    assert body["success"] is True
    assert body["result_approx"] == 5.0  # (2+4+4+4+5+5+7+9)/8 = 40/8 = 5


def test_regression_median_unaffected():
    body = _descriptive("median").json()
    assert body["success"] is True
    assert body["result_approx"] == 4.5


def test_regression_mode_unaffected():
    body = _descriptive("mode").json()
    assert body["success"] is True
    assert body["result_approx"] == 4.0  # 4 aparece 3 veces, más que cualquier otro


def test_regression_stdev_and_variance_unaffected():
    body_var = _descriptive("variance", variance_kind="sample").json()
    body_std = _descriptive("stdev", variance_kind="sample").json()
    assert body_var["success"] is True
    assert body_std["success"] is True
    assert abs(body_std["result_approx"] ** 2 - body_var["result_approx"]) < 1e-9


def test_regression_mad_unaffected():
    body = _descriptive("mad").json()
    assert body["success"] is True
    assert body["result_approx"] is not None


# ---------------------------------------------------------------------------
# Módulo M1 (spec_graficacion_matrices_estadistica_unidades.md, sección
# 6.2): correlación y regresión lineal simple.
# ---------------------------------------------------------------------------


def _correlation(x, y, query):
    return client.post("/api/v1/statistics/correlation", json={"x": x, "y": y, "query": query})


def test_perfect_linear_relationship_r_equals_1():
    # y = 2x + 1
    body = _correlation([1, 2, 3, 4], [3, 5, 7, 9], "correlation").json()
    assert body["success"] is True
    assert body["result_approx"] == 1.0


def test_perfect_linear_relationship_slope_and_intercept():
    body_slope = _correlation([1, 2, 3, 4], [3, 5, 7, 9], "slope").json()
    body_intercept = _correlation([1, 2, 3, 4], [3, 5, 7, 9], "intercept").json()
    assert body_slope["result_approx"] == 2.0
    assert body_intercept["result_approx"] == 1.0


def test_perfect_negative_linear_relationship_r_equals_minus_1():
    body = _correlation([1, 2, 3, 4], [10, 8, 6, 4], "correlation").json()
    assert body["success"] is True
    assert body["result_approx"] == -1.0


def test_no_correlation_r_equals_0():
    # Patrón simétrico oscilante: covarianza exactamente 0.
    body = _correlation([1, 2, 3, 4, 5], [3, -3, 3, -3, 3], "correlation").json()
    assert body["success"] is True
    assert body["result_approx"] == 0.0


def test_mismatched_lengths_rejected():
    body = _correlation([1, 2, 3], [1, 2], "correlation").json()
    assert body["success"] is False


def test_constant_x_correlation_undefined():
    body = _correlation([5, 5, 5], [1, 2, 3], "correlation").json()
    assert body["success"] is False


def test_regression_descriptive_statistics_unaffected_by_correlation_endpoint():
    """Regresión exigida por el módulo: el resto de Estadística (que opera
    sobre una sola lista) no se ve afectado por el cambio de UI de
    entrada de M1."""
    body = _descriptive("mean", values=[1, 2, 3, 4, 5]).json()
    assert body["success"] is True
    assert body["result_approx"] == 3.0


# ---------------------------------------------------------------------------
# Módulo N0 (spec_graficacion_matrices_estadistica_unidades.md, sección 7):
# Poisson, uniforme, exponencial. Casos verificados en vivo contra el
# backend real antes de escribir estos tests.
# ---------------------------------------------------------------------------


def _poisson(lam, k=0, query="pmf"):
    return client.post("/api/v1/statistics/poisson", json={"lam": lam, "k": k, "query": query})


def _uniform(a, b, x=0, query="cdf"):
    return client.post("/api/v1/statistics/uniform", json={"a": a, "b": b, "x": x, "query": query})


def _exponential(lam, x=0, query="cdf"):
    return client.post("/api/v1/statistics/exponential", json={"lam": lam, "x": x, "query": query})


def test_poisson_pmf_known_value():
    # Poisson(4).pmf(2) = 4^2 * e^-4 / 2! = 8*e^-4
    body = _poisson(4, 2, "pmf").json()
    assert body["success"] is True
    assert body["result_text"] == "8*exp(-4)"
    assert abs(body["result_approx"] - 0.14652511110987343) < 1e-9


def test_poisson_mean_equals_lambda():
    body = _poisson(4, query="mean").json()
    assert body["result_approx"] == 4.0


def test_poisson_variance_equals_lambda():
    body = _poisson(4, query="variance").json()
    assert body["result_approx"] == 4.0


def test_poisson_rejects_negative_k():
    body = _poisson(4, -1, "pmf").json()
    assert body["success"] is False


def test_uniform_cdf_midpoint_known_value():
    body = _uniform(0, 10, 5, "cdf").json()
    assert body["success"] is True
    assert body["result_approx"] == 0.5


def test_uniform_mean_known_value():
    body = _uniform(0, 10, query="mean").json()
    assert body["result_approx"] == 5.0


def test_uniform_variance_known_value():
    # Var = (b-a)^2/12 = 100/12 = 25/3
    body = _uniform(0, 10, query="variance").json()
    assert body["result_text"] == "25/3"


def test_uniform_rejects_a_not_less_than_b():
    body = _uniform(10, 0, query="mean").json()
    assert body["success"] is False


def test_exponential_cdf_known_value():
    body = _exponential(2, 1, "cdf").json()
    assert body["success"] is True
    assert body["result_text"] == "1 - exp(-2)"
    assert abs(body["result_approx"] - 0.8646647167633873) < 1e-9


def test_exponential_mean_equals_inverse_lambda():
    body = _exponential(2, query="mean").json()
    assert body["result_approx"] == 0.5


def test_exponential_variance_equals_inverse_lambda_squared():
    body = _exponential(2, query="variance").json()
    assert body["result_approx"] == 0.25


def test_regression_binomial_and_normal_unaffected():
    body_binomial = client.post(
        "/api/v1/statistics/binomial", json={"n": 10, "p": 0.3, "k": 3, "query": "pmf"}
    ).json()
    assert body_binomial["success"] is True

    body_normal = client.post(
        "/api/v1/statistics/normal", json={"mu": 0, "sigma": 1, "x": 0, "query": "cdf"}
    ).json()
    assert body_normal["success"] is True
    assert body_normal["result_approx"] == 0.5
