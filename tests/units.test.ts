import { describe, expect, test } from "vite-plus/test";
import {
  DOTS_PER_INCH,
  MM_PER_INCH,
  col,
  dot180,
  dot360,
  inch,
  line,
  mm,
  toInch,
  toMm,
} from "../src/units.ts";

describe("units", () => {
  test("exports standard constants", () => {
    expect(DOTS_PER_INCH).toBe(360);
    expect(MM_PER_INCH).toBe(25.4);
  });

  test("inch: converts inches to Dot360", () => {
    expect(inch(0)).toBe(0);
    expect(inch(1)).toBe(360);
    expect(inch(0.5)).toBe(180);
    expect(inch(2.5)).toBe(900);
  });

  test("mm: converts millimeters to Dot360 with rounding", () => {
    expect(mm(0)).toBe(0);
    expect(mm(25.4)).toBe(360);
    expect(mm(12.7)).toBe(180);
    // (10 / 25.4) * 360 = 141.732... -> 142
    expect(mm(10)).toBe(142);
  });

  test("dot180: converts 1/180 inch dots to Dot360", () => {
    expect(dot180(0)).toBe(0);
    expect(dot180(1)).toBe(2);
    expect(dot180(180)).toBe(360);
    expect(dot180(1.4)).toBe(3);
  });

  test("dot360: rounds 1/360 inch dots to integer Dot360", () => {
    expect(dot360(0)).toBe(0);
    expect(dot360(360)).toBe(360);
    expect(dot360(10.4)).toBe(10);
    expect(dot360(10.5)).toBe(11);
  });

  test("col: converts character columns to Dot360 based on CPI", () => {
    // Default: 10 CPI (36 dots per column)
    expect(col(1)).toBe(36);
    expect(col(10)).toBe(360);
    // Explicit 10 CPI
    expect(col(5, 10)).toBe(180);
    // 12 CPI (30 dots per column)
    expect(col(1, 12)).toBe(30);
    expect(col(12, 12)).toBe(360);
    // 15 CPI (24 dots per column)
    expect(col(1, 15)).toBe(24);
    expect(col(15, 15)).toBe(360);
    // Custom CPI (e.g., 20 CPI condensed = 18 dots per column)
    expect(col(1, 20)).toBe(18);
  });

  test("line: converts line count to Dot360 based on LPI", () => {
    // Default: 6 LPI (60 dots per line)
    expect(line(1)).toBe(60);
    expect(line(6)).toBe(360);
    // Explicit 6 LPI
    expect(line(3, 6)).toBe(180);
    // 8 LPI (45 dots per line)
    expect(line(1, 8)).toBe(45);
    expect(line(8, 8)).toBe(360);
    // Custom LPI for dedicated forms (e.g., 5 LPI = 72 dots, 7.5 LPI = 48 dots)
    expect(line(1, 5)).toBe(72);
    expect(line(1, 7.5)).toBe(48);
  });

  test("toMm and toInch: converts Dot360 back to millimeters and inches", () => {
    expect(toMm(0)).toBe(0);
    expect(toMm(360)).toBe(25.4);
    expect(toMm(180)).toBe(12.7);
    expect(toMm(-360)).toBe(-25.4);
    expect(toMm(142)).toBeCloseTo(10.0189, 3);

    expect(toInch(0)).toBe(0);
    expect(toInch(360)).toBe(1);
    expect(toInch(180)).toBe(0.5);
    expect(toInch(-180)).toBe(-0.5);
  });

  test("handles negative values for origin offset adjustments without returning -0", () => {
    expect(mm(-25.4)).toBe(-360);
    expect(mm(-10)).toBe(-142);
    expect(inch(-0.5)).toBe(-180);
    expect(dot180(-10)).toBe(-20);
    expect(dot360(-0.1)).toBe(0); // Avoids -0
  });

  test("throws RangeError when cpi or lpi is 0, negative, or non-finite", () => {
    expect(() => col(1, 0)).toThrow(RangeError);
    expect(() => col(1, -10)).toThrow(RangeError);
    expect(() => col(1, Number.NaN)).toThrow(RangeError);
    expect(() => col(1, Number.POSITIVE_INFINITY)).toThrow(RangeError);

    expect(() => line(1, 0)).toThrow(RangeError);
    expect(() => line(1, -6)).toThrow(RangeError);
    expect(() => line(1, Number.NaN)).toThrow(RangeError);
    expect(() => line(1, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  test("throws RangeError when input value is NaN or Infinity", () => {
    for (const fn of [mm, inch, dot180, dot360, col, line, toMm, toInch]) {
      expect(() => fn(Number.NaN)).toThrow(RangeError);
      expect(() => fn(Number.POSITIVE_INFINITY)).toThrow(RangeError);
      expect(() => fn(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
    }
  });
});
