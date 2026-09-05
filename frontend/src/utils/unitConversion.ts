// utils/unitConversion.ts — P7 (spec v2 §8): implementado por separado
// del equivalente en precision-lab-lite (misma spec, mismo criterio de
// categorías/unidades, código no compartido entre repos). Vive en
// frontend/, no en backend/ — decisión confirmada explícita de la spec
// (100% frontend en ambos repos).
//
// Solo las 7 categorías mínimas que pide la spec (Longitud, Masa,
// Temperatura, Tiempo, Área, Volumen, Velocidad) — no se agregó ninguna
// categoría adicional.

export type UnitCategory = "length" | "mass" | "temperature" | "time" | "area" | "volume" | "speed";

export const CATEGORY_LABELS: Record<UnitCategory, string> = {
  length: "Longitud",
  mass: "Masa",
  temperature: "Temperatura",
  time: "Tiempo",
  area: "Área",
  volume: "Volumen",
  speed: "Velocidad",
};

interface UnitDef {
  label: string;
  factor?: number;
}

export const UNITS: Record<UnitCategory, Record<string, UnitDef>> = {
  length: {
    mm: { label: "Milímetros (mm)", factor: 0.001 },
    cm: { label: "Centímetros (cm)", factor: 0.01 },
    m: { label: "Metros (m)", factor: 1 },
    km: { label: "Kilómetros (km)", factor: 1000 },
    in: { label: "Pulgadas (in)", factor: 0.0254 },
    ft: { label: "Pies (ft)", factor: 0.3048 },
    yd: { label: "Yardas (yd)", factor: 0.9144 },
    mi: { label: "Millas (mi)", factor: 1609.344 },
  },
  mass: {
    mg: { label: "Miligramos (mg)", factor: 0.000001 },
    g: { label: "Gramos (g)", factor: 0.001 },
    kg: { label: "Kilogramos (kg)", factor: 1 },
    oz: { label: "Onzas (oz)", factor: 0.028349523125 },
    lb: { label: "Libras (lb)", factor: 0.45359237 },
    ton: { label: "Toneladas métricas (t)", factor: 1000 },
  },
  temperature: {
    c: { label: "Celsius (°C)" },
    f: { label: "Fahrenheit (°F)" },
    k: { label: "Kelvin (K)" },
  },
  time: {
    ms: { label: "Milisegundos (ms)", factor: 0.001 },
    s: { label: "Segundos (s)", factor: 1 },
    min: { label: "Minutos (min)", factor: 60 },
    h: { label: "Horas (h)", factor: 3600 },
    day: { label: "Días", factor: 86400 },
  },
  area: {
    mm2: { label: "Milímetros² (mm²)", factor: 0.000001 },
    cm2: { label: "Centímetros² (cm²)", factor: 0.0001 },
    m2: { label: "Metros² (m²)", factor: 1 },
    km2: { label: "Kilómetros² (km²)", factor: 1_000_000 },
    ha: { label: "Hectáreas (ha)", factor: 10_000 },
    in2: { label: "Pulgadas² (in²)", factor: 0.00064516 },
    ft2: { label: "Pies² (ft²)", factor: 0.09290304 },
    acre: { label: "Acres", factor: 4046.8564224 },
  },
  volume: {
    ml: { label: "Mililitros (mL)", factor: 0.001 },
    l: { label: "Litros (L)", factor: 1 },
    m3: { label: "Metros³ (m³)", factor: 1000 },
    gal: { label: "Galones US (gal)", factor: 3.785411784 },
    ft3: { label: "Pies³ (ft³)", factor: 28.316846592 },
  },
  speed: {
    mps: { label: "Metros/segundo (m/s)", factor: 1 },
    kmh: { label: "Kilómetros/hora (km/h)", factor: 1 / 3.6 },
    mph: { label: "Millas/hora (mph)", factor: 0.44704 },
    knot: { label: "Nudos (kn)", factor: 0.5144444444444445 },
    fps: { label: "Pies/segundo (ft/s)", factor: 0.3048 },
  },
};

function convertTemperature(value: number, from: string, to: string): number {
  let kelvin: number;
  switch (from) {
    case "c":
      kelvin = value + 273.15;
      break;
    case "f":
      kelvin = ((value - 32) * 5) / 9 + 273.15;
      break;
    case "k":
      kelvin = value;
      break;
    default:
      throw new Error(`Unidad de temperatura desconocida: "${from}".`);
  }
  switch (to) {
    case "c":
      return kelvin - 273.15;
    case "f":
      return ((kelvin - 273.15) * 9) / 5 + 32;
    case "k":
      return kelvin;
    default:
      throw new Error(`Unidad de temperatura desconocida: "${to}".`);
  }
}

export function convert(category: UnitCategory, value: number, from: string, to: string): number {
  if (category === "temperature") {
    return convertTemperature(value, from, to);
  }
  const table = UNITS[category];
  const fromDef = table[from];
  const toDef = table[to];
  if (!fromDef || !toDef || fromDef.factor === undefined || toDef.factor === undefined) {
    throw new Error(`Unidad desconocida en la categoría "${category}": "${from}" o "${to}".`);
  }
  const base = value * fromDef.factor;
  return base / toDef.factor;
}
