/**
 * Internal standard unit representing integer dots in 1/360 inch.
 */
export type Dot360 = number;

/**
 * Standard resolution in dots per inch (1/360 inch).
 */
export const DOTS_PER_INCH = 360;

/**
 * Standard millimeters per inch.
 */
export const MM_PER_INCH = 25.4;

/**
 * Rounds a dot value to the nearest integer and normalizes `-0` to `0`.
 *
 * @param value - Raw dot value to round.
 * @returns Rounded integer length in {@link Dot360}.
 * @throws {@link RangeError} If `value` is not a finite number.
 */
function roundDot(value: number): Dot360 {
  if (!Number.isFinite(value)) {
    throw new RangeError("Value must be a finite number.");
  }
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Converts millimeters to {@link Dot360} (rounded to the nearest integer).
 *
 * @param value - Length in millimeters.
 * @returns Equivalent length in {@link Dot360}.
 * @throws {@link RangeError} If `value` is not a finite number.
 */
export function mm(value: number): Dot360 {
  return roundDot((value / MM_PER_INCH) * DOTS_PER_INCH);
}

/**
 * Converts inches to {@link Dot360} (rounded to the nearest integer).
 *
 * @param value - Length in inches.
 * @returns Equivalent length in {@link Dot360}.
 * @throws {@link RangeError} If `value` is not a finite number.
 */
export function inch(value: number): Dot360 {
  return roundDot(value * DOTS_PER_INCH);
}

/**
 * Converts 1/180 inch dots to {@link Dot360} (rounded to the nearest integer).
 *
 * @param value - Dot count in 1/180 inch resolution.
 * @returns Equivalent length in {@link Dot360}.
 * @throws {@link RangeError} If `value` is not a finite number.
 */
export function dot180(value: number): Dot360 {
  return roundDot(value * 2);
}

/**
 * Converts 1/360 inch dots to {@link Dot360} (rounded to the nearest integer).
 *
 * @param value - Dot count in 1/360 inch resolution.
 * @returns Rounded integer length in {@link Dot360}.
 * @throws {@link RangeError} If `value` is not a finite number.
 */
export function dot360(value: number): Dot360 {
  return roundDot(value);
}

/**
 * Converts character column count to {@link Dot360} based on characters per inch (CPI).
 *
 * @param columns - Number of half-width (ANK) character columns.
 * @param cpi - Characters per inch (e.g., `10`, `12`, `15`, `20`). Defaults to `10`.
 * @returns Equivalent width in {@link Dot360}.
 * @throws {@link RangeError} If `columns` is not finite or `cpi` is not a finite positive number.
 */
export function col(columns: number, cpi: number = 10): Dot360 {
  if (!Number.isFinite(cpi) || cpi <= 0) {
    throw new RangeError("Characters per inch (CPI) must be a finite positive number.");
  }
  return roundDot((columns / cpi) * DOTS_PER_INCH);
}

/**
 * Converts line count to {@link Dot360} based on lines per inch (LPI).
 *
 * @param lines - Number of lines.
 * @param lpi - Lines per inch (e.g., `6`, `8`, `5`, `7.5`). Defaults to `6`.
 * @returns Equivalent height in {@link Dot360}.
 * @throws {@link RangeError} If `lines` is not finite or `lpi` is not a finite positive number.
 */
export function line(lines: number, lpi: number = 6): Dot360 {
  if (!Number.isFinite(lpi) || lpi <= 0) {
    throw new RangeError("Lines per inch (LPI) must be a finite positive number.");
  }
  return roundDot((lines / lpi) * DOTS_PER_INCH);
}

/**
 * Converts {@link Dot360} back to millimeters.
 *
 * @param dots - Length in {@link Dot360}.
 * @returns Equivalent length in millimeters.
 * @throws {@link RangeError} If `dots` is not a finite number.
 */
export function toMm(dots: Dot360): number {
  if (!Number.isFinite(dots)) {
    throw new RangeError("Dots must be a finite number.");
  }
  return (dots / DOTS_PER_INCH) * MM_PER_INCH;
}

/**
 * Converts {@link Dot360} back to inches.
 *
 * @param dots - Length in {@link Dot360}.
 * @returns Equivalent length in inches.
 * @throws {@link RangeError} If `dots` is not a finite number.
 */
export function toInch(dots: Dot360): number {
  if (!Number.isFinite(dots)) {
    throw new RangeError("Dots must be a finite number.");
  }
  return dots / DOTS_PER_INCH;
}
