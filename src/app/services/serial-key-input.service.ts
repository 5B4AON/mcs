/**
 * Morse Code Studio
 * Copyright (c) 2026 5B4AON — Mike
 * Licensed under the GNU General Public License v3.0. See LICENSE file for details.
 */

import { Injectable, NgZone, OnDestroy, effect, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService, PaddleMode, SerialInputPin } from './settings.service';
import { MorseDecoderService } from './morse-decoder.service';
import { SerialKeyOutputService } from './serial-key-output.service';
import { timingsFromWpm } from '../morse-table';

/**
 * USB Vendor/Product ID filters for common USB-to-serial adapter chips.
 * Same list as SerialKeyOutputService — used when serial input opens its own port.
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

/**
 * Serial Key Input Service — reads serial port input signals (DSR, CTS, DCD, RI)
 * and maps them to straight key and paddle inputs for the Morse decoder.
 *
 * Monitors serial port control/status signals via polling (getSignals()).
 * Per-signal debounce filters contact bounce from mechanical keys.
 *
 * Port sharing: when the same port index is used by both Serial Output and
 * Serial Input, this service piggybacks on SerialKeyOutputService's open port
 * instead of opening a second connection.
 *
 * Has its own independent iambic keyer for paddle mode (same pattern as
 * MidiInputService) — no shared state with KeyerService.
 */
@Injectable({ providedIn: 'root' })
export class SerialKeyInputService implements OnDestroy {
  /** Current state of the DSR (Data Set Ready) input pin */
  readonly dsr = signal(false);

  /** Current state of the CTS (Clear To Send) input pin */
  readonly cts = signal(false);

  /** Current state of the DCD (Data Carrier Detect) input pin */
  readonly dcd = signal(false);

  /** Current state of the RI (Ring Indicator) input pin */
  readonly ri = signal(false);

  /** Available serial ports (previously granted by the user) */
  readonly ports = signal<SerialPort[]>([]);

  /** Whether the input port is currently connected */
  readonly connected = signal(false);

  /** Whether polling is active */
  readonly pollingActive = signal(false);

  /** Last error from getSignals (for diagnostics) */
  readonly lastError = signal<string | null>(null);

  /** Whether we're piggybacking on the serial output's port */
  readonly sharingPort = signal(false);

  /**
   * Emits straight key press/release events.
   * Used by AppComponent for sprite animation.
   */
  readonly straightKeyEvent$ = new Subject<{ down: boolean }>();

  /** Polling interval limits in ms */
  static readonly MIN_POLL_INTERVAL = 5;
  static readonly MAX_POLL_INTERVAL = 50;

  /** Debounce limits in ms */
  static readonly MIN_DEBOUNCE = 2;
  static readonly MAX_DEBOUNCE = 10;

  /** Per-signal debounce tracking: pending value + timestamp */
  private debounce = {
    dsr: { pending: false, since: 0, confirmed: false },
    cts: { pending: false, since: 0, confirmed: false },
    dcd: { pending: false, since: 0, confirmed: false },
    ri:  { pending: false, since: 0, confirmed: false },
  };

  /** Polling interval handle */
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Reference to the currently attached port */
  private attachedPort: SerialPort | null = null;

  /** Whether we opened this port ourselves (vs piggybacking) */
  private ownedPort = false;

  /** Bound handler for navigator.serial connect events */
  private readonly onSerialConnect = () => this.handleSerialConnect();

  /** Bound handler for port disconnect events */
  private portDisconnectHandler: (() => void) | null = null;

  /** Whether auto-reconnect is in progress */
  private reconnecting = false;

  // ---- Straight key state ----
  private straightKeyDown = false;

  // ---- Independent serial paddle keyer state ----
  private serialLeftPaddleDown = false;
  private serialRightPaddleDown = false;
  private serialDitMemory = false;
  private serialDahMemory = false;
  private serialKeyerTimeout: ReturnType<typeof setTimeout> | null = null;
  private serialCurrentElement: 'dit' | 'dah' | null = null;
  private serialLastElement: 'dit' | 'dah' | null = null;
  private serialElementPlaying = false;
  private serialKeyerRunning = false;
  private serialPaddleSource: 'rx' | 'tx' = 'tx';

  constructor(
    private serialOutput: SerialKeyOutputService,
    private settings: SettingsService,
    private decoder: MorseDecoderService,
    private zone: NgZone,
  ) {
    // Listen for newly connected serial devices for auto-reconnect
    if ('serial' in navigator) {
      navigator.serial.addEventListener('connect', this.onSerialConnect);
    }

    // Reactively attach/detach when settings change
    effect(() => {
      const s = this.settings.settings();
      const enabled = s.serialInputEnabled;
      const portIdx = s.serialInputPortIndex;
      const interval = s.serialInputPollInterval;
      // Also watch the serial output's open port for piggyback changes
      const outputPort = this.serialOutput.openPort();

      this.detach();
      if (enabled) {
        this.connectPort(portIdx, interval);
      }
    });
  }

  ngOnDestroy(): void {
    this.detach();
    if ('serial' in navigator) {
      navigator.serial.removeEventListener('connect', this.onSerialConnect);
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
      await navigator.serial.requestPort({ filters: SERIAL_FILTERS });
      await this.refreshPorts();
      this.lastError.set(null);
    } catch (e: any) {
      if (e.name === 'NotFoundError') {
        try {
          await navigator.serial.requestPort();
          await this.refreshPorts();
          this.lastError.set(null);
        } catch (e2: any) {
          if (e2.name === 'NotFoundError') {
            this.lastError.set('No serial port selected.');
          } else {
            this.lastError.set(e2.message ?? 'Failed to request serial port.');
          }
        }
      } else {
        this.lastError.set(e.message ?? 'Failed to request serial port.');
      }
    }
  }

  /** Open the port at the given index — piggyback or open independently */
  async open(portIndex: number): Promise<void> {
    this.detach();
    const s = this.settings.settings();
    const interval = s.serialInputPollInterval;
    await this.connectPort(portIndex, interval);
  }

  /** Close the serial input connection */
  async close(): Promise<void> {
    this.detach();
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
   * Calculate approximate max WPM accounting for both poll interval and debounce.
   * Nyquist on polling: dit ≥ 2 × pollInterval → WPM ≤ 600 / pollInterval.
   * Debounce: dit must remain stable for debounceMs → WPM ≤ 1200 / debounceMs.
   */
  maxWpm(): number {
    const s = this.settings.settings();
    const fromPoll = 600 / s.serialInputPollInterval;
    const fromDebounce = 1200 / s.serialInputDebounceMs;
    return Math.floor(Math.min(fromPoll, fromDebounce));
  }

  // ---- Private: port connection ----

  /**
   * Connect to the serial port at the given index.
   * If the serial output is already using the same port, piggyback on it.
   * If serial output is *expected* to use the same port but hasn't opened
   * yet, defer — the effect() watches openPort and will re-run when the
   * output service connects, avoiding a race where we lock the port first.
   * Otherwise, open the port independently.
   */
  private async connectPort(portIndex: number, pollInterval: number): Promise<void> {
    if (portIndex < 0) return;

    // Check if serial output is using the same port index
    const s = this.settings.settings();
    const outputPortIdx = s.serialPortIndex;
    const outputPort = this.serialOutput.openPort();

    if (outputPort && portIndex === outputPortIdx) {
      // Piggyback on the serial output's open port
      this.attachedPort = outputPort;
      this.ownedPort = false;
      this.sharingPort.set(true);
      this.connected.set(true);
      this.lastError.set(null);
      this.startPolling(outputPort, pollInterval);
      return;
    }

    // If serial output is enabled on the same port but hasn't connected
    // yet, defer — we'll re-run when openPort() updates.
    if (s.serialEnabled && portIndex === outputPortIdx && !outputPort) {
      return;
    }

    // Open the port independently
    await this.refreshPorts();
    const ports = this.ports();
    if (portIndex >= ports.length) return;

    const port = ports[portIndex];
    try {
      await port.open({ baudRate: 9600 });

      // Force both pins to idle — FTDI/CH340 DTR#/RTS# are active-low:
      // true → physical LOW, false → physical HIGH.
      // Same logic as SerialKeyOutputService.open().
      const idle = !s.serialInvert;
      await port.setSignals({
        dataTerminalReady: idle,
        requestToSend: idle,
      });

      this.attachedPort = port;
      this.ownedPort = true;
      this.sharingPort.set(false);
      this.connected.set(true);
      this.lastError.set(null);

      // Listen for physical disconnection
      this.portDisconnectHandler = () => {
        this.zone.run(() => {
          this.detach();
          this.refreshPorts();
        });
      };
      port.addEventListener('disconnect', this.portDisconnectHandler);

      this.startPolling(port, pollInterval);
    } catch (e: any) {
      if (e.message?.includes('already open')) {
        // Port is already open — it might be the serial output's port
        // Try to piggyback by checking if the output port matches
        if (outputPort && port === outputPort) {
          this.attachedPort = outputPort;
          this.ownedPort = false;
          this.sharingPort.set(true);
          this.connected.set(true);
          this.lastError.set(null);
          this.startPolling(outputPort, pollInterval);
          return;
        }
      }
      this.lastError.set(e.message ?? 'Failed to open serial port.');
      this.connected.set(false);
    }
  }

  /**
   * Read all input signals from the port, apply per-signal debounce,
   * and route debounced state changes to the keyer.
   *
   * Debounce logic (same pattern as key-detect-processor.js):
   * A raw value must remain stable for debounceMs consecutive reads
   * before the confirmed output changes.
   */
  private readSignals(port: SerialPort): void {
    port.getSignals().then(signals => {
      const now = performance.now();
      const s = this.settings.settings();
      const debounceMs = s.serialInputDebounceMs;

      const raw = {
        dsr: signals.dataSetReady,
        cts: signals.clearToSend,
        dcd: signals.dataCarrierDetect,
        ri:  signals.ringIndicator,
      };

      const outputs = {
        dsr: this.dsr, cts: this.cts, dcd: this.dcd, ri: this.ri,
      } as const;

      this.zone.run(() => {
        for (const name of ['dsr', 'cts', 'dcd', 'ri'] as const) {
          const d = this.debounce[name];
          const rawVal = raw[name];

          if (rawVal !== d.pending) {
            d.pending = rawVal;
            d.since = now;
          }

          if (d.pending !== d.confirmed && (now - d.since) >= debounceMs) {
            const oldConfirmed = d.confirmed;
            d.confirmed = d.pending;
            outputs[name].set(d.confirmed);

            // Route state change to the keyer
            this.onPinChanged(name, d.confirmed, oldConfirmed);
          }
        }
        this.lastError.set(null);
      });
    }).catch((e: any) => {
      this.zone.run(() => {
        this.lastError.set(e.message ?? 'getSignals() failed');
      });
    });
  }

  /**
   * Handle a debounced pin state change. Maps the pin to the configured
   * keyer role (straight key, paddle dit, paddle dah) and generates
   * the appropriate decoder events.
   */
  private onPinChanged(pin: SerialInputPin, value: boolean, oldValue: boolean): void {
    const s = this.settings.settings();
    if (!s.serialInputEnabled) return;

    // ======================================================================
    // *** DO NOT CHANGE THIS CHECK TO PER-PIN OR ANY OTHER VARIATION ***
    //
    // Blanket isSending() suppression is REQUIRED because serial output
    // and serial input may share the SAME PHYSICAL PORT and adapter.
    // When the serial output asserts DTR/RTS, some adapters (especially
    // FTDI and CH340) can cross-talk between output pins and input pins
    // due to shared ground references, cable coupling, or user wiring
    // (e.g. DTR→DSR loopback).  The pin identities are irrelevant —
    // only "bus active / bus idle" matters.  Therefore we must mute ALL
    // serial input while ANY serial output pin is asserted, regardless
    // of which specific pin is changing.
    //
    // True parallel operation (e.g. receiving serial input while the
    // keyboard keyer is active on serial output) is achieved by:
    //  1. Real-time serial output keying in the decoder (keyDown/keyUp),
    //     which keeps isSending() true only during actual key-down —
    //     not during the decoder's word-gap silence timers.
    //  2. Not forwarding local-keyer decoded characters to serial output
    //     via forwardDecodedChar (they are already keyed in real-time).
    //  3. This service bypassing KeyerService entirely (own iambic keyer
    //     + direct decoder calls), so no shared state with keyboard.
    // ======================================================================

    // Check if this pin is the straight key
    if (pin === s.serialStraightKeyPin) {
      const effective = s.serialStraightKeyInvert ? !value : value;
      const wasEffective = s.serialStraightKeyInvert ? !oldValue : oldValue;
      if (effective !== wasEffective) {
        // Suppress key-down while serial output is sending (prevent loopback)
        if (effective && this.serialOutput.isSending()) return;
        this.handleStraightKey(effective, s.serialStraightKeySource);
      }
    }

    // Check if this pin is a paddle dit
    const reverse = s.serialReversePaddles;
    if (pin === s.serialPaddleDitPin) {
      const effective = s.serialPaddleInvert ? !value : value;
      const wasEffective = s.serialPaddleInvert ? !oldValue : oldValue;
      if (effective !== wasEffective) {
        // Suppress paddle activation while serial output is sending
        if (effective && this.serialOutput.isSending()) return;
        if (reverse) {
          this.serialDahPaddleInput(effective, s.serialPaddleSource);
        } else {
          this.serialDitPaddleInput(effective, s.serialPaddleSource);
        }
      }
    }

    // Check if this pin is a paddle dah
    if (pin === s.serialPaddleDahPin) {
      const effective = s.serialPaddleInvert ? !value : value;
      const wasEffective = s.serialPaddleInvert ? !oldValue : oldValue;
      if (effective !== wasEffective) {
        // Suppress paddle activation while serial output is sending
        if (effective && this.serialOutput.isSending()) return;
        if (reverse) {
          this.serialDitPaddleInput(effective, s.serialPaddleSource);
        } else {
          this.serialDahPaddleInput(effective, s.serialPaddleSource);
        }
      }
    }
  }

  /** Handle straight key press/release from serial input */
  private handleStraightKey(down: boolean, source: 'rx' | 'tx'): void {
    if (down && !this.straightKeyDown) {
      this.straightKeyDown = true;
      this.straightKeyEvent$.next({ down: true });
      this.decoder.onKeyDown('serialStraightKey', source, { fromSerial: true });
    } else if (!down && this.straightKeyDown) {
      this.straightKeyDown = false;
      this.straightKeyEvent$.next({ down: false });
      this.decoder.onKeyUp('serialStraightKey', source, { fromSerial: true });
    }
  }

  /** Start polling at the given interval */
  private startPolling(port: SerialPort, intervalMs: number): void {
    if (this.pollTimer) return;
    const clamped = Math.max(SerialKeyInputService.MIN_POLL_INTERVAL,
      Math.min(SerialKeyInputService.MAX_POLL_INTERVAL, intervalMs));
    this.pollingActive.set(true);
    // Initial read
    this.readSignals(port);
    this.pollTimer = setInterval(() => {
      if (this.attachedPort === port) {
        this.readSignals(port);
      } else {
        this.stopPolling();
      }
    }, clamped);
  }

  /** Stop polling */
  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.pollingActive.set(false);
  }

  /** Remove listeners, stop polling, release straight key and paddles, reset state */
  private detach(): void {
    this.stopPolling();

    // Release any active keying
    if (this.straightKeyDown) {
      this.straightKeyDown = false;
      this.straightKeyEvent$.next({ down: false });
      this.decoder.onKeyUp('serialStraightKey', this.settings.settings().serialStraightKeySource, { fromSerial: true });
    }
    this.stopSerialKeyer();

    // Clean up port
    if (this.attachedPort && this.portDisconnectHandler) {
      this.attachedPort.removeEventListener('disconnect', this.portDisconnectHandler);
      this.portDisconnectHandler = null;
    }
    if (this.attachedPort && this.ownedPort) {
      this.attachedPort.close().catch(() => {});
    }
    this.attachedPort = null;
    this.ownedPort = false;
    this.connected.set(false);
    this.sharingPort.set(false);

    // Reset signal states
    this.dsr.set(false);
    this.cts.set(false);
    this.dcd.set(false);
    this.ri.set(false);
    this.lastError.set(null);

    // Reset debounce state
    for (const name of ['dsr', 'cts', 'dcd', 'ri'] as const) {
      this.debounce[name] = { pending: false, since: 0, confirmed: false };
    }
  }

  /**
   * Handle a serial device being physically connected.
   * If the service is enabled and currently disconnected, attempt to
   * re-open the configured port after a short settling delay.
   */
  private handleSerialConnect(): void {
    if (!this.settings.settings().serialInputEnabled) return;
    if (this.connected()) return;
    if (this.reconnecting) return;
    this.reconnecting = true;
    setTimeout(async () => {
      try {
        await this.refreshPorts();
        const s = this.settings.settings();
        const idx = s.serialInputPortIndex;
        if (idx >= 0 && idx < this.ports().length && !this.connected()) {
          await this.connectPort(idx, s.serialInputPollInterval);
        }
      } finally {
        this.reconnecting = false;
      }
    }, 1000);
  }

  // ---- Independent serial paddle keyer ----
  // Self-contained iambic keyer that calls the decoder directly.
  // Completely independent of KeyerService — no shared state.

  /** Activate/deactivate the dit paddle on the serial keyer. */
  private serialDitPaddleInput(down: boolean, source: 'rx' | 'tx'): void {
    this.serialPaddleSource = source;
    if (down && !this.serialLeftPaddleDown) {
      this.serialLeftPaddleDown = true;
      this.serialDitMemory = true;
      this.startSerialKeyer();
    } else if (!down) {
      this.serialLeftPaddleDown = false;
      this.checkStopSerialKeyer();
    }
  }

  /** Activate/deactivate the dah paddle on the serial keyer. */
  private serialDahPaddleInput(down: boolean, source: 'rx' | 'tx'): void {
    this.serialPaddleSource = source;
    if (down && !this.serialRightPaddleDown) {
      this.serialRightPaddleDown = true;
      this.serialDahMemory = true;
      this.startSerialKeyer();
    } else if (!down) {
      this.serialRightPaddleDown = false;
      this.checkStopSerialKeyer();
    }
  }

  private startSerialKeyer(): void {
    if (this.serialKeyerRunning) return;
    this.serialKeyerRunning = true;
    this.runSerialKeyerLoop();
  }

  private stopSerialKeyer(): void {
    this.serialKeyerRunning = false;
    if (this.serialKeyerTimeout) {
      clearTimeout(this.serialKeyerTimeout);
      this.serialKeyerTimeout = null;
    }
    if (this.serialElementPlaying) {
      this.serialElementPlaying = false;
      this.zone.run(() => {
        this.decoder.onKeyUp('serialPaddle', this.serialPaddleSource, {
          perfectTiming: true, fromSerial: true,
        });
      });
    }
    this.serialCurrentElement = null;
    this.serialLastElement = null;
    this.serialDitMemory = false;
    this.serialDahMemory = false;
  }

  private checkStopSerialKeyer(): void {
    if (!this.serialLeftPaddleDown && !this.serialRightPaddleDown &&
        !this.serialDitMemory && !this.serialDahMemory && !this.serialElementPlaying) {
      this.stopSerialKeyer();
    }
  }

  private runSerialKeyerLoop(): void {
    if (!this.serialKeyerRunning) return;
    const mode: PaddleMode = this.settings.settings().paddleMode;
    const timings = timingsFromWpm(this.settings.settings().keyerWpm);
    const nextElement = this.pickSerialNextElement(mode);
    if (!nextElement) {
      this.stopSerialKeyer();
      return;
    }
    this.serialCurrentElement = nextElement;
    const duration = nextElement === 'dit' ? timings.dit : timings.dah;

    this.serialElementPlaying = true;
    this.zone.run(() => {
      this.decoder.onKeyDown('serialPaddle', this.serialPaddleSource, {
        perfectTiming: true, fromSerial: true,
      });
    });

    this.serialKeyerTimeout = setTimeout(() => {
      this.serialElementPlaying = false;
      this.zone.run(() => {
        this.decoder.onKeyUp('serialPaddle', this.serialPaddleSource, {
          perfectTiming: true, fromSerial: true,
        });
      });
      this.serialLastElement = this.serialCurrentElement;
      this.serialCurrentElement = null;

      // Inter-element space (1 dit)
      this.serialKeyerTimeout = setTimeout(() => {
        if (this.serialKeyerRunning) {
          if (this.serialLeftPaddleDown || this.serialRightPaddleDown ||
              this.serialDitMemory || this.serialDahMemory) {
            this.runSerialKeyerLoop();
          } else {
            this.stopSerialKeyer();
          }
        }
      }, timings.intraChar);
    }, duration);
  }

  /**
   * Pick the next element to play based on the current paddle mode.
   * Mirrors KeyerService.pickNextElement but uses serial-local state.
   */
  private pickSerialNextElement(mode: PaddleMode): 'dit' | 'dah' | null {
    const hasDit = this.serialLeftPaddleDown || this.serialDitMemory;
    const hasDah = this.serialRightPaddleDown || this.serialDahMemory;
    let picked: 'dit' | 'dah' | null = null;
    const bothActive = hasDit && hasDah;

    if (mode === 'iambic-b' || mode === 'iambic-a') {
      if (bothActive) {
        picked = this.serialLastElement === 'dit' ? 'dah' : 'dit';
      } else if (hasDit) {
        picked = 'dit';
      } else if (hasDah) {
        picked = 'dah';
      } else if (mode === 'iambic-b' && this.serialLastElement) {
        picked = this.serialLastElement === 'dit' ? 'dah' : 'dit';
      }
    } else if (mode === 'ultimatic') {
      if (bothActive) {
        picked = this.serialLastElement || 'dit';
      } else if (hasDit) {
        picked = 'dit';
      } else if (hasDah) {
        picked = 'dah';
      }
    } else if (mode === 'single-lever') {
      if (hasDit) picked = 'dit';
      else if (hasDah) picked = 'dah';
    }

    if (picked === 'dit') this.serialDitMemory = false;
    else if (picked === 'dah') this.serialDahMemory = false;
    return picked;
  }
}
