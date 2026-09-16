"""
app/services/linear_inequality_system.py — equivalente Full/SymPy del
sistema de inecuaciones lineales ya construido en precision-lab-lite
(src/engine/stepEngine/linearInequalitySystem.ts, Módulo C del track de
motor matemático). Mismo diseño confirmado por el usuario ahí, replicado
acá para paridad:

1. Alcance: EXACTAMENTE 2 variables — 3+ se rechaza explícitamente.
2. Representación de la región: VÉRTICES del polígono factible.
3. Pasos en dos niveles: uno por inecuación + uno final con los vértices
   (o "sin solución"/"no acotada").
4. Tipo de resultado nuevo (no un valor escalar) — InequalitySystemSolution.

Deliberadamente en un archivo SEPARADO de phase2_service.py: ese módulo
importa `app.schemas.responses` (Pydantic) a nivel de módulo, lo que
impediría probar esta función con ejecución real en un entorno sin
Pydantic instalado — verificado que es el caso de este entorno. Este
archivo solo depende de `sympy` (sí instalado, verificado) + stdlib, así
que se pudo probar de punta a punta con ejecución real, incluida la parte
de extracción de coeficientes (a diferencia de Lite, donde esa parte
dependía de Algebrite, no instalable acá — ver el cierre del módulo).

LIMITACIÓN DOCUMENTADA (igual que en Lite, misma decisión DEDUCIBLE): no
se distingue frontera abierta/cerrada — los operadores estrictos (<, >)
se tratan como no estrictos (≤, ≥) para el cálculo de vértices. La FORMA
de la región es correcta; la inclusión/exclusión exacta de sus bordes no
se modela todavía.

CORRECCIÓN POST-AUDITORÍA (hallazgo real, no en el cierre original del
Módulo C): el diseño original de `_compute_vertices`/`_is_bounded`
(intersección de cada par de rectas frontera + prueba del cono de fuga)
no distinguía "región vacía" de "región no acotada" cuando ningún par de
rectas se cruza — por ejemplo `x>=5, x<=1` (vacío, ninguna x cumple
ambas) y `x>=0, x<=1` (franja no acotada, sí factible) daban el MISMO
resultado ("unbounded", sin vértices), porque `_is_bounded` solo evalúa
el cono de recesión (versión homogénea, sin el término independiente) y
nunca comprueba si el sistema original tiene algún punto factible real.
Se reemplaza por recorte de semiplanos (Sutherland-Hodgman) contra una
caja grande (`_BIG`): más robusto, da la factibilidad real de un solo
paso y de paso simplifica el código (ya no hace falta `_is_bounded`
por separado). Ver `tests/test_modulos_abc_auditoria.py` para los casos
que expusieron el bug original y ahora lo cubren.
"""

import math
from dataclasses import dataclass
from typing import List, Optional, Tuple

import sympy

EPS = 1e-9


@dataclass
class Point:
    x: float
    y: float


@dataclass
class InequalitySystemSolution:
    kind: str  # "bounded" | "unbounded" | "empty"
    vertices: Optional[List[Point]]
    steps: List[str]


@dataclass
class _Constraint:
    a: float
    b: float
    c: float  # a*x + b*y {operator} c
    operator: str  # "<=", ">=", "<", ">"
    label: str


def _satisfies(p: Point, c: _Constraint, tolerance: float = EPS) -> bool:
    lhs = c.a * p.x + c.b * p.y
    if c.operator in ("<=", "<"):
        return lhs <= c.c + tolerance
    return lhs >= c.c - tolerance


def _dedupe_points(points: List[Point]) -> List[Point]:
    unique: List[Point] = []
    for p in points:
        if not any(abs(q.x - p.x) < 1e-6 and abs(q.y - p.y) < 1e-6 for q in unique):
            unique.append(p)
    return unique


_BIG = 1e7
_BIG_TOL = 1e5  # cualquier coordenada a esta distancia (o más) del borde de
# la caja se considera "en el infinito" (artefacto del recorte, no un
# vértice real) — ver nota de corrección arriba del módulo.


def _clip_by_halfplane(polygon: List[Point], a: float, b: float, rhs: float) -> List[Point]:
    """Recorta `polygon` (convexo) contra el semiplano a*x+b*y <= rhs,
    algoritmo de Sutherland-Hodgman. `polygon` vacío se propaga tal cual."""
    if not polygon:
        return []
    output: List[Point] = []
    n = len(polygon)
    for i in range(n):
        curr = polygon[i]
        prev = polygon[i - 1]
        curr_inside = a * curr.x + b * curr.y <= rhs + EPS
        prev_inside = a * prev.x + b * prev.y <= rhs + EPS
        if curr_inside != prev_inside:
            dx, dy = curr.x - prev.x, curr.y - prev.y
            denom = a * dx + b * dy
            if abs(denom) > 1e-12:
                t = (rhs - (a * prev.x + b * prev.y)) / denom
                output.append(Point(prev.x + t * dx, prev.y + t * dy))
        if curr_inside:
            output.append(curr)
    return output


def _feasible_region(constraints: List[_Constraint]) -> List[Point]:
    """Región factible real (no solo el cono de recesión) vía recorte
    sucesivo de semiplanos contra una caja grande — ver nota de
    corrección arriba del módulo."""
    polygon = [
        Point(-_BIG, -_BIG),
        Point(_BIG, -_BIG),
        Point(_BIG, _BIG),
        Point(-_BIG, _BIG),
    ]
    for c in constraints:
        if c.operator in ("<=", "<"):
            a, b, rhs = c.a, c.b, c.c
        else:
            a, b, rhs = -c.a, -c.b, -c.c
        polygon = _clip_by_halfplane(polygon, a, b, rhs)
        if not polygon:
            break
    return polygon


def _order_by_angle(vertices: List[Point]) -> List[Point]:
    if len(vertices) <= 2:
        return vertices
    cx = sum(p.x for p in vertices) / len(vertices)
    cy = sum(p.y for p in vertices) / len(vertices)
    return sorted(vertices, key=lambda p: math.atan2(p.y - cy, p.x - cx))


def _fmt(n: float) -> str:
    if n == int(n):
        return str(int(n))
    return f"{n:.4f}".rstrip("0").rstrip(".")


def solve_inequality_system_numeric(constraints: List[_Constraint]) -> InequalitySystemSolution:
    """Núcleo numérico puro — sin dependencia de SymPy más allá de los
    floats ya extraídos. Misma lógica nueva que su equivalente en Lite,
    corregida (ver nota al inicio del módulo) para usar la región
    factible real en vez de solo el cono de recesión."""
    steps = [f"Inecuación {i + 1} de {len(constraints)}: {c.label}" for i, c in enumerate(constraints)]

    polygon = _feasible_region(constraints)

    if not polygon:
        steps.append("Sin solución factible: ningún punto cumple todas las inecuaciones a la vez.")
        return InequalitySystemSolution(kind="empty", vertices=None, steps=steps)

    def _is_finite(p: Point) -> bool:
        return abs(p.x) < _BIG - _BIG_TOL and abs(p.y) < _BIG - _BIG_TOL

    touches_box = any(not _is_finite(p) for p in polygon)
    finite_vertices = _dedupe_points([p for p in polygon if _is_finite(p)])

    if touches_box:
        if not finite_vertices:
            steps.append("Región no acotada, sin vértices finitos (ej. un semiplano o una franja).")
            return InequalitySystemSolution(kind="unbounded", vertices=[], steps=steps)
        ordered = _order_by_angle(finite_vertices)
        coords = ", ".join(f"({_fmt(p.x)}, {_fmt(p.y)})" for p in ordered)
        steps.append(f"Región no acotada, con {len(ordered)} vértice(s) finito(s): {coords}")
        return InequalitySystemSolution(kind="unbounded", vertices=ordered, steps=steps)

    ordered = _order_by_angle(_dedupe_points(polygon))
    coords = ", ".join(f"({_fmt(p.x)}, {_fmt(p.y)})" for p in ordered)
    steps.append(f"Vértices del polígono factible ({len(ordered)}): {coords}")
    return InequalitySystemSolution(kind="bounded", vertices=ordered, steps=steps)


def _extract_constraint(
    expr: sympy.Expr, operator: str, variables: Tuple[sympy.Symbol, sympy.Symbol]
) -> _Constraint:
    """Extrae {a, b, c} de `expr {operator} 0` — valida linealidad real
    con derivadas simbólicas (mismo criterio que extractRow/
    extractConstraint en Lite, pero con SymPy en vez de derivative()/
    evaluate() de Algebrite): cualquier derivada mixta o de segundo orden
    distinta de cero significa que el término no es lineal."""
    for v in variables:
        for other in variables:
            if v != other:
                mixed = sympy.diff(expr, v, other)
                if mixed != 0:
                    raise ValueError(
                        f'El sistema de inecuaciones no es lineal (término con "{v}" y "{other}" '
                        "multiplicados entre sí). Este solver solo resuelve sistemas lineales."
                    )
        second = sympy.diff(expr, v, 2)
        if second != 0:
            raise ValueError(
                f'El sistema de inecuaciones no es lineal (término de grado 2 o mayor en "{v}"). '
                "Este solver solo resuelve sistemas lineales."
            )

    x, y = variables
    a = float(sympy.diff(expr, x).evalf())
    b = float(sympy.diff(expr, y).evalf())
    constant = float(expr.subs({x: 0, y: 0}).evalf())
    # expr {op} 0  =>  a*x + b*y {op} -constante
    label = f"{_fmt(a)}{x} + {_fmt(b)}{y} {operator} {_fmt(-constant)}"
    return _Constraint(a=a, b=b, c=-constant, operator=operator, label=label)


def solve_linear_inequality_system(
    inequalities: List[Tuple[sympy.Expr, str]], variable_names: List[str]
) -> InequalitySystemSolution:
    """Punto de entrada — envuelve al núcleo numérico con la extracción
    de coeficientes vía SymPy. Rechaza explícitamente cualquier sistema
    que no tenga EXACTAMENTE 2 variables (alcance confirmado con el
    usuario) y cualquier término no lineal (vía _extract_constraint)."""
    if len(variable_names) != 2:
        raise ValueError(
            f"Esta versión del sistema de inecuaciones solo resuelve sistemas de 2 variables "
            f"(se detectaron {len(variable_names)}: {', '.join(variable_names) or 'ninguna'}). "
            "Un sistema de 1 variable se resuelve como intersección de intervalos "
            "(ver compute_inequality); 3 o más variables no está soportado todavía."
        )
    x, y = sympy.symbols(variable_names)
    constraints = [_extract_constraint(expr, operator, (x, y)) for expr, operator in inequalities]
    return solve_inequality_system_numeric(constraints)
