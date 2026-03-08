/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { effect, Injectable, NgZone, signal } from '@angular/core';
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

  /** Public signal exposing the active port for other services (e.g. serial input) */
  readonly openPort = signal<SerialPort | null>(null);

  /** Whether the port is currently open */
  readonly connected = signal(false);

  /** Last error message (for UI display) */
  readonly lastError = signal<string | null>(null);

  /** True while serial output is actively keying (key held or holdoff pending) */
  readonly isSending = signal(false);

  /**
   * Holdoff timer — keeps isSending() true for a few ms after key-up.
   * The physical serial bus has settling time: the DTR/RTS line
   * de-asserts, cable capacitance decays, and the serial input polling
   * circuit needs time to stop seeing the signal.  Without this holdoff,
   * a fast key-up → loopback echo can sneak through the isSending()
   * gate before the bus has fully settled.
   *
   * *** DO NOT REMOVE OR SHORTEN THIS HOLDOFF ***
   * It prevents feedback loops when serial input and output share the
   * same physical port or when pins are cross-wired.
   */
  private isSendingHoldoff: ReturnType<typeof setTimeout> | null = null;

  /**
   * Holdoff duration in milliseconds.  Empirically tested: 30 ms
   * covers typical USB-serial adapter settling plus polling round-trip
   * jitter.  Matches MidiOutputService.SENDING_HOLDOFF_MS.
   */
  private static readonly SENDING_HOLDOFF_MS = 30;

  /** Track current key state for idempotency */
  private keyIsDown = false;

  /** Bound handler for navigator.serial connect events */
  private readonly onSerialConnect = () => this.handleSerialConnect();

  /** Bound handler for port disconnect events (bound per-port in open()) */
  private portDisconnectHandler: (() => void) | null = null;

  /** Whether auto-reconnect is in progress */
  private reconnecting = false;

  /** Whether the initial auto-connect has been attempted (one-shot guard) */
  private autoConnectAttempted = false;

  constructor(
    private settings: SettingsService,
    private zone: NgZone,
  ) {
    this.refreshPorts();
    // Listen for newly connected serial devices for auto-reconnect
    if ('serial' in navigator) {
      navigator.serial.addEventListener('connect', this.onSerialConnect);
    }

    // Auto-open on page load if previously enabled.
    // Chrome remembers granted ports via getPorts(), so no user gesture
    // is needed.  The one-shot guard prevents this from interfering
    // with explicit connect/disconnect actions from the settings card.
    effect(() => {
      const s = this.settings.settings();
      const enabled = s.serialEnabled;
      const portIdx = s.serialPortIndex;

      if (!this.autoConnectAttempted && enabled && portIdx >= 0) {
        this.autoConnectAttempted = true;
        this.autoConnect(portIdx);
      }
    });
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

      // Force both pins to idle after open.
      //
      // FTDI/CH340 DTR# and RTS# are active-low at the hardware level:
      //   setSignals({ dataTerminalReady: true  }) → physical pin LOW
      //   setSignals({ dataTerminalReady: false }) → physical pin HIGH
      //
      // Default (serialInvert = false): idle = true → pin LOW (optocoupler off).
      // Inverted (serialInvert = true):  idle = false → pin HIGH.
      const s = this.settings.settings();
      const idle = !s.serialInvert;
      await port.setSignals({
        dataTerminalReady: idle,
        requestToSend: idle,
      });

      this.activePort = port;
      this.openPort.set(port);
      this.connected.set(true);
      this.lastError.set(null);

      // Listen for physical disconnection of this port
      this.portDisconnectHandler = () => {
        this.zone.run(() => {
          this.activePort = null;
          this.openPort.set(null);
          this.connected.set(false);
          this.keyIsDown = false;
          this.portDisconnectHandler = null;
          this.refreshPorts();
        });
      };
      port.addEventListener('disconnect', this.portDisconnectHandler);
    } catch (e: any) {
      this.lastError.set(e.message ?? 'Failed to open serial port.');
      this.activePort = null;
      this.openPort.set(null);
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
      this.keyIsDown = false;
      await this.activePort.close();
    } catch { /* port may already be closed */ }
    this.activePort = null;
    this.openPort.set(null);
    this.connected.set(false);
    // Immediate clear — no holdoff needed when explicitly closing
    if (this.isSendingHoldoff) {
      clearTimeout(this.isSendingHoldoff);
      this.isSendingHoldoff = null;
    }
    this.isSending.set(false);
  }

  /** Key down — drive pin HIGH (active-low: API false → physical HIGH) */
  keyDown(source: 'rx' | 'tx' = 'tx'): void {
    if (!this.activePort || this.keyIsDown) return;
    const s = this.settings.settings();
    if (!s.serialEnabled) return;
    if (s.serialForward !== 'both' && s.serialForward !== source) return;
    this.keyIsDown = true;

    // Cancel any pending holdoff — we are actively sending again
    if (this.isSendingHoldoff) {
      clearTimeout(this.isSendingHoldoff);
      this.isSendingHoldoff = null;
    }
    this.isSending.set(true);

    const active = s.serialInvert;  // false → physical HIGH when normal, true → physical LOW when inverted
    const signal: SerialOutputSignals = s.serialPin === 'dtr'
      ? { dataTerminalReady: active }
      : { requestToSend: active };
    this.activePort.setSignals(signal).catch(() => {});
  }

  /** Key up — drive pin back to idle (LOW when normal, HIGH when inverted) */
  keyUp(): void {
    if (!this.activePort || !this.keyIsDown) return;
    this.keyIsDown = false;

    const s = this.settings.settings();
    const idle = !s.serialInvert;  // true → physical LOW when normal, false → physical HIGH when inverted
    const signal: SerialOutputSignals = s.serialPin === 'dtr'
      ? { dataTerminalReady: idle }
      : { requestToSend: idle };
    this.activePort.setSignals(signal).catch(() => {});

    // Don't clear isSending immediately — start a holdoff timer so
    // the physical bus has time to settle before serial input is unmuted.
    // If another keyDown arrives before the holdoff expires, the timer
    // is cancelled in keyDown and isSending stays true throughout.
    if (this.isSendingHoldoff) clearTimeout(this.isSendingHoldoff);
    this.isSendingHoldoff = setTimeout(() => {
      this.isSendingHoldoff = null;
      // Only clear if key was not re-activated during the holdoff
      if (!this.keyIsDown) {
        this.isSending.set(false);
      }
    }, SerialKeyOutputService.SENDING_HOLDOFF_MS);
  }

  /** Timed pulse for encoder — asserts pin for durationMs then de-asserts */
  async schedulePulse(durationMs: number, source: 'rx' | 'tx' = 'tx'): Promise<void> {
    if (!this.activePort) return;
    const s = this.settings.settings();
    if (!s.serialEnabled) return;
    if (s.serialForward !== 'both' && s.serialForward !== source) return;

    // Cancel any pending holdoff — we are actively sending
    if (this.isSendingHoldoff) {
      clearTimeout(this.isSendingHoldoff);
      this.isSendingHoldoff = null;
    }
    this.isSending.set(true);

    const active = s.serialInvert;
    const idle = !s.serialInvert;
    const onSignal: SerialOutputSignals = s.serialPin === 'dtr'
      ? { dataTerminalReady: active }
      : { requestToSend: active };
    const offSignal: SerialOutputSignals = s.serialPin === 'dtr'
      ? { dataTerminalReady: idle }
      : { requestToSend: idle };

    await this.activePort.setSignals(onSignal);
    await new Promise(resolve => setTimeout(resolve, durationMs));
    await this.activePort.setSignals(offSignal);

    // Start holdoff timer after pulse completes
    if (this.isSendingHoldoff) clearTimeout(this.isSendingHoldoff);
    this.isSendingHoldoff = setTimeout(() => {
      this.isSendingHoldoff = null;
      if (!this.keyIsDown) {
        this.isSending.set(false);
      }
    }, SerialKeyOutputService.SENDING_HOLDOFF_MS);
  }

  /** Test: toggle the pin on for 1 second */
  async test(): Promise<void> {
    if (!this.activePort) return;
    const s = this.settings.settings();
    const active = s.serialInvert;
    const idle = !s.serialInvert;
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

  /**
   * Auto-connect to the configured serial port.
   * Called by the constructor effect() on page load and whenever
   * settings change.  Retries with increasing delays to handle
   * late USB enumeration.
   */
  private async autoConnect(portIndex: number): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    try {
      for (const delay of [0, 500, 1500, 3000]) {
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
        if (this.connected()) return;
        await this.refreshPorts();
        if (portIndex < this.ports().length) {
          await this.open(portIndex);
          if (this.connected()) return;
        }
      }
    } finally {
      this.reconnecting = false;
    }
  }
}
