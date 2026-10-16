/**
 * Represents a contiguous chunk of either 2-byte JIS X 0208 characters or 1-byte ANK characters.
 */
export interface EncodedSegment {
  /**
   * `true` if this segment contains 2-byte JIS X 0208 characters (`FS &`),
   * `false` if it contains 1-byte ANK characters (`FS .`).
   */
  isKanji: boolean;
  /**
   * Raw encoded bytes for this segment (excluding `FS &` / `FS .` mode switch commands).
   */
  bytes: Uint8Array;
  /**
   * Width in half-width (ANK) character columns (`1` per ANK char, `2` per Kanji char).
   */
  halfWidthCount: number;
}

/**
 * Fallback JIS X 0208 code for unencodable full-width characters: '〓' (Geta mark, Ku 2 Ten 14 = 0x222e).
 */
export const JIS_GETA_MARK = 0x222e;

/**
 * Mapping table for normalizing common Japanese variant characters (IBM extensions)
 * and platform-dependent symbols into standard JIS X 0208 / ASCII equivalents.
 */
const VARIANT_CHAR_MAP: Readonly<Record<string, string>> = {
  // Common kanji variants in Japanese names and addresses
  髙: "高",
  﨑: "崎",
  濵: "浜",
  栁: "柳",
  德: "徳",
  // Wave dash, tilde, and hyphen/minus variants
  "〜": "～",
  "−": "－",
  "‐": "－",
  "–": "－",
  "—": "―",
  "∥": "‖",
  // Enclosed numbers
  "①": "(1)",
  "②": "(2)",
  "③": "(3)",
  "④": "(4)",
  "⑤": "(5)",
  "⑥": "(6)",
  "⑦": "(7)",
  "⑧": "(8)",
  "⑨": "(9)",
  "⑩": "(10)",
  // Corporate abbreviations
  "㈱": "(株)",
  "㈲": "(有)",
  "㈹": "(代)",
  // Common slip symbols and units (NEC Row 13 / Unicode compatibility characters)
  "№": "No.",
  "℡": "TEL",
  "㎜": "mm",
  "㎝": "cm",
  "㎞": "km",
  "㎎": "mg",
  "㎏": "kg",
  "㎡": "m2",
  // Japanese era ligatures
  "㋿": "令和",
  "㍻": "平成",
  "㍼": "昭和",
  "㍽": "大正",
  "㍾": "明治",
  // Control characters normalized to single ASCII space for single-line slip fields
  "\t": " ",
  "\n": " ",
  "\r": " ",
};

let cachedJisMap: Map<string, number> | null = null;

/**
 * Lazily builds and caches the Unicode-to-JIS X 0208 (16-bit `(jis1 << 8) | jis2`) lookup map
 * using the standard built-in `TextDecoder("shift_jis")`.
 *
 * Only genuine JIS X 0208 rows (Ku 1..8 non-kanji and Ku 16..84 Level 1/2 kanji) are registered,
 * excluding vendor-specific CP932 rows (such as Ku 13 and Ku 89..92) that real ESC/P 24-J84 printers do not support.
 *
 * @returns Lookup map from single Unicode character to 16-bit JIS X 0208 code.
 */
function getJisLookupMap(): Map<string, number> {
  if (cachedJisMap !== null) {
    return cachedJisMap;
  }

  const decoder = new TextDecoder("shift_jis");
  const map = new Map<string, number>();

  for (let ku = 1; ku <= 84; ku++) {
    // Skip unassigned rows 9..15 (e.g., CP932 NEC special characters in row 13)
    if (ku >= 9 && ku <= 15) {
      continue;
    }

    for (let ten = 1; ten <= 94; ten++) {
      const jis1 = ku + 0x20;
      const jis2 = ten + 0x20;
      const s1 = Math.floor((ku - 1) / 2) + (ku <= 62 ? 0x81 : 0xc1);
      const s2 = ten + (ku % 2 === 1 ? (ten <= 63 ? 0x3f : 0x40) : 0x9e);

      const char = decoder.decode(new Uint8Array([s1, s2]));
      if (char.length === 1 && char !== "\ufffd" && !map.has(char)) {
        map.set(char, (jis1 << 8) | jis2);
      }
    }
  }

  cachedJisMap = map;
  return map;
}

/**
 * Returns `true` if the character code point is a 1-byte ANK character
 * (printable ASCII `0x20..0x7e` or half-width Katakana `0xff61..0xff9f`).
 *
 * @param code - Unicode code point.
 * @returns `true` if 1-byte ANK, `false` otherwise.
 */
function isAnkCodePoint(code: number): boolean {
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xff61 && code <= 0xff9f);
}

/**
 * Normalizes platform-dependent symbols and variant Kanji characters into safe
 * JIS X 0208 (Level 1 / Level 2) or ASCII representations suitable for slip printing.
 *
 * @param input - Input string to normalize.
 * @returns Normalized string.
 */
export function normalizeJapaneseText(input: string): string {
  let result = "";
  for (const char of input) {
    result += VARIANT_CHAR_MAP[char] ?? char;
  }
  return result;
}

/**
 * Measures the total display width of a string in half-width (ANK) character columns
 * after applying {@link normalizeJapaneseText} (`1` for ANK, `2` for full-width/Kanji).
 *
 * @param input - Input string to measure.
 * @returns Total width in half-width character columns.
 */
export function measureHalfWidth(input: string): number {
  const normalized = normalizeJapaneseText(input);
  let width = 0;
  for (const char of normalized) {
    const code = char.codePointAt(0) ?? 0;
    width += isAnkCodePoint(code) ? 1 : 2;
  }
  return width;
}

/**
 * Truncates a string (after normalization) so that its total width does not exceed
 * `maxHalfWidthCols` half-width columns, never splitting a 2-column full-width character in half.
 *
 * @param input - Input string to normalize and truncate.
 * @param maxHalfWidthCols - Maximum allowed half-width columns (must be a non-negative finite number).
 * @returns Normalized and safely truncated string.
 * @throws {@link RangeError} If `maxHalfWidthCols` is negative or not finite.
 */
export function truncateByHalfWidth(input: string, maxHalfWidthCols: number): string {
  if (!Number.isFinite(maxHalfWidthCols) || maxHalfWidthCols < 0) {
    throw new RangeError("maxHalfWidthCols must be a finite non-negative number.");
  }

  const normalized = normalizeJapaneseText(input);
  let result = "";
  let usedCols = 0;

  for (const char of normalized) {
    const code = char.codePointAt(0) ?? 0;
    const charWidth = isAnkCodePoint(code) ? 1 : 2;
    if (usedCols + charWidth > maxHalfWidthCols) {
      break;
    }
    result += char;
    usedCols += charWidth;
  }

  return result;
}

/**
 * Splits and encodes a string into alternating 2-byte JIS X 0208 Kanji segments
 * and 1-byte ANK (ASCII / half-width Katakana) segments.
 *
 * @param input - Input string to encode.
 * @returns Array of encoded segments with byte sequences and half-width column counts.
 */
export function encodeToJisSegments(input: string): EncodedSegment[] {
  const normalized = normalizeJapaneseText(input);
  if (normalized.length === 0) {
    return [];
  }

  const jisMap = getJisLookupMap();
  const segments: EncodedSegment[] = [];

  let currentIsKanji: boolean | null = null;
  let currentBytes: number[] = [];
  let currentHalfWidthCount = 0;

  for (const char of normalized) {
    const code = char.codePointAt(0) ?? 0;
    let isKanji: boolean;
    let charBytes: number[];
    let charWidth: number;

    if (code >= 0x20 && code <= 0x7e) {
      isKanji = false;
      charBytes = [code];
      charWidth = 1;
    } else if (code >= 0xff61 && code <= 0xff9f) {
      isKanji = false;
      charBytes = [code - 0xff61 + 0xa1];
      charWidth = 1;
    } else {
      isKanji = true;
      const jis = jisMap.get(char) ?? JIS_GETA_MARK;
      charBytes = [(jis >> 8) & 0xff, jis & 0xff];
      charWidth = 2;
    }

    if (currentIsKanji !== null && currentIsKanji !== isKanji) {
      segments.push({
        isKanji: currentIsKanji,
        bytes: new Uint8Array(currentBytes),
        halfWidthCount: currentHalfWidthCount,
      });
      currentBytes = [];
      currentHalfWidthCount = 0;
    }

    currentIsKanji = isKanji;
    currentBytes.push(...charBytes);
    currentHalfWidthCount += charWidth;
  }

  if (currentIsKanji !== null) {
    segments.push({
      isKanji: currentIsKanji,
      bytes: new Uint8Array(currentBytes),
      halfWidthCount: currentHalfWidthCount,
    });
  }

  return segments;
}
