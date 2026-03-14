/**
 * Morse Code Studio
 */

import { computed, effect, Injectable, NgZone, signal } from '@angular/core';
import { SerialOutputMapping, SettingsService } from './settings.service';

/**
 * Serial Key Output Service — keys transmitters via serial port DTR/RTS lines.
 *
 * Supports multiple output mappings, each targeting a specific port + pin
 * combination. keyDown/keyUp/schedulePulse broadcast to all enabled
 * mappings whose forward filter matches the source.
 *
 * Uses the Web Serial API to toggle DTR or RTS. setSignals() is typically
 * < 1 ms on modern OS serial drivers, easily supporting 50+ WPM morse
 * speeds (dit ≈ 24 ms at 50 WPM).
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

/**
 * Per-port connection state maintained by the service.
 * Multiple mappings can share the same port (e.g. DTR + RTS on one adapter).
 */
interface PortState {
  port: SerialPort;
  disconnectHandler: (() => void) | null;
}

/**
 * Per-mapping keying state.  Each mapping tracks its own key/pulse state
 * independently so mappings on different ports don't interfere.
 */
interface MappingKeyState {
  keyIsDown: boolean;
  holdoffTimer: ReturnType<typeof setTimeout> | null;
}

@Injectable({ providedIn: 'root' })
export class SerialKeyOutputService {
  /** Available serial ports (previously granted by the user) */
  readonly ports = signal<SerialPort[]>([]);

  /** Map of portIndex → open port state. Used for piggyback by serial input. */
  readonly openPorts = signal<Map<number, PortState>>(new Map());

  /** Whether any output port is currently open */
  readonly connected = computed(() => this.openPorts().size > 0);

  /** Last error message (for UI display) */
  readonly lastError = signal<string | null>(null);

  /** True while any serial output mapping is actively keying (key held or holdoff pending) */
  readonly isSending = signal(false);

  /**
   * Holdoff duration in milliseconds.
   *
   * *** DO NOT REMOVE OR SHORTEN THIS HOLDOFF ***
   * It prevents feedback loops when serial input and output share the
   * same physical port or when pins are cross-wired. Empirically tested:
   * 30 ms covers typical USB-serial adapter settling plus polling
   * round-trip jitter.
   */
  private static readonly SENDING_HOLDOFF_MS = 30;

  /** Per-mapping key state (indexed by mapping array position) */
  private keyStates = new Map<number, MappingKeyState>();

  /** Bound handler for navigator.serial connect events */
  private readonly onSerialConnect = () => this.handleSerialConnect();

  /** Whether auto-reconnect is in progress */
  private reconnecting = false;

  /** Whether the initial auto-connect has been attempted (one-shot guard) */
  private autoConnectAttempted = false;

  /** VID/PID of ports that were previously connected, keyed by port index */
  private portVidPids = new Map<number, { vid: number; pid: number }>();

  constructor(
    private settings: SettingsService,
    private zone: NgZone,
  ) {
    this.refreshPorts();

    if ('serial' in navigator) {
      navigator.serial.addEventListener('connect', this.onSerialConnect);
    }

    // Auto-open on page load if previously enabled.
    // Chrome remembers granted ports via getPorts(), so no user gesture
    // is needed. The one-shot guard prevents this from interfering
    // with explicit connect/disconnect actions from the settings card.
    effect(() => {
      const s = this.settings.settings();
      const enabled = s.serialEnabled;
      const mappings = s.serialOutputMappings;

      if (!this.autoConnectAttempted && enabled) {
        const portIndices = new Set(mappings.filter(m => m.enabled && m.portIndex >= 0).map(m => m.portIndex));
        if (portIndices.size > 0) {
          this.autoConnectAttempted = true;
          queueMicrotask(() => this.autoConnectAll([...portIndices]));
        }
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

  /** Get a human-readable label for a serial port */
  portLabel(port: SerialPort): string {
    const info = port.getInfo();
    if (info.usbVendorId !== undefined) {
      return `USB Serial (VID:${info.usbVendorId.toString(16).padStart(4, '0')} PID:${info.usbProductId?.toString(16).padStart(4, '0') ?? '????'})`;
    }
    return 'Serial Port';
  }

  /** Whether a specific port index has an open connection */
  isPortConnected(portIndex: number): boolean {
    return this.openPorts().has(portIndex);
  }

  /**
   * Get the open SerialPort object for a given port index, or null.
   * Used by serial input service for piggyback.
   */
  getOpenPort(portIndex: number): SerialPort | null {
    return this.openPorts().get(portIndex)?.port ?? null;
  }

  // ---- Keying API (called by decoder / encoder) ----

  /**
   * Key down — drive active signal on all matching mappings.
   * @param source  The signal source ('rx' or 'tx')
   */
  keyDown(source: 'rx' | 'tx' = 'tx'): void {
    const s = this.settings.settings();
    if (!s.serialEnabled) return;

    for (let i = 0; i < s.serialOutputMappings.length; i++) {
      const m = s.serialOutputMappings[i];
      if (!m.enabled || m.portIndex < 0) continue;
      if (m.forward !== 'both' && m.forward !== source) continue;

      const ps = this.openPorts().get(m.portIndex);
      if (!ps) continue;

      let ks = this.keyStates.get(i);
      if (!ks) {
        ks = { keyIsDown: false, holdoffTimer: null };
        this.keyStates.set(i, ks);
      }
      if (ks.keyIsDown) continue;
      ks.keyIsDown = true;

      if (ks.holdoffTimer) {
        clearTimeout(ks.holdoffTimer);
        ks.holdoffTimer = null;
      }
      this.isSending.set(true);

      const active = m.invert;
      const sig: SerialOutputSignals = m.pin === 'dtr'
        ? { dataTerminalReady: active }
        : { requestToSend: active };
      ps.port.setSignals(sig).catch(() => {});
    }
  }

  /** Key up — return all keyed mappings to idle */
  keyUp(): void {
    const s = this.settings.settings();

    for (let i = 0; i < s.serialOutputMappings.length; i++) {
      const m = s.serialOutputMappings[i];
      const ks = this.keyStates.get(i);
      if (!ks?.keyIsDown) continue;
      ks.keyIsDown = false;

      const ps = this.openPorts().get(m.portIndex);
      if (!ps) continue;

      const idle = !m.invert;
      const sig: SerialOutputSignals = m.pin === 'dtr'
        ? { dataTerminalReady: idle }
        : { requestToSend: idle };
      ps.port.setSignals(sig).catch(() => {});

      // Don't clear isSending immediately — start a holdoff timer so
      // the physical bus has time to settle before serial input is unmuted.
      if (ks.holdoffTimer) clearTimeout(ks.holdoffTimer);
      ks.holdoffTimer = setTimeout(() => {
        ks!.holdoffTimer = null;
        if (!ks!.keyIsDown) {
          this.updateSendingState();
        }
      }, SerialKeyOutputService.SENDING_HOLDOFF_MS);
    }
  }

  /**
   * Timed pulse for encoder — asserts pin for durationMs then de-asserts
   * on all matching mappings.
   */
  async schedulePulse(durationMs: number, source: 'rx' | 'tx' = 'tx'): Promise<void> {
    const s = this.settings.settings();
    if (!s.serialEnabled) return;

    const targets: { mapping: SerialOutputMapping; ps: PortState; ks: MappingKeyState }[] = [];
    for (let i = 0; i < s.serialOutputMappings.length; i++) {
      const m = s.serialOutputMappings[i];
      if (!m.enabled || m.portIndex < 0) continue;
      if (m.forward !== 'both' && m.forward !== source) continue;
      const ps = this.openPorts().get(m.portIndex);
      if (!ps) continue;
      let ks = this.keyStates.get(i);
      if (!ks) {
        ks = { keyIsDown: false, holdoffTimer: null };
        this.keyStates.set(i, ks);
      }
      if (ks.holdoffTimer) {
        clearTimeout(ks.holdoffTimer);
        ks.holdoffTimer = null;
      }
      targets.push({ mapping: m, ps, ks });
    }

    if (targets.length === 0) return;
    this.isSending.set(true);

    // Assert all
    for (const t of targets) {
      const active = t.mapping.invert;
      const sig: SerialOutputSignals = t.mapping.pin === 'dtr'
        ? { dataTerminalReady: active }
        : { requestToSend: active };
      await t.ps.port.setSignals(sig);
    }

    await new Promise(resolve => setTimeout(resolve, durationMs));

    // De-assert all and start holdoff
    for (const t of targets) {
      const idle = !t.mapping.invert;
      const sig: SerialOutputSignals = t.mapping.pin === 'dtr'
        ? { dataTerminalReady: idle }
        : { requestToSend: idle };
      await t.ps.port.setSignals(sig);

      if (t.ks.holdoffTimer) clearTimeout(t.ks.holdoffTimer);
      t.ks.holdoffTimer = setTimeout(() => {
        t.ks.holdoffTimer = null;
        if (!t.ks.keyIsDown) {
          this.updateSendingState();
        }
      }, SerialKeyOutputService.SENDING_HOLDOFF_MS);
    }
  }

  /** Test: toggle the pin on a specific mapping for 1 second */
  async test(mappingIndex: number): Promise<void> {
    const s = this.settings.settings();
    const m = s.serialOutputMappings[mappingIndex];
    if (!m) return;

    const ps = this.openPorts().get(m.portIndex);
    if (!ps) return;

    const active = m.invert;
    const idle = !m.invert;
    const onSig: SerialOutputSignals = m.pin === 'dtr'
      ? { dataTerminalReady: active }
      : { requestToSend: active };
    const offSig: SerialOutputSignals = m.pin === 'dtr'
      ? { dataTerminalReady: idle }
      : { requestToSend: idle };

    try {
      await ps.port.setSignals(onSig);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await ps.port.setSignals(offSig);
    } catch (e: any) {
      this.lastError.set(e.message ?? 'Test failed.');
    }
  }

  // ---- Port management ----

  /** Open a specific port by index */
  async open(portIndex: number): Promise<void> {
    if (this.openPorts().has(portIndex)) return;

    await this.refreshPorts();
    const ports = this.ports();
    if (portIndex < 0 || portIndex >= ports.length) {
      this.lastError.set('Invalid port index.');
      return;
    }

    const port = ports[portIndex];
    try {
      await port.open({ baudRate: 9600 });

      // Force both pins to idle after open.
      // Determine idle from the first mapping on this port, or default.
      const s = this.settings.settings();
      const firstMapping = s.serialOutputMappings.find(m => m.portIndex === portIndex);
      const idle = firstMapping ? !firstMapping.invert : true;
      await port.setSignals({
        dataTerminalReady: idle,
        requestToSend: idle,
      });

      const disconnectHandler = () => {
        this.zone.run(() => {
          this.removePort(portIndex);
          this.refreshPorts();
        });
      };
      port.addEventListener('disconnect', disconnectHandler);

      const map = new Map(this.openPorts());
      map.set(portIndex, { port, disconnectHandler });
      this.openPorts.set(map);

      // Remember VID/PID for reconnection matching
      const info = port.getInfo();
      if (info.usbVendorId !== undefined) {
        this.portVidPids.set(portIndex, { vid: info.usbVendorId, pid: info.usbProductId ?? 0 });
      }

      this.lastError.set(null);
    } catch (e: any) {
      if (e.message?.includes('already open')) {
        // Port is already open — typically because a previous close()
        // hasn't settled yet. Silently adopt the open port.
        const disconnectHandler = () => {
          this.zone.run(() => {
            this.removePort(portIndex);
            this.refreshPorts();
          });
        };
        port.addEventListener('disconnect', disconnectHandler);

        const map = new Map(this.openPorts());
        map.set(portIndex, { port, disconnectHandler });
        this.openPorts.set(map);

        // Remember VID/PID for reconnection matching
        const info = port.getInfo();
        if (info.usbVendorId !== undefined) {
          this.portVidPids.set(portIndex, { vid: info.usbVendorId, pid: info.usbProductId ?? 0 });
        }

        this.lastError.set(null);
        return;
      }
      this.lastError.set(e.message ?? 'Failed to open serial port.');
    }
  }

  /** Close a specific port by index */
  async close(portIndex: number): Promise<void> {
    const map = new Map(this.openPorts());
    const ps = map.get(portIndex);
    if (!ps) return;

    if (ps.disconnectHandler) {
      ps.port.removeEventListener('disconnect', ps.disconnectHandler);
    }
    try {
      await ps.port.close();
    } catch { /* port may already be closed */ }

    map.delete(portIndex);
    this.openPorts.set(map);
    this.clearKeyStatesForPort(portIndex);
  }

  /** Close all open ports */
  async closeAll(): Promise<void> {
    const portIndices = [...this.openPorts().keys()];
    for (const idx of portIndices) {
      await this.close(idx);
    }
  }

  /**
   * Connect all ports needed by the current set of enabled mappings.
   */
  async connectAllEnabled(): Promise<void> {
    const s = this.settings.settings();
    if (!s.serialEnabled) return;

    const neededPorts = new Set<number>();
    for (const m of s.serialOutputMappings) {
      if (m.enabled && m.portIndex >= 0) {
        neededPorts.add(m.portIndex);
      }
    }

    for (const portIndex of neededPorts) {
      if (!this.openPorts().has(portIndex)) {
        await this.open(portIndex);
      }
    }
  }

  // ---- Private helpers ----

  /** Remove a port from the open set (e.g. on disconnect) */
  private removePort(portIndex: number): void {
    const map = new Map(this.openPorts());
    const ps = map.get(portIndex);
    if (ps?.disconnectHandler) {
      ps.port.removeEventListener('disconnect', ps.disconnectHandler);
    }
    map.delete(portIndex);
    this.openPorts.set(map);
    this.clearKeyStatesForPort(portIndex);
  }

  /** Clear key states for all mappings on a specific port */
  private clearKeyStatesForPort(portIndex: number): void {
    const s = this.settings.settings();
    for (let i = 0; i < s.serialOutputMappings.length; i++) {
      if (s.serialOutputMappings[i].portIndex === portIndex) {
        const ks = this.keyStates.get(i);
        if (ks) {
          ks.keyIsDown = false;
          if (ks.holdoffTimer) {
            clearTimeout(ks.holdoffTimer);
            ks.holdoffTimer = null;
          }
          this.keyStates.delete(i);
        }
      }
    }
    this.updateSendingState();
  }

  /** Recompute isSending from all mapping key states */
  private updateSendingState(): void {
    for (const ks of this.keyStates.values()) {
      if (ks.keyIsDown || ks.holdoffTimer) {
        this.isSending.set(true);
        return;
      }
    }
    this.isSending.set(false);
  }

  /**
   * Handle a serial device being physically connected.
   * Attempt to re-open any configured ports that are not yet connected.
   * Falls back to VID/PID matching if stored port indices are stale.
   */
  private handleSerialConnect(): void {
    if (!this.settings.settings().serialEnabled) return;
    if (this.reconnecting) return;
    this.reconnecting = true;
    setTimeout(async () => {
      try {
        await this.refreshPorts();
        this.remapStalePortIndices();
        await this.connectAllEnabled();
      } finally {
        this.reconnecting = false;
      }
    }, 1000);
  }

  /**
   * Auto-connect to the configured ports on startup.
   * Retries with increasing delays to handle late USB enumeration.
   * Falls back to VID/PID matching if stored port indices are stale.
   */
  private async autoConnectAll(portIndices: number[]): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    try {
      for (const delay of [0, 500, 1500, 3000]) {
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
        await this.refreshPorts();
        this.remapStalePortIndices();
        // Re-read indices after potential remap
        const s = this.settings.settings();
        const currentIndices = new Set(
          s.serialOutputMappings.filter(m => m.enabled && m.portIndex >= 0).map(m => m.portIndex)
        );
        for (const idx of currentIndices) {
          if (!this.openPorts().has(idx) && idx < this.ports().length) {
            await this.open(idx);
          }
        }
        if ([...currentIndices].every(idx => this.openPorts().has(idx))) return;
      }
    } finally {
      this.reconnecting = false;
    }
  }

  /**
   * Remap stale port indices in serialOutputMappings.
   * If a mapping references a port index that is out of range but we
   * have a stored VID/PID for it, scan current ports for a match
   * and update the mapping to the new index.
   */
  private remapStalePortIndices(): void {
    const ports = this.ports();
    const s = this.settings.settings();
    let updated = false;
    const updatedMappings = s.serialOutputMappings.map(m => {
      if (m.portIndex < 0 || m.portIndex < ports.length) return m;
      // Port index is out of range — try VID/PID match
      const vidPid = this.portVidPids.get(m.portIndex);
      if (!vidPid) return m;
      for (let i = 0; i < ports.length; i++) {
        const info = ports[i].getInfo();
        if (info.usbVendorId === vidPid.vid &&
            (info.usbProductId ?? 0) === vidPid.pid) {
          updated = true;
          this.portVidPids.delete(m.portIndex);
          this.portVidPids.set(i, vidPid);
          return { ...m, portIndex: i };
        }
      }
      return m;
    });
    if (updated) {
      this.settings.update({ serialOutputMappings: updatedMappings });
    }
  }
}
