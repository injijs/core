# @injijs/core

Zero-dependency Universal TypeScript library for **ESC/P 24-J84** (24-pin Japanese Kanji dot-matrix impact printers such as the EPSON VP series).

ESC/P 24-J84（24ピン漢字ドットインパクトプリンタ）向けの、外部依存ゼロ・Universal（Node.js / ブラウザ / エッジランタイム）対応の TypeScript 印字制御ライブラリです。既製複写伝票（納品書、請求書、チェーンストア統一伝票、送り状、マニフェスト等）への高精度な枠合わせ印字を実現します。

## Features

- **Zero Dependencies & Universal**: Pure `Uint8Array` and standard Web APIs (`TextDecoder`)—runs anywhere (Browser, Node.js, Hono, Cloudflare Workers).
- **1/360-inch (`Dot360`) Coordinate System**: Intuitive unit helpers (`mm`, `inch`, `col`, `line`, `dot180`, `dot360`) with global origin offset (`offset`) for printer margin calibration.
- **Forward-Only Paper Feed Sorting**: Automatically flattens and sorts all layout elements top-to-bottom (`Y` ascending) then left-to-right (`X` ascending) to prevent paper jams on multi-part carbonless forms.
- **Zero-Dependency JIS X 0208 Kanji Encoder**: Built-in variant normalization (`髙` → `高`, `﨑` → `崎`, `㈱` → `(株)`, half-width Katakana → full-width) and automatic `FS &` / `FS .` mode switching.
- **3 Core Pre-printed Slip Primitives**:
  1. `text`: Coordinate-positioned text with bounding-box truncation and `left` / `center` / `right` alignment.
  2. `gridText`: Character-grid (fixed cell pitch) printing for postal codes, phone numbers, and right-justified currency digit boxes.
  3. `table`: Repeating detail rows with `maxRows` overflow protection and per-digit grid columns (`cellPitch`).
- **Pluggable Transports (`@injijs/core/transports`)**: `TcpTransport` (RAW Port 9100), `WebSerialTransport`, `WebUsbTransport`, and `MemoryTransport`.

## Quick Start

```ts
import { InjiBuilder, col, line, mm } from "@injijs/core";
import { TcpTransport } from "@injijs/core/transports";

const builder = new InjiBuilder({
  // Calibrate printer-specific physical margin drift
  offset: { x: mm(1.5), y: mm(-0.5) },
})
  // 1. Postal code in 7mm-pitch boxes (space skips the pre-printed hyphen box)
  .gridText(mm(25), mm(12), "123 4567", { cellPitch: mm(7) })
  // 2. Customer name with bold & double-width emphasis
  .text(mm(25), mm(22), "株式会社サンプル商事 御中", { bold: true, doubleWidth: true })
  // 3. Detail rows table
  .table({
    startY: line(10),
    rowHeight: line(2),
    maxRows: 5,
    columns: [
      { key: "name", x: mm(20), width: mm(80) },
      { key: "qty", x: mm(105), width: col(5), align: "right" },
      { key: "amount", x: mm(130), cellPitch: mm(5), totalCells: 7, align: "right" },
    ],
    rows: [
      { name: "複写伝票 A4 ノーカーボン", qty: 10, amount: 12800 },
      { name: "インクリボンカートリッジ", qty: 2, amount: 4500 },
    ],
  });

// Send to a network printer via RAW TCP Port 9100
const transport = new TcpTransport({ host: "192.168.1.200", port: 9100 });
await builder.print(transport);
```

## Development

```bash
# Install dependencies
vp install

# Format, lint, and type-check
vp check

# Run unit tests
vp test

# Build package (dist/)
vp run build
```

## License

[MIT](./LICENSE) License © 2026 [s-nishiura](https://github.com/s-nishiura)
