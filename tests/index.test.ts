import { describe, expect, test } from "vite-plus/test";
import {
  cmdInit,
  compileDocument,
  DOTS_PER_INCH,
  encodeToJisSegments,
  InjiBuilder,
  mm,
} from "../src/index.ts";

describe("public entry point (src/index.ts)", () => {
  test("re-exports core builder, units, encoder, commands, and compiler APIs", () => {
    expect(DOTS_PER_INCH).toBe(360);
    expect(mm(25.4)).toBe(360);
    expect(cmdInit()).toEqual(new Uint8Array([0x1b, 0x40]));
    expect(encodeToJisSegments("A")).toHaveLength(1);

    const builder = new InjiBuilder().text(mm(10), mm(10), "テスト");
    expect(builder.build()).toEqual(compileDocument(builder.toAST()));
  });
});
