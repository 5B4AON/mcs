/**
 * Morse Code Studio
 */

import { Injectable, NgZone, OnDestroy, computed, signal } from '@angular/core';

/** Layout viewport fraction below which the visual viewport counts as "keyboard open" */
const KEYBOARD_RATIO = 0.75;

/** Safe-area insets in CSS pixels */
export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Viewport Service — one source of truth for the visual viewport.
 *
 * Mobile browsers shrink the *visual* viewport when the on-screen keyboard
 * opens or the browser toolbars collapse, while `position: fixed` overlays
 * keep spanning the *layout* viewport. This service publishes the visual
 * viewport height, its offset, the keyboard-open state and the safe-area
 * insets, both as signals and as CSS variables on `<html>`:
 *
 *  - `--vv-h`, `--vv-top`: visual viewport height and offset (px)
 *  - `--safe-top/right/bottom/left`: safe-area insets (declared in
 *    `src/viewport.css` from `env(safe-area-inset-*)`; this service only
 *    measures them)
 *
 * iOS gate: `iosLayout` is true on iOS WebKit (including Chrome on iOS),
 * detected by the capability `CSS.supports('-webkit-touch-callout', 'none')`,
 * never by user agent. It adds the `ios-layout` class on `<html>`, which all
 * iOS-only styles and behaviour key off, so Android and desktop stay
 * unchanged. For testing on desktop, `?ios=1` in the URL forces the class on
 * and `?ios=0` forces it off.
 *
 * Nothing else consumes these values yet, so publishing them changes no
 * layout by itself.
 */
@Injectable({ providedIn: 'root' })
export class ViewportService implements OnDestroy {

  /** True when the iOS-only layout rules are active */
  readonly iosLayout: boolean;

  /** Visual viewport height in CSS pixels */
  readonly height = signal(0);

  /** Distance from the layout viewport top to the visual viewport top, in CSS pixels */
  readonly offsetTop = signal(0);

  /** Safe-area insets in CSS pixels (all zero without `viewport-fit=cover` or on devices without cutouts) */
  readonly safeArea = signal<SafeAreaInsets>({ top: 0, right: 0, bottom: 0, left: 0 });

  /** True when the visual viewport is much shorter than the layout viewport (on-screen keyboard likely open) */
  readonly keyboardOpen = computed(() => this.height() < this.layoutHeight() * KEYBOARD_RATIO);

  private readonly layoutHeight = signal(0);
  private probe: HTMLElement | null = null;
  private frame = 0;
  private readonly onChange = () => this.scheduleUpdate();

  constructor(private zone: NgZone) {
    this.iosLayout = ViewportService.detectIos();
    document.documentElement.classList.toggle('ios-layout', this.iosLayout);
    this.update();

    // Listeners run outside Angular's zone: only signal changes should trigger change detection.
    this.zone.runOutsideAngular(() => {
      const vv = window.visualViewport;
      vv?.addEventListener('resize', this.onChange);
      vv?.addEventListener('scroll', this.onChange);
      window.addEventListener('resize', this.onChange);
      window.addEventListener('orientationchange', this.onChange);
    });
  }

  ngOnDestroy(): void {
    const vv = window.visualViewport;
    vv?.removeEventListener('resize', this.onChange);
    vv?.removeEventListener('scroll', this.onChange);
    window.removeEventListener('resize', this.onChange);
    window.removeEventListener('orientationchange', this.onChange);
    if (this.frame) cancelAnimationFrame(this.frame);
    this.probe?.remove();
  }

  /** Capability check with a URL override for desktop testing */
  private static detectIos(): boolean {
    const override = new URLSearchParams(window.location.search).get('ios');
    if (override === '1') return true;
    if (override === '0') return false;
    return typeof CSS !== 'undefined' && CSS.supports('-webkit-touch-callout', 'none');
  }

  private scheduleUpdate(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.update();
    });
  }

  private update(): void {
    const vv = window.visualViewport;
    const height = Math.round(vv?.height ?? window.innerHeight);
    const offsetTop = Math.round(vv?.offsetTop ?? 0);
    const root = document.documentElement.style;
    root.setProperty('--vv-h', `${height}px`);
    root.setProperty('--vv-top', `${offsetTop}px`);
    this.layoutHeight.set(window.innerHeight);
    this.height.set(height);
    this.offsetTop.set(offsetTop);
    this.measureSafeArea();
  }

  /** Reads the `--safe-*` variables through a hidden probe element so env() values become numbers */
  private measureSafeArea(): void {
    if (!this.probe) {
      const probe = document.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText =
        'position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;' +
        'padding:var(--safe-top,0px) var(--safe-right,0px) var(--safe-bottom,0px) var(--safe-left,0px);';
      document.body.appendChild(probe);
      this.probe = probe;
    }
    const cs = getComputedStyle(this.probe);
    const next: SafeAreaInsets = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    const prev = this.safeArea();
    if (next.top !== prev.top || next.right !== prev.right || next.bottom !== prev.bottom || next.left !== prev.left) {
      this.safeArea.set(next);
    }
  }
}
