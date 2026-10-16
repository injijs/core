import { describe, expect, test } from "vite-plus/test";
import { InjiBuilder } from "../src/builder.ts";
import { compileDocument } from "../src/compiler.ts";
import { col, dot180, line, mm } from "../src/units.ts";

describe("InjiBuilder", () => {
  test("builds a complete slip AST using fluent method chaining", () => {
    const builder = new InjiBuilder({ offset: { x: mm(2), y: mm(-1) }, ejectOnEnd: true })
      .text(mm(20), mm(15), "株式会社テスト商事", { bold: true, doubleWidth: true })
      .text(mm(160), mm(15), 20261016, { width: col(10), align: "right", cpi: 12 })
      .gridText(mm(25), mm(8), "123 4567", { cellPitch: mm(7), totalCells: 8, bold: true })
      .table({
        startY: line(10),
        rowHeight: line(2),
        maxRows: 5,
        columns: [
          { key: "item", x: mm(15), width: mm(80) },
          { key: "qty", x: mm(100), width: col(5), align: "right" },
          { key: "price", x: mm(125), cellPitch: mm(5), totalCells: 6, align: "right" },
        ],
        rows: [
          { item: "複写伝票 A4", qty: 10, price: 12500 },
          { item: "インクリボン VP-4300", qty: 2, price: 4800 },
        ],
      });

    const ast = builder.toAST();
    expect(ast.offset).toEqual({ x: mm(2), y: mm(-1) });
    expect(ast.ejectOnEnd).toBe(true);
    expect(ast.nodes).toHaveLength(4);
    expect(ast.nodes[0]).toEqual({
      type: "text",
      x: mm(20),
      y: mm(15),
      text: "株式会社テスト商事",
      style: { bold: true, doubleWidth: true },
    });
    expect(ast.nodes[1]).toEqual({
      type: "text",
      x: mm(160),
      y: mm(15),
      text: "20261016",
      width: col(10),
      align: "right",
      style: { cpi: 12 },
    });
    expect(ast.nodes[2]).toEqual({
      type: "gridText",
      x: mm(25),
      y: mm(8),
      text: "123 4567",
      cellPitch: mm(7),
      totalCells: 8,
      style: { bold: true },
    });
  });

  test("safely skips null, undefined, and empty strings in text() and gridText()", () => {
    const builder = new InjiBuilder()
      .text(10, 10, null)
      .text(10, 20, undefined)
      .text(10, 30, "")
      .gridText(10, 40, null, { cellPitch: 50 })
      .gridText(10, 50, undefined, { cellPitch: 50 })
      .gridText(10, 60, "", { cellPitch: 50 })
      .text(10, 70, 0); // numeric 0 is valid and must be printed as "0"

    const ast = builder.toAST();
    expect(ast.nodes).toEqual([{ type: "text", x: 10, y: 70, text: "0" }]);
  });

  test("supports setOffset, setEjectOnEnd, addNode, addNodes, and clear", () => {
    const builder = new InjiBuilder()
      .setOffset(10, 20)
      .setEjectOnEnd(false)
      .text(0, 0, "Draft")
      .clear()
      .addNode({ type: "text", x: 50, y: 100, text: "First" })
      .addNodes([
        { type: "text", x: 50, y: 160, text: "Second" },
        { type: "gridText", x: 50, y: 220, text: "12", cellPitch: 40 },
      ]);

    const ast = builder.toAST();
    expect(ast).toEqual({
      offset: { x: 10, y: 20 },
      ejectOnEnd: false,
      nodes: [
        { type: "text", x: 50, y: 100, text: "First" },
        { type: "text", x: 50, y: 160, text: "Second" },
        { type: "gridText", x: 50, y: 220, text: "12", cellPitch: 40 },
      ],
    });
  });

  test("supports nested style object in text and gridText options", () => {
    const builder = new InjiBuilder()
      .text(0, 0, "Header", { style: { underline: true, doubleHeight: true } })
      .gridText(0, 60, 99, { cellPitch: 50, style: { cpi: 15 } });

    const ast = builder.toAST();
    expect(ast.nodes[0]).toMatchObject({
      type: "text",
      style: { underline: true, doubleHeight: true },
    });
    expect(ast.nodes[1]).toMatchObject({
      type: "gridText",
      style: { cpi: 15 },
    });
  });

  test("reconstructs a builder from DocumentAST via InjiBuilder.fromAST and performs deep cloning", () => {
    const original = new InjiBuilder({ offset: { x: 5, y: 5 }, ejectOnEnd: false }).text(
      0,
      0,
      "Title",
      { bold: true },
    );
    const snapshot = original.toAST();

    const restored = InjiBuilder.fromAST(snapshot);
    restored.setOffset(100, 100).text(0, 60, "Added");

    expect(snapshot.offset).toEqual({ x: 5, y: 5 });
    expect(snapshot.nodes).toHaveLength(1);
    expect(restored.toAST().nodes).toHaveLength(2);
  });

  test("resolves sorted items and builds ESC/P bytes matching compileDocument", () => {
    const builder = new InjiBuilder({ ejectOnEnd: false })
      .text(360, dot180(60), "Bottom")
      .text(0, dot180(20), "Top");

    const resolved = builder.resolve();
    expect(resolved.map((i) => i.text)).toEqual(["Top", "Bottom"]);

    const bytes = builder.build();
    expect(bytes).toEqual(compileDocument(builder.toAST()));
  });

  test("print() compiles and sends the byte sequence to a PrintableTransport", async () => {
    const sentChunks: Uint8Array[] = [];
    const mockTransport = {
      async send(data: Uint8Array): Promise<void> {
        sentChunks.push(data);
      },
    };

    const builder = new InjiBuilder().text(0, 0, "PrintTest");
    await builder.print(mockTransport);

    expect(sentChunks).toHaveLength(1);
    expect(sentChunks[0]).toEqual(builder.build());
  });
});
