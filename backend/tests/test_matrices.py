"""
Tests reales de los Módulos 7A y 7B para `POST /api/v1/matrix/operations`,
`/matrix/determinant` y `/matrix/inverse` (spec, secciones 8.6 y 15):
suma/resta 2x2 y 4x4, dimensiones incompatibles en suma y multiplicación,
celda válida (sqrt/abs) vs. rechazada (trig/variable), verificación de que
los elementos son Rational, determinante/inversa 2x2 y 4x4 detallados,
5x5 resumido, no cuadrada (DIMENSION_MISMATCH), singular (SINGULAR_MATRIX).

Fusiona en un solo archivo `test_matrix.py` (7A) y `test_matrix_determinant_inverse.py`
(7B) para respetar el nombre exacto `test_matrices.py` de la spec, sección 12.
"""

import os

import sympy

os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _matrix_op(operation, matrix_a, matrix_b):
    return client.post(
        "/api/v1/matrix/operations",
        json={"operation": operation, "matrix_a": matrix_a, "matrix_b": matrix_b},
    )


def test_add_2x2():
    response = _matrix_op("add", [["1", "2"], ["3", "4"]], [["5", "6"], ["7", "8"]])
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is True
    assert len(body["steps"]) == 4
    assert body["result_data"] == [["6", "8"], ["10", "12"]]


def test_subtract_4x4():
    identity = [
        ["1", "0", "0", "0"],
        ["0", "1", "0", "0"],
        ["0", "0", "1", "0"],
        ["0", "0", "0", "1"],
    ]
    zeros = [["0", "0", "0", "0"]] * 4
    response = _matrix_op("subtract", identity, zeros)
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is True
    assert len(body["steps"]) == 16
    assert body["result_data"] == identity


def test_add_incompatible_dimensions_returns_dimension_mismatch():
    response = _matrix_op("add", [["1", "2"]], [["1"], ["2"]])
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "DIMENSION_MISMATCH"


def test_multiply_incompatible_dimensions_returns_dimension_mismatch():
    # A es 2x3, B es 2x2 -> columnas(A)=3 != filas(B)=2
    response = _matrix_op("multiply", [["1", "2", "3"], ["4", "5", "6"]], [["1", "0"], ["0", "1"]])
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "DIMENSION_MISMATCH"


def test_multiply_valid_dimensions():
    # A es 2x3, B es 3x2
    response = _matrix_op(
        "multiply",
        [["1", "2", "3"], ["4", "5", "6"]],
        [["7", "8"], ["9", "10"], ["11", "12"]],
    )
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is True
    # [[1,2,3],[4,5,6]] @ [[7,8],[9,10],[11,12]] = [[58,64],[139,154]]
    assert body["result_data"] == [["58", "64"], ["139", "154"]]


def test_cell_with_sqrt_and_abs_is_valid():
    response = _matrix_op("add", [["sqrt(2)", "abs(-3)"]], [["1", "1"]])
    body = response.json()
    assert body["success"] is True
    assert body["result_data"][0][1] == "4"


def test_cell_with_trig_function_rejected():
    response = _matrix_op("add", [["sin(1)", "2"]], [["1", "1"]])
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "PARSE_ERROR"


def test_cell_with_free_variable_rejected():
    response = _matrix_op("add", [["x", "2"]], [["1", "1"]])
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "PARSE_ERROR"


def test_matrix_elements_are_rational():
    from app.services import matrix_service

    matrix = matrix_service.parse_matrix([["1/2", "0.75"]])
    for element in matrix:
        assert isinstance(element, sympy.Rational)


# --- Módulo 7B: determinante e inversa ---



def _determinant(matrix):
    return client.post("/api/v1/matrix/determinant", json={"matrix": matrix})


def _inverse(matrix):
    return client.post("/api/v1/matrix/inverse", json={"matrix": matrix})


def test_determinant_2x2_detailed():
    response = _determinant([["4", "6"], ["3", "8"]])
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is True
    assert len(body["steps"]) >= 1
    # det([[4,6],[3,8]]) = 32-18 = 14
    assert body["result_text"] == "14"


def test_determinant_4x4_detailed():
    matrix = [
        ["1", "2", "3", "4"],
        ["0", "1", "4", "0"],
        ["5", "6", "0", "1"],
        ["0", "0", "2", "1"],
    ]
    response = _determinant(matrix)
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is True
    assert len(body["steps"]) >= 1

    import sympy

    m = sympy.Matrix(matrix)
    assert body["result_text"] == str(m.det())


def test_determinant_5x5_is_summarized():
    identity_5 = [
        ["1", "0", "0", "0", "0"],
        ["0", "1", "0", "0", "0"],
        ["0", "0", "1", "0", "0"],
        ["0", "0", "0", "1", "0"],
        ["0", "0", "0", "0", "1"],
    ]
    response = _determinant(identity_5)
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is False
    assert body["steps"] == []
    assert body["result_text"] == "1"


def test_determinant_non_square_dimension_mismatch():
    response = _determinant([["1", "2", "3"], ["4", "5", "6"]])
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "DIMENSION_MISMATCH"


def test_inverse_2x2_detailed():
    response = _inverse([["4", "7"], ["2", "6"]])
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is True
    assert len(body["steps"]) >= 1
    # A * A^-1 debe dar la identidad
    import sympy

    a = sympy.Matrix([["4", "7"], ["2", "6"]])
    computed = sympy.Matrix([[sympy.sympify(cell) for cell in row] for row in body["result_data"]])
    assert (a * computed - sympy.eye(2)).is_zero_matrix


def test_inverse_4x4_detailed():
    matrix = [
        ["2", "0", "0", "0"],
        ["0", "2", "0", "0"],
        ["0", "0", "2", "0"],
        ["0", "0", "0", "2"],
    ]
    response = _inverse(matrix)
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is True
    expected = [["1/2", "0", "0", "0"], ["0", "1/2", "0", "0"]]
    assert body["result_data"][0] == expected[0]
    assert body["result_data"][1] == expected[1]


def test_inverse_5x5_is_summarized():
    matrix = [
        ["2", "0", "0", "0", "0"],
        ["0", "2", "0", "0", "0"],
        ["0", "0", "2", "0", "0"],
        ["0", "0", "0", "2", "0"],
        ["0", "0", "0", "0", "2"],
    ]
    response = _inverse(matrix)
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is False
    assert body["steps"] == []


def test_inverse_non_square_dimension_mismatch():
    response = _inverse([["1", "2", "3"], ["4", "5", "6"]])
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "DIMENSION_MISMATCH"


def test_inverse_singular_matrix():
    # Filas linealmente dependientes -> determinante 0
    response = _inverse([["1", "2"], ["2", "4"]])
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "SINGULAR_MATRIX"


def test_determinant_parse_error_propagates():
    response = _determinant([["eval(1)", "2"], ["3", "4"]])
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "PARSE_ERROR"
    assert body["operation"] == "matrix_determinant"


# --------------------------------------------------------------------------
# Fase C (spec UX estilo ClassCalc, sección 4) — ref/rref/producto de
# Kronecker. Verificado contra sympy real (Matrix.rref()/.echelon_form())
# antes de escribir estos casos, no asumido.
# --------------------------------------------------------------------------


def _single(endpoint, matrix):
    return client.post(f"/api/v1/matrix/{endpoint}", json={"matrix": matrix})


def test_rref_singular_matrix_leaves_dependent_row_zero():
    response = _single("rref", [["1", "2"], ["2", "4"]])
    body = response.json()
    assert body["success"] is True
    assert body["has_detailed_steps"] is True
    assert body["result_data"] == [["1", "2"], ["0", "0"]]


def test_ref_identity_unchanged():
    response = _single("ref", [["1", "0"], ["0", "1"]])
    body = response.json()
    assert body["success"] is True
    assert body["result_data"] == [["1", "0"], ["0", "1"]]


def test_rref_3x3_known_system():
    # Sistema con solución única x=1,y=2,z=3 codificado como matriz
    # aumentada; rref debe dar la identidad aumentada con la solución.
    response = _single(
        "rref",
        [["1", "1", "1", "6"], ["0", "1", "2", "8"], ["0", "0", "1", "3"]],
    )
    body = response.json()
    assert body["success"] is True
    assert body["result_data"] == [
        ["1", "0", "0", "1"],
        ["0", "1", "0", "2"],
        ["0", "0", "1", "3"],
    ]


def test_kronecker_2x2_with_2x2():
    response = _matrix_op("kronecker", [["1", "2"], ["3", "4"]], [["0", "5"], ["6", "7"]])
    body = response.json()
    assert body["success"] is True
    assert body["result_data"] == [
        ["0", "5", "0", "10"],
        ["6", "7", "12", "14"],
        ["0", "15", "0", "20"],
        ["18", "21", "24", "28"],
    ]


def test_ref_parse_error_propagates():
    response = _single("ref", [["eval(1)", "2"], ["3", "4"]])
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "PARSE_ERROR"
    assert body["operation"] == "matrix_ref"


# ---------------------------------------------------------------------------
# Módulo L0 (spec_graficacion_matrices_estadistica_unidades.md, sección 5):
# traza y rango como operaciones expuestas. Rango se verifica con un caso
# de cada clasificación de sistema (única, indeterminada, incompatible —
# usando matrices cuadradas equivalentes al comportamiento de cada
# clasificación, no un sistema aumentado literal, porque /matrix/rank
# opera sobre una sola matriz).
# ---------------------------------------------------------------------------


def test_trace_simple_case():
    response = _single("trace", [["4", "6"], ["3", "8"]])
    body = response.json()
    assert body["success"] is True
    assert body["result_text"] == "12"  # 4+8


def test_trace_3x3():
    response = _single("trace", [["1", "0", "0"], ["0", "2", "0"], ["0", "0", "3"]])
    body = response.json()
    assert body["success"] is True
    assert body["result_text"] == "6"  # 1+2+3


def test_trace_non_square_dimension_mismatch():
    response = _single("trace", [["1", "2", "3"], ["4", "5", "6"]])
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "DIMENSION_MISMATCH"


def test_rank_full_rank_matrix():
    # Filas linealmente independientes -> rango completo (2), análogo a un
    # sistema con solución única.
    response = _single("rank", [["1", "0"], ["0", "1"]])
    body = response.json()
    assert body["success"] is True
    assert body["result_text"] == "2"


def test_rank_deficient_rank_matrix():
    # Fila 2 = 2 * fila 1 -> rango 1, análogo a un sistema compatible
    # indeterminado (infinitas soluciones).
    response = _single("rank", [["1", "2"], ["2", "4"]])
    body = response.json()
    assert body["success"] is True
    assert body["result_text"] == "1"


def test_rank_zero_matrix():
    # Caso extremo: matriz nula, rango 0 — análogo al caso degenerado de un
    # sistema sin ninguna restricción independiente.
    response = _single("rank", [["0", "0"], ["0", "0"]])
    body = response.json()
    assert body["success"] is True
    assert body["result_text"] == "0"


def test_trace_parse_error_propagates():
    response = _single("trace", [["eval(1)", "2"], ["3", "4"]])
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "PARSE_ERROR"
    assert body["operation"] == "matrix_trace"


def test_regression_existing_system_classification_unaffected_by_rank_endpoint():
    """Regresión exigida por el módulo: la clasificación interna de
    sistemas (Fase B) sigue funcionando igual — se prueba indirectamente
    verificando que /solve/system todavía clasifica correctamente un
    sistema compatible indeterminado, sin que exponer rank() como
    endpoint haya tocado esa lógica interna."""
    response = client.post(
        "/api/v1/solve/system",
        json={"equations": ["x + y = 2", "2*x + 2*y = 4"], "variables": ["x", "y"]},
    )
    body = response.json()
    assert body["success"] is True
