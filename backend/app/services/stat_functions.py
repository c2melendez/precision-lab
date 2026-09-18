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


# Módulo M0 (spec_graficacion_matrices_estadistica_unidades.md, sección
# 6.1): cuartiles/percentiles/RIQ. Convención DEDUCIBLE (no especificada
# antes, igual que la muestral n-1 de Variance/Stdev arriba): interpolación
# lineal entre los dos rangos más cercanos — la misma que usa
# `numpy.percentile` por defecto y Excel `PERCENTILE.INC`, la más común en
# calculadoras/hojas de cálculo. Se documenta aquí para no dejarlo
# implícito, tal como pide el spec para toda decisión DEDUCIBLE.
def _percentile(args, p) -> sympy.Expr:
    values = sorted(args)
    n = len(values)
    if n == 1:
        return values[0]
    index = (sympy.Rational(p) / 100) * (n - 1)
    lower = int(sympy.floor(index))
    upper = int(sympy.ceiling(index))
    if lower == upper:
        return values[lower]
    frac = index - lower
    return values[lower] + frac * (values[upper] - values[lower])


class Percentile(Function):
    """Primer argumento: p (0-100). Resto: los datos — mismo orden que
    usa precision-lab-lite/statFunctions.ts para mantener paridad de
    firma entre motores."""

    @classmethod
    def eval(cls, p, *args):
        if not _all_numeric((p, *args)):
            return None
        if not args:
            raise ValueError("percentile necesita al menos un valor de datos.")
        if p < 0 or p > 100:
            raise ValueError("El percentil debe estar entre 0 y 100.")
        return _percentile(args, p)


class Iqr(Function):
    @classmethod
    def eval(cls, *args):
        if not _all_numeric(args):
            return None
        if not args:
            raise ValueError("iqr necesita al menos un valor.")
        return _percentile(args, 75) - _percentile(args, 25)
