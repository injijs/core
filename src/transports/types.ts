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
