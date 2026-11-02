import { Directive, ElementRef, HostListener, Input, OnChanges } from '@angular/core';
import { showTip } from './tip.util';

/**
 * [szTip] — the shared tooltip: sets `title` for the mouse and opens the same text in a
 * bubble on tap / long-press on touch screens (Rule 21f). Toolbar buttons get it through
 * `.toolbar-btn-group` (ToolbarButtonsDirective); use this one on any other control.
 */
@Directive({ selector: '[szTip]' })
export class TipDirective implements OnChanges {
  @Input() szTip = '';

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    this.host.nativeElement.title = this.szTip || '';
  }

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'touch') showTip(this.host.nativeElement, this.szTip);
  }
}
