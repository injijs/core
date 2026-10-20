import { createConnection } from "node:net";
import { DEFAULT_CHUNK_SIZE, type PrinterTransport, splitIntoChunks } from "./types.ts";

/**
 * Minimal structural interface for a Node.js-compatible TCP socket.
 * Allows injecting mock sockets in unit tests without opening real network connections.
 */
export interface TcpSocketLike {
  setTimeout(timeout: number, callback?: () => void): unknown;
  once(event: "connect" | "close" | "error", listener: (err?: Error) => void): unknown;
  write(data: Uint8Array, callback?: (err?: Error | null) => void): unknown;
  end(callback?: () => void): unknown;
  destroy(error?: Error): unknown;
}

/**
 * Configuration options for {@link TcpTransport}.
 */
export interface TcpTransportOptions {
  /** IP address or hostname of the network printer or print server. */
  host: string;
  /** Raw TCP printing port (AppSocket / JetDirect). Defaults to `9100`. */
  port?: number;
  /** Socket connection and inactivity timeout in milliseconds. Defaults to `5000`. */
  timeoutMs?: number;
  /** Maximum byte size per write chunk. Defaults to {@link DEFAULT_CHUNK_SIZE} (`4096`). */
  chunkSize?: number;
  /** Optional custom socket factory used for dependency injection in tests. */
  connect?: (options: { host: string; port: number }) => TcpSocketLike;
}

/**
 * Raw TCP (Port 9100 / JetDirect) printer transport for Node.js environments.
 */
export class TcpTransport implements PrinterTransport {
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;
  private readonly chunkSize: number;
  private readonly connectImpl: (options: { host: string; port: number }) => TcpSocketLike;

  /**
   * Creates a new {@link TcpTransport} instance.
   *
   * @param options - Target printer host, port (default `9100`), timeout, and chunk size settings.
   * @throws {@link RangeError} If `host` is empty, `port` is outside `1..65535`, `timeoutMs` is not positive, or `chunkSize` is not a positive integer.
   */
  constructor(options: TcpTransportOptions) {
    const trimmedHost = options.host.trim();
    if (trimmedHost.length === 0) {
      throw new RangeError("TCP host must be a non-empty string.");
    }

    const port = options.port ?? 9100;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new RangeError("TCP port must be an integer between 1 and 65535.");
    }

    const timeoutMs = options.timeoutMs ?? 5000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError("TCP timeoutMs must be a positive finite number.");
    }

    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new RangeError("TCP chunkSize must be a positive integer.");
    }

    this.host = trimmedHost;
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.chunkSize = chunkSize;
    this.connectImpl = options.connect ?? ((opts) => createConnection(opts));
  }

  /**
   * Opens a TCP connection to the printer, writes the ESC/P byte sequence in chunks, and closes the socket cleanly.
   *
   * @param data - Raw ESC/P 24-J84 byte sequence to transmit.
   */
  send(data: Uint8Array): Promise<void> {
    const chunks = splitIntoChunks(data, this.chunkSize);

    return new Promise<void>((resolve, reject) => {
      const socket = this.connectImpl({ host: this.host, port: this.port });
      let settled = false;

      const fail = (err: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        reject(err);
      };

      socket.setTimeout(this.timeoutMs, () => {
        fail(
          new Error(
            `TCP printer connection timed out after ${this.timeoutMs}ms (${this.host}:${this.port}).`,
          ),
        );
      });

      socket.once("error", (err?: Error) => {
        fail(err ?? new Error("TCP printer socket error."));
      });

      socket.once("close", () => {
        if (!settled) {
          fail(
            new Error(`TCP printer connection closed unexpectedly (${this.host}:${this.port}).`),
          );
        }
      });

      socket.once("connect", () => {
        let index = 0;

        const writeNext = (): void => {
          if (settled) {
            return;
          }
          const chunk = chunks[index++];
          if (!chunk) {
            socket.end(() => {
              if (!settled) {
                settled = true;
                resolve();
              }
            });
            return;
          }

          socket.write(chunk, (writeErr) => {
            if (writeErr) {
              fail(writeErr);
              return;
            }
            writeNext();
          });
        };

        writeNext();
      });
    });
  }
}
