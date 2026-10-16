import type { DocumentAST, GridTextNode, TableNode, TextNode, TextStyle } from "./ast.ts";
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
} from "./commands.ts";
import {
  encodeToJisSegments,
  measureHalfWidth,
  normalizeJapaneseText,
  truncateByHalfWidth,
} from "./encoder.ts";
import { DOTS_PER_INCH, type Dot360 } from "./units.ts";

/**
 * Resolved primitive text item after flattening, alignment, truncation, and offset calculation.
 */
export interface ResolvedTextItem {
  /** Final non-negative horizontal coordinate in {@link Dot360}. */
  x: Dot360;
  /** Final non-negative vertical coordinate in {@link Dot360} (snapped to 1/180 inch = 2 Dot360). */
  y: Dot360;
  /** Normalized and truncated text to print. */
  text: string;
  /** Optional text style. */
  style?: TextStyle;
}

/**
 * Expands a {@link GridTextNode} into individual per-cell {@link TextNode} primitives.
 */
function expandGridTextNode(node: GridTextNode): TextNode[] {
  const normalized = normalizeJapaneseText(node.text);
  const chars = Array.from(normalized);
  if (chars.length === 0) {
    return [];
  }

  const maxCells =
    node.totalCells !== undefined ? Math.max(0, Math.trunc(node.totalCells)) : undefined;
  const visibleChars =
    maxCells === undefined
      ? chars
      : node.align === "right" && chars.length > maxCells
        ? chars.slice(chars.length - maxCells)
        : chars.slice(0, maxCells);

  let startCellIndex = 0;
  if (node.align === "right" && maxCells !== undefined) {
    startCellIndex = Math.max(0, maxCells - visibleChars.length);
  }

  const result: TextNode[] = [];
  for (let i = 0; i < visibleChars.length; i++) {
    const char = visibleChars[i];
    if (char === undefined || char === " " || char === "\u3000") {
      continue;
    }
    result.push({
      type: "text",
      x: node.x + (startCellIndex + i) * node.cellPitch,
      y: node.y,
      text: char,
      style: node.style,
    });
  }

  return result;
}

/**
 * Expands a {@link TableNode} into individual {@link TextNode} primitives for each non-empty cell.
 */
function expandTableNode(node: TableNode): TextNode[] {
  const result: TextNode[] = [];
  const rowLimit =
    node.maxRows !== undefined
      ? Math.min(node.rows.length, Math.max(0, Math.trunc(node.maxRows)))
      : node.rows.length;

  for (let rowIndex = 0; rowIndex < rowLimit; rowIndex++) {
    const row = node.rows[rowIndex];
    if (!row) {
      continue;
    }
    const rowY = node.startY + rowIndex * node.rowHeight;

    for (const column of node.columns) {
      const rawValue = row[column.key];
      if (rawValue === undefined || rawValue === null) {
        continue;
      }
      const text = String(rawValue);
      if (text.length === 0) {
        continue;
      }

      if (column.cellPitch !== undefined) {
        result.push(
          ...expandGridTextNode({
            type: "gridText",
            x: column.x,
            y: rowY,
            text,
            cellPitch: column.cellPitch,
            totalCells: column.totalCells,
            align: column.align === "right" ? "right" : "left",
            style: column.style,
          }),
        );
      } else {
        result.push({
          type: "text",
          x: column.x,
          y: rowY,
          text,
          width: column.width,
          align: column.align,
          style: column.style,
        });
      }
    }
  }

  return result;
}

/**
 * Flattens all layout nodes in a {@link DocumentAST}, applies box width truncation,
 * horizontal alignment, origin offset (clamped to `>= 0`), and sorts items top-to-bottom (`Y` ascending)
 * then left-to-right (`X` ascending).
 *
 * @param doc - Document AST to resolve.
 * @returns Sorted array of resolved primitive text items.
 */
export function resolveDocumentItems(doc: DocumentAST): ResolvedTextItem[] {
  const offsetX = doc.offset?.x ?? 0;
  const offsetY = doc.offset?.y ?? 0;

  const flatNodes: TextNode[] = [];
  for (const node of doc.nodes) {
    switch (node.type) {
      case "text":
        flatNodes.push(node);
        break;
      case "gridText":
        flatNodes.push(...expandGridTextNode(node));
        break;
      case "table":
        flatNodes.push(...expandTableNode(node));
        break;
    }
  }

  const resolved: ResolvedTextItem[] = [];

  for (const node of flatNodes) {
    const cpi = node.style?.cpi ?? 10;
    const scaleX = node.style?.doubleWidth ? 2 : 1;
    const halfColDots = (DOTS_PER_INCH / cpi) * scaleX;

    let text: string;
    let alignedX = node.x;

    if (node.width !== undefined) {
      const maxHalfCols = Math.max(0, Math.floor(node.width / halfColDots));
      text = truncateByHalfWidth(node.text, maxHalfCols);
      const textWidthDots = Math.round(measureHalfWidth(text) * halfColDots);
      const remainingWidth = Math.max(0, node.width - textWidthDots);

      if (node.align === "right") {
        alignedX = node.x + remainingWidth;
      } else if (node.align === "center") {
        alignedX = node.x + Math.floor(remainingWidth / 2);
      }
    } else {
      text = normalizeJapaneseText(node.text);
    }

    if (text.length === 0) {
      continue;
    }

    const finalX = Math.max(0, Math.round(alignedX + offsetX));
    const rawFinalY = Math.max(0, Math.round(node.y + offsetY));
    // Snap Y to 1/180 inch (2 Dot360) resolution to match ESC J n paper feed precision
    const finalY = Math.round(rawFinalY / 2) * 2;

    resolved.push({
      x: finalX,
      y: finalY,
      text,
      style: node.style,
    });
  }

  resolved.sort((a, b) => {
    if (a.y !== b.y) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });

  return resolved;
}

/**
 * Concatenates multiple `Uint8Array` chunks into a single `Uint8Array`.
 */
function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.length;
  }

  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/**
 * Compiles a {@link DocumentAST} into a complete ESC/P 24-J84 byte sequence (`Uint8Array`).
 *
 * Guarantees forward-only paper feeding by sorting all resolved elements by `Y` ascending,
 * then `X` ascending before emitting ESC/P commands.
 *
 * @param doc - Document AST to compile.
 * @returns Complete ESC/P 24-J84 byte stream ready to send to a printer transport.
 */
export function compileDocument(doc: DocumentAST): Uint8Array {
  const items = resolveDocumentItems(doc);
  const chunks: Uint8Array[] = [cmdInit()];

  let currentY: Dot360 = 0;
  let currentEndX: Dot360 = 0;

  for (const item of items) {
    const segments = encodeToJisSegments(item.text);
    if (segments.length === 0) {
      continue;
    }

    const deltaY = item.y - currentY;
    if (deltaY > 0) {
      chunks.push(cmdCarriageReturn());
      chunks.push(cmdFeedY(deltaY));
      currentY = item.y;
      currentEndX = 0;
    } else if (item.x < currentEndX) {
      // Return print head to left margin when items overlap horizontally on the same line
      chunks.push(cmdCarriageReturn());
      currentEndX = 0;
    }

    chunks.push(cmdMoveX(item.x));

    const style = item.style;
    const hasCustomCpi = style?.cpi !== undefined && style.cpi !== 10;
    const hasBold = Boolean(style?.bold);
    const hasUnderline = Boolean(style?.underline);
    const hasScale = Boolean(style?.doubleWidth || style?.doubleHeight);

    if (hasCustomCpi && style?.cpi) {
      chunks.push(cmdCpi(style.cpi));
    }
    if (hasBold) {
      chunks.push(cmdBold(true));
    }
    if (hasUnderline) {
      chunks.push(cmdUnderline(true));
    }
    if (hasScale) {
      chunks.push(cmdScale(Boolean(style?.doubleWidth), Boolean(style?.doubleHeight)));
    }

    let inKanjiMode = false;
    let totalHalfCols = 0;
    for (const segment of segments) {
      if (segment.isKanji !== inKanjiMode) {
        chunks.push(cmdKanjiMode(segment.isKanji));
        inKanjiMode = segment.isKanji;
      }
      chunks.push(segment.bytes);
      totalHalfCols += segment.halfWidthCount;
    }

    if (inKanjiMode) {
      chunks.push(cmdKanjiMode(false));
    }

    if (hasScale) {
      chunks.push(cmdScale(false, false));
    }
    if (hasUnderline) {
      chunks.push(cmdUnderline(false));
    }
    if (hasBold) {
      chunks.push(cmdBold(false));
    }
    if (hasCustomCpi) {
      chunks.push(cmdCpi(10));
    }

    const cpi = style?.cpi ?? 10;
    const scaleX = style?.doubleWidth ? 2 : 1;
    const halfColDots = (DOTS_PER_INCH / cpi) * scaleX;
    currentEndX = Math.round(item.x + totalHalfCols * halfColDots);
  }

  chunks.push(cmdCarriageReturn());
  if (doc.ejectOnEnd !== false) {
    chunks.push(cmdFormFeed());
  }

  return concatBytes(chunks);
}
