/**
 * Morse Code Studio
 */

import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { CwInputService, CwScopeBuffer, cwStatusText } from '../../services/cw-input.service';

/** Seconds of history across the trace */
const SPAN_MS = 2500;

/**
 * CW scope — shows what the CW tone detector hears, in the place of the
 * typing box (main screen) or above the conversation (full screen).
 *
 * Left: the last 2.5 s scrolling to the left. The faint grey trace is the
 * raw received sound, the filled blue area is the tone at the locked
 * frequency, the green strip marks key-down. Horizontal lines show the
 * levels the detector learned: amber = key-down level, dashed cyan =
 * key-up level, grey = noise. The scale follows the signal (auto gain).
 * The highlighted band at the right edge is the analysis window the tone
 * search works on.
 *
 * Right: the spectrum of the search band (400–900 Hz) with a marker at the
 * locked tone.
 *
 * Drawing runs on animation frames outside Angular's zone.
 */
@Component({
  selector: 'app-cw-scope',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cw-scope.component.html',
  styleUrls: ['./cw-scope.component.css'],
})
export class CwScopeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLCanvasElement>;

  private frame = 0;
  private resizeObs: ResizeObserver | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private lastCount = -1;
  private lastStatusKey = '';
  /** Smoothed vertical full scale (auto gain of the display) */
  private scale = 0.01;

  constructor(public cwInput: CwInputService, private zone: NgZone) {}

  /** Status line under the trace */
  statusText(): string {
    const st = this.cwInput.status();
    if (st) return cwStatusText(st);
    // AudioWorklet path only (non-Chromium): after a reload the browser holds the detector until a click
    if (this.cwInput.isStarted && this.cwInput.paused()) return 'Click or tap anywhere to start the CW detector.';
    return 'Start Audio to see the CW detector.';
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    this.zone.runOutsideAngular(() => {
      this.resizeObs = new ResizeObserver(() => this.measure());
      this.resizeObs.observe(canvas);
      this.measure();
      const loop = () => {
        this.draw();
        this.frame = requestAnimationFrame(loop);
      };
      this.frame = requestAnimationFrame(loop);
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObs?.disconnect();
  }

  private measure(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.width = canvas.clientWidth;
    this.height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    canvas.height = Math.max(1, Math.round(this.height * this.dpr));
    this.lastCount = -1;
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || this.width < 10 || this.height < 10) return;
    const buf = this.cwInput.scope;
    const st = this.cwInput.status();
    const statusKey = st ? `${st.state}${st.gate}${st.windowMs}` : 'off';
    if (buf.count === this.lastCount && statusKey === this.lastStatusKey) return;
    this.lastCount = buf.count;
    this.lastStatusKey = statusKey;

    const w = this.width;
    const h = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const specW = Math.round(Math.min(160, Math.max(72, w * 0.22)));
    const gap = 8;
    const traceW = w - specW - gap;
    const top = 4;
    const base = h - 6;
    const plotH = base - top;

    // Auto gain: full scale follows the tone level (or the trace when there is none yet)
    const n = Math.min(buf.count, SPAN_MS, CwScopeBuffer.SIZE);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const v = buf.env[(buf.count - 1 - i) % CwScopeBuffer.SIZE];
      if (v > peak) peak = v;
    }
    const target = Math.max(buf.signal * 1.35, buf.hi * 1.8, peak * 1.1, 1e-4);
    this.scale = target > this.scale ? target : this.scale + (target - this.scale) * 0.05;
    const yOf = (v: number) => base - Math.min(1, v / this.scale) * plotH;

    // Trace background
    ctx.fillStyle = '#12161b';
    ctx.fillRect(0, 0, traceW, h);

    if (n > 0) {
      const perPx = SPAN_MS / traceW;
      // Newest sample is at the right edge
      for (let x = traceW - 1; x >= 0; x--) {
        const a = Math.floor((traceW - 1 - x) * perPx);
        const b = Math.floor((traceW - x) * perPx);
        if (a >= n) break;
        let env = 0;
        let raw = 0;
        let key = 0;
        for (let i = a; i < Math.max(a + 1, b) && i < n; i++) {
          const j = (buf.count - 1 - i) % CwScopeBuffer.SIZE;
          if (buf.env[j] > env) env = buf.env[j];
          if (buf.raw[j] > raw) raw = buf.raw[j];
          if (buf.key[j] === 1) key = 2;
          else if (buf.key[j] === 2 && !key) key = 1;
        }
        // Raw sound: a faint mirrored waveform around the middle
        const rh = Math.min(1, raw / (this.scale * 2)) * plotH / 2;
        ctx.fillStyle = 'rgba(160,170,185,0.16)';
        ctx.fillRect(x, top + plotH / 2 - rh, 1, rh * 2);
        // Tone envelope
        const y = yOf(env);
        // key: 0 up, 1 held back by the squelch (dim), 2 decoded (green)
        ctx.fillStyle = key === 2 ? 'rgba(80,190,255,0.85)' : 'rgba(80,150,210,0.55)';
        ctx.fillRect(x, y, 1, base - y);
        if (key) {
          ctx.fillStyle = key === 2 ? '#3d3' : 'rgba(150,160,150,0.5)';
          ctx.fillRect(x, base + 2, 1, 3);
        }
      }
    }

    // Learned levels
    if (st && buf.hi > 0) {
      this.hLine(ctx, yOf(buf.noise), traceW, 'rgba(170,170,170,0.5)', []);
      this.hLine(ctx, yOf(buf.lo), traceW, '#4dd', [4, 3]);
      this.hLine(ctx, yOf(buf.hi), traceW, '#fb3', []);
    }

    // Sliding analysis window at the newest edge
    if (st) {
      const ww = Math.max(4, (st.windowMs / SPAN_MS) * traceW);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(traceW - ww, 0, ww, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(traceW - ww + 0.5, 0.5, ww - 1, h - 1);
    }

    // Spectrum
    const sx = traceW + gap;
    ctx.fillStyle = '#12161b';
    ctx.fillRect(sx, 0, specW, h);
    const spec = buf.spectrum;
    if (st && spec && spec.length > 1) {
      const bw = specW / spec.length;
      for (let i = 0; i < spec.length; i++) {
        const v = Math.max(0, Math.min(1, spec[i] / 30));
        const bh = v * plotH;
        ctx.fillStyle = v > 0.5 ? 'rgba(120,200,255,0.9)' : 'rgba(100,140,180,0.6)';
        ctx.fillRect(sx + i * bw, base - bh, Math.max(1, bw - 0.5), bh);
      }
      if (st.state !== 'search') {
        const fx = sx + ((st.freq - buf.specLo) / buf.specStep + 0.5) * bw;
        if (fx >= sx && fx <= sx + specW) {
          ctx.fillStyle = '#fb3';
          ctx.fillRect(fx - 1, 0, 2, h);
        }
      }
    }
  }

  private hLine(ctx: CanvasRenderingContext2D, y: number, w: number, color: string, dash: number[]): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(w, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
