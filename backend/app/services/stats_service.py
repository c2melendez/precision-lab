"""
app/services/stats_service.py — P6 (spec v2 §7): Descriptiva /
Combinatoria / Distribución.

Descriptiva reutiliza las clases de stat_functions.py (Mean/Median/Mode/
Range/Variance/Stdev/VariancePop/StdevPop) llamándolas directamente con
argumentos sympy.Number — así se dispara su `eval` de clase, exactamente
la misma ruta de cómputo que ya usa el campo de expresión libre vía
ALLOWED_FUNCTIONS (parsing.py). No se reimplementa ninguna fórmula aquí
(spec §7.1 explícita: "reutilizar stat_functions.py existente").

Combinatoria reutiliza sympy.binomial/FallingFactorial/factorial — los
mismos que ya registra parsing.py para nCr/nPr/n! en el campo de
expresión libre (spec §7.2 explícita: "reutilizar la resolución ya
existente").

Distribución (binomial/normal) es matemática NUEVA (no existía en ningún
repo) — sí se implementa aquí. Para la CDF normal, la spec ofrece dos
rutas (`sympy.stats.Normal`+`cdf()`, o la fórmula explícita con `erf`).
Elijo la fórmula explícita con `sympy.erf`: es una función mucho más
estándar y con un contrato más predecible que `sympy.stats` (submódulo
menos común) — no pude ejecutar ninguna de las dos rutas en este entorno
(sin `sympy.stats` verificado, sin red) para comparar empíricamente, así
que tomo la que requiere menos supuestos sobre una API que no pude
probar. Documentado también en el cierre del P6. Mismo criterio para
Binomial: suma directa con `sympy.binomial`, no `sympy.stats.Binomial`.
"""

from dataclasses import dataclass
from typing import List, Literal

import sympy

from app.services.stat_functions import (
    Mad,
    Mean,
    Median,
    Mode,
    Range,
    Stdev,
    StdevPop,
    Variance,
    VariancePop,
)

VarianceKind = Literal["population", "sample"]


@dataclass
class ScalarResult:
    value: sympy.Expr


def _to_sympy_numbers(values: List[float]) -> List[sympy.Expr]:
    return [sympy.Rational(str(v)) for v in values]


# ---------------------------------------------------------------------------
# 7.1 Descriptiva
# ---------------------------------------------------------------------------


def descriptive_stat(values: List[float], stat: str, variance_kind: VarianceKind) -> ScalarResult:
    args = _to_sympy_numbers(values)
    if stat == "mean":
        return ScalarResult(Mean(*args))
    if stat == "median":
        return ScalarResult(Median(*args))
    if stat == "mode":
        return ScalarResult(Mode(*args))
    if stat == "sum":
        return ScalarResult(sympy.Add(*args))
    if stat == "sumsq":
        return ScalarResult(sympy.Add(*[a**2 for a in args]))
    if stat == "n":
        return ScalarResult(sympy.Integer(len(args)))
    if stat == "min":
        return ScalarResult(sympy.Min(*args))
    if stat == "max":
        return ScalarResult(sympy.Max(*args))
    if stat == "range":
        return ScalarResult(Range(*args))
    if stat == "mad":
        return ScalarResult(Mad(*args))
    if stat == "variance":
        fn = VariancePop if variance_kind == "population" else Variance
        return ScalarResult(fn(*args))
    if stat == "stdev":
        fn = StdevPop if variance_kind == "population" else Stdev
        return ScalarResult(fn(*args))
    raise ValueError(f"Estadístico desconocido: {stat!r}.")


# ---------------------------------------------------------------------------
# 7.2 Combinatoria
# ---------------------------------------------------------------------------


def combinatorics(n: int, r: int, fn: str) -> ScalarResult:
    if fn == "factorial":
        return ScalarResult(sympy.factorial(n))
    if fn == "nCr":
        return ScalarResult(sympy.binomial(n, r))
    if fn == "nPr":
        return ScalarResult(sympy.functions.combinatorial.factorials.FallingFactorial(n, r))
    raise ValueError(f"Función de combinatoria desconocida: {fn!r}.")


# ---------------------------------------------------------------------------
# 7.3 Distribución — Binomial
# ---------------------------------------------------------------------------


def _validate_binomial_params(n: int, p: sympy.Expr) -> None:
    if n < 0:
        raise ValueError("n debe ser un entero no negativo.")
    if p < 0 or p > 1:
        raise ValueError("p debe estar entre 0 y 1.")


def binomial_pmf(n: int, p: float, k: int) -> ScalarResult:
    p_sym = sympy.Rational(str(p))
    _validate_binomial_params(n, p_sym)
    if k < 0 or k > n:
        raise ValueError("k debe estar entre 0 y n.")
    return ScalarResult(sympy.binomial(n, k) * p_sym**k * (1 - p_sym) ** (n - k))


def binomial_cdf(n: int, p: float, k: int) -> ScalarResult:
    p_sym = sympy.Rational(str(p))
    _validate_binomial_params(n, p_sym)
    total = sympy.Integer(0)
    for i in range(0, min(k, n) + 1):
        total += sympy.binomial(n, i) * p_sym**i * (1 - p_sym) ** (n - i)
    return ScalarResult(total)


def binomial_survival(n: int, p: float, k: int) -> ScalarResult:
    cdf_before = binomial_cdf(n, p, k - 1).value if k > 0 else sympy.Integer(0)
    return ScalarResult(1 - cdf_before)


def binomial_expected_value(n: int, p: float) -> ScalarResult:
    p_sym = sympy.Rational(str(p))
    _validate_binomial_params(n, p_sym)
    return ScalarResult(n * p_sym)


def binomial_variance(n: int, p: float) -> ScalarResult:
    p_sym = sympy.Rational(str(p))
    _validate_binomial_params(n, p_sym)
    return ScalarResult(n * p_sym * (1 - p_sym))


# ---------------------------------------------------------------------------
# 7.3 Distribución — Normal
# ---------------------------------------------------------------------------


def _validate_normal_params(sigma: sympy.Expr) -> None:
    if sigma <= 0:
        raise ValueError("σ debe ser mayor que 0.")


def normal_cdf(mu: float, sigma: float, x: float) -> ScalarResult:
    mu_sym, sigma_sym, x_sym = sympy.Rational(str(mu)), sympy.Rational(str(sigma)), sympy.Rational(str(x))
    _validate_normal_params(sigma_sym)
    z = (x_sym - mu_sym) / (sigma_sym * sympy.sqrt(2))
    return ScalarResult(sympy.Rational(1, 2) * (1 + sympy.erf(z)))


def normal_range(mu: float, sigma: float, a: float, b: float) -> ScalarResult:
    return ScalarResult(normal_cdf(mu, sigma, b).value - normal_cdf(mu, sigma, a).value)


def z_score(mu: float, sigma: float, x: float) -> ScalarResult:
    mu_sym, sigma_sym, x_sym = sympy.Rational(str(mu)), sympy.Rational(str(sigma)), sympy.Rational(str(x))
    _validate_normal_params(sigma_sym)
    return ScalarResult((x_sym - mu_sym) / sigma_sym)
