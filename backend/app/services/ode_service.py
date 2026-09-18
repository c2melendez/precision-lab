"""
app/services/ode_service.py — Fase E (EDO), spec_edo_complejos_tooltips.md
sección 2.

Motor dedicado para ecuaciones diferenciales ordinarias. Sigue el mismo
patrón que `phase2_service.py` (dataclass de resultado + función pura,
sin dependencia de FastAPI/Pydantic en este archivo).

DECISIÓN DE SEGURIDAD (spec sección 2.2, "DETERMINADO, seguridad"): en vez
de agregar nuevas entradas a `ast_validator.BLOCKED_NODE_TYPES`, se
verificó (auditoría real, Módulo E1) que la ruta general YA está cerrada
por diseño existente, sin cambios:
  1. `sympy.Derivative` ya está en `BLOCKED_NODE_TYPES` (ast_validator.py)
     — cualquier árbol que contenga un nodo Derivative ya es rechazado
     en la ruta general, y este servicio construye Derivative(...)
     directamente en Python (nunca vía `parse_expression_tree`).
  2. `"dsolve"` no existe como clave en `parsing.ALLOWED_FUNCTIONS` — un
     usuario que escriba literalmente "dsolve(...)" en /evaluate obtiene
     "Función no reconocida", nunca invoca sympy.dsolve().
  3. Este módulo NUNCA llama a `parsing.parse_expression_tree` sobre el
     texto crudo con comillas simples (notación prima) — tiene su propio
     parser dedicado (`_parse_ode_text`), que es la única puerta de
     entrada a `dsolve()` en todo el backend.
Con (1)+(2)+(3), "garantizar por diseño que /ode es el único punto que
invoca dsolve()" (spec) queda satisfecho sin tocar ast_validator.py.
Ver Módulo E1, "Auditoría de alcance por motor" en el cierre, para la
evidencia de (1) y (2) verificada contra el código real.
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple

import sympy
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

# Mismas transformaciones que parsing.py (multiplicación implícita: "3y'"
# y "2x" deben interpretarse sin '*' explícito, igual que en el resto del
# proyecto) — verificado con ejecución real que sympy.sympify() por sí
# solo NO las aplica (bug encontrado al probar "y'=2x": SyntaxError).
_ODE_TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)

MAX_ODE_ORDER = 2  # spec, fuera de alcance: "órdenes de EDO más allá de 2º"

_x = sympy.Symbol("x")
_y = sympy.Function("y")


class ODEParseError(ValueError):
    """Notación de EDO no reconocible -> ErrorCode.PARSE_ERROR."""


class ODEUnsupportedError(ValueError):
    """EDO bien formada pero fuera del alcance resoluble -> ErrorCode.UNSUPPORTED_OPERATION."""


@dataclass
class ODEResult:
    input_text: str
    order: int
    solution: sympy.Eq  # y(x) = ...
    has_initial_condition: bool


def _prime_order(token: str) -> int:
    """'y' -> 0, \"y'\" -> 1, \"y''\" -> 2, ... Cuenta primas dinámicamente
    (spec sección 2.2: "el detector de intención debe contar primas
    dinámicamente, no usar una plantilla fija por orden")."""
    stripped = token[1:]  # quita la 'y' inicial
    if not stripped:
        return 0
    if any(ch != "'" for ch in stripped):
        raise ODEParseError(f"Notación de derivada inválida: '{token}'.")
    return len(stripped)


def _substitute_derivatives(text: str) -> Tuple[str, int]:
    """Reemplaza y, y', y'', ... por Derivative(y(x), x, n) o y(x) (n=0),
    de mayor a menor orden de primas para no hacer matches parciales
    (ej. "y'''" debe consumirse entero antes que "y''"). Devuelve el
    texto sustituido y el orden máximo encontrado."""
    import re

    # Encuentra todas las ocurrencias de 'y' seguida de 0+ primas, como
    # token completo (no como parte de otro identificador).
    pattern = re.compile(r"y'*")
    max_order = 0

    def _replace(match: "re.Match") -> str:
        nonlocal max_order
        token = match.group(0)
        order = _prime_order(token)
        max_order = max(max_order, order)
        if order == 0:
            return "y(x)"
        return f"Derivative(y(x), x, {order})"

    substituted = pattern.sub(_replace, text)
    return substituted, max_order


def _split_equation_and_condition(text: str) -> Tuple[str, Optional[str]]:
    """Separa la EDO de la condición inicial y(x0)=y0, que vive en el
    mismo campo separada por coma (spec 2.2, DETERMINADO por el usuario:
    "prefiero la primera opción"). Ej: "y'=2x, y(0)=1" ->
    ("y'=2x", "y(0)=1")."""
    parts = [p.strip() for p in text.split(",")]
    if len(parts) == 1:
        return parts[0], None
    if len(parts) == 2:
        return parts[0], parts[1]
    raise ODEParseError(f"No se esperaba más de una condición inicial: '{text}'.")


def _parse_initial_condition(ic_text: str, order: int) -> dict:
    """Parsea "y(0)=1" (orden 1: solo y(x0)=y0) o, para orden 2, se
    acepta también una segunda condición separada por ';' del tipo
    "y'(0)=v0" si el usuario la escribe -- fuera del alcance confirmado
    del teclado (que solo monta y(□)=□, spec 2.3), pero el parser no lo
    rechaza si llega por otra vía (ej. suite de pruebas)."""
    import re

    match = re.fullmatch(r"y(('*))\(([^)]+)\)\s*=\s*(.+)", ic_text.strip())
    if not match:
        raise ODEParseError(f"Condición inicial no reconocida: '{ic_text}'.")
    primes, point_text, value_text = match.group(1), match.group(3), match.group(4)
    deriv_order = len(primes)
    try:
        point = sympy.sympify(point_text)
        value = sympy.sympify(value_text)
    except (sympy.SympifyError, TypeError) as exc:
        raise ODEParseError(f"No se pudo interpretar la condición inicial: {exc}") from exc

    if deriv_order == 0:
        return {_y(point): value}
    return {sympy.Derivative(_y(_x), _x, deriv_order).subs(_x, point): value}


def _parse_ode_text(text: str) -> Tuple[sympy.Eq, Optional[dict], int]:
    """Única puerta de entrada a la construcción de un `sympy.Eq` con
    `Derivative`/`Function` para EDO en todo el backend (ver nota de
    seguridad arriba). No pasa por `parsing.parse_expression_tree`."""
    eq_text, ic_text = _split_equation_and_condition(text)

    if "=" not in eq_text:
        raise ODEParseError(f"Se esperaba una ecuación ('='): '{eq_text}'.")
    lhs_text, rhs_text = eq_text.split("=", 1)

    lhs_sub, lhs_order = _substitute_derivatives(lhs_text)
    rhs_sub, rhs_order = _substitute_derivatives(rhs_text)
    order = max(lhs_order, rhs_order)

    if order == 0:
        raise ODEParseError(
            f"No se detectó ninguna derivada (notación 'y'') en: '{eq_text}'."
        )
    if order > MAX_ODE_ORDER:
        raise ODEUnsupportedError(
            f"Orden de EDO no soportado (máx. {MAX_ODE_ORDER}): orden {order}."
        )

    local_dict = {"y": _y, "x": _x, "Derivative": sympy.Derivative}
    try:
        lhs_expr = parse_expr(lhs_sub, local_dict=local_dict, transformations=_ODE_TRANSFORMATIONS)
        rhs_expr = parse_expr(rhs_sub, local_dict=local_dict, transformations=_ODE_TRANSFORMATIONS)
    except (sympy.SympifyError, TypeError, SyntaxError) as exc:
        raise ODEParseError(f"No se pudo interpretar la ecuación: {exc}") from exc

    equation = sympy.Eq(lhs_expr, rhs_expr)

    ics = _parse_initial_condition(ic_text, order) if ic_text else None
    return equation, ics, order


def solve_ode(text: str) -> ODEResult:
    """Resuelve una EDO en notación prima, con condición inicial opcional
    en el mismo campo. Usa `sympy.dsolve()` — casos separables, lineales
    de primer orden, y lineales de orden superior con coeficientes
    constantes están dentro de lo que `dsolve` resuelve nativamente
    (spec sección 2.1, "DETERMINADO que es viable").

    Cualquier EDO que dsolve no pueda resolver (fuera de los tipos
    cubiertos, o sympy.dsolve levanta NotImplementedError) se traduce a
    ODEUnsupportedError -> ErrorCode.UNSUPPORTED_OPERATION, nunca un
    resultado inventado ni un error crudo del motor (spec 2.1).
    """
    equation, ics, order = _parse_ode_text(text)

    try:
        if ics:
            solution = sympy.dsolve(equation, _y(_x), ics=ics)
        else:
            solution = sympy.dsolve(equation, _y(_x))
    except NotImplementedError as exc:
        raise ODEUnsupportedError(
            f"Esta ecuación diferencial no está dentro de los tipos soportados: {exc}"
        ) from exc
    except (ValueError, TypeError) as exc:
        raise ODEUnsupportedError(
            f"No se pudo resolver esta ecuación diferencial: {exc}"
        ) from exc

    if isinstance(solution, list):
        # dsolve puede devolver varias soluciones (ej. ramas); se toma
        # la primera con una nota — comportamiento no anticipado en el
        # spec, decisión DEDUCIBLE registrada en el cierre del módulo.
        solution = solution[0]

    return ODEResult(
        input_text=text,
        order=order,
        solution=solution,
        has_initial_condition=ics is not None,
    )
