import { Directive, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { hideTip, showTip, tipText } from './tip.util';

/**
 * Applies itself to every `.toolbar-btn-group` (Rule 21), so no page wires anything:
 *  - each button's `title` is its full label (+ the `data-why` reason while disabled), and
 *    a tap / long-press on touch opens the same text in the shared tooltip bubble;
 *  - the toolbar row gets `tb-solo` when the black primary is its only button, so the
 *    global CSS keeps search + primary on one row on phones (Rule 21d).
 * Buttons come and go with *ngIf / permissions, so it re-reads them on every DOM change.
 */
@Directive({ selector: '.toolbar-btn-group' })
export class ToolbarButtonsDirective implements OnInit, OnDestroy {
  private observer?: MutationObserver;
  private lastTouch = 0;

  constructor(private readonly host: ElementRef<HTMLElement>, private readonly zone: NgZone) {}

  ngOnInit(): void {
    const el = this.host.nativeElement;
    this.zone.runOutsideAngular(() => {
      this.observer = new MutationObserver(() => this.sync());
      this.observer.observe(el, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['disabled', 'data-why', 'class']
      });
      // Disabled buttons swallow pointer events in some browsers, so listen on the group
      // and find the button under the finger.
      el.addEventListener('touchstart', this.onTouch, { passive: true });
      el.addEventListener('pointerdown', this.onPointer);
    });
    this.sync();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    const el = this.host.nativeElement;
    el.removeEventListener('touchstart', this.onTouch);
    el.removeEventListener('pointerdown', this.onPointer);
    hideTip();
  }

  private sync(): void {
    const el = this.host.nativeElement;
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>(':scope > button'));
    buttons.forEach((button) => {
      const text = tipText(button);
      if (button.title !== text) button.title = text;
    });
    const primaries = buttons.filter((b) => b.classList.contains('btn-primary')).length;
    const row = el.parentElement;
    if (!row) return;
    const solo = primaries === 1 && buttons.length === 1;
    if (row.classList.contains('tb-solo') !== solo) row.classList.toggle('tb-solo', solo);
  }

  private readonly onTouch = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (touch) this.tipAt(touch.clientX, touch.clientY);
  };

  private readonly onPointer = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') this.tipAt(event.clientX, event.clientY);
  };

  private tipAt(x: number, y: number): void {
    const now = Date.now();
    if (now - this.lastTouch < 300) return;
    this.lastTouch = now;
    const button = Array.from(this.host.nativeElement.querySelectorAll<HTMLButtonElement>(':scope > button')).find((b) => {
      const r = b.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
    if (button) showTip(button, tipText(button));
  }
}
