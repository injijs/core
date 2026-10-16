import type { Dot360 } from "./units.ts";

/**
 * Origin offset in {@link Dot360} used to calibrate printer hardware margins and paper feed drift.
 */
export interface OriginOffset {
  /** Horizontal offset in {@link Dot360} (positive shifts right, negative shifts left). */
  x: Dot360;
  /** Vertical offset in {@link Dot360} (positive shifts down, negative shifts up). */
  y: Dot360;
}

/**
 * Text decoration and pitch options for ESC/P 24-J84 printing.
 */
export interface TextStyle {
  /** Character pitch in characters per inch (`10`, `12`, or `15`). Defaults to `10`. */
  cpi?: 10 | 12 | 15;
  /** Enables bold (emphasized) printing (`ESC E` / `ESC F`). */
  bold?: boolean;
  /** Enables underline for both ANK and Kanji (`ESC -` / `FS -`). */
  underline?: boolean;
  /** Enables 2x horizontal width enlargement (`ESC W`). */
  doubleWidth?: boolean;
  /** Enables 2x vertical height enlargement (`ESC w` / `FS V`). */
  doubleHeight?: boolean;
}

/**
 * Horizontal alignment mode within a bounding box or grid.
 */
export type TextAlign = "left" | "center" | "right";

/**
 * 1. Coordinate-positioned text element.
 */
export interface TextNode {
  type: "text";
  /** Horizontal start coordinate from the left margin in {@link Dot360}. */
  x: Dot360;
  /** Vertical coordinate from the top margin in {@link Dot360}. */
  y: Dot360;
  /** Text content to print. */
  text: string;
  /** Optional font pitch and decoration style. */
  style?: TextStyle;
  /**
   * Optional bounding box width in {@link Dot360}.
   * When specified, text overflowing this width is safely truncated and aligned according to {@link align}.
   */
  width?: Dot360;
  /** Horizontal alignment within {@link width}. Defaults to `"left"`. */
  align?: TextAlign;
}

/**
 * 2. Character-grid (fixed cell pitch) text element for postal codes, phone numbers, and amount boxes.
 */
export interface GridTextNode {
  type: "gridText";
  /** Horizontal coordinate of the first (leftmost) cell in {@link Dot360}. */
  x: Dot360;
  /** Vertical coordinate from the top margin in {@link Dot360}. */
  y: Dot360;
  /** Characters to place one-by-one into grid cells. */
  text: string;
  /** Center-to-center horizontal distance between adjacent cells in {@link Dot360}. */
  cellPitch: Dot360;
  /**
   * Total number of cells in the grid.
   * Required when `align` is `"right"` (e.g., right-justified currency digits).
   */
  totalCells?: number;
  /**
   * Grid cell alignment: `"left"` fills from the first cell rightward;
   * `"right"` right-justifies characters into {@link totalCells}. Defaults to `"left"`.
   */
  align?: "left" | "right";
  /** Optional font pitch and decoration style applied to each cell character. */
  style?: TextStyle;
}

/**
 * Column definition for {@link TableNode}.
 */
export interface TableColumn {
  /** Property key to read from each row record. */
  key: string;
  /** Horizontal start coordinate of this column in {@link Dot360}. */
  x: Dot360;
  /** Optional column width in {@link Dot360} for alignment and truncation. */
  width?: Dot360;
  /** Horizontal alignment within {@link width} or {@link totalCells}. Defaults to `"left"`. */
  align?: TextAlign;
  /** Optional font pitch and decoration style for cells in this column. */
  style?: TextStyle;
  /**
   * Optional center-to-center cell pitch in {@link Dot360}.
   * When specified, the column cell is rendered as a character grid ({@link GridTextNode})
   * for slips with per-digit boxes in detail rows (e.g., Chain Store Unified Slips).
   */
  cellPitch?: Dot360;
  /**
   * Optional total number of grid cells when {@link cellPitch} is specified.
   * Used for truncation and right-alignment within digit boxes.
   */
  totalCells?: number;
}

/**
 * 3. Repeating detail-row table element for invoice and delivery slip line items.
 */
export interface TableNode {
  type: "table";
  /** Vertical coordinate of the first row (`rowIndex = 0`) in {@link Dot360}. */
  startY: Dot360;
  /** Vertical distance between consecutive rows in {@link Dot360}. */
  rowHeight: Dot360;
  /** Column layout definitions. */
  columns: TableColumn[];
  /** Array of row data records. */
  rows: Array<Record<string, string | number | null | undefined>>;
  /**
   * Optional maximum number of rows to print on the slip.
   * Rows beyond `maxRows` are ignored to prevent overflowing into the slip footer.
   */
  maxRows?: number;
}

/**
 * Union of all supported layout elements in a document.
 */
export type LayoutNode = TextNode | GridTextNode | TableNode;

/**
 * Intermediate Representation (AST) of a single slip/page document.
 */
export interface DocumentAST {
  /** Global origin offset applied to all elements on the page. */
  offset?: OriginOffset;
  /** Whether to emit a Form Feed (`FF`, `0x0c`) at the end of printing. Defaults to `true`. */
  ejectOnEnd?: boolean;
  /** Layout elements to render on the slip. */
  nodes: LayoutNode[];
}
