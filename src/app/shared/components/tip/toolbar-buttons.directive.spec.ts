import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToolbarButtonsDirective } from './toolbar-buttons.directive';

@Component({
  template: `
    <div class="toolbar-row1">
      <div class="toolbar-btn-group">
        <button *ngIf="others" class="btn-danger-outline" [disabled]="!count" data-why="Select at least one row">
          <i class="bi bi-trash"></i> <span class="btn-label">Bulk Delete</span>
        </button>
        <button class="btn-primary"><i class="bi bi-plus-lg"></i> <span class="btn-label">Add Class</span></button>
      </div>
    </div>`
})
class HostComponent {
  others = true;
  count = 0;
}

describe('ToolbarButtonsDirective (Rule 21)', () => {
  let fixture: ComponentFixture<HostComponent>;
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); await new Promise((r) => setTimeout(r)); };
  const row = () => fixture.nativeElement.querySelector('.toolbar-row1') as HTMLElement;
  const button = (text: string) => Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
    .find((b) => b.textContent!.includes(text))!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [HostComponent, ToolbarButtonsDirective] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    await settle();
  });

  it('titles every button with its full label, plus the reason while disabled', async () => {
    expect(button('Add Class').title).toBe('Add Class');
    expect(button('Bulk Delete').title).toBe('Bulk Delete — Select at least one row');
    fixture.componentInstance.count = 2;
    await settle();
    expect(button('Bulk Delete').title).toBe('Bulk Delete');
  });

  it('marks the row tb-solo only when the primary is the only button', async () => {
    expect(row().classList).not.toContain('tb-solo');
    fixture.componentInstance.others = false;
    await settle();
    expect(row().classList).toContain('tb-solo');
  });
});
