/**
 * Morse Code Studio
 */

import { AfterViewInit, Component, ElementRef, Input, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { FireworkSound, ShellKind } from './firework-sound';

/** Burst colours as hues (red, orange, gold, green, cyan-blue, blue, purple, pink) */
const HUES = [2, 24, 46, 125, 190, 215, 280, 330];

/** Per-frame (1/60 s) fraction of the picture that fades away: this is what leaves the slowly vanishing light trails */
const FADE = 0.12;

/** Pause after the text colour change has finished, before the first shell */
const AFTER_TEXT_CHANGE_MS = 1000;

/**
 * Wait before the first shell: the end of the text colour change plus a short pause.
 * Full screen: the text fades over 2 s from the start (and a closing keyboard settles meanwhile).
 */
export const LAUNCH_DELAY_MS = 2000 + AFTER_TEXT_CHANGE_MS;

/** Main screen: the text starts changing 2 s into the darkening and takes 2 s (see `.decoded-parchment.night` in app.component.css) */
export const MAIN_LAUNCH_DELAY_MS = 4000 + AFTER_TEXT_CHANGE_MS;

/** Simulation speed: 0.8 = 20 % slower, so every burst, trail and fade lasts 25 % longer */
const SPEED = 0.8;

/** A burst particle (a streaking spark) or a glittering star that appears later and falls */
interface Particle {
  x: number; y: number; px: number; py: number; vx: number; vy: number;
  drag: number; gravity: number;
  age: number; life: number; delay: number;
  hue: number; width: number;
  star: boolean; crackle: boolean;
  /** The white flash at the centre of a shell: full white at once, then a slow crackling fade while it falls */
  flash: boolean;
}

/**
 * A see-through firework show that fills the positioned box it sits in (the output area)
 * and plays until its owner removes it. It never takes clicks, so everything underneath
 * stays usable.
 *
 * It is a small particle simulation drawn on a canvas. Shells burst at random places: peonies
 * (a full sphere seen from the side), rings and gold willows. Every spark flies out fast, is
 * slowed by drag, bends down under gravity, starts as a white-hot point that cools to its
 * colour, and fades out. Each frame the previous picture is faded a little instead of erased,
 * which leaves thin light trails that disappear slowly behind each spark. Tiny glittering
 * stars flicker and fall after the burst. The loop runs outside Angular's zone and stops when
 * the component is destroyed. With reduced motion a single still frame is drawn.
 */
@Component({
  selector: 'app-fireworks',
  standalone: true,
  template: `<canvas #canvas aria-hidden="true"></canvas>`,
  styles: [`
    :host {
      position: absolute;
      inset: 0;
      z-index: 4;
      overflow: hidden;
      pointer-events: none;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      opacity: 1;
    }
  `],
})
export class FireworksComponent implements AfterViewInit, OnDestroy {
  /** Time before the first shell, in milliseconds */
  @Input() launchDelayMs = LAUNCH_DELAY_MS;

  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private frame = 0;
  private lastTime = 0;
  /** Frame time (in 1/60 s) smoothed over a few frames, so uneven animation-frame timestamps do not make the motion stutter */
  private smoothFrames = 0;
  /** Pre-drawn soft glows (drawn once, then stamped each frame instead of building a gradient every time) */
  private starSprite?: HTMLCanvasElement;
  private readonly flashSprites = new Map<number, HTMLCanvasElement>();
  private untilNextBurst = 0;
  private observer?: ResizeObserver;
  private still = false;
  private started = false;
  private startTimer = 0;
  private readonly sound = new FireworkSound();
  /** Drawing units: one unit is 1/160 of the box height in device pixels, so the show scales with the area */
  private unit = 1;

  constructor(private host: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.zone.runOutsideAngular(() => {
      this.still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.host.nativeElement);
      this.resize();
      // Start the audio well before the first shell so it is running when it goes off
      if (!this.still) this.sound.prepare();
      this.startTimer = window.setTimeout(() => {
        this.started = true;
        if (this.still) {
          this.drawStill();
        } else {
          this.frame = requestAnimationFrame(time => this.tick(time));
        }
      }, this.launchDelayMs);
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.startTimer);
    this.sound.dispose();
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
  }

  /** Match the canvas to the box in device pixels; bursts in flight are dropped */
  private resize(): void {
    const canvas = this.canvasRef.nativeElement;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(this.host.nativeElement.clientWidth * ratio);
    const height = Math.round(this.host.nativeElement.clientHeight * ratio);
    if (!width || !height || (canvas.width === width && canvas.height === height)) return;
    canvas.width = width;
    canvas.height = height;
    this.unit = height / 160;
    this.particles = [];
    this.untilNextBurst = 0;
    if (this.still && this.started) this.drawStill();
  }

  private tick(time: number): void {
    const raw = this.lastTime ? Math.min(3, (time - this.lastTime) / (1000 / 60)) : 1;
    this.smoothFrames = this.smoothFrames ? this.smoothFrames * 0.75 + raw * 0.25 : raw;
    const frames = this.smoothFrames * SPEED;
    this.lastTime = time;
    if (this.canvasRef.nativeElement.width) this.step(frames);
    this.frame = requestAnimationFrame(next => this.tick(next));
  }

  /** Advance the simulation by `frames` (1 = 1/60 s) and draw it */
  private step(frames: number): void {
    const { ctx } = this;
    const canvas = this.canvasRef.nativeElement;

    this.untilNextBurst -= frames / 60;
    if (this.untilNextBurst <= 0) {
      this.burst();
      // Fewer bursts in a small box so it never looks crowded
      const small = canvas.width / this.unit < 300 ? 1.4 : 1;
      this.untilNextBurst = (0.8 + Math.random() * 1) * small;
    }

    // Fade what is already drawn instead of erasing it: this is the slowly vanishing light trail
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - Math.pow(1 - FADE, frames)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const alive: Particle[] = [];
    for (const p of this.particles) {
      if (p.delay > 0) {
        p.delay -= frames;
        alive.push(p);
        continue;
      }
      p.px = p.x;
      p.py = p.y;
      const drag = Math.pow(p.drag, frames);
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * frames;
      p.x += p.vx * frames;
      p.y += p.vy * frames;
      p.age += frames;
      if (p.age >= p.life) continue;
      alive.push(p);
      this.draw(p);
    }
    this.particles = alive;
  }

  private draw(p: Particle): void {
    const { ctx, unit } = this;
    const t = p.age / p.life;
    if (p.flash) {
      let alpha = Math.pow(1 - t, 2.2);
      if (t > 0.35 && Math.random() < 0.3) alpha *= 0.3;
      // Every frame is faded only a little, so the same spot piles up about eight draws: each draw is faint,
      // and the glow falls off smoothly to nothing so it never shows an edge or an outline
      const glowRadius = Math.max(8, 15 * unit * (1 - t * 0.3));
      // Tinted with the shell colour: it gets more colour (and less white) towards the outside
      ctx.globalAlpha = alpha * 0.05;
      ctx.drawImage(this.flashSprite(p.hue), p.x - glowRadius, p.y - glowRadius, glowRadius * 2, glowRadius * 2);
      ctx.globalAlpha = 1;
      // The very bright part is only a tiny crackle-sized point
      const coreRadius = Math.max(1.5, 1.2 * unit);
      const core = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, coreRadius);
      core.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.4})`);
      core.addColorStop(0.4, `hsla(${p.hue}, 100%, 85%, ${alpha * 0.1})`);
      core.addColorStop(1, `hsla(${p.hue}, 100%, 85%, 0)`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(p.x, p.y, coreRadius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (p.star) {
      // A tiny white point with a very soft glow that fades smoothly to nothing, flickering while it falls
      const twinkle = (0.3 + Math.random() * 0.7) * (1 - t);
      const glow = Math.max(2, 1.3 * unit);
      ctx.globalAlpha = twinkle;
      ctx.drawImage(this.starGlow(), p.x - glow, p.y - glow, glow * 2, glow * 2);
      ctx.globalAlpha = 1;
      return;
    }
    // White-hot at first, cooling to the shell colour; crackling sparks stutter near the end
    const light = 90 - 40 * Math.min(1, p.age / (p.life * 0.4));
    let alpha = Math.pow(1 - t, 1.3);
    if (p.crackle && t > 0.45 && Math.random() < 0.35) alpha *= 0.25;
    ctx.strokeStyle = `hsla(${p.hue}, 100%, ${light}%, ${alpha})`;
    ctx.lineWidth = Math.max(0.6, p.width * (1 - t * 0.5));
    ctx.beginPath();
    ctx.moveTo(p.px, p.py);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  /** The glow of a shell centre at full strength for one hue (the caller scales it with the alpha) */
  private flashSprite(hue: number): HTMLCanvasElement {
    const key = Math.round(hue);
    let sprite = this.flashSprites.get(key);
    if (!sprite) {
      const size = 128;
      const r = size / 2;
      sprite = document.createElement('canvas');
      sprite.width = sprite.height = size;
      const c = sprite.getContext('2d')!;
      const g = c.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, `hsla(${key}, 100%, 75%, 1)`);
      g.addColorStop(0.1, `hsla(${key}, 100%, 68%, 0.7)`);
      g.addColorStop(0.3, `hsla(${key}, 100%, 60%, 0.32)`);
      g.addColorStop(0.6, `hsla(${key}, 100%, 55%, 0.1)`);
      g.addColorStop(1, `hsla(${key}, 100%, 55%, 0)`);
      c.fillStyle = g;
      c.fillRect(0, 0, size, size);
      this.flashSprites.set(key, sprite);
    }
    return sprite;
  }

  /** The glowing white point of a star at full strength: a soft halo around a tiny bright core */
  private starGlow(): HTMLCanvasElement {
    if (!this.starSprite) {
      const size = 32;
      const r = size / 2;
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = size;
      const c = sprite.getContext('2d')!;
      const g = c.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      g.addColorStop(0.35, 'rgba(255, 255, 255, 0.12)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, size, size);
      // The core is 0.2 of the glow radius (0.26 unit against 1.3 units)
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(r, r, r * 0.2, 0, Math.PI * 2);
      c.fill();
      this.starSprite = sprite;
    }
    return this.starSprite;
  }

  /** Start one shell somewhere in the upper two thirds of the box */
  private burst(): void {
    const canvas = this.canvasRef.nativeElement;
    const { unit } = this;
    const width = canvas.width;
    const x = width * (0.12 + Math.random() * 0.76);
    const y = canvas.height * (0.2 + Math.random() * 0.4);
    const reach = Math.min((38 + Math.random() * 26) * unit, width * 0.4);
    const kind = ['peony', 'peony', 'ring', 'willow'][Math.floor(Math.random() * 4)];
    const hue = kind === 'willow' ? 42 : HUES[Math.floor(Math.random() * HUES.length)];
    const small = width / unit < 300;
    const count = Math.round((kind === 'ring' ? 46 : kind === 'willow' ? 56 : 72) * (small ? 0.7 : 1));
    const drag = kind === 'willow' ? 0.955 : 0.962;
    const gravity = (kind === 'willow' ? 0.02 : 0.011) * unit;
    // A particle that starts at v and is slowed by `drag` every frame travels about v * drag / (1 - drag)
    const speed = reach * (1 - drag) / drag;
    const tilt = Math.random() * Math.PI;
    // Reduced motion draws one still frame and stays silent
    if (!this.still) this.sound.play(kind as ShellKind, (x / width) * 2 - 1, Math.min(1.2, Math.max(0.6, reach / (52 * unit))));

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      let vx: number;
      let vy: number;
      if (kind === 'ring') {
        // One thin ring seen at an angle
        const a = (i / count) * Math.PI * 2;
        const rx = Math.cos(a);
        const ry = Math.sin(a) * 0.45;
        vx = (rx * Math.cos(tilt) - ry * Math.sin(tilt)) * speed;
        vy = (rx * Math.sin(tilt) + ry * Math.cos(tilt)) * speed;
      } else {
        // A full sphere seen from the side: more sparks near the rim, some across the middle
        const z = Math.random() * 2 - 1;
        const rim = Math.sqrt(1 - z * z) * (kind === 'willow' ? 0.85 : 1) * (0.9 + Math.random() * 0.1);
        vx = Math.cos(angle) * rim * speed;
        vy = Math.sin(angle) * rim * speed;
      }
      const life = (kind === 'willow' ? 150 + Math.random() * 50 : 85 + Math.random() * 40);
      this.particles.push({
        x, y, px: x, py: y, vx, vy, drag, gravity,
        age: 0, life, delay: 0,
        hue: kind === 'peony' && Math.random() < 0.25 ? hue + 25 : hue,
        width: 1.1 * (unit / 2.4),
        star: false,
        crackle: kind !== 'ring' && Math.random() < 0.4,
        flash: false,
      });
    }

    // The centre of the shell flashes white, then fades and falls with the sparks
    this.particles.push({
      x, y, px: x, py: y, vx: 0, vy: 0, drag: 0.98, gravity: 0.011 * unit,
      age: 0, life: 80, delay: 0, hue, width: 0,
      star: false, crackle: false, flash: true,
    });

    // Glittering stars appear once the sparks have spread, and flicker as they fall
    const stars = small ? 8 : 14;
    for (let i = 0; i < stars; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = reach * (0.3 + Math.random() * 0.8);
      const sx = x + Math.cos(angle) * distance;
      const sy = y + Math.sin(angle) * distance * 0.9;
      this.particles.push({
        x: sx, y: sy, px: sx, py: sy, vx: 0, vy: 0.1 * unit,
        drag: 0.99, gravity: 0.005 * unit,
        age: 0, life: 80 + Math.random() * 70, delay: 28 + Math.random() * 30,
        hue: kind === 'willow' ? 46 : hue + 10, width: 0,
        star: true, crackle: false, flash: false,
      });
    }
  }

  /** Reduced motion: a single frame of a few bursts caught mid-flight, drawn once and left still */
  private drawStill(): void {
    const canvas = this.canvasRef.nativeElement;
    if (!canvas.width) return;
    for (let i = 0; i < 3; i++) this.burst();
    for (let frame = 0; frame < 40; frame++) this.step(1);
  }
}
