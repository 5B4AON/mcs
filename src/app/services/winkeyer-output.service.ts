/**
 * Morse Code Studio
 */

import { Injectable, NgZone, signal } from '@angular/core';
import { SettingsService } from './settings.service';
import { PROSIGN_TO_PUNCTUATION } from '../morse-table';

/**
 * WinKeyer Host-Mode Protocol Constants.
 *
 * The K1EL WinKeyer (WK2 / WK3 / WKUSB) accepts host-mode commands
 * over a serial port at 1200 baud, 8 data bits, no parity, 2 stop bits.
 *
 * Reference: K1EL WinKeyer3 IC Interface and Operation Manual.
 */
const WK_BAUD = 1200;

/** Admin command prefix — all admin commands start with 0x00 */
const WK_ADMIN = 0x00;

/** Admin sub-commands */
const WK_ADMIN_OPEN  = 0x02;   // Enter host mode; returns firmware version byte
const WK_ADMIN_CLOSE = 0x03;   // Exit host mode
const WK_ADMIN_ECHO  = 0x04;   // Echo test: next byte is returned unchanged
const WK_ADMIN_WK2   = 0x11;   // Switch to WK2 mode (if WK3 IC)

/** Immediate commands (single byte 0x01–0x1F) */
const WK_SET_SPEED   = 0x02;   // Next byte = WPM (5–99)
const WK_CLEAR_BUF   = 0x0A;   // Clear the transmit character buffer
const WK_BUF_SPEED   = 0x1C;   // Buffered speed change: next byte = WPM

/** Status byte bits returned by WinKeyer */
const WK_STATUS_BUSY = 0x04;   // Bit 2: character buffer not empty / sending



/**
 * WinKeyer Output Service — sends decoded text to a K1EL WinKeyer device
 * over the Web Serial API.
 *
 * WinKeyer generates perfectly timed morse keying on its output pin,
 * relieving the host from timing-critical operations. The host simply
 * sends plain ASCII characters and WinKeyer handles the CW timing.
 *
 * Flow:
 *  1. User selects a serial port and enables WinKeyer output.
 *  2. open() sends the host-open admin command, reads firmware version.
 *  3. The app feeds decoded characters via sendChar() / sendText(),
 *     filtered by the configured forward mode (RX, TX, or both).
 *  4. setSpeed() updates WinKeyer's internal WPM.
 *  5. close() sends the host-close command and releases the port.
 *
 * Character Mapping:
 *  WinKeyer accepts ASCII 0x20–0x7F. Letters, digits, and common
 *  punctuation are sent directly. Characters outside this range are
 *  silently dropped.
 */

/**
 * USB Vendor/Product ID filters for common USB-to-serial adapter chips.
 * WinKeyer (WKUSB) uses an FTDI FT232R (VID 0x0403).
 * Passing filters to requestPort() helps Android Chrome match devices.
 */
const SERIAL_FILTERS: SerialPortFilter[] = [
  { usbVendorId: 0x0403 },  // FTDI (FT232R, FT2232, FT231X, etc.)
  { usbVendorId: 0x1A86 },  // QinHeng / CH340, CH341
  { usbVendorId: 0x10C4 },  // Silicon Labs CP210x
  { usbVendorId: 0x067B },  // Prolific PL2303
];

@Injectable({ providedIn: 'root' })
export class WinkeyerOutputService {
  /** Available serial ports (previously granted by the user) */
  readonly ports = signal<SerialPort[]>([]);

  /** Whether the WinKeyer port is currently open and in host mode */
  readonly connected = signal(false);

  /** Firmware version returned by WinKeyer on host-open (0 = unknown) */
  readonly firmwareVersion = signal(0);

  /** Last error message for UI display */
  readonly lastError = signal<string | null>(null);

  /** The active serial port in host mode */
  private activePort: SerialPort | null = null;

  /** Writer for sending bytes to WinKeyer */
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  /** Reader for receiving status/response bytes from WinKeyer */
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  /** Background reader loop abort flag */
  private readLoopRunning = false;

  /** Bound handler for navigator.serial connect events */
  private readonly onSerialConnect = () => this.handleSerialConnect();

  /** Bound handler for port disconnect events (bound per-port in open()) */
  private portDisconnectHandler: (() => void) | null = null;

  /** Whether auto-reconnect is in progress */
  private reconnecting = false;

  /** Latest status byte from WinKeyer */
  readonly status = signal(0);

  /** Whether WinKeyer is currently sending (busy bit in status) */
  readonly busy = signal(false);

  constructor(
    private settings: SettingsService,
    private zone: NgZone,
  ) {
    this.refreshPorts();
    // Listen for newly connected serial devices for auto-reconnect
    if ('serial' in navigator) {
      navigator.serial.addEventListener('connect', this.onSerialConnect);
    }
  }

  // ---- Port Management ----

  /** Refresh the list of previously-granted serial ports */
  async refreshPorts(): Promise<void> {
    if (!('serial' in navigator)) {
      this.lastError.set('Web Serial API not supported in this browser.');
      return;
    }
    try {
      const ports = await navigator.serial.getPorts();
      this.ports.set(ports);
    } catch (e: any) {
      this.lastError.set(e.message ?? 'Failed to enumerate serial ports.');
    }
  }

  /** Prompt the user to grant access to a new serial port */
  async requestPort(): Promise<void> {
    if (!('serial' in navigator)) {
      this.lastError.set('Web Serial API not supported in this browser.');
      return;
    }
    try {
      // Try with filters first (required on some platforms like Android)
      await navigator.serial.requestPort({ filters: SERIAL_FILTERS });
      await this.refreshPorts();
      this.lastError.set(null);
    } catch (e: any) {
      if (e.name === 'NotFoundError') {
        // No device matched filters — retry without filters (desktop fallback)
        try {
          await navigator.serial.requestPort();
          await this.refreshPorts();
          this.lastError.set(null);
        } catch (e2: any) {
          if (e2.name === 'NotFoundError') {
            this.lastError.set('No serial port selected. If no devices appeared, check that your adapter is plugged in and your browser supports it.');
          } else {
            this.lastError.set(e2.message ?? 'Failed to request serial port.');
          }
        }
      } else {
        this.lastError.set(e.message ?? 'Failed to request serial port.');
      }
    }
  }

  // ---- Connection ----

  /**
   * Open the serial port and enter WinKeyer host mode.
   *
   * Protocol:
   *  1. Open port at 1200 baud, 8N2
   *  2. Send Admin:Open (0x00, 0x02)
   *  3. Read version byte response
   *  4. Set the configured WPM speed
   */
  async open(portIndex: number): Promise<void> {
    await this.close();

    const ports = this.ports();
    if (portIndex < 0 || portIndex >= ports.length) {
      this.lastError.set('Invalid port index.');
      return;
    }

    const port = ports[portIndex];
    try {
      await port.open({
        baudRate: WK_BAUD,
        dataBits: 8,
        stopBits: 2,
        parity: 'none',
        flowControl: 'none',
        bufferSize: 256,
      });

      this.activePort = port;

      // Listen for physical disconnection of this port
      this.portDisconnectHandler = () => {
        this.zone.run(() => {
          this.readLoopRunning = false;
          try { this.reader?.cancel(); } catch { /* ignore */ }
          try { this.reader?.releaseLock(); } catch { /* ignore */ }
          this.reader = null;
          try { this.writer?.releaseLock(); } catch { /* ignore */ }
          this.writer = null;
          this.activePort = null;
          this.connected.set(false);
          this.firmwareVersion.set(0);
          this.status.set(0);
          this.busy.set(false);
          this.portDisconnectHandler = null;
          this.refreshPorts();
        });
      };
      port.addEventListener('disconnect', this.portDisconnectHandler);

      // Get writer
      if (!port.writable) {
        throw new Error('Port opened but writable stream not available.');
      }
      this.writer = port.writable.getWriter();

      // Get reader for status responses
      if (port.readable) {
        this.reader = port.readable.getReader();
        this.startReadLoop();
      }

      // Send host-open command
      await this.writeBytes([WK_ADMIN, WK_ADMIN_OPEN]);

      // Wait briefly for version response
      await this.sleep(100);

      // Set speed from settings
      const wpm = this.settings.settings().winkeyerWpm;
      await this.writeBytes([WK_SET_SPEED, Math.max(5, Math.min(99, wpm))]);

      this.connected.set(true);
      this.lastError.set(null);
    } catch (e: any) {
      this.lastError.set(e.message ?? 'Failed to open WinKeyer port.');
      await this.forceCleanup();
    }
  }

  /**
   * Close the WinKeyer connection.
   * Sends the host-close command before releasing the port.
   */
  async close(): Promise<void> {
    if (!this.activePort) return;

    // Remove disconnect listener
    if (this.portDisconnectHandler) {
      this.activePort.removeEventListener('disconnect', this.portDisconnectHandler);
      this.portDisconnectHandler = null;
    }

    try {
      // Clear any pending text
      if (this.writer) {
        await this.writeBytes([WK_CLEAR_BUF]);
        // Send host-close command
        await this.writeBytes([WK_ADMIN, WK_ADMIN_CLOSE]);
      }
    } catch { /* port may already be in error state */ }

    await this.forceCleanup();
  }

  /** Release all resources without sending close commands */
  private async forceCleanup(): Promise<void> {
    this.readLoopRunning = false;

    try { this.reader?.cancel(); } catch { /* ignore */ }
    try { this.reader?.releaseLock(); } catch { /* ignore */ }
    this.reader = null;

    try { this.writer?.releaseLock(); } catch { /* ignore */ }
    this.writer = null;

    try { await this.activePort?.close(); } catch { /* ignore */ }
    this.activePort = null;

    this.connected.set(false);
    this.firmwareVersion.set(0);
    this.status.set(0);
    this.busy.set(false);
  }

  // ---- Sending Characters ----

  /**
   * Send a single character to WinKeyer for transmission.
   * WinKeyer accepts ASCII 0x20–0x7F and generates perfectly timed CW.
   * Characters outside this range are silently dropped.
   *
   * Prosigns are handled as follows:
   * - Clashing prosigns (e.g., <AR>) are converted to their punctuation equivalent (+)
   * - Non-clashing prosigns (e.g., <SK>, <HH>) are skipped (WinKeyer doesn't support them)
   */
  async sendChar(char: string): Promise<void> {
    if (!this.connected() || !this.writer) return;
    if (!this.settings.settings().winkeyerEnabled) return;

    let charToSend = char;

    // Handle prosign patterns: <LETTERS>
    if (/^<[A-Z]+>$/.test(char)) {
      // Check if this prosign has a punctuation equivalent
      const punct = PROSIGN_TO_PUNCTUATION[char];
      if (punct) {
        // Clashing prosign - send as punctuation
        charToSend = punct;
      } else {
        // Non-clashing prosign (e.g., <SK>, <HH>, <SOS>, <BK>)
        // WinKeyer doesn't support these - skip silently
        return;
      }
    }

    const code = charToSend.toUpperCase().charCodeAt(0);
    // WinKeyer accepts printable ASCII (space through tilde)
    if (code >= 0x20 && code <= 0x7E) {
      await this.writeBytes([code]);
    }
  }

  /**
   * Send a string to WinKeyer for transmission.
   * Characters are buffered internally by WinKeyer (up to ~160 chars).
   *
   * Prosigns in the string are converted to punctuation or skipped:
   * - <AR> → +, <AS> → &, <BT> → =, <KN> → (
   * - <SK>, <HH>, <SOS>, <BK> are skipped (not supported by WinKeyer)
   */
  async sendText(text: string): Promise<void> {
    if (!this.connected() || !this.writer) return;
    if (!this.settings.settings().winkeyerEnabled) return;

    const upper = text.toUpperCase();
    const bytes: number[] = [];
    let i = 0;

    while (i < upper.length) {
      // Check for prosign pattern
      if (upper[i] === '<') {
        const endIdx = upper.indexOf('>', i);
        if (endIdx !== -1 && endIdx > i + 1) {
          const prosignPattern = upper.substring(i, endIdx + 1);
          if (/^<[A-Z]+>$/.test(prosignPattern)) {
            // Check if this prosign has a punctuation equivalent
            const punct = PROSIGN_TO_PUNCTUATION[prosignPattern];
            if (punct) {
              const code = punct.charCodeAt(0);
              if (code >= 0x20 && code <= 0x7E) {
                bytes.push(code);
              }
            }
            // Skip non-clashing prosigns
            i = endIdx + 1;
            continue;
          }
        }
      }

      // Regular character
      const code = upper.charCodeAt(i);
      if (code >= 0x20 && code <= 0x7E) {
        bytes.push(code);
      }
      i++;
    }

    if (bytes.length > 0) {
      await this.writeBytes(bytes);
    }
  }

  /**
   * Send a decoded character to WinKeyer, filtered by forwarding mode.
   * Called by the app component when the decoder produces a new character.
   *
   * @param char  The decoded character
   * @param source  Whether this came from 'rx' or 'tx' decoder pool
   */
  async forwardDecodedChar(char: string, source: 'rx' | 'tx'): Promise<void> {
    if (!this.settings.settings().winkeyerEnabled) return;

    const fwd = this.settings.settings().winkeyerForward;
    if (fwd === 'both' || fwd === source) {
      await this.sendChar(char);
    }
  }

  /**
   * Set WinKeyer's internal WPM speed.
   * Valid range: 5–99 WPM.
   */
  async setSpeed(wpm: number): Promise<void> {
    if (!this.connected() || !this.writer) return;
    const clamped = Math.max(5, Math.min(99, Math.round(wpm)));
    await this.writeBytes([WK_SET_SPEED, clamped]);
  }

  /** Clear WinKeyer's transmit buffer (abort current sending) */
  async clearBuffer(): Promise<void> {
    if (!this.connected() || !this.writer) return;
    await this.writeBytes([WK_CLEAR_BUF]);
  }

  /**
   * Test: send "TEST" to WinKeyer to verify the connection.
   */
  async test(): Promise<void> {
    if (!this.connected()) return;
    await this.sendText('TEST ');
  }

  // ---- Internal ----

  /** Write raw bytes to the serial port */
  private async writeBytes(bytes: number[]): Promise<void> {
    if (!this.writer) return;
    try {
      await this.writer.write(new Uint8Array(bytes));
    } catch (e: any) {
      this.lastError.set(e.message ?? 'Write failed.');
    }
  }

  /**
   * Background read loop — processes status bytes from WinKeyer.
   *
   * WinKeyer sends status bytes (0xC0–0xC3) and echo-back bytes
   * asynchronously. The status byte indicates whether WinKeyer
   * is busy sending, buffer is full, etc.
   */
  private async startReadLoop(): Promise<void> {
    if (!this.reader) return;
    this.readLoopRunning = true;

    try {
      while (this.readLoopRunning) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value) continue;

        for (const byte of value) {
          // Status bytes have bit 7 and bit 6 set (0xC0–0xFF range)
          if ((byte & 0xC0) === 0xC0) {
            this.status.set(byte & 0x3F);
            this.busy.set(!!(byte & WK_STATUS_BUSY));
          } else if (byte > 0 && byte < 0x20) {
            // Version response from host-open command
            this.firmwareVersion.set(byte);
          }
        }
      }
    } catch {
      // Port closed or read error — expected during cleanup
    } finally {
      this.readLoopRunning = false;
    }
  }

  /** Get a human-readable label for a serial port */
  portLabel(port: SerialPort): string {
    const info = port.getInfo();
    if (info.usbVendorId !== undefined) {
      return `USB Serial (VID:${info.usbVendorId.toString(16).padStart(4, '0')} PID:${info.usbProductId?.toString(16).padStart(4, '0') ?? '????'})`;
    }
    return 'Serial Port';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Handle a serial device being physically connected.
   * If the service is enabled and currently disconnected, attempt to
   * re-open the configured port after a short settling delay.
   */
  private handleSerialConnect(): void {
    if (!this.settings.settings().winkeyerEnabled) return;
    if (this.connected()) return;
    if (this.reconnecting) return;
    this.reconnecting = true;
    // Allow the port to settle before attempting to open
    setTimeout(async () => {
      try {
        await this.refreshPorts();
        const idx = this.settings.settings().winkeyerPortIndex;
        if (idx >= 0 && idx < this.ports().length && !this.connected()) {
          await this.open(idx);
        }
      } finally {
        this.reconnecting = false;
      }
    }, 1000);
  }
}
