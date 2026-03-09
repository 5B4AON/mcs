/**
 * Morse Code Studio
 */

import { Injectable, signal, OnDestroy, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService, OutputForward } from './settings.service';

import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import {
  getDatabase,
  ref,
  onValue,
  set,
  serverTimestamp,
  off,
  Database,
  DatabaseReference,
  Unsubscribe,
} from 'firebase/database';

import { firebaseConfig } from '../firebase.config';

/**
 * Data model for a single letter entry stored in RTDB.
 *
 * Path: /morse-code-studio/channels/{channelName}/{secret}
 *
 * Only the last letter per channel+secret is stored. Writing a new
 * letter overwrites the previous one, keeping data minimal.
 */
interface RtdbLetterEntry {
  /** The morse character (single letter/digit/punctuation) */
  char: string;
  /** User name (callsign) of the sender */
  userName: string;
  /** Server timestamp (ms since epoch) */
  ts: object | number;
  /** WPM speed used to generate this character (2-digit number) */
  wpm?: number;
}

/**
 * Firebase Realtime Database Service — channel-based morse letter relay.
 *
 * Provides two independent functions:
 *
 * 1. **Input (subscribe)**: Listens to a channel for incoming letters.
 *    When a letter arrives that matches the configured channel name and
 *    secret, it is emitted as a decoded character, the same as if
 *    someone typed it via the keyboard encoder.
 *
 * 2. **Output (publish)**: Writes decoded characters to a channel so
 *    remote clients can receive them. Filtered by forward mode
 *    (RX, TX, or Both), same as WinKeyer forwarding.
 *
 * Design decisions:
 *  - Offline caching is disabled. RTDB only operates when online.
 *  - Each channel stores only the last letter (minimal data footprint).
 *  - Channel limits and TTL are enforced externally via Firebase
 *    Security Rules and/or Cloud Functions (see firebase.config.ts).
 *  - The secret is used as a path segment, so only listeners who know
 *    both the channel name and secret receive the data.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseRtdbService implements OnDestroy {
  /** Whether the Firebase app has been initialised successfully */
  readonly initialized = signal(false);

  /** Whether the browser is currently online */
  readonly isOnline = signal(navigator.onLine);

  /** Last error message for UI display */
  readonly lastError = signal<string | null>(null);

  /**
   * Persistent connection warning shown as a banner when auto-reconnect
   * has exhausted all retries. Dismissed by the user or cleared on
   * successful reconnect.
   */
  readonly connectionWarning = signal<string | null>(null);

  /** Emits received characters from the subscribed input channel */
  readonly incomingChar$ = new Subject<{ char: string; source: 'rx' | 'tx'; userName: string; wpm: number }>();

  /** Whether we are actively listening to an input channel */
  readonly inputListening = signal(false);

  /** Whether we are actively publishing to an output channel */
  readonly outputActive = signal(false);

  private app: FirebaseApp | null = null;
  private db: Database | null = null;
  private inputUnsubscribe: Unsubscribe | null = null;
  private inputRef: DatabaseReference | null = null;
  private lastInputChar: string | null = null;
  private lastInputTs: number = 0;

  // ── Server-time synchronisation ──
  /**
   * Offset (ms) between local clock and Firebase server clock.
   * Obtained from Firebase's `.info/serverTimeOffset` which acts as an
   * NTP-like synchronisation mechanism.  `Date.now() + offset` yields
   * an accurate UTC timestamp aligned with the Firebase server.
   */
  private serverTimeOffset = 0;
  private timeOffsetReady = false;
  private offsetUnsubscribe: Unsubscribe | null = null;

  // ── Stale-character guard ──
  /**
   * When true, the very next character received on the input channel
   * must pass a freshness check (timestamp within 1 s of "now").
   * This prevents a stale character (e.g. from yesterday) from being
   * displayed simply because we just connected to the channel.
   */
  private firstCharAfterConnect = false;

  // ── Auto-reconnect state ──
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY_MS = 2000;   // 2 s, 4 s, 8 s

  private inputRetries = 0;
  private outputRetries = 0;
  private inputRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private outputRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  /** How often (ms) we check for enabled-but-inactive channels */
  private static readonly HEALTH_CHECK_MS = 5_000;

  private onlineHandler = () => {
    this.isOnline.set(navigator.onLine);
    if (navigator.onLine) this.reconnectOnOnline();
  };
  private offlineHandler = () => {
    this.isOnline.set(false);
    this.handleOffline();
  };

  constructor(
    private settings: SettingsService,
    private zone: NgZone,
  ) {
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
    this.startHealthCheck();
  }

  ngOnDestroy(): void {
    this.stopInput();
    this.clearRetryTimers();
    this.stopHealthCheck();
    this.unsubscribeTimeOffset();
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
  }

  /** Clear all pending retry timers */
  private clearRetryTimers(): void {
    if (this.inputRetryTimer) { clearTimeout(this.inputRetryTimer); this.inputRetryTimer = null; }
    if (this.outputRetryTimer) { clearTimeout(this.outputRetryTimer); this.outputRetryTimer = null; }
  }

  // ──────────────────────────────────────────────
  //  Server-time synchronisation (NTP-like)
  // ──────────────────────────────────────────────

  /**
   * Subscribe to Firebase's `.info/serverTimeOffset` to learn the
   * difference between the local device clock and the Firebase server
   * clock.  This is conceptually equivalent to an NTP query — Google's
   * infrastructure serves an authoritative UTC timestamp, and the SDK
   * computes the offset automatically.
   *
   * If the offset is not available within 1 second (e.g. slow network),
   * the fallback is `Date.now()` which is already in UTC (ms since
   * the Unix epoch) and is timezone-independent.
   */
  private subscribeToTimeOffset(): void {
    if (this.offsetUnsubscribe || !this.db) return;
    const offsetRef = ref(this.db, '.info/serverTimeOffset');
    this.offsetUnsubscribe = onValue(offsetRef, (snap) => {
      this.serverTimeOffset = snap.val() ?? 0;
      this.timeOffsetReady = true;
    });
  }

  /** Unsubscribe from the time-offset listener */
  private unsubscribeTimeOffset(): void {
    if (this.offsetUnsubscribe) {
      this.offsetUnsubscribe();
      this.offsetUnsubscribe = null;
    }
  }

  /**
   * Return an accurate UTC timestamp (ms since epoch) by applying the
   * server-time offset to the local clock.  If the offset has not been
   * received yet, falls back to the raw local clock (still UTC).
   */
  private accurateNow(): number {
    return Date.now() + this.serverTimeOffset;
  }

  /** Start the periodic health-check interval */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => this.runHealthCheck(), FirebaseRtdbService.HEALTH_CHECK_MS);
  }

  /** Stop the periodic health-check interval */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) { clearInterval(this.healthCheckTimer); this.healthCheckTimer = null; }
  }

  /**
   * Periodic health check — if a channel is enabled in settings but not
   * currently active, and the browser is online, reset retries and
   * attempt to restart it.
   */
  private runHealthCheck(): void {
    if (!navigator.onLine) return;
    const s = this.settings.settings();

    if (s.rtdbInputEnabled && !this.inputListening() && !this.inputRetryTimer) {
      this.inputRetries = 0;
      this.connectionWarning.set(null);
      this.startInput();
    }
    if (s.rtdbOutputEnabled && !this.outputActive() && !this.outputRetryTimer) {
      this.outputRetries = 0;
      this.connectionWarning.set(null);
      this.startOutput();
    }
  }

  /** Dismiss the connection warning banner */
  dismissWarning(): void {
    this.connectionWarning.set(null);
  }

  // ──────────────────────────────────────────────
  //  Initialization
  // ──────────────────────────────────────────────

  /**
   * Initialise the Firebase app and RTDB connection.
   * Called lazily when the user enables either RTDB input or output.
   * Disables offline persistence so RTDB only operates when online.
   */
  private ensureInitialized(): boolean {
    if (this.initialized()) return true;

    // Guard: check Firebase config is set
    if (!firebaseConfig.databaseURL || firebaseConfig.databaseURL.includes('YOUR_PROJECT')) {
      this.lastError.set(
        'Firebase is not configured. Edit src/app/firebase.config.ts with your project settings.'
      );
      return false;
    }

    try {
      // Reuse existing app if already initialised (e.g. by another module)
      if (getApps().length === 0) {
        this.app = initializeApp(firebaseConfig);
      } else {
        this.app = getApps()[0];
      }
      this.db = getDatabase(this.app);

      this.initialized.set(true);
      this.lastError.set(null);
      this.subscribeToTimeOffset();
      return true;
    } catch (err: any) {
      this.lastError.set(`Firebase init failed: ${err.message || err}`);
      return false;
    }
  }

  // ──────────────────────────────────────────────
  //  Input — subscribe to a channel
  // ──────────────────────────────────────────────

  /**
   * Start listening to the configured input channel.
   * Letters that arrive are emitted on incomingChar$.
   */
  startInput(): void {
    this.stopInput();

    if (!navigator.onLine) {
      this.lastError.set('Cannot start Firebase RTDB input — you are offline.');
      return;
    }

    if (!this.ensureInitialized() || !this.db) return;

    const s = this.settings.settings();
    const channelName = s.rtdbInputChannelName.trim();
    const channelSecret = s.rtdbInputChannelSecret.trim();

    if (!channelName || !channelSecret) {
      this.lastError.set('Channel Name and Channel Secret are required for RTDB input.');
      return;
    }

    const path = `morse-code-studio/channels/${encodeURIComponent(channelName)}/${encodeURIComponent(channelSecret)}`;
    this.inputRef = ref(this.db, path);
    this.lastInputChar = null;
    this.lastInputTs = 0;
    this.firstCharAfterConnect = true;

    this.inputUnsubscribe = onValue(this.inputRef, (snapshot) => {
      this.zone.run(() => {
        if (!snapshot.exists()) return;
        const data = snapshot.val() as RtdbLetterEntry;
        if (!data || !data.char) return;

        // De-duplicate: skip if same char+timestamp as last processed
        const ts = typeof data.ts === 'number' ? data.ts : 0;
        if (data.char === this.lastInputChar && ts === this.lastInputTs) return;

        // ── Stale-character guard (first char after connect only) ──
        // When we first subscribe, the RTDB listener immediately fires
        // with the last stored value on the channel.  If that value is
        // old (e.g. from a previous session hours or days ago) we must
        // discard it silently so it does not appear in the decoder.
        // The check uses an NTP-synchronised UTC timestamp (via
        // Firebase .info/serverTimeOffset) to avoid timezone issues.
        if (this.firstCharAfterConnect) {
          this.firstCharAfterConnect = false;  // only check once
          if (ts > 0) {
            const age = this.accurateNow() - ts;
            if (age > 1000) {
              // Character is older than 1 second — discard silently
              this.lastInputChar = data.char;
              this.lastInputTs = ts;
              return;
            }
          }
        }

        // Skip our own echoes: if the incoming userName matches our output
        // userName, this is a character we wrote — don't feed it back.
        const ourName = this.settings.settings().rtdbOutputUserName.trim();
        if (ourName && data.userName === ourName) return;

        this.lastInputChar = data.char;
        this.lastInputTs = ts;

        const source = this.settings.settings().rtdbInputSource;
        // Use remote WPM if available, fall back to local encoder WPM
        const wpm = (typeof data.wpm === 'number' && data.wpm >= 5 && data.wpm <= 60)
          ? data.wpm
          : this.settings.settings().encoderWpm;
        this.incomingChar$.next({ char: data.char, source, userName: data.userName || '', wpm });
      });
    }, (err) => {
      this.zone.run(() => {
        this.lastError.set(`RTDB input error: ${err.message || err}`);
        this.inputListening.set(false);
        this.scheduleInputRetry();
      });
    });

    this.inputRetries = 0;
    this.inputListening.set(true);
    this.lastError.set(null);
    this.connectionWarning.set(null);
  }

  /** Stop listening to the input channel */
  stopInput(): void {
    if (this.inputRetryTimer) { clearTimeout(this.inputRetryTimer); this.inputRetryTimer = null; }
    this.inputRetries = 0;
    if (this.inputUnsubscribe) {
      this.inputUnsubscribe();
      this.inputUnsubscribe = null;
    }
    if (this.inputRef) {
      off(this.inputRef);
      this.inputRef = null;
    }
    this.inputListening.set(false);
    this.lastInputChar = null;
    this.lastInputTs = 0;
  }

  // ──────────────────────────────────────────────
  //  Output — publish characters to a channel
  // ──────────────────────────────────────────────

  /**
   * Start the output channel (marks it active).
   * Actual writing happens per-character via forwardDecodedChar().
   */
  startOutput(): void {
    if (!navigator.onLine) {
      this.lastError.set('Cannot start Firebase RTDB output — you are offline.');
      return;
    }

    if (!this.ensureInitialized()) return;

    const s = this.settings.settings();
    if (!s.rtdbOutputChannelName.trim() || !s.rtdbOutputChannelSecret.trim()) {
      this.lastError.set('Channel Name and Channel Secret are required for RTDB output.');
      return;
    }

    this.outputActive.set(true);
    this.outputRetries = 0;
    this.lastError.set(null);
    this.connectionWarning.set(null);
  }

  /** Stop the output channel */
  stopOutput(): void {
    if (this.outputRetryTimer) { clearTimeout(this.outputRetryTimer); this.outputRetryTimer = null; }
    this.outputRetries = 0;
    this.outputActive.set(false);
  }

  // ──────────────────────────────────────────────
  //  Auto-reconnect helpers
  // ──────────────────────────────────────────────

  /**
   * Schedule an exponential-backoff retry for the input listener.
   * After MAX_RETRIES failures, show a persistent warning banner.
   */
  private scheduleInputRetry(): void {
    if (this.inputRetries >= FirebaseRtdbService.MAX_RETRIES) {
      this.connectionWarning.set(
        'Firebase RTDB input connection lost. Please check your network and reconnect manually.'
      );
      return;
    }
    const delay = FirebaseRtdbService.BASE_DELAY_MS * Math.pow(2, this.inputRetries);
    this.inputRetries++;
    this.inputRetryTimer = setTimeout(() => {
      this.inputRetryTimer = null;
      if (this.settings.settings().rtdbInputEnabled && !this.inputListening()) {
        this.startInput();
      }
    }, delay);
  }

  /**
   * Schedule an exponential-backoff retry for the output channel.
   * After MAX_RETRIES failures, show a persistent warning banner.
   */
  private scheduleOutputRetry(): void {
    if (this.outputRetries >= FirebaseRtdbService.MAX_RETRIES) {
      this.connectionWarning.set(
        'Firebase RTDB output connection lost. Please check your network and reconnect manually.'
      );
      return;
    }
    const delay = FirebaseRtdbService.BASE_DELAY_MS * Math.pow(2, this.outputRetries);
    this.outputRetries++;
    this.outputRetryTimer = setTimeout(() => {
      this.outputRetryTimer = null;
      if (this.settings.settings().rtdbOutputEnabled && !this.outputActive()) {
        this.startOutput();
      }
    }, delay);
  }

  /**
   * Called when the browser comes back online.
   * Restarts input/output if the user had them enabled but they
   * dropped due to a network interruption.
   */
  private reconnectOnOnline(): void {
    const s = this.settings.settings();
    if (s.rtdbInputEnabled && !this.inputListening()) {
      this.inputRetries = 0;
      if (this.inputRetryTimer) { clearTimeout(this.inputRetryTimer); this.inputRetryTimer = null; }
      this.startInput();
    }
    if (s.rtdbOutputEnabled && !this.outputActive()) {
      this.outputRetries = 0;
      if (this.outputRetryTimer) { clearTimeout(this.outputRetryTimer); this.outputRetryTimer = null; }
      this.startOutput();
    }
  }

  /**
   * Called when the browser goes offline.
   * Marks input/output as inactive so the RTDB status indicator turns
   * grey, and shows a connection-warning banner if either channel was
   * enabled.
   */
  private handleOffline(): void {
    const s = this.settings.settings();
    const wasActive = this.inputListening() || this.outputActive();

    // Tear down the input listener cleanly so we can re-subscribe on reconnect
    if (this.inputUnsubscribe) {
      this.inputUnsubscribe();
      this.inputUnsubscribe = null;
    }
    if (this.inputRef) {
      off(this.inputRef);
      this.inputRef = null;
    }
    this.inputListening.set(false);
    this.outputActive.set(false);
    this.clearRetryTimers();

    if (wasActive || s.rtdbInputEnabled || s.rtdbOutputEnabled) {
      this.connectionWarning.set(
        'Network offline — Firebase RTDB disconnected. Will reconnect automatically when back online.'
      );
    }
  }

  /**
   * Forward a decoded character to the RTDB output channel.
   * Filtered by the configured forward mode (RX, TX, or Both).
   *
   * Called by the app component when the decoder produces a new character,
   * same pattern as WinKeyer forwarding.
   *
   * @param char   The decoded character
   * @param source Whether this came from 'rx' or 'tx' decoder pool
   * @param wpm    WPM speed used to generate this character
   */
  async forwardDecodedChar(char: string, source: 'rx' | 'tx', wpm?: number): Promise<void> {
    if (!this.settings.settings().rtdbOutputEnabled) return;
    if (!this.outputActive()) return;
    if (!this.db) return;
    if (!navigator.onLine) return;

    const s = this.settings.settings();
    const fwd: OutputForward = s.rtdbOutputForward;
    if (fwd !== 'both' && fwd !== source) return;

    const channelName = s.rtdbOutputChannelName.trim();
    const channelSecret = s.rtdbOutputChannelSecret.trim();
    const userName = s.rtdbOutputUserName.trim();

    if (!channelName || !channelSecret) return;

    const path = `morse-code-studio/channels/${encodeURIComponent(channelName)}/${encodeURIComponent(channelSecret)}`;
    const entryRef = ref(this.db, path);

    try {
      await set(entryRef, {
        char,
        userName: userName || 'Anonymous',
        ts: serverTimestamp(),
        wpm: wpm ?? s.encoderWpm,
      });
    } catch (err: any) {
      // Don't spam errors for every character — just set once
      if (!this.lastError()) {
        this.lastError.set(`RTDB write error: ${err.message || err}`);
      }
      // Mark output as dropped and attempt auto-reconnect
      this.outputActive.set(false);
      this.scheduleOutputRetry();
    }
  }

  /**
   * Forward a character from the encoder (TX source).
   * Convenience wrapper matching the encoder's forwardDecodedChar pattern.
   */
  async forwardEncoderChar(char: string, wpm?: number): Promise<void> {
    await this.forwardDecodedChar(char, 'tx', wpm);
  }
}
