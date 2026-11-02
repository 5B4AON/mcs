/**
 * Morse Code Studio
 */

import { Directive, EmbeddedViewRef, Input, OnDestroy, TemplateRef, ViewContainerRef, inject } from '@angular/core';

const DURATION_MS = 220;

/** Box properties that shrink to nothing while a section is collapsed */
const BOX_PROPS = [
  'height', 'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom',
  'borderTopWidth', 'borderBottomWidth',
] as const;

/**
 * Like `@if`, but the section slides open and closed instead of popping.
 *
 * Use as `<div *appCollapse="open">`. The content is created when it opens and
 * removed only after the closing animation has finished, so closed sections
 * still cost nothing in the DOM. The first value never animates (a section that
 * starts open just appears), and users who prefer reduced motion get the plain
 * show/hide. Toggling in the middle of an animation reverses it from where it is.
 */
@Directive({
  selector: '[appCollapse]',
  standalone: true,
})
export class CollapseDirective implements OnDestroy {
  private readonly template = inject<TemplateRef<unknown>>(TemplateRef);
  private readonly container = inject(ViewContainerRef);

  private view: EmbeddedViewRef<unknown> | null = null;
  private animation: Animation | null = null;
  private element: HTMLElement | null = null;
  private savedOverflow = '';
  private open = false;
  private first = true;

  @Input() set appCollapse(open: boolean) {
    const animate = !this.first;
    this.first = false;
    if (!!open === this.open) return;
    this.open = !!open;
    if (this.open) this.show(animate);
    else this.hide(animate);
  }

  ngOnDestroy(): void {
    this.animation?.cancel();
    this.animation = null;
  }

  private show(animate: boolean): void {
    if (this.view) {
      // Still closing: play the closing animation backwards
      if (this.animation) this.animation.reverse();
      return;
    }
    this.view = this.container.createEmbeddedView(this.template);
    this.view.detectChanges();
    if (!animate) return;
    const el = this.rootElement();
    if (!el) return;
    const keyframes = this.keyframes(el);
    if (!keyframes) return;
    this.start(el, keyframes);
  }

  private hide(animate: boolean): void {
    if (!this.view) return;
    if (!animate) {
      this.destroyView();
      return;
    }
    if (this.animation) {
      // Still opening: reverse it
      this.animation.reverse();
      return;
    }
    const el = this.rootElement();
    const keyframes = el ? this.keyframes(el) : null;
    if (!el || !keyframes) {
      this.destroyView();
      return;
    }
    this.start(el, [...keyframes].reverse());
  }

  /** Collapsed-to-natural keyframes for the section, or null when it cannot be animated */
  private keyframes(el: HTMLElement): Keyframe[] | null {
    if (typeof el.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return null;
    }
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.height === 'auto') return null;
    const collapsed: Keyframe = { opacity: 0 };
    const natural: Keyframe = { opacity: 1 };
    for (const prop of BOX_PROPS) {
      collapsed[prop] = '0px';
      natural[prop] = cs[prop];
    }
    return [collapsed, natural];
  }

  private start(el: HTMLElement, keyframes: Keyframe[]): Animation {
    this.element = el;
    this.savedOverflow = el.style.overflow;
    el.style.overflow = 'hidden';
    const animation = el.animate(keyframes, { duration: DURATION_MS, easing: 'ease', fill: 'both' });
    this.animation = animation;
    animation.onfinish = () => {
      if (this.animation !== animation) return;
      this.endAnimation();
      if (!this.open) this.destroyView();
    };
    return animation;
  }

  private endAnimation(): void {
    this.animation?.cancel();
    this.animation = null;
    if (this.element) this.element.style.overflow = this.savedOverflow;
    this.element = null;
  }

  private destroyView(): void {
    this.endAnimation();
    this.view?.destroy();
    this.view = null;
  }

  private rootElement(): HTMLElement | null {
    const node = this.view?.rootNodes.find(n => n.nodeType === Node.ELEMENT_NODE);
    return (node as HTMLElement | undefined) ?? null;
  }
}
