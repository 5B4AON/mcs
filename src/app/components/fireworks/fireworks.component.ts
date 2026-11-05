/**
 * Morse Code Studio
 */

import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';

/** Burst colours as hues (red, orange, gold, green, cyan-blue, blue, purple, pink) */
const HUES = [2, 24, 46, 125, 190, 215, 280, 330];

/** Per-frame (1/60 s) fraction of the picture that fades away: this is what leaves the slowly vanishing light trails */
const FADE = 0.12;

/** A burst particle (a streaking spark) or a glittering star that appears later and falls */
interface Particle {
  x: number; y: number; px: number; py: number; vx: number; vy: number;
  drag: number; gravity: number;
  age: number; life: number; delay: number;
  hue: number; width: number;
  star: boolean; crackle: boolean;
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
      opacity: .9;
    }
  `],
})
export class FireworksComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private frame = 0;
  private lastTime = 0;
  private untilNextBurst = 0;
  private observer?: ResizeObserver;
  private still = false;
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
      if (this.still) {
        this.drawStill();
      } else {
        this.frame = requestAnimationFrame(time => this.tick(time));
      }
    });
  }

  ngOnDestroy(): void {
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
    if (this.still) this.drawStill();
  }

  private tick(time: number): void {
    const frames = this.lastTime ? Math.min(3, (time - this.lastTime) / (1000 / 60)) : 1;
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
    if (p.star) {
      // A tiny white point with a very soft glow that fades smoothly to nothing, flickering while it falls
      const twinkle = (0.3 + Math.random() * 0.7) * (1 - t);
      const glow = Math.max(2, 1.3 * unit);
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${twinkle * 0.4})`);
      gradient.addColorStop(0.35, `rgba(255, 255, 255, ${twinkle * 0.12})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 255, 255, ${twinkle})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, 0.26 * unit), 0, Math.PI * 2);
      ctx.fill();
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
      });
    }

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
        star: true, crackle: false,
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
