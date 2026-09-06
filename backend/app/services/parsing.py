"""
app/services/parsing.py — Parsing seguro (spec, sección 7 completa) y
sección 3 completa (sintaxis de entrada: Unicode, punto decimal, notación
científica rechazada, prioridad de identificadores multi-letra).

MÓDULO 2B: implementación real de las 9 etapas. Las etapas 8-9 (validación
del árbol AST y límites de complejidad) viven en `app/services/ast_validator.py`.
"""

import builtins
import keyword
import re
import warnings
from typing import Dict, List, Optional, Tuple

import sympy
from sympy import (
    Abs,
    Add,
    E,
    factorial,
    Float,
    I,
    Integer,
    Max,
    Min,
    Mod,
    Mul,
    Pow,
    Symbol,
    acos,
    arg,
    asin,
    atan,
    binomial,
    conjugate,
    cos,
    cosh,
    cot,
    csc,
    exp,
    gcd,
    lcm,
    log,
    oo,
    pi,
    sec,
    sign,
    sin,
    sinh,
    sqrt,
    tan,
    tanh,
)
from sympy.functions.combinatorial.factorials import FallingFactorial
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

from app.services.stat_functions import Mad, Mean, Median, Mode, Range, Stdev, StdevPop, Variance, VariancePop

MAX_EXPRESSION_LENGTH = 500
MIN_EXPRESSION_LENGTH = 1
MAX_IDENTIFIER_LENGTH = 64


class ParseSecurityError(ValueError):
    """Cualquier violación de las etapas 1-9 de la sección 7 — se traduce a
    `ErrorCode.PARSE_ERROR` en el router/servicio que llama al parser.

    Nota DEDUCIBLE (Módulo 2A): no es un contrato público de `schemas/`, es
    de uso interno entre `parsing.py`/`ast_validator.py` y los servicios.
    """


# Sección 7, bloque de código literal — no se renombran ni se completan
# entradas adicionales sin autorización explícita (Mensaje 0, regla 3).
ALLOWED_FUNCTIONS = {
    "sin": sin,
    "cos": cos,
    "tan": tan,
    "sec": sec,
    "csc": csc,
    "cot": cot,
    "asin": asin,
    "acos": acos,
    "atan": atan,
    "sinh": sinh,
    "cosh": cosh,
    "tanh": tanh,
    "sqrt": sqrt,
    "log": log,
    "ln": log,
    "exp": exp,
    "abs": Abs,
    "sign": sign,
    # Fase 10 (auditoría Fase 0 v2, port de precision-lab-lite): estas 15
    # claves NUNCA estaban aquí — de las 10 teclas del menú "Stat" del
    # teclado, antes de esto solo "n!" (factorial, ya soportado vía
    # ast_validator/sympy en otro punto) funcionaba; "min"/"max" ni
    # siquiera llegaban a fallar limpio, estaban BLOQUEADOS como
    # identificadores prohibidos (ver BLOCKED_IDENTIFIERS abajo, que resta
    # automáticamente las claves de este diccionario). min/max/gcd/lcm/mod
    # /nCr/nPr son nativos de SymPy (Min/Max/gcd/lcm/Mod/binomial/
    # FallingFactorial) — solo faltaba registrarlos. mean/median/mode/
    # range/stdev/variance/mad no existen en SymPy — se definen en
    # stat_functions.py, mismo criterio de evaluación (n-1 muestral para
    # stdev/variance) que su equivalente en la Lite. "sort" NO se portó
    # (ver stat_functions.py, no encaja en el contrato escalar de
    # /evaluate sin cambios más profundos).
    "min": Min,
    "max": Max,
    "range": Range,
    "mean": Mean,
    "median": Median,
    "mode": Mode,
    "stdev": Stdev,
    "variance": Variance,
    "var": Variance,  # alias real: la tecla del teclado inserta \mathrm{var}
    # P6 (spec v2 §7.1): variantes poblacionales, funciones nuevas.
    "stdevpop": StdevPop,
    "variancepop": VariancePop,
    "mad": Mad,
    "mod": Mod,
    "gcd": gcd,
    "lcm": lcm,
    "nCr": binomial,
    "nPr": FallingFactorial,
    # P4 (spec v2 §5.2, Complejos): re/im/arg/conjugate son nativos de
    # SymPy — solo hacía falta registrarlos, mismo patrón que arriba.
    # "re"/"im" se referencian como sympy.re/sympy.im (no importados como
    # nombres sueltos: colisionarían con el módulo `re` de Python, ya
    # importado arriba para regex) en vez de "conjugate" tal cual, la
    # tecla del teclado usa la etiqueta corta "conj" (mismo criterio que
    # "var" para \mathrm{var} en vez de \mathrm{variance}).
    "re": sympy.re,
    "im": sympy.im,
    "arg": arg,
    "conj": conjugate,
    # "⇄ Polar": NO es una función nativa de SymPy de un solo símbolo (la
    # spec lo dice explícito, §5.2) — se compone aquí con Abs/exp/arg, los
    # 3 ya registrados arriba. Importante: como valor de ALLOWED_FUNCTIONS
    # es una función Python (lambda), no una clase, así que
    # `isinstance(cls, type)` en ast_validator.py la EXCLUYE del set de
    # "clases permitidas" que usa la etapa 8 — pero eso no es un problema
    # de seguridad: parse_expr() la invoca y sustituye su resultado
    # (Abs(z)*exp(I*arg(z))) DURANTE el parseo, así que el árbol final que
    # ve validate_ast_safety solo contiene nodos Abs/exp/arg/Mul, todos ya
    # permitidos — "topolar" en sí nunca sobrevive como nodo Function en
    # el árbol. No pude ejecutar el pipeline real de parse_expr en este
    # entorno para confirmarlo empíricamente (sin red/dependencias
    # instaladas) — recomiendo un test explícito
    # (test_parsing.py/test_ast_validator.py) antes de dar este parche por
    # cerrado en Python. Dirección única (rectangular -> polar); no existe
    # sintaxis de entrada polar en este teclado para la dirección inversa.
    "topolar": lambda z: Abs(z) * exp(I * arg(z)),
}
ALLOWED_CONSTANTS = {"pi": pi, "e": E, "E": E, "i": I, "I": I, "oo": oo}

# Identificadores bloqueados en la etapa 5 (sección 7: "no builtin
# bloqueado"). Decisión DEDUCIBLE (registrada en el cierre del Módulo 2B):
# la spec solo da ejemplos ilustrativos (__import__, eval, exec, open,
# lambda...) — se adopta como blocklist COMPLETA la unión de las palabras
# reservadas de Python (`keyword.kwlist`/`softkwlist`) y de todo lo expuesto
# por el módulo `builtins`, restando lo que ya es una función/constante
# permitida (para no bloquear "abs", que colisiona con `builtins.abs`).
BLOCKED_IDENTIFIERS = (
    (set(keyword.kwlist) | set(keyword.softkwlist) | set(dir(builtins)))
    - set(ALLOWED_FUNCTIONS)
    - set(ALLOWED_CONSTANTS)
)

_IDENTIFIER_PATTERN = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_SCIENTIFIC_NOTATION_PATTERN = re.compile(r"[eE][+-]?\d+")
_CALL_ARITY_PATTERN = re.compile(r"\b(log|ln)\s*\(")


def validate_length(text: str) -> None:
    """Etapa 1 (sección 7): longitud entre 1 y 500 caracteres.

    Se re-aplica tras la etapa 3 a cada mitad de una ecuación, además de a
    la validación que ya hacen los schemas (`ExpressionRequest`, etc.) sobre
    el payload completo.
    """
    if not (MIN_EXPRESSION_LENGTH <= len(text) <= MAX_EXPRESSION_LENGTH):
        raise ParseSecurityError(
            f"La expresión debe tener entre {MIN_EXPRESSION_LENGTH} y "
            f"{MAX_EXPRESSION_LENGTH} caracteres (longitud recibida: {len(text)})."
        )


def normalize_unicode(text: str) -> str:
    """Etapa 2 (sección 7 y sección 3): `π`→`pi`, `∞`→`oo`, `√`→`sqrt(...)`
    envolviendo únicamente el siguiente token atómico (número, identificador
    simple, o paréntesis balanceado). `∫` NO se normaliza (sección 3)."""
    text = text.replace("π", "pi").replace("∞", "oo")
    return _expand_sqrt_tokens(text)


def _expand_sqrt_tokens(text: str) -> str:
    result: List[str] = []
    i = 0
    n = len(text)
    while i < n:
        char = text[i]
        if char != "√":
            result.append(char)
            i += 1
            continue

        i += 1
        if i >= n:
            raise ParseSecurityError("'√' sin un token válido a continuación.")
        next_char = text[i]

        if next_char == "(":
            depth = 0
            j = i
            while j < n:
                if text[j] == "(":
                    depth += 1
                elif text[j] == ")":
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            else:
                raise ParseSecurityError("Paréntesis no balanceado tras '√'.")
            result.append("sqrt" + text[i : j + 1])
            i = j + 1
        elif next_char.isdigit():
            j = i
            seen_dot = False
            while j < n and (text[j].isdigit() or (text[j] == "." and not seen_dot)):
                if text[j] == ".":
                    seen_dot = True
                j += 1
            result.append("sqrt(" + text[i:j] + ")")
            i = j
        elif next_char.isalpha() or next_char == "_":
            j = i
            while j < n and (text[j].isalnum() or text[j] == "_"):
                j += 1
            result.append("sqrt(" + text[i:j] + ")")
            i = j
        else:
            raise ParseSecurityError(
                f"'√' debe preceder un número, identificador o paréntesis "
                f"balanceado (encontrado: {next_char!r})."
            )
    return "".join(result)


def split_equation(text: str) -> Tuple[str, Optional[str]]:
    """Etapa 3 (sección 7): divide por el PRIMER `=` si aplica (solo
    `solve`); rechaza si hay más de un `=`. Sin `=` -> `(text, None)`.
    """
    count = text.count("=")
    if count == 0:
        return text, None
    if count > 1:
        raise ParseSecurityError("Se permite un único '=' en la ecuación.")
    idx = text.index("=")
    return text[:idx], text[idx + 1 :]


def validate_decimal_and_reject_scientific(text: str) -> None:
    """Etapa 4 (sección 7 y sección 3): todo `.` debe cumplir `\\d\\.\\d`
    (cualquier otro caso -> `PARSE_ERROR`). Notación científica
    (`[eE][+-]?\\d+`) rechazada explícitamente.

    Nota: esta misma regla es lo que hace que `foo.bar`/`().__class__`
    (acceso a atributos, sección 7 etapa 8) nunca lleguen a `parse_expr` en
    primer lugar — ningún `.` de esa forma cumple `\\d\\.\\d`.
    """
    for idx, char in enumerate(text):
        if char != ".":
            continue
        before_ok = idx > 0 and text[idx - 1].isdigit()
        after_ok = idx + 1 < len(text) and text[idx + 1].isdigit()
        if not (before_ok and after_ok):
            raise ParseSecurityError(
                f"Punto decimal inválido en la posición {idx}: solo se permite "
                "'dígito.dígito' (ej. 3.14)."
            )

    if _SCIENTIFIC_NOTATION_PATTERN.search(text):
        raise ParseSecurityError("Notación científica no permitida (ej. '1e5').")


def extract_candidate_identifiers(text: str) -> List[str]:
    """Etapa 5 (sección 7): extrae identificadores candidatos por regex
    (`[A-Za-z_][A-Za-z0-9_]*`); valida: empieza con letra, sin `__`, no
    builtin bloqueado, longitud ≤ 64. Esta clasificación tiene PRIORIDAD
    sobre la tokenización implícita (sección 3) — `theta` nunca se divide.
    """
    seen: List[str] = []
    for match in _IDENTIFIER_PATTERN.finditer(text):
        token = match.group(0)
        if token not in seen:
            seen.append(token)

    for token in seen:
        if not token[0].isalpha():
            raise ParseSecurityError(f"Identificador inválido (debe empezar con letra): '{token}'.")
        if "__" in token:
            raise ParseSecurityError(f"Identificador inválido (contiene '__'): '{token}'.")
        if len(token) > MAX_IDENTIFIER_LENGTH:
            raise ParseSecurityError(
                f"Identificador demasiado largo (máx. {MAX_IDENTIFIER_LENGTH}): "
                f"'{token[:20]}...' ({len(token)} caracteres)."
            )
        if token in BLOCKED_IDENTIFIERS:
            raise ParseSecurityError(f"Identificador no permitido: '{token}'.")

    return seen


def _validate_call_arity(text: str) -> None:
    """Parte de la etapa 6 (sección 7): valida aridad de `log`/`ln`.
    `ln` exige exactamente 1 argumento; `log` exige 1 o 2. Cualquier otro
    caso (ej. `log(x,2,3)`) -> `PARSE_ERROR` (sección 7, ejemplos).
    """
    for match in _CALL_ARITY_PATTERN.finditer(text):
        name = match.group(1)
        open_idx = match.end() - 1
        close_idx = _find_matching_paren(text, open_idx)
        inner = text[open_idx + 1 : close_idx]
        n_args = len(_split_top_level_commas(inner))
        if name == "ln" and n_args != 1:
            raise ParseSecurityError(
                f"'ln' requiere exactamente 1 argumento (recibidos: {n_args})."
            )
        if name == "log" and n_args not in (1, 2):
            raise ParseSecurityError(f"'log' requiere 1 o 2 argumentos (recibidos: {n_args}).")


def _find_matching_paren(text: str, open_idx: int) -> int:
    depth = 0
    for i in range(open_idx, len(text)):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return i
    raise ParseSecurityError("Paréntesis no balanceado.")


def _split_top_level_commas(inner: str) -> List[str]:
    if inner.strip() == "":
        return []
    parts: List[str] = []
    depth = 0
    current: List[str] = []
    for char in inner:
        if char == "(":
            depth += 1
            current.append(char)
        elif char == ")":
            depth -= 1
            current.append(char)
        elif char == "," and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(char)
    parts.append("".join(current))
    return parts


def classify_identifiers(
    identifiers: List[str],
) -> Tuple[Dict[str, object], Dict[str, object]]:
    """Etapa 6 (sección 7): clasifica cada identificador — función/constante
    permitida se usa tal cual; el resto se registra como `sympy.Symbol` en
    un `local_dict` explícito.

    Devuelve `(local_dict, funciones_y_constantes_usadas)`. Registrar
    SIEMPRE cada identificador en `local_dict` (incluso los no reconocidos,
    como `sympy.Symbol`) es también lo que hace que `y(x+1)` se interprete
    como multiplicación implícita y no como una llamada a función no
    reconocida (sección 3, "sin(x) como función vs. y(x+1)"): `y` nunca
    resuelve a un objeto invocable si no está en `ALLOWED_FUNCTIONS`.
    """
    local_dict: Dict[str, object] = {}
    used: Dict[str, object] = {}
    for name in identifiers:
        if name in ALLOWED_FUNCTIONS:
            local_dict[name] = ALLOWED_FUNCTIONS[name]
            used[name] = ALLOWED_FUNCTIONS[name]
        elif name in ALLOWED_CONSTANTS:
            local_dict[name] = ALLOWED_CONSTANTS[name]
            used[name] = ALLOWED_CONSTANTS[name]
        else:
            local_dict[name] = Symbol(name)
    return local_dict, used


def build_minimal_global_dict() -> Dict[str, object]:
    """Etapa 7, parte 1 (sección 7): `global_dict_minimo` — únicamente las
    primitivas de SymPy estrictamente necesarias para
    `standard_transformations + (implicit_multiplication_application,
    convert_xor)`. Nunca builtins de Python, nunca vacío.

    `"__builtins__": {}` es una defensa adicional DEDUCIBLE (no nombrada
    explícitamente por la spec, pero implícita en "nunca builtins de
    Python"): si no se fija explícitamente, `eval()` inyecta los builtins
    reales de Python en cualquier diccionario de globals que no los
    contenga — este es exactamente el vector que la sección 7 pide cerrar.

    Fix (suite de regresión, caso E030 "5!"): `standard_transformations`
    incluye `factorial_notation` por defecto en SymPy, que reescribe `n!`
    como una llamada a `factorial(n)` — pero como el token que el usuario
    escribe es `!`, no la palabra "factorial", `classify_identifiers()`
    nunca lo ve para registrarlo en `local_dict`. Sin `factorial` acá,
    cualquier "!" tiraba `NameError: name 'factorial' is not defined`
    pese a que un comentario más abajo decía que ya funcionaba. Es la
    misma primitiva-de-transformación que Symbol/Integer/Add/Mul/Pow, así
    que va en este diccionario mínimo, no en ALLOWED_FUNCTIONS (que es
    para identificadores que SÍ aparecen como texto en la expresión).
    """
    return {
        "Symbol": Symbol,
        "Integer": Integer,
        "Float": Float,
        "Add": Add,
        "Mul": Mul,
        "Pow": Pow,
        "factorial": factorial,
        "__builtins__": {},
    }


_TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)


def _parse_side(side_text: str, local_dict: Dict[str, object]) -> sympy.Expr:
    from app.services import ast_validator  # import diferido: evita ciclo con parsing.py

    global_dict = build_minimal_global_dict()
    try:
        with warnings.catch_warnings():
            # Suprime el SymPyDeprecationWarning de "Tuple dentro de Mul"
            # que SymPy emite al construir (no al evaluar) expresiones como
            # "foo()"/"Integral(x,x)" — ya se capturan como
            # ParseSecurityError vía BLOCKED_NODE_TYPES en
            # ast_validator.validate_ast_safety, este warning es ruido.
            warnings.simplefilter("ignore")
            expr = parse_expr(
                side_text,
                local_dict=local_dict,
                global_dict=global_dict,
                evaluate=False,
                transformations=_TRANSFORMATIONS,
            )
    except ParseSecurityError:
        raise
    except Exception as exc:
        raise ParseSecurityError(f"No se pudo interpretar la expresión: {exc}") from exc

    ast_validator.validate_ast_safety(expr)
    ast_validator.check_complexity_limits(expr)
    return expr


def parse_expression_tree(text: str, *, allow_equation: bool = False) -> sympy.Basic:
    """Etapa 7, parte 2 (sección 7): orquesta las etapas 1-9.

    Devuelve un `sympy.Expr` si `allow_equation=False`, o un `sympy.Eq` si
    `allow_equation=True` (lado derecho implícito `0` si no había `=`,
    sección 3: "sin `=` -> se asume `= 0`").
    """
    validate_length(text)
    normalized = normalize_unicode(text)

    if allow_equation:
        lhs_text, rhs_text = split_equation(normalized)
        validate_length(lhs_text)
        if rhs_text is None:
            rhs_text = "0"
        else:
            validate_length(rhs_text)
    else:
        if "=" in normalized:
            # No explícito en la spec para endpoints no-`solve` — decisión
            # DEDUCIBLE: un '=' fuera de `solve` no tiene interpretación
            # válida como expresión (sección 7, etapa 3, "solo solve").
            raise ParseSecurityError(
                "No se esperaba '=' en una expresión (solo 'solve' admite ecuaciones)."
            )
        lhs_text, rhs_text = normalized, None

    _validate_call_arity(normalized)

    sides = [lhs_text] if rhs_text is None else [lhs_text, rhs_text]
    for side in sides:
        validate_decimal_and_reject_scientific(side)

    all_identifiers: List[str] = []
    for side in sides:
        for identifier in extract_candidate_identifiers(side):
            if identifier not in all_identifiers:
                all_identifiers.append(identifier)

    local_dict, _used = classify_identifiers(all_identifiers)

    lhs_expr = _parse_side(lhs_text, local_dict)
    if not allow_equation:
        return lhs_expr

    rhs_expr = _parse_side(rhs_text, local_dict)
    return sympy.Eq(lhs_expr, rhs_expr)


_INEQUALITY_OPERATORS = ["<=", ">=", "<", ">"]  # orden importa: <= antes que <


def parse_inequality_tree(text: str) -> sympy.core.relational.Relational:
    """`/inequality` (spec, `InequalityRequest`). Reutiliza toda la
    infraestructura de seguridad de `parse_expression_tree` (etapas 1-9):
    solo cambia qué operador separa los dos lados (`<,>,<=,>=` en vez de
    `=`) y qué tipo de `Relational` de SymPy se construye al final."""
    validate_length(text)
    normalized = normalize_unicode(text)

    found_operator = None
    for operator in _INEQUALITY_OPERATORS:
        if operator in normalized:
            found_operator = operator
            break
    if found_operator is None:
        raise ParseSecurityError(
            "Se esperaba un operador de desigualdad (<, >, <=, >=) en la expresión."
        )
    if normalized.count(found_operator) > 1:
        raise ParseSecurityError(
            f"Se permite un único operador de desigualdad ('{found_operator}')."
        )

    idx = normalized.index(found_operator)
    lhs_text = normalized[:idx]
    rhs_text = normalized[idx + len(found_operator) :]
    validate_length(lhs_text)
    validate_length(rhs_text)

    _validate_call_arity(normalized)

    for side in (lhs_text, rhs_text):
        validate_decimal_and_reject_scientific(side)

    all_identifiers: List[str] = []
    for side in (lhs_text, rhs_text):
        for identifier in extract_candidate_identifiers(side):
            if identifier not in all_identifiers:
                all_identifiers.append(identifier)

    local_dict, _used = classify_identifiers(all_identifiers)
    lhs_expr = _parse_side(lhs_text, local_dict)
    rhs_expr = _parse_side(rhs_text, local_dict)

    relational_by_operator = {
        "<": sympy.Lt,
        ">": sympy.Gt,
        "<=": sympy.Le,
        ">=": sympy.Ge,
    }
    return relational_by_operator[found_operator](lhs_expr, rhs_expr)
