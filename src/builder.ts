import type {
  DocumentAST,
  GridTextNode,
  LayoutNode,
  OriginOffset,
  TableColumn,
  TableNode,
  TextAlign,
  TextNode,
  TextStyle,
} from "./ast.ts";
import { compileDocument, type ResolvedTextItem, resolveDocumentItems } from "./compiler.ts";
import type { Dot360 } from "./units.ts";

/**
 * Configuration options for initializing an {@link InjiBuilder}.
 */
export interface InjiBuilderOptions {
  /** Initial global origin offset in {@link Dot360}. */
  offset?: OriginOffset;
  /** Whether to emit a Form Feed (`FF`, `0x0c`) at the end of printing. Defaults to `true`. */
  ejectOnEnd?: boolean;
}

/**
 * Options for {@link InjiBuilder.text}.
 * Supports both flat {@link TextStyle} properties and an explicit `style` object.
 */
export interface TextOptions extends TextStyle {
  /** Optional bounding box width in {@link Dot360} for alignment and truncation. */
  width?: Dot360;
  /** Horizontal alignment within {@link width}. Defaults to `"left"`. */
  align?: TextAlign;
  /** Optional explicit {@link TextStyle} object (merged with top-level style properties). */
  style?: TextStyle;
}

/**
 * Options for {@link InjiBuilder.gridText}.
 * Supports both flat {@link TextStyle} properties and an explicit `style` object.
 */
export interface GridTextOptions extends TextStyle {
  /** Center-to-center horizontal distance between adjacent cells in {@link Dot360}. */
  cellPitch: Dot360;
  /** Total number of cells in the grid (required when `align` is `"right"`). */
  totalCells?: number;
  /** Grid cell alignment (`"left"` or `"right"`). Defaults to `"left"`. */
  align?: "left" | "right";
  /** Optional explicit {@link TextStyle} object (merged with top-level style properties). */
  style?: TextStyle;
}

/**
 * Configuration for {@link InjiBuilder.table}.
 */
export interface TableConfig {
  /** Vertical coordinate of the first row (`rowIndex = 0`) in {@link Dot360}. */
  startY: Dot360;
  /** Vertical distance between consecutive rows in {@link Dot360}. */
  rowHeight: Dot360;
  /** Column layout definitions. */
  columns: TableColumn[];
  /** Array of row data records. */
  rows: Array<Record<string, string | number | null | undefined>>;
  /** Optional maximum number of rows to print on the slip. */
  maxRows?: number;
}

/**
 * Minimal structural interface for a printer transport that can send raw ESC/P bytes.
 */
export interface PrintableTransport {
  /** Sends raw ESC/P byte sequence to the target printer. */
  send(data: Uint8Array): Promise<void>;
}

/**
 * Extracts a normalized {@link TextStyle} object from options that may contain flat or nested style properties.
 */
function extractTextStyle(options?: TextStyle & { style?: TextStyle }): TextStyle | undefined {
  if (!options) {
    return undefined;
  }

  const cpi = options.style?.cpi ?? options.cpi;
  const bold = options.style?.bold ?? options.bold;
  const underline = options.style?.underline ?? options.underline;
  const doubleWidth = options.style?.doubleWidth ?? options.doubleWidth;
  const doubleHeight = options.style?.doubleHeight ?? options.doubleHeight;

  if (
    cpi === undefined &&
    bold === undefined &&
    underline === undefined &&
    doubleWidth === undefined &&
    doubleHeight === undefined
  ) {
    return undefined;
  }

  const style: TextStyle = {};
  if (cpi !== undefined) style.cpi = cpi;
  if (bold !== undefined) style.bold = bold;
  if (underline !== undefined) style.underline = underline;
  if (doubleWidth !== undefined) style.doubleWidth = doubleWidth;
  if (doubleHeight !== undefined) style.doubleHeight = doubleHeight;
  return style;
}

/**
 * Creates a deep defensive clone of a {@link LayoutNode}.
 */
function cloneLayoutNode(node: LayoutNode): LayoutNode {
  switch (node.type) {
    case "text":
      return {
        ...node,
        ...(node.style ? { style: { ...node.style } } : {}),
      };
    case "gridText":
      return {
        ...node,
        ...(node.style ? { style: { ...node.style } } : {}),
      };
    case "table":
      return {
        ...node,
        columns: node.columns.map((col) => ({
          ...col,
          ...(col.style ? { style: { ...col.style } } : {}),
        })),
        rows: node.rows.map((row) => ({ ...row })),
      };
  }
}

/**
 * Fluent builder for constructing ESC/P 24-J84 slip layouts and compiling them to byte streams.
 */
export class InjiBuilder {
  private offset?: OriginOffset;
  private ejectOnEnd?: boolean;
  private readonly nodes: LayoutNode[] = [];

  /**
   * Creates a new {@link InjiBuilder} instance.
   *
   * @param options - Optional initial offset and page ejection settings.
   */
  constructor(options?: InjiBuilderOptions) {
    if (options?.offset) {
      this.offset = { x: options.offset.x, y: options.offset.y };
    }
    if (options?.ejectOnEnd !== undefined) {
      this.ejectOnEnd = options.ejectOnEnd;
    }
  }

  /**
   * Reconstructs an {@link InjiBuilder} instance from an existing {@link DocumentAST}.
   *
   * @param ast - Document AST to import.
   * @returns A new {@link InjiBuilder} populated with a defensive copy of `ast`.
   */
  static fromAST(ast: DocumentAST): InjiBuilder {
    const builder = new InjiBuilder({
      offset: ast.offset,
      ejectOnEnd: ast.ejectOnEnd,
    });
    builder.addNodes(ast.nodes);
    return builder;
  }

  /**
   * Sets the global origin offset in {@link Dot360} to calibrate hardware margins and paper feed drift.
   *
   * @param x - Horizontal offset in {@link Dot360}.
   * @param y - Vertical offset in {@link Dot360}.
   * @returns This builder instance for chaining.
   */
  setOffset(x: Dot360, y: Dot360): this {
    this.offset = { x, y };
    return this;
  }

  /**
   * Configures whether a Form Feed (`FF`, `0x0c`) command is emitted at the end of the slip.
   *
   * @param eject - `true` to eject the page on end (default), `false` to omit `FF`.
   * @returns This builder instance for chaining.
   */
  setEjectOnEnd(eject: boolean): this {
    this.ejectOnEnd = eject;
    return this;
  }

  /**
   * Places a coordinate-positioned text element on the slip.
   * If `value` is `null`, `undefined`, or an empty string `""`, this call is safely ignored.
   *
   * @param x - Horizontal start coordinate in {@link Dot360}.
   * @param y - Vertical coordinate in {@link Dot360}.
   * @param value - Text string or number to print (`null` / `undefined` / `""` is skipped).
   * @param options - Optional box width, alignment, and font style options.
   * @returns This builder instance for chaining.
   */
  text(
    x: Dot360,
    y: Dot360,
    value: string | number | null | undefined,
    options?: TextOptions,
  ): this {
    if (value === null || value === undefined) {
      return this;
    }
    const text = String(value);
    if (text.length === 0) {
      return this;
    }

    const node: TextNode = {
      type: "text",
      x,
      y,
      text,
    };

    if (options?.width !== undefined) {
      node.width = options.width;
    }
    if (options?.align !== undefined) {
      node.align = options.align;
    }
    const style = extractTextStyle(options);
    if (style !== undefined) {
      node.style = style;
    }

    this.nodes.push(node);
    return this;
  }

  /**
   * Places a character-grid (fixed cell pitch) text element for postal codes, phone numbers, or amount boxes.
   * If `value` is `null`, `undefined`, or an empty string `""`, this call is safely ignored.
   *
   * @param x - Horizontal coordinate of the first (leftmost) cell in {@link Dot360}.
   * @param y - Vertical coordinate in {@link Dot360}.
   * @param value - Characters or digits to place into grid cells (`null` / `undefined` / `""` is skipped).
   * @param options - Grid cell pitch, total cell count, alignment, and font style options.
   * @returns This builder instance for chaining.
   */
  gridText(
    x: Dot360,
    y: Dot360,
    value: string | number | null | undefined,
    options: GridTextOptions,
  ): this {
    if (value === null || value === undefined) {
      return this;
    }
    const text = String(value);
    if (text.length === 0) {
      return this;
    }

    const node: GridTextNode = {
      type: "gridText",
      x,
      y,
      text,
      cellPitch: options.cellPitch,
    };

    if (options.totalCells !== undefined) {
      node.totalCells = options.totalCells;
    }
    if (options.align !== undefined) {
      node.align = options.align;
    }
    const style = extractTextStyle(options);
    if (style !== undefined) {
      node.style = style;
    }

    this.nodes.push(node);
    return this;
  }

  /**
   * Places a repeating detail-row table element for invoice or delivery slip line items.
   *
   * @param config - Table coordinates, column definitions, and row data records.
   * @returns This builder instance for chaining.
   */
  table(config: TableConfig): this {
    const node: TableNode = {
      type: "table",
      startY: config.startY,
      rowHeight: config.rowHeight,
      columns: config.columns.map((col) => ({
        ...col,
        ...(col.style ? { style: { ...col.style } } : {}),
      })),
      rows: config.rows.map((row) => ({ ...row })),
    };

    if (config.maxRows !== undefined) {
      node.maxRows = config.maxRows;
    }

    this.nodes.push(node);
    return this;
  }

  /**
   * Appends a defensive copy of a pre-constructed {@link LayoutNode} to the document.
   *
   * @param node - Layout node (`TextNode`, `GridTextNode`, or `TableNode`) to add.
   * @returns This builder instance for chaining.
   */
  addNode(node: LayoutNode): this {
    this.nodes.push(cloneLayoutNode(node));
    return this;
  }

  /**
   * Appends defensive copies of multiple {@link LayoutNode} elements (e.g., a reusable header template).
   *
   * @param nodes - Array of layout nodes to add.
   * @returns This builder instance for chaining.
   */
  addNodes(nodes: readonly LayoutNode[]): this {
    for (const node of nodes) {
      this.nodes.push(cloneLayoutNode(node));
    }
    return this;
  }

  /**
   * Removes all layout nodes from the builder while preserving `offset` and `ejectOnEnd` settings.
   *
   * @returns This builder instance for chaining.
   */
  clear(): this {
    this.nodes.length = 0;
    return this;
  }

  /**
   * Exports a deep defensive snapshot of the current layout as a serializable {@link DocumentAST}.
   *
   * @returns Document AST representation.
   */
  toAST(): DocumentAST {
    const ast: DocumentAST = {
      nodes: this.nodes.map((node) => cloneLayoutNode(node)),
    };
    if (this.offset !== undefined) {
      ast.offset = { x: this.offset.x, y: this.offset.y };
    }
    if (this.ejectOnEnd !== undefined) {
      ast.ejectOnEnd = this.ejectOnEnd;
    }
    return ast;
  }

  /**
   * Resolves all layout nodes into flattened, aligned, offset-adjusted, and Y/X-sorted text primitives.
   *
   * @returns Sorted array of {@link ResolvedTextItem} objects.
   */
  resolve(): ResolvedTextItem[] {
    return resolveDocumentItems(this.toAST());
  }

  /**
   * Compiles the current layout into an ESC/P 24-J84 byte sequence (`Uint8Array`).
   *
   * @returns Complete ESC/P 24-J84 byte stream.
   */
  build(): Uint8Array {
    return compileDocument(this.toAST());
  }

  /**
   * Compiles the current layout and sends the resulting ESC/P byte stream to the given transport.
   *
   * @param transport - Printer transport implementing `send(data: Uint8Array): Promise<void>`.
   */
  async print(transport: PrintableTransport): Promise<void> {
    const bytes = this.build();
    await transport.send(bytes);
  }
}
