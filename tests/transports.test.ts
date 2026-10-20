import { describe, expect, test } from "vite-plus/test";
import {
  DEFAULT_CHUNK_SIZE,
  MemoryTransport,
  type SerialPortLike,
  type TcpSocketLike,
  TcpTransport,
  type UsbConfigurationLike,
  type UsbDeviceLike,
  type UsbOutTransferResultLike,
  WebSerialTransport,
  WebUsbTransport,
} from "../src/transports/index.ts";

describe("transports", () => {
  test("exports DEFAULT_CHUNK_SIZE as 4096 bytes", () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(4096);
  });

  describe("MemoryTransport", () => {
    test("records defensive copies of sent chunks and concatenates them via toUint8Array()", async () => {
      const transport = new MemoryTransport();
      const input = new Uint8Array([0x1b, 0x40]);

      await transport.send(input);
      // Mutate original buffer after send to verify defensive copy
      input[0] = 0xff;
      await transport.send(new Uint8Array([0x41, 0x0d, 0x0c]));

      expect(transport.chunks).toHaveLength(2);
      expect(transport.byteLength).toBe(5);
      expect(transport.toUint8Array()).toEqual(new Uint8Array([0x1b, 0x40, 0x41, 0x0d, 0x0c]));

      transport.clear();
      expect(transport.chunks).toHaveLength(0);
      expect(transport.byteLength).toBe(0);
    });
  });

  describe("TcpTransport", () => {
    test("validates host, port, timeoutMs, and chunkSize in constructor", () => {
      expect(() => new TcpTransport({ host: "   " })).toThrow(RangeError);
      expect(() => new TcpTransport({ host: "192.168.1.50", port: 0 })).toThrow(RangeError);
      expect(() => new TcpTransport({ host: "192.168.1.50", port: 70000 })).toThrow(RangeError);
      expect(() => new TcpTransport({ host: "192.168.1.50", timeoutMs: 0 })).toThrow(RangeError);
      expect(() => new TcpTransport({ host: "192.168.1.50", chunkSize: 0 })).toThrow(RangeError);
      expect(() => new TcpTransport({ host: "192.168.1.50", chunkSize: 1.5 })).toThrow(RangeError);
    });

    test("connects to default port 9100, writes data, and ends the socket cleanly", async () => {
      let connectedTarget: { host: string; port: number } | undefined;
      const writtenChunks: Uint8Array[] = [];
      let ended = false;

      const mockConnect = (opts: { host: string; port: number }): TcpSocketLike => {
        connectedTarget = opts;
        return {
          setTimeout() {},
          once(event: string, listener: (err?: Error) => void) {
            if (event === "connect") {
              queueMicrotask(() => listener());
            }
          },
          write(data: Uint8Array, callback?: (err?: Error | null) => void) {
            writtenChunks.push(data);
            callback?.(null);
          },
          end(callback?: () => void) {
            ended = true;
            callback?.();
          },
          destroy() {},
        };
      };

      const transport = new TcpTransport({ host: "192.168.1.200", connect: mockConnect });
      const payload = new Uint8Array([0x1b, 0x40, 0x41]);
      await transport.send(payload);

      expect(connectedTarget).toEqual({ host: "192.168.1.200", port: 9100 });
      expect(writtenChunks).toEqual([payload]);
      expect(ended).toBe(true);
    });

    test("splits large payloads by default 4096-byte chunkSize and custom chunkSize", async () => {
      const writtenChunks: Uint8Array[] = [];

      const mockConnect = (): TcpSocketLike => ({
        setTimeout() {},
        once(event: string, listener: (err?: Error) => void) {
          if (event === "connect") {
            queueMicrotask(() => listener());
          }
        },
        write(data: Uint8Array, callback?: (err?: Error | null) => void) {
          writtenChunks.push(data);
          callback?.(null);
        },
        end(callback?: () => void) {
          callback?.();
        },
        destroy() {},
      });

      // Default 4096-byte chunking: 5000 bytes -> 4096 + 904
      const defaultTransport = new TcpTransport({ host: "192.168.1.200", connect: mockConnect });
      await defaultTransport.send(new Uint8Array(5000).fill(0x41));
      expect(writtenChunks.map((c) => c.length)).toEqual([4096, 904]);

      // Custom chunkSize: 3 bytes on 7-byte payload -> 3 + 3 + 1
      writtenChunks.length = 0;
      const customTransport = new TcpTransport({
        host: "192.168.1.200",
        chunkSize: 3,
        connect: mockConnect,
      });
      await customTransport.send(new Uint8Array([1, 2, 3, 4, 5, 6, 7]));
      expect(writtenChunks).toEqual([
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
        new Uint8Array([7]),
      ]);
    });

    test("destroys the socket and rejects on socket error, write error, premature close, or timeout", async () => {
      let destroyedCount = 0;

      const errorSocket = (): TcpSocketLike => ({
        setTimeout() {},
        once(event: string, listener: (err?: Error) => void) {
          if (event === "error") {
            queueMicrotask(() => listener(new Error("ECONNREFUSED")));
          }
        },
        write() {},
        end() {},
        destroy() {
          destroyedCount++;
        },
      });

      const transport = new TcpTransport({ host: "192.168.1.200", connect: errorSocket });
      await expect(transport.send(new Uint8Array([0x1b, 0x40]))).rejects.toThrow("ECONNREFUSED");
      expect(destroyedCount).toBe(1);

      const writeErrSocket = (): TcpSocketLike => ({
        setTimeout() {},
        once(event: string, listener: (err?: Error) => void) {
          if (event === "connect") {
            queueMicrotask(() => listener());
          }
        },
        write(_data: Uint8Array, callback?: (err?: Error | null) => void) {
          callback?.(new Error("EPIPE"));
        },
        end() {},
        destroy() {
          destroyedCount++;
        },
      });

      const writeErrTransport = new TcpTransport({
        host: "192.168.1.200",
        connect: writeErrSocket,
      });
      await expect(writeErrTransport.send(new Uint8Array([0x1b, 0x40]))).rejects.toThrow("EPIPE");
      expect(destroyedCount).toBe(2);

      const closeSocket = (): TcpSocketLike => ({
        setTimeout() {},
        once(event: string, listener: (err?: Error) => void) {
          if (event === "close") {
            queueMicrotask(() => listener());
          }
        },
        write() {},
        end() {},
        destroy() {
          destroyedCount++;
        },
      });

      const closeTransport = new TcpTransport({ host: "192.168.1.200", connect: closeSocket });
      await expect(closeTransport.send(new Uint8Array([0x1b, 0x40]))).rejects.toThrow(
        "closed unexpectedly",
      );
      expect(destroyedCount).toBe(3);

      const timeoutSocket = (): TcpSocketLike => ({
        setTimeout(_ms: number, callback?: () => void) {
          queueMicrotask(() => callback?.());
        },
        once() {},
        write() {},
        end() {},
        destroy() {
          destroyedCount++;
        },
      });

      const timeoutTransport = new TcpTransport({
        host: "192.168.1.200",
        timeoutMs: 100,
        connect: timeoutSocket,
      });
      await expect(timeoutTransport.send(new Uint8Array([0x1b, 0x40]))).rejects.toThrow(
        "timed out",
      );
      expect(destroyedCount).toBe(4);
    });
  });

  describe("WebSerialTransport", () => {
    test("opens port if not writable, writes bytes in chunks, releases lock, and optionally closes port", async () => {
      let openedBaudRate: number | undefined;
      let lockReleased = false;
      let closed = false;
      const written: Uint8Array[] = [];
      let writableStream: SerialPortLike["writable"] = null;

      const mockPort: SerialPortLike = {
        get writable() {
          return writableStream;
        },
        async open(options: { baudRate: number }) {
          openedBaudRate = options.baudRate;
          writableStream = {
            getWriter() {
              return {
                async write(chunk: Uint8Array) {
                  written.push(chunk);
                },
                releaseLock() {
                  lockReleased = true;
                },
              };
            },
          };
        },
        async close() {
          closed = true;
        },
      };

      const transport = new WebSerialTransport(mockPort, {
        baudRate: 19200,
        chunkSize: 2,
        autoClose: true,
      });
      const payload = new Uint8Array([0x1b, 0x40, 0x41, 0x0d, 0x0c]);
      await transport.send(payload);

      expect(openedBaudRate).toBe(19200);
      expect(written).toEqual([
        new Uint8Array([0x1b, 0x40]),
        new Uint8Array([0x41, 0x0d]),
        new Uint8Array([0x0c]),
      ]);
      expect(lockReleased).toBe(true);
      expect(closed).toBe(true);
    });

    test("always releases writer lock in finally block even when write() rejects", async () => {
      let lockReleased = false;
      const mockPort: SerialPortLike = {
        writable: {
          getWriter() {
            return {
              async write() {
                throw new Error("Serial write failure");
              },
              releaseLock() {
                lockReleased = true;
              },
            };
          },
        },
        async open() {},
        async close() {},
      };

      const transport = new WebSerialTransport(mockPort);
      await expect(transport.send(new Uint8Array([0x1b, 0x40]))).rejects.toThrow(
        "Serial write failure",
      );
      expect(lockReleased).toBe(true);
    });

    test("validates baudRate and chunkSize in constructor", () => {
      const dummyPort: SerialPortLike = {
        writable: null,
        async open() {},
        async close() {},
      };
      expect(() => new WebSerialTransport(dummyPort, { baudRate: 0 })).toThrow(RangeError);
      expect(() => new WebSerialTransport(dummyPort, { chunkSize: 0 })).toThrow(RangeError);
    });
  });

  describe("WebUsbTransport", () => {
    test("opens USB device, selects configuration, claims interface, and transfers out in chunks", async () => {
      const calls: string[] = [];
      const transferred: Array<{ endpoint: number; data: Uint8Array }> = [];
      let isOpened = false;
      let currentConfig: UsbConfigurationLike | null = null;

      const mockDevice: UsbDeviceLike = {
        get opened() {
          return isOpened;
        },
        get configuration() {
          return currentConfig;
        },
        async open() {
          calls.push("open");
          isOpened = true;
        },
        async selectConfiguration(val: number) {
          calls.push(`selectConfig:${val}`);
          currentConfig = { configurationValue: val };
        },
        async claimInterface(num: number) {
          calls.push(`claimInterface:${num}`);
        },
        async transferOut(
          endpointNumber: number,
          data: Uint8Array,
        ): Promise<UsbOutTransferResultLike> {
          calls.push(`transferOut:${endpointNumber}`);
          transferred.push({ endpoint: endpointNumber, data });
          return { bytesWritten: data.length, status: "ok" };
        },
        async close() {
          calls.push("close");
        },
      };

      const transport = new WebUsbTransport(mockDevice, {
        configurationValue: 1,
        interfaceNumber: 0,
        endpointNumber: 2,
        chunkSize: 2,
        autoClose: true,
      });
      const payload = new Uint8Array([0x1b, 0x40, 0x0c]);
      await transport.send(payload);

      expect(calls).toEqual([
        "open",
        "selectConfig:1",
        "claimInterface:0",
        "transferOut:2",
        "transferOut:2",
        "close",
      ]);
      expect(transferred).toEqual([
        { endpoint: 2, data: new Uint8Array([0x1b, 0x40]) },
        { endpoint: 2, data: new Uint8Array([0x0c]) },
      ]);
    });

    test("validates USB configurationValue, interfaceNumber, endpointNumber, and chunkSize in constructor", () => {
      const dummyDevice: UsbDeviceLike = {
        opened: true,
        configuration: { configurationValue: 1 },
        async open() {},
        async selectConfiguration() {},
        async claimInterface() {},
        async transferOut(
          _endpointNumber: number,
          data: Uint8Array,
        ): Promise<UsbOutTransferResultLike> {
          return { bytesWritten: data.length, status: "ok" };
        },
        async close() {},
      };
      expect(() => new WebUsbTransport(dummyDevice, { configurationValue: 0 })).toThrow(RangeError);
      expect(() => new WebUsbTransport(dummyDevice, { interfaceNumber: -1 })).toThrow(RangeError);
      expect(() => new WebUsbTransport(dummyDevice, { endpointNumber: 0 })).toThrow(RangeError);
      expect(() => new WebUsbTransport(dummyDevice, { chunkSize: 0 })).toThrow(RangeError);
    });
  });
});
