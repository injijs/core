import type { PrinterTransport } from "./types.ts";

/**
 * In-memory transport for unit testing, dry-run inspection, and debugging.
 * Stores defensive copies of every byte chunk passed to {@link send}.
 */
export class MemoryTransport implements PrinterTransport {
  /** Recorded chunks in the order they were sent. */
  readonly chunks: Uint8Array[] = [];

  /**
   * Records a defensive copy of `data` in memory.
   *
   * @param data - ESC/P byte stream to record.
   */
  async send(data: Uint8Array): Promise<void> {
    const copy = new Uint8Array(data.length);
    copy.set(data);
    this.chunks.push(copy);
  }

  /**
   * Total number of bytes recorded across all sent chunks.
   */
  get byteLength(): number {
    let total = 0;
    for (const chunk of this.chunks) {
      total += chunk.length;
    }
    return total;
  }

  /**
   * Concatenates all recorded chunks into a single `Uint8Array`.
   *
   * @returns Combined byte sequence of all data sent so far.
   */
  toUint8Array(): Uint8Array {
    const output = new Uint8Array(this.byteLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }

  /**
   * Clears all recorded byte chunks.
   */
  clear(): void {
    this.chunks.length = 0;
  }
}
