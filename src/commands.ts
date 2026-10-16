import type { Dot360 } from "./units.ts";

/**
 * Generates the printer initialization command (`ESC @`).
 * Clears the print buffer and resets printer settings to default.
 *
 * @returns Byte sequence `[0x1b, 0x40]`.
 */
export function cmdInit(): Uint8Array {
  return new Uint8Array([0x1b, 0x40]);
}

/**
 * Generates the Kanji mode toggle command (`FS &` or `FS .`).
 *
 * @param enable - `true` to enter JIS 2-byte Kanji mode (`FS &`), `false` to return to ANK mode (`FS .`).
 * @returns Byte sequence `[0x1c, 0x26]` when enabled, or `[0x1c, 0x2e]` when disabled.
 */
export function cmdKanjiMode(enable: boolean): Uint8Array {
  return new Uint8Array([0x1c, enable ? 0x26 : 0x2e]);
}

/**
 * Generates the character pitch selection command (`ESC P` for 10 CPI, `ESC M` for 12 CPI, `ESC g` for 15 CPI).
 *
 * @param cpi - Characters per inch (`10` for Pica, `12` for Elite, `15` for Semi-condensed).
 * @returns Byte sequence `[0x1b, 0x50]` for 10 CPI, `[0x1b, 0x4d]` for 12 CPI, or `[0x1b, 0x67]` for 15 CPI.
 * @throws {@link RangeError} If `cpi` is not `10`, `12`, or `15`.
 */
export function cmdCpi(cpi: 10 | 12 | 15): Uint8Array {
  switch (cpi) {
    case 10:
      return new Uint8Array([0x1b, 0x50]);
    case 12:
      return new Uint8Array([0x1b, 0x4d]);
    case 15:
      return new Uint8Array([0x1b, 0x67]);
    default:
      throw new RangeError("CPI must be 10, 12, or 15.");
  }
}

/**
 * Generates the bold (emphasized) printing toggle command (`ESC E` or `ESC F`).
 *
 * @param enable - `true` to enable bold printing (`ESC E`), `false` to disable (`ESC F`).
 * @returns Byte sequence `[0x1b, 0x45]` when enabled, or `[0x1b, 0x46]` when disabled.
 */
export function cmdBold(enable: boolean): Uint8Array {
  return new Uint8Array([0x1b, enable ? 0x45 : 0x46]);
}

/**
 * Generates the underline toggle command for both ANK (`ESC - n`) and Kanji (`FS - n`).
 *
 * @param enable - `true` to enable underline (`n = 1`), `false` to disable (`n = 0`).
 * @returns Combined 6-byte sequence `[0x1b, 0x2d, n, 0x1c, 0x2d, n]`.
 */
export function cmdUnderline(enable: boolean): Uint8Array {
  const n = enable ? 1 : 0;
  return new Uint8Array([0x1b, 0x2d, n, 0x1c, 0x2d, n]);
}

/**
 * Generates the character scaling command for horizontal (`ESC W n`) and vertical (`ESC w n` / `FS V n`) enlargement.
 *
 * @param doubleWidth - `true` for 2x horizontal width (`w = 1`), `false` for normal width (`w = 0`).
 * @param doubleHeight - `true` for 2x vertical height (`h = 1`), `false` for normal height (`h = 0`).
 * @returns Combined 9-byte sequence `[0x1b, 0x57, w, 0x1b, 0x77, h, 0x1c, 0x56, h]`.
 */
export function cmdScale(doubleWidth: boolean, doubleHeight: boolean): Uint8Array {
  const w = doubleWidth ? 1 : 0;
  const h = doubleHeight ? 1 : 0;
  return new Uint8Array([0x1b, 0x57, w, 0x1b, 0x77, h, 0x1c, 0x56, h]);
}

/**
 * Generates the carriage return command (`CR`).
 * Returns the print head to the left margin (`X = 0`).
 *
 * @returns Byte sequence `[0x0d]`.
 */
export function cmdCarriageReturn(): Uint8Array {
  return new Uint8Array([0x0d]);
}

/**
 * Generates the form feed command (`FF`).
 * Ejects the current page/form.
 *
 * @returns Byte sequence `[0x0c]`.
 */
export function cmdFormFeed(): Uint8Array {
  return new Uint8Array([0x0c]);
}

/**
 * Generates the horizontal absolute positioning command (`ESC $ nL nH`),
 * combined with relative micro-adjustment (`ESC \ fL fH`) when a 1/180 inch remainder exists.
 *
 * @param targetX - Target horizontal coordinate from the left margin in {@link Dot360}.
 * @returns Byte sequence for horizontal positioning.
 * @throws {@link RangeError} If `targetX` is not a finite non-negative number.
 */
export function cmdMoveX(targetX: Dot360): Uint8Array {
  if (!Number.isFinite(targetX) || targetX < 0) {
    throw new RangeError("Target X coordinate must be a finite non-negative number.");
  }

  const dots180 = Math.round(targetX / 2); // Convert Dot360 to Dot180
  const coarse = Math.floor(dots180 / 3); // Coarse positioning in 1/60 inch (3 dots180)
  const fine = dots180 % 3; // Fine adjustment in 1/180 inch

  const nL = coarse & 0xff;
  const nH = (coarse >> 8) & 0xff;
  if (fine === 0) {
    return new Uint8Array([0x1b, 0x24, nL, nH]);
  }
  return new Uint8Array([0x1b, 0x24, nL, nH, 0x1b, 0x5c, fine, 0x00]);
}

/**
 * Generates forward vertical paper feed commands (`ESC J n`) in 1/180 inch increments.
 * Automatically splits feeds exceeding 255 dots (1/180 inch) into multiple `ESC J` commands.
 *
 * @param deltaY - Forward vertical distance to feed in {@link Dot360}.
 * @returns Byte sequence of zero or more `ESC J n` commands.
 * @throws {@link RangeError} If `deltaY` is not a finite non-negative number.
 */
export function cmdFeedY(deltaY: Dot360): Uint8Array {
  if (!Number.isFinite(deltaY) || deltaY < 0) {
    throw new RangeError("Delta Y must be a finite non-negative number.");
  }

  const dots180 = Math.round(deltaY / 2); // Convert Dot360 to Dot180
  if (dots180 === 0) {
    return new Uint8Array([]); // No feed needed
  }

  const commands: number[] = [];
  let remainingDots = dots180;

  while (remainingDots > 0) {
    const feedAmount = Math.min(remainingDots, 255);
    commands.push(0x1b, 0x4a, feedAmount);
    remainingDots -= feedAmount;
  }

  return new Uint8Array(commands);
}
