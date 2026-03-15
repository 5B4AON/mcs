/**
 * Morse Code Studio
 */

import { Injectable, NgZone, OnDestroy, computed, effect, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService, PaddleMode, SerialInputPin, SerialInputMapping, InputPath } from './settings.service';
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

/** Per-signal debounce tracking  */
interface DebounceEntry { pending: boolean; since: number; confirmed: boolean; }

/** Connection state for a single physical serial port */
interface PortConnectionState {
  port: SerialPort;
  owned: boolean;
  sharing: boolean;
  pollTimer: ReturnType<typeof setInterval> | null;
  disconnectHandler: (() => void) | null;
  debounce: Record<SerialInputPin, DebounceEntry>;
  signals: Record<SerialInputPin, boolean>;
  pollInterval: number;
  debounceMs: number;
  lastError: string | null;
}

/** Per-mapping iambic keyer state (for paddle mappings) */
interface MappingKeyerState {
  straightKeyDown: boolean;
  leftPaddleDown: boolean;
  rightPaddleDown: boolean;
  ditMemory: boolean;
  dahMemory: boolean;
  keyerTimeout: ReturnType<typeof setTimeout> | null;
  currentElement: 'dit' | 'dah' | null;
  lastElement: 'dit' | 'dah' | null;
  elementPlaying: boolean;
  keyerRunning: boolean;
  source: 'rx' | 'tx';
}

/** Create a fresh per-mapping keyer state */
function newKeyerState(): MappingKeyerState {
  return {
    straightKeyDown: false,
    leftPaddleDown: false,
    rightPaddleDown: false,
    ditMemory: false,
    dahMemory: false,
    keyerTimeout: null,
    currentElement: null,
    lastElement: null,
    elementPlaying: false,
    keyerRunning: false,
    source: 'tx',
  };
}

/** Create a fresh debounce bank for all four input pins */
function newDebounceBank(): Record<SerialInputPin, DebounceEntry> {
  return {
    dsr: { pending: false, since: 0, confirmed: false },
    cts: { pending: false, since: 0, confirmed: false },
    dcd: { pending: false, since: 0, confirmed: false },
    ri:  { pending: false, since: 0, confirmed: false },
  };
}

/**
 * Serial Key Input Service — reads serial port input signals (DSR, CTS, DCD, RI)
 * and maps them to straight key and paddle inputs for the Morse decoder.
 *
 * Supports multiple simultaneous serial ports: each mapping in
 * `serialInputMappings` specifies its own `portIndex`, `pollInterval`,
 * and `debounceMs`. Ports are shared when multiple mappings reference
 * the same index — the tightest (fastest) polling interval wins.
 *
 * Port sharing with Serial Output: when a mapping's port index matches
 * the Serial Output port, this service piggybacks on that open port
 * instead of opening a second connection.
 *
 * Each paddle mapping has its own independent iambic keyer (same pattern
 * as MidiInputService) — no shared state with KeyerService.
 */
@Injectable({ providedIn: 'root' })
export class SerialKeyInputService implements OnDestroy {
  /** Available serial ports (previously granted by the user) */
  readonly ports = signal<SerialPort[]>([]);

  /** Per-port connection state (portIndex → state). Private mutable map, exposed as signal. */
  readonly portStates = signal<Map<number, PortConnectionState>>(new Map());

  /** Whether any serial input port is currently connected */
  readonly connected = computed(() => {
    const map = this.portStates();
    for (const ps of map.values()) {
      if (ps.port) return true;
    }
    return false;
  });

  /** Last error from any port (for diagnostics) */
  readonly lastError = signal<string | null>(null);

  /**
   * Emits straight key press/release events.
   * Used by AppComponent for sprite animation.
   */
  readonly straightKeyEvent$ = new Subject<{ down: boolean; mappingIndex: number }>();

  /** Polling interval limits in ms */
  static readonly MIN_POLL_INTERVAL = 5;
  static readonly MAX_POLL_INTERVAL = 50;

  /** Debounce limits in ms */
  static readonly MIN_DEBOUNCE = 2;
  static readonly MAX_DEBOUNCE = 10;

  /** Per-mapping keyer state (mapping index → state) */
  private keyerStates = new Map<number, MappingKeyerState>();

  /** Bound handler for navigator.serial connect events */
  private readonly onSerialConnect = () => this.handleSerialConnect();

  /** Whether auto-reconnect is in progress */
  private reconnecting = false;

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
      const mappings = s.serialInputMappings;
      // Watch the serial output's open ports for piggyback changes
      const outputPorts = this.serialOutput.openPorts();

      // Schedule the async reconnect outside the effect context
      // to avoid writing signals during synchronous effect execution
      queueMicrotask(() => {
        this.detachAll();
        if (enabled) {
          this.connectAllPorts(mappings);
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.detachAll();
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

  /** Open a specific port by index (for manual connect from card) */
  async openPort(portIndex: number): Promise<void> {
    const existing = this.portStates().get(portIndex);
    if (existing?.port) return; // already connected
    await this.connectPort(portIndex, 10, 5);
  }

  /** Close a specific port by index */
  closePort(portIndex: number): void {
    const map = new Map(this.portStates());
    const ps = map.get(portIndex);
    if (ps) {
      this.teardownPort(ps);
      map.delete(portIndex);
      this.portStates.set(map);
    }
  }

  /** Close all serial input connections */
  closeAll(): void {
    this.detachAll();
  }

  /** Get a human-readable label for a serial port */
  portLabel(port: SerialPort): string {
    const info = port.getInfo();
    if (info.usbVendorId !== undefined) {
      return `USB Serial (VID:${info.usbVendorId.toString(16).padStart(4, '0')} PID:${info.usbProductId?.toString(16).padStart(4, '0') ?? '????'})`;
    }
    return 'Serial Port';
  }

  /** Check if a specific port is connected */
  isPortConnected(portIndex: number): boolean {
    return this.portStates().get(portIndex)?.port != null;
  }

  /** Get current signal values for a specific port */
  getPortSignals(portIndex: number): Record<SerialInputPin, boolean> | null {
    const ps = this.portStates().get(portIndex);
    return ps ? { ...ps.signals } : null;
  }

  /** Whether a specific port is piggybacking on serial output */
  isPortSharing(portIndex: number): boolean {
    return this.portStates().get(portIndex)?.sharing ?? false;
  }

  /**
   * Calculate approximate max WPM for a specific mapping.
   * Nyquist on polling: dit ≥ 2 × pollInterval → WPM ≤ 600 / pollInterval.
   * Debounce: dit must remain stable for debounceMs → WPM ≤ 1200 / debounceMs.
   */
  maxWpmForMapping(mapping: SerialInputMapping): number {
    const fromPoll = 600 / mapping.pollInterval;
    const fromDebounce = 1200 / mapping.debounceMs;
    return Math.floor(Math.min(fromPoll, fromDebounce));
  }

  // ---- Private: port connection ----

  /**
   * Connect all ports needed by the current set of enabled mappings.
   * Groups mappings by portIndex and opens each unique port once,
   * using the tightest (fastest) polling interval across all mappings
   * that share the same port.
   */
  private async connectAllPorts(mappings: SerialInputMapping[]): Promise<void> {
    // Collect unique port indices and their fastest poll/debounce
    const portParams = new Map<number, { pollInterval: number; debounceMs: number }>();
    for (const m of mappings) {
      if (!m.enabled || m.portIndex < 0) continue;
      const existing = portParams.get(m.portIndex);
      if (existing) {
        existing.pollInterval = Math.min(existing.pollInterval, m.pollInterval);
        existing.debounceMs = Math.min(existing.debounceMs, m.debounceMs);
      } else {
        portParams.set(m.portIndex, { pollInterval: m.pollInterval, debounceMs: m.debounceMs });
      }
    }

    for (const [portIndex, params] of portParams) {
      await this.connectPort(portIndex, params.pollInterval, params.debounceMs);
    }
  }

  /**
   * Connect to the serial port at the given index.
   * If the serial output is already using the same port, piggyback on it.
   */
  private async connectPort(portIndex: number, pollInterval: number, debounceMs: number): Promise<void> {
    if (portIndex < 0) return;

    const s = this.settings.settings();
    const outputPort = this.serialOutput.getOpenPort(portIndex);

    const ps: PortConnectionState = {
      port: null!,
      owned: false,
      sharing: false,
      pollTimer: null,
      disconnectHandler: null,
      debounce: newDebounceBank(),
      signals: { dsr: false, cts: false, dcd: false, ri: false },
      pollInterval,
      debounceMs,
      lastError: null,
    };

    if (outputPort) {
      // Piggyback on the serial output's open port
      ps.port = outputPort;
      ps.owned = false;
      ps.sharing = true;
      this.setPortState(portIndex, ps);
      this.lastError.set(null);
      this.startPolling(portIndex, ps);
      return;
    }

    // If serial output is enabled on the same port but hasn't connected yet, defer
    const outputUsesThisPort = s.serialEnabled &&
      s.serialOutputMappings.some(m => m.enabled && m.portIndex === portIndex);
    if (outputUsesThisPort && !outputPort) {
      return;
    }

    // Open the port independently
    await this.refreshPorts();
    const ports = this.ports();
    if (portIndex >= ports.length) return;

    const port = ports[portIndex];
    try {
      await port.open({ baudRate: 9600 });

      await port.setSignals({
        dataTerminalReady: true,
        requestToSend: true,
      });

      ps.port = port;
      ps.owned = true;
      ps.sharing = false;

      // Listen for physical disconnection
      ps.disconnectHandler = () => {
        this.zone.run(() => {
          this.closePort(portIndex);
          this.refreshPorts();
        });
      };
      port.addEventListener('disconnect', ps.disconnectHandler);

      this.setPortState(portIndex, ps);
      this.lastError.set(null);
      this.startPolling(portIndex, ps);
    } catch (e: any) {
      if (e.message?.includes('already open')) {
        // Port is already open — typically because a previous close()
        // hasn't settled yet, or serial output opened it in the interim.
        // Silently adopt the open port instead of reporting an error.
        const outputPortRetry = this.serialOutput.getOpenPort(portIndex);
        if (outputPortRetry) {
          ps.port = outputPortRetry;
          ps.owned = false;
          ps.sharing = true;
        } else {
          ps.port = port;
          ps.owned = true;
          ps.sharing = false;
          ps.disconnectHandler = () => {
            this.zone.run(() => {
              this.closePort(portIndex);
              this.refreshPorts();
            });
          };
          port.addEventListener('disconnect', ps.disconnectHandler);
        }
        this.setPortState(portIndex, ps);
        this.lastError.set(null);
        this.startPolling(portIndex, ps);
        return;
      }
      this.lastError.set(e.message ?? 'Failed to open serial port.');
    }
  }

  /** Update the portStates signal immutably */
  private setPortState(portIndex: number, ps: PortConnectionState): void {
    const map = new Map(this.portStates());
    map.set(portIndex, ps);
    this.portStates.set(map);
  }

  /**
   * Read all input signals from a port, apply per-signal debounce,
   * and route debounced state changes to the keyer for each mapping.
   */
  private readSignals(portIndex: number, ps: PortConnectionState): void {
    ps.port.getSignals().then(signals => {
      const now = performance.now();

      const raw = {
        dsr: signals.dataSetReady,
        cts: signals.clearToSend,
        dcd: signals.dataCarrierDetect,
        ri:  signals.ringIndicator,
      };

      this.zone.run(() => {
        for (const name of ['dsr', 'cts', 'dcd', 'ri'] as const) {
          const d = ps.debounce[name];
          const rawVal = raw[name];

          if (rawVal !== d.pending) {
            d.pending = rawVal;
            d.since = now;
          }

          if (d.pending !== d.confirmed && (now - d.since) >= ps.debounceMs) {
            const oldConfirmed = d.confirmed;
            d.confirmed = d.pending;
            ps.signals[name] = d.confirmed;

            // Route state change to all mappings on this port
            this.onPinChanged(portIndex, name, d.confirmed, oldConfirmed);
          }
        }
        ps.lastError = null;
        // Trigger signal update for UI reactivity
        this.portStates.set(new Map(this.portStates()));
      });
    }).catch((e: any) => {
      this.zone.run(() => {
        ps.lastError = e.message ?? 'getSignals() failed';
        this.lastError.set(ps.lastError);
      });
    });
  }

  /**
   * Handle a debounced pin state change on a specific port.
   * Routes to all enabled mappings on this port.
   */
  private onPinChanged(portIndex: number, pin: SerialInputPin, value: boolean, oldValue: boolean): void {
    const s = this.settings.settings();
    if (!s.serialInputEnabled) return;

    // ======================================================================\n    // Blanket isSending() suppression prevents cross-talk: serial output\n    // and serial input may share the SAME PHYSICAL PORT and adapter.\n    //\n    // The check is applied per-mapping: input mappings that are\n    // explicitly configured as relay sources (referenced by at least one\n    // output mapping's relayInputIndices) bypass the isSending gate.\n    // ======================================================================

    s.serialInputMappings.forEach((m, idx) => {
      if (!m.enabled || m.portIndex !== portIndex) return;
      this.routePinToMapping(m, idx, pin, value, oldValue);
    });
  }

  /** Route a pin change to a specific mapping */
  private routePinToMapping(
    m: SerialInputMapping, mappingIndex: number,
    pin: SerialInputPin, value: boolean, oldValue: boolean,
  ): void {
    // Per-mapping isSending check: block physical bus echoes unless
    // this input mapping is a relay source for at least one output mapping.
    const sending = this.serialOutput.isSending();
    const isRelaySrc = sending
      ? this.settings.settings().serialOutputMappings.some(
          om => om.enabled && om.relayInputIndices.includes(mappingIndex),
        )
      : false;

    if (m.mode === 'straightKey') {
      if (pin === m.pin) {
        const effective = m.invert ? !value : value;
        const wasEffective = m.invert ? !oldValue : oldValue;
        if (effective !== wasEffective) {
          if (effective && sending && !isRelaySrc) return;
          this.handleStraightKey(mappingIndex, effective, m.source);
        }
      }
    } else {
      // Paddle mode
      const reverse = m.reversePaddles;
      if (pin === m.pin) {
        const effective = m.invert ? !value : value;
        const wasEffective = m.invert ? !oldValue : oldValue;
        if (effective !== wasEffective) {
          if (effective && sending && !isRelaySrc) return;
          if (reverse) {
            this.dahPaddleInput(mappingIndex, effective, m.source, m.paddleMode);
          } else {
            this.ditPaddleInput(mappingIndex, effective, m.source, m.paddleMode);
          }
        }
      }
      if (pin === m.dahPin) {
        const effective = m.invert ? !value : value;
        const wasEffective = m.invert ? !oldValue : oldValue;
        if (effective !== wasEffective) {
          if (effective && sending && !isRelaySrc) return;
          if (reverse) {
            this.ditPaddleInput(mappingIndex, effective, m.source, m.paddleMode);
          } else {
            this.dahPaddleInput(mappingIndex, effective, m.source, m.paddleMode);
          }
        }
      }
    }
  }

  /** Handle straight key press/release for a specific mapping */
  private handleStraightKey(mappingIndex: number, down: boolean, source: 'rx' | 'tx'): void {
    const ks = this.getKeyerState(mappingIndex);
    const m = this.settings.settings().serialInputMappings[mappingIndex];
    const inputPath: InputPath = `serialStraightKey:${mappingIndex}`;
    const opts = { fromSerial: true, name: m?.name, color: m?.color };
    if (down && !ks.straightKeyDown) {
      ks.straightKeyDown = true;
      this.straightKeyEvent$.next({ down: true, mappingIndex });
      this.decoder.onKeyDown(inputPath, source, opts);
    } else if (!down && ks.straightKeyDown) {
      ks.straightKeyDown = false;
      this.straightKeyEvent$.next({ down: false, mappingIndex });
      this.decoder.onKeyUp(inputPath, source, opts);
    }
  }

  /** Start polling a port at the given interval */
  private startPolling(portIndex: number, ps: PortConnectionState): void {
    if (ps.pollTimer) return;
    const clamped = Math.max(SerialKeyInputService.MIN_POLL_INTERVAL,
      Math.min(SerialKeyInputService.MAX_POLL_INTERVAL, ps.pollInterval));
    this.readSignals(portIndex, ps);
    ps.pollTimer = setInterval(() => {
      if (ps.port) {
        this.readSignals(portIndex, ps);
      } else {
        this.stopPolling(ps);
      }
    }, clamped);
  }

  /** Stop polling a specific port */
  private stopPolling(ps: PortConnectionState): void {
    if (ps.pollTimer) {
      clearInterval(ps.pollTimer);
      ps.pollTimer = null;
    }
  }

  /** Tear down a single port connection */
  private teardownPort(ps: PortConnectionState): void {
    this.stopPolling(ps);
    if (ps.port && ps.disconnectHandler) {
      ps.port.removeEventListener('disconnect', ps.disconnectHandler);
      ps.disconnectHandler = null;
    }
    if (ps.port && ps.owned) {
      ps.port.close().catch(() => {});
    }
  }

  /** Detach all ports and release all keyer state */
  private detachAll(): void {
    const map = this.portStates();
    for (const ps of map.values()) {
      this.teardownPort(ps);
    }
    this.portStates.set(new Map());

    // Release any active keying across all mappings
    for (const [idx, ks] of this.keyerStates) {
      if (ks.straightKeyDown) {
        ks.straightKeyDown = false;
        this.straightKeyEvent$.next({ down: false, mappingIndex: idx });
        const m = this.settings.settings().serialInputMappings[idx];
        if (m) {
          this.decoder.onKeyUp(`serialStraightKey:${idx}`, m.source, {
            fromSerial: true, name: m.name, color: m.color,
          });
        }
      }
      this.stopMappingKeyer(idx);
    }
    this.keyerStates.clear();
    this.lastError.set(null);
  }

  /**
   * Handle a serial device being physically connected.
   * Attempt to re-open configured ports after a settling delay.
   */
  private handleSerialConnect(): void {
    if (!this.settings.settings().serialInputEnabled) return;
    if (this.reconnecting) return;
    this.reconnecting = true;
    setTimeout(async () => {
      try {
        await this.refreshPorts();
        const s = this.settings.settings();
        if (!s.serialInputEnabled) return;
        await this.connectAllPorts(s.serialInputMappings);
      } finally {
        this.reconnecting = false;
      }
    }, 1000);
  }

  // ---- Per-mapping independent paddle keyer ----

  private getKeyerState(mappingIndex: number): MappingKeyerState {
    let ks = this.keyerStates.get(mappingIndex);
    if (!ks) {
      ks = newKeyerState();
      this.keyerStates.set(mappingIndex, ks);
    }
    return ks;
  }

  private ditPaddleInput(mappingIndex: number, down: boolean, source: 'rx' | 'tx', paddleMode: PaddleMode): void {
    const ks = this.getKeyerState(mappingIndex);
    ks.source = source;
    if (down && !ks.leftPaddleDown) {
      ks.leftPaddleDown = true;
      ks.ditMemory = true;
      this.startMappingKeyer(mappingIndex, paddleMode);
    } else if (!down) {
      ks.leftPaddleDown = false;
      this.checkStopMappingKeyer(mappingIndex);
    }
  }

  private dahPaddleInput(mappingIndex: number, down: boolean, source: 'rx' | 'tx', paddleMode: PaddleMode): void {
    const ks = this.getKeyerState(mappingIndex);
    ks.source = source;
    if (down && !ks.rightPaddleDown) {
      ks.rightPaddleDown = true;
      ks.dahMemory = true;
      this.startMappingKeyer(mappingIndex, paddleMode);
    } else if (!down) {
      ks.rightPaddleDown = false;
      this.checkStopMappingKeyer(mappingIndex);
    }
  }

  private startMappingKeyer(mappingIndex: number, paddleMode: PaddleMode): void {
    const ks = this.getKeyerState(mappingIndex);
    if (ks.keyerRunning) return;
    ks.keyerRunning = true;
    this.runMappingKeyerLoop(mappingIndex, paddleMode);
  }

  private stopMappingKeyer(mappingIndex: number): void {
    const ks = this.keyerStates.get(mappingIndex);
    if (!ks) return;
    ks.keyerRunning = false;
    if (ks.keyerTimeout) {
      clearTimeout(ks.keyerTimeout);
      ks.keyerTimeout = null;
    }
    if (ks.elementPlaying) {
      ks.elementPlaying = false;
      const inputPath: InputPath = `serialPaddle:${mappingIndex}`;
      const m = this.settings.settings().serialInputMappings[mappingIndex];
      this.zone.run(() => {
        this.decoder.onKeyUp(inputPath, ks.source, {
          perfectTiming: true, fromSerial: true, name: m?.name, color: m?.color,
        });
      });
    }
    ks.currentElement = null;
    ks.lastElement = null;
    ks.ditMemory = false;
    ks.dahMemory = false;
  }

  private checkStopMappingKeyer(mappingIndex: number): void {
    const ks = this.keyerStates.get(mappingIndex);
    if (!ks) return;
    if (!ks.leftPaddleDown && !ks.rightPaddleDown &&
        !ks.ditMemory && !ks.dahMemory && !ks.elementPlaying) {
      this.stopMappingKeyer(mappingIndex);
    }
  }

  private runMappingKeyerLoop(mappingIndex: number, paddleMode: PaddleMode): void {
    const ks = this.keyerStates.get(mappingIndex);
    if (!ks || !ks.keyerRunning) return;
    const timings = timingsFromWpm(this.settings.settings().keyerWpm);
    const nextElement = this.pickNextElement(ks, paddleMode);
    if (!nextElement) {
      this.stopMappingKeyer(mappingIndex);
      return;
    }
    ks.currentElement = nextElement;
    const duration = nextElement === 'dit' ? timings.dit : timings.dah;
    const inputPath: InputPath = `serialPaddle:${mappingIndex}`;

    const m = this.settings.settings().serialInputMappings[mappingIndex];
    ks.elementPlaying = true;
    this.zone.run(() => {
      this.decoder.onKeyDown(inputPath, ks.source, {
        perfectTiming: true, fromSerial: true, name: m?.name, color: m?.color,
      });
    });

    ks.keyerTimeout = setTimeout(() => {
      ks.elementPlaying = false;
      this.zone.run(() => {
        this.decoder.onKeyUp(inputPath, ks.source, {
          perfectTiming: true, fromSerial: true, name: m?.name, color: m?.color,
        });
      });
      ks.lastElement = ks.currentElement;
      ks.currentElement = null;

      // Inter-element space (1 dit)
      ks.keyerTimeout = setTimeout(() => {
        if (ks.keyerRunning) {
          if (ks.leftPaddleDown || ks.rightPaddleDown ||
              ks.ditMemory || ks.dahMemory) {
            this.runMappingKeyerLoop(mappingIndex, paddleMode);
          } else {
            this.stopMappingKeyer(mappingIndex);
          }
        }
      }, timings.intraChar);
    }, duration);
  }

  /** Pick the next element to play based on the current paddle mode */
  private pickNextElement(ks: MappingKeyerState, mode: PaddleMode): 'dit' | 'dah' | null {
    const hasDit = ks.leftPaddleDown || ks.ditMemory;
    const hasDah = ks.rightPaddleDown || ks.dahMemory;
    let picked: 'dit' | 'dah' | null = null;
    const bothActive = hasDit && hasDah;

    if (mode === 'iambic-b' || mode === 'iambic-a') {
      if (bothActive) {
        picked = ks.lastElement === 'dit' ? 'dah' : 'dit';
      } else if (hasDit) {
        picked = 'dit';
      } else if (hasDah) {
        picked = 'dah';
      } else if (mode === 'iambic-b' && ks.lastElement) {
        picked = ks.lastElement === 'dit' ? 'dah' : 'dit';
      }
    } else if (mode === 'ultimatic') {
      if (bothActive) {
        picked = ks.lastElement || 'dit';
      } else if (hasDit) {
        picked = 'dit';
      } else if (hasDah) {
        picked = 'dah';
      }
    } else if (mode === 'single-lever') {
      if (hasDit) picked = 'dit';
      else if (hasDah) picked = 'dah';
    }

    if (picked === 'dit') ks.ditMemory = false;
    else if (picked === 'dah') ks.dahMemory = false;
    return picked;
  }
}
