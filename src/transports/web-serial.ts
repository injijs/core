import type { PrinterTransport } from "./types.ts";

/**
 * Minimal structural interface for a Web Serial API writer (`WritableStreamDefaultWriter<Uint8Array>`).
 */
export interface SerialPortWriterLike {
  write(chunk: Uint8Array): Promise<void>;
  releaseLock(): void;
}

/**
 * Minimal structural interface for a browser Web Serial API `SerialPort` object.
 * Avoids requiring global `@types/w3c-web-serial` in consumer projects.
 */
export interface SerialPortLike {
  readonly writable: {
    getWriter(): SerialPortWriterLike;
  } | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

/**
 * Configuration options for {@link WebSerialTransport}.
 */
export interface WebSerialTransportOptions {
  /** Serial baud rate used when opening the port. Defaults to `9600`. */
  baudRate?: number;
  /** Whether to close the serial port automatically after each {@link WebSerialTransport.send} call. Defaults to `false`. */
  autoClose?: boolean;
}

/**
 * Browser Web Serial API transport (`navigator.serial`) for RS-232C and USB-Serial impact printers.
 */
export class WebSerialTransport implements PrinterTransport {
  private readonly port: SerialPortLike;
  private readonly baudRate: number;
  private readonly autoClose: boolean;

  /**
   * Creates a new {@link WebSerialTransport} wrapping a browser `SerialPort`.
   *
   * @param port - Web Serial port obtained via `navigator.serial.requestPort()`.
   * @param options - Optional baud rate (default `9600`) and auto-close settings.
   * @throws {@link RangeError} If `baudRate` is not a positive finite integer.
   */
  constructor(port: SerialPortLike, options?: WebSerialTransportOptions) {
    const baudRate = options?.baudRate ?? 9600;
    if (!Number.isInteger(baudRate) || baudRate <= 0) {
      throw new RangeError("Serial baudRate must be a positive integer.");
    }

    this.port = port;
    this.baudRate = baudRate;
    this.autoClose = options?.autoClose ?? false;
  }

  /**
   * Opens the serial port if not already writable, writes the ESC/P byte stream, and releases the writer lock.
   *
   * @param data - Raw ESC/P 24-J84 byte sequence to transmit.
   */
  async send(data: Uint8Array): Promise<void> {
    if (!this.port.writable) {
      await this.port.open({ baudRate: this.baudRate });
    }
    if (!this.port.writable) {
      throw new Error("SerialPort writable stream is unavailable after opening.");
    }

    const writer = this.port.writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }

    if (this.autoClose) {
      await this.port.close();
    }
  }
}

/**
 * Minimal structural interface for a browser WebUSB API `USBDevice` object.
 * Avoids requiring global `@types/w3c-web-usb` in consumer projects.
 */
export interface UsbDeviceLike {
  readonly opened: boolean;
  readonly configuration: unknown | null;
  open(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * Configuration options for {@link WebUsbTransport}.
 */
export interface WebUsbTransportOptions {
  /** USB configuration value to select when opening the device. Defaults to `1`. */
  configurationValue?: number;
  /** USB interface number to claim. Defaults to `0`. */
  interfaceNumber?: number;
  /** Bulk OUT endpoint number used by `transferOut`. Defaults to `1`. */
  endpointNumber?: number;
  /** Whether to close the USB device automatically after each {@link WebUsbTransport.send} call. Defaults to `false`. */
  autoClose?: boolean;
}

/**
 * Browser WebUSB API transport (`navigator.usb`) for direct USB impact printers.
 */
export class WebUsbTransport implements PrinterTransport {
  private readonly device: UsbDeviceLike;
  private readonly configurationValue: number;
  private readonly interfaceNumber: number;
  private readonly endpointNumber: number;
  private readonly autoClose: boolean;

  /**
   * Creates a new {@link WebUsbTransport} wrapping a browser `USBDevice`.
   *
   * @param device - WebUSB device obtained via `navigator.usb.requestDevice()`.
   * @param options - Optional USB configuration, interface, and bulk OUT endpoint settings.
   * @throws {@link RangeError} If `configurationValue`, `interfaceNumber`, or `endpointNumber` is invalid.
   */
  constructor(device: UsbDeviceLike, options?: WebUsbTransportOptions) {
    const configurationValue = options?.configurationValue ?? 1;
    if (!Number.isInteger(configurationValue) || configurationValue < 1) {
      throw new RangeError("USB configurationValue must be a positive integer.");
    }

    const interfaceNumber = options?.interfaceNumber ?? 0;
    if (!Number.isInteger(interfaceNumber) || interfaceNumber < 0) {
      throw new RangeError("USB interfaceNumber must be a non-negative integer.");
    }

    const endpointNumber = options?.endpointNumber ?? 1;
    if (!Number.isInteger(endpointNumber) || endpointNumber < 1) {
      throw new RangeError("USB endpointNumber must be a positive integer.");
    }

    this.device = device;
    this.configurationValue = configurationValue;
    this.interfaceNumber = interfaceNumber;
    this.endpointNumber = endpointNumber;
    this.autoClose = options?.autoClose ?? false;
  }

  /**
   * Opens and claims the USB printer interface if needed, then transfers the ESC/P byte stream to the bulk OUT endpoint.
   *
   * @param data - Raw ESC/P 24-J84 byte sequence to transmit.
   */
  async send(data: Uint8Array): Promise<void> {
    if (!this.device.opened) {
      await this.device.open();
    }
    if (this.device.configuration === null) {
      await this.device.selectConfiguration(this.configurationValue);
    }
    await this.device.claimInterface(this.interfaceNumber);
    await this.device.transferOut(this.endpointNumber, data);

    if (this.autoClose) {
      await this.device.close();
    }
  }
}
