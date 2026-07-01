export type Dimension = "length" | "weight" | "temperature" | "speed";

export type CanonicalUnit =
  | "km"
  | "mi"
  | "m"
  | "ft"
  | "in"
  | "kg"
  | "lb"
  | "g"
  | "oz"
  | "C"
  | "F"
  | "K"
  | "kmh"
  | "mph"
  | "ms";

type LinearUnit = Exclude<CanonicalUnit, "C" | "F" | "K">;

export interface ConversionResponse {
  value: number;
  from: CanonicalUnit;
  to: CanonicalUnit;
  result: number;
  formula: string;
}

export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionError";
  }
}

const UNIT_ALIASES: Record<string, CanonicalUnit> = {
  km: "km",
  kilometer: "km",
  kilometers: "km",
  kilometre: "km",
  kilometres: "km",

  mi: "mi",
  mile: "mi",
  miles: "mi",

  m: "m",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",

  ft: "ft",
  foot: "ft",
  feet: "ft",

  in: "in",
  inch: "in",
  inches: "in",

  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",

  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",

  g: "g",
  gram: "g",
  grams: "g",

  oz: "oz",
  ounce: "oz",
  ounces: "oz",

  c: "C",
  celsius: "C",
  celcius: "C",

  f: "F",
  fahrenheit: "F",

  k: "K",
  kelvin: "K",

  kmh: "kmh",
  "km/h": "kmh",
  kph: "kmh",

  mph: "mph",
  "mi/h": "mph",

  ms: "ms",
  "m/s": "ms"
};

const UNIT_DIMENSION: Record<CanonicalUnit, Dimension> = {
  km: "length",
  mi: "length",
  m: "length",
  ft: "length",
  in: "length",

  kg: "weight",
  lb: "weight",
  g: "weight",
  oz: "weight",

  C: "temperature",
  F: "temperature",
  K: "temperature",

  kmh: "speed",
  mph: "speed",
  ms: "speed"
};

const LINEAR_FACTORS: Record<LinearUnit, number> = {
  km: 1000,
  mi: 1609.344,
  m: 1,
  ft: 0.3048,
  in: 0.0254,

  kg: 1000,
  lb: 453.59237,
  g: 1,
  oz: 28.349523125,

  kmh: 1000 / 3600,
  mph: 1609.344 / 3600,
  ms: 1
};

function toStableNumber(value: number): number {
  const rounded = Number.parseFloat(value.toFixed(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeUnit(input: string): CanonicalUnit | null {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, "");
  return UNIT_ALIASES[normalized] ?? null;
}

export function getDimension(unit: CanonicalUnit): Dimension {
  return UNIT_DIMENSION[unit];
}

function convertTemperature(value: number, from: "C" | "F" | "K", to: "C" | "F" | "K"): { result: number; formula: string } {
  if (from === to) {
    return { result: value, formula: `${value}` };
  }

  const key = `${from}->${to}`;
  switch (key) {
    case "C->F":
      return { result: value * (9 / 5) + 32, formula: `(${value} × 9/5) + 32` };
    case "F->C":
      return { result: (value - 32) * (5 / 9), formula: `(${value} - 32) × 5/9` };
    case "C->K":
      return { result: value + 273.15, formula: `${value} + 273.15` };
    case "K->C":
      return { result: value - 273.15, formula: `${value} - 273.15` };
    case "F->K":
      return { result: (value - 32) * (5 / 9) + 273.15, formula: `((${value} - 32) × 5/9) + 273.15` };
    case "K->F":
      return { result: (value - 273.15) * (9 / 5) + 32, formula: `((${value} - 273.15) × 9/5) + 32` };
    default:
      throw new ConversionError(`Unsupported temperature conversion: ${from} -> ${to}`);
  }
}

export function convertUnits(value: number, fromInput: string, toInput: string): ConversionResponse {
  if (!Number.isFinite(value)) {
    throw new ConversionError("Query param 'value' must be a finite number.");
  }

  const from = normalizeUnit(fromInput);
  if (!from) {
    throw new ConversionError(`Unsupported 'from' unit: ${fromInput}`);
  }

  const to = normalizeUnit(toInput);
  if (!to) {
    throw new ConversionError(`Unsupported 'to' unit: ${toInput}`);
  }

  const fromDimension = getDimension(from);
  const toDimension = getDimension(to);

  if (fromDimension !== toDimension) {
    throw new ConversionError(`Incompatible unit types: '${from}' (${fromDimension}) -> '${to}' (${toDimension})`);
  }

  if (fromDimension === "temperature") {
    const conversion = convertTemperature(value, from as "C" | "F" | "K", to as "C" | "F" | "K");
    return {
      value,
      from,
      to,
      result: toStableNumber(conversion.result),
      formula: conversion.formula
    };
  }

  const fromLinear = from as LinearUnit;
  const toLinear = to as LinearUnit;
  const fromFactor = LINEAR_FACTORS[fromLinear];
  const toFactor = LINEAR_FACTORS[toLinear];

  const raw = (value * fromFactor) / toFactor;
  const formula = `(${value} × ${fromFactor}) ÷ ${toFactor}`;

  return {
    value,
    from,
    to,
    result: toStableNumber(raw),
    formula
  };
}