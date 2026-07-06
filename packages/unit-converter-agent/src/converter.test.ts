import { describe, expect, it } from "bun:test";
import { ConversionError, convertUnits } from "./converter";

describe("convertUnits", () => {
  it("converts km to miles", () => {
    const result = convertUnits(100, "km", "miles");
    expect(result.from).toBe("km");
    expect(result.to).toBe("mi");
    expect(result.result).toBeCloseTo(62.1371192237, 10);
    expect(result.formula.length).toBeGreaterThan(0);
  });

  it("converts lb to kg", () => {
    const result = convertUnits(10, "lb", "kg");
    expect(result.result).toBeCloseTo(4.5359237, 7);
  });

  it("converts temperature C to F", () => {
    const result = convertUnits(0, "C", "F");
    expect(result.result).toBe(32);
  });

  it("converts speed mph to ms", () => {
    const result = convertUnits(60, "mph", "ms");
    expect(result.result).toBeCloseTo(26.8224, 4);
  });

  it("throws for incompatible units", () => {
    expect(() => convertUnits(1, "kg", "km")).toThrow(ConversionError);
  });
});