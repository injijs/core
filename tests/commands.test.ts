import { describe, expect, test } from "vite-plus/test";
import {
  cmdBold,
  cmdCarriageReturn,
  cmdCpi,
  cmdFeedY,
  cmdFormFeed,
  cmdInit,
  cmdKanjiMode,
  cmdMoveX,
  cmdScale,
  cmdUnderline,
} from "../src/commands.ts";
import { dot180 } from "../src/units.ts";

describe("commands", () => {
  test("cmdInit: returns ESC @ [0x1b, 0x40]", () => {
    expect(cmdInit()).toEqual(new Uint8Array([0x1b, 0x40]));
  });

  test("cmdKanjiMode: returns FS & when enabled and FS . when disabled", () => {
    expect(cmdKanjiMode(true)).toEqual(new Uint8Array([0x1c, 0x26]));
    expect(cmdKanjiMode(false)).toEqual(new Uint8Array([0x1c, 0x2e]));
  });

  test("cmdCpi: returns ESC P for 10 CPI, ESC M for 12 CPI, and ESC g for 15 CPI", () => {
    expect(cmdCpi(10)).toEqual(new Uint8Array([0x1b, 0x50]));
    expect(cmdCpi(12)).toEqual(new Uint8Array([0x1b, 0x4d]));
    expect(cmdCpi(15)).toEqual(new Uint8Array([0x1b, 0x67]));
  });

  test("cmdCpi: throws RangeError for invalid CPI values at runtime", () => {
    // @ts-expect-error Testing runtime validation for invalid CPI
    expect(() => cmdCpi(11)).toThrow(RangeError);
    // @ts-expect-error Testing runtime validation for invalid CPI
    expect(() => cmdCpi(13)).toThrow(RangeError);
  });

  test("cmdBold: returns ESC E when enabled and ESC F when disabled", () => {
    expect(cmdBold(true)).toEqual(new Uint8Array([0x1b, 0x45]));
    expect(cmdBold(false)).toEqual(new Uint8Array([0x1b, 0x46]));
  });

  test("cmdUnderline: returns ESC - n and FS - n for ANK and Kanji", () => {
    expect(cmdUnderline(true)).toEqual(new Uint8Array([0x1b, 0x2d, 1, 0x1c, 0x2d, 1]));
    expect(cmdUnderline(false)).toEqual(new Uint8Array([0x1b, 0x2d, 0, 0x1c, 0x2d, 0]));
  });

  test("cmdScale: returns ESC W w, ESC w h, and FS V h", () => {
    expect(cmdScale(false, false)).toEqual(
      new Uint8Array([0x1b, 0x57, 0, 0x1b, 0x77, 0, 0x1c, 0x56, 0]),
    );
    expect(cmdScale(true, false)).toEqual(
      new Uint8Array([0x1b, 0x57, 1, 0x1b, 0x77, 0, 0x1c, 0x56, 0]),
    );
    expect(cmdScale(false, true)).toEqual(
      new Uint8Array([0x1b, 0x57, 0, 0x1b, 0x77, 1, 0x1c, 0x56, 1]),
    );
    expect(cmdScale(true, true)).toEqual(
      new Uint8Array([0x1b, 0x57, 1, 0x1b, 0x77, 1, 0x1c, 0x56, 1]),
    );
  });

  test("cmdCarriageReturn and cmdFormFeed: return CR [0x0d] and FF [0x0c]", () => {
    expect(cmdCarriageReturn()).toEqual(new Uint8Array([0x0d]));
    expect(cmdFormFeed()).toEqual(new Uint8Array([0x0c]));
  });

  test("cmdMoveX: uses only ESC $ when divisible by 1/60 inch (6 Dot360)", () => {
    // 0 dots -> coarse = 0, fine = 0
    expect(cmdMoveX(0)).toEqual(new Uint8Array([0x1b, 0x24, 0x00, 0x00]));
    // 360 Dot360 (1 inch) -> 180 dots180 -> coarse = 60 (0x3c), fine = 0
    expect(cmdMoveX(360)).toEqual(new Uint8Array([0x1b, 0x24, 0x3c, 0x00]));
    // Large coordinate where coarse >= 256: 300 * 6 Dot360 = 1800 Dot360 -> coarse = 300 (0x012c -> nL=0x2c, nH=0x01)
    expect(cmdMoveX(1800)).toEqual(new Uint8Array([0x1b, 0x24, 0x2c, 0x01]));
  });

  test("cmdMoveX: appends ESC \\ when a 1/180 inch remainder (1 or 2 dots) exists", () => {
    // dot180(1) = 2 Dot360 -> coarse = 0, fine = 1
    expect(cmdMoveX(dot180(1))).toEqual(
      new Uint8Array([0x1b, 0x24, 0x00, 0x00, 0x1b, 0x5c, 0x01, 0x00]),
    );
    // dot180(5) = 10 Dot360 -> coarse = 1 (3 dots180), fine = 2
    expect(cmdMoveX(dot180(5))).toEqual(
      new Uint8Array([0x1b, 0x24, 0x01, 0x00, 0x1b, 0x5c, 0x02, 0x00]),
    );
  });

  test("cmdMoveX: throws RangeError for negative or non-finite values", () => {
    expect(() => cmdMoveX(-1)).toThrow(RangeError);
    expect(() => cmdMoveX(Number.NaN)).toThrow(RangeError);
    expect(() => cmdMoveX(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  test("cmdFeedY: returns empty Uint8Array when deltaY rounds to 0 dots180", () => {
    expect(cmdFeedY(0)).toEqual(new Uint8Array([]));
  });

  test("cmdFeedY: returns single ESC J n for feeds <= 255 (1/180 inch)", () => {
    // dot180(60) = 120 Dot360 -> 60 dots180 (0x3c)
    expect(cmdFeedY(dot180(60))).toEqual(new Uint8Array([0x1b, 0x4a, 60]));
    // dot180(255) -> 255 dots180 (0xff)
    expect(cmdFeedY(dot180(255))).toEqual(new Uint8Array([0x1b, 0x4a, 255]));
  });

  test("cmdFeedY: splits feeds > 255 (1/180 inch) into multiple ESC J commands", () => {
    // dot180(300) -> 255 + 45
    expect(cmdFeedY(dot180(300))).toEqual(new Uint8Array([0x1b, 0x4a, 255, 0x1b, 0x4a, 45]));
    // dot180(520) -> 255 + 255 + 10
    expect(cmdFeedY(dot180(520))).toEqual(
      new Uint8Array([0x1b, 0x4a, 255, 0x1b, 0x4a, 255, 0x1b, 0x4a, 10]),
    );
  });

  test("cmdFeedY: throws RangeError for negative or non-finite values", () => {
    expect(() => cmdFeedY(-2)).toThrow(RangeError);
    expect(() => cmdFeedY(Number.NaN)).toThrow(RangeError);
    expect(() => cmdFeedY(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
