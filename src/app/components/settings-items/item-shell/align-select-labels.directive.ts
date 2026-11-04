/**
 * Morse Code Studio
 */

import { AfterViewInit, Directive, ElementRef, NgZone, OnDestroy } from '@angular/core';

/**
 * Lines up the selects of one settings card.
 *
 * It measures the text of every `label` that directly holds a `select` (with
 * the label's own font, on a canvas, so wrapping in a narrow column cannot
 * affect the result) and publishes the widest as `--select-label-w` on the
 * card body. `settings-shared.css` makes that the label column, so every
 * select in the card starts at the same left edge. It measures again when
 * the content or the size changes (a conditional select appears, zoom).
 */
@Directive({
  selector: '[appAlignSelectLabels]',
  standalone: true,
})
export class AlignSelectLabelsDirective implements AfterViewInit, OnDestroy {
  private mutations?: MutationObserver;
  private resizes?: ResizeObserver;
  private frame = 0;
  private canvas?: CanvasRenderingContext2D | null;

  constructor(private host: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const el = this.host.nativeElement;
      this.mutations = new MutationObserver(() => this.schedule());
      this.mutations.observe(el, { childList: true, subtree: true, characterData: true });
      this.resizes = new ResizeObserver(() => this.schedule());
      this.resizes.observe(el);
      this.schedule();
    });
  }

  ngOnDestroy(): void {
    this.mutations?.disconnect();
    this.resizes?.disconnect();
    cancelAnimationFrame(this.frame);
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.measure());
  }

  private measure(): void {
    const el = this.host.nativeElement;
    this.canvas ??= document.createElement('canvas').getContext('2d');
    if (!this.canvas) return;
    let widest = 0;
    for (const label of Array.from(el.querySelectorAll<HTMLElement>('label'))) {
      if (!label.querySelector(':scope > select')) continue;
      this.canvas.font = getComputedStyle(label).font;
      for (const node of Array.from(label.childNodes)) {
        const text = node.nodeType === Node.TEXT_NODE ? node.textContent?.trim() : '';
        if (text) widest = Math.max(widest, this.canvas.measureText(text).width);
      }
    }
    if (widest > 0) el.style.setProperty('--select-label-w', `${Math.ceil(widest)}px`);
  }
}
