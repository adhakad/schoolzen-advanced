import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ClassPromotionService } from 'src/app/shared/services/student/class-promotion.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { PromotionRoster } from 'src/app/shared/models/student/class-promotion.model';
import { ClassPromotionComponent } from './class-promotion.component';

const ROSTER: PromotionRoster = {
  session: '2026-27',
  nextSession: '2027-28',
  currentClass: { classId: 'c8', label: '8th' },
  defaultTargetKey: 'c9::s9a',
  targetOptions: [
    { key: 'c9::s9a', label: '9th - A', classId: 'c9', class: 9, classLabel: '9th', streamId: null, sectionId: 's9a', streamed: false },
    { key: 'c9::s9b', label: '9th - B', classId: 'c9', class: 9, classLabel: '9th', streamId: null, sectionId: 's9b', streamed: false }
  ],
  rows: [
    { enrollmentId: 'e1', studentId: 'st1', rollNumber: 12, name: 'Rohan Kapoor', admissionNo: 2024142, photoUrl: null, examResult: 'pass', alreadyPlaced: false },
    { enrollmentId: 'e2', studentId: 'st2', rollNumber: 17, name: 'Vikram Singh', admissionNo: 2024201, photoUrl: null, examResult: 'fail', alreadyPlaced: false }
  ]
};

describe('ClassPromotionComponent', () => {
  let fixture: ComponentFixture<ClassPromotionComponent>;
  let component: ClassPromotionComponent;
  let api: jasmine.SpyObj<ClassPromotionService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ClassPromotionService>('ClassPromotionService', ['getRoster', 'preview', 'confirm']);
    api.getRoster.and.returnValue(of(ROSTER));
    api.preview.and.returnValue(of({
      nextSession: '2027-28',
      summary: { promoting: 1, detaining: 1, notDecided: 0, total: 2 },
      warnings: [{ type: 'fee-structure-missing', message: 'No Fee Structure exists yet for 9th in session 2027-28' }]
    }));

    await TestBed.configureTestingModule({
      declarations: [ClassPromotionComponent],
      providers: [
        { provide: ClassPromotionService, useValue: api },
        {
          provide: StudentOptionsService,
          useValue: { getFilterOptions: () => of({ classes: [{ _id: 'c8', class: 8, label: '8th', hasStreams: false, sections: [], streams: [] }], groups: [] }) }
        },
        { provide: JobStatusService, useValue: { watch: () => of() } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-27' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(ClassPromotionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const rowDd = (enrollmentId: string): { disabled: boolean; disabledHint: string } => {
    const debug = fixture.debugElement.query((el) => el.attributes['data-row'] === enrollmentId);
    return { disabled: debug.properties['disabled'], disabledHint: debug.properties['disabledHint'] };
  };

  it('loads one class (pre-selected) with the default Promote To target on every row', () => {
    expect(api.getRoster).toHaveBeenCalledWith('a1', jasmine.objectContaining({ session: '2026-27', classId: 'c8' }));
    expect(component.rows.map((row) => row.targetKey)).toEqual(['c9::s9a', 'c9::s9a']);
    expect(component.counts).toEqual({ promoting: 0, detaining: 0, notDecided: 2 });
  });

  it('Detain disables that row`s Promote To dropdown, relabels it "(repeats)" and tints the row', () => {
    const [first] = component.rows;
    // Through the real buttons — the click is what re-renders this OnPush page.
    const rowButton = (index: number, kind: 'promote' | 'detain'): HTMLButtonElement =>
      fixture.nativeElement.querySelectorAll('tbody tr')[index].querySelector('.decision-btn.' + kind);

    rowButton(1, 'detain').click();
    fixture.detectChanges();

    expect(rowDd('e2').disabled).toBe(true);
    expect(rowDd('e2').disabledHint).toBe('8th (repeats)');
    expect(rowDd('e1').disabled).toBe(false);
    const tinted = fixture.nativeElement.querySelectorAll('tbody tr.detained');
    expect(tinted.length).toBe(1);
    expect(rowButton(1, 'detain').classList).toContain('active');

    rowButton(1, 'promote').click();
    fixture.detectChanges();
    expect(rowDd('e2').disabled).toBe(false);
    expect(first.decision).toBeNull();
  });

  it('keeps exactly one decision per row', () => {
    const row = component.rows[0];
    component.setDecision(row, 'promote');
    component.setDecision(row, 'detain');
    expect(row.decision).toBe('detain');
    expect(component.counts).toEqual({ promoting: 0, detaining: 1, notDecided: 1 });
  });

  it('applies the promote strip only to rows currently marked Promote', () => {
    const [first, second] = component.rows;
    component.setDecision(first, 'promote');
    component.setDecision(second, 'detain');
    component.onBulkTarget('c9::s9b');
    expect(first.targetKey).toBe('c9::s9b');
    expect(second.targetKey).toBe('c9::s9a');
  });

  it('previews before confirming, and sends Detain without a target', () => {
    const [first, second] = component.rows;
    component.setDecision(first, 'promote');
    component.setDecision(second, 'detain');
    component.onOpenConfirm();

    expect(component.confirmOpen).toBe(true);
    expect(api.confirm).not.toHaveBeenCalled();
    const request = api.preview.calls.mostRecent().args[0];
    expect(request.decisions).toEqual([
      { enrollmentId: 'e1', decision: 'promote', target: { classId: 'c9', streamId: null, groupId: null, sectionId: 's9a' } },
      { enrollmentId: 'e2', decision: 'detain' }
    ]);
    expect(component.preview?.warnings.length).toBe(1);
  });
});
