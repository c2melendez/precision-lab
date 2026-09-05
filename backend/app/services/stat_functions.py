"""
app/services/stat_functions.py — Fase 10 (auditoría Fase 0 v2, ported de
precision-lab-lite/src/engine/statFunctions.ts): mean/median/mode/stdev/
variance/mad no existen como funciones de SymPy — se definen aquí como
`sympy.Function` con un `eval` de clase que solo calcula cuando TODOS los
argumentos son números (si alguno es simbólico, se deja sin evaluar, igual
que sin(x) para x simbólico).

Alcance más reducido que la Lite: "sort" y la forma multi-modal de "mode"
no se portan — /evaluate (evaluate_service.py) asume un resultado escalar
(`expr.evalf()` + `float(...)`), y una lista de valores (sympy.Tuple/Matrix)
no encaja en ese contrato sin cambios más profundos al endpoint. "mode"
con empate devuelve el valor MÁS PEQUEÑO entre los empatados (decisión
deliberada, documentada aquí, distinta de la lista que sí devuelve la
Lite).

min/max/nCr/nPr/mod/gcd/lcm NO necesitan una Function propia — ya son
nativos de SymPy (sympy.Min/Max/binomial/FallingFactorial/Mod/gcd/lcm),
solo hace falta registrarlos en ALLOWED_FUNCTIONS (ver parsing.py).
"""

from typing import Tuple as TupleType

import sympy
from sympy import Function


def _all_numeric(args: TupleType[sympy.Basic, ...]) -> bool:
    return len(args) > 0 and all(isinstance(a, sympy.Number) for a in args)


class Mean(Function):
    @classmethod
    def eval(cls, *args):
        if not _all_numeric(args):
            return None
        return sympy.Add(*args) / len(args)


class Median(Function):
    @classmethod
    def eval(cls, *args):
        if not _all_numeric(args):
            return None
        values = sorted(args)
        n = len(values)
        mid = n // 2
        if n % 2 == 0:
            return (values[mid - 1] + values[mid]) / 2
        return values[mid]


class Mode(Function):
    """En caso de empate, devuelve el valor más pequeño entre los
    empatados (decisión deliberada, ver docstring del módulo — la Lite
    devuelve la lista completa de modas, aquí no encaja en el contrato
    escalar de /evaluate)."""

    @classmethod
    def eval(cls, *args):
        if not _all_numeric(args):
            return None
        counts: dict = {}
        for a in args:
            counts[a] = counts.get(a, 0) + 1
        max_count = max(counts.values())
        tied = sorted(v for v, c in counts.items() if c == max_count)
        return tied[0]


class Range(Function):
    @classmethod
    def eval(cls, *args):
        if not _all_numeric(args):
            return None
        return sympy.Max(*args) - sympy.Min(*args)


def _variance(args) -> sympy.Expr:
    # Decisión DEDUCIBLE (misma que precision-lab-lite/statFunctions.ts):
    # desviación MUESTRAL (n-1), convención más común en calculadoras
    # científicas para un conjunto de datos que no se asume la población
    # completa.
    n = len(args)
    m = sympy.Add(*args) / n
    sum_sq = sympy.Add(*[(a - m) ** 2 for a in args])
    return sum_sq / (n - 1)


class Variance(Function):
    @classmethod
    def eval(cls, *args):
        if not _all_numeric(args):
            return None
        if len(args) < 2:
            raise ValueError("variance necesita al menos 2 valores.")
        return _variance(args)


class Stdev(Function):
    @classmethod
    def eval(cls, *args):
        if not _all_numeric(args):
            return None
        if len(args) < 2:
            raise ValueError("stdev necesita al menos 2 valores.")
        return sympy.sqrt(_variance(args))


class Mad(Function):
    @classmethod
    def eval(cls, *args):
        if not _all_numeric(args):
            return None
        n = len(args)
        m = sympy.Add(*args) / n
        return sympy.Add(*[sympy.Abs(a - m) for a in args]) / n


# P6 (spec v2 §7.1): Variance/Stdev de arriba son muestrales (n-1) —
# faltaba la variante poblacional. Se agregan como clases NUEVAS, sin
# tocar Variance/Stdev (que ya usa el campo de expresión libre) ni su
# firma.
def _variance_population(args) -> sympy.Expr:
    n = len(args)
    m = sympy.Add(*args) / n
    sum_sq = sympy.Add(*[(a - m) ** 2 for a in args])
    return sum_sq / n


class VariancePop(Function):
    @classmethod
    def eval(cls, *args):
        if not _all_numeric(args):
            return None
        if len(args) < 1:
            raise ValueError("variancepop necesita al menos 1 valor.")
        return _variance_population(args)


class StdevPop(Function):
    @classmethod
    def eval(cls, *args):
        if not _all_numeric(args):
            return None
        if len(args) < 1:
            raise ValueError("stdevpop necesita al menos 1 valor.")
        return sympy.sqrt(_variance_population(args))
