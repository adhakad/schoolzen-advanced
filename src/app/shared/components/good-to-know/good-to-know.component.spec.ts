import { ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { GoodToKnowComponent } from './good-to-know.component';

describe('GoodToKnowComponent', () => {
  let fixture: ComponentFixture<GoodToKnowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CommonModule], declarations: [GoodToKnowComponent] })
      .overrideComponent(GoodToKnowComponent, { set: { changeDetection: ChangeDetectionStrategy.Default } })
      .compileComponents();
    fixture = TestBed.createComponent(GoodToKnowComponent);
    fixture.componentInstance.tips = ['one', 'two', 'three', 'four', 'five'];
    fixture.detectChanges();
  });

  it('shows 3 tips, the rest behind "Read more"', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.tip-item').length).toBe(3);
    (el.querySelector('.gtk-more') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.tip-item').length).toBe(5);
    expect(el.querySelector('.gtk-more')?.textContent).toContain('Show less');
  });
});
