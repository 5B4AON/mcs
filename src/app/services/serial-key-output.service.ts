/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, NgZone, signal } from '@angular/core';
import { SettingsService } from './settings.service';

export type SerialPin = 'dtr' | 'rts';

/**
 * Serial Key Output Service — keys a transmitter via a serial port DTR or RTS line.
 *
 * Uses the Web Serial API (navigator.serial) to toggle DTR or RTS.
 * setSignals() is typically < 1ms on modern OS serial drivers, easily
 * supporting 50+ WPM morse speeds (dit ≈ 24ms at 50 WPM).
 *
 * Flow:
 *  1. User clicks "Request Port" → browser shows a picker → port is granted.
 *  2. Granted ports are remembered across reloads via navigator.serial.getPorts().
 *  3. User selects a port and pin (DTR or RTS), then enables it.
 *  4. keyDown() / keyUp() toggle the selected pin.
 *  5. schedulePulse() handles timed keying for the encoder.
 */

/**
 * USB Vendor/Product ID filters for common USB-to-serial adapter chips.
 * Passing filters to requestPort() helps Android Chrome match devices
 * that would otherwise not appear in the picker.
 */
const SERIAL_FILTERS: SerialPortFilter[] = [
  { usbVendorId: 0x0403 },  // FTDI (FT232R, FT2232, FT231X, etc.)
  { usbVendorId: 0x1A86 },  // QinHeng / CH340, CH341
  { usbVendorId: 0x10C4 },  // Silicon Labs CP210x
  { usbVendorId: 0x067B },  // Prolific PL2303
  { usbVendorId: 0x2341 },  // Arduino
  { usbVendorId: 0x1B4F },  // SparkFun
  { usbVendorId: 0x239A },  // Adafruit
  { usbVendorId: 0x2E8A },  // Raspberry Pi (Pico)
];

@Injectable({ providedIn: 'root' })
export class SerialKeyOutputService {
  /** Available serial ports (previously granted by the user) */
  readonly ports = signal<SerialPort[]>([]);

  /** The currently opened port (null if not connected) */
  private activePort: SerialPort | null = null;

  /** Whether the port is currently open */
  readonly connected = signal(false);

  /** Last error message (for UI display) */
  readonly lastError = signal<string | null>(null);

  /** Track current key state for idempotency */
  private keyIsDown = false;

  /** Bound handler for navigator.serial connect events */
  private readonly onSerialConnect = () => this.handleSerialConnect();

  /** Bound handler for port disconnect events (bound per-port in open()) */
  private portDisconnectHandler: (() => void) | null = null;

  /** Whether auto-reconnect is in progress */
  private reconnecting = false;

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

  /** Open the serial port at the given index in the ports list */
  async open(portIndex: number): Promise<void> {
    await this.close();

    const ports = this.ports();
    if (portIndex < 0 || portIndex >= ports.length) {
      this.lastError.set('Invalid port index.');
      return;
    }

    const port = ports[portIndex];
    try {
      // Open with a low baud rate; we only use control signals, not data
      await port.open({ baudRate: 9600 });
      this.activePort = port;
      this.connected.set(true);
      this.lastError.set(null);

      // Listen for physical disconnection of this port
      this.portDisconnectHandler = () => {
        this.zone.run(() => {
          this.activePort = null;
          this.connected.set(false);
          this.keyIsDown = false;
          this.portDisconnectHandler = null;
          this.refreshPorts();
        });
      };
      port.addEventListener('disconnect', this.portDisconnectHandler);

      // Set initial state (active when inverted, inactive when normal)
      const s = this.settings.settings();
      const idle = s.serialInvert;
      await port.setSignals({
        dataTerminalReady: idle,
        requestToSend: idle,
      });
    } catch (e: any) {
      this.lastError.set(e.message ?? 'Failed to open serial port.');
      this.activePort = null;
      this.connected.set(false);
    }
  }

  /** Close the active serial port */
  async close(): Promise<void> {
    if (!this.activePort) return;
    // Remove disconnect listener
    if (this.portDisconnectHandler) {
      this.activePort.removeEventListener('disconnect', this.portDisconnectHandler);
      this.portDisconnectHandler = null;
    }
    try {
      // Ensure key-up before closing
      if (this.keyIsDown) {
        const s = this.settings.settings();
        const idle = s.serialInvert;
        await this.activePort.setSignals({
          dataTerminalReady: idle,
          requestToSend: idle,
        });
        this.keyIsDown = false;
      }
      await this.activePort.close();
    } catch { /* port may already be closed */ }
    this.activePort = null;
    this.connected.set(false);
  }

  /** Assert the selected pin HIGH (key down) — or LOW when inverted */
  keyDown(source: 'rx' | 'tx' = 'tx'): void {
    if (!this.activePort || this.keyIsDown) return;
    const s = this.settings.settings();
    if (!s.serialEnabled) return;
    if (s.serialForward !== 'both' && s.serialForward !== source) return;
    this.keyIsDown = true;

    const active = !s.serialInvert;  // true=HIGH when normal, false=LOW when inverted
    const signal: SerialOutputSignals = s.serialPin === 'dtr'
      ? { dataTerminalReady: active }
      : { requestToSend: active };
    this.activePort.setSignals(signal).catch(() => {});
  }

  /** De-assert the selected pin LOW (key up) — or HIGH when inverted */
  keyUp(): void {
    if (!this.activePort || !this.keyIsDown) return;
    this.keyIsDown = false;

    const s = this.settings.settings();
    const idle = s.serialInvert;  // false=LOW when normal, true=HIGH when inverted
    const signal: SerialOutputSignals = s.serialPin === 'dtr'
      ? { dataTerminalReady: idle }
      : { requestToSend: idle };
    this.activePort.setSignals(signal).catch(() => {});
  }

  /** Timed pulse for encoder — asserts pin for durationMs then de-asserts */
  async schedulePulse(durationMs: number, source: 'rx' | 'tx' = 'tx'): Promise<void> {
    if (!this.activePort) return;
    const s = this.settings.settings();
    if (!s.serialEnabled) return;
    if (s.serialForward !== 'both' && s.serialForward !== source) return;

    const active = !s.serialInvert;
    const idle = s.serialInvert;
    const onSignal: SerialOutputSignals = s.serialPin === 'dtr'
      ? { dataTerminalReady: active }
      : { requestToSend: active };
    const offSignal: SerialOutputSignals = s.serialPin === 'dtr'
      ? { dataTerminalReady: idle }
      : { requestToSend: idle };

    await this.activePort.setSignals(onSignal);
    await new Promise(resolve => setTimeout(resolve, durationMs));
    await this.activePort.setSignals(offSignal);
  }

  /** Test: toggle the pin on for 1 second */
  async test(): Promise<void> {
    if (!this.activePort) return;
    const s = this.settings.settings();
    const active = !s.serialInvert;
    const idle = s.serialInvert;
    const onSignal: SerialOutputSignals = s.serialPin === 'dtr'
      ? { dataTerminalReady: active }
      : { requestToSend: active };
    const offSignal: SerialOutputSignals = s.serialPin === 'dtr'
      ? { dataTerminalReady: idle }
      : { requestToSend: idle };

    try {
      await this.activePort.setSignals(onSignal);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.activePort.setSignals(offSignal);
    } catch (e: any) {
      this.lastError.set(e.message ?? 'Test failed.');
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

  /**
   * Handle a serial device being physically connected.
   * If the service is enabled and currently disconnected, attempt to
   * re-open the configured port after a short settling delay.
   */
  private handleSerialConnect(): void {
    if (!this.settings.settings().serialEnabled) return;
    if (this.connected()) return;
    if (this.reconnecting) return;
    this.reconnecting = true;
    // Allow the port to settle before attempting to open
    setTimeout(async () => {
      try {
        await this.refreshPorts();
        const idx = this.settings.settings().serialPortIndex;
        if (idx >= 0 && idx < this.ports().length && !this.connected()) {
          await this.open(idx);
        }
      } finally {
        this.reconnecting = false;
      }
    }, 1000);
  }
}
