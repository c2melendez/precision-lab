// unitConversion.ts — P7 (spec v2 §8) + Módulo O0
// (spec_graficacion_matrices_estadistica_unidades.md, sección 8).
// AUDITORÍA DEL MÓDULO O0: este archivo se implementa por separado en
// cada repo (precision-lab-lite: src/engine/unitConversion.ts;
// precision-lab: frontend/src/utils/unitConversion.ts) — código no
// compartido entre repos, pero se mantiene byte-idéntico a propósito
// (confirmado con `diff`, no supuesto) porque no tiene ninguna
// dependencia de motor (SymPy/Algebrite): es aritmética de factores
// pura, igual en ambos. Antes de este módulo, los dos archivos YA
// habían divergido — solo en comentarios, no en factores/lógica
// (confirmado con diff real) — este módulo también corrige esa
// divergencia preexistente además de agregar las categorías nuevas,
// para cumplir el DoD de "diff vacío" del propio módulo.
//
// Temperatura es la única categoría sin factor lineal — fórmulas
// explícitas Celsius/Fahrenheit/Kelvin, sin pasar por la tabla de
// factores.
//
// Almacenamiento digital — DECISIÓN EXPLÍCITA (Módulo O0, no dejarlo
// implícito): base 1000 (bit/byte/KB/MB/GB/TB), NO 1024. Motivo: es la
// única opción consistente con el resto de este archivo — TODOS los
// demás prefijos "kilo-" ya presentes (km=1000 m, kg=1000 g) usan base
// 1000, y mezclar una convención binaria (1024) solo para
// almacenamiento habría sido una inconsistencia interna no justificada
// por la spec. Si se necesita la variante binaria (KiB/MiB/GiB) en el
// futuro, debería ser una categoría/etiqueta aparte, no una
// reinterpretación silenciosa de KB/MB/GB.

export type UnitCategory =
  | "length"
  | "mass"
  | "temperature"
  | "time"
  | "area"
  | "volume"
  | "speed"
  // Módulo O0 (spec_graficacion_matrices_estadistica_unidades.md, sección 8).
  | "storage"
  | "pressure"
  | "energy"
  | "power"
  | "force";

export const CATEGORY_LABELS: Record<UnitCategory, string> = {
  length: "Longitud",
  mass: "Masa",
  temperature: "Temperatura",
  time: "Tiempo",
  area: "Área",
  volume: "Volumen",
  speed: "Velocidad",
  storage: "Almacenamiento digital",
  pressure: "Presión",
  energy: "Energía",
  power: "Potencia",
  force: "Fuerza",
};

interface UnitDef {
  label: string;
  /** Factor multiplicativo respecto a la unidad base de la categoría. No
   * aplica a "temperature" (ver convertTemperature). */
  factor?: number;
}

// Unidad base de cada categoría (factor 1): metros, kilogramos, segundos,
// metros cuadrados, litros, metros/segundo, bytes, pascales, joules,
// watts, newtons.
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
  // Módulo O0 (spec_graficacion_matrices_estadistica_unidades.md, sección
  // 8) — base 1000, ver decisión explícita en la cabecera del archivo.
  storage: {
    bit: { label: "Bits (bit)", factor: 0.125 },
    byte: { label: "Bytes (B)", factor: 1 },
    kb: { label: "Kilobytes (KB)", factor: 1000 },
    mb: { label: "Megabytes (MB)", factor: 1_000_000 },
    gb: { label: "Gigabytes (GB)", factor: 1_000_000_000 },
    tb: { label: "Terabytes (TB)", factor: 1_000_000_000_000 },
  },
  pressure: {
    pa: { label: "Pascales (Pa)", factor: 1 },
    atm: { label: "Atmósferas (atm)", factor: 101325 },
    bar: { label: "Bar", factor: 100000 },
    psi: { label: "Libras por pulgada² (psi)", factor: 6894.757293168361 },
    mmhg: { label: "Milímetros de mercurio (mmHg)", factor: 133.322387415 },
  },
  energy: {
    j: { label: "Julios (J)", factor: 1 },
    cal: { label: "Calorías (cal)", factor: 4.184 },
    kwh: { label: "Kilovatios-hora (kWh)", factor: 3_600_000 },
    btu: { label: "BTU", factor: 1055.05585262 },
  },
  power: {
    w: { label: "Vatios (W)", factor: 1 },
    kw: { label: "Kilovatios (kW)", factor: 1000 },
    hp: { label: "Caballos de fuerza (hp)", factor: 745.6998715822702 },
  },
  force: {
    n: { label: "Newtons (N)", factor: 1 },
    lbf: { label: "Libra-fuerza (lbf)", factor: 4.4482216152605 },
    kgf: { label: "Kilogramo-fuerza (kgf)", factor: 9.80665 },
  },
};

function convertTemperature(value: number, from: string, to: string): number {
  // Paso intermedio siempre por Kelvin — evita 3x2=6 fórmulas cruzadas,
  // solo hacen falta 3 "a Kelvin" + 3 "de Kelvin".
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
