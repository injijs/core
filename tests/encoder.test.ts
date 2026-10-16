import { describe, expect, test } from "vite-plus/test";
import {
  JIS_GETA_MARK,
  encodeToJisSegments,
  measureHalfWidth,
  normalizeJapaneseText,
  truncateByHalfWidth,
} from "../src/encoder.ts";

describe("encoder", () => {
  describe("normalizeJapaneseText", () => {
    test("normalizes common Kanji variants (IBM extensions) to standard JIS Kanji", () => {
      expect(normalizeJapaneseText("髙橋")).toBe("高橋");
      expect(normalizeJapaneseText("山﨑")).toBe("山崎");
      expect(normalizeJapaneseText("濵田")).toBe("浜田");
      expect(normalizeJapaneseText("栁澤")).toBe("柳澤");
      expect(normalizeJapaneseText("德川")).toBe("徳川");
    });

    test("normalizes wave dashes and minus/hyphen variants", () => {
      expect(normalizeJapaneseText("10:00〜12:00")).toBe("10:00～12:00");
      expect(normalizeJapaneseText("1−2‐3–4—5")).toBe("1－2－3－4―5");
    });

    test("normalizes enclosed numbers, corporate symbols, units, and era ligatures", () => {
      expect(normalizeJapaneseText("①②⑩")).toBe("(1)(2)(10)");
      expect(normalizeJapaneseText("㈱テスト㈲サンプル㈹")).toBe("(株)テスト(有)サンプル(代)");
      expect(normalizeJapaneseText("№10 ℡ 25㎏ 100㎝ 50㎡")).toBe("No.10 TEL 25kg 100cm 50m2");
      expect(normalizeJapaneseText("㋿8年 ㍻ ㍼")).toBe("令和8年 平成 昭和");
    });

    test("normalizes control characters (tab, CR, LF) into spaces", () => {
      expect(normalizeJapaneseText("A\tB\nC\rD")).toBe("A B C D");
    });

    test("leaves standard ASCII and JIS Kanji unchanged", () => {
      expect(normalizeJapaneseText("ABC 123 東京都千代田区")).toBe("ABC 123 東京都千代田区");
    });
  });

  describe("measureHalfWidth and truncateByHalfWidth", () => {
    test("measureHalfWidth: counts 1 for ANK and 2 for full-width after normalization", () => {
      expect(measureHalfWidth("")).toBe(0);
      expect(measureHalfWidth("ABC123")).toBe(6);
      expect(measureHalfWidth("ｱｲｳ")).toBe(3);
      expect(measureHalfWidth("あいう")).toBe(6);
      // '㈱' normalizes to '(株)' -> '(' (1) + '株' (2) + ')' (1) = 4
      expect(measureHalfWidth("㈱テスト")).toBe(10);
    });

    test("truncateByHalfWidth: truncates safely without splitting a 2-column Kanji", () => {
      // "あいう" = 6 columns; truncating at 5 columns must yield "あい" (4 columns), not corrupt bytes
      expect(truncateByHalfWidth("あいう", 5)).toBe("あい");
      expect(truncateByHalfWidth("あいう", 4)).toBe("あい");
      expect(truncateByHalfWidth("あいう", 0)).toBe("");
      expect(truncateByHalfWidth("AあB", 2)).toBe("A");
      expect(truncateByHalfWidth("AあB", 3)).toBe("Aあ");
    });

    test("truncateByHalfWidth: throws RangeError for negative or non-finite maxHalfWidthCols", () => {
      expect(() => truncateByHalfWidth("ABC", -1)).toThrow(RangeError);
      expect(() => truncateByHalfWidth("ABC", Number.NaN)).toThrow(RangeError);
      expect(() => truncateByHalfWidth("ABC", Number.POSITIVE_INFINITY)).toThrow(RangeError);
    });
  });

  describe("encodeToJisSegments", () => {
    test("returns an empty array for an empty string", () => {
      expect(encodeToJisSegments("")).toEqual([]);
    });

    test("encodes pure ASCII text as a single ANK segment", () => {
      const segments = encodeToJisSegments("ABC 123");
      expect(segments).toEqual([
        {
          isKanji: false,
          bytes: new Uint8Array([0x41, 0x42, 0x43, 0x20, 0x31, 0x32, 0x33]),
          halfWidthCount: 7,
        },
      ]);
    });

    test("encodes half-width Katakana (U+FF61..U+FF9F) as 1-byte ANK (0xA1..0xDF)", () => {
      // 'ｱ' (U+FF71) -> 0xB1, 'ｲ' (U+FF72) -> 0xB2, 'ｳ' (U+FF73) -> 0xB3
      const segments = encodeToJisSegments("ｱｲｳ");
      expect(segments).toEqual([
        {
          isKanji: false,
          bytes: new Uint8Array([0xb1, 0xb2, 0xb3]),
          halfWidthCount: 3,
        },
      ]);
    });

    test("encodes pure Japanese text into JIS X 0208 2-byte codes", () => {
      // 'あ' = Ku 4 Ten 2 -> [0x24, 0x22]
      // 'い' = Ku 4 Ten 4 -> [0x24, 0x24]
      const segments = encodeToJisSegments("あい");
      expect(segments).toEqual([
        {
          isKanji: true,
          bytes: new Uint8Array([0x24, 0x22, 0x24, 0x24]),
          halfWidthCount: 4,
        },
      ]);
    });

    test("normalizes variant Kanji before encoding to JIS X 0208", () => {
      // '髙' should be normalized to '高' (Ku 25 Ten 66 -> [0x39, 0x62])
      const variantSegments = encodeToJisSegments("髙");
      const standardSegments = encodeToJisSegments("高");
      expect(variantSegments).toEqual(standardSegments);
      expect(variantSegments[0]?.bytes).toEqual(new Uint8Array([0x39, 0x62]));
    });

    test("splits mixed ANK and Kanji text into alternating segments", () => {
      // "(株)" (ANK '(' + Kanji '株' + ANK ')') + "あ" (Kanji) + "12" (ANK)
      const segments = encodeToJisSegments("㈱あ12");
      expect(segments).toEqual([
        {
          isKanji: false,
          bytes: new Uint8Array([0x28]),
          halfWidthCount: 1,
        },
        {
          isKanji: true,
          bytes: new Uint8Array([0x33, 0x74]), // '株' = Ku 19 Ten 84 -> [0x33, 0x74]
          halfWidthCount: 2,
        },
        {
          isKanji: false,
          bytes: new Uint8Array([0x29]),
          halfWidthCount: 1,
        },
        {
          isKanji: true,
          bytes: new Uint8Array([0x24, 0x22]), // 'あ' = [0x24, 0x22]
          halfWidthCount: 2,
        },
        {
          isKanji: false,
          bytes: new Uint8Array([0x31, 0x32]), // "12"
          halfWidthCount: 2,
        },
      ]);
    });

    test("replaces unencodable characters (e.g., emoji or non-JIS CP932 chars) with the JIS Geta mark '〓' [0x22, 0x2e]", () => {
      // '😀' (emoji) and '①' if not in map, or '€' -> replaced with Geta mark
      const segments = encodeToJisSegments("😀");
      expect(segments).toEqual([
        {
          isKanji: true,
          bytes: new Uint8Array([(JIS_GETA_MARK >> 8) & 0xff, JIS_GETA_MARK & 0xff]),
          halfWidthCount: 2,
        },
      ]);
    });
  });
});
