import { describe, it, expect } from "vitest";
import { convert } from "../utils/unitConversion";

// Módulo O0 (spec_graficacion_matrices_estadistica_unidades.md, sección
// 8): almacenamiento digital, presión, energía, potencia, fuerza.
// unitConversion.ts no tenía ningún test en ninguno de los dos repos
// (confirmado buscando antes de escribir este archivo) — se agrega O0 y,
// como regresión real, las 7 categorías existentes también.
// Este archivo es deliberadamente equivalente al de precision-lab-lite
// (tests/unitConversion.test.ts) — mismos casos, mismos valores
// esperados, porque unitConversion.ts es byte-idéntico entre ambos
// repos (confirmado con diff vacío en el cierre del módulo).

describe("O0: almacenamiento digital (base 1000, decisión explícita registrada en el archivo)", () => {
  it("1000 bytes = 1 KB", () => {
    expect(convert("storage", 1000, "byte", "kb")).toBeCloseTo(1, 9);
  });

  it("1 MB = 1000 KB", () => {
    expect(convert("storage", 1, "mb", "kb")).toBeCloseTo(1000, 9);
  });

  it("1 byte = 8 bits", () => {
    expect(convert("storage", 1, "byte", "bit")).toBeCloseTo(8, 9);
  });

  it("1 GB = 1000 MB = 1_000_000 KB", () => {
    expect(convert("storage", 1, "gb", "mb")).toBeCloseTo(1000, 9);
    expect(convert("storage", 1, "gb", "kb")).toBeCloseTo(1_000_000, 9);
  });

  it("1 TB = 1000 GB", () => {
    expect(convert("storage", 1, "tb", "gb")).toBeCloseTo(1000, 9);
  });
});

describe("O0: presión", () => {
  it("1 atm = 101325 Pa (valor conocido/estándar)", () => {
    expect(convert("pressure", 1, "atm", "pa")).toBeCloseTo(101325, 6);
  });

  it("1 bar = 100000 Pa", () => {
    expect(convert("pressure", 1, "bar", "pa")).toBeCloseTo(100000, 6);
  });

  it("1 atm ≈ 14.6959 psi (valor conocido)", () => {
    expect(convert("pressure", 1, "atm", "psi")).toBeCloseTo(14.6959, 3);
  });
});

describe("O0: energía", () => {
  it("1 cal = 4.184 J (valor conocido)", () => {
    expect(convert("energy", 1, "cal", "j")).toBeCloseTo(4.184, 9);
  });

  it("1 kWh = 3,600,000 J (valor conocido)", () => {
    expect(convert("energy", 1, "kwh", "j")).toBeCloseTo(3_600_000, 6);
  });

  it("1 BTU ≈ 1055.06 J (valor conocido)", () => {
    expect(convert("energy", 1, "btu", "j")).toBeCloseTo(1055.06, 1);
  });
});

describe("O0: potencia", () => {
  it("1 kW = 1000 W", () => {
    expect(convert("power", 1, "kw", "w")).toBeCloseTo(1000, 9);
  });

  it("1 hp ≈ 745.7 W (valor conocido)", () => {
    expect(convert("power", 1, "hp", "w")).toBeCloseTo(745.7, 1);
  });
});

describe("O0: fuerza", () => {
  it("1 lbf ≈ 4.4482 N (valor conocido)", () => {
    expect(convert("force", 1, "lbf", "n")).toBeCloseTo(4.4482, 4);
  });

  it("1 kgf ≈ 9.80665 N (valor conocido, = g estándar)", () => {
    expect(convert("force", 1, "kgf", "n")).toBeCloseTo(9.80665, 5);
  });
});

// Regresión: las 7 categorías existentes no cambian sus factores.
describe("regresión: categorías existentes tras O0", () => {
  it("longitud: 1 km = 1000 m", () => {
    expect(convert("length", 1, "km", "m")).toBeCloseTo(1000, 9);
  });

  it("masa: 1 kg = 1000 g", () => {
    expect(convert("mass", 1, "kg", "g")).toBeCloseTo(1000, 9);
  });

  it("temperatura: 0°C = 32°F (fórmula explícita, no tabla de factores)", () => {
    expect(convert("temperature", 0, "c", "f")).toBeCloseTo(32, 9);
  });

  it("tiempo: 1 h = 3600 s", () => {
    expect(convert("time", 1, "h", "s")).toBeCloseTo(3600, 9);
  });

  it("área: 1 ha = 10000 m²", () => {
    expect(convert("area", 1, "ha", "m2")).toBeCloseTo(10000, 9);
  });

  it("volumen: 1 m³ = 1000 L", () => {
    expect(convert("volume", 1, "m3", "l")).toBeCloseTo(1000, 9);
  });

  it("velocidad: 36 km/h = 10 m/s", () => {
    expect(convert("speed", 36, "kmh", "mps")).toBeCloseTo(10, 9);
  });
});
