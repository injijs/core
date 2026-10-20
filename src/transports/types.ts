/**
 * Default maximum byte size per transmission chunk (`4096` bytes = 4 KB).
 * Prevents overflowing hardware receive buffers on dot-matrix impact printers.
 */
export const DEFAULT_CHUNK_SIZE = 4096;

/**
 * Common interface for all ESC/P printer communication transports
 * (TCP Port 9100, Web Serial, WebUSB, In-Memory testing, etc.).
 */
export interface PrinterTransport {
  /**
   * Sends a raw ESC/P byte stream to the target printer.
   *
   * @param data - Raw ESC/P 24-J84 command and text byte sequence.
   */
  send(data: Uint8Array): Promise<void>;
}

/**
 * Splits a byte buffer into zero-copy `Uint8Array` views of at most `chunkSize` bytes.
 *
 * @param data - Full byte buffer to split.
 * @param chunkSize - Maximum byte length of each chunk.
 * @returns Array of `Uint8Array` chunks (at least one chunk is returned even when `data` is empty).
 */
export function splitIntoChunks(data: Uint8Array, chunkSize: number): Uint8Array[] {
  if (data.length <= chunkSize) {
    return [data];
  }

  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    chunks.push(data.subarray(offset, offset + chunkSize));
  }
  return chunks;
}
