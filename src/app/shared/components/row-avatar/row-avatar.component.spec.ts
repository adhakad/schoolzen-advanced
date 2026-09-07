import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { RowAvatarComponent } from './row-avatar.component';

describe('RowAvatarComponent', () => {
  let fixture: ComponentFixture<RowAvatarComponent>;
  let component: RowAvatarComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [RowAvatarComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(RowAvatarComponent);
    component = fixture.componentInstance;
  });

  it('derives at most two initials from the name', () => {
    component.name = 'Priya Sharma Devi';
    component.ngOnChanges();
    expect(component.initials).toBe('PS');
  });

  it('gives the same seed the same gradient every time, and different seeds different ones', () => {
    component.name = 'Priya Sharma';
    component.colorSeed = 'staff-1';
    component.ngOnChanges();
    const first = component.gradient;

    component.colorSeed = 'staff-2';
    component.ngOnChanges();
    const second = component.gradient;

    component.colorSeed = 'staff-1';
    component.ngOnChanges();
    expect(component.gradient).toBe(first);
    expect(second).not.toBe(first);
  });
});
