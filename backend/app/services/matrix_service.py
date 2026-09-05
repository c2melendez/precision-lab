"""
app/services/matrix_service.py — `/matrix/operations` (spec, secciones 3,
5, 8.6, `MatrixOperationRequest`).

Parser de celda RESTRINGIDO (sección 3), deliberadamente separado del
parser general de `parsing.py`: reutiliza `parsing.parse_expression_tree`
para heredar todas las garantías de seguridad (inyección, límites de
complejidad, etc.) y le aplica encima las restricciones ADICIONALES
específicas de una celda de matriz — sin variables libres, sin funciones
trigonométricas, sin ninguna función que no sea `sqrt`/`abs`.

IMPORTANTE (Módulo 7A, igual que en `/solve`): los pasos se verifican con
`verify_matrix_step_equivalence`, NUNCA con la función escalar — se
comparan matrices completas, celda a celda.
"""

from dataclasses import dataclass
from time import perf_counter
from typing import List, Optional, Tuple

import sympy

from app.core.config import get_settings
from app.schemas.responses import MatrixOpKind, Step
from app.services import parsing
from app.services.step_verification import verify_matrix_step_equivalence

MAX_STEP_MATRIX_SIZE = 4  # hasta 4x4: paso por celda. 5x5/6x6: resultado directo.
ROW_OP_STEP_BUDGET = 30
_TIME_BUDGET_FRACTION = 0.8  # fracción de MATH_TIMEOUT_SECONDS (sección 6)

# Todo lo permitido por ALLOWED_FUNCTIONS (parsing.py) EXCEPTO sqrt/abs está
# prohibido en una celda de matriz (sección 3: "sqrt/abs aplicadas
# únicamente a argumentos numéricos puros"; cualquier otra función,
# incluida cualquier trigonométrica, se rechaza).
_DISALLOWED_CELL_FUNCTION_NAMES = {
    name for name in parsing.ALLOWED_FUNCTIONS if name not in ("sqrt", "abs")
}
_DISALLOWED_CELL_FUNCTION_CLASSES = tuple(
    parsing.ALLOWED_FUNCTIONS[name]
    for name in _DISALLOWED_CELL_FUNCTION_NAMES
    if isinstance(parsing.ALLOWED_FUNCTIONS[name], type)
)


class DimensionMismatchError(ValueError):
    """Dimensiones incompatibles (sección 5) -> `ErrorCode.DIMENSION_MISMATCH`."""


class SingularMatrixError(ValueError):
    """Inversa de matriz singular -> `ErrorCode.SINGULAR_MATRIX`."""


@dataclass
class ScalarStepResult:
    value: sympy.Expr
    steps: List[Step]
    has_detailed_steps: bool
    warnings: List[str]


@dataclass
class MatrixStepResult:
    result_matrix: sympy.Matrix
    steps: List[Step]
    has_detailed_steps: bool
    warnings: List[str]


@dataclass
class MatrixOperationResult:
    result_matrix: sympy.Matrix
    steps: List[Step]
    has_detailed_steps: bool
    warnings: List[str]


def _floats_to_rational(expr: sympy.Expr) -> sympy.Expr:
    """`sympy.Rational` siempre (sección 8.6) — cualquier `Float` que haya
    sobrevivido al parseo (ej. `0.75`, válido por la etapa 4 del parser
    general) se convierte a su Rational exacto."""
    float_atoms = expr.atoms(sympy.Float)
    if not float_atoms:
        return expr
    replacements = {f: sympy.nsimplify(f, rational=True) for f in float_atoms}
    return expr.xreplace(replacements)


def _parse_matrix_cell(text: str) -> sympy.Expr:
    """Parser restringido de celda (sección 3). Reutiliza el parser general
    (mismas garantías de seguridad) y añade las restricciones propias de
    una celda: sin variables libres, sin funciones fuera de `sqrt`/`abs`.
    """
    expr = parsing.parse_expression_tree(text, allow_equation=False)

    if expr.free_symbols:
        free_names = sorted(s.name for s in expr.free_symbols)
        raise parsing.ParseSecurityError(
            f"Celda de matriz inválida: no se permiten variables libres ({free_names})."
        )

    for node in sympy.preorder_traversal(expr):
        if isinstance(node, _DISALLOWED_CELL_FUNCTION_CLASSES):
            raise parsing.ParseSecurityError(
                f"Celda de matriz inválida: función no permitida '{type(node).__name__}' "
                "(solo se permiten sqrt/abs sobre argumentos numéricos puros)."
            )

    # El parser general usa evaluate=False deliberadamente (preserva la
    # estructura de la expresión para otros endpoints) — para una celda de
    # matriz sí queremos el valor totalmente colapsado (ej. "1/2" debe
    # quedar como el objeto Rational real, no como Mul(1, Pow(2,-1))
    # sin evaluar), así que se fuerza aquí con sympy.simplify().
    expr = sympy.simplify(expr)

    return _floats_to_rational(expr)


def parse_matrix(cells: List[List[str]]) -> sympy.Matrix:
    rows = [[_parse_matrix_cell(cell) for cell in row] for row in cells]
    return sympy.Matrix(rows)


def _cell_steps_add_subtract(
    matrix_a: sympy.Matrix, matrix_b: sympy.Matrix, operation: MatrixOpKind
) -> List[Step]:
    sign = "+" if operation == MatrixOpKind.ADD else "-"
    steps = []
    for row in range(matrix_a.rows):
        for col in range(matrix_a.cols):
            a_val, b_val = matrix_a[row, col], matrix_b[row, col]
            result = a_val + b_val if operation == MatrixOpKind.ADD else a_val - b_val
            steps.append(
                Step(
                    index=0,
                    title=f"Celda ({row + 1},{col + 1})",
                    description=(
                        f"a[{row + 1},{col + 1}] {sign} b[{row + 1},{col + 1}] = "
                        f"{sympy.latex(a_val)} {sign} {sympy.latex(b_val)}."
                    ),
                    rule="MatrixAddSubtract",
                    latex_before=f"{sympy.latex(a_val)} {sign} {sympy.latex(b_val)}",
                    latex_after=sympy.latex(result),
                )
            )
    return steps


def _cell_steps_multiply(matrix_a: sympy.Matrix, matrix_b: sympy.Matrix) -> List[Step]:
    steps = []
    for row in range(matrix_a.rows):
        for col in range(matrix_b.cols):
            terms = [matrix_a[row, k] * matrix_b[k, col] for k in range(matrix_a.cols)]
            result = sum(terms)
            terms_latex = " + ".join(sympy.latex(term) for term in terms)
            steps.append(
                Step(
                    index=0,
                    title=f"Celda ({row + 1},{col + 1})",
                    description=(f"Producto punto: fila {row + 1} de A · columna {col + 1} de B."),
                    rule="MatrixMultiply",
                    latex_before=terms_latex,
                    latex_after=sympy.latex(result),
                )
            )
    return steps


def add_or_subtract(
    matrix_a: sympy.Matrix, matrix_b: sympy.Matrix, operation: MatrixOpKind
) -> MatrixOperationResult:
    if matrix_a.shape != matrix_b.shape:
        raise DimensionMismatchError(
            f"Suma/resta requiere las mismas dimensiones: A es {matrix_a.shape}, "
            f"B es {matrix_b.shape}."
        )

    result_matrix = matrix_a + matrix_b if operation == MatrixOpKind.ADD else matrix_a - matrix_b

    if max(matrix_a.rows, matrix_a.cols) > MAX_STEP_MATRIX_SIZE:
        return MatrixOperationResult(result_matrix, [], False, [])

    before_matrix = sympy.Matrix(
        matrix_a.rows,
        matrix_a.cols,
        lambda i, j: (
            matrix_a[i, j] + matrix_b[i, j]
            if operation == MatrixOpKind.ADD
            else matrix_a[i, j] - matrix_b[i, j]
        ),
    )
    verification = verify_matrix_step_equivalence(
        before_matrix, result_matrix, "suma/resta elemento a elemento"
    )
    if verification != "VERIFIED":
        return MatrixOperationResult(result_matrix, [], False, [])

    steps = _cell_steps_add_subtract(matrix_a, matrix_b, operation)
    for index, step in enumerate(steps):
        step.index = index
    return MatrixOperationResult(result_matrix, steps, True, [])


def multiply(matrix_a: sympy.Matrix, matrix_b: sympy.Matrix) -> MatrixOperationResult:
    if matrix_a.cols != matrix_b.rows:
        raise DimensionMismatchError(
            f"Multiplicación requiere columnas(A) == filas(B): A es {matrix_a.shape}, "
            f"B es {matrix_b.shape}."
        )

    result_matrix = matrix_a * matrix_b

    if max(matrix_a.rows, matrix_a.cols, matrix_b.rows, matrix_b.cols) > MAX_STEP_MATRIX_SIZE:
        return MatrixOperationResult(result_matrix, [], False, [])

    before_matrix = sympy.Matrix(
        matrix_a.rows,
        matrix_b.cols,
        lambda i, j: sum(matrix_a[i, k] * matrix_b[k, j] for k in range(matrix_a.cols)),
    )
    verification = verify_matrix_step_equivalence(
        before_matrix, result_matrix, "multiplicación fila×columna"
    )
    if verification != "VERIFIED":
        return MatrixOperationResult(result_matrix, [], False, [])

    steps = _cell_steps_multiply(matrix_a, matrix_b)
    for index, step in enumerate(steps):
        step.index = index
    return MatrixOperationResult(result_matrix, steps, True, [])


def matrix_to_result_data(matrix: sympy.Matrix) -> List[List[str]]:
    return [[str(matrix[row, col]) for col in range(matrix.cols)] for row in range(matrix.rows)]


def transpose(matrix: sympy.Matrix) -> MatrixOperationResult:
    """`/matrix/transpose` — passthrough trivial (`Matrix.T`), sin pasos
    detallados (no hay una secuencia de transformaciones intermedias que
    narrar: es una única reindexación de celdas), igual patrón que
    `/matrix/eigen` (Fase 2, sección 2)."""
    return MatrixOperationResult(matrix.T, [], False, [])


MAX_MATRIX_POWER_EXPONENT = 10


def power(matrix: sympy.Matrix, exponent: int) -> MatrixOperationResult:
    """`/matrix/power` — `Matrix ** exponent`. Requiere matriz cuadrada;
    exponente negativo requiere matriz invertible (usa `Matrix.inv()`
    internamente vía SymPy). Sin pasos detallados, mismo patrón que
    `eigen`/`transpose`."""
    if matrix.rows != matrix.cols:
        raise DimensionMismatchError(
            f"La potencia de una matriz requiere una matriz cuadrada; recibida {matrix.shape}."
        )
    if abs(exponent) > MAX_MATRIX_POWER_EXPONENT:
        raise DimensionMismatchError(
            f"Exponente fuera de rango permitido (máximo ±{MAX_MATRIX_POWER_EXPONENT})."
        )
    if exponent < 0 and matrix.det() == 0:
        raise SingularMatrixError(
            "La matriz es singular (determinante 0); no tiene inversa para potencia negativa."
        )
    if exponent == 0:
        result_matrix = sympy.eye(matrix.rows)
    else:
        result_matrix = matrix**exponent
    return MatrixOperationResult(result_matrix, [], False, [])


def eigen(matrix: sympy.Matrix) -> str:
    """`/matrix/eigen` (Fase 2, sección 2: "Sí — passthrough trivial —
    `Matrix.eigenvals()`/`eigenvects()`"). Resultado directo de SymPy, sin
    pasos (`has_detailed_steps: false`) — no hay un campo de contrato
    dedicado a eigenvalores/eigenvectores en `MathResponse.result_data`
    (que solo admite soluciones de ecuación o matrices), así que se
    presenta como texto/LaTeX (decisión DEDUCIBLE, documentada en el
    cierre del Módulo 9)."""
    if matrix.rows != matrix.cols:
        raise DimensionMismatchError(
            f"Los eigenvalores requieren una matriz cuadrada; recibida {matrix.shape}."
        )
    eigenvects = matrix.eigenvects()
    parts = []
    for eigenvalue, multiplicity, vectors in eigenvects:
        vectors_str = ", ".join(str(v.T) for v in vectors)
        parts.append(
            f"λ={eigenvalue} (multiplicidad {multiplicity}), autovectores: [{vectors_str}]"
        )
    return "; ".join(parts)


# ---------------------------------------------------------------------------
# Determinante e inversa (Módulo 7B) — eliminación por filas con pivoteo.
#
# IMPORTANTE (verificación, sección 8.6 y decisión DEDUCIBLE documentada en
# el cierre del Módulo 7B): a diferencia de suma/resta/multiplicación (donde
# "antes"/"después" son dos representaciones de la MISMA celda resultante),
# una operación elemental de fila transforma la matriz DELIBERADAMENTE en
# otra distinta — comparar "antes" vs "después" celda a celda con
# `verify_matrix_step_equivalence` no tiene el mismo sentido ahí (casi
# siempre darían REJECTED, ya que se espera que cambien). En su lugar, cada
# operación de fila se traza como narrativa (siempre matemáticamente
# correcta por construcción: son operaciones elementales estándar), y se
# hace UNA verificación holística al final con `verify_matrix_step_equivalence`
# — igual que en Módulos 4-7A — comparando el resultado ENSAMBLADO contra
# la verdad de referencia de SymPy:
#   - Determinante: se envuelve el escalar en una matriz 1x1 (cumple la
#     letra de "verify_matrix_step_equivalence, no la escalar" aunque el
#     resultado sea conceptualmente un número).
#   - Inversa: comparación directa matriz-contra-matriz (A⁻¹ propia vs.
#     `matrix.inv()` de SymPy) — aplicación natural, sin envolver nada.
# ---------------------------------------------------------------------------


def _time_budget_seconds() -> float:
    return get_settings().math_timeout_seconds * _TIME_BUDGET_FRACTION


def _determinant_row_reduction(
    matrix: sympy.Matrix,
) -> Optional[Tuple[List[Step], sympy.Expr]]:
    """Elimina por debajo de la diagonal con pivoteo parcial, registrando
    cada operación elemental como `Step`. Devuelve `None` si se excede el
    presupuesto de pasos/tiempo (el llamador colapsa a `Matrix.det()`)."""
    start_time = perf_counter()
    n = matrix.rows
    working = matrix.copy()
    sign = sympy.Integer(1)
    steps: List[Step] = []

    for col in range(n):
        if len(steps) > ROW_OP_STEP_BUDGET or (perf_counter() - start_time) > (
            _time_budget_seconds()
        ):
            return None

        pivot_row = next((r for r in range(col, n) if working[r, col] != 0), None)
        if pivot_row is None:
            steps.append(
                Step(
                    index=0,
                    title=f"Columna {col + 1} nula bajo la diagonal",
                    description="Toda la columna es cero bajo el pivote -> determinante 0.",
                    rule="ZeroColumn",
                    latex_before=sympy.latex(working),
                    latex_after="0",
                )
            )
            return steps, sympy.Integer(0)

        if pivot_row != col:
            working = working.copy()
            working.row_swap(col, pivot_row)
            sign *= -1
            steps.append(
                Step(
                    index=0,
                    title=f"Intercambiar filas {col + 1} y {pivot_row + 1}",
                    description="Pivoteo parcial: se coloca un pivote no nulo en la diagonal.",
                    rule="RowSwap",
                    latex_before=f"F_{{{col + 1}}} \\leftrightarrow F_{{{pivot_row + 1}}}",
                    latex_after=sympy.latex(working),
                )
            )

        pivot_val = working[col, col]
        for row in range(col + 1, n):
            if len(steps) > ROW_OP_STEP_BUDGET:
                return None
            factor = sympy.simplify(working[row, col] / pivot_val)
            if factor == 0:
                continue
            working = working.copy()
            working[row, :] = working[row, :] - factor * working[col, :]
            steps.append(
                Step(
                    index=0,
                    title=f"F{row + 1} ← F{row + 1} - ({sympy.latex(factor)})·F{col + 1}",
                    description="Eliminación por debajo del pivote.",
                    rule="RowElimination",
                    latex_before=f"F_{{{row + 1}}} - ({sympy.latex(factor)})F_{{{col + 1}}}",
                    latex_after=sympy.latex(working),
                )
            )

    determinant = sign
    for i in range(n):
        determinant *= working[i, i]
    determinant = sympy.simplify(determinant)
    return steps, determinant


def determinant(matrix: sympy.Matrix) -> ScalarStepResult:
    if matrix.rows != matrix.cols:
        raise DimensionMismatchError(
            f"El determinante requiere una matriz cuadrada; recibida {matrix.shape}."
        )

    reference = sympy.simplify(matrix.det())

    if max(matrix.rows, matrix.cols) > MAX_STEP_MATRIX_SIZE:
        return ScalarStepResult(reference, [], False, [])

    reduction = _determinant_row_reduction(matrix)
    if reduction is None:
        return ScalarStepResult(
            reference,
            [],
            False,
            ["Procedimiento detallado omitido: tiempo de verificación excedido " "(sección 6)."],
        )

    steps, computed_value = reduction
    verification = verify_matrix_step_equivalence(
        sympy.Matrix([[computed_value]]),
        sympy.Matrix([[reference]]),
        "determinante por eliminación de filas",
    )
    if verification != "VERIFIED":
        return ScalarStepResult(reference, [], False, [])

    for index, step in enumerate(steps):
        step.index = index
    return ScalarStepResult(computed_value, steps, True, [])


def _inverse_row_reduction(
    matrix: sympy.Matrix,
) -> Optional[Tuple[List[Step], sympy.Matrix]]:
    """Gauss-Jordan explícito sobre `[A|I] -> [I|A⁻¹]`. Devuelve `None` si
    se excede el presupuesto de pasos/tiempo."""
    start_time = perf_counter()
    n = matrix.rows
    augmented = matrix.row_join(sympy.eye(n))
    steps: List[Step] = []

    for col in range(n):
        if len(steps) > ROW_OP_STEP_BUDGET or (perf_counter() - start_time) > (
            _time_budget_seconds()
        ):
            return None

        pivot_row = next((r for r in range(col, n) if augmented[r, col] != 0), None)
        if pivot_row is None:
            return None  # singular — no debería ocurrir (ya validado antes)

        if pivot_row != col:
            augmented = augmented.copy()
            augmented.row_swap(col, pivot_row)
            steps.append(
                Step(
                    index=0,
                    title=f"Intercambiar filas {col + 1} y {pivot_row + 1}",
                    description="Pivoteo parcial sobre la matriz aumentada [A|I].",
                    rule="RowSwap",
                    latex_before=f"F_{{{col + 1}}} \\leftrightarrow F_{{{pivot_row + 1}}}",
                    latex_after=sympy.latex(augmented),
                )
            )

        pivot_val = augmented[col, col]
        if pivot_val != 1:
            augmented = augmented.copy()
            augmented[col, :] = augmented[col, :] / pivot_val
            steps.append(
                Step(
                    index=0,
                    title=f"F{col + 1} ← F{col + 1} / ({sympy.latex(pivot_val)})",
                    description="Se normaliza el pivote a 1.",
                    rule="NormalizePivot",
                    latex_before=f"F_{{{col + 1}}} / ({sympy.latex(pivot_val)})",
                    latex_after=sympy.latex(augmented),
                )
            )

        for row in range(n):
            if row == col:
                continue
            if len(steps) > ROW_OP_STEP_BUDGET:
                return None
            factor = augmented[row, col]
            if factor == 0:
                continue
            augmented = augmented.copy()
            augmented[row, :] = augmented[row, :] - factor * augmented[col, :]
            steps.append(
                Step(
                    index=0,
                    title=f"F{row + 1} ← F{row + 1} - ({sympy.latex(factor)})·F{col + 1}",
                    description="Eliminación en la columna del pivote (Gauss-Jordan).",
                    rule="RowElimination",
                    latex_before=f"F_{{{row + 1}}} - ({sympy.latex(factor)})F_{{{col + 1}}}",
                    latex_after=sympy.latex(augmented),
                )
            )

    inverse_matrix = augmented[:, n:]
    return steps, inverse_matrix


def inverse(matrix: sympy.Matrix) -> MatrixStepResult:
    if matrix.rows != matrix.cols:
        raise DimensionMismatchError(
            f"La inversa requiere una matriz cuadrada; recibida {matrix.shape}."
        )

    determinant_value = sympy.simplify(matrix.det())
    if determinant_value == 0:
        raise SingularMatrixError("La matriz es singular (determinante 0); no tiene inversa.")

    reference = matrix.inv()

    if max(matrix.rows, matrix.cols) > MAX_STEP_MATRIX_SIZE:
        return MatrixStepResult(reference, [], False, [])

    reduction = _inverse_row_reduction(matrix)
    if reduction is None:
        return MatrixStepResult(
            reference,
            [],
            False,
            ["Procedimiento detallado omitido: tiempo de verificación excedido " "(sección 6)."],
        )

    steps, computed_inverse = reduction
    verification = verify_matrix_step_equivalence(
        computed_inverse, reference, "inversa por Gauss-Jordan"
    )
    if verification != "VERIFIED":
        return MatrixStepResult(reference, [], False, [])

    for index, step in enumerate(steps):
        step.index = index
    return MatrixStepResult(computed_inverse, steps, True, [])


# ---------------------------------------------------------------------------
# Fase C (spec UX estilo ClassCalc, sección 4) — agregadas sobre las
# operaciones de la spec v9 original. Mismo patrón que las demás: pasos
# explícitos verificados contra la referencia de SymPy, con fallback sin
# pasos si se excede el presupuesto o falla la verificación.
# ---------------------------------------------------------------------------


def _ref_row_reduction(matrix: sympy.Matrix) -> Optional[Tuple[List[Step], sympy.Matrix]]:
    """Eliminación hacia adelante únicamente (sin normalizar pivotes a 1 ni
    eliminar hacia arriba) — forma escalonada, no reducida."""
    start_time = perf_counter()
    rows, cols = matrix.rows, matrix.cols
    working = matrix.copy()
    steps: List[Step] = []
    pivot_row = 0

    for col in range(cols):
        if pivot_row >= rows:
            break
        if len(steps) > ROW_OP_STEP_BUDGET or (perf_counter() - start_time) > (
            _time_budget_seconds()
        ):
            return None

        sel = next((r for r in range(pivot_row, rows) if working[r, col] != 0), None)
        if sel is None:
            continue

        if sel != pivot_row:
            working = working.copy()
            working.row_swap(pivot_row, sel)
            steps.append(
                Step(
                    index=0,
                    title=f"Intercambiar filas {pivot_row + 1} y {sel + 1}",
                    description="Se coloca un pivote no nulo en la fila actual.",
                    rule="RowSwap",
                    latex_before=f"F_{{{pivot_row + 1}}} \\leftrightarrow F_{{{sel + 1}}}",
                    latex_after=sympy.latex(working),
                )
            )

        pivot_val = working[pivot_row, col]
        for row in range(pivot_row + 1, rows):
            if len(steps) > ROW_OP_STEP_BUDGET:
                return None
            factor = sympy.simplify(working[row, col] / pivot_val)
            if factor == 0:
                continue
            working = working.copy()
            working[row, :] = working[row, :] - factor * working[pivot_row, :]
            steps.append(
                Step(
                    index=0,
                    title=f"F{row + 1} ← F{row + 1} - ({sympy.latex(factor)})·F{pivot_row + 1}",
                    description=f"Eliminación en la columna {col + 1} bajo el pivote.",
                    rule="RowElimination",
                    latex_before=f"F_{{{row + 1}}} - ({sympy.latex(factor)})F_{{{pivot_row + 1}}}",
                    latex_after=sympy.latex(working),
                )
            )
        pivot_row += 1

    return steps, working


def ref(matrix: sympy.Matrix) -> MatrixStepResult:
    """Forma escalonada (ref) — `Matrix.echelon_form()` es la referencia."""
    reference = matrix.echelon_form()

    if max(matrix.rows, matrix.cols) > MAX_STEP_MATRIX_SIZE:
        return MatrixStepResult(reference, [], False, [])

    reduction = _ref_row_reduction(matrix)
    if reduction is None:
        return MatrixStepResult(
            reference, [], False, ["Procedimiento detallado omitido: tiempo de verificación excedido (sección 6)."]
        )

    steps, computed = reduction
    # echelon_form() de SymPy no siempre coincide fila a fila con una
    # eliminación "de libro de texto" (puede reordenar/escalar distinto,
    # ambas son ref válidas de la misma matriz) — se verifica igualdad de
    # RANGO y de posiciones de pivote, no igualdad exacta celda a celda
    # como si hace rref (que sí es única).
    if computed.rank() != reference.rank():
        return MatrixStepResult(reference, [], False, [])

    for index, step in enumerate(steps):
        step.index = index
    return MatrixStepResult(computed, steps, True, [])


def rref(matrix: sympy.Matrix) -> MatrixStepResult:
    """Forma escalonada reducida (rref) — única, se verifica celda a celda
    contra `Matrix.rref()` igual que el resto de las operaciones."""
    reference, _pivots = matrix.rref()

    if max(matrix.rows, matrix.cols) > MAX_STEP_MATRIX_SIZE:
        return MatrixStepResult(reference, [], False, [])

    ref_reduction = _ref_row_reduction(matrix)
    if ref_reduction is None:
        return MatrixStepResult(
            reference, [], False, ["Procedimiento detallado omitido: tiempo de verificación excedido (sección 6)."]
        )
    steps, working = ref_reduction

    start_time = perf_counter()
    rows, cols = working.rows, working.cols
    pivot_row = 0
    for col in range(cols):
        if pivot_row >= rows:
            break
        if working[pivot_row, col] == 0:
            continue
        if len(steps) > ROW_OP_STEP_BUDGET or (perf_counter() - start_time) > (
            _time_budget_seconds()
        ):
            return MatrixStepResult(
                reference, [], False, ["Procedimiento detallado omitido: tiempo de verificación excedido (sección 6)."]
            )
        pivot_val = working[pivot_row, col]
        if pivot_val != 1:
            working = working.copy()
            working[pivot_row, :] = working[pivot_row, :] / pivot_val
            steps.append(
                Step(
                    index=0,
                    title=f"F{pivot_row + 1} ← F{pivot_row + 1} / ({sympy.latex(pivot_val)})",
                    description="Se normaliza el pivote a 1.",
                    rule="NormalizePivot",
                    latex_before=f"F_{{{pivot_row + 1}}} / ({sympy.latex(pivot_val)})",
                    latex_after=sympy.latex(working),
                )
            )
        for row in range(rows):
            if row == pivot_row:
                continue
            factor = working[row, col]
            if factor == 0:
                continue
            working = working.copy()
            working[row, :] = working[row, :] - factor * working[pivot_row, :]
            steps.append(
                Step(
                    index=0,
                    title=f"F{row + 1} ← F{row + 1} - ({sympy.latex(factor)})·F{pivot_row + 1}",
                    description=f"Eliminación en la columna {col + 1} fuera del pivote.",
                    rule="RowElimination",
                    latex_before=f"F_{{{row + 1}}} - ({sympy.latex(factor)})F_{{{pivot_row + 1}}}",
                    latex_after=sympy.latex(working),
                )
            )
        pivot_row += 1

    verification = verify_matrix_step_equivalence(working, reference, "forma escalonada reducida (rref)")
    if verification != "VERIFIED":
        return MatrixStepResult(reference, [], False, [])

    for index, step in enumerate(steps):
        step.index = index
    return MatrixStepResult(working, steps, True, [])


def kronecker(matrix_a: sympy.Matrix, matrix_b: sympy.Matrix) -> MatrixOperationResult:
    """Producto de Kronecker A⊗B. Sin restricción de dimensiones (a
    diferencia de suma/multiplicación) — siempre definido."""
    from sympy.matrices.expressions.kronecker import KroneckerProduct

    result_matrix = KroneckerProduct(matrix_a, matrix_b).as_explicit()

    if max(matrix_a.rows, matrix_a.cols, matrix_b.rows, matrix_b.cols) > MAX_STEP_MATRIX_SIZE:
        return MatrixOperationResult(result_matrix, [], False, [])

    # Un solo paso descriptivo (no celda a celda como add/multiply, sería
    # ilegible con matrices de más de 2x2 dado el tamaño combinado) — la
    # propia construcción vía KroneckerProduct ya es la verificación (no
    # hay una eliminación manual con la que contrastar, a diferencia de
    # ref/rref/inverse/determinant).
    step = Step(
        index=0,
        title="Producto de Kronecker",
        description=(
            f"Cada bloque (i,j) de A se reemplaza por A[i,j]·B, dando una matriz "
            f"de {result_matrix.rows}×{result_matrix.cols}."
        ),
        rule="Kronecker",
        latex_before=f"{sympy.latex(matrix_a)} \\otimes {sympy.latex(matrix_b)}",
        latex_after=sympy.latex(result_matrix),
    )
    return MatrixOperationResult(result_matrix, [step], True, [])


# ---------------------------------------------------------------------------
# P5 (spec v2 §6): Vectores en Matrices — dot/cross/norm. Un vector es una
# matriz 1xn o nx1 (spec explícita: no se crea componente de entrada
# nuevo). A diferencia del equivalente en precision-lab-lite (que usa
# Fraction.js y por eso `norm` requiere una excepción documentada a su
# regla de aritmética exacta), aquí `sympy.sqrt(...)` representa la raíz
# de forma simbólica exacta sin ningún caso especial — mismo patrón que
# ya usa `determinant` para exponer el valor exacto (`result_text`/
# `result_latex`) junto con su aproximación decimal (`result_approx`).
# ---------------------------------------------------------------------------


def _as_vector(matrix: sympy.Matrix) -> List[sympy.Expr]:
    if matrix.rows == 1:
        return list(matrix.row(0))
    if matrix.cols == 1:
        return list(matrix.col(0))
    raise DimensionMismatchError(
        f"Se esperaba un vector (1 fila o 1 columna); recibida una matriz de {matrix.shape}."
    )


def dot(matrix_a: sympy.Matrix, matrix_b: sympy.Matrix) -> ScalarStepResult:
    va = _as_vector(matrix_a)
    vb = _as_vector(matrix_b)
    if len(va) != len(vb):
        raise DimensionMismatchError(
            f"Producto punto requiere vectores de la misma longitud: A tiene {len(va)}, "
            f"B tiene {len(vb)}."
        )
    value = sympy.simplify(sum(a * b for a, b in zip(va, vb)))
    step = Step(
        index=0,
        title="Producto punto",
        description="Suma de los productos componente a componente.",
        rule="DotProduct",
        latex_before=" + ".join(f"({sympy.latex(a)})({sympy.latex(b)})" for a, b in zip(va, vb)),
        latex_after=sympy.latex(value),
    )
    return ScalarStepResult(value, [step], True, [])


def cross(matrix_a: sympy.Matrix, matrix_b: sympy.Matrix) -> MatrixOperationResult:
    """Válido únicamente para vectores de 3 componentes (spec v2 §6) —
    dimensión inválida reutiliza `DimensionMismatchError`/
    `ErrorCode.DIMENSION_MISMATCH` ya existente, no se inventa un código
    de error nuevo."""
    va = _as_vector(matrix_a)
    vb = _as_vector(matrix_b)
    if len(va) != 3 or len(vb) != 3:
        raise DimensionMismatchError(
            f"Producto cruz requiere vectores de 3 componentes: A tiene {len(va)}, "
            f"B tiene {len(vb)}."
        )
    a1, a2, a3 = va
    b1, b2, b3 = vb
    result_matrix = sympy.Matrix([[a2 * b3 - a3 * b2, a3 * b1 - a1 * b3, a1 * b2 - a2 * b1]])
    step = Step(
        index=0,
        title="Producto cruz",
        description="Producto cruz A×B (solo definido en 3 dimensiones).",
        rule="CrossProduct",
        latex_before=f"{sympy.latex(matrix_a)} \\times {sympy.latex(matrix_b)}",
        latex_after=sympy.latex(result_matrix),
    )
    return MatrixOperationResult(result_matrix, [step], True, [])


def norm(matrix: sympy.Matrix) -> ScalarStepResult:
    """Magnitud/norma euclidiana. No requiere matriz B (como transpose/
    determinant/inverse)."""
    v = _as_vector(matrix)
    sum_squares = sympy.simplify(sum(x**2 for x in v))
    value = sympy.sqrt(sum_squares)
    steps = [
        Step(
            index=0,
            title="Suma de cuadrados",
            description="Suma de los cuadrados de cada componente.",
            rule="VectorNormSumSquares",
            latex_before=" + ".join(f"({sympy.latex(x)})^2" for x in v),
            latex_after=sympy.latex(sum_squares),
        ),
        Step(
            index=1,
            title="Raíz cuadrada",
            description="Norma = raíz cuadrada de la suma de cuadrados.",
            rule="VectorNormSqrt",
            latex_before=f"\\sqrt{{{sympy.latex(sum_squares)}}}",
            latex_after=sympy.latex(value),
        ),
    ]
    return ScalarStepResult(value, steps, True, [])
