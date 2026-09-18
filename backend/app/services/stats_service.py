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
    Iqr,
    Mad,
    Mean,
    Median,
    Mode,
    Percentile,
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


def descriptive_stat(
    values: List[float], stat: str, variance_kind: VarianceKind, percentile_p: float | None = None
) -> ScalarResult:
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
    # Módulo M0 (spec_graficacion_matrices_estadistica_unidades.md, sección
    # 6.1): cuartiles/percentiles/RIQ — misma lista de valores, sin UI de
    # entrada nueva (reutiliza StatisticsDescriptiveRequest).
    if stat == "q1":
        return ScalarResult(Percentile(sympy.Integer(25), *args))
    if stat == "q2":
        return ScalarResult(Percentile(sympy.Integer(50), *args))
    if stat == "q3":
        return ScalarResult(Percentile(sympy.Integer(75), *args))
    if stat == "iqr":
        return ScalarResult(Iqr(*args))
    if stat == "percentile":
        if percentile_p is None:
            raise ValueError("El estadístico 'percentile' requiere el parámetro percentile_p (0-100).")
        return ScalarResult(Percentile(sympy.Rational(str(percentile_p)), *args))
    raise ValueError(f"Estadístico desconocido: {stat!r}.")


# ---------------------------------------------------------------------------
# Módulo M1 (spec_graficacion_matrices_estadistica_unidades.md, sección
# 6.2): correlación y regresión lineal simple. A diferencia del resto de
# Descriptiva, opera sobre PARES (x,y) — funciones planas nuevas, no
# sympy.Function, porque no necesitan quedar sin evaluar ante un símbolo
# (siempre reciben listas numéricas concretas desde el endpoint).
# ---------------------------------------------------------------------------


def linear_correlation(x: List[float], y: List[float]) -> ScalarResult:
    """Coeficiente de correlación de Pearson (r)."""
    if len(x) != len(y):
        raise ValueError(f"x e y deben tener la misma longitud; recibidas {len(x)} y {len(y)}.")
    if len(x) < 2:
        raise ValueError("La correlación necesita al menos 2 pares (x,y).")
    xs = _to_sympy_numbers(x)
    ys = _to_sympy_numbers(y)
    n = len(xs)
    mx = sympy.Add(*xs) / n
    my = sympy.Add(*ys) / n
    sxy = sympy.Add(*[(xi - mx) * (yi - my) for xi, yi in zip(xs, ys)])
    sxx = sympy.Add(*[(xi - mx) ** 2 for xi in xs])
    syy = sympy.Add(*[(yi - my) ** 2 for yi in ys])
    if sxx == 0 or syy == 0:
        raise ValueError("La correlación no está definida cuando x o y son constantes (varianza cero).")
    return ScalarResult(sympy.simplify(sxy / sympy.sqrt(sxx * syy)))


def linear_regression_slope(x: List[float], y: List[float]) -> ScalarResult:
    if len(x) != len(y):
        raise ValueError(f"x e y deben tener la misma longitud; recibidas {len(x)} y {len(y)}.")
    if len(x) < 2:
        raise ValueError("La regresión necesita al menos 2 pares (x,y).")
    xs = _to_sympy_numbers(x)
    ys = _to_sympy_numbers(y)
    n = len(xs)
    mx = sympy.Add(*xs) / n
    my = sympy.Add(*ys) / n
    sxy = sympy.Add(*[(xi - mx) * (yi - my) for xi, yi in zip(xs, ys)])
    sxx = sympy.Add(*[(xi - mx) ** 2 for xi in xs])
    if sxx == 0:
        raise ValueError("La pendiente no está definida cuando todos los x son iguales (recta vertical).")
    return ScalarResult(sympy.simplify(sxy / sxx))


def linear_regression_intercept(x: List[float], y: List[float]) -> ScalarResult:
    xs = _to_sympy_numbers(x)
    ys = _to_sympy_numbers(y)
    n = len(xs)
    mx = sympy.Add(*xs) / n
    my = sympy.Add(*ys) / n
    slope = linear_regression_slope(x, y).value
    return ScalarResult(sympy.simplify(my - slope * mx))


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


# ---------------------------------------------------------------------------
# Módulo N0 (spec_graficacion_matrices_estadistica_unidades.md, sección 7):
# Poisson, uniforme, exponencial. Mismo patrón que Binomial (Poisson,
# discreta) y Normal (uniforme/exponencial, continuas) de arriba.
# ---------------------------------------------------------------------------


def _validate_poisson_params(lam: sympy.Expr) -> None:
    if lam <= 0:
        raise ValueError("λ debe ser mayor que 0.")


def poisson_pmf(lam: float, k: int) -> ScalarResult:
    lam_sym = sympy.Rational(str(lam))
    _validate_poisson_params(lam_sym)
    if k < 0:
        raise ValueError("k debe ser un entero no negativo.")
    return ScalarResult(sympy.exp(-lam_sym) * lam_sym**k / sympy.factorial(k))


def poisson_cdf(lam: float, k: int) -> ScalarResult:
    lam_sym = sympy.Rational(str(lam))
    _validate_poisson_params(lam_sym)
    total = sympy.Integer(0)
    for i in range(0, k + 1):
        total += lam_sym**i / sympy.factorial(i)
    return ScalarResult(sympy.exp(-lam_sym) * total)


def poisson_expected_value(lam: float) -> ScalarResult:
    lam_sym = sympy.Rational(str(lam))
    _validate_poisson_params(lam_sym)
    return ScalarResult(lam_sym)


def poisson_variance(lam: float) -> ScalarResult:
    lam_sym = sympy.Rational(str(lam))
    _validate_poisson_params(lam_sym)
    return ScalarResult(lam_sym)


def _validate_uniform_params(a: sympy.Expr, b: sympy.Expr) -> None:
    if a >= b:
        raise ValueError("a debe ser menor que b.")


def uniform_cdf(a: float, b: float, x: float) -> ScalarResult:
    a_sym, b_sym, x_sym = sympy.Rational(str(a)), sympy.Rational(str(b)), sympy.Rational(str(x))
    _validate_uniform_params(a_sym, b_sym)
    if x_sym <= a_sym:
        return ScalarResult(sympy.Integer(0))
    if x_sym >= b_sym:
        return ScalarResult(sympy.Integer(1))
    return ScalarResult((x_sym - a_sym) / (b_sym - a_sym))


def uniform_expected_value(a: float, b: float) -> ScalarResult:
    a_sym, b_sym = sympy.Rational(str(a)), sympy.Rational(str(b))
    _validate_uniform_params(a_sym, b_sym)
    return ScalarResult((a_sym + b_sym) / 2)


def uniform_variance(a: float, b: float) -> ScalarResult:
    a_sym, b_sym = sympy.Rational(str(a)), sympy.Rational(str(b))
    _validate_uniform_params(a_sym, b_sym)
    return ScalarResult((b_sym - a_sym) ** 2 / 12)


def _validate_exponential_params(lam: sympy.Expr) -> None:
    if lam <= 0:
        raise ValueError("λ debe ser mayor que 0.")


def exponential_cdf(lam: float, x: float) -> ScalarResult:
    lam_sym, x_sym = sympy.Rational(str(lam)), sympy.Rational(str(x))
    _validate_exponential_params(lam_sym)
    if x_sym < 0:
        return ScalarResult(sympy.Integer(0))
    return ScalarResult(1 - sympy.exp(-lam_sym * x_sym))


def exponential_expected_value(lam: float) -> ScalarResult:
    lam_sym = sympy.Rational(str(lam))
    _validate_exponential_params(lam_sym)
    return ScalarResult(1 / lam_sym)


def exponential_variance(lam: float) -> ScalarResult:
    lam_sym = sympy.Rational(str(lam))
    _validate_exponential_params(lam_sym)
    return ScalarResult(1 / lam_sym**2)
