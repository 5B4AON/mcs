/**
 * Morse Code Studio
 */

import { AfterViewInit, Directive, ElementRef, Input, OnChanges, OnDestroy } from '@angular/core';

/**
 * Turns a clipping box into a one-line ticker, like an RSS feed: the host holds a
 * `.ticker-track` (the single line of text, padded by half the box on both sides) and the
 * track slides sideways so that the `.pm-current` element (the character to key next) is
 * always in the middle of the box. The first character therefore starts in the middle, and
 * so does the last one at the end. The slide is animated by the CSS transition on the track.
 * When no character is current (the round is over) the track stays where it is.
 *
 * Bind any value that changes whenever the text or the current character changes;
 * the position is measured after the view has been drawn.
 */
@Directive({ selector: '[appPromptTicker]', standalone: true })
export class PromptTickerDirective implements AfterViewInit, OnChanges, OnDestroy {
  /** Changes whenever the text or the character to key next changes */
  @Input() appPromptTicker: unknown;

  private resizeObserver?: ResizeObserver;
  private frame = 0;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => this.schedule());
    this.resizeObserver.observe(this.host.nativeElement);
    this.schedule();
  }

  ngOnChanges(): void {
    this.schedule();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.frame);
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.update());
  }

  private update(): void {
    const view = this.host.nativeElement;
    const track = view.querySelector<HTMLElement>('.ticker-track');
    const current = track?.querySelector<HTMLElement>('.pm-current');
    if (!track || !current) return;
    const middle = current.offsetLeft + current.offsetWidth / 2;
    track.style.transform = `translateX(${Math.round(view.clientWidth / 2 - middle)}px)`;
  }
}
