import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { SkeletonComponent, skeletonCols } from './skeleton.component';

@Component({
  template: `
    <table>
      <thead><tr><th>Name</th><th>Status</th><th colspan="2">Action</th></tr></thead>
      <tbody><tr class="real"><td>Row</td></tr></tbody>
      <tbody app-skeleton *ngIf="loading" (retry)="retries = retries + 1"></tbody>
    </table>`
})
class HostComponent {
  loading = true;
  retries = 0;
}

describe('SkeletonComponent (Rule 22)', () => {
  let fixture: ComponentFixture<HostComponent>;
  const el = (): HTMLElement => fixture.nativeElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CommonModule], declarations: [HostComponent, SkeletonComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
  });

  it('shows nothing for the first 150ms (no flicker on fast data)', fakeAsync(() => {
    fixture.detectChanges();
    tick(100); fixture.detectChanges();
    expect(el().querySelectorAll('.sk-row').length).toBe(0);
    expect(el().querySelector('table')!.classList).not.toContain('sk-loading');
    fixture.componentInstance.loading = false; fixture.detectChanges();
    tick(10000);
  }));

  it('after 150ms: 8 rows in the real column count, real rows step aside; gone when loaded', fakeAsync(() => {
    fixture.detectChanges();
    tick(150); fixture.detectChanges();
    const rows = el().querySelectorAll('.sk-row');
    expect(rows.length).toBe(8);
    expect(rows[0].querySelectorAll('td').length).toBe(4);
    expect(el().querySelector('table')!.classList).toContain('sk-loading');
    fixture.componentInstance.loading = false; fixture.detectChanges();
    expect(el().querySelectorAll('.sk-row').length).toBe(0);
    expect(el().querySelector('table')!.classList).not.toContain('sk-loading');
    tick(10000);
  }));

  it('after 10s: an error with Retry that re-arms the skeleton', fakeAsync(() => {
    fixture.detectChanges();
    tick(10000); fixture.detectChanges();
    const retry = el().querySelector('.sk-error button') as HTMLButtonElement;
    expect(el().querySelector('.sk-error')!.textContent).toContain('taking too long');
    retry.click(); fixture.detectChanges();
    expect(fixture.componentInstance.retries).toBe(1);
    expect(el().querySelectorAll('.sk-row').length).toBe(8);
    fixture.componentInstance.loading = false; fixture.detectChanges();
    tick(10000);
    discardPeriodicTasks();
  }));
});

describe('skeletonCols (Rule 22b row shape)', () => {
  it('checkbox first, avatar + bars in the first real column, pill last, bars between', () => {
    expect(skeletonCols(5, [0])).toEqual(['check', 'person', 'bar', 'bar', 'pill']);
    expect(skeletonCols(4, [])).toEqual(['person', 'bar', 'bar', 'pill']);
    expect(skeletonCols(1, [])).toEqual(['person']);
  });
});
