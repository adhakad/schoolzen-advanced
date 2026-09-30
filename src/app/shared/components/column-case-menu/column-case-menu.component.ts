/**
 * app-column-case-menu — the small "Aa" trigger that sits inside a free-text column's
 * header cell, next to its sort arrow (manage-students.md, "Per-column text-case + sort").
 * No extra table column: the control lives in the existing header.
 *
 *   <app-column-case-menu columnLabel="Student" [value]="columnCase.name"
 *     (valueChange)="setColumnCase('name', $event)" (applyAll)="setAllColumnsCase($event)">
 *   </app-column-case-menu>
 *
 * The menu is scoped to its one column: Title Case / UPPERCASE / lowercase, then a last
 * "Apply to all fields" row that applies THIS column's current case to every
 * case-toggleable column in one action. Picking a case keeps the menu open, so "pick a case,
 * then apply it everywhere" is one opening, not two.
 *
 * Display-only: it emits a choice and nothing else — no save, no API call.
 *
 * The menu is `position: fixed`, placed from the trigger's rect: a table header lives
 * inside the table's `overflow-x: auto` scroller, which would clip an absolutely
 * positioned menu on a short table. Same open/close rule as app-dd (design-system.md): it
 * stays open until a pick-and-apply, an outside click, Escape or focus leaving — a scroll
 * or resize only moves it with its trigger.
 *
 * `showApplyAll` drops the "Apply to all fields" row where the table has only ONE
 * case-toggleable column (Manage Students: Student only, student-fix4.md H).
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output,
  ViewChild
} from '@angular/core';
import { TEXT_CASE_OPTIONS, TextCase, textCaseLabel } from 'src/app/shared/utils/text-case.util';

/** Kept in step with the CSS width: the right-edge clamp below uses it. */
const MENU_WIDTH = 240;

@Component({
  selector: 'app-column-case-menu',
  templateUrl: './column-case-menu.component.html',
  styleUrls: ['./column-case-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ColumnCaseMenuComponent implements OnDestroy {
  @Input() value: TextCase = 'title';
  /** The column's header text, for the trigger's accessible name ("Text case for Father"). */
  @Input() columnLabel = '';
  /** Whether the "Apply to all fields" row is offered (only meaningful with 2+ columns). */
  @Input() showApplyAll = true;

  @Output() valueChange = new EventEmitter<TextCase>();
  /** "Apply to all fields" — carries the case every case-toggleable column should take. */
  @Output() applyAll = new EventEmitter<TextCase>();

  @ViewChild('trigger', { static: true }) trigger!: ElementRef<HTMLButtonElement>;

  readonly options = TEXT_CASE_OPTIONS;
  open = false;
  menuTop = 0;
  menuLeft = 0;

  constructor(private host: ElementRef<HTMLElement>, private cdr: ChangeDetectorRef) {}

  get currentLabel(): string {
    return textCaseLabel(this.value);
  }

  toggle(event: Event): void {
    // The header label beside this trigger sorts on click — this click must not reach it.
    event.stopPropagation();
    if (this.open) {
      this.close();
      return;
    }
    this.open = true;
    this.place();
    // Scroll events don't bubble, so the table's own horizontal scroller is only seen in the
    // capture phase. Attached only while open — three headers never hold three listeners.
    document.addEventListener('scroll', this.onScroll, true);
    window.addEventListener('resize', this.onScroll);
  }

  pick(event: Event, mode: TextCase): void {
    event.stopPropagation();
    if (mode !== this.value) {
      this.value = mode;
      this.valueChange.emit(mode);
    }
    // With nothing else to apply, a pick is the resolution.
    if (!this.showApplyAll) this.close();
  }

  pickApplyAll(event: Event): void {
    event.stopPropagation();
    this.applyAll.emit(this.value);
    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  /** Focus moving to another control closes it (the .dd rule). */
  @HostListener('document:focusin', ['$event'])
  onFocusIn(event: FocusEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.open) return;
    this.close();
    this.trigger.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.detach();
  }

  /** The trigger moved (page or table scroll, resize): the menu follows it. */
  private onScroll = (): void => {
    if (!this.open) return;
    this.place();
    this.cdr.markForCheck();
  };

  /** Below the trigger, left-aligned, pulled back in from the right edge. */
  private place(): void {
    const rect = this.trigger.nativeElement.getBoundingClientRect();
    this.menuTop = rect.bottom + 6;
    this.menuLeft = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
  }

  private close(): void {
    this.open = false;
    this.detach();
    this.cdr.markForCheck();
  }

  private detach(): void {
    document.removeEventListener('scroll', this.onScroll, true);
    window.removeEventListener('resize', this.onScroll);
  }
}
