/**
 * components/UnitsMode.tsx — P7 (spec v2 §8): formulario simple, NO usa
 * NaturalMathField/NaturalMathKeyboard ni llama al backend (100%
 * frontend, decisión confirmada explícita de la spec).
 */

import { useMemo, useState } from "react";
import { CATEGORY_LABELS, UNITS, convert, type UnitCategory } from "../utils/unitConversion";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as UnitCategory[];

export function UnitsMode() {
  const [category, setCategory] = useState<UnitCategory>("length");
  const unitKeys = useMemo(() => Object.keys(UNITS[category]), [category]);
  const [fromUnit, setFromUnit] = useState(unitKeys[0]);
  const [toUnit, setToUnit] = useState(unitKeys[1] ?? unitKeys[0]);
  const [valueStr, setValueStr] = useState("1");

  function handleCategoryChange(next: UnitCategory) {
    setCategory(next);
    const keys = Object.keys(UNITS[next]);
    setFromUnit(keys[0]);
    setToUnit(keys[1] ?? keys[0]);
  }

  const value = Number(valueStr);
  const result = useMemo(() => {
    if (!Number.isFinite(value)) return null;
    try {
      return convert(category, value, fromUnit, toUnit);
    } catch {
      return null;
    }
  }, [category, value, fromUnit, toUnit]);

  const selectClass = "w-full rounded border border-paper-line bg-paper-soft px-3 py-2 text-sm text-ink";
  const labelClass = "mb-1 block text-xs uppercase tracking-wide text-muted";

  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-lg border border-paper-line bg-paper-soft p-5 shadow-sm lg:max-w-xl dt:max-w-2xl">
      <div>
        <label className={labelClass} htmlFor="units-category">Categoría</label>
        <select
          id="units-category"
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value as UnitCategory)}
          className={selectClass}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="units-from">De</label>
          <select id="units-from" value={fromUnit} onChange={(e) => setFromUnit(e.target.value)} className={selectClass}>
            {unitKeys.map((k) => (
              <option key={k} value={k}>
                {UNITS[category][k].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="units-to">A</label>
          <select id="units-to" value={toUnit} onChange={(e) => setToUnit(e.target.value)} className={selectClass}>
            {unitKeys.map((k) => (
              <option key={k} value={k}>
                {UNITS[category][k].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="units-value">Valor</label>
        <input
          id="units-value"
          type="text"
          inputMode="decimal"
          value={valueStr}
          onChange={(e) => setValueStr(e.target.value)}
          className={selectClass}
        />
      </div>

      <div className="rounded-xl bg-paper px-4 py-3 shadow-inner shadow-black/10">
        {result === null ? (
          <p className="text-sm text-muted">Ingresa un valor numérico válido.</p>
        ) : (
          <p className="text-lg font-medium text-ink">
            {Number(result.toPrecision(10))} <span className="text-sm text-muted">{UNITS[category][toUnit].label}</span>
          </p>
        )}
      </div>
    </div>
  );
}
