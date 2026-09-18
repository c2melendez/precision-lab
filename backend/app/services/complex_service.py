"""
app/services/complex_service.py — Fase F (variable compleja),
spec_edo_complejos_tooltips.md sección 3.2.

Motor dedicado para `Res(□, z=□)` y `Sing(□)`. Necesario como servicio
aparte (no vía ALLOWED_FUNCTIONS / ruta general) porque la sintaxis
"z=2" dentro de una llamada a función NO es aceptada por
`parsing.parse_expression_tree` -- confirmado con ejecución real
(Módulo F1): intentar parsear "residue(1/(z-2), z=2)" falla con
ParseSecurityError. Mismo criterio que ode_service.py: un parser propio
y acotado en vez de forzar el caso dentro del parser general.

Auditoría real (Módulo F0, ver cierre): `sympy.residue()` funciona para
racionales simples, incluidos polos de orden >1. `sympy.singularities()`
funciona para racionales pero devuelve un `ImageSet` infinito (no un
`FiniteSet`) para funciones trascendentes como 1/sin(z) -- se rechaza
explícitamente ese caso con UNSUPPORTED_OPERATION en vez de mostrar un
conjunto infinito en la UI.
"""

from dataclasses import dataclass
from typing import List

import sympy
from sympy.sets.sets import FiniteSet

from app.services import parsing

_z = sympy.Symbol("z")


class ComplexAnalysisParseError(ValueError):
    """Sintaxis no reconocible -> ErrorCode.PARSE_ERROR."""


class ComplexAnalysisUnsupportedError(ValueError):
    """Bien formado pero fuera del alcance resoluble -> ErrorCode.UNSUPPORTED_OPERATION."""


@dataclass
class ResidueResult:
    expression_text: str
    point: sympy.Expr
    residue: sympy.Expr


@dataclass
class SingularitiesResult:
    expression_text: str
    points: List[sympy.Expr]


def _parse_expression_in_z(expr_text: str) -> sympy.Expr:
    """Reutiliza el parser general (con su whitelist/validación de
    seguridad completa) para el cuerpo de la expresión -- SOLO la
    sintaxis "z=punto" queda fuera de ese parser, no la expresión en sí,
    que sigue las mismas reglas de seguridad que cualquier /evaluate."""
    try:
        return parsing.parse_expression_tree(expr_text, allow_equation=False)
    except parsing.ParseSecurityError as exc:
        raise ComplexAnalysisParseError(str(exc)) from exc


def _parse_point(point_text: str) -> sympy.Expr:
    """"z=2" -> 2. Solo acepta la variable "z" (única variable que expone
    el teclado para esta sección, spec 3.3) -- cualquier otra letra antes
    del "=" se rechaza explícito en vez de asumir cuál es la variable."""
    if "=" not in point_text:
        raise ComplexAnalysisParseError(f'Se esperaba "z=punto": "{point_text}".')
    var_text, value_text = point_text.split("=", 1)
    if var_text.strip() != "z":
        raise ComplexAnalysisParseError(
            f'Solo se admite la variable "z" en esta sección: "{point_text}".'
        )
    try:
        return parsing.parse_expression_tree(value_text.strip(), allow_equation=False)
    except parsing.ParseSecurityError as exc:
        raise ComplexAnalysisParseError(str(exc)) from exc


def residue_at(expression_text: str, point_text: str) -> ResidueResult:
    expr = _parse_expression_in_z(expression_text)
    point = _parse_point(point_text)
    try:
        r = sympy.residue(expr, _z, point)
    except (ValueError, NotImplementedError) as exc:
        raise ComplexAnalysisUnsupportedError(
            f"No se pudo calcular el residuo de esta expresión: {exc}"
        ) from exc
    return ResidueResult(expression_text=expression_text, point=point, residue=r)


def singularities_of(expression_text: str) -> SingularitiesResult:
    expr = _parse_expression_in_z(expression_text)
    try:
        s = sympy.singularities(expr, _z)
    except (ValueError, NotImplementedError) as exc:
        raise ComplexAnalysisUnsupportedError(
            f"No se pudieron determinar las singularidades de esta expresión: {exc}"
        ) from exc

    # Hallazgo real de F0: funciones trascendentes (ej. 1/sin(z)) dan un
    # ImageSet infinito, no una lista mostrable -- se rechaza explícito
    # en vez de intentar mostrarlo o truncarlo silenciosamente.
    if not isinstance(s, FiniteSet):
        raise ComplexAnalysisUnsupportedError(
            "Esta expresión tiene un conjunto infinito o no acotado de singularidades "
            "(por ejemplo, funciones trascendentes) -- fuera del alcance actual, que "
            "solo cubre funciones racionales."
        )

    return SingularitiesResult(expression_text=expression_text, points=sorted(s, key=str))
