import { describe, expect, test } from "vite-plus/test";
import type { DocumentAST } from "../src/ast.ts";
import { compileDocument, compileDocuments, resolveDocumentItems } from "../src/compiler.ts";
import { col, dot180, line, mm } from "../src/units.ts";

describe("compiler", () => {
  describe("resolveDocumentItems", () => {
    test("sorts items by Y ascending, then X ascending to prevent reverse paper feeding", () => {
      const doc: DocumentAST = {
        nodes: [
          { type: "text", x: col(10), y: line(3), text: "Bottom" },
          { type: "text", x: col(20), y: line(1), text: "Top-Right" },
          { type: "text", x: col(5), y: line(1), text: "Top-Left" },
        ],
      };

      const items = resolveDocumentItems(doc);
      expect(items.map((i) => i.text)).toEqual(["Top-Left", "Top-Right", "Bottom"]);
    });

    test("applies origin offset and clamps negative coordinates to 0", () => {
      const doc: DocumentAST = {
        offset: { x: -100, y: 20 },
        nodes: [
          { type: "text", x: 50, y: 10, text: "ClampedX" },
          { type: "text", x: 200, y: 10, text: "Shifted" },
        ],
      };

      const items = resolveDocumentItems(doc);
      expect(items).toEqual([
        { x: 0, y: 30, text: "ClampedX", style: undefined },
        { x: 100, y: 30, text: "Shifted", style: undefined },
      ]);
    });

    test("truncates and aligns text within a bounding box width", () => {
      // 10 CPI = 36 Dot360 per half-width column. Box width = col(10) = 360 Dot360 (10 cols).
      const doc: DocumentAST = {
        nodes: [
          // Right-aligned "1234" (4 cols = 144 dots) in 360-dot box -> x = 100 + (360 - 144) = 316
          { type: "text", x: 100, y: 0, text: "1234", width: col(10), align: "right" },
          // Center-aligned "1234" (4 cols = 144 dots) in 360-dot box -> x = 100 + (360 - 144)/2 = 208
          { type: "text", x: 100, y: 60, text: "1234", width: col(10), align: "center" },
          // Overflowing Kanji "あいうえお" (10 cols) in 5-col box (180 dots) -> truncated to "あい"
          { type: "text", x: 100, y: 120, text: "あいうえお", width: col(5), align: "left" },
        ],
      };

      const items = resolveDocumentItems(doc);
      expect(items).toEqual([
        { x: 316, y: 0, text: "1234", style: undefined },
        { x: 208, y: 60, text: "1234", style: undefined },
        { x: 100, y: 120, text: "あい", style: undefined },
      ]);
    });

    test("expands gridText nodes for left-aligned postal codes and right-aligned amounts", () => {
      const doc: DocumentAST = {
        nodes: [
          // Left-aligned postal code: 3 digits at pitch 70
          {
            type: "gridText",
            x: 100,
            y: 0,
            text: "123",
            cellPitch: 70,
          },
          // Right-aligned amount: "45" in a 5-cell box at pitch 70 -> placed in cells 3 and 4
          {
            type: "gridText",
            x: 100,
            y: 60,
            text: "45",
            cellPitch: 70,
            totalCells: 5,
            align: "right",
          },
        ],
      };

      const items = resolveDocumentItems(doc);
      expect(items).toEqual([
        { x: 100, y: 0, text: "1", style: undefined },
        { x: 170, y: 0, text: "2", style: undefined },
        { x: 240, y: 0, text: "3", style: undefined },
        { x: 310, y: 60, text: "4", style: undefined },
        { x: 380, y: 60, text: "5", style: undefined },
      ]);
    });

    test("skips both half-width and full-width spaces in gridText to avoid overwriting pre-printed hyphens", () => {
      const doc: DocumentAST = {
        nodes: [
          {
            type: "gridText",
            x: 100,
            y: 0,
            text: "123 4567",
            cellPitch: 50,
          },
          {
            type: "gridText",
            x: 100,
            y: 60,
            text: "123　4567",
            cellPitch: 50,
          },
        ],
      };

      const items = resolveDocumentItems(doc);
      // Cell index 3 (x = 100 + 3 * 50 = 250) is skipped in both rows
      expect(items.filter((i) => i.y === 0).map((i) => i.x)).toEqual([
        100, 150, 200, 300, 350, 400, 450,
      ]);
      expect(items.filter((i) => i.y === 60).map((i) => i.x)).toEqual([
        100, 150, 200, 300, 350, 400, 450,
      ]);
    });

    test("preserves rightmost place-value digits when right-aligned gridText overflows totalCells", () => {
      const doc: DocumentAST = {
        nodes: [
          {
            type: "gridText",
            x: 100,
            y: 0,
            text: "  1234", // 6 chars in 5-cell box -> rightmost 5 chars (" 1234") kept, ones digit "4" stays in cell 4
            cellPitch: 50,
            totalCells: 5,
            align: "right",
          },
        ],
      };

      const items = resolveDocumentItems(doc);
      expect(items).toEqual([
        { x: 150, y: 0, text: "1", style: undefined },
        { x: 200, y: 0, text: "2", style: undefined },
        { x: 250, y: 0, text: "3", style: undefined },
        { x: 300, y: 0, text: "4", style: undefined },
      ]);
    });

    test("calculates bounding box alignment and truncation accurately for 12 CPI and doubleWidth", () => {
      const doc: DocumentAST = {
        nodes: [
          // 12 CPI = 30 Dot360 per half-col. "ABCD" (4 cols = 120 dots) right-aligned in 300-dot box -> x = 100 + 180 = 280
          {
            type: "text",
            x: 100,
            y: 0,
            text: "ABCD",
            width: 300,
            align: "right",
            style: { cpi: 12 },
          },
          // 10 CPI + doubleWidth = 72 Dot360 per half-col. "123" (3 cols = 216 dots) in 180-dot box -> fits 2 cols ("12")
          {
            type: "text",
            x: 100,
            y: 60,
            text: "123",
            width: 180,
            style: { doubleWidth: true },
          },
        ],
      };

      const items = resolveDocumentItems(doc);
      expect(items).toEqual([
        { x: 280, y: 0, text: "ABCD", style: { cpi: 12 } },
        { x: 100, y: 60, text: "12", style: { doubleWidth: true } },
      ]);
    });

    test("expands table nodes into row and column text items", () => {
      const doc: DocumentAST = {
        nodes: [
          {
            type: "table",
            startY: line(5),
            rowHeight: line(1),
            columns: [
              { key: "name", x: mm(10) },
              { key: "qty", x: mm(100), width: col(4), align: "right" },
            ],
            rows: [
              { name: "ItemA", qty: 2 },
              { name: "ItemB", qty: 15 },
            ],
          },
        ],
      };

      const items = resolveDocumentItems(doc);
      expect(items).toHaveLength(4);
      expect(items[0]).toMatchObject({ x: mm(10), y: line(5), text: "ItemA" });
      expect(items[1]).toMatchObject({ y: line(5), text: "2" });
      expect(items[2]).toMatchObject({ x: mm(10), y: line(6), text: "ItemB" });
      expect(items[3]).toMatchObject({ y: line(6), text: "15" });
    });

    test("supports maxRows and per-digit grid columns (cellPitch) in table nodes", () => {
      const doc: DocumentAST = {
        nodes: [
          {
            type: "table",
            startY: 100,
            rowHeight: 60,
            maxRows: 1,
            columns: [
              { key: "name", x: 50 },
              {
                key: "amount",
                x: 300,
                cellPitch: 40,
                totalCells: 4,
                align: "right",
              },
            ],
            rows: [
              { name: "Row1", amount: 25 },
              { name: "OverflowRow2", amount: 99 },
            ],
          },
        ],
      };

      const items = resolveDocumentItems(doc);
      // Only Row1 is rendered (maxRows: 1). Amount "25" in 4 cells at pitch 40 -> cells 2 and 3 (x = 380, 420)
      expect(items).toEqual([
        { x: 50, y: 100, text: "Row1", style: undefined },
        { x: 380, y: 100, text: "2", style: undefined },
        { x: 420, y: 100, text: "5", style: undefined },
      ]);
    });
  });

  describe("compileDocument", () => {
    test("emits ESC @, forward feed, horizontal move, text bytes, CR, and FF", () => {
      const doc: DocumentAST = {
        nodes: [{ type: "text", x: 360, y: dot180(60), text: "A" }],
      };

      const bytes = compileDocument(doc);
      expect(bytes).toEqual(
        new Uint8Array([
          0x1b,
          0x40, // ESC @ (Init)
          0x0d, // CR before paper feed
          0x1b,
          0x4a,
          60, // ESC J 60 (Feed 60/180 inch)
          0x1b,
          0x24,
          60,
          0x00, // ESC $ 60 0 (Move X to 1 inch = 60/60 inch)
          0x41, // 'A'
          0x0d, // Final CR
          0x0c, // Final FF (ejectOnEnd defaults to true)
        ]),
      );
    });

    test("moves horizontally without vertical paper feed when multiple items share the same Y line", () => {
      const doc: DocumentAST = {
        ejectOnEnd: false,
        nodes: [
          { type: "text", x: 360, y: dot180(30), text: "B" },
          { type: "text", x: 0, y: dot180(30), text: "A" },
        ],
      };

      const bytes = compileDocument(doc);
      expect(bytes).toEqual(
        new Uint8Array([
          0x1b,
          0x40, // ESC @
          0x0d, // CR before paper feed
          0x1b,
          0x4a,
          30, // ESC J 30 (Feed once to Y = 30/180 inch)
          0x1b,
          0x24,
          0,
          0, // ESC $ 0 0 (Move X to 0)
          0x41, // 'A'
          0x1b,
          0x24,
          60,
          0, // ESC $ 60 0 (Move X to 1 inch on the same line, no ESC J!)
          0x42, // 'B'
          0x0d, // Final CR
        ]),
      );
    });

    test("emits CR when an item on the same Y line overlaps horizontally with the previous item", () => {
      const doc: DocumentAST = {
        ejectOnEnd: false,
        nodes: [
          // "ABC" at x=0 advances print head to 3 * 36 = 108 Dot360
          { type: "text", x: 0, y: 0, text: "ABC" },
          // Next item at x=36 is to the left of currentEndX (108), so CR (0x0d) is emitted before ESC $
          { type: "text", x: 36, y: 0, text: "X" },
        ],
      };

      const bytes = compileDocument(doc);
      expect(bytes).toEqual(
        new Uint8Array([
          0x1b,
          0x40, // ESC @
          0x1b,
          0x24,
          0,
          0, // ESC $ 0 0
          0x41,
          0x42,
          0x43, // "ABC"
          0x0d, // CR emitted because 36 < 108!
          0x1b,
          0x24,
          6,
          0, // ESC $ 6 0 (36 Dot360 = 6/60 inch)
          0x58, // "X"
          0x0d, // Final CR
        ]),
      );
    });

    test("omits final FF when ejectOnEnd is false", () => {
      const doc: DocumentAST = {
        ejectOnEnd: false,
        nodes: [{ type: "text", x: 0, y: 0, text: "A" }],
      };

      const bytes = compileDocument(doc);
      expect(bytes[bytes.length - 1]).toBe(0x0d);
      expect(bytes).not.toContain(0x0c);
    });

    test("compiles an empty document cleanly with only ESC @, CR, and FF", () => {
      const bytes = compileDocument({ nodes: [] });
      expect(bytes).toEqual(new Uint8Array([0x1b, 0x40, 0x0d, 0x0c]));
    });

    test("switches into Kanji mode (FS &) for Japanese text and restores ANK mode (FS .)", () => {
      const doc: DocumentAST = {
        ejectOnEnd: false,
        nodes: [{ type: "text", x: 0, y: 0, text: "あ" }],
      };

      const bytes = compileDocument(doc);
      expect(bytes).toEqual(
        new Uint8Array([
          0x1b,
          0x40, // ESC @
          0x1b,
          0x24,
          0x00,
          0x00, // ESC $ 0 0
          0x1c,
          0x26, // FS & (Enter Kanji mode)
          0x24,
          0x22, // 'あ' (Ku 4 Ten 2)
          0x1c,
          0x2e, // FS . (Exit Kanji mode back to ANK)
          0x0d, // Final CR
        ]),
      );
    });

    test("applies and resets TextStyle commands (bold, underline, cpi, scale)", () => {
      const doc: DocumentAST = {
        ejectOnEnd: false,
        nodes: [
          {
            type: "text",
            x: 0,
            y: 0,
            text: "X",
            style: { cpi: 12, bold: true, underline: true, doubleWidth: true },
          },
        ],
      };

      const bytes = compileDocument(doc);
      expect(bytes).toEqual(
        new Uint8Array([
          0x1b,
          0x40, // ESC @
          0x1b,
          0x24,
          0x00,
          0x00, // ESC $ 0 0
          0x1b,
          0x4d, // ESC M (12 CPI)
          0x1b,
          0x45, // ESC E (Bold ON)
          0x1b,
          0x2d,
          1,
          0x1c,
          0x2d,
          1, // Underline ON
          0x1b,
          0x57,
          1,
          0x1b,
          0x77,
          0,
          0x1c,
          0x56,
          0, // Double width ON
          0x58, // 'X'
          0x1b,
          0x57,
          0,
          0x1b,
          0x77,
          0,
          0x1c,
          0x56,
          0, // Scale OFF
          0x1b,
          0x2d,
          0,
          0x1c,
          0x2d,
          0, // Underline OFF
          0x1b,
          0x46, // ESC F (Bold OFF)
          0x1b,
          0x50, // ESC P (Restore 10 CPI)
          0x0d, // Final CR
        ]),
      );
    });
  });

  describe("compileDocuments", () => {
    test("concatenates multiple pages into a single continuous ESC/P byte stream", () => {
      const page1: DocumentAST = { nodes: [{ type: "text", x: 0, y: 0, text: "1" }] };
      const page2: DocumentAST = { nodes: [{ type: "text", x: 0, y: 0, text: "2" }] };

      const combined = compileDocuments([page1, page2]);
      const p1Bytes = compileDocument(page1);
      const p2Bytes = compileDocument(page2);

      expect(combined.length).toBe(p1Bytes.length + p2Bytes.length);
      expect(combined.slice(0, p1Bytes.length)).toEqual(p1Bytes);
      expect(combined.slice(p1Bytes.length)).toEqual(p2Bytes);
    });

    test("returns an empty Uint8Array when given an empty array of documents", () => {
      expect(compileDocuments([])).toEqual(new Uint8Array([]));
    });
  });
});
