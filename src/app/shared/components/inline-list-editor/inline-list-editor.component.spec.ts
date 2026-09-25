import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { InlineListEditorComponent } from './inline-list-editor.component';

describe('InlineListEditorComponent', () => {
  let fixture: ComponentFixture<InlineListEditorComponent>;
  let component: InlineListEditorComponent;
  let emitted: string[][];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [InlineListEditorComponent],
      imports: [CommonModule]
    }).compileComponents();
    fixture = TestBed.createComponent(InlineListEditorComponent);
    component = fixture.componentInstance;
    emitted = [];
    component.itemsChange.subscribe((value) => emitted.push(value));
  });

  const rows = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.sec-row'));

  /** Marks the COMPONENT's own view, which is what a real @Input() binding would dirty —
   *  fixture.changeDetectorRef is the host view and leaves an OnPush child clean. */
  const render = () => {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  };

  it('renders one row per item', () => {
    component.title = 'Sections';
    component.items = ['A', 'B'];
    render();

    expect(rows().length).toBe(2);
    expect(rows().map((row) => (row.querySelector('input') as HTMLInputElement).value))
      .toEqual(['A', 'B']);
  });

  /** An empty list is a real, valid state here (a stream may have no sections at all), so
   *  this reads as an invitation rather than an error. */
  it('shows the empty text instead of rows when there are none', () => {
    component.items = [];
    component.emptyText = 'None — add one if this stream needs sections.';
    render();

    expect(rows().length).toBe(0);
    expect(fixture.nativeElement.querySelector('.m-hint').textContent.trim())
      .toBe('None — add one if this stream needs sections.');
  });

  it('appends a blank row on add, without mutating the input array', () => {
    const original = ['A'];
    component.items = original;
    render();

    fixture.nativeElement.querySelector('.sec-add').click();
    expect(emitted).toEqual([['A', '']]);
    expect(original).toEqual(['A']);
  });

  it('removes only the clicked row', () => {
    component.items = ['A', 'B', 'C'];
    render();

    (rows()[1].querySelector('.sec-remove') as HTMLElement).click();
    expect(emitted).toEqual([['A', 'C']]);
  });

  it('emits the whole array on an edit', () => {
    component.items = ['A', 'B'];
    render();

    component.update(1, 'C');
    expect(emitted).toEqual([['A', 'C']]);
  });

  /** Tracking by value would destroy and recreate the field on every keystroke and the
   *  caret would jump to the end, so identity is the row's position. */
  it('tracks rows by index', () => {
    expect(component.trackByIndex(2)).toBe(2);
  });

  it('drops the .sec-block wrapper and takes the stream heading when bare', () => {
    component.title = 'Science — Sections';
    render();
    expect(fixture.nativeElement.querySelector('.sec-block')).not.toBeNull();
    expect(component.titleClass).toBe('sec-title');

    component.bare = true;
    render();
    expect(fixture.nativeElement.querySelector('.sec-block')).toBeNull();
    expect(fixture.nativeElement.querySelector('.stream-block-title').textContent.trim())
      .toBe('Science — Sections');
  });
});
